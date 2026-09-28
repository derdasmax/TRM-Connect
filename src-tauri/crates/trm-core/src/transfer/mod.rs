//! Background transfer queue: sequences uploads/downloads, reports
//! progress/speed/ETA, and supports pausing, resuming and cancelling
//! individual jobs or the whole queue - all while the connection used for
//! browsing stays free, since every queued job opens its own connection.
//!
//! Not-yet-started jobs sit in a plain `VecDeque` (rather than the channel
//! the dispatcher used to read from directly) specifically so the UI can
//! reorder or prioritize them before they're picked up; a `Notify` wakes the
//! dispatcher whenever the deque goes from empty to non-empty.

use crate::model::{ChecksumStatus, SiteProfile, TransferDirection, TransferStatus, TransferTask};
use crate::protocol::{self, FileTransferClient, ProtocolError, TransferControl};
use crate::throttle::RateLimiter;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::{broadcast, mpsc, watch, Notify};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone)]
pub enum EngineEvent {
    Progress {
        task_id: String,
        transferred_bytes: u64,
        total_bytes: u64,
        speed_bps: f64,
        eta_secs: Option<u64>,
    },
    StatusChanged {
        task_id: String,
        status: TransferStatus,
        error: Option<String>,
    },
    ChecksumComputed {
        task_id: String,
        checksum: ChecksumStatus,
    },
    /// The not-yet-started queue order changed (reorder/prioritize/enqueue),
    /// so the UI should re-fetch the snapshot to reflect the new order.
    QueueReordered,
}

struct JobHandle {
    cancel: CancellationToken,
    pause_tx: watch::Sender<bool>,
    limiter: Arc<RateLimiter>,
}

struct QueuedJob {
    task: TransferTask,
    profile: SiteProfile,
}

struct EngineInner {
    queue: Mutex<VecDeque<QueuedJob>>,
    notify: Notify,
    events_tx: broadcast::Sender<EngineEvent>,
    handles: Mutex<HashMap<String, JobHandle>>,
    tasks: Mutex<HashMap<String, TransferTask>>,
    global_limiter: Arc<RateLimiter>,
}

#[derive(Clone)]
pub struct TransferEngine {
    inner: Arc<EngineInner>,
}

impl TransferEngine {
    pub fn new() -> Self {
        let (events_tx, _) = broadcast::channel(1024);
        let inner = Arc::new(EngineInner {
            queue: Mutex::new(VecDeque::new()),
            notify: Notify::new(),
            events_tx,
            handles: Mutex::new(HashMap::new()),
            tasks: Mutex::new(HashMap::new()),
            global_limiter: RateLimiter::new(0),
        });
        tokio::spawn(run_dispatcher(inner.clone()));
        Self { inner }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<EngineEvent> {
        self.inner.events_tx.subscribe()
    }

    pub fn snapshot(&self) -> Vec<TransferTask> {
        self.inner.tasks.lock().unwrap().values().cloned().collect()
    }

    /// Order (queued-but-not-started task ids) as they'll be dispatched next,
    /// front first. Used by the UI to render drag-and-drop reordering.
    pub fn queue_order(&self) -> Vec<String> {
        self.inner.queue.lock().unwrap().iter().map(|j| j.task.id.clone()).collect()
    }

    /// Queues a job. `profile` must already have plaintext secrets
    /// (decrypted by the caller via `SiteStore::decrypt_secrets`) since the
    /// dispatcher connects independently of whatever connection the
    /// browser pane is using.
    pub fn enqueue(&self, mut task: TransferTask, profile: SiteProfile) {
        task.status = TransferStatus::Queued;
        task.updated_at = chrono::Utc::now();

        let cancel = CancellationToken::new();
        let (pause_tx, _) = watch::channel(false);
        let limiter = RateLimiter::new(task.speed_limit_bps);
        self.inner
            .handles
            .lock()
            .unwrap()
            .insert(task.id.clone(), JobHandle { cancel, pause_tx, limiter });
        self.inner.tasks.lock().unwrap().insert(task.id.clone(), task.clone());

        self.inner.queue.lock().unwrap().push_back(QueuedJob { task, profile });
        self.inner.notify.notify_one();
        let _ = self.inner.events_tx.send(EngineEvent::QueueReordered);
    }

    /// Moves a still-queued (not yet started) job to an arbitrary position.
    /// A no-op if the job has already started or doesn't exist.
    pub fn reorder(&self, task_id: &str, new_index: usize) {
        let mut queue = self.inner.queue.lock().unwrap();
        let Some(pos) = queue.iter().position(|j| j.task.id == task_id) else { return };
        let job = queue.remove(pos).unwrap();
        let idx = new_index.min(queue.len());
        queue.insert(idx, job);
        drop(queue);
        let _ = self.inner.events_tx.send(EngineEvent::QueueReordered);
    }

    /// Moves a still-queued job to the very front, so it runs next.
    pub fn prioritize(&self, task_id: &str) {
        self.reorder(task_id, 0);
    }

    pub fn pause(&self, task_id: &str) {
        if let Some(h) = self.inner.handles.lock().unwrap().get(task_id) {
            let _ = h.pause_tx.send(true);
        }
        self.set_status(task_id, TransferStatus::Paused, None);
    }

    pub fn resume(&self, task_id: &str) {
        if let Some(h) = self.inner.handles.lock().unwrap().get(task_id) {
            let _ = h.pause_tx.send(false);
        }
        self.set_status(task_id, TransferStatus::Running, None);
    }

    pub fn cancel(&self, task_id: &str) {
        if let Some(h) = self.inner.handles.lock().unwrap().get(task_id) {
            h.cancel.cancel();
        }
        // A queued-but-not-started job has no runner to observe the
        // cancellation token, so it never leaves the deque on its own.
        self.inner.queue.lock().unwrap().retain(|j| j.task.id != task_id);
    }

    pub fn pause_all(&self) {
        let ids: Vec<String> = self.inner.handles.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.pause(&id);
        }
    }

