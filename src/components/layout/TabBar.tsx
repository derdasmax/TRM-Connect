import { AnimatePresence, motion } from "framer-motion";
import { Plus, X } from "lucide-react";
import { ConnectionStatusIcon } from "../../lib/ConnectionStatusIcon";
import { cn } from "../../lib/cn";
import { IconButton } from "../ui/Button";
import { useTabsStore } from "../../store/useTabsStore";

/** The tab strip itself - mounted inside `TitleBar`, which supplies the app
 *  icon, drag region, and window buttons around it. */
export function TabBar() {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useTabsStore();

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 px-1">
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        <AnimatePresence initial={false}>
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <motion.button
                key={tab.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group relative flex h-7 max-w-[180px] shrink-0 items-center gap-1.5 rounded px-2.5 text-[12px] transition-colors",
                  active ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {active && (
                  <motion.div
                    layoutId="active-tab-bg"
                    className="absolute inset-0 rounded bg-surface-2"
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
                <span className="relative shrink-0">
                  <ConnectionStatusIcon status={tab.status} size={11} />
                </span>
                <span className="relative min-w-0 flex-1 truncate">{tab.title}</span>
                {tabs.length > 1 && (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className="relative shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-surface-3 group-hover:opacity-100"
                  >
                    <X size={11} />
                  </span>
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      <IconButton title="New tab" onClick={() => addTab()}>
        <Plus size={14} />
      </IconButton>
    </div>
  );
}
