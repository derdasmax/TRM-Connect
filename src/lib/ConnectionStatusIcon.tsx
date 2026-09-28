import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Plug, PlugZap, ShieldAlert, Unplug } from "lucide-react";
import { cn } from "./cn";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error" | "syncing";

const STATUS_CONFIG: Record<ConnectionStatus, { Icon: typeof Plug; colorClass: string; spin?: boolean }> = {
  disconnected: { Icon: Unplug, colorClass: "text-zinc-500" },
  connecting: { Icon: Loader2, colorClass: "text-accent-400", spin: true },
  connected: { Icon: PlugZap, colorClass: "text-emerald-400" },
  error: { Icon: ShieldAlert, colorClass: "text-red-400" },
  syncing: { Icon: Loader2, colorClass: "text-accent-400", spin: true },
};

interface ConnectionStatusIconProps {
  status: ConnectionStatus;
  size?: number;
  className?: string;
}

/** A small, animated status glyph that cross-fades between connection states. */
export function ConnectionStatusIcon({ status, size = 14, className }: ConnectionStatusIconProps) {
  const { Icon, colorClass, spin } = STATUS_CONFIG[status];
  return (
    <span className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, scale: 0.6, rotate: -15 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={{ opacity: 0, scale: 0.6, rotate: 15 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <Icon size={size} className={cn(colorClass, spin && "animate-spin")} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
