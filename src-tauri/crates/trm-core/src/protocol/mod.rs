//! Protocol-agnostic client abstraction. [`SftpClient`](sftp::SftpClient),
//! [`FtpClient`](ftp::FtpClient) and [`ScpClient`](scp::ScpClient) all
//! implement [`FileTransferClient`], so the transfer engine and Tauri
//! command layer can drive any of the four supported protocols the same
//! way.

pub mod scp;
pub mod sftp;
pub mod ssh_session;

pub mod ftp;

use crate::model::{DirEntry, Protocol, SiteProfile, TransferMode};
use crate::throttle::RateLimiter;
use async_trait::async_trait;
use std::path::Path;
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::mpsc::UnboundedSender;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("connection error: {0}")]
    Connect(String),
    #[error("authentication failed: {0}")]
    Auth(String),
    #[error("host key verification failed: {0}")]
    HostKey(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("remote error: {0}")]
    Remote(String),
    #[error("transfer cancelled")]
    Cancelled,
    #[error("not supported by this protocol: {0}")]
    Unsupported(&'static str),
}

/// Progress + cancellation plumbing shared by every transfer.
///
/// `progress_tx` receives the cumulative number of bytes transferred for
/// the *current* file each time a chunk completes; the transfer engine
/// owns turning that into speed/ETA and forwarding it to the UI.
pub struct TransferControl {
    pub cancel: CancellationToken,
    pub pause: tokio::sync::watch::Receiver<bool>,
    pub progress_tx: UnboundedSender<u64>,
    /// Bandwidth limiters this transfer must respect: the engine-wide cap
    /// and this task's own cap. Both default to unlimited (rate 0).
    pub global_limiter: Arc<RateLimiter>,
    pub task_limiter: Arc<RateLimiter>,
}

impl TransferControl {
    /// Blocks (without busy-polling) while paused, and returns
    /// `Err(Cancelled)` as soon as cancellation is requested.
    pub async fn wait_if_paused(&mut self) -> Result<(), ProtocolError> {
        loop {
            if self.cancel.is_cancelled() {
                return Err(ProtocolError::Cancelled);
            }
            if !*self.pause.borrow() {
                return Ok(());
            }
            tokio::select! {
                _ = self.cancel.cancelled() => return Err(ProtocolError::Cancelled),
                res = self.pause.changed() => {
                    if res.is_err() {
                        return Ok(());
                    }
                }
            }
        }
    }

    /// Paces the transfer to both the global and per-task bandwidth caps.
    /// Call once per chunk, after reading/writing `bytes` of it.
    pub async fn throttle(&self, bytes: u64) {
        self.global_limiter.acquire(bytes).await;
        self.task_limiter.acquire(bytes).await;
    }
}

pub const CHUNK_SIZE: usize = 256 * 1024;

#[async_trait]
pub trait FileTransferClient: Send {
    async fn list_dir(&mut self, path: &str) -> Result<Vec<DirEntry>, ProtocolError>;
    async fn stat(&mut self, path: &str) -> Result<DirEntry, ProtocolError>;
    async fn canonicalize(&mut self, path: &str) -> Result<String, ProtocolError>;
    async fn mkdir(&mut self, path: &str) -> Result<(), ProtocolError>;
    async fn remove_file(&mut self, path: &str) -> Result<(), ProtocolError>;
    async fn remove_dir(&mut self, path: &str) -> Result<(), ProtocolError>;

    /// Removes a directory only if it's empty. Defaults to `remove_dir`,
    /// which is already non-recursive for SFTP (SFTP `RMDIR`) and FTP
    /// (`RMD`); SCP overrides this since its `remove_dir` shells out to
    /// `rm -rf`. Used to undo a `mkdir` without risking user data added
    /// to the folder afterward.
    async fn remove_empty_dir(&mut self, path: &str) -> Result<(), ProtocolError> {
        self.remove_dir(path).await
    }

    async fn rename(&mut self, from: &str, to: &str) -> Result<(), ProtocolError>;

    /// `Err(Unsupported)` on protocols without a permissions model (FTP/FTPS).
    async fn chmod(&mut self, path: &str, mode: u32) -> Result<(), ProtocolError>;

    async fn download(
        &mut self,
        remote_path: &str,
        local_path: &Path,
        mode: TransferMode,
        control: &mut TransferControl,
    ) -> Result<u64, ProtocolError>;

    async fn upload(
        &mut self,
        local_path: &Path,
        remote_path: &str,
        mode: TransferMode,
        control: &mut TransferControl,
    ) -> Result<u64, ProtocolError>;

    async fn disconnect(&mut self) -> Result<(), ProtocolError>;

    /// Computes a SHA-256 hex digest of the remote file for post-transfer
    /// verification. `Ok(None)` means this protocol has no way to hash
    /// remotely (FTP/FTPS); SSH-based protocols override this to run
    /// `sha256sum`/`shasum` on the remote host.
    async fn checksum(&mut self, _path: &str) -> Result<Option<String>, ProtocolError> {
        Ok(None)
    }

    /// SSH-based protocols (SFTP, SCP) return the server host key fingerprint
    /// observed during the handshake and whether it matched the profile's
    /// pinned fingerprint (`None` = no pin existed yet, i.e. first connect).
    /// FTP/FTPS has no equivalent concept and keeps the default `None`.
    fn host_key(&self) -> Option<(&str, Option<bool>)> {
        None
    }
}

/// Connects using whichever protocol the profile specifies, returning a
/// type-erased client so callers (the transfer engine, Tauri commands)
/// don't need to match on [`Protocol`] themselves.
pub async fn connect(profile: &SiteProfile) -> Result<Box<dyn FileTransferClient>, ProtocolError> {
    match profile.protocol {
        Protocol::Sftp => Ok(Box::new(sftp::SftpClient::connect(profile).await?)),
        Protocol::Scp => Ok(Box::new(scp::ScpClient::connect(profile).await?)),
        Protocol::Ftp | Protocol::Ftps => Ok(Box::new(ftp::FtpClient::connect(profile).await?)),
    }
}
