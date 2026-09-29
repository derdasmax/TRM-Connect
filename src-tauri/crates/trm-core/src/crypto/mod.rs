//! Secret encryption for stored site profiles.
//!
//! Two interchangeable backends implement [`SecretCipher`]:
//!
//! - [`KeyringCipher`] (default): a random AES-256 key is generated once and
//!   stored in the OS credential store (Windows Credential Manager / DPAPI,
//!   macOS Keychain, or the Linux Secret Service). The user is never
//!   prompted; secrets can only be decrypted on the same machine/user
//!   account, which mirrors what WinSCP gets from DPAPI.
//! - [`MasterPasswordCipher`]: the key is derived with Argon2id from a
//!   user-chosen master password plus a random salt stored alongside the
//!   vault. The user must enter the master password once per app launch.
//!
//! Both use AES-256-GCM for authenticated encryption.

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
use argon2::Argon2;
use base64::Engine;
use thiserror::Error;

const KEYRING_SERVICE: &str = "TRM-Connect";
const KEYRING_ACCOUNT: &str = "vault-master-key";
const NONCE_LEN: usize = 12;
const SALT_LEN: usize = 16;

#[derive(Debug, Error)]
pub enum CryptoError {
    #[error("encryption failed")]
    Encrypt,
    #[error("decryption failed: data may be corrupt or from a different machine/master password")]
    Decrypt,
    #[error("OS keyring error: {0}")]
    Keyring(String),
    #[error("invalid ciphertext encoding")]
    Encoding,
    #[error("system random number generator failed: {0}")]
    Rng(String),
}

fn random_bytes<const N: usize>() -> Result<[u8; N], CryptoError> {
    let mut buf = [0u8; N];
    getrandom::fill(&mut buf).map_err(|e| CryptoError::Rng(e.to_string()))?;
    Ok(buf)
}

pub trait SecretCipher: Send + Sync {
    fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError>;
    fn decrypt(&self, ciphertext_b64: &str) -> Result<String, CryptoError>;
}

fn aes_encrypt(key_bytes: &[u8; 32], plaintext: &str) -> Result<String, CryptoError> {
    let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(*key_bytes));
    let nonce_bytes: [u8; NONCE_LEN] = random_bytes()?;
    let nonce = Nonce::from(nonce_bytes);
    let ct = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|_| CryptoError::Encrypt)?;
    let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(base64::engine::general_purpose::STANDARD.encode(out))
}

fn aes_decrypt(key_bytes: &[u8; 32], ciphertext_b64: &str) -> Result<String, CryptoError> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(ciphertext_b64)
        .map_err(|_| CryptoError::Encoding)?;
    if raw.len() < NONCE_LEN {
        return Err(CryptoError::Encoding);
    }
    let (nonce_bytes, ct) = raw.split_at(NONCE_LEN);
    let nonce_bytes: [u8; NONCE_LEN] = nonce_bytes.try_into().map_err(|_| CryptoError::Encoding)?;
    let cipher = Aes256Gcm::new(&Key::<Aes256Gcm>::from(*key_bytes));
    let pt = cipher
        .decrypt(&Nonce::from(nonce_bytes), ct)
        .map_err(|_| CryptoError::Decrypt)?;
    String::from_utf8(pt).map_err(|_| CryptoError::Decrypt)
}

/// Default backend: a random per-install key held in the OS credential
/// store (DPAPI-backed on Windows).
pub struct KeyringCipher {
    key: [u8; 32],
}

impl KeyringCipher {
    /// Loads the existing vault key from the OS keyring, or generates and
    /// stores a new random one on first run.
    pub fn load_or_init() -> Result<Self, CryptoError> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
            .map_err(|e| CryptoError::Keyring(e.to_string()))?;

        match entry.get_password() {
            Ok(existing) => {
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(existing)
                    .map_err(|_| CryptoError::Encoding)?;
                let key: [u8; 32] = bytes.try_into().map_err(|_| CryptoError::Encoding)?;
                Ok(Self { key })
            }
            Err(keyring::Error::NoEntry) => {
                let key: [u8; 32] = random_bytes()?;
                let encoded = base64::engine::general_purpose::STANDARD.encode(key);
                entry
                    .set_password(&encoded)
                    .map_err(|e| CryptoError::Keyring(e.to_string()))?;
                Ok(Self { key })
            }
            Err(e) => Err(CryptoError::Keyring(e.to_string())),
        }
    }
}

