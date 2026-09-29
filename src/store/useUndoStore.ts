import { create, type UseBoundStore, type StoreApi } from "zustand";
import { api } from "../lib/api";

export type UndoAction =
  | { type: "rename"; kind: "local" | "remote"; connectionId: string | null; from: string; to: string }
  | { type: "mkdir"; kind: "local" | "remote"; connectionId: string | null; path: string };

interface UndoState {
  undoStack: UndoAction[];
  redoStack: UndoAction[];
  push: (action: UndoAction) => void;
  /** Undoes the most recent action, returning which pane to refresh (or null if there's nothing to undo). */
  undo: () => Promise<"local" | "remote" | null>;
  redo: () => Promise<"local" | "remote" | null>;
}

export type UndoStore = UseBoundStore<StoreApi<UndoState>>;

async function applyInverse(action: UndoAction): Promise<void> {
  if (action.type === "rename") {
    if (action.kind === "local") await api.localRename(action.to, action.from);
    else await api.remoteRename(action.connectionId as string, action.to, action.from);
  } else {
    // Never recurses: if the user added files to the folder since creating
    // it, this fails loudly instead of silently destroying them.
    if (action.kind === "local") await api.localRemoveEmptyDir(action.path);
    else await api.remoteRemoveEmptyDir(action.connectionId as string, action.path);
  }
}

async function applyForward(action: UndoAction): Promise<void> {
  if (action.type === "rename") {
    if (action.kind === "local") await api.localRename(action.from, action.to);
    else await api.remoteRename(action.connectionId as string, action.from, action.to);
  } else {
    if (action.kind === "local") await api.localMkdir(action.path);
    else await api.remoteMkdir(action.connectionId as string, action.path);
  }
}

/** Creates a fresh, independent undo/redo store. Each connection tab owns
 *  one, so undoing in one tab never touches another tab's history. */
export function createUndoStore(): UndoStore {
  return create<UndoState>((set, get) => ({
    undoStack: [],
    redoStack: [],

    push: (action) => set((s) => ({ undoStack: [...s.undoStack, action], redoStack: [] })),

    undo: async () => {
      const stack = get().undoStack;
      if (stack.length === 0) return null;
      const action = stack[stack.length - 1];
      await applyInverse(action);
      set((s) => ({ undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, action] }));
      return action.kind;
    },

    redo: async () => {
      const stack = get().redoStack;
      if (stack.length === 0) return null;
      const action = stack[stack.length - 1];
      await applyForward(action);
      set((s) => ({ redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, action] }));
      return action.kind;
    },
  }));
}
