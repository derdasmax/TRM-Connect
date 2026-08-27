//! SCP client.
//!
//! The legacy `scp` wire protocol only knows how to stream a single file or
//! directory tree - it has no "list directory" or "remove" primitives. To
//! give SCP-only servers the same file-manager experience as SFTP, browsing
//! and management operations are implemented by executing POSIX shell
//! commands (`ls`, `mkdir`, `rm`, `mv`, `chmod`, `readlink`) over an SSH
//! `exec` channel, the same approach WinSCP itself falls back to in "SCP"
//! session mode. This requires a POSIX shell and coreutils on the remote
//! host; servers that don't provide one should be accessed over SFTP
//! instead.
//!
//! Actual file transfer uses the real SCP protocol (`scp -f` / `scp -t`).

use crate::model::{DirEntry, Protocol, SiteProfile, TransferMode};
use crate::protocol::ssh_session::{self, HostKeyOutcome};
use crate::protocol::{FileTransferClient, ProtocolError, TransferControl, CHUNK_SIZE};
use async_trait::async_trait;
use chrono::{DateTime, Utc};
use russh::client::Handle;
use russh::{ChannelMsg, Disconnect};
use std::path::Path;
use tokio::fs::File as LocalFile;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub struct ScpClient {
    ssh: Handle<ssh_session::Handler>,
    pub host_key: HostKeyOutcome,
}

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

async fn exec_capture(
    ssh: &Handle<ssh_session::Handler>,
    command: &str,
) -> Result<(Vec<u8>, Option<u32>), ProtocolError> {
    let mut channel = ssh
        .channel_open_session()
        .await
        .map_err(|e| ProtocolError::Connect(e.to_string()))?;
    channel
        .exec(true, command.as_bytes())
        .await
        .map_err(|e| ProtocolError::Remote(e.to_string()))?;

    let mut stdout = Vec::new();
    let mut exit_status = None;
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) => stdout.extend_from_slice(&data),
            Some(ChannelMsg::ExtendedData { .. }) => {}
            Some(ChannelMsg::ExitStatus { exit_status: code }) => exit_status = Some(code),
            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
            _ => {}
        }
    }
    Ok((stdout, exit_status))
}

async fn exec_ok(ssh: &Handle<ssh_session::Handler>, command: &str) -> Result<(), ProtocolError> {
    let (out, status) = exec_capture(ssh, command).await?;
    match status {
        Some(0) => Ok(()),
        _ => Err(ProtocolError::Remote(format!(
            "remote command failed: {}",
            String::from_utf8_lossy(&out).trim()
        ))),
    }
}

/// Parses a line of `ls -la --time-style=full-iso` output into a [`DirEntry`].
/// Returns `None` for lines that aren't regular entries (e.g. the leading
/// `total N` line, or `.`/`..`).
fn parse_ls_line(base: &str, line: &str) -> Option<DirEntry> {
    // Example:
    // -rw-r--r-- 1 alice alice 1234 2024-05-01 12:00:00.000000000 +0000 file.txt
    // lrwxrwxrwx 1 alice alice    5 2024-05-01 12:00:00.000000000 +0000 link -> target
    let mut parts = line.splitn(9, char::is_whitespace).filter(|s| !s.is_empty());
    // splitn on whitespace doesn't collapse repeated spaces well; re-tokenize properly below.
    let tokens: Vec<&str> = line.split_whitespace().collect();
    if tokens.len() < 8 {
        return None;
    }
    let perms_field = tokens[0];
    if perms_field == "total" || perms_field.len() < 10 {
        return None;
    }
    let file_type = perms_field.chars().next().unwrap_or('-');
    let is_dir = file_type == 'd';
    let is_symlink = file_type == 'l';
    let owner = tokens[2].to_string();
    let group = tokens[3].to_string();
    let size: u64 = tokens[4].parse().unwrap_or(0);
    let date = tokens[5];
    let time = tokens[6];
    // tokens[7] is the UTC offset from --time-style=full-iso; tokens[8..] is the name.
    let name_start = line.find(tokens[8]).unwrap_or(0);
    let mut rest = line[name_start..].to_string();
    let mut symlink_target = None;
    if is_symlink {
        if let Some(idx) = rest.find(" -> ") {
            symlink_target = Some(rest[idx + 4..].to_string());
            rest.truncate(idx);
        }
    }
    let name = rest;
    if name == "." || name == ".." {
        return None;
    }
    let modified = chrono::NaiveDateTime::parse_from_str(
        &format!("{date} {}", &time[..time.len().min(8)]),
        "%Y-%m-%d %H:%M:%S",
    )
    .ok()
    .map(|dt| DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc));
    let permissions = unix_perm_string_to_mode(perms_field);
    let path = if base.ends_with('/') { format!("{base}{name}") } else { format!("{base}/{name}") };
    let _ = &mut parts; // silence unused warning from the exploratory splitn above
    Some(DirEntry {
        name,
        path,
        is_dir,
        is_symlink,
        symlink_target,
        size,
        modified,
        permissions,
        owner: Some(owner),
        group: Some(group),
    })
}

