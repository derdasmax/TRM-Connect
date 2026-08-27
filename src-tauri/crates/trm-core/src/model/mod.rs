//! Shared data model: site profiles, directory entries, transfer state.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Wire/storage protocol used for a connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Sftp,
    Ftp,
    Ftps,
    Scp,
}

impl Protocol {
    pub fn default_port(self) -> u16 {
        match self {
            Protocol::Sftp => 22,
            Protocol::Scp => 22,
            Protocol::Ftp => 21,
            Protocol::Ftps => 21,
        }
    }
}

impl fmt::Display for Protocol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Protocol::Sftp => "SFTP",
            Protocol::Ftp => "FTP",
            Protocol::Ftps => "FTPS",
            Protocol::Scp => "SCP",
        };
        write!(f, "{s}")
    }
}

/// How FTPS negotiates TLS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum FtpsMode {
    #[default]
    Explicit,
    Implicit,
}

/// Authentication method for a site. Secret material is stored as an
/// opaque, already-encrypted blob (see [`crate::crypto`]) - this enum only
/// carries the *shape* of the credential, never the plaintext, once a
/// profile has round-tripped through storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AuthMethod {
    Password {
        /// Empty when no password stored (prompt on connect).
        password: SecretField,
    },
    PrivateKey {
        key_path: String,
        passphrase: SecretField,
    },
    Agent,
}

/// A secret value. When held in memory for use it contains the plaintext;
/// when persisted to disk it is replaced by an encrypted, base64-encoded
/// blob. `is_encrypted` tracks which state the field is currently in so the
/// storage layer never double-encrypts or leaks plaintext into the JSON file.
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct SecretField {
    pub value: String,
    #[serde(default)]
    pub is_encrypted: bool,
}

impl SecretField {
    pub fn plaintext(value: impl Into<String>) -> Self {
        Self { value: value.into(), is_encrypted: false }
    }

    pub fn empty() -> Self {
        Self::default()
    }

    pub fn is_empty(&self) -> bool {
        self.value.is_empty()
    }
}

impl fmt::Debug for SecretField {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.value.is_empty() {
            write!(f, "SecretField(empty)")
        } else {
            write!(f, "SecretField(***redacted***)")
        }
    }
}

fn default_true() -> bool {
    true
}

/// A saved connection ("site") in the Site Manager.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteProfile {
    pub id: String,
    pub name: String,
    /// Folder path for grouping in the Site Manager tree, e.g. `["Work", "ClientA"]`.
    #[serde(default)]
    pub folder: Vec<String>,
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
    #[serde(default)]
    pub ftps_mode: FtpsMode,
    #[serde(default)]
    pub remote_dir: Option<String>,
    #[serde(default)]
    pub local_dir: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default = "default_true")]
    pub verify_host_key: bool,
    /// Known-host-key fingerprint pinned on first successful connect (TOFU).
    #[serde(default)]
    pub pinned_host_key_fingerprint: Option<String>,
    #[serde(default)]
    pub passive_ftp: bool,
    #[serde(default = "default_timeout")]
    pub connect_timeout_secs: u32,
    #[serde(default)]
    pub created_at: DateTime<Utc>,
    #[serde(default)]
    pub updated_at: DateTime<Utc>,
}

fn default_timeout() -> u32 {
    15
}

impl SiteProfile {
    pub fn new_quick_connect(
        protocol: Protocol,
        host: String,
        port: u16,
        username: String,
        auth: AuthMethod,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name: format!("{username}@{host}"),
            folder: Vec::new(),
            protocol,
            host,
            port,
            username,
            auth,
            ftps_mode: FtpsMode::default(),
            remote_dir: None,
            local_dir: None,
            color: None,
            notes: None,
            verify_host_key: true,
            pinned_host_key_fingerprint: None,
            passive_ftp: true,
            connect_timeout_secs: default_timeout(),
            created_at: now,
            updated_at: now,
        }
    }
}

/// A single entry returned by a directory listing (local or remote).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub size: u64,
    pub modified: Option<DateTime<Utc>>,
    /// Unix permission bits (e.g. 0o755), when known.
    pub permissions: Option<u32>,
    pub owner: Option<String>,
    pub group: Option<String>,
}

/// Direction of a transfer job.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferDirection {
    Upload,
    Download,
}

/// Text/binary transfer mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TransferMode {
    #[default]
    Auto,
    Binary,
    Text,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransferStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferTask {
    pub id: String,
    pub connection_id: String,
    pub direction: TransferDirection,
    pub local_path: String,
    pub remote_path: String,
    pub total_bytes: u64,
    pub transferred_bytes: u64,
    pub status: TransferStatus,
    pub error: Option<String>,
    pub mode: TransferMode,
    pub started_at: Option<DateTime<Utc>>,
    pub updated_at: DateTime<Utc>,
}
