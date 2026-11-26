import { CheckCircle2, Download, Loader2, RefreshCw, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "../ui/Button";
import { ToggleSwitch } from "../ui/Field";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useUpdateStore } from "../../store/useUpdateStore";
import { isTauri } from "../../lib/api";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 font-display text-base font-semibold text-zinc-100">{children}</h3>;
}

export function UpdatesSection({ appVersion }: { appVersion: string | null }) {
  const { autoCheckForUpdates, setAutoCheckForUpdates } = useSettingsStore();
  const { status, version, releaseNotes, downloadProgress, errorMessage, check, downloadAndInstall, relaunch } =
    useUpdateStore();

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading>Updates</SectionHeading>

      <div className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-zinc-100">TRM-Connect {appVersion ?? "…"}</div>
          <div className="mt-0.5 text-[12px] text-zinc-500">
            {status === "idle" && "Not checked yet this session."}
            {status === "checking" && "Checking for updates…"}
            {status === "up-to-date" && "You're on the latest version."}
            {status === "available" && `Version ${version} is available.`}
            {status === "downloading" && `Downloading version ${version}…`}
            {status === "ready" && "Update downloaded - restart to finish installing."}
            {status === "error" && (errorMessage ?? "Couldn't check for updates.")}
          </div>
        </div>
        <div className="shrink-0">
          {status === "checking" || status === "downloading" ? (
            <Loader2 size={18} className="animate-spin text-accent-400" />
          ) : status === "up-to-date" ? (
            <CheckCircle2 size={18} className="text-emerald-400" />
          ) : status === "error" ? (
            <TriangleAlert size={18} className="text-red-400" />
          ) : null}
        </div>
      </div>

      {!isTauri() && (
        <p className="text-[12px] text-zinc-500">Updates can only be checked from the installed desktop app.</p>
      )}

      {isTauri() && status !== "downloading" && status !== "ready" && (
        <Button variant="secondary" onClick={() => void check()} disabled={status === "checking"} className="self-start">
          <RefreshCw size={14} /> Check for updates
        </Button>
      )}

      {status === "available" && (
        <div className="flex flex-col gap-2 rounded-lg border border-accent-900/40 bg-accent-950/20 px-4 py-3">
          {releaseNotes && (
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[12px] text-accent-200">{releaseNotes}</pre>
          )}
          <Button variant="primary" onClick={() => void downloadAndInstall()} className="self-start">
            <Download size={14} /> Download &amp; install
          </Button>
        </div>
      )}

      {status === "downloading" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-accent-500 transition-[width] duration-200 ease-out"
            style={{ width: `${downloadProgress}%` }}
          />
        </div>
      )}

      {status === "ready" && (
        <Button variant="primary" onClick={() => void relaunch()} className="self-start">
          <RotateCw size={14} /> Restart &amp; install
        </Button>
      )}

      <div className="flex items-center gap-3 rounded-lg border border-surface-border bg-surface-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-zinc-100">Check for updates automatically</div>
          <div className="mt-0.5 text-[12px] text-zinc-500">Checks silently right after startup.</div>
        </div>
        <ToggleSwitch checked={autoCheckForUpdates} onChange={setAutoCheckForUpdates} />
      </div>
    </div>
  );
}
