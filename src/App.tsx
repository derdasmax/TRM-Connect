import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Plug, RotateCcw, Server, ShieldCheck, X } from "lucide-react";
import { TopBar } from "./components/layout/TopBar";
import { SplashScreen } from "./components/layout/SplashScreen";
import { Pane } from "./components/browser/Pane";
import { TransferQueuePanel } from "./components/transfers/TransferQueuePanel";
import { ConflictDialog } from "./components/transfers/ConflictDialog";
import { SiteManagerModal } from "./components/sitemanager/SiteManagerModal";
import { QuickConnectModal } from "./components/sitemanager/QuickConnectModal";
import { SettingsModal } from "./components/settings/SettingsModal";
import { ErrorNotice } from "./components/common/ErrorNotice";
import { Button, IconButton } from "./components/ui/Button";
import { usePane } from "./hooks/usePane";
import { useConflictAwareEnqueue } from "./hooks/useConflictAwareEnqueue";
import { api, isTauri } from "./lib/api";
import { isTypingTarget } from "./lib/dom";
import { initSettingsEffects, useSettingsStore } from "./store/useSettingsStore";
import { useSessionStore } from "./store/useSessionStore";
import { useSitesStore } from "./store/useSitesStore";
import { useTransferStore } from "./store/useTransferStore";
import { useUndoStore } from "./store/useUndoStore";
import type { ConnectionInfo, SiteProfile } from "./lib/types";

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

export default function App() {
  // Empty (not "/") until the real value resolves - "/" is a legitimate
  // resolved home directory on some systems, so it can't double as a
  // not-yet-loaded sentinel without corrupting the session-restore effect
  // below (which persists whatever the pane's current path is).
  const [homeDir, setHomeDir] = useState<string>("");
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionRestoreDismissed, setSessionRestoreDismissed] = useState(false);

  const remotePaneRef = useRef<HTMLDivElement>(null);
  const { load: loadSites, save: saveSite } = useSitesStore();
  const { init: initTransfers } = useTransferStore();
  const conflictAware = useConflictAwareEnqueue();
  const canUndo = useUndoStore((s) => s.undoStack.length > 0);
  const canRedo = useUndoStore((s) => s.redoStack.length > 0);
  const lastSiteId = useSessionStore((s) => s.lastSiteId);
  const sites = useSitesStore((s) => s.sites);

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

  // Re-sync local pane's initial path once the real home directory resolves,
  // restoring the last session's local path when one was saved.
  useEffect(() => {
    if (homeDir) localPane.navigate(useSessionStore.getState().lastLocalPath || homeDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeDir]);

  useEffect(() => {
    // Gated on `homeDir` too: before it resolves, `localPane.path` is still
    // sitting on usePane's own placeholder fallback ("/"), and persisting
    // that would permanently mask the real home directory once it arrives.
    if (homeDir && localPane.path) useSessionStore.getState().setLastLocalPath(localPane.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localPane.path, homeDir]);

  useEffect(() => {
    if (connection && remotePane.path) useSessionStore.getState().setLastRemoteDir(remotePane.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, remotePane.path]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      void (e.shiftKey ? handleRedo() : handleUndo());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUndo() {
    try {
      const kind = await useUndoStore.getState().undo();
      if (kind === "local") localPane.refresh();
      else if (kind === "remote") remotePane.refresh();
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleRedo() {
    try {
      const kind = await useUndoStore.getState().redo();
      if (kind === "local") localPane.refresh();
      else if (kind === "remote") remotePane.refresh();
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function restoreLastSession() {
    const site = sites.find((s) => s.id === lastSiteId);
    setSessionRestoreDismissed(true);
    if (!site) return;
    await handleConnect(site, site.id);
    const remoteDir = useSessionStore.getState().lastRemoteDir;
    if (remoteDir) remotePane.navigate(remoteDir);
  }

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
            const targets = payload.paths.map((path) => ({
              sourcePath: path,
              destDir: remotePane.path,
              name: basename(path),
              sep: remotePane.sep,
              size: 0,
              modified: null,
            }));
            void conflictAware.start("upload", connection.connection_id, targets, {
              verifyChecksum: useSettingsStore.getState().verifyChecksumsDefault,
            });
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
      if (siteId) useSessionStore.getState().setLastSite(siteId, profile.remote_dir || null);
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
        onOpenSettings={() => setSettingsOpen(true)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
      />

      {connectError && (
        <div className="flex items-center justify-between border-b border-red-900/40 bg-red-950/40 px-4 py-2 text-[13px] text-red-300">
          <ErrorNotice raw={connectError} />
          <IconButton onClick={() => setConnectError(null)} title="Dismiss">
            <X size={14} />
          </IconButton>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between border-b border-red-900/40 bg-red-950/40 px-4 py-2 text-[13px] text-red-300">
          <ErrorNotice raw={actionError} />
          <IconButton onClick={() => setActionError(null)} title="Dismiss">
            <X size={14} />
          </IconButton>
        </div>
      )}

      {!connection && !connecting && !sessionRestoreDismissed && lastSiteId && sites.some((s) => s.id === lastSiteId) && (
        <div className="flex items-center justify-between border-b border-accent-900/40 bg-accent-950/20 px-4 py-2 text-[13px] text-accent-200">
          <span className="flex items-center gap-2">
            <RotateCcw size={14} />
            Reconnect to {sites.find((s) => s.id === lastSiteId)?.name}?
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => void restoreLastSession()} className="!py-0.5 text-accent-200 hover:bg-accent-500/20">
              <Plug size={13} /> Reconnect
            </Button>
            <IconButton onClick={() => setSessionRestoreDismissed(true)} title="Dismiss">
              <X size={14} />
            </IconButton>
          </div>
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
            if (!connection) return;
            const targets = localPane.entries
              .filter((e) => localPane.selection.has(e.path) && !e.is_dir)
              .map((e) => ({
                sourcePath: e.path,
                destDir: remotePane.path,
                name: e.name,
                sep: remotePane.sep,
                size: e.size,
                modified: e.modified,
              }));
            void conflictAware.start("upload", connection.connection_id, targets, {
              verifyChecksum: useSettingsStore.getState().verifyChecksumsDefault,
            });
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
                const targets = remotePane.entries
                  .filter((e) => remotePane.selection.has(e.path) && !e.is_dir)
                  .map((e) => ({
                    sourcePath: e.path,
                    destDir: localPane.path,
                    name: e.name,
                    sep: localPane.sep,
                    size: e.size,
                    modified: e.modified,
                  }));
                void conflictAware.start("download", connection.connection_id, targets, {
                  verifyChecksum: useSettingsStore.getState().verifyChecksumsDefault,
                });
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
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ConflictDialog
        conflict={conflictAware.current}
        remainingCount={conflictAware.remainingCount}
        onResolve={(resolution, applyToAll) => void conflictAware.resolve(resolution, applyToAll)}
      />
    </div>
  );
}
