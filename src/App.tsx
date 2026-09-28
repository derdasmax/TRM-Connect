import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Plug, Server, ShieldCheck, X } from "lucide-react";
import { TopBar } from "./components/layout/TopBar";
import { SplashScreen } from "./components/layout/SplashScreen";
import { Pane } from "./components/browser/Pane";
import { TransferQueuePanel } from "./components/transfers/TransferQueuePanel";
import { SiteManagerModal } from "./components/sitemanager/SiteManagerModal";
import { QuickConnectModal } from "./components/sitemanager/QuickConnectModal";
import { Button, IconButton } from "./components/ui/Button";
import { usePane } from "./hooks/usePane";
import { api, isTauri } from "./lib/api";
import { joinPath } from "./lib/format";
import { initSettingsEffects } from "./store/useSettingsStore";
import { useSitesStore } from "./store/useSitesStore";
import { useTransferStore } from "./store/useTransferStore";
import type { ConnectionInfo, SiteProfile } from "./lib/types";

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

export default function App() {
  const [homeDir, setHomeDir] = useState<string>("/");
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [siteManagerOpen, setSiteManagerOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [hostKeyNotice, setHostKeyNotice] = useState<{ fingerprint: string; canPin: boolean } | null>(null);
  const [dragOverRemote, setDragOverRemote] = useState(false);
  const [appReady, setAppReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const remotePaneRef = useRef<HTMLDivElement>(null);
  const { load: loadSites, save: saveSite } = useSitesStore();
  const { enqueueUpload, enqueueDownload, init: initTransfers } = useTransferStore();

  useEffect(() => {
    initSettingsEffects();
    // The splash overlay never gates this - real init starts immediately and
    // runs underneath it; `appReady` only tells the splash when it's allowed
    // to close.
    Promise.allSettled([loadSites(), initTransfers(), api.localHomeDir().then(setHomeDir)]).then(() =>
      setAppReady(true),
    );
  }, [loadSites, initTransfers]);

  const localPane = usePane("local", null, homeDir || "/");
  const remotePane = usePane("remote", connection?.connection_id ?? null, "/");

  // Re-sync local pane's initial path once the real home directory resolves.
  useEffect(() => {
    if (homeDir) localPane.navigate(homeDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeDir]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "leave") {
          setDragOverRemote(false);
          return;
        }
        const rect = remotePaneRef.current?.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const x = payload.position.x / ratio;
        const y = payload.position.y / ratio;
        const over = !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

        if (payload.type === "over") {
          setDragOverRemote(over);
        } else if (payload.type === "drop") {
          setDragOverRemote(false);
          if (over && connection) {
            for (const path of payload.paths) {
              const remotePath = joinPath(remotePane.path, basename(path), remotePane.sep);
              void enqueueUpload(connection.connection_id, path, remotePath);
            }
          }
        }
      })
      .then((fn) => (unlisten = fn));
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, remotePane.path, remotePane.sep]);

  async function handleConnect(profile: SiteProfile, siteId: string | null) {
    setConnecting(true);
    setConnectError(null);
    setQuickConnectOpen(false);
    setSiteManagerOpen(false);
    try {
      const info = siteId ? await api.connectSavedSite(siteId) : await api.quickConnect(profile);
      setConnection(info);
      setActiveSiteId(siteId);
      remotePane.navigate(profile.remote_dir || "/");
      if (info.host_key_fingerprint && info.host_key_matched_pinned == null) {
        setHostKeyNotice({ fingerprint: info.host_key_fingerprint, canPin: !!siteId });
      }
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (connection) await api.disconnect(connection.connection_id).catch(() => {});
    setConnection(null);
    setActiveSiteId(null);
  }

  async function trustHostKey() {
    if (!hostKeyNotice || !activeSiteId) {
      setHostKeyNotice(null);
      return;
    }
    const site = useSitesStore.getState().sites.find((s) => s.id === activeSiteId);
    if (site) await saveSite({ ...site, pinned_host_key_fingerprint: hostKeyNotice.fingerprint });
    setHostKeyNotice(null);
  }

  return (
    <div className="flex h-screen flex-col bg-surface-0 text-zinc-200">
      {showSplash && <SplashScreen appReady={appReady} onExited={() => setShowSplash(false)} />}

      <TopBar
        connection={connection}
        connecting={connecting}
        hasError={!!connectError}
        onQuickConnect={() => setQuickConnectOpen(true)}
        onOpenSiteManager={() => setSiteManagerOpen(true)}
        onDisconnect={handleDisconnect}
      />

      {connectError && (
        <div className="flex items-center justify-between border-b border-red-900/40 bg-red-950/40 px-4 py-2 text-[13px] text-red-300">
          <span>Connection failed: {connectError}</span>
          <IconButton onClick={() => setConnectError(null)} title="Dismiss">
            <X size={14} />
          </IconButton>
        </div>
      )}

      {hostKeyNotice && (
        <div className="flex items-center justify-between border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-[13px] text-amber-200">
          <span className="flex items-center gap-2">
            <ShieldCheck size={14} />
            First connection to this server. Host key fingerprint: <code className="font-mono">{hostKeyNotice.fingerprint}</code>
          </span>
          <div className="flex items-center gap-2">
            {hostKeyNotice.canPin && (
              <Button variant="ghost" onClick={trustHostKey} className="!py-0.5 text-amber-200 hover:bg-amber-500/20">
                <ShieldCheck size={13} /> Trust &amp; remember
              </Button>
            )}
            <IconButton onClick={() => setHostKeyNotice(null)} title="Dismiss">
              <X size={14} />
            </IconButton>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Pane
          title="Local"
          pane={localPane}
          transferLabel="Upload to remote"
          transferDisabled={!connection}
          onTransferSelection={() => {
            const targets = localPane.entries.filter((e) => localPane.selection.has(e.path) && !e.is_dir);
            for (const t of targets) {
              if (!connection) break;
              void enqueueUpload(connection.connection_id, t.path, joinPath(remotePane.path, t.name, remotePane.sep));
            }
          }}
        />
        <div className="w-px shrink-0 bg-surface-border" />
        <div ref={remotePaneRef} className="flex min-w-0 flex-1">
          {connection ? (
            <Pane
              title="Remote"
              pane={remotePane}
              transferLabel="Download to local"
              onTransferSelection={() => {
                const targets = remotePane.entries.filter((e) => remotePane.selection.has(e.path) && !e.is_dir);
                for (const t of targets) {
                  void enqueueDownload(connection.connection_id, t.path, joinPath(localPane.path, t.name, localPane.sep));
                }
              }}
              dropHighlight={dragOverRemote}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface-1 text-zinc-500">
              <p className="text-sm">Not connected</p>
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => setQuickConnectOpen(true)}>
                  <Plug size={14} /> Quick Connect
                </Button>
                <Button variant="secondary" onClick={() => setSiteManagerOpen(true)}>
                  <Server size={14} /> Site Manager
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <TransferQueuePanel />

      <SiteManagerModal
        open={siteManagerOpen}
        onClose={() => setSiteManagerOpen(false)}
        onConnect={(profile) => void handleConnect(profile, profile.id)}
      />
      <QuickConnectModal
        open={quickConnectOpen}
        onClose={() => setQuickConnectOpen(false)}
        onConnect={(profile) => void handleConnect(profile, null)}
      />
    </div>
  );
}