impl SecretCipher for KeyringCipher {
    fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError> {
        aes_encrypt(&self.key, plaintext)
    }

    fn decrypt(&self, ciphertext_b64: &str) -> Result<String, CryptoError> {
        aes_decrypt(&self.key, ciphertext_b64)
    }
}

/// Portable-mode backend: a random per-install key stored in a plain file
/// next to the vault instead of the OS keyring, so the whole data folder
/// (`sites.json` + this key file) can be copied to another machine - or
/// carried on a USB stick - and just keep working, unlike `KeyringCipher`'s
/// key, which DPAPI/Keychain/Secret Service ties to one machine and user.
/// This is strictly weaker than `KeyringCipher`: anyone with file access to
/// the folder can decrypt every saved secret. That's the same tradeoff
/// WinSCP's own portable/INI storage mode makes, not a bug - portability and
/// OS-backed protection are mutually exclusive.
pub struct FileKeyCipher {
    key: [u8; 32],
}

impl FileKeyCipher {
    /// Loads the key from `key_path`, or generates and writes a new random
    /// one on first run.
    pub fn load_or_init(key_path: &std::path::Path) -> Result<Self, CryptoError> {
        if let Some(parent) = key_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| CryptoError::Keyring(e.to_string()))?;
        }
        if key_path.exists() {
            let encoded =
                std::fs::read_to_string(key_path).map_err(|e| CryptoError::Keyring(e.to_string()))?;
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded.trim())
                .map_err(|_| CryptoError::Encoding)?;
            let key: [u8; 32] = bytes.try_into().map_err(|_| CryptoError::Encoding)?;
            Ok(Self { key })
        } else {
            let key: [u8; 32] = random_bytes()?;
            let encoded = base64::engine::general_purpose::STANDARD.encode(key);
            std::fs::write(key_path, encoded).map_err(|e| CryptoError::Keyring(e.to_string()))?;
            Ok(Self { key })
        }
    }
}

impl SecretCipher for FileKeyCipher {
    fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError> {
        aes_encrypt(&self.key, plaintext)
    }

    fn decrypt(&self, ciphertext_b64: &str) -> Result<String, CryptoError> {
        aes_decrypt(&self.key, ciphertext_b64)
    }
}

/// Alternative backend: key derived from a user master password via
/// Argon2id. The salt is not secret and is persisted next to the vault.
pub struct MasterPasswordCipher {
    key: [u8; 32],
}

impl MasterPasswordCipher {
    pub fn derive(master_password: &str, salt_b64: &str) -> Result<Self, CryptoError> {
        let salt = base64::engine::general_purpose::STANDARD
            .decode(salt_b64)
            .map_err(|_| CryptoError::Encoding)?;
        let mut key = [0u8; 32];
        Argon2::default()
            .hash_password_into(master_password.as_bytes(), &salt, &mut key)
            .map_err(|_| CryptoError::Encrypt)?;
        Ok(Self { key })
    }

    /// Generates a new random salt, to be persisted once alongside the vault.
    pub fn new_salt() -> Result<String, CryptoError> {
        let salt: [u8; SALT_LEN] = random_bytes()?;
        Ok(base64::engine::general_purpose::STANDARD.encode(salt))
    }
}

impl SecretCipher for MasterPasswordCipher {
    fn encrypt(&self, plaintext: &str) -> Result<String, CryptoError> {
        aes_encrypt(&self.key, plaintext)
    }

    fn decrypt(&self, ciphertext_b64: &str) -> Result<String, CryptoError> {
        aes_decrypt(&self.key, ciphertext_b64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn master_password_roundtrip() {
        let salt = MasterPasswordCipher::new_salt().unwrap();
        let cipher = MasterPasswordCipher::derive("correct horse battery staple", &salt).unwrap();
        let ct = cipher.encrypt("s3cr3t").unwrap();
        assert_ne!(ct, "s3cr3t");
        let pt = cipher.decrypt(&ct).unwrap();
        assert_eq!(pt, "s3cr3t");
    }

    #[test]
    fn wrong_master_password_fails() {
        let salt = MasterPasswordCipher::new_salt().unwrap();
        let cipher = MasterPasswordCipher::derive("right-password", &salt).unwrap();
        let ct = cipher.encrypt("s3cr3t").unwrap();

        let wrong = MasterPasswordCipher::derive("wrong-password", &salt).unwrap();
        assert!(wrong.decrypt(&ct).is_err());
    }
}
