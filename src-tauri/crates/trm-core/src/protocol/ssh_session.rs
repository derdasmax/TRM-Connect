//! Shared SSH transport (connect + authenticate) used by both the SFTP and
//! SCP clients, since both ride the same SSH connection.

use crate::model::{AuthMethod, SiteProfile};
use crate::protocol::ProtocolError;
use russh::client::{self, AuthResult};
use russh::keys::{HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate, load_secret_key};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Result of a host key check performed during the handshake, surfaced back
/// to the caller so the UI can show a TOFU prompt on first connect or a
/// scary warning on mismatch.
#[derive(Debug, Clone)]
pub struct HostKeyOutcome {
    pub fingerprint: String,
    pub matched_pinned: Option<bool>,
}

pub struct SshHandler {
    verify: bool,
    expected_fingerprint: Option<String>,
    observed: Arc<Mutex<Option<HostKeyOutcome>>>,
}

impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let key_data = match server_public_key {
            PublicKeyOrCertificate::PublicKey { key, .. } => key.key_data(),
            PublicKeyOrCertificate::Certificate(cert) => cert.public_key(),
        };
        let fingerprint = key_data.fingerprint(HashAlg::Sha256).to_string();

        let matched_pinned = self.expected_fingerprint.as_ref().map(|exp| exp == &fingerprint);
        *self.observed.lock().unwrap() =
            Some(HostKeyOutcome { fingerprint: fingerprint.clone(), matched_pinned });

        if !self.verify {
            return Ok(true);
        }
        match matched_pinned {
            // No pin yet: accept (trust-on-first-use). The caller is
            // responsible for persisting `fingerprint` onto the profile.
            None => Ok(true),
            Some(true) => Ok(true),
            Some(false) => Ok(false),
        }
    }
}

pub struct SshConnection {
    pub handle: client::Handle<SshHandler>,
    pub host_key: HostKeyOutcome,
}

pub(crate) type Handler = SshHandler;

/// Opens an SSH connection and authenticates using the profile's configured
/// method (password, private key, or SSH agent). Used for both SFTP and SCP.
pub async fn connect(profile: &SiteProfile) -> Result<SshConnection, ProtocolError> {
    let observed = Arc::new(Mutex::new(None));
    let handler = SshHandler {
        verify: profile.verify_host_key,
        expected_fingerprint: profile.pinned_host_key_fingerprint.clone(),
        observed: observed.clone(),
    };

    let config = client::Config {
        inactivity_timeout: Some(Duration::from_secs(60)),
        ..Default::default()
    };

    let addr = (profile.host.as_str(), profile.port);
    let mut handle = tokio::time::timeout(
        Duration::from_secs(profile.connect_timeout_secs as u64),
        client::connect(Arc::new(config), addr, handler),
    )
    .await
    .map_err(|_| ProtocolError::Connect("connection timed out".into()))?
    .map_err(|e| ProtocolError::Connect(e.to_string()))?;

    let host_key = observed
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| ProtocolError::HostKey("server never presented a host key".into()))?;

    if profile.verify_host_key && host_key.matched_pinned == Some(false) {
        return Err(ProtocolError::HostKey(format!(
            "host key mismatch: expected {:?}, got {}. This may indicate a man-in-the-middle attack.",
            profile.pinned_host_key_fingerprint, host_key.fingerprint
        )));
    }

    authenticate(&mut handle, profile).await?;

    Ok(SshConnection { handle, host_key })
}

async fn authenticate(
    handle: &mut client::Handle<SshHandler>,
    profile: &SiteProfile,
) -> Result<(), ProtocolError> {
    let result = match &profile.auth {
        AuthMethod::Password { password } => handle
            .authenticate_password(&profile.username, &password.value)
            .await
            .map_err(|e| ProtocolError::Auth(e.to_string()))?,
        AuthMethod::PrivateKey { key_path, passphrase } => {
            let pass = if passphrase.is_empty() { None } else { Some(passphrase.value.as_str()) };
            let key = load_secret_key(key_path, pass)
                .map_err(|e| ProtocolError::Auth(format!("failed to load private key: {e}")))?;
            let hash_alg = handle.best_supported_rsa_hash().await.ok().flatten().flatten();
            let key_with_alg = PrivateKeyWithHashAlg::new(Arc::new(key), hash_alg);
            handle
                .authenticate_publickey(&profile.username, key_with_alg)
                .await
                .map_err(|e| ProtocolError::Auth(e.to_string()))?
        }
        AuthMethod::Agent => {
            return Err(ProtocolError::Auth(
                "SSH agent authentication is not yet implemented".into(),
            ));
        }
    };

    match result {
        AuthResult::Success => Ok(()),
        AuthResult::Failure { .. } => {
            Err(ProtocolError::Auth("server rejected the supplied credentials".into()))
        }
    }
}
