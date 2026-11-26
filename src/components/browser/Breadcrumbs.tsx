import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

interface BreadcrumbsProps {
  path: string;
  sep: "/" | "\\";
  onNavigate: (path: string) => void;
}

export function Breadcrumbs({ path, sep, onNavigate }: BreadcrumbsProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(path);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(path), [path]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onNavigate(draft);
            setEditing(false);
          } else if (e.key === "Escape") {
            setDraft(path);
            setEditing(false);
          }
        }}
        className="w-full rounded border border-accent-500 bg-surface-2 px-2 py-1 font-mono text-[12px] text-zinc-100 outline-none"
      />
    );
  }

  const parts = path.split(sep).filter(Boolean);
  const crumbs: { label: string; path: string }[] = [];
  let acc: string;
  if (sep === "\\") {
    crumbs.push({ label: parts[0] ?? "C:", path: `${parts[0] ?? "C:"}\\` });
    acc = `${parts[0] ?? "C:"}\\`;
    for (const part of parts.slice(1)) {
      acc = acc.endsWith("\\") ? `${acc}${part}` : `${acc}\\${part}`;
      crumbs.push({ label: part, path: acc });
    }
  } else {
    crumbs.push({ label: "/", path: "/" });
    acc = "/";
    for (const part of parts) {
      acc = acc.endsWith("/") ? `${acc}${part}` : `${acc}/${part}`;
      crumbs.push({ label: part, path: acc });
    }
  }

  return (
    <button
      onDoubleClick={() => setEditing(true)}
      className="flex min-w-0 flex-1 items-center overflow-x-auto whitespace-nowrap rounded bg-surface-2 px-2 py-1 text-left font-mono text-[12px] text-zinc-400"
      title="Double-click to edit path"
    >
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex items-center">
          {i > 0 && <ChevronRight size={12} className="mx-0.5 shrink-0 text-zinc-600" />}
          <span
            onClick={(e) => {
              e.stopPropagation();
              onNavigate(c.path);
            }}
            className={cn(
              "rounded px-1 hover:bg-surface-3 hover:text-zinc-100",
              i === crumbs.length - 1 && "text-zinc-100",
            )}
          >
            {c.label}
          </span>
        </span>
      ))}
    </button>
  );
}
