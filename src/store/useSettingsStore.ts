import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";

interface SettingsState {
  theme: ThemeMode;
  reduceMotion: boolean;
  transferQueueCollapsed: boolean;
  setTheme: (theme: ThemeMode) => void;
  setReduceMotion: (v: boolean) => void;
  setTransferQueueCollapsed: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      reduceMotion: false,
      transferQueueCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setTransferQueueCollapsed: (transferQueueCollapsed) => set({ transferQueueCollapsed }),
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

  useSettingsStore.subscribe((state, prev) => {
    if (state.theme !== prev.theme) applyTheme(state.theme);
    if (state.reduceMotion !== prev.reduceMotion) {
      document.documentElement.dataset.reduceMotion = String(state.reduceMotion);
    }
  });

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", () => {
    if (useSettingsStore.getState().theme === "system") applyTheme("system");
  });
}
