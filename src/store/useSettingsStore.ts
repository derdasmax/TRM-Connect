import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

export type ThemeMode = "dark" | "light" | "system";
export type AccentColor = "violet" | "blue" | "emerald" | "rose" | "amber" | "cyan";

interface SettingsState {
  theme: ThemeMode;
  accentColor: AccentColor;
  reduceMotion: boolean;
  transferQueueCollapsed: boolean;
  /** Bandwidth cap shared by every active transfer, in bytes/sec; 0 = unlimited. */
  globalBandwidthLimitBps: number;
  /** Default for new transfers' "verify checksum after transfer" option. */
  verifyChecksumsDefault: boolean;
  /** Whether to ask for confirmation before deleting files. Off once the user checks "don't ask again". */
  confirmBeforeDelete: boolean;
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setReduceMotion: (v: boolean) => void;
  setTransferQueueCollapsed: (v: boolean) => void;
  setGlobalBandwidthLimitBps: (v: number) => void;
  setVerifyChecksumsDefault: (v: boolean) => void;
  setConfirmBeforeDelete: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      accentColor: "violet",
      reduceMotion: false,
      transferQueueCollapsed: false,
      globalBandwidthLimitBps: 0,
      verifyChecksumsDefault: false,
      confirmBeforeDelete: true,
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setTransferQueueCollapsed: (transferQueueCollapsed) => set({ transferQueueCollapsed }),
      setGlobalBandwidthLimitBps: (globalBandwidthLimitBps) => set({ globalBandwidthLimitBps }),
      setVerifyChecksumsDefault: (verifyChecksumsDefault) => set({ verifyChecksumsDefault }),
      setConfirmBeforeDelete: (confirmBeforeDelete) => set({ confirmBeforeDelete }),
    }),
    { name: "trm-connect.settings" },
  ),
);

function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function initSettingsEffects() {
  applyTheme(useSettingsStore.getState().theme);
  document.documentElement.dataset.accent = useSettingsStore.getState().accentColor;
  document.documentElement.dataset.reduceMotion = String(useSettingsStore.getState().reduceMotion);
  void api.setGlobalBandwidthLimit(useSettingsStore.getState().globalBandwidthLimitBps).catch(() => {});

  useSettingsStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) applyTheme(state.theme);
    if (state.accentColor !== prev.accentColor) {
      document.documentElement.dataset.accent = state.accentColor;
    }
    if (state.reduceMotion !== prev.reduceMotion) {
      document.documentElement.dataset.reduceMotion = String(state.reduceMotion);
    }
    if (state.globalBandwidthLimitBps !== prev.globalBandwidthLimitBps) {
      void api.setGlobalBandwidthLimit(state.globalBandwidthLimitBps).catch(() => {});
    }
  });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => {
    if (useSettingsStore.getState().theme === "system") applyTheme("system");
  });
}