    pub fn resume_all(&self) {
        let ids: Vec<String> = self.inner.handles.lock().unwrap().keys().cloned().collect();
        for id in ids {
            self.resume(&id);
        }
    }

    pub fn cancel_all(&self) {
        let handles = self.inner.handles.lock().unwrap();
        for h in handles.values() {
            h.cancel.cancel();
        }
        drop(handles);
        self.inner.queue.lock().unwrap().clear();
    }

    /// Bandwidth cap shared by every active transfer, in bytes/sec (`0` = unlimited).
    pub fn set_global_limit(&self, bytes_per_sec: u64) {
        self.inner.global_limiter.set_rate(bytes_per_sec);
    }

    /// Bandwidth cap for one task alone, in bytes/sec (`0` = unlimited).
    pub fn set_task_limit(&self, task_id: &str, bytes_per_sec: u64) {
        if let Some(h) = self.inner.handles.lock().unwrap().get(task_id) {
            h.limiter.set_rate(bytes_per_sec);
        }
        if let Some(t) = self.inner.tasks.lock().unwrap().get_mut(task_id) {
            t.speed_limit_bps = bytes_per_sec;
        }
        let mut queue = self.inner.queue.lock().unwrap();
        if let Some(job) = queue.iter_mut().find(|j| j.task.id == task_id) {
            job.task.speed_limit_bps = bytes_per_sec;
        }
    }

    fn set_status(&self, task_id: &str, status: TransferStatus, error: Option<String>) {
        if let Some(t) = self.inner.tasks.lock().unwrap().get_mut(task_id) {
            t.status = status;
            t.error = error.clone();
            t.updated_at = chrono::Utc::now();
        }
        let _ = self.inner.events_tx.send(EngineEvent::StatusChanged {
            task_id: task_id.to_string(),
            status,
            error,
        });
    }

    fn set_checksum(&self, task_id: &str, checksum: ChecksumStatus) {
        if let Some(t) = self.inner.tasks.lock().unwrap().get_mut(task_id) {
            t.checksum = Some(checksum);
        }
        let _ = self.inner.events_tx.send(EngineEvent::ChecksumComputed { task_id: task_id.to_string(), checksum });
    }
}

impl Default for TransferEngine {
    fn default() -> Self {
        Self::new()
    }
}

async fn run_dispatcher(inner: Arc<EngineInner>) {
    loop {
        let job = inner.queue.lock().unwrap().pop_front();
        match job {
            Some(job) => {
                let engine = TransferEngine { inner: inner.clone() };
                run_job(engine, job).await;
            }
            None => inner.notify.notified().await,
        }
    }
}

