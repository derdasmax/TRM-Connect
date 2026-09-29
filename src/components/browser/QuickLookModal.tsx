import { convertFileSrc } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import "highlight.js/styles/github-dark.css";
import { api, isTauri } from "../../lib/api";
import { iconForEntry, languageForEntry, previewKindFor } from "../../lib/fileIcons";
import { formatBytes, formatDate } from "../../lib/format";
import { IconButton } from "../ui/Button";
import type { DirEntry } from "../../lib/types";

const TEXT_PREVIEW_MAX_BYTES = 400_000;
const REMOTE_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

interface QuickLookModalProps {
  entry: DirEntry | null;
  /** Null for the local pane; the connection id for the remote pane. */
  connectionId: string | null;
  onClose: () => void;
}

export function QuickLookModal({ entry, connectionId, onClose }: QuickLookModalProps) {
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  useEffect(() => {
    setLocalPath(null);
    setTextContent(null);
    setError(null);
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
      if (e.code === "Space" || e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose]);

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
            className="flex h-[80vh] w-[min(90vw,900px)] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-1 shadow-2xl"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <Icon size={15} className={colorClass} />
                <span className="truncate text-sm font-medium text-zinc-100">{entry.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatBytes(entry.size)} · {formatDate(entry.modified)}
                </span>
              </div>
              <IconButton title="Close (Space/Esc)" onClick={onClose}>
                <X size={15} />
              </IconButton>
            </div>

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

              {!loading && !error && kind === "text" && textContent != null && (
                <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words rounded bg-surface-2/60 p-3 font-mono text-[12px] leading-relaxed">
                  {highlighted != null ? (
                    <code className="hljs !bg-transparent" dangerouslySetInnerHTML={{ __html: highlighted }} />
                  ) : (
                    <code className="text-zinc-300">{textContent}</code>
                  )}
                  {textContent.length >= TEXT_PREVIEW_MAX_BYTES && (
                    <div className="mt-2 text-amber-400">— truncated, file continues —</div>
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
