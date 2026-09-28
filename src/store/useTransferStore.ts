import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api, isTauri } from "../lib/api";
import type { TransferStatusEvent, TransferProgressEvent, TransferChecksumEvent, TransferTask } from "../lib/types";

export interface TransferProgressExtra {
  speedBps: number;
  etaSecs: number | null;
}

export interface EnqueueOptions {
  speedLimitBps?: number;
  verifyChecksum?: boolean;
}

interface TransferState {
  tasks: Record<string, TransferTask>;
  order: string[];
  /** Ids of not-yet-started ("queued") tasks, in the order they'll run next - mirrors
   *  the backend's reorderable deque so drag-and-drop reordering has something to show. */
  queueOrder: string[];
  progressExtra: Record<string, TransferProgressExtra>;
  // A fast (or already-finished-by-the-time-we-look) transfer can have its
  // progress/status events arrive over the IPC event channel before the
  // `enqueue_*` command's response (which carries the task id) has even
  // resolved on the JS side. Events for a not-yet-known task id are stashed
  // here and replayed once the optimistic task entry is created.
  pendingProgress: Record<string, TransferProgressEvent>;
  pendingStatus: Record<string, TransferStatusEvent>;
  init: () => Promise<void>;
  enqueueUpload: (connectionId: string, localPath: string, remotePath: string, opts?: EnqueueOptions) => Promise<void>;
  enqueueDownload: (
    connectionId: string,
    remotePath: string,
    localPath: string,
    opts?: EnqueueOptions,
  ) => Promise<void>;
  pause: (taskId: string) => Promise<void>;
  resume: (taskId: string) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
  cancelAll: () => Promise<void>;
  /** Reorders a still-queued task to `newIndex` within the queued subset (drag-and-drop). */
  reorderQueued: (taskId: string, newIndex: number) => Promise<void>;
  /** Applies a full drag-and-drop reorder of the queued subset in one go. */
  reorderQueueTo: (newOrder: string[]) => void;
  /** Moves a still-queued task to run next. */
  prioritizeQueued: (taskId: string) => Promise<void>;
  setBandwidthLimit: (taskId: string, bytesPerSec: number) => Promise<void>;
  /** @internal used by enqueueUpload/enqueueDownload */
  insertTask: (task: TransferTask) => void;
}

let initialized = false;

function omit<T extends Record<string, unknown>>(record: T, key: string): T {
  const { [key]: _removed, ...rest } = record;
  return rest as T;
}

