import { Fragment, useEffect, useState } from "react";
import { Check, X as XIcon } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import type { DirEntry } from "../../lib/types";

interface ChmodDialogProps {
  entry: DirEntry | null;
  onClose: () => void;
  onSubmit: (mode: number) => Promise<void>;
}

const ROLES = ["owner", "group", "other"] as const;
const BITS = [
  { label: "Read", bit: 4 },
  { label: "Write", bit: 2 },
  { label: "Execute", bit: 1 },
] as const;

export function ChmodDialog({ entry, onClose, onSubmit }: ChmodDialogProps) {
  const [octal, setOctal] = useState("755");

  useEffect(() => {
    if (entry?.permissions != null) {
      setOctal((entry.permissions & 0o777).toString(8).padStart(3, "0"));
    }
  }, [entry]);

  const digits = octal.padStart(3, "0").split("").map(Number);

  const toggle = (roleIdx: number, bit: number) => {
    const next = [...digits];
    next[roleIdx] = next[roleIdx] ^ bit;
    setOctal(next.map((d) => Math.max(0, Math.min(7, d))).join(""));
  };

  return (
    <Modal open={!!entry} onClose={onClose} title={`Permissions: ${entry?.name ?? ""}`} width={380}>
      <div className="mb-4 grid grid-cols-[80px_1fr_1fr_1fr] items-center gap-y-2 text-sm">
        <div />
        {ROLES.map((r) => (
          <div key={r} className="text-center text-xs font-medium text-zinc-400 capitalize">
            {r}
          </div>
        ))}
        {BITS.map(({ label, bit }) => (
          <Fragment key={label}>
            <div className="text-xs text-zinc-400">{label}</div>
            {ROLES.map((role, roleIdx) => (
              <div key={role + label} className="flex justify-center">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-accent-600"
                  checked={(digits[roleIdx] & bit) !== 0}
                  onChange={() => toggle(roleIdx, bit)}
                />
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-zinc-400">Octal</span>
        <input
          value={octal}
          onChange={(e) => /^[0-7]{0,3}$/.test(e.target.value) && setOctal(e.target.value)}
          className="w-16 rounded border border-surface-border bg-surface-2 px-2 py-1 text-center font-mono text-sm text-zinc-100 outline-none focus:border-accent-500"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          <XIcon size={14} /> Cancel
        </Button>
        <Button variant="primary" onClick={() => onSubmit(parseInt(octal.padStart(3, "0"), 8))}>
          <Check size={14} /> Apply
        </Button>
      </div>
    </Modal>
  );
}
