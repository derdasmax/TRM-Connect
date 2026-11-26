import { create } from "zustand";
import { checkForUpdate, relaunch, type Update } from "../lib/updater";
import { friendlyMessage } from "../lib/friendlyError";

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "up-to-date" | "error";

interface UpdateState {
  status: UpdateStatus;
  version: string | null;
  releaseNotes: string | null;
  /** 0-100, only meaningful while `status === "downloading"`. */
  downloadProgress: number;
  errorMessage: string | null;
  /** The live `Update` handle from the last successful check - kept around
   *  only so `downloadAndInstall` can be called on it later; never read by
   *  the UI directly. */
  _update: Update | null;
  check: () => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  relaunch: () => Promise<void>;
  reset: () => void;
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  status: "idle",
  version: null,
  releaseNotes: null,
  downloadProgress: 0,
  errorMessage: null,
  _update: null,

  check: async () => {
    set({ status: "checking", errorMessage: null });
    try {
      const update = await checkForUpdate();
      if (update) {
        set({ status: "available", version: update.version, releaseNotes: update.body ?? null, _update: update });
      } else {
        set({ status: "up-to-date", _update: null });
      }
    } catch (e) {
      set({ status: "error", errorMessage: friendlyMessage(String(e)) });
    }
  },

  downloadAndInstall: async () => {
    const update = get()._update;
    if (!update) return;
    set({ status: "downloading", downloadProgress: 0 });
    let contentLength = 0;
    let downloaded = 0;
    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              set({ downloadProgress: Math.min(100, Math.round((downloaded / contentLength) * 100)) });
            }
            break;
          case "Finished":
            set({ downloadProgress: 100 });
            break;
        }
      });
      set({ status: "ready" });
    } catch (e) {
      set({ status: "error", errorMessage: friendlyMessage(String(e)) });
    }
  },

  relaunch: async () => {
    await relaunch();
  },

  reset: () => set({ status: "idle", version: null, releaseNotes: null, downloadProgress: 0, errorMessage: null, _update: null }),
}));
