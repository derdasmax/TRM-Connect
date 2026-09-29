use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex as AsyncMutex;
use trm_core::crypto::{FileKeyCipher, KeyringCipher, SecretCipher};
use trm_core::model::SiteProfile;
use trm_core::protocol::FileTransferClient;
use trm_core::storage::{self, SiteStore};
use trm_core::transfer::TransferEngine;

/// One live browsing connection: the protocol client plus the (already
/// decrypted) profile it was opened with, so the transfer engine can open
/// its own independent connection to the same site without re-touching the
/// vault.
pub struct ActiveConnection {
    pub client: AsyncMutex<Box<dyn FileTransferClient>>,
    pub profile: SiteProfile,
}

pub struct AppState {
    pub site_store: SiteStore,
    pub connections: AsyncMutex<HashMap<String, Arc<ActiveConnection>>>,
    pub transfer_engine: TransferEngine,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        // Portable mode trades OS-backed key protection for a key file that
        // travels with the data folder - see `FileKeyCipher`'s doc comment.
        let cipher: Arc<dyn SecretCipher> = if storage::is_portable() {
            let key_path = storage::portable_data_dir().join("vault.key");
            Arc::new(FileKeyCipher::load_or_init(&key_path).map_err(|e| e.to_string())?)
        } else {
            Arc::new(KeyringCipher::load_or_init().map_err(|e| e.to_string())?)
        };
        let site_store = SiteStore::open(cipher).map_err(|e| e.to_string())?;
        Ok(Self {
            site_store,
            connections: AsyncMutex::new(HashMap::new()),
            transfer_engine: TransferEngine::new(),
        })
    }
}
