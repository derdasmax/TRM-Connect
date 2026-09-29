import { invoke } from "@tauri-apps/api/core";
import type { ConnectionInfo, DirEntry, SiteProfile, TransferTask } from "./types";

// Thin, typed wrappers around the Tauri commands in src-tauri/src/commands.
// Every function name matches its #[tauri::command] counterpart 1:1.

export const api = {
  // -- Site Manager --------------------------------------------------
  listSites: () => invoke<SiteProfile[]>("list_sites"),
  saveSite: (profile: SiteProfile) => invoke<SiteProfile>("save_site", { profile }),
  deleteSite: (id: string) => invoke<void>("delete_site", { id }),

  // -- Connections -----------------------------------------------------
  connectSavedSite: (siteId: string) => invoke<ConnectionInfo>("connect_saved_site", { siteId }),
  quickConnect: (profile: SiteProfile) => invoke<ConnectionInfo>("quick_connect", { profile }),
  disconnect: (connectionId: string) => invoke<void>("disconnect", { connectionId }),
  /** TCP-connect latency to host:port in ms; rejects if unreachable/timed out. */
  pingSite: (host: string, port: number) => invoke<number>("ping_site", { host, port }),

  // -- Portable mode -------------------------------------------------
  isPortableMode: () => invoke<boolean>("is_portable_mode"),
  /** Migrates the saved-site vault to/from the portable data folder and
   *  restarts the app; the returned promise only resolves on failure, since
   *  a successful call ends with the process restarting. */
  setPortableMode: (enabled: boolean) => invoke<void>("set_portable_mode", { enabled }),

  // -- Remote browsing ---------------------------------------------------
  listRemoteDir: (connectionId: string, path: string) =>
    invoke<DirEntry[]>("list_remote_dir", { connectionId, path }),
  remoteCanonicalize: (connectionId: string, path: string) =>
    invoke<string>("remote_canonicalize", { connectionId, path }),
  remoteMkdir: (connectionId: string, path: string) => invoke<void>("remote_mkdir", { connectionId, path }),
  remoteRemoveFile: (connectionId: string, path: string) =>
    invoke<void>("remote_remove_file", { connectionId, path }),
  remoteRemoveDir: (connectionId: string, path: string) =>
    invoke<void>("remote_remove_dir", { connectionId, path }),
  remoteRemoveEmptyDir: (connectionId: string, path: string) =>
    invoke<void>("remote_remove_empty_dir", { connectionId, path }),
  remoteRename: (connectionId: string, from: string, to: string) =>
    invoke<void>("remote_rename", { connectionId, from, to }),
  remoteChmod: (connectionId: string, path: string, mode: number) =>
    invoke<void>("remote_chmod", { connectionId, path, mode }),
  remoteStat: (connectionId: string, path: string) =>
    invoke<DirEntry | null>("remote_stat", { connectionId, path }),
  quickLookRemote: (connectionId: string, path: string, size: number) =>
    invoke<string>("quick_look_remote", { connectionId, path, size }),
  readTextPreview: (path: string, maxBytes: number) =>
    invoke<string>("read_text_preview", { path, maxBytes }),
  writeTextFile: (path: string, contents: string) => invoke<void>("write_text_file", { path, contents }),
  quickLookSaveRemote: (connectionId: string, localPath: string, remotePath: string) =>
    invoke<void>("quick_look_save_remote", { connectionId, localPath, remotePath }),

  // -- Local browsing ----------------------------------------------------
  listLocalDir: (path: string) => invoke<DirEntry[]>("list_local_dir", { path }),
  localMkdir: (path: string) => invoke<void>("local_mkdir", { path }),
  localRemoveFile: (path: string) => invoke<void>("local_remove_file", { path }),
  localRemoveDir: (path: string) => invoke<void>("local_remove_dir", { path }),
  localRemoveEmptyDir: (path: string) => invoke<void>("local_remove_empty_dir", { path }),
  localRename: (from: string, to: string) => invoke<void>("local_rename", { from, to }),
  localHomeDir: () => invoke<string>("local_home_dir"),
  localStat: (path: string) => invoke<DirEntry | null>("local_stat", { path }),

  // -- Transfers -----------------------------------------------------
  enqueueUpload: (
    connectionId: string,
    localPath: string,
    remotePath: string,
    speedLimitBps?: number,
    verifyChecksum?: boolean,
  ) => invoke<string>("enqueue_upload", { connectionId, localPath, remotePath, speedLimitBps, verifyChecksum }),
  enqueueDownload: (
    connectionId: string,
    remotePath: string,
    localPath: string,
    speedLimitBps?: number,
    verifyChecksum?: boolean,
  ) => invoke<string>("enqueue_download", { connectionId, remotePath, localPath, speedLimitBps, verifyChecksum }),
  listTransfers: () => invoke<TransferTask[]>("list_transfers"),
  pauseTransfer: (taskId: string) => invoke<void>("pause_transfer", { taskId }),
  resumeTransfer: (taskId: string) => invoke<void>("resume_transfer", { taskId }),
  cancelTransfer: (taskId: string) => invoke<void>("cancel_transfer", { taskId }),
  pauseAllTransfers: () => invoke<void>("pause_all_transfers"),
  resumeAllTransfers: () => invoke<void>("resume_all_transfers"),
  cancelAllTransfers: () => invoke<void>("cancel_all_transfers"),
  reorderTransfer: (taskId: string, newIndex: number) => invoke<void>("reorder_transfer", { taskId, newIndex }),
  prioritizeTransfer: (taskId: string) => invoke<void>("prioritize_transfer", { taskId }),
  setGlobalBandwidthLimit: (bytesPerSec: number) =>
    invoke<void>("set_global_bandwidth_limit", { bytesPerSec }),
  setTransferBandwidthLimit: (taskId: string, bytesPerSec: number) =>
    invoke<void>("set_transfer_bandwidth_limit", { taskId, bytesPerSec }),
};

/** True when running inside the Tauri shell; false in a plain browser tab. */
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
