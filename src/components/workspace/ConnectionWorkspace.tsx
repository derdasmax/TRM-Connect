import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Loader2, Plug, RotateCcw, Server, ShieldCheck, X } from "lucide-react";
import { TopBar } from "../layout/TopBar";
import { Pane } from "../browser/Pane";
import { DragGhost, type DragGhostInfo } from "../browser/DragGhost";
import { ConflictDialog } from "../transfers/ConflictDialog";
import { SiteManagerModal } from "../sitemanager/SiteManagerModal";
import { QuickConnectModal } from "../sitemanager/QuickConnectModal";
import { ErrorNotice } from "../common/ErrorNotice";
import { Button, IconButton } from "../ui/Button";
import { usePane } from "../../hooks/usePane";
import { useConflictAwareEnqueue } from "../../hooks/useConflictAwareEnqueue";
import { api, isTauri } from "../../lib/api";
import { isTypingTarget } from "../../lib/dom";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useSessionStore } from "../../store/useSessionStore";
import { useSitesStore } from "../../store/useSitesStore";
import { useTabsStore } from "../../store/useTabsStore";
import { useUiStore } from "../../store/useUiStore";
import { createUndoStore } from "../../store/useUndoStore";
import type { ConnectionInfo, SiteProfile } from "../../lib/types";

function basename(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
}

interface ConnectionWorkspaceProps {
  tabId: string;
  /** Whether this tab is the one currently shown - other tabs stay mounted
   *  (to keep their connection and pane state alive) but hidden, and must
   *  not react to global keyboard shortcuts meant for the visible tab. */
  active: boolean;
}

/** Everything for one connection tab: its own local/remote pane pair, its
 *  own connection lifecycle, its own undo history, and the dialogs that
 *  belong to making or managing that connection. Multiple instances of this
 *  run side by side (one per open tab), each fully independent. */
