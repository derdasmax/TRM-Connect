import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { joinPath, parentPath } from "../lib/format";
import type { UndoAction } from "../store/useUndoStore";
import type { DirEntry } from "../lib/types";

export type SortKey = "name" | "size" | "modified";
export type PaneKind = "local" | "remote";

export interface PaneController {
  kind: PaneKind;
  /** Null for the local pane, or when the remote pane has no active connection yet. */
  connectionId: string | null;
  path: string;
  entries: DirEntry[];
  loading: boolean;
  error: string | null;
  selection: Set<string>;
  sortKey: SortKey;
  sortDir: 1 | -1;
  filter: string;
  sep: "/" | "\\";
  setFilter: (f: string) => void;
  setSort: (key: SortKey) => void;
  refresh: () => void;
  navigate: (path: string) => void;
  navigateInto: (entry: DirEntry) => void;
  navigateUp: () => void;
  toggleSelect: (path: string, additive: boolean) => void;
  selectRange: (from: string, to: string) => void;
  /** Replaces the selection outright (used by rubber-band/marquee selection). */
  replaceSelection: (paths: string[]) => void;
  clearSelection: () => void;
  mkdir: (name: string) => Promise<void>;
  /** Deletes every selected entry, continuing past individual failures.
   *  Resolves with one message per item that failed (empty = all succeeded). */
  removeSelected: () => Promise<string[]>;
  rename: (path: string, newName: string) => Promise<void>;
  chmod: ((path: string, mode: number) => Promise<void>) | null;
}

/** Detects a Windows-style path (`C:\...`) to pick the right separator. */
function sepFor(path: string): "/" | "\\" {
  return /^[a-zA-Z]:\\/.test(path) || path.includes("\\") ? "\\" : "/";
}

export function usePane(
  kind: PaneKind,
  connectionId: string | null,
  initialPath: string,
  /** Reports invertible actions (rename/mkdir) to the owning tab's own undo
   *  stack - a plain callback rather than importing a store directly, so
   *  each connection tab can keep a fully independent undo history. */
  pushUndo: (action: UndoAction) => void = () => {},
): PaneController {
  const [path, setPathState] = useState(initialPath);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [filter, setFilter] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const canBrowse = kind === "local" || connectionId != null;

  useEffect(() => {
    if (!canBrowse) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const task =
      kind === "local" ? api.listLocalDir(path) : api.listRemoteDir(connectionId as string, path);
    task
      .then((list) => {
        if (!cancelled) {
          setEntries(list);
          setSelection(new Set());
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, connectionId, path, reloadToken, canBrowse]);

  useEffect(() => {
    setPathState(initialPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  const sep = useMemo(() => sepFor(path), [path]);

  const sorted = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
    const dirsFirst = [...filtered].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
      else if (sortKey === "size") cmp = a.size - b.size;
      else cmp = (a.modified ?? "").localeCompare(b.modified ?? "");
      return cmp * sortDir;
    });
    return dirsFirst;
  }, [entries, filter, sortKey, sortDir]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  const navigate = useCallback((p: string) => setPathState(p), []);

  const navigateInto = useCallback(
    (entry: DirEntry) => {
      if (entry.is_dir) setPathState(entry.path);
    },
    [],
  );

  const navigateUp = useCallback(() => setPathState((p) => parentPath(p, sepFor(p))), []);

  const toggleSelect = useCallback((p: string, additive: boolean) => {
    setSelection((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, []);

  const selectRange = useCallback(
    (from: string, to: string) => {
      const paths = sorted.map((e) => e.path);
      const a = paths.indexOf(from);
      const b = paths.indexOf(to);
      if (a === -1 || b === -1) return;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelection(new Set(paths.slice(lo, hi + 1)));
    },
    [sorted],
  );

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const replaceSelection = useCallback((paths: string[]) => setSelection(new Set(paths)), []);

  const mkdir = useCallback(
    async (name: string) => {
      const full = joinPath(path, name, sep);
      if (kind === "local") await api.localMkdir(full);
      else await api.remoteMkdir(connectionId as string, full);
      pushUndo({ type: "mkdir", kind, connectionId, path: full });
      refresh();
    },
    [kind, connectionId, path, sep, refresh, pushUndo],
  );

  const removeSelected = useCallback(async () => {
    const targets = sorted.filter((e) => selection.has(e.path));
    const failures: string[] = [];
    // One failing item (permission denied, file in use, ...) must not abort
    // the rest of the batch, and the pane must always refresh afterward -
    // previously an unhandled rejection here silently stopped the loop and
    // skipped the refresh, making delete look like it did nothing at all.
    for (const t of targets) {
      try {
        if (kind === "local") {
          if (t.is_dir) await api.localRemoveDir(t.path);
          else await api.localRemoveFile(t.path);
        } else {
          if (t.is_dir) await api.remoteRemoveDir(connectionId as string, t.path);
          else await api.remoteRemoveFile(connectionId as string, t.path);
        }
      } catch (e) {
        failures.push(`${t.name}: ${String(e)}`);
      }
    }
    refresh();
    return failures;
  }, [kind, connectionId, sorted, selection, refresh]);

  const rename = useCallback(
    async (p: string, newName: string) => {
      const to = joinPath(parentPath(p, sep), newName, sep);
      if (kind === "local") await api.localRename(p, to);
      else await api.remoteRename(connectionId as string, p, to);
      pushUndo({ type: "rename", kind, connectionId, from: p, to });
      refresh();
    },
    [kind, connectionId, sep, refresh, pushUndo],
  );

  const chmod =
    kind === "remote"
      ? async (p: string, mode: number) => {
          await api.remoteChmod(connectionId as string, p, mode);
          refresh();
        }
      : null;

  const setSort = useCallback((key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((d) => (d === 1 ? -1 : 1));
        return prevKey;
      }
      setSortDir(1);
      return key;
    });
  }, []);

  return {
    kind,
    connectionId,
    path,
    entries: sorted,
    loading,
    error,
    selection,
    sortKey,
    sortDir,
    filter,
    sep,
    setFilter,
    setSort,
    refresh,
    navigate,
    navigateInto,
    navigateUp,
    toggleSelect,
    selectRange,
    replaceSelection,
    clearSelection,
    mkdir,
    removeSelected,
    rename,
    chmod,
  };
}
