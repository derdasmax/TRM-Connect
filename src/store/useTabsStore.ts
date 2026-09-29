import { create } from "zustand";
import type { ConnectionStatus } from "../lib/ConnectionStatusIcon";

export interface TabMeta {
  id: string;
  title: string;
  status: ConnectionStatus;
}

interface TabsState {
  tabs: TabMeta[];
  activeTabId: string;
  addTab: () => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setTabTitle: (id: string, title: string) => void;
  setTabStatus: (id: string, status: ConnectionStatus) => void;
}

function freshTab(): TabMeta {
  return { id: crypto.randomUUID(), title: "New Tab", status: "disconnected" };
}

const initial = freshTab();

/** Tab metadata only - each tab's actual connection, panes and transfer
 *  state live in its own `ConnectionWorkspace` instance (kept mounted but
 *  hidden while inactive, so switching tabs never drops state or an open
 *  connection). */
export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [initial],
  activeTabId: initial.id,

  addTab: () => {
    const tab = freshTab();
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }));
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    if (tabs.length <= 1) return; // always keep at least one tab
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    const remaining = tabs.filter((t) => t.id !== id);
    const nextActive =
      activeTabId === id ? remaining[Math.min(index, remaining.length - 1)].id : activeTabId;
    set({ tabs: remaining, activeTabId: nextActive });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  setTabTitle: (id, title) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) })),

  setTabStatus: (id, status) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, status } : t)) })),
}));
