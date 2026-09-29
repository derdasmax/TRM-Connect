//! Persists the Site Manager's saved connections to a local JSON file,
//! encrypting secret fields (passwords, key passphrases) at rest.

use crate::crypto::{CryptoError, SecretCipher};
use crate::model::{AuthMethod, SiteProfile};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum StoreError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("(de)serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("crypto error: {0}")]
    Crypto(#[from] CryptoError),
    #[error("site not found: {0}")]
    NotFound(String),
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct VaultFile {
    sites: Vec<SiteProfile>,
}

/// Directory (e.g. `%APPDATA%\TRM-Connect`) that holds `sites.json` and
/// other per-user app state.
pub fn app_config_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("TRM-Connect")
}

const PORTABLE_MARKER: &str = "portable.dat";

/// Directory containing the running executable, or the current directory as
/// a fallback for the rare case it can't be resolved.
pub fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn portable_marker_path() -> PathBuf {
    exe_dir().join(PORTABLE_MARKER)
}

/// True once a `portable.dat` marker file sits next to the executable -
/// written/removed only by the "Portable mode" setting, never by hand.
pub fn is_portable() -> bool {
    portable_marker_path().exists()
}

/// Where the portable data folder lives, next to the executable.
pub fn portable_data_dir() -> PathBuf {
    exe_dir().join("TRM-Connect-data")
}

/// The data directory actually in effect: the portable folder next to the
/// executable when portable mode is on, `app_config_dir()` otherwise.
pub fn data_dir() -> PathBuf {
    if is_portable() {
        portable_data_dir()
    } else {
        app_config_dir()
    }
}

pub struct SiteStore {
    path: PathBuf,
    cipher: Arc<dyn SecretCipher>,
    cache: RwLock<Vec<SiteProfile>>,
}

impl SiteStore {
    pub fn open(cipher: Arc<dyn SecretCipher>) -> Result<Self, StoreError> {
        Self::open_at(data_dir().join("sites.json"), cipher)
    }

    pub fn open_at(path: PathBuf, cipher: Arc<dyn SecretCipher>) -> Result<Self, StoreError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let sites = if path.exists() {
            let raw = fs::read_to_string(&path)?;
            let file: VaultFile = serde_json::from_str(&raw)?;
            file.sites
        } else {
            Vec::new()
        };
        Ok(Self { path, cipher, cache: RwLock::new(sites) })
    }

    pub fn list(&self) -> Vec<SiteProfile> {
        // Returned with secrets still encrypted; callers must call
        // `decrypt_secrets` before using a profile to connect.
        self.cache.read().unwrap().clone()
    }

    pub fn get(&self, id: &str) -> Result<SiteProfile, StoreError> {
        self.cache
            .read()
            .unwrap()
            .iter()
            .find(|s| s.id == id)
            .cloned()
            .ok_or_else(|| StoreError::NotFound(id.to_string()))
    }

    /// Inserts or updates a profile. Plaintext secret fields on `profile`
    /// are encrypted before being written to disk.
    pub fn upsert(&self, mut profile: SiteProfile) -> Result<SiteProfile, StoreError> {
        self.encrypt_secrets(&mut profile.auth)?;
        profile.updated_at = chrono::Utc::now();

        {
            let mut sites = self.cache.write().unwrap();
            if let Some(existing) = sites.iter_mut().find(|s| s.id == profile.id) {
                *existing = profile.clone();
            } else {
                sites.push(profile.clone());
            }
        }
        self.flush()?;
        Ok(profile)
    }

    pub fn delete(&self, id: &str) -> Result<(), StoreError> {
        let mut sites = self.cache.write().unwrap();
        let before = sites.len();
        sites.retain(|s| s.id != id);
        if sites.len() == before {
            return Err(StoreError::NotFound(id.to_string()));
        }
        drop(sites);
        self.flush()
    }

    /// Returns a copy of `profile` with secret fields decrypted to
    /// plaintext, ready to hand to a protocol client for connecting.
    pub fn decrypt_secrets(&self, profile: &SiteProfile) -> Result<SiteProfile, StoreError> {
        let mut profile = profile.clone();
        match &mut profile.auth {
            AuthMethod::Password { password } => {
                if password.is_encrypted && !password.is_empty() {
                    password.value = self.cipher.decrypt(&password.value)?;
                    password.is_encrypted = false;
                }
            }
            AuthMethod::PrivateKey { passphrase, .. } => {
                if passphrase.is_encrypted && !passphrase.is_empty() {
                    passphrase.value = self.cipher.decrypt(&passphrase.value)?;
                    passphrase.is_encrypted = false;
                }
            }
            AuthMethod::Agent => {}
        }
        Ok(profile)
    }

    fn encrypt_secrets(&self, auth: &mut AuthMethod) -> Result<(), StoreError> {
        match auth {
            AuthMethod::Password { password } => {
                if !password.is_encrypted && !password.is_empty() {
                    password.value = self.cipher.encrypt(&password.value)?;
                    password.is_encrypted = true;
                }
            }
            AuthMethod::PrivateKey { passphrase, .. } => {
                if !passphrase.is_encrypted && !passphrase.is_empty() {
                    passphrase.value = self.cipher.encrypt(&passphrase.value)?;
                    passphrase.is_encrypted = true;
                }
            }
            AuthMethod::Agent => {}
        }
        Ok(())
    }

    fn flush(&self) -> Result<(), StoreError> {
        let sites = self.cache.read().unwrap().clone();
        let file = VaultFile { sites };
        let json = serde_json::to_string_pretty(&file)?;
        write_atomic(&self.path, &json)?;
        Ok(())
    }
}

