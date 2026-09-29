import { useEffect, useState } from "react";
import { SplashScreen } from "./components/layout/SplashScreen";
import { TabBar } from "./components/layout/TabBar";
import { CommandPalette } from "./components/layout/CommandPalette";
import { ConnectionWorkspace } from "./components/workspace/ConnectionWorkspace";
import { TransferQueuePanel } from "./components/transfers/TransferQueuePanel";
import { SettingsModal } from "./components/settings/SettingsModal";
import { TransferHistoryModal } from "./components/transfers/TransferHistoryModal";
import { ToastContainer } from "./components/layout/ToastContainer";
import { api } from "./lib/api";
import { cn } from "./lib/cn";
import { initSettingsEffects } from "./store/useSettingsStore";
import { useSitesStore } from "./store/useSitesStore";
import { useTabsStore } from "./store/useTabsStore";
import { useTransferStore } from "./store/useTransferStore";
import { useUiStore } from "./store/useUiStore";

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const { load: loadSites } = useSitesStore();
  const { init: initTransfers } = useTransferStore();
  const { tabs, activeTabId } = useTabsStore();
  const settingsModalOpen = useUiStore((s) => s.settingsModalOpen);
  const historyModalOpen = useUiStore((s) => s.historyModalOpen);

  useEffect(() => {
    initSettingsEffects();
    // The splash overlay never gates this - real init starts immediately and
    // runs underneath it; `appReady` only tells the splash when it's allowed
    // to close. Per-tab state (home dir, connections) is resolved by each
    // ConnectionWorkspace itself, not here - only app-wide state lives here.
    Promise.allSettled([loadSites(), initTransfers(), api.localHomeDir()]).then(() => setAppReady(true));
  }, [loadSites, initTransfers]);

  return (
    <div className="flex h-screen flex-col bg-surface-0 text-zinc-200">
      {showSplash && <SplashScreen appReady={appReady} onExited={() => setShowSplash(false)} />}

      <TabBar />

      <div className="flex min-h-0 flex-1 flex-col">
        {tabs.map((tab) => (
          <div key={tab.id} className={cn("flex min-h-0 flex-1 flex-col", tab.id !== activeTabId && "hidden")}>
            <ConnectionWorkspace tabId={tab.id} active={tab.id === activeTabId} />
          </div>
        ))}
      </div>

      <TransferQueuePanel />

      <SettingsModal open={settingsModalOpen} onClose={() => useUiStore.getState().closeSettingsModal()} />
      <TransferHistoryModal open={historyModalOpen} onClose={() => useUiStore.getState().closeHistoryModal()} />
      <CommandPalette />
      <ToastContainer />
    </div>
  );
}
