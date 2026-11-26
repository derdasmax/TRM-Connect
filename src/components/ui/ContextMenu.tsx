import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ComponentType } from "react";
import { cn } from "../../lib/cn";

export interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: ComponentType<{ size?: number; className?: string }>;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[] | null;
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!items) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", esc);
    };
  }, [items, onClose]);

  return (
    <AnimatePresence>
      {items && (
        <motion.div
          ref={ref}
          className="glass-flyout fixed z-50 min-w-[170px] overflow-hidden py-1"
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <div key={i}>
                {item.separatorBefore && <div className="my-1 h-px bg-surface-border" />}
                <button
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                  className={cn(
                    "group flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    item.danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-200 hover:bg-surface-3",
                  )}
                >
                  {Icon && (
                    <Icon size={13} className="shrink-0 text-zinc-500 transition-transform group-hover:scale-110 group-hover:text-current" />
                  )}
                  {item.label}
                </button>
              </div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
