import { convertFileSrc } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, Pencil, X } from "lucide-react";
import "highlight.js/styles/github-dark.css";
import { api, isTauri } from "../../lib/api";
import { iconForEntry, languageForEntry, previewKindFor } from "../../lib/fileIcons";
import { formatBytes, formatDate } from "../../lib/format";
import { ErrorNotice } from "../common/ErrorNotice";
import { Button, IconButton } from "../ui/Button";
import type { DirEntry } from "../../lib/types";

const TEXT_PREVIEW_MAX_BYTES = 400_000;
const REMOTE_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

interface QuickLookModalProps {
  entry: DirEntry | null;
  /** Null for the local pane; the connection id for the remote pane. */
  connectionId: string | null;
  onClose: () => void;
  /** Called after a successful save, so the pane can refresh the entry's
   *  now-stale size/modified time. */
  onSaved?: () => void;
}

export function QuickLookModal({ entry, connectionId, onClose, onSaved }: QuickLookModalProps) {
  const [localPath, setLocalPath] = useState<string | null>(null);
  // Where the actual file bytes live on disk right now: the file itself for
  // a local entry, or the temp copy `quick_look_remote` downloaded for a
  // remote one - saving an edit always writes here first.
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalPath(null);
    setSourcePath(null);
    setTextContent(null);
    setError(null);
    setEditing(false);
    setSaveError(null);
    if (!entry || !isTauri()) return;

    const kind = previewKindFor(entry);
    if (kind === "unsupported") return;

    let cancelled = false;
    setLoading(true);

    async function run() {
      try {
        let path = entry!.path;
        if (connectionId) {
          if (entry!.size > REMOTE_PREVIEW_MAX_BYTES) {
            throw new Error(`File too large to preview (${formatBytes(entry!.size)}, limit 25 MB).`);
          }
          path = await api.quickLookRemote(connectionId, entry!.path, entry!.size);
        }
        if (cancelled) return;
        setSourcePath(path);
        if (kind === "text") {
          const text = await api.readTextPreview(path, TEXT_PREVIEW_MAX_BYTES);
          if (!cancelled) setTextContent(text);
        } else {
          if (!cancelled) setLocalPath(path);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [entry, connectionId]);

  useEffect(() => {
    if (!entry) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (editing) setEditing(false);
        else onClose();
        return;
      }
      // Space is the "quick" close shortcut, matching Finder/Explorer Quick
      // Look conventions - but it's also just a character the user needs to
      // type while editing, so it must never fire while the textarea is live.
      if (e.code === "Space" && !editing) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose, editing]);

  function startEditing() {
    if (textContent == null) return;
    setDraft(textContent);
    setSaveError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!entry || sourcePath == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.writeTextFile(sourcePath, draft);
      if (connectionId) await api.quickLookSaveRemote(connectionId, sourcePath, entry.path);
      setTextContent(draft);
      setEditing(false);
      onSaved?.();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  // highlight.js bundles ~190 language grammars, which would otherwise sit
  // in every user's initial download for a feature only Quick Look needs -
  // loaded on demand and only once the raw text is actually in hand. A known
  // extension (.ts, .py, ...) gets highlighted as that language; anything
  // else still gets highlight.js's own best-guess auto-detection rather than
  // no highlighting at all.
  useEffect(() => {
    setHighlighted(null);
    if (textContent == null || !entry) return;
    let cancelled = false;
    import("highlight.js").then(({ default: hljs }) => {
      if (cancelled) return;
      try {
        const lang = languageForEntry(entry);
        const html =
          lang && hljs.getLanguage(lang)
            ? hljs.highlight(textContent, { language: lang }).value
            : hljs.highlightAuto(textContent).value;
        if (!cancelled) setHighlighted(html);
      } catch {
        // Leave `highlighted` null - the plain-text fallback below still renders.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [textContent, entry]);

  const kind = entry ? previewKindFor(entry) : "unsupported";
  const { Icon, colorClass } = entry ? iconForEntry(entry) : { Icon: AlertTriangle, colorClass: "" };

  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="glass-flyout flex h-[80vh] w-[min(90vw,900px)] flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Icon size={15} className={colorClass} />
                <span className="truncate text-sm font-medium text-zinc-100">{entry.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatBytes(entry.size)} · {formatDate(entry.modified)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {!editing &&
                  !loading &&
                  !error &&
                  kind === "text" &&
                  textContent != null &&
                  textContent.length < TEXT_PREVIEW_MAX_BYTES && (
                    <IconButton title="Edit" onClick={startEditing}>
                      <Pencil size={14} />
                    </IconButton>
                  )}
                {editing && (
                  <>
                    <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving} className="!py-1 text-xs">
                      Cancel
                    </Button>
                    <Button variant="primary" onClick={() => void handleSave()} disabled={saving} className="!py-1 text-xs">
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Save{connectionId ? " & upload" : ""}
                    </Button>
                  </>
                )}
                <IconButton title="Close (Space/Esc)" onClick={onClose}>
                  <X size={15} />
                </IconButton>
              </div>
            </div>

            {saveError && (
              <div className="border-b border-red-900/40 bg-red-950/40 px-4 py-1.5 text-[12px] text-red-300">
                <ErrorNotice raw={saveError} />
              </div>
            )}

            <div className="flex flex-1 items-center justify-center overflow-auto bg-surface-0/40 p-4">
              {loading && (
                <div className="flex flex-col items-center gap-2 text-zinc-500">
                  <Loader2 size={22} className="animate-spin" />
                  <span className="text-xs">Loading preview…</span>
                </div>
              )}

              {!loading && error && (
                <div className="flex flex-col items-center gap-2 text-center text-sm text-zinc-400">
                  <AlertTriangle size={22} className="text-amber-400" />
                  {error}
                </div>
              )}

              {!loading && !error && kind === "unsupported" && (
                <div className="flex flex-col items-center gap-2 text-center text-sm text-zinc-500">
                  <Icon size={32} className={colorClass} />
                  No preview available for this file type.
                </div>
              )}

              {!loading && !error && kind === "image" && localPath && (
                <img
                  src={convertFileSrc(localPath)}
                  alt={entry.name}
                  className="max-h-full max-w-full rounded object-contain shadow-lg"
                />
              )}

              {!loading && !error && kind === "pdf" && localPath && (
                <iframe title={entry.name} src={convertFileSrc(localPath)} className="h-full w-full rounded bg-white" />
              )}

              {!loading && !error && kind === "text" && textContent != null && editing && (
                <textarea
                  autoFocus
                  spellCheck={false}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-full w-full resize-none overflow-auto rounded bg-surface-2/60 p-3 font-mono text-[12px] leading-relaxed text-zinc-100 outline-none focus:ring-1 focus:ring-accent-500"
                />
              )}

              {!loading && !error && kind === "text" && textContent != null && !editing && (
                <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words rounded bg-surface-2/60 p-3 font-mono text-[12px] leading-relaxed">
                  {highlighted != null ? (
                    <code className="hljs !bg-transparent" dangerouslySetInnerHTML={{ __html: highlighted }} />
                  ) : (
                    <code className="text-zinc-300">{textContent}</code>
                  )}
                  {textContent.length >= TEXT_PREVIEW_MAX_BYTES && (
                    <div className="mt-2 text-amber-400">— truncated, file continues — editing is disabled to avoid cutting off the rest of the file.</div>
                  )}
                </pre>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
