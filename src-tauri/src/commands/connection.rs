use crate::state::{ActiveConnection, AppState};
use serde::Serialize;
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex as AsyncMutex;
use trm_core::model::SiteProfile;
use trm_core::protocol;

#[derive(Debug, Clone, Serialize)]
pub struct ConnectionInfo {
    pub connection_id: String,
    pub protocol: trm_core::model::Protocol,
    pub host_key_fingerprint: Option<String>,
    pub host_key_matched_pinned: Option<bool>,
}

async fn finish_connect(
    state: &State<'_, AppState>,
    profile: SiteProfile,
) -> Result<ConnectionInfo, String> {
    let client = protocol::connect(&profile).await.map_err(|e| e.to_string())?;

    // Best-effort host key fingerprint: only SFTP/SCP (SSH-based) clients
    // expose one; FTP/FTPS has no equivalent concept.
    let (fingerprint, matched) = match client.host_key() {
        Some((fp, matched)) => (Some(fp.to_string()), matched),
        None => (None, None),
    };

    let connection_id = uuid::Uuid::new_v4().to_string();
    let entry = Arc::new(ActiveConnection {
        client: AsyncMutex::new(client),
        profile: profile.clone(),
    });
    state.connections.lock().await.insert(connection_id.clone(), entry);

    Ok(ConnectionInfo {
        connection_id,
        protocol: profile.protocol,
        host_key_fingerprint: fingerprint,
        host_key_matched_pinned: matched,
    })
}

#[tauri::command]
pub async fn connect_saved_site(
    state: State<'_, AppState>,
    site_id: String,
) -> Result<ConnectionInfo, String> {
    let profile = state.site_store.get(&site_id).map_err(|e| e.to_string())?;
    let profile = state.site_store.decrypt_secrets(&profile).map_err(|e| e.to_string())?;
    finish_connect(&state, profile).await
}

#[tauri::command]
pub async fn quick_connect(
    state: State<'_, AppState>,
    profile: SiteProfile,
) -> Result<ConnectionInfo, String> {
    finish_connect(&state, profile).await
}

#[tauri::command]
pub async fn disconnect(state: State<'_, AppState>, connection_id: String) -> Result<(), String> {
    let entry = state.connections.lock().await.remove(&connection_id);
    if let Some(entry) = entry {
        let mut client = entry.client.lock().await;
        let _ = client.disconnect().await;
    }
    Ok(())
}
