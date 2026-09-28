use crate::state::AppState;
use chrono::Utc;
use tauri::State;
use trm_core::model::{TransferDirection, TransferMode, TransferStatus, TransferTask};

async fn profile_for(state: &State<'_, AppState>, connection_id: &str) -> Result<trm_core::model::SiteProfile, String> {
    state
        .connections
        .lock()
        .await
        .get(connection_id)
        .map(|c| c.profile.clone())
        .ok_or_else(|| format!("no such connection: {connection_id}"))
}

#[tauri::command]
pub async fn enqueue_download(
    state: State<'_, AppState>,
    connection_id: String,
    remote_path: String,
    local_path: String,
    speed_limit_bps: Option<u64>,
    verify_checksum: Option<bool>,
) -> Result<String, String> {
    let profile = profile_for(&state, &connection_id).await?;
    let task = new_task(
        &connection_id,
        TransferDirection::Download,
        local_path,
        remote_path,
        speed_limit_bps.unwrap_or(0),
        verify_checksum.unwrap_or(false),
    );
    let task_id = task.id.clone();
    state.transfer_engine.enqueue(task, profile);
    Ok(task_id)
}

#[tauri::command]
pub async fn enqueue_upload(
    state: State<'_, AppState>,
    connection_id: String,
    local_path: String,
    remote_path: String,
    speed_limit_bps: Option<u64>,
    verify_checksum: Option<bool>,
) -> Result<String, String> {
    let profile = profile_for(&state, &connection_id).await?;
    let task = new_task(
        &connection_id,
        TransferDirection::Upload,
        local_path,
        remote_path,
        speed_limit_bps.unwrap_or(0),
        verify_checksum.unwrap_or(false),
    );
    let task_id = task.id.clone();
    state.transfer_engine.enqueue(task, profile);
    Ok(task_id)
}

#[allow(clippy::too_many_arguments)]
fn new_task(
    connection_id: &str,
    direction: TransferDirection,
    local_path: String,
    remote_path: String,
    speed_limit_bps: u64,
    verify_checksum: bool,
) -> TransferTask {
    TransferTask {
        id: uuid::Uuid::new_v4().to_string(),
        connection_id: connection_id.to_string(),
        direction,
        local_path,
        remote_path,
        total_bytes: 0,
        transferred_bytes: 0,
        status: TransferStatus::Queued,
        error: None,
        mode: TransferMode::Auto,
        started_at: None,
        updated_at: Utc::now(),
        speed_limit_bps,
        verify_checksum,
        checksum: None,
    }
}

#[tauri::command]
pub async fn list_transfers(state: State<'_, AppState>) -> Result<Vec<TransferTask>, String> {
    Ok(state.transfer_engine.snapshot())
}

#[tauri::command]
pub async fn pause_transfer(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state.transfer_engine.pause(&task_id);
    Ok(())
}

#[tauri::command]
pub async fn resume_transfer(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state.transfer_engine.resume(&task_id);
    Ok(())
}

#[tauri::command]
pub async fn cancel_transfer(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state.transfer_engine.cancel(&task_id);
    Ok(())
}

#[tauri::command]
pub async fn pause_all_transfers(state: State<'_, AppState>) -> Result<(), String> {
    state.transfer_engine.pause_all();
    Ok(())
}

#[tauri::command]
pub async fn resume_all_transfers(state: State<'_, AppState>) -> Result<(), String> {
    state.transfer_engine.resume_all();
    Ok(())
}

#[tauri::command]
pub async fn cancel_all_transfers(state: State<'_, AppState>) -> Result<(), String> {
    state.transfer_engine.cancel_all();
    Ok(())
}

/// Moves a still-queued job to `new_index` within the pending queue; a
/// no-op once the job has already started (it's no longer in the deque).
#[tauri::command]
pub async fn reorder_transfer(state: State<'_, AppState>, task_id: String, new_index: usize) -> Result<(), String> {
    state.transfer_engine.reorder(&task_id, new_index);
    Ok(())
}

#[tauri::command]
pub async fn prioritize_transfer(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state.transfer_engine.prioritize(&task_id);
    Ok(())
}

/// Bandwidth cap shared by every active transfer, in bytes/sec (`0` = unlimited).
#[tauri::command]
pub async fn set_global_bandwidth_limit(state: State<'_, AppState>, bytes_per_sec: u64) -> Result<(), String> {
    state.transfer_engine.set_global_limit(bytes_per_sec);
    Ok(())
}

/// Bandwidth cap for one transfer alone, in bytes/sec (`0` = unlimited).
#[tauri::command]
pub async fn set_transfer_bandwidth_limit(
    state: State<'_, AppState>,
    task_id: String,
    bytes_per_sec: u64,
) -> Result<(), String> {
    state.transfer_engine.set_task_limit(&task_id, bytes_per_sec);
    Ok(())
}
