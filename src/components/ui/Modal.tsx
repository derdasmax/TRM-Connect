import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            className="flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-surface-border bg-surface-1 shadow-2xl"
            style={{ width }}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
              <h2 className="text-sm font-medium text-zinc-100">{title}</h2>
              <button
                onClick={onClose}
                className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-surface-2 hover:text-zinc-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
