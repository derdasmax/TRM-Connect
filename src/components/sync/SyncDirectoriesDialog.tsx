import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderSync,
  Loader2,
  MinusCircle,
} from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button, IconButton } from "../ui/Button";
import { ErrorNotice } from "../common/ErrorNotice";
import { api } from "../../lib/api";
import { joinPath, formatBytes, formatDate } from "../../lib/format";
import { useTransferStore } from "../../store/useTransferStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { cn } from "../../lib/cn";
import type { SyncDiffResult, SyncEntry } from "../../lib/types";

type Action = "upload" | "download" | "skip";

interface SyncDirectoriesDialogProps {
  open: boolean;
  onClose: () => void;
  connectionId: string | null;
  localRoot: string;
  remoteRoot: string;
  localSep: "/" | "\\";
  remoteSep: "/" | "\\";
  siteName: string | null;
  onSynced: () => void;
}

function defaultAction(entry: SyncEntry): Action {
  if (entry.status === "local_only") return "upload";
  if (entry.status === "remote_only") return "download";
  if (entry.local_modified && entry.remote_modified) {
    return new Date(entry.local_modified) > new Date(entry.remote_modified) ? "upload" : "download";
  }
  return "upload";
}

function fullPath(root: string, relativePath: string, sep: "/" | "\\"): string {
  return relativePath.split("/").reduce((acc, segment) => joinPath(acc, segment, sep), root);
}

/** Recursively compares the two currently-open directories and lets the user
 *  review and execute a sync - one-directional per file, chosen per entry
 *  (defaulting to whichever side is newer for a genuine conflict). Deletions
 *  are deliberately out of scope: this only ever copies differences, never
 *  removes a file neither side is missing, so there's no "mirror" footgun. */
export function SyncDirectoriesDialog({
  open,
  onClose,
  connectionId,
  localRoot,
  remoteRoot,
  localSep,
  remoteSep,
  siteName,
  onSynced,
}: SyncDirectoriesDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncDiffResult | null>(null);
  const [actions, setActions] = useState<Record<string, Action>>({});
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open || !connectionId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    api
      .diffDirectories(connectionId, localRoot, remoteRoot)
      .then((r) => {
        setResult(r);
        setActions(Object.fromEntries(r.entries.map((e) => [e.relative_path, defaultAction(e)])));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, connectionId, localRoot, remoteRoot]);

  const counts = useMemo(() => {
    const values = Object.values(actions);
    return {
      upload: values.filter((a) => a === "upload").length,
      download: values.filter((a) => a === "download").length,
    };
  }, [actions]);

  async function handleSync() {
    if (!result || !connectionId) return;
    setRunning(true);
    try {
      const { enqueueUpload, enqueueDownload } = useTransferStore.getState();
      const verifyChecksum = useSettingsStore.getState().verifyChecksumsDefault;
      for (const entry of result.entries) {
        const action = actions[entry.relative_path];
        if (!action || action === "skip") continue;
        const local = fullPath(localRoot, entry.relative_path, localSep);
        const remote = fullPath(remoteRoot, entry.relative_path, remoteSep);
        if (entry.is_dir) {
          if (action === "upload") await api.remoteMkdir(connectionId, remote);
          else await api.localMkdir(local);
          continue;
        }
        if (action === "upload") await enqueueUpload(connectionId, local, remote, { verifyChecksum, siteName });
        else await enqueueDownload(connectionId, remote, local, { verifyChecksum, siteName });
      }
      onSynced();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  function setAction(path: string, action: Action) {
    setActions((prev) => ({ ...prev, [path]: action }));
  }

  return (
    <Modal open={open} onClose={onClose} title="Sync directories" width={640}>
      <p className="mb-2 text-[12px] text-zinc-500">
        Comparing <span className="font-mono text-zinc-400">{localRoot}</span> against{" "}
        <span className="font-mono text-zinc-400">{remoteRoot}</span> (recursively, by file size). Nothing
        is deleted - only one-sided or differing files are ever touched.
      </p>

      {loading && (
        <div className="flex flex-col items-center gap-2 py-10 text-zinc-500">
          <Loader2 size={22} className="animate-spin" />
          <span className="text-xs">Comparing directories…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rounded border border-red-900/40 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
          <ErrorNotice raw={error} />
        </div>
      )}

      {!loading && !error && result && (
        <>
          {result.entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-zinc-500">
              Already in sync ({result.same_count} matching item{result.same_count === 1 ? "" : "s"}).
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-y-auto rounded border border-surface-border">
              {result.entries.map((entry) => {
                const action = actions[entry.relative_path] ?? "skip";
                return (
                  <div
                    key={entry.relative_path}
                    className="flex items-center gap-2 border-b border-surface-border/60 px-2.5 py-1.5 text-[12px] last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-zinc-200">{entry.relative_path}</div>
                      <div className="text-[10px] text-zinc-500">
                        {entry.local_size != null && (
                          <span>
                            local {entry.is_dir ? "folder" : formatBytes(entry.local_size)} ·{" "}
                            {formatDate(entry.local_modified)}
                          </span>
                        )}
                        {entry.local_size != null && entry.remote_size != null && <span> — </span>}
                        {entry.remote_size != null && (
                          <span>
                            remote {entry.is_dir ? "folder" : formatBytes(entry.remote_size)} ·{" "}
                            {formatDate(entry.remote_modified)}
                          </span>
                        )}
                      </div>
                    </div>
                    {entry.status === "differs" && (
                      <AlertTriangle size={13} className="shrink-0 text-amber-400" />
                    )}
                    <div className="flex shrink-0 gap-0.5">
                      <IconButton
                        title="Upload to remote"
                        active={action === "upload"}
                        onClick={() => setAction(entry.relative_path, "upload")}
                      >
                        <ArrowUpFromLine size={13} />
                      </IconButton>
                      <IconButton
                        title="Download to local"
                        active={action === "download"}
                        onClick={() => setAction(entry.relative_path, "download")}
                      >
                        <ArrowDownToLine size={13} />
                      </IconButton>
                      <IconButton
                        title="Skip"
                        active={action === "skip"}
                        onClick={() => setAction(entry.relative_path, "skip")}
                      >
                        <MinusCircle size={13} />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className={cn("mt-3 flex items-center justify-between", result.entries.length === 0 && "hidden")}>
            <span className="text-[11px] text-zinc-500">
              {counts.upload} to upload · {counts.download} to download · {result.same_count} already in sync
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={running}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSync()}
                disabled={running || (counts.upload === 0 && counts.download === 0)}
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <FolderSync size={14} />}
                Sync
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
