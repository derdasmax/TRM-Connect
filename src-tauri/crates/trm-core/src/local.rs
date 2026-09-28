//! Local filesystem helpers for the left-hand pane of the dual-pane browser
//! and for the transfer engine's local side of an upload/download.

use crate::model::DirEntry;
use chrono::{DateTime, Utc};
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum LocalFsError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub async fn list_dir(path: &Path) -> Result<Vec<DirEntry>, LocalFsError> {
    let mut entries = Vec::new();
    let mut rd = tokio::fs::read_dir(path).await?;
    while let Some(entry) = rd.next_entry().await? {
        let meta = entry.metadata().await?;
        let name = entry.file_name().to_string_lossy().to_string();
        let full = entry.path();
        entries.push(to_dir_entry(name, full, &meta));
    }
    Ok(entries)
}

pub async fn stat(path: &Path) -> Result<DirEntry, LocalFsError> {
    let meta = tokio::fs::symlink_metadata(path).await?;
    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    Ok(to_dir_entry(name, path.to_path_buf(), &meta))
}

fn to_dir_entry(name: String, path: PathBuf, meta: &std::fs::Metadata) -> DirEntry {
    #[cfg(unix)]
    let permissions = {
        use std::os::unix::fs::PermissionsExt;
        Some(meta.permissions().mode() & 0o7777)
    };
    #[cfg(not(unix))]
    let permissions: Option<u32> = None;

    DirEntry {
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: meta.is_dir(),
        is_symlink: meta.file_type().is_symlink(),
        symlink_target: None,
        size: meta.len(),
        modified: meta.modified().ok().map(DateTime::<Utc>::from),
        permissions,
        owner: None,
        group: None,
    }
}

pub async fn mkdir(path: &Path) -> Result<(), LocalFsError> {
    tokio::fs::create_dir_all(path).await?;
    Ok(())
}

pub async fn remove_file(path: &Path) -> Result<(), LocalFsError> {
    tokio::fs::remove_file(path).await?;
    Ok(())
}

pub async fn remove_dir(path: &Path) -> Result<(), LocalFsError> {
    tokio::fs::remove_dir_all(path).await?;
    Ok(())
}

/// Removes a directory only if it's empty - unlike [`remove_dir`], this
/// never touches anything inside it. Used to undo a `mkdir`, where silently
/// recursing would risk deleting files the user added since creating it.
pub async fn remove_empty_dir(path: &Path) -> Result<(), LocalFsError> {
    tokio::fs::remove_dir(path).await?;
    Ok(())
}

pub async fn rename(from: &Path, to: &Path) -> Result<(), LocalFsError> {
    tokio::fs::rename(from, to).await?;
    Ok(())
}

pub fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(std::env::temp_dir)
}

/// Streams the file through SHA-256 without loading it into memory at once,
/// so checksum verification stays cheap even for large transfers.
pub async fn sha256_file(path: &Path) -> Result<String, LocalFsError> {
    use sha2::{Digest, Sha256};
    let mut file = tokio::fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        use tokio::io::AsyncReadExt;
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn lists_created_files() {
        let dir = tempfile::tempdir().unwrap();
        tokio::fs::write(dir.path().join("a.txt"), b"hi").await.unwrap();
        tokio::fs::create_dir(dir.path().join("sub")).await.unwrap();

        let entries = list_dir(dir.path()).await.unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries.iter().any(|e| e.name == "a.txt" && !e.is_dir && e.size == 2));
        assert!(entries.iter().any(|e| e.name == "sub" && e.is_dir));
    }
}
