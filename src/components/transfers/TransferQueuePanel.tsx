import { AnimatePresence, motion, Reorder } from "framer-motion";
import {
  ChevronDown,
  History,
  Pause,
  Play,
  Square,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  GripVertical,
  Rocket,
  Gauge,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useTransferStore } from "../../store/useTransferStore";
import { useUiStore } from "../../store/useUiStore";
import { formatBytes, formatEta, formatSpeed } from "../../lib/format";
import { ErrorNotice } from "../common/ErrorNotice";
import { IconButton } from "../ui/Button";
import { cn } from "../../lib/cn";
import type { TransferTask } from "../../lib/types";

function ChecksumBadge({ status }: { status: TransferTask["checksum"] }) {
  if (!status) return null;
  const map = {
    verified: { Icon: ShieldCheck, cls: "text-emerald-400", title: "Checksum verified" },
    mismatch: { Icon: ShieldAlert, cls: "text-red-400", title: "Checksum mismatch! The transferred file may be corrupt." },
    unsupported: { Icon: ShieldQuestion, cls: "text-zinc-500", title: "This protocol can't verify checksums remotely" },
    error: { Icon: ShieldAlert, cls: "text-amber-400", title: "Checksum verification failed" },
  } as const;
  const { Icon, cls, title } = map[status];
  return (
    <span title={title} className="flex shrink-0">
      <Icon size={12} className={cls} />
    </span>
  );
}

const SPARKLINE_SAMPLES = 30;

/** A tiny live speed graph, redrawn as progress events for this task roll
 *  in - just the last `SPARKLINE_SAMPLES` readings, normalized to the
 *  window's own peak so a slow transfer's variation is still visible. */
