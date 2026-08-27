import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ShieldCheck, X } from "lucide-react";
import { TopBar } from "./components/layout/TopBar";
import { Pane } from "./components/browser/Pane";
import { TransferQueuePanel } from "./components/transfers/TransferQueuePanel";
import { SiteManagerModal } from "./components/sitemanager/SiteManagerModal";
import { QuickConnectModal } from "./components/sitemanager/QuickConnectModal";
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

  const remotePaneRef = useRef<HTMLDivElement>(null);
  const { load: loadSites, save: saveSite } = useSitesStore();
  const { enqueueUpload, enqueueDownload, init: initTransfers } = useTransferStore();

  useEffect(() => {
    initSettingsEffects();
    void loadSites();
    void initTransfers();
    api
      .localHomeDir()
      .then(setHomeDir)
      .catch(() => {});
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
      <TopBar
        connection={connection}
        connecting={connecting}
        onQuickConnect={() => setQuickConnectOpen(true)}
        onOpenSiteManager={() => setSiteManagerOpen(true)}
        onDisconnect={handleDisconnect}
      />

      {connectError && (
        <div className="flex items-center justify-between border-b border-red-900/40 bg-red-950/40 px-4 py-2 text-[13px] text-red-300">
          <span>Connection failed: {connectError}</span>
          <button onClick={() => setConnectError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {hostKeyNotice && (
        <div className="flex items-center justify-between border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-[13px] text-amber-200">
          <span className="flex items-center gap-2">
            <ShieldCheck size={14} />
            First connection to this server. Host key fingerprint: <code className="font-mono">{hostKeyNotice.fingerprint}</code>
          </span>
          <div className="flex gap-2">
            {hostKeyNotice.canPin && (
              <button onClick={trustHostKey} className="rounded bg-amber-500/20 px-2 py-0.5 hover:bg-amber-500/30">
                Trust &amp; remember
              </button>
            )}
            <button onClick={() => setHostKeyNotice(null)}>
              <X size={14} />
            </button>
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
                <button
                  onClick={() => setQuickConnectOpen(true)}
                  className="rounded-md bg-accent-600 px-3 py-1.5 text-sm text-white hover:bg-accent-500"
                >
                  Quick Connect
                </button>
                <button
                  onClick={() => setSiteManagerOpen(true)}
                  className="rounded-md border border-surface-border px-3 py-1.5 text-sm text-zinc-300 hover:bg-surface-2"
                >
                  Site Manager
                </button>
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
