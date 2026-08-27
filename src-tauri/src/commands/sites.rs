use crate::state::AppState;
use tauri::State;
use trm_core::model::SiteProfile;

#[tauri::command]
pub async fn list_sites(state: State<'_, AppState>) -> Result<Vec<SiteProfile>, String> {
    Ok(state.site_store.list())
}

#[tauri::command]
pub async fn save_site(state: State<'_, AppState>, profile: SiteProfile) -> Result<SiteProfile, String> {
    state.site_store.upsert(profile).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_site(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.site_store.delete(&id).map_err(|e| e.to_string())
}
