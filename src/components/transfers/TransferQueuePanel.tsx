import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Pause, Play, Square, X, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useMemo } from "react";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useTransferStore } from "../../store/useTransferStore";
import { formatBytes, formatEta, formatSpeed } from "../../lib/format";
import { IconButton } from "../ui/Button";
import { cn } from "../../lib/cn";
import type { TransferTask } from "../../lib/types";

function TaskRow({ task }: { task: TransferTask }) {
  const { pause, resume, cancel } = useTransferStore();
  const extra = useTransferStore((s) => s.progressExtra[task.id]);
  const pct = task.total_bytes > 0 ? Math.min(100, (task.transferred_bytes / task.total_bytes) * 100) : 0;
  const name = (task.direction === "upload" ? task.remote_path : task.local_path).split(/[/\\]/).pop();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="border-b border-surface-border/60 px-3 py-2 text-[12px]"
    >
      <div className="mb-1 flex items-center gap-2">
        {task.direction === "upload" ? (
          <ArrowUpFromLine size={12} className="shrink-0 text-accent-400" />
        ) : (
          <ArrowDownToLine size={12} className="shrink-0 text-accent-400" />
        )}
        <span className="min-w-0 flex-1 truncate text-zinc-200">{name}</span>
        <StatusBadge status={task.status} />
        <div className="flex gap-0.5">
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
      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
        <span>
          {formatBytes(task.transferred_bytes)} / {formatBytes(task.total_bytes)}
        </span>
        {task.status === "running" && extra && (
          <span>
            {formatSpeed(extra.speedBps)} · ETA {formatEta(extra.etaSecs)}
          </span>
        )}
        {task.error && <span className="text-red-400">{task.error}</span>}
      </div>
    </motion.div>
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
  const { tasks, order, pauseAll, resumeAll, cancelAll } = useTransferStore();
  const { transferQueueCollapsed, setTransferQueueCollapsed } = useSettingsStore();

  const list = useMemo(() => order.map((id) => tasks[id]).filter(Boolean).reverse(), [order, tasks]);
  const active = list.filter((t) => t.status === "running" || t.status === "queued").length;

  return (
    <div className="flex flex-col border-t border-surface-border bg-surface-1">
      <button
        onClick={() => setTransferQueueCollapsed(!transferQueueCollapsed)}
        className="flex items-center gap-2 px-3 py-1.5 text-left"
      >
        <motion.span animate={{ rotate: transferQueueCollapsed ? -90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={14} className="text-zinc-500" />
        </motion.span>
        <span className="text-xs font-medium text-zinc-300">Transfers</span>
        {active > 0 && (
          <span className="rounded-full bg-accent-600/30 px-1.5 py-0.5 text-[10px] text-accent-300">{active}</span>
        )}
        <div className="ml-auto flex gap-1" onClick={(e) => e.stopPropagation()}>
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
      </button>
      <AnimatePresence initial={false}>
        {!transferQueueCollapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 220 }}
            exit={{ height: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-y-auto"
          >
            {list.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">No transfers yet</div>
            ) : (
              <AnimatePresence initial={false}>
                {list.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </AnimatePresence>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
