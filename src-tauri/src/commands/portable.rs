use crate::state::AppState;
use std::sync::Arc;
use tauri::{AppHandle, State};
use trm_core::crypto::{FileKeyCipher, KeyringCipher, SecretCipher};
use trm_core::storage::{self, SiteStore};

#[tauri::command]
pub fn is_portable_mode() -> bool {
    storage::is_portable()
}

/// Switches between the normal (`%APPDATA%\TRM-Connect`) and portable
/// (next to the executable) data locations, migrating the saved-site vault
/// so passwords keep working under the new location's cipher, then restarts
/// the app - `AppState` builds its store once at startup, so the switch
/// can't take effect in the already-running process.
#[tauri::command]
pub async fn set_portable_mode(
    app: AppHandle,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    if storage::is_portable() == enabled {
        return Ok(());
    }

    let decrypted: Vec<_> = state
        .site_store
        .list()
        .iter()
        .map(|p| state.site_store.decrypt_secrets(p))
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    let new_dir = if enabled { storage::portable_data_dir() } else { storage::app_config_dir() };
    std::fs::create_dir_all(&new_dir).map_err(|e| e.to_string())?;

    let new_cipher: Arc<dyn SecretCipher> = if enabled {
        Arc::new(FileKeyCipher::load_or_init(&new_dir.join("vault.key")).map_err(|e| e.to_string())?)
    } else {
        Arc::new(KeyringCipher::load_or_init().map_err(|e| e.to_string())?)
    };
    let new_store = SiteStore::open_at(new_dir.join("sites.json"), new_cipher).map_err(|e| e.to_string())?;
    for profile in decrypted {
        new_store.upsert(profile).map_err(|e| e.to_string())?;
    }

    if enabled {
        std::fs::write(storage::portable_marker_path(), b"").map_err(|e| e.to_string())?;
    } else {
        std::fs::remove_file(storage::portable_marker_path()).map_err(|e| e.to_string())?;
    }

    app.restart()
}
