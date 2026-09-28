// Mirrors src-tauri/crates/trm-core/src/model/mod.rs. Keep in sync by hand;
// the Rust side is the source of truth (serde `rename_all` conventions
// below match what serde_json actually produces).

export type Protocol = "sftp" | "ftp" | "ftps" | "scp";

export type FtpsMode = "explicit" | "implicit";

export interface SecretField {
  value: string;
  is_encrypted: boolean;
}

export type AuthMethod =
  | { kind: "password"; password: SecretField }
  | { kind: "private_key"; key_path: string; passphrase: SecretField }
  | { kind: "agent" };

export interface SiteProfile {
  id: string;
  name: string;
  folder: string[];
  protocol: Protocol;
  host: string;
  port: number;
  username: string;
  auth: AuthMethod;
  ftps_mode: FtpsMode;
  remote_dir: string | null;
  local_dir: string | null;
  color: string | null;
  notes: string | null;
  verify_host_key: boolean;
  pinned_host_key_fingerprint: string | null;
  passive_ftp: boolean;
  connect_timeout_secs: number;
  created_at: string;
  updated_at: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  symlink_target: string | null;
  size: number;
  modified: string | null;
  permissions: number | null;
  owner: string | null;
  group: string | null;
}

export type TransferDirection = "upload" | "download";
export type TransferStatus = "queued" | "running" | "paused" | "completed" | "failed" | "cancelled";
export type TransferMode = "auto" | "binary" | "text";
export type ChecksumStatus = "verified" | "mismatch" | "unsupported" | "error";

export interface TransferTask {
  id: string;
  connection_id: string;
  direction: TransferDirection;
  local_path: string;
  remote_path: string;
  total_bytes: number;
  transferred_bytes: number;
  status: TransferStatus;
  error: string | null;
  mode: TransferMode;
  started_at: string | null;
  updated_at: string;
  speed_limit_bps: number;
  verify_checksum: boolean;
  checksum: ChecksumStatus | null;
}

export interface ConnectionInfo {
  connection_id: string;
  protocol: Protocol;
  host_key_fingerprint: string | null;
  host_key_matched_pinned: boolean | null;
}

export interface TransferProgressEvent {
  taskId: string;
  transferredBytes: number;
  totalBytes: number;
  speedBps: number;
  etaSecs: number | null;
}

export interface TransferStatusEvent {
  taskId: string;
  status: TransferStatus;
  error: string | null;
}

export interface TransferChecksumEvent {
  taskId: string;
  checksum: ChecksumStatus;
}

export function emptySecret(): SecretField {
  return { value: "", is_encrypted: false };
}

export function newSiteProfile(): SiteProfile {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: "",
    folder: [],
    protocol: "sftp",
    host: "",
    port: 22,
    username: "",
    auth: { kind: "password", password: emptySecret() },
    ftps_mode: "explicit",
    remote_dir: null,
    local_dir: null,
    color: null,
    notes: null,
    verify_host_key: true,
    pinned_host_key_fingerprint: null,
    passive_ftp: true,
    connect_timeout_secs: 15,
    created_at: now,
    updated_at: now,
  };
}

export function defaultPortFor(protocol: Protocol): number {
  switch (protocol) {
    case "sftp":
    case "scp":
      return 22;
    case "ftp":
    case "ftps":
      return 21;
  }
}
