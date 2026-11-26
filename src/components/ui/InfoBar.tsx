import { Info, TriangleAlert, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { IconButton } from "./Button";
import { X } from "lucide-react";

type InfoBarVariant = "error" | "warning" | "info";

const VARIANTS: Record<InfoBarVariant, { wrap: string; icon: string; Icon: typeof Info }> = {
  error: { wrap: "border-red-900/40 bg-red-950/40 text-red-300", icon: "text-red-400", Icon: XCircle },
  warning: { wrap: "border-amber-900/40 bg-amber-950/30 text-amber-200", icon: "text-amber-400", Icon: TriangleAlert },
  info: { wrap: "border-accent-900/40 bg-accent-950/20 text-accent-200", icon: "text-accent-400", Icon: Info },
};

interface InfoBarProps {
  variant: InfoBarVariant;
  /** Overrides the variant's default icon (e.g. a spinner while reconnecting). */
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
}

/**
 * Fluent "InfoBar": a rounded, inset, left-accented notice row, replacing
 * the old edge-to-edge bordered banners. Used for every status/decision
 * notice in the workspace (connect errors, reconnect progress, host-key
 * trust, session restore).
 */
export function InfoBar({ variant, icon, children, actions, onDismiss }: InfoBarProps) {
  const { wrap, icon: iconCls, Icon } = VARIANTS[variant];
  return (
    <div className={cn("mx-3 mt-2 flex items-start gap-2.5 rounded border border-l-[3px] px-3 py-2 text-[13px]", wrap)}>
      <span className={cn("mt-0.5 shrink-0", iconCls)}>{icon ?? <Icon size={15} />}</span>
      <div className="min-w-0 flex-1 py-0.5">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {onDismiss && (
        <IconButton onClick={onDismiss} title="Dismiss" className={cn("shrink-0", iconCls)}>
          <X size={14} />
        </IconButton>
      )}
    </div>
  );
}
