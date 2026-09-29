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
  connectToSite: (site: SiteProfile) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  connected: boolean;
}

/** Transient, non-persisted global UI state - things like "is a modal open"
 *  that any tab's toolbar can trigger but that only ever has one instance
 *  app-wide (so it lives outside any per-tab component). */
interface UiState {
  settingsModalOpen: boolean;
  openSettingsModal: () => void;
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
  openSettingsModal: () => set({ settingsModalOpen: true }),
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
