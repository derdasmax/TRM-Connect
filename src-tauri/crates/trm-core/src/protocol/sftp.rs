//! SFTP client backed by `russh` (SSH transport) + `russh-sftp` (SFTP
//! subsystem). This is the primary, fully-featured protocol implementation.

use crate::model::{DirEntry, Protocol, SiteProfile, TransferMode};
use crate::protocol::ssh_session::{self, HostKeyOutcome};
use crate::protocol::{FileTransferClient, ProtocolError, TransferControl, CHUNK_SIZE};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::{FileAttributes, OpenFlags};
use std::path::Path;
use tokio::fs::File as LocalFile;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub struct SftpClient {
    sftp: SftpSession,
    // Keeps the underlying SSH `Handle` alive for the lifetime of the SFTP
    // session; it's otherwise unused after the subsystem channel is handed off.
    _ssh: russh::client::Handle<ssh_session::Handler>,
    pub host_key: HostKeyOutcome,
}

fn attrs_to_entry(name: String, path: String, attrs: &FileAttributes) -> DirEntry {
    let is_dir = attrs.is_dir();
    let is_symlink = attrs.is_symlink();
    DirEntry {
        name,
        path,
        is_dir,
        is_symlink,
        symlink_target: None,
        size: attrs.size.unwrap_or(0),
        modified: attrs
            .mtime
            .and_then(|t| DateTime::<Utc>::from_timestamp(t as i64, 0)),
        permissions: attrs.permissions,
        owner: attrs.user.clone(),
        group: attrs.group.clone(),
    }
}

impl SftpClient {
    pub async fn connect(profile: &SiteProfile) -> Result<Self, ProtocolError> {
        debug_assert!(matches!(profile.protocol, Protocol::Sftp));
        let ssh_session::SshConnection { handle, host_key } = ssh_session::connect(profile).await?;

        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| ProtocolError::Connect(e.to_string()))?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| ProtocolError::Connect(e.to_string()))?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| ProtocolError::Connect(format!("SFTP init failed: {e}")))?;

        Ok(Self { sftp, _ssh: handle, host_key })
    }
}

#[async_trait]
impl FileTransferClient for SftpClient {
    async fn list_dir(&mut self, path: &str) -> Result<Vec<DirEntry>, ProtocolError> {
        let entries = self
            .sftp
            .read_dir(path)
            .await
            .map_err(|e| ProtocolError::Remote(e.to_string()))?;
        Ok(entries
            .filter_map(|e| {
                let name = e.file_name();
                if name == "." || name == ".." {
                    return None;
                }
                let full = e.path();
                Some(attrs_to_entry(name, full, &e.metadata()))
            })
            .collect())
    }

    async fn stat(&mut self, path: &str) -> Result<DirEntry, ProtocolError> {
        let attrs = self.sftp.metadata(path).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
        let name = path.rsplit('/').next().unwrap_or(path).to_string();
        Ok(attrs_to_entry(name, path.to_string(), &attrs))
    }

    async fn canonicalize(&mut self, path: &str) -> Result<String, ProtocolError> {
        self.sftp.canonicalize(path).await.map_err(|e| ProtocolError::Remote(e.to_string()))
    }

    async fn mkdir(&mut self, path: &str) -> Result<(), ProtocolError> {
        self.sftp.create_dir(path).await.map_err(|e| ProtocolError::Remote(e.to_string()))
    }

    async fn remove_file(&mut self, path: &str) -> Result<(), ProtocolError> {
        self.sftp.remove_file(path).await.map_err(|e| ProtocolError::Remote(e.to_string()))
    }

    async fn remove_dir(&mut self, path: &str) -> Result<(), ProtocolError> {
        self.sftp.remove_dir(path).await.map_err(|e| ProtocolError::Remote(e.to_string()))
    }

    async fn rename(&mut self, from: &str, to: &str) -> Result<(), ProtocolError> {
        self.sftp.rename(from, to).await.map_err(|e| ProtocolError::Remote(e.to_string()))
    }

    async fn chmod(&mut self, path: &str, mode: u32) -> Result<(), ProtocolError> {
        let mut attrs = FileAttributes::default();
        attrs.permissions = Some(mode);
        self.sftp
            .set_metadata(path, attrs)
            .await
            .map_err(|e| ProtocolError::Remote(e.to_string()))
    }

    async fn download(
        &mut self,
        remote_path: &str,
        local_path: &Path,
        _mode: TransferMode,
        control: &mut TransferControl,
    ) -> Result<u64, ProtocolError> {
        let mut remote = self
            .sftp
            .open_with_flags(remote_path, OpenFlags::READ)
            .await
            .map_err(|e| ProtocolError::Remote(e.to_string()))?;
        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
        let mut local = LocalFile::create(local_path).await?;

        let mut buf = vec![0u8; CHUNK_SIZE];
        let mut total: u64 = 0;
        loop {
            control.wait_if_paused().await?;
            let n = remote.read(&mut buf).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
            if n == 0 {
                break;
            }
            local.write_all(&buf[..n]).await?;
            total += n as u64;
            let _ = control.progress_tx.send(total);
        }
        local.flush().await?;
        Ok(total)
    }

    async fn upload(
        &mut self,
        local_path: &Path,
        remote_path: &str,
        _mode: TransferMode,
        control: &mut TransferControl,
    ) -> Result<u64, ProtocolError> {
        let mut local = LocalFile::open(local_path).await?;
        let mut remote = self
            .sftp
            .open_with_flags(
                remote_path,
                OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
            )
            .await
            .map_err(|e| ProtocolError::Remote(e.to_string()))?;

        let mut buf = vec![0u8; CHUNK_SIZE];
        let mut total: u64 = 0;
        loop {
            control.wait_if_paused().await?;
            let n = local.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            remote.write_all(&buf[..n]).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
            total += n as u64;
            let _ = control.progress_tx.send(total);
        }
        remote.flush().await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
        remote.shutdown().await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
        Ok(total)
    }

    async fn disconnect(&mut self) -> Result<(), ProtocolError> {
        self.sftp.close().await.map_err(|e| ProtocolError::Remote(e.to_string()))
    }

    fn host_key(&self) -> Option<(&str, Option<bool>)> {
        Some((self.host_key.fingerprint.as_str(), self.host_key.matched_pinned))
    }
}

