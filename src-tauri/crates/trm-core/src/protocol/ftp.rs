//! FTP / FTPS client backed by `suppaftp`, running over Tokio with a
//! rustls TLS layer for explicit (`AUTH TLS`) and implicit FTPS.
//!
//! FTP has no permissions model, so `chmod` returns `Unsupported`; the
//! `SITE CHMOD` extension some servers offer is not universally available
//! and is intentionally not relied upon.

use crate::model::{DirEntry, FtpsMode, Protocol, SiteProfile, TransferMode};
use crate::protocol::{FileTransferClient, ProtocolError, TransferControl, CHUNK_SIZE};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use std::path::Path;
use std::sync::Once;
use suppaftp::list::{File as FtpFile, PosixPexQuery};
use suppaftp::tokio::{AsyncRustlsConnector, AsyncRustlsFtpStream};
use suppaftp::FtpError;
use tokio::fs::File as LocalFile;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

fn install_crypto_provider() {
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
    });
}

fn tls_connector() -> Result<AsyncRustlsConnector, ProtocolError> {
    install_crypto_provider();
    let mut roots = rustls::RootCertStore::empty();
    let native = rustls_native_certs::load_native_certs();
    for cert in native.certs {
        let _ = roots.add(cert);
    }
    let config = rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(AsyncRustlsConnector::from(tokio_rustls::TlsConnector::from(std::sync::Arc::new(config))))
}

fn ftp_err(e: FtpError) -> ProtocolError {
    ProtocolError::Remote(e.to_string())
}

fn file_to_entry(base: &str, f: &FtpFile) -> DirEntry {
    let name = f.name().to_string();
    let path = if base.ends_with('/') { format!("{base}{name}") } else { format!("{base}/{name}") };
    let mut mode = 0u32;
    for (query, bits) in [
        (PosixPexQuery::Owner, [0o400u32, 0o200, 0o100]),
        (PosixPexQuery::Group, [0o040, 0o020, 0o010]),
        (PosixPexQuery::Others, [0o004, 0o002, 0o001]),
    ] {
        if f.can_read(query) {
            mode |= bits[0];
        }
        if f.can_write(query) {
            mode |= bits[1];
        }
        if f.can_execute(query) {
            mode |= bits[2];
        }
    }
    DirEntry {
        name,
        path,
        is_dir: f.is_directory(),
        is_symlink: f.is_symlink(),
        symlink_target: f.symlink().map(|p| p.to_string_lossy().to_string()),
        size: f.size() as u64,
        modified: Some(DateTime::<Utc>::from(f.modified())),
        permissions: Some(mode),
        owner: f.uid().map(|u| u.to_string()),
        group: f.gid().map(|g| g.to_string()),
    }
}

pub struct FtpClient {
    ftp: AsyncRustlsFtpStream,
}

impl FtpClient {
    pub async fn connect(profile: &SiteProfile) -> Result<Self, ProtocolError> {
        debug_assert!(matches!(profile.protocol, Protocol::Ftp | Protocol::Ftps));

        let addr = format!("{}:{}", profile.host, profile.port);
        let mut ftp = tokio::time::timeout(
            std::time::Duration::from_secs(profile.connect_timeout_secs as u64),
            AsyncRustlsFtpStream::connect(&addr),
        )
        .await
        .map_err(|_| ProtocolError::Connect("connection timed out".into()))?
        .map_err(|e| ProtocolError::Connect(e.to_string()))?;

        if matches!(profile.protocol, Protocol::Ftps) {
            ftp = match profile.ftps_mode {
                FtpsMode::Explicit => ftp
                    .into_secure(tls_connector()?, &profile.host)
                    .await
                    .map_err(|e| ProtocolError::Connect(format!("FTPS (explicit) failed: {e}")))?,
                FtpsMode::Implicit => {
                    // Implicit FTPS negotiates TLS before any FTP command, so
                    // the plain-text connection above is unusable; reconnect.
                    AsyncRustlsFtpStream::connect_secure_implicit(&addr, tls_connector()?, &profile.host)
                        .await
                        .map_err(|e| ProtocolError::Connect(format!("FTPS (implicit) failed: {e}")))?
                }
            };
        }

        if profile.passive_ftp {
            ftp.set_mode(suppaftp::Mode::Passive);
        } else {
            ftp.set_mode(suppaftp::Mode::Active);
        }

        let (user, pass) = match profile.auth.clone() {
            crate::model::AuthMethod::Password { password } => (profile.username.clone(), password.value),
            _ => {
                return Err(ProtocolError::Auth(
                    "FTP/FTPS only supports username + password authentication".into(),
                ));
            }
        };
        ftp.login(&user, &pass).await.map_err(ftp_err)?;

        Ok(Self { ftp })
    }
}

