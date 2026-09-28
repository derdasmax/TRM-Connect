import { Gauge, ShieldCheck, Sparkles } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Checkbox, FieldRow, Input } from "../ui/Field";
import { useSettingsStore } from "../../store/useSettingsStore";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    reduceMotion,
    setReduceMotion,
    globalBandwidthLimitBps,
    setGlobalBandwidthLimitBps,
    verifyChecksumsDefault,
    setVerifyChecksumsDefault,
  } = useSettingsStore();

  const limitMBps = globalBandwidthLimitBps === 0 ? "" : (globalBandwidthLimitBps / (1024 * 1024)).toString();

  return (
    <Modal open={open} onClose={onClose} title="Settings" width={420}>
      <FieldRow label="Global bandwidth limit">
        <div className="flex items-center gap-2">
          <Gauge size={14} className="shrink-0 text-zinc-500" />
          <Input
            type="number"
            min={0}
            step="0.1"
            placeholder="Unlimited"
            value={limitMBps}
            onChange={(e) => {
              const mb = parseFloat(e.target.value);
              setGlobalBandwidthLimitBps(!e.target.value || Number.isNaN(mb) || mb <= 0 ? 0 : Math.round(mb * 1024 * 1024));
            }}
          />
          <span className="shrink-0 text-xs text-zinc-500">MB/s</span>
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">
          Shared across every active transfer. Leave empty for unlimited. Individual transfers can also be
          throttled from the queue panel.
        </p>
      </FieldRow>

      <FieldRow label="Transfers">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <ShieldCheck size={14} className="shrink-0 text-zinc-500" />
          <Checkbox
            label="Verify checksum (SHA-256) after transfer by default"
            checked={verifyChecksumsDefault}
            onChange={(e) => setVerifyChecksumsDefault(e.target.checked)}
          />
        </label>
        <p className="mt-1 text-[11px] text-zinc-500">
          Only SFTP and SCP can compute a remote hash; FTP/FTPS transfers skip verification.
        </p>
      </FieldRow>

      <FieldRow label="Motion">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <Sparkles size={14} className="shrink-0 text-zinc-500" />
          <Checkbox
            label="Reduce animations"
            checked={reduceMotion}
            onChange={(e) => setReduceMotion(e.target.checked)}
          />
        </label>
      </FieldRow>
    </Modal>
  );
}
