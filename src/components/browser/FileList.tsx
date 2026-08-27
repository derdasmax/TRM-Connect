import { useVirtualizer } from "@tanstack/react-virtual";
import { Folder, File as FileIcon, FileArchive, FileCode, FileImage, FileText, Link2 } from "lucide-react";
import { useRef, type ComponentType } from "react";
import { formatBytes, formatDate, permissionsToString } from "../../lib/format";
import { cn } from "../../lib/cn";
import type { DirEntry } from "../../lib/types";
import type { PaneController } from "../../hooks/usePane";

const ROW_HEIGHT = 30;

const EXT_ICON: Record<string, ComponentType<{ size?: number; className?: string }>> = {
  zip: FileArchive, gz: FileArchive, tar: FileArchive, "7z": FileArchive, rar: FileArchive,
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage, svg: FileImage, webp: FileImage,
  ts: FileCode, tsx: FileCode, js: FileCode, jsx: FileCode, rs: FileCode, py: FileCode, go: FileCode, json: FileCode, html: FileCode, css: FileCode,
  txt: FileText, md: FileText, log: FileText,
};

function iconFor(entry: DirEntry) {
  if (entry.is_dir) return Folder;
  if (entry.is_symlink) return Link2;
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_ICON[ext] ?? FileIcon;
}

interface FileListProps {
  pane: PaneController;
  onOpen: (entry: DirEntry) => void;
  onContextMenu: (entry: DirEntry | null, x: number, y: number) => void;
  showPermissions?: boolean;
  dropHighlight?: boolean;
}

export function FileList({ pane, onOpen, onContextMenu, showPermissions, dropHighlight }: FileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: pane.entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  let lastClicked: string | null = null;

  return (
    <div
      ref={parentRef}
      className={cn(
        "relative flex-1 overflow-y-auto overflow-x-hidden",
        dropHighlight && "outline outline-2 -outline-offset-2 outline-accent-500",
      )}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onContextMenu(null, e.clientX, e.clientY);
        }
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) pane.clearSelection();
      }}
    >
      {pane.loading && pane.entries.length === 0 && (
        <div className="space-y-1 p-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-[26px] animate-pulse rounded bg-surface-2/60" style={{ opacity: 1 - i * 0.06 }} />
          ))}
        </div>
      )}

      {!pane.loading && pane.entries.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-zinc-500">
          {pane.filter ? "No matching files" : "This folder is empty"}
        </div>
      )}

      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const entry = pane.entries[row.index];
          const Icon = iconFor(entry);
          const selected = pane.selection.has(entry.path);
          return (
            <div
              key={entry.path}
              data-path={entry.path}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}
              className={cn(
                "group flex select-none items-center gap-2 rounded-md px-2 text-[13px] text-zinc-300",
                selected ? "bg-accent-600/25 text-zinc-100" : "hover:bg-surface-2",
              )}
              onClick={(e) => {
                if (e.shiftKey && lastClicked) pane.selectRange(lastClicked, entry.path);
                else pane.toggleSelect(entry.path, e.metaKey || e.ctrlKey);
                lastClicked = entry.path;
              }}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!pane.selection.has(entry.path)) pane.toggleSelect(entry.path, false);
                onContextMenu(entry, e.clientX, e.clientY);
              }}
            >
              <Icon size={15} className={cn("shrink-0", entry.is_dir ? "text-accent-400" : "text-zinc-500")} />
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              {showPermissions && (
                <span className="w-20 shrink-0 font-mono text-[11px] text-zinc-500">
                  {permissionsToString(entry.permissions)}
                </span>
              )}
              <span className="w-16 shrink-0 text-right text-zinc-500">
                {entry.is_dir ? "" : formatBytes(entry.size)}
              </span>
              <span className="w-32 shrink-0 text-right text-zinc-500">{formatDate(entry.modified)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
