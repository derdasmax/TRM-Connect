//! Background transfer queue: sequences uploads/downloads, reports
//! progress/speed/ETA, and supports pausing, resuming and cancelling
//! individual jobs or the whole queue - all while the connection used for
//! browsing stays free, since every queued job opens its own connection.

use crate::model::{SiteProfile, TransferDirection, TransferStatus, TransferTask};
use crate::protocol::{self, ProtocolError, TransferControl};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tokio::sync::{broadcast, mpsc, watch};
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
}

struct JobHandle {
    cancel: CancellationToken,
    pause_tx: watch::Sender<bool>,
}

struct QueuedJob {
    task: TransferTask,
    profile: SiteProfile,
}

struct EngineInner {
    queue_tx: mpsc::UnboundedSender<QueuedJob>,
    events_tx: broadcast::Sender<EngineEvent>,
    handles: Mutex<HashMap<String, JobHandle>>,
    tasks: Mutex<HashMap<String, TransferTask>>,
}

#[derive(Clone)]
pub struct TransferEngine {
    inner: Arc<EngineInner>,
}

impl TransferEngine {
    pub fn new() -> Self {
        let (queue_tx, queue_rx) = mpsc::unbounded_channel();
        let (events_tx, _) = broadcast::channel(1024);
        let inner = Arc::new(EngineInner {
            queue_tx,
            events_tx,
            handles: Mutex::new(HashMap::new()),
            tasks: Mutex::new(HashMap::new()),
        });
        tokio::spawn(run_dispatcher(queue_rx, inner.clone()));
        Self { inner }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<EngineEvent> {
        self.inner.events_tx.subscribe()
    }

    pub fn snapshot(&self) -> Vec<TransferTask> {
        self.inner.tasks.lock().unwrap().values().cloned().collect()
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
        self.inner
            .handles
            .lock()
            .unwrap()
            .insert(task.id.clone(), JobHandle { cancel, pause_tx });
        self.inner.tasks.lock().unwrap().insert(task.id.clone(), task.clone());

        let _ = self.inner.queue_tx.send(QueuedJob { task, profile });
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
}

impl Default for TransferEngine {
    fn default() -> Self {
        Self::new()
    }
}

async fn run_dispatcher(mut queue_rx: mpsc::UnboundedReceiver<QueuedJob>, inner: Arc<EngineInner>) {
    while let Some(job) = queue_rx.recv().await {
        let engine = TransferEngine { inner: inner.clone() };
        run_job(engine, job).await;
    }
}

async fn run_job(engine: TransferEngine, job: QueuedJob) {
    let QueuedJob { mut task, profile } = job;
    let task_id = task.id.clone();

    let (cancel, pause_rx) = {
        let handles = engine.inner.handles.lock().unwrap();
        let h = handles.get(&task_id);
        match h {
            Some(h) => (h.cancel.clone(), h.pause_tx.subscribe()),
            None => return, // cancelled before it ever started
        }
    };

    engine.set_status(&task_id, TransferStatus::Running, None);
    task.started_at = Some(chrono::Utc::now());

    let result = execute_transfer(&engine, &task, &profile, cancel, pause_rx).await;

    match result {
        Ok(total) => {
            task.transferred_bytes = total;
            engine.set_status(&task_id, TransferStatus::Completed, None);
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

async fn execute_transfer(
    engine: &TransferEngine,
    task: &TransferTask,
    profile: &SiteProfile,
    cancel: CancellationToken,
    pause_rx: watch::Receiver<bool>,
) -> Result<u64, ProtocolError> {
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
    let mut control = TransferControl { cancel: cancel.clone(), pause: pause_rx, progress_tx };

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

    drop(control);
    let _ = progress_forwarder.await;
    let _ = client.disconnect().await;
    result
}
