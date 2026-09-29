import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Moon,
  Plug,
  Plus,
  Redo2,
  Search,
  Server,
  Settings,
  Sun,
  Undo2,
  Unplug,
  X,
  XCircle,
} from "lucide-react";
import { fuzzyScore } from "../../lib/fuzzy";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useSitesStore } from "../../store/useSitesStore";
import { useTabsStore } from "../../store/useTabsStore";
import { useUiStore } from "../../store/useUiStore";

interface Command {
  id: string;
  label: string;
  hint: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
  run: () => void;
}

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const sites = useSitesStore((s) => s.sites);
  const theme = useSettingsStore((s) => s.theme);
  const actions = useUiStore((s) => s.activeWorkspaceActions);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        id: "new-tab",
        label: "New Tab",
        hint: "Tabs",
        Icon: Plus,
        run: () => useTabsStore.getState().addTab(),
      },
      ...(tabs.length > 1
        ? [
            {
              id: "close-tab",
              label: "Close Current Tab",
              hint: "Tabs",
              Icon: X,
              run: () => useTabsStore.getState().closeTab(activeTabId),
            },
          ]
        : []),
      {
        id: "settings",
        label: "Open Settings",
        hint: "App",
        Icon: Settings,
        run: () => useUiStore.getState().openSettingsModal(),
      },
      {
        id: "theme",
        label: theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme",
        hint: "App",
        Icon: theme === "dark" ? Sun : Moon,
        run: () => useSettingsStore.getState().setTheme(theme === "dark" ? "light" : "dark"),
      },
    ];

    if (actions) {
      list.push({
        id: "quick-connect",
        label: "Quick Connect…",
        hint: "Connection",
        Icon: Plug,
        run: actions.openQuickConnect,
      });
      list.push({
        id: "site-manager",
        label: "Open Site Manager",
        hint: "Connection",
        Icon: Server,
        run: actions.openSiteManager,
      });
      if (actions.connected) {
        list.push({
          id: "disconnect",
          label: "Disconnect",
          hint: "Connection",
          Icon: Unplug,
          run: actions.disconnect,
        });
      }
      if (actions.canUndo) {
        list.push({ id: "undo", label: "Undo", hint: "Edit", Icon: Undo2, run: actions.undo });
      }
      if (actions.canRedo) {
        list.push({ id: "redo", label: "Redo", hint: "Edit", Icon: Redo2, run: actions.redo });
      }
      for (const site of sites) {
        list.push({
          id: `site-${site.id}`,
          label: `Connect to ${site.name}`,
          hint: `${site.protocol.toUpperCase()} · ${site.host}`,
          Icon: Server,
          run: () => actions.connectToSite(site),
        });
      }
    }

    return list;
  }, [tabs.length, activeTabId, sites, theme, actions]);

  const filtered = useMemo(() => {
    if (query.trim() === "") return commands;
    return commands
      .map((c) => ({ c, score: fuzzyScore(query, `${c.label} ${c.hint}`) }))
      .filter((r): r is { c: Command; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.c);
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlighted(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => setHighlighted(0), [query]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const s = useUiStore.getState();
        if (s.commandPaletteOpen) s.closeCommandPalette();
        else s.openCommandPalette();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function close() {
    useUiStore.getState().closeCommandPalette();
  }

  function runHighlighted() {
    const cmd = filtered[highlighted];
    if (!cmd) return;
    close();
    cmd.run();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 pt-[15vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <motion.div
            className="flex max-h-[60vh] w-[min(90vw,560px)] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-1 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center gap-2 border-b border-surface-border px-3 py-2.5">
              <Search size={15} className="shrink-0 text-zinc-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or search connections…"
                className="w-full bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlighted((h) => Math.max(h - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    runHighlighted();
                  } else if (e.key === "Escape") {
                    close();
                  }
                }}
              />
              {query && (
                <button onClick={() => setQuery("")} className="shrink-0 text-zinc-500 hover:text-zinc-300">
                  <XCircle size={14} />
                </button>
              )}
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto py-1">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-zinc-500">No matching commands</div>
              )}
              {filtered.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => {
                    close();
                    cmd.run();
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors ${
                    i === highlighted ? "bg-accent-600/20 text-zinc-100" : "text-zinc-300"
                  }`}
                >
                  <cmd.Icon size={14} className="shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate">{cmd.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide text-zinc-600">{cmd.hint}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
