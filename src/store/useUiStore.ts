import { create } from "zustand";
import type { SiteProfile } from "../lib/types";

/** The actions the Command Palette (or anything else global) can perform
 *  "on the current tab" - registered by whichever ConnectionWorkspace is
 *  currently active, since those actions live inside that per-tab
 *  component instance, not in any global store. */
export interface ActiveWorkspaceActions {
  openQuickConnect: () => void;
  openSiteManager: () => void;
  disconnect: () => void;
  connectToSite: (site: SiteProfile, path?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  connected: boolean;
}

/** Transient, non-persisted global UI state - things like "is a modal open"
 *  that any tab's toolbar can trigger but that only ever has one instance
 *  app-wide (so it lives outside any per-tab component). */
export type SettingsSection = "appearance" | "transfers" | "updates" | "storage" | "about";

interface UiState {
  settingsModalOpen: boolean;
  /** Which Settings nav section to land on next time it opens - set by
   *  `openSettingsModal("updates")` (e.g. from the titlebar update pill or
   *  Command Palette) and consumed once by SettingsModal's own `open` effect. */
  settingsInitialSection: SettingsSection;
  openSettingsModal: (section?: SettingsSection) => void;
  closeSettingsModal: () => void;
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  historyModalOpen: boolean;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  activeWorkspaceActions: ActiveWorkspaceActions | null;
  setActiveWorkspaceActions: (actions: ActiveWorkspaceActions | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsModalOpen: false,
  settingsInitialSection: "appearance",
  openSettingsModal: (section) => set({ settingsModalOpen: true, settingsInitialSection: section ?? "appearance" }),
  closeSettingsModal: () => set({ settingsModalOpen: false }),
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  historyModalOpen: false,
  openHistoryModal: () => set({ historyModalOpen: true }),
  closeHistoryModal: () => set({ historyModalOpen: false }),
  activeWorkspaceActions: null,
  setActiveWorkspaceActions: (actions) => set({ activeWorkspaceActions: actions }),
}));
