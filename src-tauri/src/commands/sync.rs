use crate::state::AppState;
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::collections::{BTreeSet, HashMap, VecDeque};
use std::path::{Path, PathBuf};
use tauri::State;
use trm_core::model::DirEntry;
use trm_core::protocol::FileTransferClient;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncStatus {
    /// Exists only on the local side - the intelligent default is to upload it.
    LocalOnly,
    /// Exists only on the remote side - the intelligent default is to download it.
    RemoteOnly,
    /// Exists on both sides but the size or modified time disagrees; the
    /// frontend lets the user pick a direction per entry.
    Differs,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncEntry {
    /// Path relative to the two compared roots, using `/` regardless of
    /// platform, e.g. `"src/main.rs"` - what the frontend joins onto either
    /// root to get a real path.
    pub relative_path: String,
    pub is_dir: bool,
    pub status: SyncStatus,
    pub local_size: Option<u64>,
    pub local_modified: Option<DateTime<Utc>>,
    pub remote_size: Option<u64>,
    pub remote_modified: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncDiffResult {
    /// Sorted so a parent directory's entry always comes before anything
    /// inside it - the frontend can create directories in list order and
    /// never hit a missing-parent error.
    pub entries: Vec<SyncEntry>,
    /// Files/folders that exist on both sides and already match - not worth
    /// listing individually, but the count reassures the user the compare
    /// actually ran against the whole tree.
    pub same_count: u64,
}

/// Recursively compares a local directory tree against a remote one and
/// reports every file/folder that's one-sided or differs, so a "sync
/// directories" UI can show a diff before touching anything. Uses size alone
/// as the change heuristic rather than hashing every file (which would mean
/// downloading/reading the full content of everything just to compare it).
/// Modified time is reported for the user's own judgment but never drives
/// the same/differs decision: neither upload nor download here preserves
/// the source's mtime on the destination, so comparing timestamps would
/// flag every just-synced file as "differs" again on the very next diff.
#[tauri::command]
pub async fn diff_directories(
    state: State<'_, AppState>,
    connection_id: String,
    local_root: String,
    remote_root: String,
) -> Result<SyncDiffResult, String> {
    let local_map = walk_local(Path::new(&local_root)).await?;

    let conn = state
        .connections
        .lock()
        .await
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| format!("no such connection: {connection_id}"))?;
    let remote_map = {
        let mut client = conn.client.lock().await;
        walk_remote(client.as_mut(), &remote_root).await?
    };

    let mut keys: BTreeSet<String> = local_map.keys().cloned().collect();
    keys.extend(remote_map.keys().cloned());

    let mut entries = Vec::new();
    let mut same_count = 0u64;
    for key in keys {
        let local = local_map.get(&key);
        let remote = remote_map.get(&key);
        match (local, remote) {
            (Some(l), None) => entries.push(SyncEntry {
                relative_path: key,
                is_dir: l.is_dir,
                status: SyncStatus::LocalOnly,
                local_size: Some(l.size),
                local_modified: l.modified,
                remote_size: None,
                remote_modified: None,
            }),
            (None, Some(r)) => entries.push(SyncEntry {
                relative_path: key,
                is_dir: r.is_dir,
                status: SyncStatus::RemoteOnly,
                local_size: None,
                local_modified: None,
                remote_size: Some(r.size),
                remote_modified: r.modified,
            }),
            (Some(l), Some(r)) => {
                if l.is_dir && r.is_dir {
                    // Present on both sides as a folder - nothing to do for
                    // the folder itself; its contents were already queued.
                    continue;
                }
                if l.is_dir != r.is_dir || l.size != r.size {
                    entries.push(SyncEntry {
                        relative_path: key,
                        is_dir: l.is_dir,
                        status: SyncStatus::Differs,
                        local_size: Some(l.size),
                        local_modified: l.modified,
                        remote_size: Some(r.size),
                        remote_modified: r.modified,
                    });
                } else {
                    same_count += 1;
                }
            }
            (None, None) => unreachable!("key came from one of the two maps"),
        }
    }

    entries.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));
    Ok(SyncDiffResult { entries, same_count })
}

async fn walk_local(root: &Path) -> Result<HashMap<String, DirEntry>, String> {
    let mut result = HashMap::new();
    let mut queue = VecDeque::new();
    queue.push_back(root.to_path_buf());
    while let Some(dir) = queue.pop_front() {
        let entries = trm_core::local::list_dir(&dir).await.map_err(|e| e.to_string())?;
        for entry in entries {
            if entry.is_dir {
                queue.push_back(PathBuf::from(&entry.path));
            }
            let rel = relative_path(&root.to_string_lossy(), &entry.path);
            if !rel.is_empty() {
                result.insert(rel, entry);
            }
        }
    }
    Ok(result)
}

async fn walk_remote(
    client: &mut (dyn FileTransferClient + '_),
    root: &str,
) -> Result<HashMap<String, DirEntry>, String> {
    let mut result = HashMap::new();
    let mut queue = VecDeque::new();
    queue.push_back(root.to_string());
    while let Some(dir) = queue.pop_front() {
        let entries = client.list_dir(&dir).await.map_err(|e| e.to_string())?;
        for entry in entries {
            if entry.is_dir {
                queue.push_back(entry.path.clone());
            }
            let rel = relative_path(root, &entry.path);
            if !rel.is_empty() {
                result.insert(rel, entry);
            }
        }
    }
    Ok(result)
}

/// Strips `root` off the front of `full` and normalizes to forward slashes,
/// since `DirEntry::path` is always the full absolute path (local or
/// remote) rather than something already relative to a sync root.
fn relative_path(root: &str, full: &str) -> String {
    let trimmed = full.strip_prefix(root).unwrap_or(full);
    trimmed.trim_start_matches(['/', '\\']).replace('\\', "/")
}
