use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;
use tokio_util::sync::CancellationToken;
use trm_core::crypto::{MasterPasswordCipher, SecretCipher};
use trm_core::model::{SiteProfile, TransferMode};
use trm_core::protocol::TransferControl;
use trm_core::throttle::RateLimiter;

/// Optional, opt-in sync of saved connections and a small set of settings
/// through whatever server the user is already connected to - no bespoke
/// cloud backend or account needed, since the app already knows how to talk
/// to SFTP/FTP servers. The payload is encrypted client-side with a
/// passphrase the server (and anyone who can read the file there) never
/// sees; only someone who knows the passphrase can make sense of it.
#[derive(Debug, Serialize, Deserialize)]
struct SyncEnvelope {
    version: u32,
    /// Base64 salt for deriving the encryption key from the passphrase -
    /// not secret, just needs to be stored alongside the ciphertext so a
    /// later pull can re-derive the same key.
    salt: String,
    ciphertext: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SyncPayload {
    sites: Vec<SiteProfile>,
    /// Opaque to the backend - the frontend's own JSON for the handful of
    /// settings it chooses to sync (accent color, bandwidth limit, ...).
    settings_json: String,
}

#[derive(Debug, Serialize)]
pub struct CloudSyncPullResult {
    /// Secrets are already decrypted here - the frontend re-saves each via
    /// the normal `save_site` command, which re-encrypts under whichever
    /// cipher this machine uses, exactly like any other saved site.
    pub sites: Vec<SiteProfile>,
    pub settings_json: String,
}

async fn temp_file(prefix: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("{prefix}-{}.json", uuid::Uuid::new_v4()))
}

fn new_control() -> TransferControl {
    let (progress_tx, _rx) = tokio::sync::mpsc::unbounded_channel();
    let (_pause_tx, pause_rx) = tokio::sync::watch::channel(false);
    TransferControl {
        cancel: CancellationToken::new(),
        pause: pause_rx,
        progress_tx,
        global_limiter: RateLimiter::new(0),
        task_limiter: RateLimiter::new(0),
    }
}

/// Encrypts the current saved-site vault plus the caller-supplied settings
/// JSON under `passphrase` and uploads it to `remote_path` over the
/// already-open connection.
#[tauri::command]
pub async fn cloud_sync_push(
    state: State<'_, AppState>,
    connection_id: String,
    remote_path: String,
    passphrase: String,
    settings_json: String,
) -> Result<(), String> {
    let sites: Vec<SiteProfile> = state
        .site_store
        .list()
        .iter()
        .map(|p| state.site_store.decrypt_secrets(p))
        .collect::<Result<_, _>>()
        .map_err(|e| e.to_string())?;

    let plaintext =
        serde_json::to_string(&SyncPayload { sites, settings_json }).map_err(|e| e.to_string())?;

    let salt = MasterPasswordCipher::new_salt().map_err(|e| e.to_string())?;
    let cipher = MasterPasswordCipher::derive(&passphrase, &salt).map_err(|e| e.to_string())?;
    let ciphertext = cipher.encrypt(&plaintext).map_err(|e| e.to_string())?;

    let envelope = serde_json::to_string_pretty(&SyncEnvelope { version: 1, salt, ciphertext })
        .map_err(|e| e.to_string())?;

    let tmp = temp_file("trm-connect-cloudsync-push").await;
    tokio::fs::write(&tmp, &envelope).await.map_err(|e| e.to_string())?;

    let conn = state
        .connections
        .lock()
        .await
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| format!("no such connection: {connection_id}"))?;
    let result = {
        let mut client = conn.client.lock().await;
        let mut control = new_control();
        client.upload(&tmp, &remote_path, TransferMode::Auto, &mut control).await
    };
    let _ = tokio::fs::remove_file(&tmp).await;
    result.map(|_| ()).map_err(|e| e.to_string())
}

/// Downloads and decrypts the sync file `cloud_sync_push` wrote, returning
/// its contents for the frontend to merge in. Never touches the local vault
/// itself - the caller decides what to do with each returned site.
#[tauri::command]
pub async fn cloud_sync_pull(
    state: State<'_, AppState>,
    connection_id: String,
    remote_path: String,
    passphrase: String,
) -> Result<CloudSyncPullResult, String> {
    let conn = state
        .connections
        .lock()
        .await
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| format!("no such connection: {connection_id}"))?;

    let tmp = temp_file("trm-connect-cloudsync-pull").await;
    let download_result = {
        let mut client = conn.client.lock().await;
        let mut control = new_control();
        client.download(&remote_path, &tmp, TransferMode::Auto, &mut control).await
    };
    download_result.map_err(|e| e.to_string())?;

    let envelope_str = tokio::fs::read_to_string(&tmp).await.map_err(|e| e.to_string())?;
    let _ = tokio::fs::remove_file(&tmp).await;

    let envelope: SyncEnvelope =
        serde_json::from_str(&envelope_str).map_err(|_| "Not a TRM-Connect cloud-sync file.".to_string())?;
    let cipher = MasterPasswordCipher::derive(&passphrase, &envelope.salt).map_err(|e| e.to_string())?;
    let plaintext = cipher
        .decrypt(&envelope.ciphertext)
        .map_err(|_| "Wrong passphrase, or the file is corrupt.".to_string())?;
    let payload: SyncPayload = serde_json::from_str(&plaintext).map_err(|e| e.to_string())?;

    Ok(CloudSyncPullResult { sites: payload.sites, settings_json: payload.settings_json })
}
