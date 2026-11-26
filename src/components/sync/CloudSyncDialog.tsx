import { useState } from "react";
import { CloudDownload, CloudUpload, Eye, EyeOff, Loader2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input, FieldRow } from "../ui/Field";
import { ErrorNotice } from "../common/ErrorNotice";
import { api } from "../../lib/api";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useSitesStore } from "../../store/useSitesStore";
import { useToastStore } from "../../store/useToastStore";

interface CloudSyncDialogProps {
  open: boolean;
  onClose: () => void;
  connectionId: string | null;
  /** Suggested remote path for the sync file, e.g. the remote pane's
   *  current directory joined with a fixed filename. */
  suggestedPath: string;
}

/** Fields worth carrying between machines - deliberately not the whole
 *  settings store (things like "is the transfer queue panel collapsed"
 *  are per-window UI state, not a preference worth syncing). */
interface SyncableSettings {
  theme: ReturnType<typeof useSettingsStore.getState>["theme"];
  accentColor: ReturnType<typeof useSettingsStore.getState>["accentColor"];
  reduceMotion: boolean;
  globalBandwidthLimitBps: number;
  verifyChecksumsDefault: boolean;
  confirmBeforeDelete: boolean;
}

function extractSettings(): SyncableSettings {
  const s = useSettingsStore.getState();
  return {
    theme: s.theme,
    accentColor: s.accentColor,
    reduceMotion: s.reduceMotion,
    globalBandwidthLimitBps: s.globalBandwidthLimitBps,
    verifyChecksumsDefault: s.verifyChecksumsDefault,
    confirmBeforeDelete: s.confirmBeforeDelete,
  };
}

function applySettings(json: string) {
  let parsed: Partial<SyncableSettings>;
  try {
    parsed = JSON.parse(json);
  } catch {
    return;
  }
  const s = useSettingsStore.getState();
  if (parsed.theme) s.setTheme(parsed.theme);
  if (parsed.accentColor) s.setAccentColor(parsed.accentColor);
  if (typeof parsed.reduceMotion === "boolean") s.setReduceMotion(parsed.reduceMotion);
  if (typeof parsed.globalBandwidthLimitBps === "number") s.setGlobalBandwidthLimitBps(parsed.globalBandwidthLimitBps);
  if (typeof parsed.verifyChecksumsDefault === "boolean") s.setVerifyChecksumsDefault(parsed.verifyChecksumsDefault);
  if (typeof parsed.confirmBeforeDelete === "boolean") s.setConfirmBeforeDelete(parsed.confirmBeforeDelete);
}

/** Syncs saved connections and a handful of settings between machines by
 *  encrypting them with a user-chosen passphrase and stashing the result on
 *  whatever server they're already connected to - no separate cloud account
 *  or backend needed, and the server itself never sees anything it could
 *  read without that passphrase. */
export function CloudSyncDialog({ open, onClose, connectionId, suggestedPath }: CloudSyncDialogProps) {
  const [remotePath, setRemotePath] = useState(suggestedPath);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = connectionId != null && remotePath.trim() !== "" && passphrase !== "";

  async function handlePush() {
    if (!connectionId) return;
    setBusy("push");
    setError(null);
    try {
      await api.cloudSyncPush(connectionId, remotePath, passphrase, JSON.stringify(extractSettings()));
      useToastStore.getState().push({ kind: "success", title: "Pushed to cloud", message: remotePath });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handlePull() {
    if (!connectionId) return;
    setBusy("pull");
    setError(null);
    try {
      const result = await api.cloudSyncPull(connectionId, remotePath, passphrase);
      for (const site of result.sites) await useSitesStore.getState().save(site);
      applySettings(result.settings_json);
      useToastStore.getState().push({
        kind: "success",
        title: "Pulled from cloud",
        message: `${result.sites.length} connection${result.sites.length === 1 ? "" : "s"} merged in`,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Cloud sync" width={440}>
      <p className="mb-3 text-[12px] text-zinc-500">
        Stashes your saved connections and a few settings, encrypted with the passphrase below, as a
        single file on this server - pull it on another machine with the same path and passphrase to bring
        them over. The server only ever sees ciphertext.
      </p>

      <FieldRow label="Remote file path">
        <Input value={remotePath} onChange={(e) => setRemotePath(e.target.value)} placeholder="/home/you/.trm-connect-sync.json" />
      </FieldRow>

      <FieldRow label="Passphrase">
        <div className="relative">
          <Input
            type={showPassphrase ? "text" : "password"}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Only you need to know this"
            className="pr-8"
          />
          <button
            type="button"
            onClick={() => setShowPassphrase((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
          >
            {showPassphrase ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Not saved anywhere - forgetting it means the pushed file can never be read again.
        </p>
      </FieldRow>

      {error && (
        <div className="mb-3 rounded border border-red-900/40 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
          <ErrorNotice raw={error} />
        </div>
      )}

      <div className="mt-2 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy != null}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={() => void handlePull()} disabled={!ready || busy != null}>
          {busy === "pull" ? <Loader2 size={14} className="animate-spin" /> : <CloudDownload size={14} />}
          Pull
        </Button>
        <Button variant="primary" onClick={() => void handlePush()} disabled={!ready || busy != null}>
          {busy === "push" ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
          Push
        </Button>
      </div>
    </Modal>
  );
}
