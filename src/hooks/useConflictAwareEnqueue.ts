import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { joinPath } from "../lib/format";
import { useTransferStore, type EnqueueOptions } from "../store/useTransferStore";
import type { DirEntry } from "../lib/types";

export type ConflictResolution = "overwrite" | "skip" | "keep-both";

export interface TransferTarget {
  sourcePath: string;
  destDir: string;
  name: string;
  sep: "/" | "\\";
  size: number;
  modified: string | null;
}

export interface ConflictInfo {
  target: TransferTarget;
  destEntry: DirEntry;
}

interface ConflictQueueState {
  direction: "upload" | "download";
  connectionId: string;
  opts?: EnqueueOptions;
  conflicts: ConflictInfo[];
  index: number;
}

/** Splits "name.ext" into ["name", ".ext"] (no dot for extension-less names). */
function splitExt(name: string): [string, string] {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return [name, ""];
  return [name.slice(0, idx), name.slice(idx)];
}

/** Enqueues uploads/downloads, pausing on destination conflicts so the
 *  caller can render a diff dialog and let the user choose per-file. */
export function useConflictAwareEnqueue() {
  const { enqueueUpload, enqueueDownload } = useTransferStore();
  const [queue, setQueue] = useState<ConflictQueueState | null>(null);

  const statDest = useCallback(
    (direction: "upload" | "download", connectionId: string, path: string) =>
      direction === "upload" ? api.remoteStat(connectionId, path) : api.localStat(path),
    [],
  );

  const enqueueOne = useCallback(
    (direction: "upload" | "download", connectionId: string, target: TransferTarget, destName: string, opts?: EnqueueOptions) => {
      const destPath = joinPath(target.destDir, destName, target.sep);
      if (direction === "upload") void enqueueUpload(connectionId, target.sourcePath, destPath, opts);
      else void enqueueDownload(connectionId, target.sourcePath, destPath, opts);
    },
    [enqueueUpload, enqueueDownload],
  );

  /** Finds a non-conflicting "name (2).ext"-style name for `keep-both`. */
  const uniqueName = useCallback(
    async (direction: "upload" | "download", connectionId: string, destDir: string, sep: "/" | "\\", name: string) => {
      const [base, ext] = splitExt(name);
      for (let n = 2; n < 100; n++) {
        const candidate = `${base} (${n})${ext}`;
        const exists = await statDest(direction, connectionId, joinPath(destDir, candidate, sep));
        if (!exists) return candidate;
      }
      return `${base} (${Date.now()})${ext}`;
    },
    [statDest],
  );

  const start = useCallback(
    async (direction: "upload" | "download", connectionId: string, targets: TransferTarget[], opts?: EnqueueOptions) => {
      const conflicts: ConflictInfo[] = [];
      for (const target of targets) {
        const destPath = joinPath(target.destDir, target.name, target.sep);
        const destEntry = await statDest(direction, connectionId, destPath);
        if (destEntry) conflicts.push({ target, destEntry });
        else enqueueOne(direction, connectionId, target, target.name, opts);
      }
      if (conflicts.length > 0) setQueue({ direction, connectionId, opts, conflicts, index: 0 });
    },
    [statDest, enqueueOne],
  );

  const resolve = useCallback(
    async (resolution: ConflictResolution, applyToAll: boolean) => {
      if (!queue) return;
      const { direction, connectionId, opts, conflicts, index } = queue;
      const remaining = applyToAll ? conflicts.slice(index) : [conflicts[index]];

      for (const { target } of remaining) {
        if (resolution === "skip") continue;
        if (resolution === "overwrite") {
          enqueueOne(direction, connectionId, target, target.name, opts);
        } else {
          const name = await uniqueName(direction, connectionId, target.destDir, target.sep, target.name);
          enqueueOne(direction, connectionId, target, name, opts);
        }
      }

      const nextIndex = applyToAll ? conflicts.length : index + 1;
      if (nextIndex >= conflicts.length) setQueue(null);
      else setQueue({ ...queue, index: nextIndex });
    },
    [queue, enqueueOne, uniqueName],
  );

  const current = queue ? queue.conflicts[queue.index] : null;
  const remainingCount = queue ? queue.conflicts.length - queue.index : 0;

  return { current, remainingCount, start, resolve };
}
