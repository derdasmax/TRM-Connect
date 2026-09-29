import { FolderSync, Moon, Plug, Redo2, Search, Server, Settings, Sun, Undo2, Unplug, Zap } from "lucide-react";
import { Button, IconButton } from "../ui/Button";
import { ConnectionStatusIcon, type ConnectionStatus } from "../../lib/ConnectionStatusIcon";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useUiStore } from "../../store/useUiStore";
import type { ConnectionInfo } from "../../lib/types";

interface TopBarProps {
  connection: ConnectionInfo | null;
  connecting: boolean;
  reconnecting?: boolean;
  hasError?: boolean;
  onQuickConnect: () => void;
  onOpenSiteManager: () => void;
  onDisconnect: () => void;
  onOpenSettings: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSyncDirectories?: () => void;
}

export function TopBar({
  connection,
  connecting,
  reconnecting,
  hasError,
  onQuickConnect,
  onOpenSiteManager,
  onDisconnect,
  onOpenSettings,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSyncDirectories,
}: TopBarProps) {
  const { theme, setTheme } = useSettingsStore();

  const status: ConnectionStatus = connection
    ? "connected"
    : reconnecting
      ? "reconnecting"
      : connecting
        ? "connecting"
        : hasError
          ? "error"
          : "disconnected";

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-surface-border bg-surface-0 px-3">
      <div className="flex items-center gap-1.5 pr-2">
        <div className="flex h-5 w-5 items-center justify-center rounded bg-accent-600">
          <Zap size={12} className="text-white" fill="currentColor" />
        </div>
        <span className="text-sm font-semibold text-zinc-100">TRM-Connect</span>
      </div>

      <div className="h-5 w-px bg-surface-border" />

      <Button variant="ghost" onClick={onOpenSiteManager}>
        <Server size={14} /> Site Manager
      </Button>
      <Button variant="ghost" onClick={onQuickConnect} disabled={connecting}>
        <Plug size={14} /> Quick Connect
      </Button>

      <div className="ml-2 flex items-center gap-1.5 text-[12px] text-zinc-400">
        <ConnectionStatusIcon status={status} size={13} />
        {connecting && <span className="text-accent-400">Connecting…</span>}
        {reconnecting && <span className="text-amber-400">Reconnecting…</span>}
        {connection && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
            {connection.protocol.toUpperCase()} connected
          </span>
        )}
        {!connection && !connecting && !reconnecting && hasError && <span className="text-red-400">Connection error</span>}
      </div>

      <div className="flex-1" />

      <IconButton title="Command Palette (Ctrl+K)" onClick={() => useUiStore.getState().openCommandPalette()}>
        <Search size={14} />
      </IconButton>

      <IconButton title="Undo" disabled={!canUndo} onClick={onUndo}>
        <Undo2 size={14} />
      </IconButton>
      <IconButton title="Redo" disabled={!canRedo} onClick={onRedo}>
        <Redo2 size={14} />
      </IconButton>

      {connection && onSyncDirectories && (
        <IconButton title="Sync directories" onClick={onSyncDirectories}>
          <FolderSync size={14} />
        </IconButton>
      )}

      {connection && (
        <Button variant="ghost" onClick={onDisconnect}>
          <Unplug size={14} /> Disconnect
        </Button>
      )}

      <IconButton title="Settings" onClick={onOpenSettings}>
        <Settings size={15} />
      </IconButton>
      <IconButton
        title={`Theme: ${theme}`}
        onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "system" : "dark")}
      >
        {theme === "dark" ? <Moon size={15} /> : <Sun size={15} />}
      </IconButton>
    </div>
  );
}
