import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";
import { useSettingsStore } from "../../store/useSettingsStore";

const MIN_DURATION_MS = 5000;
const BRAND = "TRM-Connect";

interface SplashScreenProps {
  /** True once the real background initialization (site list, transfers, home dir) has settled. */
  appReady: boolean;
  /** Called once the splash should be removed from the DOM (after the exit animation). */
  onExited: () => void;
}

/**
 * A branded splash overlay shown on top of the already-mounting app. The real
 * app underneath starts initializing immediately in parallel - this never
 * gates that work, it only decides how long the overlay itself stays up: at
 * least MIN_DURATION_MS (a deliberate, non-skippable brand moment) and at
 * least until `appReady`, whichever is longer. Not user-skippable by design;
 * the only exception is `prefers-reduced-motion`/the in-app reduce-motion
 * setting, which is an accessibility accommodation, not a shortcut.
 */
export function SplashScreen({ appReady, onExited }: SplashScreenProps) {
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = useSettingsStore((s) => s.reduceMotion) || prefersReducedMotion;

  const [elapsedRatio, setElapsedRatio] = useState(0);
  const [exiting, setExiting] = useState(false);
  const startRef = useRef(performance.now());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Respecting reduced-motion means skipping the manufactured 5s brand
    // delay entirely, not just the animations within it - forcing a wait on
    // someone who's opted out of motion for accessibility reasons would be
    // the wrong trade-off.
    if (reduceMotion) {
      if (appReady) setExiting(true);
      return;
    }
    function tick() {
      const ratio = Math.min(1, (performance.now() - startRef.current) / MIN_DURATION_MS);
      setElapsedRatio(ratio);
      if (ratio >= 1 && appReady) {
        setExiting(true);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appReady, reduceMotion]);

  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(onExited, reduceMotion ? 0 : 500);
    return () => clearTimeout(t);
  }, [exiting, onExited, reduceMotion]);

  const letters = BRAND.split("");

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-surface-0"
      initial={{ opacity: 1 }}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.5, ease: "easeInOut" }}
      style={{ pointerEvents: exiting ? "none" : "auto" }}
      aria-hidden={exiting}
    >
      {/* Atmospheric glow blobs - transform/opacity only, no continuous filter animation. */}
      {!reduceMotion && (
        <>
          <motion.div
            className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-accent-600/30"
            style={{ filter: "blur(110px)" }}
            animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute -bottom-40 -right-32 h-[480px] w-[480px] rounded-full bg-sky-500/20"
            style={{ filter: "blur(120px)" }}
            animate={{ x: [0, -30, 0], y: [0, -20, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          />
          <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500/10"
            style={{ filter: "blur(90px)" }}
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      <div className="relative flex flex-col items-center gap-6">
        <motion.div
          initial={reduceMotion ? false : { scale: 0.4, opacity: 0, rotate: -20 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-600 shadow-[0_0_40px_color-mix(in_srgb,var(--color-accent-600)_55%,transparent)]"
        >
          <Zap size={28} className="text-white" fill="currentColor" />
        </motion.div>

        <div className="flex text-3xl font-semibold tracking-tight text-zinc-100">
          {letters.map((ch, i) => (
            <motion.span
              key={i}
              initial={reduceMotion ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.15 + i * 0.035, ease: [0.16, 1, 0.3, 1] }}
              className={ch === "-" ? "text-accent-400" : undefined}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: reduceMotion ? 0 : 0.7 }}
          className="relative h-1 w-48 overflow-hidden rounded-full bg-surface-2"
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-500 to-accent-300"
            style={{ width: `${elapsedRatio * 100}%` }}
          />
          {!reduceMotion && (
            <motion.div
              className="absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              animate={{ x: ["-3rem", "13rem"] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            />
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