fn unix_perm_string_to_mode(perms: &str) -> Option<u32> {
    if perms.len() != 10 {
        return None;
    }
    let bytes = perms.as_bytes();
    let mut mode = 0u32;
    let flags = [
        (1, b'r', 0o400), (2, b'w', 0o200), (3, b'x', 0o100),
        (4, b'r', 0o040), (5, b'w', 0o020), (6, b'x', 0o010),
        (7, b'r', 0o004), (8, b'w', 0o002), (9, b'x', 0o001),
    ];
    for (idx, ch, bit) in flags {
        if bytes.get(idx).copied() == Some(ch) || bytes.get(idx).copied() == Some(b's') || bytes.get(idx).copied() == Some(b't') {
            mode |= bit;
        }
    }
    Some(mode)
}

impl ScpClient {
    pub async fn connect(profile: &SiteProfile) -> Result<Self, ProtocolError> {
        debug_assert!(matches!(profile.protocol, Protocol::Scp));
        let ssh_session::SshConnection { handle, host_key } = ssh_session::connect(profile).await?;
        Ok(Self { ssh: handle, host_key })
    }
}

#[async_trait]
impl FileTransferClient for ScpClient {
    async fn list_dir(&mut self, path: &str) -> Result<Vec<DirEntry>, ProtocolError> {
        let cmd = format!("ls -la --time-style=full-iso -- {}", shell_quote(path));
        let (out, status) = exec_capture(&self.ssh, &cmd).await?;
        if status != Some(0) {
            return Err(ProtocolError::Remote(format!(
                "failed to list {path}: {}",
                String::from_utf8_lossy(&out).trim()
            )));
        }
        let text = String::from_utf8_lossy(&out);
        Ok(text.lines().filter_map(|l| parse_ls_line(path, l)).collect())
    }

    async fn stat(&mut self, path: &str) -> Result<DirEntry, ProtocolError> {
        let parent = path.rsplit_once('/').map(|(p, _)| p).unwrap_or("/");
        let name = path.rsplit('/').next().unwrap_or(path);
        let cmd = format!(
            "ls -lad --time-style=full-iso -- {} | grep -F -- {}",
            shell_quote(path),
            shell_quote(name)
        );
        let (out, _status) = exec_capture(&self.ssh, &cmd).await?;
        let text = String::from_utf8_lossy(&out);
        text.lines()
            .find_map(|l| parse_ls_line(parent, l))
            .ok_or_else(|| ProtocolError::Remote(format!("no such file or directory: {path}")))
    }

    async fn canonicalize(&mut self, path: &str) -> Result<String, ProtocolError> {
        let cmd = format!("readlink -f -- {} || echo {}", shell_quote(path), shell_quote(path));
        let (out, _) = exec_capture(&self.ssh, &cmd).await?;
        Ok(String::from_utf8_lossy(&out).trim().to_string())
    }

    async fn mkdir(&mut self, path: &str) -> Result<(), ProtocolError> {
        exec_ok(&self.ssh, &format!("mkdir -p -- {}", shell_quote(path))).await
    }

    async fn remove_file(&mut self, path: &str) -> Result<(), ProtocolError> {
        exec_ok(&self.ssh, &format!("rm -f -- {}", shell_quote(path))).await
    }

    async fn remove_dir(&mut self, path: &str) -> Result<(), ProtocolError> {
        exec_ok(&self.ssh, &format!("rm -rf -- {}", shell_quote(path))).await
    }

    async fn rename(&mut self, from: &str, to: &str) -> Result<(), ProtocolError> {
        exec_ok(&self.ssh, &format!("mv -- {} {}", shell_quote(from), shell_quote(to))).await
    }

    async fn chmod(&mut self, path: &str, mode: u32) -> Result<(), ProtocolError> {
        exec_ok(&self.ssh, &format!("chmod {:o} -- {}", mode, shell_quote(path))).await
    }

    async fn download(
        &mut self,
        remote_path: &str,
        local_path: &Path,
        _mode: TransferMode,
        control: &mut TransferControl,
    ) -> Result<u64, ProtocolError> {
        let mut channel = self
            .ssh
            .channel_open_session()
            .await
            .map_err(|e| ProtocolError::Connect(e.to_string()))?;
        let cmd = format!("scp -f -- {}", shell_quote(remote_path));
        channel.exec(true, cmd.as_bytes()).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;

        // Kick off the exchange: send an initial ACK (0 byte) so the server
        // sends its first control line.
        channel.data(&[0u8][..]).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;

        if let Some(parent) = local_path.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }

