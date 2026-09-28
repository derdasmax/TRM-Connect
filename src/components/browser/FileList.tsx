import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { formatBytes, formatDate, permissionsToString } from "../../lib/format";
import { cn } from "../../lib/cn";
import { iconForEntry } from "../../lib/fileIcons";
import type { DirEntry } from "../../lib/types";
import type { PaneController } from "../../hooks/usePane";

const ROW_HEIGHT = 30;
/** Distance from the top/bottom edge, in px, at which auto-scroll kicks in during a drag. */
const AUTOSCROLL_EDGE = 36;
/** Fastest auto-scroll speed, in px per animation frame. */
const AUTOSCROLL_MAX_SPEED = 20;
/** Minimum pointer movement, in px, before a mousedown-on-empty-space becomes a marquee drag
 *  instead of a plain click-to-deselect. */
const DRAG_THRESHOLD = 4;

interface FileListProps {
  pane: PaneController;
  onOpen: (entry: DirEntry) => void;
  onContextMenu: (entry: DirEntry | null, x: number, y: number) => void;
  showPermissions?: boolean;
  dropHighlight?: boolean;
}

interface MarqueeRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DragState {
  /** Pointer-down position in content-space (scrollTop + pointer-Y-in-container), stable for the whole drag. */
  startContentY: number;
  startClientX: number;
  /** Raw, unadjusted client coordinates at mousedown - used only for the drag-threshold check. */
  startRawX: number;
  startRawY: number;
  /** Selection present before the drag started; unioned with the swept range when Ctrl/Cmd is held. */
  baseSelection: Set<string>;
  additive: boolean;
  entries: DirEntry[];
  lastClientX: number;
  lastClientY: number;
}

export function FileList({ pane, onOpen, onContextMenu, showPermissions, dropHighlight }: FileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: pane.entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Ref, not state: shift-click range-select must survive re-renders (which happen on
  // every selection change), so a plain `let` here would reset to null each render.
  const lastClickedRef = useRef<string | null>(null);

  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  const applyDragSelection = useCallback(
    (curContentY: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rowFromY = (y: number) => Math.floor(y / ROW_HEIGHT);
      const lo = Math.max(0, Math.min(rowFromY(drag.startContentY), rowFromY(curContentY)));
      const hi = Math.min(drag.entries.length - 1, Math.max(rowFromY(drag.startContentY), rowFromY(curContentY)));
      const swept = hi >= lo ? drag.entries.slice(lo, hi + 1).map((e) => e.path) : [];
      pane.replaceSelection(drag.additive ? [...drag.baseSelection, ...swept] : swept);
    },
    [pane],
  );

  const stopDrag = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    dragRef.current = null;
    setMarqueeRect(null);
  }, []);

  // The auto-scroll + marquee-geometry loop runs on rAF (not just on mousemove) so the
  // view keeps scrolling smoothly even while the pointer sits still past the edge.
  const tick = useCallback(() => {
    const drag = dragRef.current;
    const container = parentRef.current;
    if (!drag || !container) return;

    const rect = container.getBoundingClientRect();
    const { lastClientY } = drag;

    if (lastClientY < rect.top + AUTOSCROLL_EDGE) {
      const depth = Math.min(1, (rect.top + AUTOSCROLL_EDGE - lastClientY) / AUTOSCROLL_EDGE);
      container.scrollTop = Math.max(0, container.scrollTop - depth * AUTOSCROLL_MAX_SPEED);
    } else if (lastClientY > rect.bottom - AUTOSCROLL_EDGE) {
      const depth = Math.min(1, (lastClientY - (rect.bottom - AUTOSCROLL_EDGE)) / AUTOSCROLL_EDGE);
      container.scrollTop += depth * AUTOSCROLL_MAX_SPEED;
    }

    const curContentY = container.scrollTop + (lastClientY - rect.top);
    const top = Math.min(drag.startContentY, curContentY);
    const height = Math.abs(curContentY - drag.startContentY);
    const left = Math.min(drag.startClientX, drag.lastClientX - rect.left);
    const width = Math.abs(drag.lastClientX - rect.left - drag.startClientX);
    setMarqueeRect({ top, left, width, height });
    applyDragSelection(curContentY);

    rafRef.current = requestAnimationFrame(tick);
  }, [applyDragSelection]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (!movedRef.current) {
        const dx = e.clientX - drag.startRawX;
        const dy = e.clientY - drag.startRawY;
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        movedRef.current = true;
      }
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
    }
    function onMouseUp() {
      stopDrag();
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [stopDrag]);

  const beginDrag = useCallback(
    (e: ReactMouseEvent) => {
      if (e.button !== 0 || !parentRef.current) return;
      const rect = parentRef.current.getBoundingClientRect();
      const additive = e.metaKey || e.ctrlKey;
      movedRef.current = false;
      dragRef.current = {
        startContentY: parentRef.current.scrollTop + (e.clientY - rect.top),
        startClientX: e.clientX - rect.left,
        startRawX: e.clientX,
        startRawY: e.clientY,
        baseSelection: additive ? new Set(pane.selection) : new Set(),
        additive,
        entries: pane.entries,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
      };
      if (!additive) pane.clearSelection();
      rafRef.current = requestAnimationFrame(tick);
    },
    [pane, tick],
  );

  const selectionSize = pane.entries.reduce((sum, e) => (pane.selection.has(e.path) ? sum + e.size : sum), 0);

  return (
    <div
      ref={parentRef}
      className={cn(
        "relative flex-1 overflow-y-auto overflow-x-hidden select-none",
        dropHighlight && "outline outline-2 -outline-offset-2 outline-accent-500",
      )}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          onContextMenu(null, e.clientX, e.clientY);
        }
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) beginDrag(e);
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
          const { Icon, colorClass } = iconForEntry(entry);
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
                if (e.shiftKey && lastClickedRef.current) pane.selectRange(lastClickedRef.current, entry.path);
                else pane.toggleSelect(entry.path, e.metaKey || e.ctrlKey);
                lastClickedRef.current = entry.path;
              }}
              onDoubleClick={() => onOpen(entry)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!pane.selection.has(entry.path)) pane.toggleSelect(entry.path, false);
                onContextMenu(entry, e.clientX, e.clientY);
              }}
            >
              <Icon size={15} className={cn("shrink-0 transition-transform group-hover:scale-110", colorClass)} />
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

        {marqueeRect && movedRef.current && (
          <div
            className="pointer-events-none absolute z-10 rounded-[3px] border border-accent-400 bg-accent-500/15 shadow-[0_0_0_1px_rgba(139,92,246,0.15)] transition-[opacity] duration-75"
            style={{
              top: marqueeRect.top,
              left: marqueeRect.left,
              width: marqueeRect.width,
              height: marqueeRect.height,
            }}
          />
        )}
      </div>

      {marqueeRect && movedRef.current && pane.selection.size > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-20 w-fit -translate-x-1/2 rounded-full border border-surface-border bg-surface-2/95 px-3 py-1 text-[11px] font-medium text-zinc-200 shadow-lg backdrop-blur">
          {pane.selection.size} ausgewählt · {formatBytes(selectionSize)}
        </div>
      )}
    </div>
  );
}