fn write_atomic(path: &Path, contents: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::KeyringCipher;
    use crate::model::{Protocol, SecretField, SiteProfile};

    fn test_cipher() -> Arc<dyn SecretCipher> {
        // Uses an in-memory fallback via mock-keyring feature isn't wired;
        // fall back to a fixed-key cipher for unit tests instead of hitting
        // the real OS keyring.
        struct FixedKeyCipher {
            salt: String,
        }
        impl SecretCipher for FixedKeyCipher {
            fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError> {
                crate::crypto::MasterPasswordCipher::derive("test-only", &self.salt)
                    .unwrap()
                    .encrypt(plaintext)
            }
            fn decrypt(&self, ciphertext_b64: &str) -> Result<String, CryptoError> {
                crate::crypto::MasterPasswordCipher::derive("test-only", &self.salt)
                    .unwrap()
                    .decrypt(ciphertext_b64)
            }
        }
        let _ = KeyringCipher::load_or_init; // keep import used in non-test builds
        // Fixed (not random) so re-opening the store in a test with a fresh
        // `test_cipher()` call derives the same key, mirroring how a real
        // deployment persists its salt/key across app restarts.
        let salt = "dGVzdC1zYWx0LTE2Ynl0ZQ==".to_string();
        Arc::new(FixedKeyCipher { salt })
    }

    #[test]
    fn upsert_encrypts_and_roundtrips() {
        let dir = tempfile::tempdir().unwrap();
        let store = SiteStore::open_at(dir.path().join("sites.json"), test_cipher()).unwrap();

        let profile = SiteProfile::new_quick_connect(
            Protocol::Sftp,
            "example.com".into(),
            22,
            "alice".into(),
            AuthMethod::Password { password: SecretField::plaintext("hunter2") },
        );
        let id = profile.id.clone();
        store.upsert(profile).unwrap();

        // Encrypted on disk.
        let stored = store.get(&id).unwrap();
        match &stored.auth {
            AuthMethod::Password { password } => {
                assert!(password.is_encrypted);
                assert_ne!(password.value, "hunter2");
            }
            _ => panic!("wrong auth variant"),
        }

        // Reload from disk into a fresh store to prove persistence.
        let reopened = SiteStore::open_at(dir.path().join("sites.json"), test_cipher()).unwrap();
        let decrypted = reopened.decrypt_secrets(&reopened.get(&id).unwrap()).unwrap();
        match decrypted.auth {
            AuthMethod::Password { password } => assert_eq!(password.value, "hunter2"),
            _ => panic!("wrong auth variant"),
        }
    }

    #[test]
    fn delete_removes_profile() {
        let dir = tempfile::tempdir().unwrap();
        let store = SiteStore::open_at(dir.path().join("sites.json"), test_cipher()).unwrap();
        let profile = SiteProfile::new_quick_connect(
            Protocol::Ftp,
            "ftp.example.com".into(),
            21,
            "bob".into(),
            AuthMethod::Agent,
        );
        let id = profile.id.clone();
        store.upsert(profile).unwrap();
        assert!(store.get(&id).is_ok());
        store.delete(&id).unwrap();
        assert!(store.get(&id).is_err());
    }
}
