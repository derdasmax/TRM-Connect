import { create } from "zustand";
import { api } from "../lib/api";
import type { SiteProfile } from "../lib/types";

interface SitesState {
  sites: SiteProfile[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (profile: SiteProfile) => Promise<SiteProfile>;
  remove: (id: string) => Promise<void>;
}

export const useSitesStore = create<SitesState>((set, get) => ({
  sites: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const sites = await api.listSites();
      sites.sort((a, b) => a.name.localeCompare(b.name));
      set({ sites, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  save: async (profile) => {
    const saved = await api.saveSite(profile);
    const exists = get().sites.some((s) => s.id === saved.id);
    set({
      sites: exists
        ? get().sites.map((s) => (s.id === saved.id ? saved : s))
        : [...get().sites, saved].sort((a, b) => a.name.localeCompare(b.name)),
    });
    return saved;
  },

  remove: async (id) => {
    await api.deleteSite(id);
    set({ sites: get().sites.filter((s) => s.id !== id) });
  },
}));
