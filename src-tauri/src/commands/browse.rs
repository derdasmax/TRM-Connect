use crate::state::{ActiveConnection, AppState};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use trm_core::model::DirEntry;

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
pub async fn local_rename(from: String, to: String) -> Result<(), String> {
    trm_core::local::rename(&PathBuf::from(from), &PathBuf::from(to)).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn local_home_dir() -> Result<String, String> {
    Ok(trm_core::local::home_dir().to_string_lossy().to_string())
}
