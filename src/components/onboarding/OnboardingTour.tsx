import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ComponentType } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  FolderSync,
  Search,
  Server,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { Button } from "../ui/Button";
import { useSettingsStore } from "../../store/useSettingsStore";

interface Step {
  Icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}

const STEPS: Step[] = [
  {
    Icon: Zap,
    title: "Welcome to TRM-Connect",
    description:
      "A fast, modern SFTP/SCP/FTP(S) client. This quick tour covers the essentials - skip it any time and find it again from Settings.",
  },
  {
    Icon: Columns2,
    title: "Two panes, one workflow",
    description:
      "Local on the left, remote on the right. Drag files across, or select and use the transfer button - multi-select, marquee-select, and keyboard navigation all work on both sides.",
  },
  {
    Icon: Server,
    title: "Connections that look after themselves",
    description:
      "Save a site once and reconnect in a click. A live latency indicator shows reachability, and a dropped connection reconnects automatically with a visible status while it does.",
  },
  {
    Icon: Search,
    title: "Command Palette",
    description: "Press Ctrl+K anywhere to jump to a saved connection, a recent remote path, or any app action by name.",
  },
  {
    Icon: FolderSync,
    title: "Sync and preview like a pro",
    description:
      "\"Sync directories\" shows a diff before touching anything, and Quick Look (Space) previews and edits most file types with real syntax highlighting.",
  },
  {
    Icon: ShieldCheck,
    title: "Your data, your terms",
    description:
      "Saved passwords are encrypted at rest. Portable mode keeps everything in a folder next to the app, and optional cloud sync carries your connections between machines - encrypted with a passphrase only you know.",
  },
];

interface OnboardingTourProps {
  onDone: () => void;
}

/** A short, skippable slideshow shown once on first launch. Unlike the
 *  splash screen (a deliberate, non-skippable brand moment), this exists
 *  purely to orient a new user - forcing them through it would defeat the
 *  point, so Skip and Escape both end it immediately. */
export function OnboardingTour({ onDone }: OnboardingTourProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion) || prefersReducedMotion;
  const [index, setIndex] = useState(0);

  const isLast = index === STEPS.length - 1;
  const step = STEPS[index];

  function next() {
    if (isLast) onDone();
    else setIndex((i) => i + 1);
  }
  function back() {
    setIndex((i) => Math.max(0, i - 1));
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDone();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <motion.div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.25 }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-[min(90vw,460px)] overflow-hidden rounded-2xl border border-surface-border bg-surface-1 shadow-2xl"
      >
        <button
          onClick={onDone}
          aria-label="Skip tour"
          className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-surface-2 hover:text-zinc-300"
        >
          Skip tour <X size={12} />
        </button>

        <div className="flex min-h-[280px] flex-col items-center justify-center px-8 pb-6 pt-12 text-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-4"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-600 shadow-[0_0_30px_color-mix(in_srgb,var(--color-accent-600)_40%,transparent)]">
                <step.Icon size={26} className="text-white" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">{step.title}</h2>
              <p className="text-sm leading-relaxed text-zinc-400">{step.description}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between border-t border-surface-border px-5 py-3">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-4 bg-accent-500" : "w-1.5 bg-surface-3"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="ghost" onClick={back} className="!px-2.5">
                <ChevronLeft size={14} />
              </Button>
            )}
            <Button variant="primary" onClick={next}>
              {isLast ? "Get started" : "Next"}
              {!isLast && <ChevronRight size={14} />}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
