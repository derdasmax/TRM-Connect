import { useState } from "react";
import {
  ArrowUp,
  FolderPlus,
  RefreshCw,
  Search,
  Trash2,
  ArrowLeftRight,
  Lock,
  Check,
  X as XIcon,
  FolderOpen,
  PenLine,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { Breadcrumbs } from "./Breadcrumbs";
import { FileList } from "./FileList";
import { QuickLookModal } from "./QuickLookModal";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { Button, IconButton } from "../ui/Button";
import { Input } from "../ui/Field";
import { Modal } from "../ui/Modal";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { ChmodDialog } from "./ChmodDialog";
import { ErrorNotice } from "../common/ErrorNotice";
import { ConnectionStatusIcon } from "../../lib/ConnectionStatusIcon";
import { joinPath, formatBytes } from "../../lib/format";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { PaneController } from "../../hooks/usePane";
import type { DirEntry } from "../../lib/types";

interface PaneProps {
  title: string;
  pane: PaneController;
  transferLabel: string;
  onTransferSelection: () => void;
  transferDisabled?: boolean;
  dropHighlight?: boolean;
}

export function Pane({ title, pane, transferLabel, onTransferSelection, transferDisabled, dropHighlight }: PaneProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; entry: DirEntry | null } | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<DirEntry | null>(null);
  const [chmodTarget, setChmodTarget] = useState<DirEntry | null>(null);
  const [quickLookEntry, setQuickLookEntry] = useState<DirEntry | null>(null);
  const [deleteConfirmTargets, setDeleteConfirmTargets] = useState<DirEntry[] | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  async function performDelete() {
    setDeleteConfirmTargets(null);
    const failures = await pane.removeSelected();
    setDeleteError(
      failures.length > 0 ? `Couldn't delete ${failures.length} item(s):\n${failures.join("\n")}` : null,
    );
  }

  function requestDelete() {
    const targets = pane.entries.filter((e) => pane.selection.has(e.path));
    if (targets.length === 0) return;
    if (useSettingsStore.getState().confirmBeforeDelete) setDeleteConfirmTargets(targets);
    else void performDelete();
  }

  const menuItems: MenuItem[] | null = menu
    ? menu.entry
      ? [
          {
            label: "Open",
            icon: FolderOpen,
            onClick: () => pane.navigateInto(menu.entry as DirEntry),
            disabled: !menu.entry.is_dir,
          },
          {
            label: "Quick Look",
            icon: Eye,
            onClick: () => setQuickLookEntry(menu.entry),
            disabled: menu.entry.is_dir,
          },
          {
            label: "Rename",
            icon: PenLine,
            onClick: () => {
              setRenameTarget(menu.entry);
              setDraft(menu.entry!.name);
            },
          },
          ...(pane.chmod
            ? [{ label: "Permissions…", icon: ShieldCheck, onClick: () => setChmodTarget(menu.entry) }]
            : []),
          { label: "Delete", icon: Trash2, danger: true, separatorBefore: true, onClick: requestDelete },
        ]
      : [
          { label: "New folder", icon: FolderPlus, onClick: () => setNewFolderOpen(true) },
          { label: "Refresh", icon: RefreshCw, onClick: () => pane.refresh() },
        ]
    : null;

  return (
    <div className="fluent-card flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-surface-border px-2 py-1.5">
        <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {title}
          {pane.loading && <ConnectionStatusIcon status="syncing" size={11} />}
        </span>
        <Breadcrumbs path={pane.path} sep={pane.sep} onNavigate={pane.navigate} />
        <div className="flex shrink-0 items-center gap-0.5">
          <IconButton title="Up" onClick={pane.navigateUp}>
            <ArrowUp size={14} />
          </IconButton>
          <IconButton title="New folder" onClick={() => setNewFolderOpen(true)}>
            <FolderPlus size={14} />
          </IconButton>
          <IconButton title="Delete selected" disabled={pane.selection.size === 0} onClick={requestDelete}>
            <Trash2 size={14} />
          </IconButton>
          <IconButton title="Refresh" onClick={pane.refresh}>
            <RefreshCw size={14} />
          </IconButton>
          <IconButton title="Search" active={searchOpen} onClick={() => setSearchOpen((v) => !v)}>
            <Search size={14} />
          </IconButton>
          <IconButton
            title={transferLabel}
            disabled={transferDisabled || pane.selection.size === 0}
            onClick={onTransferSelection}
          >
            <ArrowLeftRight size={14} />
          </IconButton>
        </div>
      </div>

      {searchOpen && (
        <div className="border-b border-surface-border px-2 py-1.5">
          <Input
            autoFocus
            placeholder="Filter this folder…"
            value={pane.filter}
            onChange={(e) => pane.setFilter(e.target.value)}
          />
        </div>
      )}

      {pane.error && (
        <div className="border-b border-red-900/40 bg-red-950/40 px-3 py-1.5 text-[12px] text-red-300">
          {pane.error}
        </div>
      )}

      {deleteError && (
        <div className="flex items-start justify-between gap-2 border-b border-red-900/40 bg-red-950/40 px-3 py-1.5 text-[12px] text-red-300">
          <ErrorNotice raw={deleteError} />
          <button onClick={() => setDeleteError(null)} className="shrink-0 text-red-400 hover:text-red-200">
            <XIcon size={13} />
          </button>
        </div>
      )}

      <FileList
        pane={pane}
        onOpen={pane.navigateInto}
        onContextMenu={(entry, x, y) => setMenu({ entry, x, y })}
        onQuickLook={setQuickLookEntry}
        onDeleteRequest={requestDelete}
        showPermissions={pane.kind === "remote"}
        dropHighlight={dropHighlight}
      />

      <div className="flex items-center justify-between border-t border-surface-border px-2.5 py-1 text-[11px] text-zinc-500">
        <span>
          {pane.entries.length} item{pane.entries.length === 1 ? "" : "s"}
          {pane.selection.size > 0 &&
            ` · ${pane.selection.size} selected (${formatBytes(
              pane.entries.reduce((sum, e) => (pane.selection.has(e.path) ? sum + e.size : sum), 0),
            )})`}
        </span>
        {pane.kind === "remote" && (
          <span className="flex items-center gap-1">
            <Lock size={10} /> SFTP/SCP/FTP(S)
          </span>
        )}
      </div>

      <ContextMenu x={menu?.x ?? 0} y={menu?.y ?? 0} items={menuItems} onClose={() => setMenu(null)} />

      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title="New folder" width={360}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get("name") as string;
            if (name?.trim()) void pane.mkdir(name.trim());
            setNewFolderOpen(false);
          }}
        >
          <Input name="name" autoFocus placeholder="Folder name" />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setNewFolderOpen(false)}>
              <XIcon size={14} /> Cancel
            </Button>
            <Button type="submit" variant="primary">
              <FolderPlus size={14} /> Create
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="Rename" width={360}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (renameTarget && draft.trim()) void pane.rename(renameTarget.path, draft.trim());
            setRenameTarget(null);
          }}
        >
          <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRenameTarget(null)}>
              <XIcon size={14} /> Cancel
            </Button>
            <Button type="submit" variant="primary">
              <Check size={14} /> Rename
            </Button>
          </div>
        </form>
      </Modal>

      {pane.chmod && (
        <ChmodDialog
          entry={chmodTarget}
          onClose={() => setChmodTarget(null)}
          onSubmit={async (mode) => {
            if (chmodTarget && pane.chmod) await pane.chmod(chmodTarget.path, mode);
            setChmodTarget(null);
          }}
        />
      )}

      <QuickLookModal
        entry={quickLookEntry}
        connectionId={pane.kind === "remote" ? pane.connectionId : null}
        onClose={() => setQuickLookEntry(null)}
        onSaved={pane.refresh}
      />

      <DeleteConfirmDialog
        entries={deleteConfirmTargets}
        onCancel={() => setDeleteConfirmTargets(null)}
        onConfirm={() => void performDelete()}
      />
    </div>
  );
}

export function targetPathFor(pane: PaneController, name: string) {
  return joinPath(pane.path, name, pane.sep);
}
