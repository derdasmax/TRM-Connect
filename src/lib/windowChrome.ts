import { platform, version } from "@tauri-apps/plugin-os";
import { isTauri } from "./api";

/**
 * Mica is a Windows 11 (build >= 22000) DWM compositing effect configured
 * natively in `tauri.conf.json` (`windowEffects.effects: ["mica"]`) - Tauri
 * silently no-ops it on anything older. For the *page* to actually show
 * Mica through, though, its own background has to turn transparent (see
 * `body[data-mica-active]` in index.css); everywhere else (Windows 10,
 * Linux/macOS dev, the plain browser) needs to keep painting an opaque
 * fallback or the window would render as a transparent hole.
 */
export async function isWin11MicaSupported(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    if ((await platform()) !== "windows") return false;
    const v = await version();
    const build = Number.parseInt(v.split(".")[2] ?? "0", 10);
    return Number.isFinite(build) && build >= 22000;
  } catch {
    // os plugin unavailable or the call failed for any reason - fall back
    // to the safe, opaque rendering path rather than risk a transparent hole.
    return false;
  }
}

/** Sets `data-mica-active="true"|"false"` on `<body>` once, at startup. */
export async function initWindowChrome() {
  document.body.dataset.micaActive = String(await isWin11MicaSupported());
}
