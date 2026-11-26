import { Cloud, FolderSync, Moon, Plug, Redo2, Search, Server, Settings, Sun, Undo2, Unplug } from "lucide-react";
import { Button, IconButton } from "../ui/Button";
import { ConnectionStatusIcon, type ConnectionStatus } from "../../lib/ConnectionStatusIcon";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useUiStore } from "../../store/useUiStore";
import { cn } from "../../lib/cn";
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
  onCloudSync?: () => void;
}

const PILL_STYLES: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500/10 text-emerald-400",
  connecting: "bg-accent-600/15 text-accent-400",
  reconnecting: "bg-amber-500/15 text-amber-300",
  error: "bg-red-500/10 text-red-400",
  disconnected: "bg-surface-2 text-zinc-500",
  syncing: "bg-accent-600/15 text-accent-400",
};

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
  onCloudSync,
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

  const pillLabel = connection
    ? `${connection.protocol.toUpperCase()} connected`
    : reconnecting
      ? "Reconnecting…"
      : connecting
        ? "Connecting…"
        : hasError
          ? "Connection error"
          : "Not connected";

  return (
    <div className="fluent-card mx-2 mt-2 flex h-11 shrink-0 items-center gap-1.5 px-2">
      <Button variant="ghost" onClick={onOpenSiteManager}>
        <Server size={14} /> Site Manager
      </Button>
      <Button variant="ghost" onClick={onQuickConnect} disabled={connecting}>
        <Plug size={14} /> Quick Connect
      </Button>

      <div className="mx-1 h-5 w-px bg-surface-border" />

      <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium", PILL_STYLES[status])}>
        <ConnectionStatusIcon status={status} size={13} />
        {pillLabel}
      </span>

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
      {connection && onCloudSync && (
        <IconButton title="Cloud sync" onClick={onCloudSync}>
          <Cloud size={14} />
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