function SpeedSparkline({ speedBps }: { speedBps: number }) {
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    setHistory((h) => [...h, speedBps].slice(-SPARKLINE_SAMPLES));
  }, [speedBps]);

  if (history.length < 2) return <div className="h-5 w-14 shrink-0" />;

  const max = Math.max(1, ...history);
  const points = history
    .map((v, i) => `${(i / (SPARKLINE_SAMPLES - 1)) * 100},${100 - (v / max) * 100}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-5 w-14 shrink-0 text-accent-400">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BandwidthInput({ task }: { task: TransferTask }) {
  const setBandwidthLimit = useTransferStore((s) => s.setBandwidthLimit);
  const mbps = task.speed_limit_bps === 0 ? "" : (task.speed_limit_bps / (1024 * 1024)).toString();
  return (
    <label className="flex shrink-0 items-center gap-1" title="Bandwidth limit for this transfer (MB/s, empty = unlimited)">
      <Gauge size={11} className="text-zinc-600" />
      <input
        type="number"
        min={0}
        step="0.1"
        placeholder="∞"
        value={mbps}
        onChange={(e) => {
          const mb = parseFloat(e.target.value);
          setBandwidthLimit(task.id, !e.target.value || Number.isNaN(mb) || mb <= 0 ? 0 : Math.round(mb * 1024 * 1024));
        }}
        className="w-10 rounded border border-surface-border bg-surface-2 px-1 py-0 text-[10px] text-zinc-300 outline-none focus:border-accent-500"
      />
    </label>
  );
}

function TaskRow({ task, draggable }: { task: TransferTask; draggable?: boolean }) {
  const { pause, resume, cancel, prioritizeQueued } = useTransferStore();
  const extra = useTransferStore((s) => s.progressExtra[task.id]);
  const pct = task.total_bytes > 0 ? Math.min(100, (task.transferred_bytes / task.total_bytes) * 100) : 0;
  const name = (task.direction === "upload" ? task.remote_path : task.local_path).split(/[/\\]/).pop();

  return (
    <div className="border-b border-surface-border/60 px-3 py-2 text-[12px]">
      <div className="mb-1 flex items-center gap-2">
        {draggable && <GripVertical size={12} className="shrink-0 cursor-grab text-zinc-600 active:cursor-grabbing" />}
        {task.direction === "upload" ? (
          <ArrowUpFromLine size={12} className="shrink-0 text-accent-400" />
        ) : (
          <ArrowDownToLine size={12} className="shrink-0 text-accent-400" />
        )}
        <span className="min-w-0 flex-1 truncate text-zinc-200">{name}</span>
        <ChecksumBadge status={task.checksum} />
        <BandwidthInput task={task} />
        <StatusBadge status={task.status} />
        <div className="flex gap-0.5">
          {task.status === "queued" && (
            <IconButton title="Run next" onClick={() => prioritizeQueued(task.id)}>
              <Rocket size={12} />
            </IconButton>
          )}
          {task.status === "running" && (
            <IconButton title="Pause" onClick={() => pause(task.id)}>
              <Pause size={12} />
            </IconButton>
          )}
          {task.status === "paused" && (
            <IconButton title="Resume" onClick={() => resume(task.id)}>
              <Play size={12} />
            </IconButton>
          )}
          {(task.status === "running" || task.status === "paused" || task.status === "queued") && (
            <IconButton title="Cancel" onClick={() => cancel(task.id)}>
              <Square size={12} />
            </IconButton>
          )}
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
        <motion.div
          className={cn(
            "h-full rounded-full",
            task.status === "failed" ? "bg-red-500" : task.status === "completed" ? "bg-emerald-500" : "bg-accent-500",
          )}
          animate={{ width: `${task.status === "completed" ? 100 : pct}%` }}
          transition={{ duration: 0.2 }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-500">
        <span>
          {formatBytes(task.transferred_bytes)} / {formatBytes(task.total_bytes)}
        </span>
        {task.status === "running" && extra && (
          <span className="flex items-center gap-1.5">
            {formatSpeed(extra.speedBps)} · ETA {formatEta(extra.etaSecs)}
            <SpeedSparkline speedBps={extra.speedBps} />
          </span>
        )}
        {task.error && <ErrorNotice raw={task.error} className="text-red-400" />}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TransferTask["status"] }) {
  const styles: Record<TransferTask["status"], string> = {
    queued: "text-zinc-500",
    running: "text-accent-400",
    paused: "text-amber-400",
    completed: "text-emerald-400",
    failed: "text-red-400",
    cancelled: "text-zinc-600",
  };
  return <span className={cn("shrink-0 text-[10px] uppercase tracking-wide", styles[status])}>{status}</span>;
}

export function TransferQueuePanel() {
  const { tasks, order, queueOrder, pauseAll, resumeAll, cancelAll, reorderQueueTo } = useTransferStore();
  const { transferQueueCollapsed, setTransferQueueCollapsed } = useSettingsStore();

  const activeList = useMemo(
    () =>
      order
        .map((id) => tasks[id])
        .filter((t): t is TransferTask => !!t && t.status !== "queued")
        .reverse(),
    [order, tasks],
  );
  const queuedList = useMemo(
    () => queueOrder.map((id) => tasks[id]).filter((t): t is TransferTask => !!t),
    [queueOrder, tasks],
  );
  const active = activeList.filter((t) => t.status === "running").length + queuedList.length;

  return (
    <div className="flex flex-col border-t border-surface-border bg-surface-1">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={() => setTransferQueueCollapsed(!transferQueueCollapsed)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <motion.span animate={{ rotate: transferQueueCollapsed ? -90 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown size={14} className="text-zinc-500" />
          </motion.span>
          <span className="text-xs font-medium text-zinc-300">Transfers</span>
          {active > 0 && (
            <span className="rounded-full bg-accent-600/30 px-1.5 py-0.5 text-[10px] text-accent-300">{active}</span>
          )}
        </button>
        <div className="flex gap-1">
          <IconButton title="Transfer history" onClick={() => useUiStore.getState().openHistoryModal()}>
            <History size={13} />
          </IconButton>
          <IconButton title="Pause all" onClick={() => pauseAll()}>
            <Pause size={13} />
          </IconButton>
          <IconButton title="Resume all" onClick={() => resumeAll()}>
            <Play size={13} />
          </IconButton>
          <IconButton title="Cancel all" onClick={() => cancelAll()}>
            <X size={13} />
          </IconButton>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {!transferQueueCollapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 220 }}
            exit={{ height: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-y-auto"
          >
            {queuedList.length === 0 && activeList.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">No transfers yet</div>
            ) : (
              <>
                {queuedList.length > 0 && (
                  <Reorder.Group
                    axis="y"
                    values={queueOrder}
                    onReorder={reorderQueueTo}
                    as="div"
                    className="border-b border-surface-border/60"
                  >
                    {queuedList.map((t) => (
                      <Reorder.Item key={t.id} value={t.id} as="div" whileDrag={{ scale: 1.01, zIndex: 5 }}>
                        <TaskRow task={t} draggable />
                      </Reorder.Item>
                    ))}
                  </Reorder.Group>
                )}
                <AnimatePresence initial={false}>
                  {activeList.map((t) => (
                    <motion.div
                      key={t.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <TaskRow task={t} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
