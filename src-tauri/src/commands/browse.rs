use crate::state::{ActiveConnection, AppState};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio_util::sync::CancellationToken;
use trm_core::model::{DirEntry, TransferMode};
use trm_core::protocol::TransferControl;
use trm_core::throttle::RateLimiter;

/// Interactive Quick Look previews are capped well below what the transfer
/// queue would handle, since they're meant to open near-instantly.
const QUICK_LOOK_MAX_BYTES: u64 = 25 * 1024 * 1024;

async fn get_connection(state: &State<'_, AppState>, connection_id: &str) -> Result<Arc<ActiveConnection>, String> {
    state
        .connections
        .lock()
        .await
        .get(connection_id)
        .cloned()
        .ok_or_else(|| format!("no such connection: {connection_id}"))
}

#[tauri::command]
pub async fn list_remote_dir(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> Result<Vec<DirEntry>, String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    client.list_dir(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remote_canonicalize(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> Result<String, String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    client.canonicalize(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remote_mkdir(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    client.mkdir(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remote_remove_file(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    client.remove_file(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remote_remove_dir(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    client.remove_dir(&path).await.map_err(|e| e.to_string())
}

/// Undoes a `mkdir`; refuses (rather than recursing) if the folder is no
/// longer empty, since the user may have added files to it since.
#[tauri::command]
pub async fn remote_remove_empty_dir(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> Result<(), String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    client.remove_empty_dir(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remote_rename(
    state: State<'_, AppState>,
    connection_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    client.rename(&from, &to).await.map_err(|e| e.to_string())
}

/// Used by the conflict-handling dialog to check whether a transfer's
/// destination already exists. Any stat error (not-found or otherwise) is
/// reported as "doesn't exist" - a real connection problem will surface
/// again, more informatively, on the transfer itself.
#[tauri::command]
pub async fn remote_stat(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
) -> Result<Option<DirEntry>, String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    Ok(client.stat(&path).await.ok())
}

/// Downloads a remote file into a scratch temp directory for interactive
/// preview (Quick Look), reusing the already-open browsing connection
/// rather than opening a new one through the transfer queue. Returns the
/// local temp file path.
#[tauri::command]
pub async fn quick_look_remote(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
    size: u64,
) -> Result<String, String> {
    if size > QUICK_LOOK_MAX_BYTES {
        return Err("File too large to preview (over 25 MB).".into());
    }
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;

    let dir = std::env::temp_dir().join("trm-connect-quicklook");
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let file_name = path.rsplit(['/', '\\']).next().unwrap_or("preview");
    let dest = dir.join(format!("{:x}-{}", hash_str(&path), file_name));

    let (progress_tx, _progress_rx) = tokio::sync::mpsc::unbounded_channel();
    let (_pause_tx, pause_rx) = tokio::sync::watch::channel(false);
    let mut control = TransferControl {
        cancel: CancellationToken::new(),
        pause: pause_rx,
        progress_tx,
        global_limiter: RateLimiter::new(0),
        task_limiter: RateLimiter::new(0),
    };

    client
        .download(&path, &dest, TransferMode::Auto, &mut control)
        .await
        .map_err(|e| e.to_string())?;

    Ok(dest.to_string_lossy().to_string())
}

fn hash_str(s: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut hasher);
    hasher.finish()
}

/// Reads up to `max_bytes` of a local text file for a Quick Look / diff
/// preview, lossily decoding as UTF-8 so binary garbage never breaks the
/// UI thread.
#[tauri::command]
pub async fn read_text_preview(path: String, max_bytes: usize) -> Result<String, String> {
    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
    let truncated = &bytes[..bytes.len().min(max_bytes)];
    Ok(String::from_utf8_lossy(truncated).to_string())
}

#[tauri::command]
pub async fn remote_chmod(
    state: State<'_, AppState>,
    connection_id: String,
    path: String,
    mode: u32,
) -> Result<(), String> {
    let conn = get_connection(&state, &connection_id).await?;
    let mut client = conn.client.lock().await;
    client.chmod(&path, mode).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_local_dir(path: String) -> Result<Vec<DirEntry>, String> {
    trm_core::local::list_dir(&PathBuf::from(path)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_stat(path: String) -> Result<Option<DirEntry>, String> {
    Ok(trm_core::local::stat(&PathBuf::from(path)).await.ok())
}

#[tauri::command]
pub async fn local_mkdir(path: String) -> Result<(), String> {
    trm_core::local::mkdir(&PathBuf::from(path)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_remove_file(path: String) -> Result<(), String> {
    trm_core::local::remove_file(&PathBuf::from(path)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_remove_dir(path: String) -> Result<(), String> {
    trm_core::local::remove_dir(&PathBuf::from(path)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_remove_empty_dir(path: String) -> Result<(), String> {
    trm_core::local::remove_empty_dir(&PathBuf::from(path)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_rename(from: String, to: String) -> Result<(), String> {
    trm_core::local::rename(&PathBuf::from(from), &PathBuf::from(to)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_home_dir() -> Result<String, String> {
    Ok(trm_core::local::home_dir().to_string_lossy().to_string())
}
