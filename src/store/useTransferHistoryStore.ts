import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ChecksumStatus, TransferDirection, TransferStatus } from "../lib/types";

export interface TransferHistoryEntry {
  id: string;
  direction: TransferDirection;
  name: string;
  localPath: string;
  remotePath: string;
  totalBytes: number;
  /** "completed" | "failed" | "cancelled" - the terminal status reached. */
  status: Extract<TransferStatus, "completed" | "failed" | "cancelled">;
  error: string | null;
  checksum: ChecksumStatus | null;
  /** Site name if connected via a saved site, else null (quick connect). */
  siteName: string | null;
  finishedAt: string;
}

const MAX_ENTRIES = 500;

interface TransferHistoryState {
  entries: TransferHistoryEntry[];
  record: (entry: TransferHistoryEntry) => void;
  clear: () => void;
}

/** A persisted log of every transfer that reached a terminal state, capped
 *  at MAX_ENTRIES (oldest dropped first) so it can't grow unbounded across
 *  the lifetime of an install. Separate from `useTransferStore`, which only
 *  tracks the current session's in-flight/queued tasks. */
export const useTransferHistoryStore = create<TransferHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      record: (entry) =>
        set((s) => ({ entries: [entry, ...s.entries].slice(0, MAX_ENTRIES) })),
      clear: () => set({ entries: [] }),
    }),
    { name: "trm-connect.transfer-history" },
  ),
);
