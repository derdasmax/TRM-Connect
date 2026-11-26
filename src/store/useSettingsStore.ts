import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { api, isTauri } from "../lib/api";

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
  /** Silently check GitHub Releases for a newer build right after the splash screen closes. */
  autoCheckForUpdates: boolean;
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: AccentColor) => void;
  setReduceMotion: (v: boolean) => void;
  setTransferQueueCollapsed: (v: boolean) => void;
  setGlobalBandwidthLimitBps: (v: number) => void;
  setVerifyChecksumsDefault: (v: boolean) => void;
  setConfirmBeforeDelete: (v: boolean) => void;
  setAutoCheckForUpdates: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      accentColor: "blue",
      reduceMotion: false,
      transferQueueCollapsed: false,
      globalBandwidthLimitBps: 0,
      verifyChecksumsDefault: false,
      confirmBeforeDelete: true,
      autoCheckForUpdates: true,
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setTransferQueueCollapsed: (transferQueueCollapsed) => set({ transferQueueCollapsed }),
      setGlobalBandwidthLimitBps: (globalBandwidthLimitBps) => set({ globalBandwidthLimitBps }),
      setVerifyChecksumsDefault: (verifyChecksumsDefault) => set({ verifyChecksumsDefault }),
      setConfirmBeforeDelete: (confirmBeforeDelete) => set({ confirmBeforeDelete }),
      setAutoCheckForUpdates: (autoCheckForUpdates) => set({ autoCheckForUpdates }),
    }),
    {
      name: "trm-connect.settings",
      version: 2,
      // v1 -> v2: the default accent moved from a generic violet to Windows
      // Blue (#0078d4) for the Fluent/Win11 redesign. Only installs that
      // never touched the setting (still sitting on the old "violet"
      // default) get carried forward - a deliberate pick of violet is just
      // a regular accent choice and stays untouched by a version bump.
      migrate: (persisted) => {
        const state = persisted as SettingsState;
        if (state.accentColor === "violet") state.accentColor = "blue";
        return state;
      },
    },
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
  // Keeps the Mica tint in sync with the *resolved app theme*, not the raw
  // OS theme - otherwise a user running the app in light mode on a
  // dark-mode desktop (or vice versa) would get a Mica tint that fights
  // the rest of the UI.
  if (isTauri()) void getCurrentWindow().setTheme(resolved).catch(() => {});
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
