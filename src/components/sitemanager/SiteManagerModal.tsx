import { useMemo, useState } from "react";
import { Plus, Server, Trash2, Pencil, Plug } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button, IconButton } from "../ui/Button";
import { SiteForm } from "./SiteForm";
import { useSitesStore } from "../../store/useSitesStore";
import { newSiteProfile, type SiteProfile } from "../../lib/types";
import { cn } from "../../lib/cn";

interface SiteManagerModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (profile: SiteProfile) => void;
}

export function SiteManagerModal({ open, onClose, onConnect }: SiteManagerModalProps) {
  const { sites, save, remove } = useSitesStore();
  const [editing, setEditing] = useState<SiteProfile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          </div>

          {selected ? (
            <div className="flex flex-1 flex-col justify-between rounded-md border border-surface-border bg-surface-2/40 p-3">
              <div className="space-y-1.5 text-[13px]">
                <div className="text-sm font-medium text-zinc-100">{selected.name}</div>
                <div className="text-zinc-400">
                  {selected.protocol.toUpperCase()} · {selected.username}@{selected.host}:{selected.port}
                </div>
                {selected.remote_dir && <div className="text-zinc-500">Dir: {selected.remote_dir}</div>}
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
