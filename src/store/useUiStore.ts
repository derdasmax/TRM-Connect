import { create } from "zustand";

/** Transient, non-persisted global UI state - things like "is a modal open"
 *  that any tab's toolbar can trigger but that only ever has one instance
 *  app-wide (so it lives outside any per-tab component). */
interface UiState {
  settingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsModalOpen: false,
  openSettingsModal: () => set({ settingsModalOpen: true }),
  closeSettingsModal: () => set({ settingsModalOpen: false }),
}));
