import { motion, AnimatePresence } from "framer-motion";
import { FileStack, Loader2, UploadCloud } from "lucide-react";
import { formatBytes } from "../../lib/format";

export interface DragGhostInfo {
  x: number;
  y: number;
  name: string;
  count: number;
  totalSize: number | null;
  /** Whether the pointer is currently over a valid drop target. */
  armed: boolean;
}

/** Follows the cursor while an OS file drag is in progress over the window,
 *  showing what's being dragged (name/count and total size) before the
 *  user commits to the drop - Tauri only hands us the real file paths on
 *  "enter"/"drop", not a native drag image we could otherwise customize. */
export function DragGhost({ info }: { info: DragGhostInfo | null }) {
  return (
    <AnimatePresence>
      {info && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: info.armed ? 1.05 : 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="glass-flyout pointer-events-none fixed z-50 flex items-center gap-2 px-3 py-2 text-[12px] text-zinc-200"
          style={{ left: info.x + 16, top: info.y + 16 }}
        >
          <motion.span
            animate={info.armed ? { y: [0, -2, 0] } : { y: 0 }}
            transition={{ duration: 0.6, repeat: info.armed ? Infinity : 0, ease: "easeInOut" }}
            className={info.armed ? "text-accent-400" : "text-zinc-500"}
          >
            {info.armed ? <UploadCloud size={16} /> : <FileStack size={16} />}
          </motion.span>
          <span className="max-w-[220px] truncate font-medium">{info.name}</span>
          <span className="shrink-0 text-zinc-500">
            {info.totalSize == null ? (
              <Loader2 size={11} className="inline animate-spin" />
            ) : (
              formatBytes(info.totalSize)
            )}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