export const useTransferStore = create<TransferState>((set, get) => ({
  tasks: {},
  order: [],
  queueOrder: [],
  progressExtra: {},
  pendingProgress: {},
  pendingStatus: {},

  init: async () => {
    if (initialized) return;
    initialized = true;

    const tasks = await api.listTransfers().catch(() => []);
    set({
      tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
      order: tasks.map((t) => t.id),
      queueOrder: tasks.filter((t) => t.status === "queued").map((t) => t.id),
    });

    if (!isTauri()) return;

    await listen<TransferProgressEvent>("transfer://progress", (event) => {
      const p = event.payload;
      set((state) => {
        const existing = state.tasks[p.taskId];
        if (!existing) return { pendingProgress: { ...state.pendingProgress, [p.taskId]: p } };
        return {
          tasks: {
            ...state.tasks,
            [p.taskId]: { ...existing, transferred_bytes: p.transferredBytes, total_bytes: p.totalBytes },
          },
          progressExtra: {
            ...state.progressExtra,
            [p.taskId]: { speedBps: p.speedBps, etaSecs: p.etaSecs },
          },
        };
      });
    });

    await listen<TransferStatusEvent>("transfer://status", (event) => {
      const p = event.payload;
      set((state) => {
        const existing = state.tasks[p.taskId];
        const queueOrder = p.status === "queued" ? state.queueOrder : state.queueOrder.filter((id) => id !== p.taskId);
        if (!existing) return { pendingStatus: { ...state.pendingStatus, [p.taskId]: p }, queueOrder };
        return {
          tasks: { ...state.tasks, [p.taskId]: { ...existing, status: p.status, error: p.error } },
          queueOrder,
        };
      });
    });

    await listen<TransferChecksumEvent>("transfer://checksum", (event) => {
      const p = event.payload;
      set((state) => {
        const existing = state.tasks[p.taskId];
        if (!existing) return {};
        return { tasks: { ...state.tasks, [p.taskId]: { ...existing, checksum: p.checksum } } };
      });
    });
  },

  enqueueUpload: async (connectionId, localPath, remotePath, opts) => {
    const taskId = await api.enqueueUpload(
      connectionId,
      localPath,
      remotePath,
      opts?.speedLimitBps,
      opts?.verifyChecksum,
    );
    const now = new Date().toISOString();
    get().insertTask({
      id: taskId,
      connection_id: connectionId,
      direction: "upload",
      local_path: localPath,
      remote_path: remotePath,
      total_bytes: 0,
      transferred_bytes: 0,
      status: "queued",
      error: null,
      mode: "auto",
      started_at: null,
      updated_at: now,
      speed_limit_bps: opts?.speedLimitBps ?? 0,
      verify_checksum: opts?.verifyChecksum ?? false,
      checksum: null,
    });
  },

  enqueueDownload: async (connectionId, remotePath, localPath, opts) => {
    const taskId = await api.enqueueDownload(
      connectionId,
      remotePath,
      localPath,
      opts?.speedLimitBps,
      opts?.verifyChecksum,
    );
    const now = new Date().toISOString();
    get().insertTask({
      id: taskId,
      connection_id: connectionId,
      direction: "download",
      local_path: localPath,
      remote_path: remotePath,
      total_bytes: 0,
      transferred_bytes: 0,
      status: "queued",
      error: null,
      mode: "auto",
      started_at: null,
      updated_at: now,
      speed_limit_bps: opts?.speedLimitBps ?? 0,
      verify_checksum: opts?.verifyChecksum ?? false,
      checksum: null,
    });
  },

  pause: (taskId) => api.pauseTransfer(taskId),
  resume: (taskId) => api.resumeTransfer(taskId),
  cancel: (taskId) => {
    set((state) => ({ queueOrder: state.queueOrder.filter((id) => id !== taskId) }));
    return api.cancelTransfer(taskId);
  },
  pauseAll: async () => {
    await api.pauseAllTransfers();
  },
  resumeAll: async () => {
    await api.resumeAllTransfers();
  },
  cancelAll: async () => {
    set({ queueOrder: [] });
    await api.cancelAllTransfers();
  },

  reorderQueued: async (taskId, newIndex) => {
    set((state) => {
      const without = state.queueOrder.filter((id) => id !== taskId);
      const clamped = Math.max(0, Math.min(newIndex, without.length));
      without.splice(clamped, 0, taskId);
      return { queueOrder: without };
    });
    await api.reorderTransfer(taskId, newIndex);
  },

  prioritizeQueued: async (taskId) => {
    set((state) => ({ queueOrder: [taskId, ...state.queueOrder.filter((id) => id !== taskId)] }));
    await api.prioritizeTransfer(taskId);
  },

  reorderQueueTo: (newOrder) => {
    set({ queueOrder: newOrder });
    // Sequential reinsertion at each target index converges the backend
    // deque to exactly `newOrder`, whether the drag moved one item or
    // several - no need to diff which item moved.
    newOrder.forEach((id, i) => void api.reorderTransfer(id, i));
  },

  setBandwidthLimit: async (taskId, bytesPerSec) => {
    set((state) => {
      const existing = state.tasks[taskId];
      if (!existing) return {};
      return { tasks: { ...state.tasks, [taskId]: { ...existing, speed_limit_bps: bytesPerSec } } };
    });
    await api.setTransferBandwidthLimit(taskId, bytesPerSec);
  },

  // Internal: inserts an optimistically-created task, immediately applying
  // (and clearing) any progress/status event that raced ahead of it.
  insertTask: (task: TransferTask) => {
    set((state) => {
      const progress = state.pendingProgress[task.id];
      const status = state.pendingStatus[task.id];
      const merged: TransferTask = {
        ...task,
        ...(progress && { transferred_bytes: progress.transferredBytes, total_bytes: progress.totalBytes }),
        ...(status && { status: status.status, error: status.error }),
      };
      return {
        tasks: { ...state.tasks, [task.id]: merged },
        order: [...state.order, task.id],
        queueOrder: merged.status === "queued" ? [...state.queueOrder, task.id] : state.queueOrder,
        progressExtra: progress
          ? { ...state.progressExtra, [task.id]: { speedBps: progress.speedBps, etaSecs: progress.etaSecs } }
          : state.progressExtra,
        pendingProgress: omit(state.pendingProgress, task.id),
        pendingStatus: omit(state.pendingStatus, task.id),
      };
    });
  },
}));
