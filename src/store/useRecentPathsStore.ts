import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_PATHS_PER_SITE = 8;

interface RecentPathsState {
  /** Most-recently-visited remote directory first, per saved site id. */
  bySite: Record<string, string[]>;
  recordVisit: (siteId: string, path: string) => void;
}

/** Feeds the Command Palette's "global search" - jumping straight to a
 *  directory you've browsed before on a given site, not just reconnecting
 *  to its root. Deliberately keyed by saved site id only: quick-connect
 *  sessions have no stable identity to remember paths against. */
export const useRecentPathsStore = create<RecentPathsState>()(
  persist(
    (set) => ({
      bySite: {},
      recordVisit: (siteId, path) =>
        set((state) => {
          const existing = state.bySite[siteId] ?? [];
          if (existing[0] === path) return state;
          const next = [path, ...existing.filter((p) => p !== path)].slice(0, MAX_PATHS_PER_SITE);
          return { bySite: { ...state.bySite, [siteId]: next } };
        }),
    }),
    { name: "trm-connect.recent-paths" },
  ),
);