#[async_trait]
impl FileTransferClient for FtpClient {
    async fn list_dir(&mut self, path: &str) -> Result<Vec<DirEntry>, ProtocolError> {
        let lines = self.ftp.list(Some(path)).await.map_err(ftp_err)?;
        Ok(lines
            .iter()
            .filter_map(|l| FtpFile::try_from(l.as_str()).ok())
            .filter(|f| f.name() != "." && f.name() != "..")
            .map(|f| file_to_entry(path, &f))
            .collect())
    }

    async fn stat(&mut self, path: &str) -> Result<DirEntry, ProtocolError> {
        let parent = path.rsplit_once('/').map(|(p, _)| p).unwrap_or("/");
        let name = path.rsplit('/').next().unwrap_or(path);
        let entries = self.list_dir(parent).await?;
        entries
            .into_iter()
            .find(|e| e.name == name)
            .ok_or_else(|| ProtocolError::Remote(format!("no such file or directory: {path}")))
    }

    async fn canonicalize(&mut self, path: &str) -> Result<String, ProtocolError> {
        Ok(path.to_string())
    }

    async fn mkdir(&mut self, path: &str) -> Result<(), ProtocolError> {
        self.ftp.mkdir(path).await.map_err(ftp_err)
    }

    async fn remove_file(&mut self, path: &str) -> Result<(), ProtocolError> {
        self.ftp.rm(path).await.map_err(ftp_err)
    }

    async fn remove_dir(&mut self, path: &str) -> Result<(), ProtocolError> {
        // FTP's RMD (what `remove_empty_dir` calls) only succeeds on an
        // already-empty directory, same caveat as SFTP's RMDIR above.
        let entries = self.list_dir(path).await?;
        for entry in entries {
            if entry.is_dir {
                self.remove_dir(&entry.path).await?;
            } else {
                self.remove_file(&entry.path).await?;
            }
        }
        self.remove_empty_dir(path).await
    }

    async fn remove_empty_dir(&mut self, path: &str) -> Result<(), ProtocolError> {
        self.ftp.rmdir(path).await.map_err(ftp_err)
    }

    async fn rename(&mut self, from: &str, to: &str) -> Result<(), ProtocolError> {
        self.ftp.rename(from, to).await.map_err(ftp_err)
    }

    async fn chmod(&mut self, _path: &str, _mode: u32) -> Result<(), ProtocolError> {
        Err(ProtocolError::Unsupported("FTP/FTPS has no standard permissions model"))
    }

    async fn download(
        &mut self,
        remote_path: &str,
        local_path: &Path,
        _mode: TransferMode,
        control: &mut TransferControl,
    ) -> Result<u64, ProtocolError> {
        let mut stream = self.ftp.retr_as_stream(remote_path).await.map_err(ftp_err)?;
        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
        let mut local = LocalFile::create(local_path).await?;
        let mut buf = vec![0u8; CHUNK_SIZE];
        let mut total: u64 = 0;
        loop {
            control.wait_if_paused().await?;
            let n = stream.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            local.write_all(&buf[..n]).await?;
            total += n as u64;
            control.throttle(n as u64).await;
            let _ = control.progress_tx.send(total);
        }
        local.flush().await?;
        self.ftp.finalize_retr_stream(stream).await.map_err(ftp_err)?;
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
        let mut stream = self.ftp.put_with_stream(remote_path).await.map_err(ftp_err)?;
        let mut buf = vec![0u8; CHUNK_SIZE];
        let mut total: u64 = 0;
        loop {
            control.wait_if_paused().await?;
            let n = local.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            stream.write_all(&buf[..n]).await?;
            total += n as u64;
            control.throttle(n as u64).await;
            let _ = control.progress_tx.send(total);
        }
        self.ftp.finalize_put_stream(stream).await.map_err(ftp_err)?;
        Ok(total)
    }

    async fn disconnect(&mut self) -> Result<(), ProtocolError> {
        self.ftp.quit().await.map_err(ftp_err)
    }
}
