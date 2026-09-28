import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SessionState {
  lastLocalPath: string | null;
  lastSiteId: string | null;
  lastRemoteDir: string | null;
  setLastLocalPath: (path: string) => void;
  setLastSite: (siteId: string | null, remoteDir: string | null) => void;
  setLastRemoteDir: (remoteDir: string) => void;
}

/** Persists the last local path and the last saved site connected to, so the
 *  app can offer to restore them after a restart. Reconnecting is always an
 *  explicit, dismissible choice - never automatic - since silently
 *  re-authenticating on launch would be surprising. */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      lastLocalPath: null,
      lastSiteId: null,
      lastRemoteDir: null,
      setLastLocalPath: (lastLocalPath) => set({ lastLocalPath }),
      setLastSite: (lastSiteId, lastRemoteDir) => set({ lastSiteId, lastRemoteDir }),
      setLastRemoteDir: (lastRemoteDir) => set({ lastRemoteDir }),
    }),
    { name: "trm-connect.session" },
  ),
);
