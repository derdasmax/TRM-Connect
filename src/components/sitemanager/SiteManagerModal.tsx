import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Server, Trash2, Pencil, Plug, RefreshCw } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button, IconButton } from "../ui/Button";
import { SiteForm } from "./SiteForm";
import { useSitesStore } from "../../store/useSitesStore";
import { newSiteProfile, type SiteProfile } from "../../lib/types";
import { cn } from "../../lib/cn";
import { api } from "../../lib/api";

interface SiteManagerModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (profile: SiteProfile) => void;
}

type PingResult = "checking" | number | "error";

/** Colour-coded ping/latency dot: green (<150ms) / amber (150-500ms) / red
 *  (>500ms or unreachable), pulsing while a check is in flight. TCP-connect
 *  latency to the site's host:port doubles as a lightweight reachability
 *  check, since a real ICMP ping needs raw-socket privileges we don't have. */
function LatencyDot({ result }: { result: PingResult | undefined }) {
  if (result === undefined || result === "checking") {
    return (
      <motion.span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        title="Checking..."
      />
    );
  }
  if (result === "error") {
    return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" title="Unreachable" />;
  }
  const cls = result < 150 ? "bg-emerald-500" : result < 500 ? "bg-amber-500" : "bg-red-500";
  return (
    <motion.span
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cls)}
      initial={{ scale: 0.5 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      title={`${result} ms`}
    />
  );
}

export function SiteManagerModal({ open, onClose, onConnect }: SiteManagerModalProps) {
  const { sites, save, remove } = useSitesStore();
  const [editing, setEditing] = useState<SiteProfile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pings, setPings] = useState<Record<string, PingResult>>({});

  const runHealthChecks = (list: SiteProfile[]) => {
    setPings((prev) => {
      const next = { ...prev };
      for (const s of list) next[s.id] = "checking";
      return next;
    });
    for (const s of list) {
      api
        .pingSite(s.host, s.port)
        .then((ms) => setPings((prev) => ({ ...prev, [s.id]: ms })))
        .catch(() => setPings((prev) => ({ ...prev, [s.id]: "error" })));
    }
  };

  useEffect(() => {
    if (open && sites.length > 0) runHealthChecks(sites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    const groups = new Map<string, SiteProfile[]>();
    for (const s of sites) {
      const key = s.folder.join("/") || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [sites]);

  const selected = sites.find((s) => s.id === selectedId) ?? null;

  if (editing) {
    return (
      <Modal open={open} onClose={() => setEditing(null)} title={editing.name ? "Edit site" : "New site"} width={440}>
        <SiteForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (profile) => {
            const saved = await save(profile);
            setSelectedId(saved.id);
            setEditing(null);
          }}
          onConnect={async (profile) => {
            const saved = await save(profile);
            setEditing(null);
            onConnect(saved);
          }}
        />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Site Manager" width={560}>
      <div className="flex h-[380px] gap-3">
        <div className="flex w-56 flex-col overflow-y-auto rounded-md border border-surface-border bg-surface-2/50">
          {sites.length === 0 && (
            <div className="p-3 text-center text-xs text-zinc-500">No saved sites yet</div>
          )}
          {grouped.map(([folder, items]) => (
            <div key={folder}>
              {folder && (
                <div className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {folder}
                </div>
              )}
              {items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  onDoubleClick={() => onConnect(s)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[13px]",
                    selectedId === s.id ? "bg-accent-600/25 text-zinc-100" : "text-zinc-300 hover:bg-surface-3",
                  )}
                >
                  <Server size={13} className="shrink-0 text-zinc-500" />
                  <span className="truncate">{s.name}</span>
                  <LatencyDot result={pings[s.id]} />
                  <span className="ml-auto shrink-0 text-[10px] uppercase text-zinc-600">{s.protocol}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-1 flex-col">
          <div className="mb-2 flex gap-1">
            <IconButton title="New site" onClick={() => setEditing(newSiteProfile())}>
              <Plus size={15} />
            </IconButton>
            <IconButton title="Edit" disabled={!selected} onClick={() => selected && setEditing(selected)}>
              <Pencil size={15} />
            </IconButton>
            <IconButton
              title="Delete"
              disabled={!selected}
              onClick={async () => {
                if (selected) {
                  await remove(selected.id);
                  setSelectedId(null);
                }
              }}
            >
              <Trash2 size={15} />
            </IconButton>
            <IconButton title="Re-check latency" onClick={() => runHealthChecks(sites)} className="ml-auto">
              <RefreshCw size={14} />
            </IconButton>
          </div>

          {selected ? (
            <div className="flex flex-1 flex-col justify-between rounded-md border border-surface-border bg-surface-2/40 p-3">
              <div className="space-y-1.5 text-[13px]">
                <div className="text-sm font-medium text-zinc-100">{selected.name}</div>
                <div className="text-zinc-400">
                  {selected.protocol.toUpperCase()} · {selected.username}@{selected.host}:{selected.port}
                </div>
                {selected.remote_dir && <div className="text-zinc-500">Dir: {selected.remote_dir}</div>}
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <LatencyDot result={pings[selected.id]} />
                  {(() => {
                    const r = pings[selected.id];
                    if (r === undefined || r === "checking") return "Checking latency...";
                    if (r === "error") return "Unreachable";
                    return `${r} ms`;
                  })()}
                </div>
              </div>
              <Button variant="primary" onClick={() => onConnect(selected)} className="mt-3 w-full">
                <Plug size={14} /> Connect
              </Button>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
              Select a site, or create a new one
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