async fn run_job(engine: TransferEngine, job: QueuedJob) {
    let QueuedJob { mut task, profile } = job;
    let task_id = task.id.clone();

    let (cancel, pause_rx, task_limiter) = {
        let handles = engine.inner.handles.lock().unwrap();
        match handles.get(&task_id) {
            Some(h) => (h.cancel.clone(), h.pause_tx.subscribe(), h.limiter.clone()),
            None => return, // cancelled before it ever started
        }
    };

    if cancel.is_cancelled() {
        engine.set_status(&task_id, TransferStatus::Cancelled, None);
        engine.inner.handles.lock().unwrap().remove(&task_id);
        return;
    }

    engine.set_status(&task_id, TransferStatus::Running, None);
    task.started_at = Some(chrono::Utc::now());

    let result = execute_transfer(&engine, &task, &profile, cancel, pause_rx, task_limiter).await;

    match result {
        Ok((total, checksum)) => {
            task.transferred_bytes = total;
            engine.set_status(&task_id, TransferStatus::Completed, None);
            if let Some(cs) = checksum {
                engine.set_checksum(&task_id, cs);
            }
        }
        Err(ProtocolError::Cancelled) => {
            engine.set_status(&task_id, TransferStatus::Cancelled, None);
        }
        Err(e) => {
            engine.set_status(&task_id, TransferStatus::Failed, Some(e.to_string()));
        }
    }

    engine.inner.handles.lock().unwrap().remove(&task_id);
}

async fn verify_checksum(client: &mut dyn FileTransferClient, task: &TransferTask) -> ChecksumStatus {
    let remote = match client.checksum(&task.remote_path).await {
        Ok(Some(hash)) => hash,
        Ok(None) => return ChecksumStatus::Unsupported,
        Err(_) => return ChecksumStatus::Error,
    };
    match crate::local::sha256_file(&PathBuf::from(&task.local_path)).await {
        Ok(local) if local.eq_ignore_ascii_case(&remote) => ChecksumStatus::Verified,
        Ok(_) => ChecksumStatus::Mismatch,
        Err(_) => ChecksumStatus::Error,
    }
}

async fn execute_transfer(
    engine: &TransferEngine,
    task: &TransferTask,
    profile: &SiteProfile,
    cancel: CancellationToken,
    pause_rx: watch::Receiver<bool>,
    task_limiter: Arc<RateLimiter>,
) -> Result<(u64, Option<ChecksumStatus>), ProtocolError> {
    let mut client = protocol::connect(profile).await?;

    let total_bytes = if task.total_bytes > 0 {
        task.total_bytes
    } else {
        match task.direction {
            TransferDirection::Download => client.stat(&task.remote_path).await.map(|e| e.size).unwrap_or(0),
            TransferDirection::Upload => {
                tokio::fs::metadata(&task.local_path).await.map(|m| m.len()).unwrap_or(0)
            }
        }
    };

    let (progress_tx, mut progress_rx) = mpsc::unbounded_channel::<u64>();
    let mut control = TransferControl {
        cancel: cancel.clone(),
        pause: pause_rx,
        progress_tx,
        global_limiter: engine.inner.global_limiter.clone(),
        task_limiter,
    };

    let task_id = task.id.clone();
    let events_tx = engine.inner.events_tx.clone();
    let inner = engine.inner.clone();
    let progress_forwarder = tokio::spawn(async move {
        let start = Instant::now();
        let mut last_bytes = 0u64;
        let mut last_time = start;
        while let Some(bytes) = progress_rx.recv().await {
            let now = Instant::now();
            let dt = now.duration_since(last_time).as_secs_f64().max(0.001);
            let speed = ((bytes.saturating_sub(last_bytes)) as f64 / dt).max(0.0);
            last_bytes = bytes;
            last_time = now;
            let eta = if speed > 1.0 && total_bytes > bytes {
                Some(((total_bytes - bytes) as f64 / speed) as u64)
            } else {
                None
            };
            if let Some(t) = inner.tasks.lock().unwrap().get_mut(&task_id) {
                t.transferred_bytes = bytes;
                t.total_bytes = total_bytes;
                t.updated_at = chrono::Utc::now();
            }
            let _ = events_tx.send(EngineEvent::Progress {
                task_id: task_id.clone(),
                transferred_bytes: bytes,
                total_bytes,
                speed_bps: speed,
                eta_secs: eta,
            });
        }
    });

    let local_path = PathBuf::from(&task.local_path);
    let result = match task.direction {
        TransferDirection::Download => {
            client.download(&task.remote_path, &local_path, task.mode, &mut control).await
        }
        TransferDirection::Upload => {
            client.upload(&local_path, &task.remote_path, task.mode, &mut control).await
        }
    };

    let checksum = if task.verify_checksum && result.is_ok() {
        Some(verify_checksum(client.as_mut(), task).await)
    } else {
        None
    };

    drop(control);
    let _ = progress_forwarder.await;
    let _ = client.disconnect().await;
    result.map(|total| (total, checksum))
}
