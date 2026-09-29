import { useState } from "react";
import { Trash2, X as XIcon } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Field";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { DirEntry } from "../../lib/types";

interface DeleteConfirmDialogProps {
  entries: DirEntry[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({ entries, onCancel, onConfirm }: DeleteConfirmDialogProps) {
  const setConfirmBeforeDelete = useSettingsStore((s) => s.setConfirmBeforeDelete);
  const [dontAskAgain, setDontAskAgain] = useState(false);

  if (!entries) return null;
  const names = entries.slice(0, 5).map((e) => e.name);
  const more = entries.length - names.length;

  return (
    <Modal open onClose={onCancel} title="Delete files?" width={400}>
      <p className="mb-2 text-sm text-zinc-300">
        Delete {entries.length} item{entries.length === 1 ? "" : "s"}? This cannot be undone.
      </p>
      <ul className="mb-3 max-h-32 list-disc space-y-0.5 overflow-y-auto rounded-md bg-surface-2/50 px-6 py-2 text-[12px] text-zinc-400">
        {names.map((n) => (
          <li key={n} className="truncate">
            {n}
          </li>
        ))}
        {more > 0 && <li>… and {more} more</li>}
      </ul>
      <Checkbox
        label="Don't ask me again"
        checked={dontAskAgain}
        onChange={(e) => setDontAskAgain(e.target.checked)}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          <XIcon size={14} /> Cancel
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (dontAskAgain) setConfirmBeforeDelete(false);
            onConfirm();
          }}
        >
          <Trash2 size={14} /> Delete
        </Button>
      </div>
    </Modal>
  );
}
