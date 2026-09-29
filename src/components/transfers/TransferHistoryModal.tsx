import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Search, ShieldAlert, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { ErrorNotice } from "../common/ErrorNotice";
import { formatBytes, formatDate } from "../../lib/format";
import { fuzzyScore } from "../../lib/fuzzy";
import { useTransferHistoryStore, type TransferHistoryEntry } from "../../store/useTransferHistoryStore";
import { cn } from "../../lib/cn";

interface TransferHistoryModalProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_FILTERS = ["all", "completed", "failed", "cancelled"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function ChecksumBadge({ status }: { status: TransferHistoryEntry["checksum"] }) {
  if (status === "verified") return <ShieldCheck size={12} className="shrink-0 text-emerald-400" />;
  if (status === "mismatch" || status === "error") return <ShieldAlert size={12} className="shrink-0 text-red-400" />;
  return null;
}

export function TransferHistoryModal({ open, onClose }: TransferHistoryModalProps) {
  const { entries, clear } = useTransferHistoryStore();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    let list = entries;
    if (statusFilter !== "all") list = list.filter((e) => e.status === statusFilter);
    if (query.trim() === "") return list;
    return list
      .map((e) => ({ e, score: fuzzyScore(query, `${e.name} ${e.siteName ?? ""} ${e.localPath} ${e.remotePath}`) }))
      .filter((r): r is { e: TransferHistoryEntry; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.e);
  }, [entries, query, statusFilter]);

  return (
    <Modal open={open} onClose={onClose} title="Transfer History" width={620}>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename, site, or path…"
            className="pl-8"
          />
        </div>
        <Button
          variant="ghost"
          onClick={() => clear()}
          disabled={entries.length === 0}
          className="text-red-400 hover:bg-red-500/10"
        >
          <Trash2 size={13} /> Clear
        </Button>
      </div>

      <div className="mb-3 flex gap-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] uppercase tracking-wide transition-colors",
              statusFilter === f ? "bg-accent-600/25 text-accent-300" : "text-zinc-500 hover:bg-surface-2",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="max-h-[50vh] overflow-y-auto rounded-md border border-surface-border">
        {filtered.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-zinc-500">
            {entries.length === 0 ? "No transfers yet" : "No matching transfers"}
          </div>
        ) : (
          filtered.map((e) => (
            <div key={e.id} className="border-b border-surface-border/60 px-3 py-2 text-[12px] last:border-b-0">
              <div className="mb-0.5 flex items-center gap-2">
                {e.direction === "upload" ? (
                  <ArrowUpFromLine size={12} className="shrink-0 text-accent-400" />
                ) : (
                  <ArrowDownToLine size={12} className="shrink-0 text-accent-400" />
                )}
                <span className="min-w-0 flex-1 truncate text-zinc-200">{e.name}</span>
                <ChecksumBadge status={e.checksum} />
                {e.status === "completed" && <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />}
                {e.status === "failed" && <XCircle size={13} className="shrink-0 text-red-400" />}
                {e.status === "cancelled" && <XCircle size={13} className="shrink-0 text-zinc-500" />}
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-500">
                <span>
                  {e.siteName ?? "Quick Connect"} · {formatBytes(e.totalBytes)} · {formatDate(e.finishedAt)}
                </span>
              </div>
              {e.error && <ErrorNotice raw={e.error} className="mt-1 text-red-400" />}
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
