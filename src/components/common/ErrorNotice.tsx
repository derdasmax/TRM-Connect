import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { friendlyMessage } from "../../lib/friendlyError";
import { cn } from "../../lib/cn";

interface ErrorNoticeProps {
  raw: string;
  className?: string;
}

/** A plain-language error summary with the original technical message
 *  available behind a "Details" disclosure - never hides information,
 *  just doesn't lead with it. */
export function ErrorNotice({ raw, className }: ErrorNoticeProps) {
  const [expanded, setExpanded] = useState(false);
  const friendly = friendlyMessage(raw);
  const showToggle = friendly !== raw;

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <span>{friendly}</span>
        {showToggle && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex shrink-0 items-center gap-0.5 text-[11px] text-zinc-500 underline decoration-dotted hover:text-zinc-300"
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            Details
          </button>
        )}
      </div>
      {expanded && showToggle && (
        <div className={cn("mt-1 rounded bg-black/20 px-2 py-1 font-mono text-[11px] text-zinc-400")}>{raw}</div>
      )}
    </div>
  );
}