export function ConnectionWorkspace({ tabId, active }: ConnectionWorkspaceProps) {
  const [homeDir, setHomeDir] = useState<string>("");
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [siteManagerOpen, setSiteManagerOpen] = useState(false);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [hostKeyNotice, setHostKeyNotice] = useState<{ fingerprint: string; canPin: boolean } | null>(null);
  const [dragOverRemote, setDragOverRemote] = useState(false);
  const [dragGhost, setDragGhost] = useState<DragGhostInfo | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sessionRestoreDismissed, setSessionRestoreDismissed] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const remotePaneRef = useRef<HTMLDivElement>(null);
  const connectionRef = useRef<ConnectionInfo | null>(null);
  // What to reconnect with (and where to resume browsing) once the active
  // connection is found to be dead. Cleared on an intentional disconnect so
  // auto-reconnect never fires after the user chose to disconnect.
  const lastConnectRef = useRef<{ profile: SiteProfile; siteId: string | null } | null>(null);
  const remotePathRef = useRef<string>("/");
  const reconnectPathRef = useRef<string | null>(null);
  const reconnectAbortRef = useRef(false);
  const reconnectingRef = useRef(false);
  const { save: saveSite } = useSitesStore();
  const conflictAware = useConflictAwareEnqueue();
  const [useTabUndoStore] = useState(() => createUndoStore());
  const canUndo = useTabUndoStore((s) => s.undoStack.length > 0);
  const canRedo = useTabUndoStore((s) => s.redoStack.length > 0);
  const lastSiteId = useSessionStore((s) => s.lastSiteId);
  const sites = useSitesStore((s) => s.sites);
  const { setTabTitle, setTabStatus } = useTabsStore();
  const currentSiteName = activeSiteId ? sites.find((s) => s.id === activeSiteId)?.name ?? null : null;

  useEffect(() => {
    void api.localHomeDir().then(setHomeDir);
  }, []);

  // Closing a tab unmounts this component; without this, the backend
  // connection it opened would never be told to disconnect and would leak
  // for the lifetime of the app.
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);
  useEffect(
    () => () => {
      reconnectAbortRef.current = true;
      if (connectionRef.current) void api.disconnect(connectionRef.current.connection_id).catch(() => {});
    },
    [],
  );

  const localPane = usePane("local", null, homeDir || "/", (a) => useTabUndoStore.getState().push(a));
  const remotePane = usePane(
    "remote",
    connection?.connection_id ?? null,
    "/",
    (a) => useTabUndoStore.getState().push(a),
  );

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

  // Tracks the remote pane's current path outside of React state so a
  // reconnect (triggered from a plain callback, not a render) can read it
  // without becoming a dependency that would re-run other effects.
  useEffect(() => {
    remotePathRef.current = remotePane.path;
  }, [remotePane.path]);

  // usePane resets its path back to its `initialPath` ("/") whenever the
  // connection id it's given changes - true for a normal first connect, but
  // wrong for a reconnect, where the user was mid-directory and expects to
  // land back where they were. Restore it once the new connection lands.
  useEffect(() => {
    if (connection && reconnectPathRef.current) {
      remotePane.navigate(reconnectPathRef.current);
      reconnectPathRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  // Tab title/status mirror this workspace's connection state so the tab
  // strip (rendered outside this component) stays in sync.
  useEffect(() => {
    setTabTitle(
      tabId,
      connection || reconnecting ? sites.find((s) => s.id === activeSiteId)?.name || "Connected" : "New Tab",
    );
    setTabStatus(
      tabId,
      connection
        ? "connected"
        : reconnecting
          ? "reconnecting"
          : connecting
            ? "connecting"
            : connectError
              ? "error"
              : "disconnected",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, connection, connecting, reconnecting, connectError, activeSiteId, sites]);

  // Connection health-check / auto-reconnect: while connected, periodically
  // probe the session with a lightweight remote call. A real dropped
  // connection (network blip, server restart, idle timeout) surfaces as a
  // failure here well before the user notices - stat/list calls elsewhere
  // would eventually fail too, but only on the next thing they click.
  useEffect(() => {
    if (!connection) return;
    const connectionId = connection.connection_id;
    const interval = window.setInterval(() => {
      void api.remoteCanonicalize(connectionId, "/").catch(() => void attemptReconnect());
    }, 15000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  async function attemptReconnect() {
    const saved = lastConnectRef.current;
    if (!saved || reconnectingRef.current) return;
    reconnectingRef.current = true;
    reconnectAbortRef.current = false;
    reconnectPathRef.current = remotePathRef.current;
    setConnection(null);
    setReconnecting(true);

    const backoffMs = [1000, 2000, 4000, 8000, 16000];
    try {
      for (let attempt = 1; attempt <= backoffMs.length; attempt++) {
        if (reconnectAbortRef.current) return;
        setReconnectAttempt(attempt);
        try {
          const info = saved.siteId
            ? await api.connectSavedSite(saved.siteId)
            : await api.quickConnect(saved.profile);
          if (reconnectAbortRef.current) {
            reconnectPathRef.current = null;
            void api.disconnect(info.connection_id).catch(() => {});
            return;
          }
          setConnection(info);
          setConnectError(null);
          return;
        } catch {
          if (attempt === backoffMs.length) {
            reconnectPathRef.current = null;
            setConnectError("Connection lost. Automatic reconnect failed after several attempts.");
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt - 1]));
        }
      }
    } finally {
      setReconnecting(false);
      reconnectingRef.current = false;
    }
  }

  function cancelReconnect() {
    reconnectAbortRef.current = true;
    reconnectPathRef.current = null;
    setReconnecting(false);
  }

  // Exposes this tab's actions to the Command Palette (Ctrl+K), which lives
  // outside any single tab and needs a way to act "on whichever tab is
  // currently active" without owning that tab's state itself.
  useEffect(() => {
    if (!active) return;
    useUiStore.getState().setActiveWorkspaceActions({
      openQuickConnect: () => setQuickConnectOpen(true),
      openSiteManager: () => setSiteManagerOpen(true),
      disconnect: () => void handleDisconnect(),
      connectToSite: (site) => void handleConnect(site, site.id),
      undo: () => void handleUndo(),
      redo: () => void handleRedo(),
      canUndo,
      canRedo,
      connected: !!connection,
    });
    return () => {
      if (useUiStore.getState().activeWorkspaceActions) useUiStore.getState().setActiveWorkspaceActions(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, connection, canUndo, canRedo]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!active || isTypingTarget(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      void (e.shiftKey ? handleRedo() : handleUndo());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  async function handleUndo() {
    try {
      const kind = await useTabUndoStore.getState().undo();
      if (kind === "local") localPane.refresh();
      else if (kind === "remote") remotePane.refresh();
    } catch (e) {
      setActionError(String(e));
    }
  }

  async function handleRedo() {
    try {
      const kind = await useTabUndoStore.getState().redo();
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
    // Bumped on every enter/leave/drop so a stat lookup kicked off for one
    // drag can't land after that drag has already ended (fast re-drag, or a
    // drop that fires before sizes resolve).
    let dragToken = 0;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "leave") {
          dragToken++;
          setDragOverRemote(false);
          setDragGhost(null);
          return;
        }

        const rect = remotePaneRef.current?.getBoundingClientRect();
        const ratio = window.devicePixelRatio || 1;
        const x = payload.position.x / ratio;
        const y = payload.position.y / ratio;
        const over = !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

        if (payload.type === "enter") {
          const token = ++dragToken;
          const paths = payload.paths;
          setDragOverRemote(over);
          setDragGhost({
            x,
            y,
            name: paths.length === 1 ? basename(paths[0]) : `${paths.length} items`,
            count: paths.length,
            totalSize: null,
            armed: over,
          });
          void Promise.all(paths.map((p) => api.localStat(p).catch(() => null))).then((stats) => {
            if (token !== dragToken) return;
            const totalSize = stats.reduce((sum, s) => sum + (s?.size ?? 0), 0);
            setDragGhost((prev) => (prev ? { ...prev, totalSize } : prev));
          });
        } else if (payload.type === "over") {
          setDragOverRemote(over);
          setDragGhost((prev) => (prev ? { ...prev, x, y, armed: over } : prev));
        } else if (payload.type === "drop") {
          dragToken++;
          setDragOverRemote(false);
          setDragGhost(null);
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
              siteName: currentSiteName,
            });
          }
        }
      })
      .then((fn) => (unlisten = fn));
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, remotePane.path, remotePane.sep]);

  async function handleConnect(profile: SiteProfile, siteId: string | null) {
    reconnectAbortRef.current = true;
    reconnectPathRef.current = null;
    setReconnecting(false);
    setConnecting(true);
    setConnectError(null);
    setQuickConnectOpen(false);
    setSiteManagerOpen(false);
    try {
      const info = siteId ? await api.connectSavedSite(siteId) : await api.quickConnect(profile);
      setConnection(info);
      setActiveSiteId(siteId);
      lastConnectRef.current = { profile, siteId };
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
    reconnectAbortRef.current = true;
    lastConnectRef.current = null;
    setReconnecting(false);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar
        connection={connection}
        connecting={connecting}
        reconnecting={reconnecting}
        hasError={!!connectError}
        onQuickConnect={() => setQuickConnectOpen(true)}
        onOpenSiteManager={() => setSiteManagerOpen(true)}
        onDisconnect={handleDisconnect}
        onOpenSettings={() => useUiStore.getState().openSettingsModal()}
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

      {reconnecting && (
        <div className="flex items-center justify-between border-b border-amber-900/40 bg-amber-950/30 px-4 py-2 text-[13px] text-amber-200">
          <span className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Connection lost. Reconnecting… (attempt {reconnectAttempt}/5)
          </span>
          <Button variant="ghost" onClick={cancelReconnect} className="!py-0.5 text-amber-200 hover:bg-amber-500/20">
            Cancel
          </Button>
        </div>
      )}

      {!connection &&
        !connecting &&
        !reconnecting &&
        !sessionRestoreDismissed &&
        lastSiteId &&
        sites.some((s) => s.id === lastSiteId) && (
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
              siteName: currentSiteName,
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
                  siteName: currentSiteName,
                });
              }}
              dropHighlight={dragOverRemote}
            />
          ) : reconnecting ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface-1 text-zinc-500">
              <Loader2 size={28} className="animate-spin text-amber-400" />
              <p className="text-sm">Reconnecting to {currentSiteName ?? "server"}…</p>
            </div>
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
      <ConflictDialog
        conflict={conflictAware.current}
        remainingCount={conflictAware.remainingCount}
        onResolve={(resolution, applyToAll) => void conflictAware.resolve(resolution, applyToAll)}
      />
      <DragGhost info={dragGhost} />
    </div>
  );
}
