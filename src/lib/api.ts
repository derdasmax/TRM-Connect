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
  remoteRename: (connectionId: string, from: string, to: string) =>
    invoke<void>("remote_rename", { connectionId, from, to }),
  remoteChmod: (connectionId: string, path: string, mode: number) =>
    invoke<void>("remote_chmod", { connectionId, path, mode }),

  // -- Local browsing ----------------------------------------------------
  listLocalDir: (path: string) => invoke<DirEntry[]>("list_local_dir", { path }),
  localMkdir: (path: string) => invoke<void>("local_mkdir", { path }),
  localRemoveFile: (path: string) => invoke<void>("local_remove_file", { path }),
  localRemoveDir: (path: string) => invoke<void>("local_remove_dir", { path }),
  localRename: (from: string, to: string) => invoke<void>("local_rename", { from, to }),
  localHomeDir: () => invoke<string>("local_home_dir"),

  // -- Transfers -----------------------------------------------------
  enqueueUpload: (connectionId: string, localPath: string, remotePath: string) =>
    invoke<string>("enqueue_upload", { connectionId, localPath, remotePath }),
  enqueueDownload: (connectionId: string, remotePath: string, localPath: string) =>
    invoke<string>("enqueue_download", { connectionId, remotePath, localPath }),
  listTransfers: () => invoke<TransferTask[]>("list_transfers"),
  pauseTransfer: (taskId: string) => invoke<void>("pause_transfer", { taskId }),
  resumeTransfer: (taskId: string) => invoke<void>("resume_transfer", { taskId }),
  cancelTransfer: (taskId: string) => invoke<void>("cancel_transfer", { taskId }),
  pauseAllTransfers: () => invoke<void>("pause_all_transfers"),
  resumeAllTransfers: () => invoke<void>("resume_all_transfers"),
  cancelAllTransfers: () => invoke<void>("cancel_all_transfers"),
};

/** True when running inside the Tauri shell; false in a plain browser tab. */
export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
