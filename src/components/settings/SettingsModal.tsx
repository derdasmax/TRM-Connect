import { motion } from "framer-motion";
import {
  ArrowLeftRight,
  Check,
  Compass,
  Download,
  FolderCog,
  Gauge,
  Info,
  Loader2,
  Monitor,
  Palette,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { FieldRow, ToggleSwitch, Input } from "../ui/Field";
import { useSettingsStore, type AccentColor, type ThemeMode } from "../../store/useSettingsStore";
import { useOnboardingStore } from "../../store/useOnboardingStore";
import { useUiStore } from "../../store/useUiStore";
import { api, isTauri } from "../../lib/api";
import { getAppVersion } from "../../lib/updater";
import { useToastStore } from "../../store/useToastStore";
import { friendlyMessage } from "../../lib/friendlyError";
import { cn } from "../../lib/cn";
import { UpdatesSection } from "./UpdatesSection";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const ACCENT_SWATCHES: { id: AccentColor; label: string; hex: string }[] = [
  { id: "blue", label: "Windows Blue", hex: "#0078d4" },
  { id: "violet", label: "Violet", hex: "#7c3aed" },
  { id: "emerald", label: "Emerald", hex: "#059669" },
  { id: "rose", label: "Rose", hex: "#e11d48" },
  { id: "amber", label: "Amber", hex: "#d97706" },
  { id: "cyan", label: "Cyan", hex: "#0891b2" },
];

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "system", label: "System" },
];

type SectionId = import("../../store/useUiStore").SettingsSection;

const NAV_ITEMS: { id: SectionId; label: string; Icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "appearance", label: "Appearance", Icon: Palette },
  { id: "transfers", label: "Transfers", Icon: ArrowLeftRight },
  { id: "updates", label: "Updates", Icon: Download },
  { id: "storage", label: "Storage", Icon: FolderCog },
  { id: "about", label: "About", Icon: Info },
];

/** A Win11-Settings-style card row: label/description on the left, a single
 *  control on the right - the layout every row in the native app uses. */
function SettingsCard({
  icon,
  title,
  description,
  control,
}: {
  icon?: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  control: React.ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-2 px-4 py-3">
      {Icon && <Icon size={18} className="shrink-0 text-zinc-400" />}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-zinc-100">{title}</div>
        {description && <div className="mt-0.5 text-[12px] text-zinc-500">{description}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 font-display text-base font-semibold text-zinc-100">{children}</h3>;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [section, setSection] = useState<SectionId>("appearance");
  const {
    theme,
    setTheme,
    accentColor,
    setAccentColor,
    reduceMotion,
    setReduceMotion,
    globalBandwidthLimitBps,
    setGlobalBandwidthLimitBps,
    verifyChecksumsDefault,
    setVerifyChecksumsDefault,
    confirmBeforeDelete,
    setConfirmBeforeDelete,
  } = useSettingsStore();

  const limitMBps = globalBandwidthLimitBps === 0 ? "" : (globalBandwidthLimitBps / (1024 * 1024)).toString();

  const [portable, setPortable] = useState<boolean | null>(null);
  const [switchingPortable, setSwitchingPortable] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSection(useUiStore.getState().settingsInitialSection);
    if (isTauri()) void api.isPortableMode().then(setPortable);
    void getAppVersion().then(setAppVersion);
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
    <Modal open={open} onClose={onClose} title="Settings" width={640}>
      <div className="-mx-4 -my-4 flex h-[500px]">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-surface-border p-2">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={cn(
                "flex items-center gap-2.5 rounded px-3 py-2 text-left text-[13px] transition-colors duration-150 ease-out",
                section === item.id
                  ? "bg-accent-600/15 font-medium text-accent-300"
                  : "text-zinc-400 hover:bg-surface-2 hover:text-zinc-200",
              )}
            >
              <item.Icon size={15} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {section === "appearance" && (
            <div className="flex flex-col gap-4">
              <SectionHeading>Appearance</SectionHeading>

              <FieldRow label="Theme">
                <div className="flex gap-1.5">
                  {THEME_OPTIONS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={cn(
                        "flex items-center gap-1.5 rounded border px-3 py-1.5 text-[12px] transition-colors duration-150 ease-out",
                        theme === t.id
                          ? "border-accent-600 bg-accent-600/15 text-accent-300"
                          : "border-surface-border bg-surface-2 text-zinc-300 hover:bg-surface-3",
                      )}
                    >
                      <Monitor size={13} /> {t.label}
                    </button>
                  ))}
                </div>
              </FieldRow>

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

              <SettingsCard
                icon={Sparkles}
                title="Reduce animations"
                description="Turns off decorative motion across the app."
                control={<ToggleSwitch checked={reduceMotion} onChange={setReduceMotion} />}
              />
            </div>
          )}

          {section === "transfers" && (
            <div className="flex flex-col gap-3">
              <SectionHeading>Transfers</SectionHeading>

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

              <SettingsCard
                icon={ShieldCheck}
                title="Verify checksum after transfer"
                description="SHA-256, by default for new transfers. SFTP/SCP only - FTP/FTPS can't verify remotely."
                control={<ToggleSwitch checked={verifyChecksumsDefault} onChange={setVerifyChecksumsDefault} />}
              />

              <SettingsCard
                icon={ShieldCheck}
                title="Confirm before deleting"
                description="Ask before removing files or folders."
                control={<ToggleSwitch checked={confirmBeforeDelete} onChange={setConfirmBeforeDelete} />}
              />
            </div>
          )}

          {section === "updates" && <UpdatesSection appVersion={appVersion} />}

          {section === "storage" && (
            <div className="flex flex-col gap-3">
              <SectionHeading>Storage</SectionHeading>
              {portable !== null ? (
                <SettingsCard
                  icon={FolderCog}
                  title="Portable mode"
                  description="Keeps connections and settings in a folder next to the app instead of your user profile, so it can run from a USB stick. Saved passwords are then only as safe as that folder. Switching restarts the app immediately."
                  control={
                    <div className="flex items-center gap-2">
                      {switchingPortable && <Loader2 size={13} className="animate-spin text-zinc-500" />}
                      <ToggleSwitch checked={portable} disabled={switchingPortable} onChange={() => void togglePortable()} />
                    </div>
                  }
                />
              ) : (
                <p className="text-[13px] text-zinc-500">Portable mode is only available in the desktop app.</p>
              )}
            </div>
          )}

          {section === "about" && (
            <div className="flex flex-col gap-3">
              <SectionHeading>About</SectionHeading>
              <SettingsCard
                title="TRM-Connect"
                description={appVersion ? `Version ${appVersion}` : "Version unavailable"}
                control={<span />}
              />
              <SettingsCard
                icon={Compass}
                title="Welcome tour"
                description="Replay the first-run introduction."
                control={
                  <Button
                    variant="secondary"
                    onClick={() => {
                      onClose();
                      useOnboardingStore.getState().reset();
                    }}
                  >
                    Replay
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
