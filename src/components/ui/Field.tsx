import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={cn("mb-1 block text-xs font-medium text-zinc-400", props.className)} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-surface-border bg-surface-2 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50",
        props.className,
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-md border border-surface-border bg-surface-2 px-2.5 py-1.5 text-sm text-zinc-100 outline-none transition-colors focus:border-accent-500 focus:ring-1 focus:ring-accent-500/50",
        props.className,
      )}
    />
  );
}

export function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function Checkbox({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-300">
      <input type="checkbox" {...props} className="h-3.5 w-3.5 rounded border-surface-border accent-accent-600" />
      {label}
    </label>
  );
}
