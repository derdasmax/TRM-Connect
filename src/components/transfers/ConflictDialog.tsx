import { useState } from "react";
import { ArrowRight, Copy, SkipForward, Upload } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Field";
import { formatBytes, formatDate } from "../../lib/format";
import type { ConflictInfo, ConflictResolution } from "../../hooks/useConflictAwareEnqueue";

interface ConflictDialogProps {
  conflict: ConflictInfo | null;
  remainingCount: number;
  onResolve: (resolution: ConflictResolution, applyToAll: boolean) => void;
}

export function ConflictDialog({ conflict, remainingCount, onResolve }: ConflictDialogProps) {
  const [applyToAll, setApplyToAll] = useState(false);

  if (!conflict) return null;
  const { target, destEntry } = conflict;
  const newer = destEntry.modified && target.modified ? new Date(target.modified) > new Date(destEntry.modified) : null;

  function pick(resolution: ConflictResolution) {
    onResolve(resolution, applyToAll);
    setApplyToAll(false);
  }

  return (
    <Modal open onClose={() => pick("skip")} title="File already exists" width={460}>
      <p className="mb-3 text-sm text-zinc-300">
        <span className="font-medium text-zinc-100">{target.name}</span> already exists at the destination.
        {remainingCount > 1 && (
          <span className="text-zinc-500"> ({remainingCount} conflicts remaining)</span>
        )}
      </p>

      <div className="grid grid-cols-2 gap-2 rounded-lg border border-surface-border bg-surface-2/50 p-3 text-[12px]">
        <div>
          <div className="mb-1 flex items-center gap-1 font-medium text-zinc-400">
            <Upload size={11} /> Source
          </div>
          <div className="text-zinc-200">{formatBytes(target.size)}</div>
          <div className="text-zinc-500">{formatDate(target.modified)}</div>
          {newer === true && <div className="mt-1 text-emerald-400">Newer</div>}
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1 font-medium text-zinc-400">
            <ArrowRight size={11} /> Destination
          </div>
          <div className="text-zinc-200">{formatBytes(destEntry.size)}</div>
          <div className="text-zinc-500">{formatDate(destEntry.modified)}</div>
          {newer === false && <div className="mt-1 text-emerald-400">Newer</div>}
        </div>
      </div>

      {remainingCount > 1 && (
        <div className="mt-3">
          <Checkbox
            label="Apply to all remaining conflicts"
            checked={applyToAll}
            onChange={(e) => setApplyToAll(e.target.checked)}
          />
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={() => pick("skip")}>
          <SkipForward size={14} /> Skip
        </Button>
        <Button variant="secondary" onClick={() => pick("keep-both")}>
          <Copy size={14} /> Keep both
        </Button>
        <Button variant="primary" onClick={() => pick("overwrite")}>
          <Upload size={14} /> Overwrite
        </Button>
      </div>
    </Modal>
  );
}