        let mut total: u64 = 0;
        let mut pending = Vec::new();
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Data { data }) => pending.extend_from_slice(&data),
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                _ => continue,
            }

            // Parse one control line: `C<mode> <size> <name>\n`.
            let Some(nl) = pending.iter().position(|&b| b == b'\n') else { continue };
            let line = String::from_utf8_lossy(&pending[..nl]).to_string();
            pending.drain(..=nl);

            if let Some(rest) = line.strip_prefix('C') {
                let mut fields = rest.split_whitespace();
                let _mode = fields.next();
                let size: u64 = fields.next().and_then(|s| s.parse().ok()).unwrap_or(0);

                // ACK the C-line, then stream exactly `size` bytes.
                channel.data(&[0u8][..]).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
                let mut file = LocalFile::create(local_path).await?;
                let mut remaining = size;
                while remaining > 0 {
                    control.wait_if_paused().await?;
                    if pending.is_empty() {
                        match channel.wait().await {
                            Some(ChannelMsg::Data { data }) => pending.extend_from_slice(&data),
                            _ => return Err(ProtocolError::Remote("connection closed mid-transfer".into())),
                        }
                    }
                    let take = (remaining as usize).min(pending.len()).min(CHUNK_SIZE);
                    file.write_all(&pending[..take]).await?;
                    pending.drain(..take);
                    remaining -= take as u64;
                    total += take as u64;
                    let _ = control.progress_tx.send(total);
                }
                file.flush().await?;
                // Trailing status byte after file data.
                if pending.is_empty() {
                    if let Some(ChannelMsg::Data { data }) = channel.wait().await {
                        pending.extend_from_slice(&data);
                    }
                }
                if !pending.is_empty() {
                    pending.remove(0);
                }
                channel.data(&[0u8][..]).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
                break;
            } else if line.starts_with('E') || line.is_empty() {
                break;
            }
        }

        channel
            .close()
            .await
            .map_err(|e| ProtocolError::Remote(e.to_string()))?;
        Ok(total)
    }

    async fn upload(
        &mut self,
        local_path: &Path,
        remote_path: &str,
        _mode: TransferMode,
        control: &mut TransferControl,
    ) -> Result<u64, ProtocolError> {
        let metadata = tokio::fs::metadata(local_path).await?;
        let size = metadata.len();
        let file_name = local_path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| ProtocolError::Remote("invalid local file name".into()))?;
        let remote_dir = remote_path.rsplit_once('/').map(|(d, _)| d).unwrap_or(".");

        let mut channel = self
            .ssh
            .channel_open_session()
            .await
            .map_err(|e| ProtocolError::Connect(e.to_string()))?;
        let cmd = format!("scp -t -- {}", shell_quote(remote_dir));
        channel.exec(true, cmd.as_bytes()).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;

        // Wait for initial ACK from the server before sending the C-line.
        wait_for_ack(&mut channel).await?;

        let header = format!("C0644 {size} {file_name}\n");
        channel.data(header.as_bytes()).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
        wait_for_ack(&mut channel).await?;

        let mut local = LocalFile::open(local_path).await?;
        let mut buf = vec![0u8; CHUNK_SIZE];
        let mut total: u64 = 0;
        loop {
            control.wait_if_paused().await?;
            let n = local.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            channel.data(&buf[..n]).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
            total += n as u64;
            let _ = control.progress_tx.send(total);
        }
        // Trailing status byte.
        channel.data(&[0u8][..]).await.map_err(|e| ProtocolError::Remote(e.to_string()))?;
        wait_for_ack(&mut channel).await?;

        channel
            .close()
            .await
            .map_err(|e| ProtocolError::Remote(e.to_string()))?;
        Ok(total)
    }

    async fn disconnect(&mut self) -> Result<(), ProtocolError> {
        self.ssh
            .disconnect(Disconnect::ByApplication, "", "en")
            .await
            .map_err(|e| ProtocolError::Remote(e.to_string()))
    }

    fn host_key(&self) -> Option<(&str, Option<bool>)> {
        Some((self.host_key.fingerprint.as_str(), self.host_key.matched_pinned))
    }
}

async fn wait_for_ack(channel: &mut russh::Channel<russh::client::Msg>) -> Result<(), ProtocolError> {
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) if !data.is_empty() => {
                return if data[0] == 0 {
                    Ok(())
                } else {
                    Err(ProtocolError::Remote("scp: remote rejected transfer".into()))
                };
            }
            Some(ChannelMsg::Data { .. }) => continue,
            Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => {
                return Err(ProtocolError::Remote("scp: connection closed unexpectedly".into()));
            }
            _ => continue,
        }
    }
}
