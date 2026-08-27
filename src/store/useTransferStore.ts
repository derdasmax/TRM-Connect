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
  init: () => Promise<void>;
  enqueueUpload: (connectionId: string, localPath: string, remotePath: string) => Promise<void>;
  enqueueDownload: (connectionId: string, remotePath: string, localPath: string) => Promise<void>;
  pause: (taskId: string) => Promise<void>;
  resume: (taskId: string) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
  pauseAll: () => Promise<void>;
  resumeAll: () => Promise<void>;
  cancelAll: () => Promise<void>;
}

let initialized = false;

export const useTransferStore = create<TransferState>((set) => ({
  tasks: {},
  order: [],
  progressExtra: {},

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
        if (!existing) return state;
        return {
          tasks: {
            ...state.tasks,
            [p.taskId]: {
              ...existing,
              transferred_bytes: p.transferredBytes,
              total_bytes: p.totalBytes,
            },
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
        if (!existing) return state;
        return {
          tasks: {
            ...state.tasks,
            [p.taskId]: { ...existing, status: p.status, error: p.error },
          },
        };
      });
    });
  },

  enqueueUpload: async (connectionId, localPath, remotePath) => {
    const taskId = await api.enqueueUpload(connectionId, localPath, remotePath);
    const now = new Date().toISOString();
    const task: TransferTask = {
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
    };
    set((state) => ({ tasks: { ...state.tasks, [taskId]: task }, order: [...state.order, taskId] }));
  },

  enqueueDownload: async (connectionId, remotePath, localPath) => {
    const taskId = await api.enqueueDownload(connectionId, remotePath, localPath);
    const now = new Date().toISOString();
    const task: TransferTask = {
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
    };
    set((state) => ({ tasks: { ...state.tasks, [taskId]: task }, order: [...state.order, taskId] }));
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
}));
