import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api, isTauri } from "../lib/api";
import type { TransferStatusEvent, TransferProgressEvent, TransferTask } from "../lib/types";

export interface TransferProgressExtra {
  speedBps: number;
  etaSecs: number | null;
}

interface TransferState {
  tasks: Record<string, TransferTask>;
  order: string[];
  progressExtra: Record<string, TransferProgressExtra>;
  // A fast (or already-finished-by-the-time-we-look) transfer can have its
  // progress/status events arrive over the IPC event channel before the
  // `enqueue_*` command's response (which carries the task id) has even
  // resolved on the JS side. Events for a not-yet-known task id are stashed
  // here and replayed once the optimistic task entry is created.
  pendingProgress: Record<string, TransferProgressEvent>;
  pendingStatus: Record<string, TransferStatusEvent>;
  init: () => Promise<void>;
  enqueueUpload: (connectionId: string, localPath: string, remotePath: string) => Promise<void>;
  enqueueDownload: (connectionId: string, remotePath: string, localPath: string) => Promise<void>;
  pause: (taskId: string) => Promise<void>;
  resume: (taskId: string) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
  cancelAll: () => Promise<void>;
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
        if (!existing) return { pendingStatus: { ...state.pendingStatus, [p.taskId]: p } };
        return {
          tasks: { ...state.tasks, [p.taskId]: { ...existing, status: p.status, error: p.error } },
        };
      });
    });
  },

  enqueueUpload: async (connectionId, localPath, remotePath) => {
    const taskId = await api.enqueueUpload(connectionId, localPath, remotePath);
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
    });
  },

  enqueueDownload: async (connectionId, remotePath, localPath) => {
    const taskId = await api.enqueueDownload(connectionId, remotePath, localPath);
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
    });
  },

  pause: (taskId) => api.pauseTransfer(taskId),
  resume: (taskId) => api.resumeTransfer(taskId),
  cancel: (taskId) => api.cancelTransfer(taskId),
  pauseAll: async () => {
    await api.pauseAllTransfers();
  },
  resumeAll: async () => {
    await api.resumeAllTransfers();
  },
  cancelAll: async () => {
    await api.cancelAllTransfers();
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
        progressExtra: progress
          ? { ...state.progressExtra, [task.id]: { speedBps: progress.speedBps, etaSecs: progress.etaSecs } }
          : state.progressExtra,
        pendingProgress: omit(state.pendingProgress, task.id),
        pendingStatus: omit(state.pendingStatus, task.id),
      };
    });
  },
}));
