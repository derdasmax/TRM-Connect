import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch as relaunchApp } from "@tauri-apps/plugin-process";
import { isTauri } from "./api";

/** The running app's own version - "dev" outside Tauri (plain browser). */
export async function getAppVersion(): Promise<string> {
  if (!isTauri()) return "dev";
  try {
    return await getVersion();
  } catch {
    return "dev";
  }
}

/** Checks `plugins.updater.endpoints` (GitHub Releases' `latest.json`) for a
 *  newer signed build. Resolves `null` both when already up to date and
 *  when running outside Tauri - callers distinguish "no update" from
 *  "couldn't check" via try/catch, not via this return value. */
export async function checkForUpdate(): Promise<Update | null> {
  if (!isTauri()) return null;
  return check();
}

export const relaunch = relaunchApp;
export type { Update };
