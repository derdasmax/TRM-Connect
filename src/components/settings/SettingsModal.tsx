import { motion } from "framer-motion";
import { Check, Compass, FolderCog, Gauge, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Checkbox, FieldRow, Input } from "../ui/Field";
import { useSettingsStore, type AccentColor } from "../../store/useSettingsStore";
import { useOnboardingStore } from "../../store/useOnboardingStore";
import { api, isTauri } from "../../lib/api";
import { useToastStore } from "../../store/useToastStore";
import { friendlyMessage } from "../../lib/friendlyError";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const ACCENT_SWATCHES: { id: AccentColor; label: string; hex: string }[] = [
  { id: "violet", label: "Violet", hex: "#7c3aed" },
  { id: "blue", label: "Blue", hex: "#2563eb" },
  { id: "emerald", label: "Emerald", hex: "#059669" },
  { id: "rose", label: "Rose", hex: "#e11d48" },
  { id: "amber", label: "Amber", hex: "#d97706" },
  { id: "cyan", label: "Cyan", hex: "#0891b2" },
];

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const {
    accentColor,
    setAccentColor,
    reduceMotion,
    setReduceMotion,
    globalBandwidthLimitBps,
    setGlobalBandwidthLimitBps,
    verifyChecksumsDefault,
    setVerifyChecksumsDefault,
  } = useSettingsStore();

  const limitMBps = globalBandwidthLimitBps === 0 ? "" : (globalBandwidthLimitBps / (1024 * 1024)).toString();

  const [portable, setPortable] = useState<boolean | null>(null);
  const [switchingPortable, setSwitchingPortable] = useState(false);

  useEffect(() => {
    if (open && isTauri()) void api.isPortableMode().then(setPortable);
  }, [open]);

  async function togglePortable() {
    if (portable === null || switchingPortable) return;
    setSwitchingPortable(true);
    try {
      // On success this never resolves - the backend restarts the process.
      await api.setPortableMode(!portable);
    } catch (e) {
      setSwitchingPortable(false);
      useToastStore.getState().push({
        kind: "error",
        title: "Couldn't switch storage mode",
        message: friendlyMessage(String(e)),
      });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Settings" width={420}>
      <FieldRow label="Accent color">
        <div className="flex gap-2">
          {ACCENT_SWATCHES.map((s) => (
            <button
              key={s.id}
              type="button"
              title={s.label}
              onClick={() => setAccentColor(s.id)}
              className="relative flex h-8 w-8 items-center justify-center rounded-full"
            >
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ backgroundColor: s.hex }}
                initial={false}
                animate={{ scale: accentColor === s.id ? 1 : 0.78 }}
                whileHover={{ scale: accentColor === s.id ? 1 : 0.9 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
              />
              {accentColor === s.id && (
                <motion.span
                  layoutId="accent-check"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                  className="relative"
                >
                  <Check size={14} className="text-white drop-shadow" />
                </motion.span>
              )}
            </button>
          ))}
        </div>
      </FieldRow>

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

      <FieldRow label="Help">
        <Button
          variant="secondary"
          onClick={() => {
            onClose();
            useOnboardingStore.getState().reset();
          }}
        >
          <Compass size={14} /> Replay welcome tour
        </Button>
      </FieldRow>

      {portable !== null && (
        <FieldRow label="Storage">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <FolderCog size={14} className="shrink-0 text-zinc-500" />
            <Checkbox
              label="Portable mode"
              checked={portable}
              disabled={switchingPortable}
              onChange={() => void togglePortable()}
            />
            {switchingPortable && <Loader2 size={13} className="animate-spin text-zinc-500" />}
          </label>
          <p className="mt-1 text-[11px] text-zinc-500">
            Keeps saved connections and settings in a folder next to the app instead of your user
            profile, so the whole thing can run from a USB stick. Saved passwords are then only as
            safe as that folder - anyone with file access to it can read them. Switching restarts
            the app immediately.
          </p>
        </FieldRow>
      )}
    </Modal>
  );
}
