import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "../../lib/cn";

export interface MenuItem {
  label: string;
  onClick: () => void;
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
          className="fixed z-50 min-w-[160px] overflow-hidden rounded-lg border border-surface-border bg-surface-2 py-1 shadow-2xl"
          style={{ left: x, top: y }}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.1 }}
        >
          {items.map((item, i) => (
            <div key={i}>
              {item.separatorBefore && <div className="my-1 h-px bg-surface-border" />}
              <button
                disabled={item.disabled}
                onClick={() => {
                  item.onClick();
                  onClose();
                }}
                className={cn(
                  "block w-full px-3 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  item.danger ? "text-red-400 hover:bg-red-500/10" : "text-zinc-200 hover:bg-surface-3",
                )}
              >
                {item.label}
              </button>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
