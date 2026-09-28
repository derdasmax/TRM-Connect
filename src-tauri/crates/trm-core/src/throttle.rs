//! Token-bucket bandwidth limiter shared by the transfer engine. A rate of
//! `0` means unlimited and short-circuits without ever touching the clock,
//! so transfers pay nothing for throttling unless a limit is actually set.

use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

struct State {
    rate: u64,
    tokens: f64,
    last: Instant,
}

pub struct RateLimiter {
    state: Mutex<State>,
}

impl RateLimiter {
    pub fn new(rate_bytes_per_sec: u64) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(State {
                rate: rate_bytes_per_sec,
                // Start with a full bucket so the first burst up to the rate
                // isn't held back by a cold start.
                tokens: rate_bytes_per_sec as f64,
                last: Instant::now(),
            }),
        })
    }

    /// Changes the limit live; takes effect on the next `acquire` call.
    pub fn set_rate(&self, rate_bytes_per_sec: u64) {
        let mut st = self.state.lock().unwrap();
        st.rate = rate_bytes_per_sec;
        st.tokens = rate_bytes_per_sec as f64;
        st.last = Instant::now();
    }

    /// Blocks (via `tokio::time::sleep`, never busy-polling) until `bytes`
    /// worth of budget is available under the current rate.
    pub async fn acquire(&self, bytes: u64) {
        loop {
            let wait = {
                let mut st = self.state.lock().unwrap();
                if st.rate == 0 {
                    return;
                }
                let now = Instant::now();
                let elapsed = now.duration_since(st.last).as_secs_f64();
                st.last = now;
                // Cap the bucket at one second's worth so a long idle period
                // (e.g. while paused) doesn't let a huge burst through.
                st.tokens = (st.tokens + elapsed * st.rate as f64).min(st.rate as f64);

                if st.tokens >= bytes as f64 {
                    st.tokens -= bytes as f64;
                    None
                } else {
                    let deficit = bytes as f64 - st.tokens;
                    st.tokens = 0.0;
                    Some(Duration::from_secs_f64(deficit / st.rate as f64))
                }
            };
            match wait {
                None => return,
                Some(d) => tokio::time::sleep(d).await,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn unlimited_never_waits() {
        let limiter = RateLimiter::new(0);
        let start = Instant::now();
        limiter.acquire(10_000_000).await;
        assert!(start.elapsed() < Duration::from_millis(50));
    }

    #[tokio::test]
    async fn limited_paces_bursts() {
        let limiter = RateLimiter::new(1000); // 1000 B/s
        let start = Instant::now();
        limiter.acquire(1000).await; // consumes the initial (empty) bucket instantly
        limiter.acquire(1000).await; // must wait ~1s for the bucket to refill
        assert!(start.elapsed() >= Duration::from_millis(900));
    }
}
