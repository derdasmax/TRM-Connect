import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Download, Minus, Square, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { isTauri } from "../../lib/api";
import { useUiStore } from "../../store/useUiStore";
import { useUpdateStore } from "../../store/useUpdateStore";
import { TabBar } from "./TabBar";

const appWindow = isTauri() ? getCurrentWindow() : null;

/**
 * Replaces the native Windows titlebar (`decorations: false` in
 * tauri.conf.json) with a Fluent-style one: app icon, the existing tab
 * strip, a draggable empty region, and Win11-style window buttons
 * (minimize/maximize-restore/close, the last with the signature red hover).
 * Sits directly on the Mica canvas - it has no background of its own.
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const updateStatus = useUpdateStore((s) => s.status);
  const updateVersion = useUpdateStore((s) => s.version);

  useEffect(() => {
    if (!appWindow) return;
    void appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      void appWindow!.isMaximized().then(setMaximized);
    });
    return () => void unlisten.then((u) => u());
  }, []);

  return (
    <div data-tauri-drag-region className="flex h-9 shrink-0 items-center gap-1 pl-2">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-accent-600">
        <Zap size={12} className="text-white" fill="currentColor" />
      </div>

      <div data-tauri-drag-region className="min-w-0 flex-1">
        <TabBar />
      </div>

      <AnimatePresence>
        {(updateStatus === "available" || updateStatus === "downloading" || updateStatus === "ready") && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
            onClick={() => useUiStore.getState().openSettingsModal("updates")}
            className="mr-2 flex shrink-0 items-center gap-1.5 rounded-full bg-accent-600/20 px-2.5 py-1 text-[11px] font-medium text-accent-300 transition-colors duration-150 ease-out hover:bg-accent-600/30"
          >
            <Download size={11} />
            {updateStatus === "ready" ? "Restart to update" : `Update ${updateVersion ?? ""}`}
          </motion.button>
        )}
      </AnimatePresence>

      <div className="flex h-full shrink-0 items-stretch">
        <button
          title="Minimize"
          aria-label="Minimize"
          onClick={() => void appWindow?.minimize()}
          className="window-control flex w-11 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <Minus size={14} />
        </button>
        <button
          title={maximized ? "Restore" : "Maximize"}
          aria-label={maximized ? "Restore" : "Maximize"}
          onClick={() => void appWindow?.toggleMaximize()}
          className="window-control flex w-11 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-100"
        >
          {maximized ? <Copy size={12} className="scale-x-[-1]" /> : <Square size={11} />}
        </button>
        <button
          title="Close"
          aria-label="Close"
          onClick={() => void appWindow?.close()}
          className="window-control window-control-close flex w-11 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-100"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
