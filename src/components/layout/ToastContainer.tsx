import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from "lucide-react";
import { useToastStore, type ToastKind } from "../../store/useToastStore";
import { cn } from "../../lib/cn";

const KIND_CONFIG: Record<ToastKind, { Icon: typeof Info; cls: string }> = {
  success: { Icon: CheckCircle2, cls: "text-emerald-400" },
  error: { Icon: XCircle, cls: "text-red-400" },
  warning: { Icon: TriangleAlert, cls: "text-amber-400" },
  info: { Icon: Info, cls: "text-accent-400" },
};

/** Fire-and-forget contextual notifications (transfer done/failed, connection
 *  lost) that slide in from the edge and auto-dismiss - unlike the banners
 *  in ConnectionWorkspace, which stay until the user acts because they gate
 *  a decision. Stacked bottom-right, above the transfer queue panel. */
export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const { Icon, cls } = KIND_CONFIG[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95, transition: { duration: 0.15 } }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-surface-border bg-surface-2/95 p-3 shadow-xl backdrop-blur"
            >
              <Icon size={16} className={cn("mt-0.5 shrink-0", cls)} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-zinc-100">{toast.title}</div>
                {toast.message && <div className="mt-0.5 truncate text-[11px] text-zinc-400">{toast.message}</div>}
              </div>
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-surface-3 hover:text-zinc-300"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
