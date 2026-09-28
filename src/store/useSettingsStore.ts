import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "../lib/api";

export type ThemeMode = "dark" | "light" | "system";

interface SettingsState {
  theme: ThemeMode;
  reduceMotion: boolean;
  transferQueueCollapsed: boolean;
  /** Bandwidth cap shared by every active transfer, in bytes/sec; 0 = unlimited. */
  globalBandwidthLimitBps: number;
  /** Default for new transfers' "verify checksum after transfer" option. */
  verifyChecksumsDefault: boolean;
  setTheme: (theme: ThemeMode) => void;
  setReduceMotion: (v: boolean) => void;
  setTransferQueueCollapsed: (v: boolean) => void;
  setGlobalBandwidthLimitBps: (v: number) => void;
  setVerifyChecksumsDefault: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      reduceMotion: false,
      transferQueueCollapsed: false,
      globalBandwidthLimitBps: 0,
      verifyChecksumsDefault: false,
      setTheme: (theme) => set({ theme }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setTransferQueueCollapsed: (transferQueueCollapsed) => set({ transferQueueCollapsed }),
      setGlobalBandwidthLimitBps: (globalBandwidthLimitBps) => set({ globalBandwidthLimitBps }),
      setVerifyChecksumsDefault: (verifyChecksumsDefault) => set({ verifyChecksumsDefault }),
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
  document.documentElement.dataset.reduceMotion = String(useSettingsStore.getState().reduceMotion);
  void api.setGlobalBandwidthLimit(useSettingsStore.getState().globalBandwidthLimitBps).catch(() => {});

  useSettingsStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) applyTheme(state.theme);
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
