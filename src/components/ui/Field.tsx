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
        "w-full rounded border border-surface-border bg-surface-2 px-2.5 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-[box-shadow,border-color] duration-150 ease-out focus:border-accent-600 focus:shadow-[inset_0_-2px_0_0_var(--color-accent-600)]",
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
        "w-full rounded border border-surface-border bg-surface-2 px-2.5 py-1.5 text-sm text-zinc-100 outline-none transition-[box-shadow,border-color] duration-150 ease-out focus:border-accent-600 focus:shadow-[inset_0_-2px_0_0_var(--color-accent-600)]",
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
      <input
        type="checkbox"
        {...props}
        className="h-3.5 w-3.5 rounded-[3px] border-surface-border accent-accent-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500"
      />
      {label}
    </label>
  );
}

/** Fluent-style pill toggle, used wherever a setting is a plain on/off
 *  rather than a checkbox-labeled option (Win11 Settings uses toggles for
 *  the former and checkboxes only inside lists/forms). */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-2.5 text-sm text-zinc-200", disabled && "opacity-40")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:cursor-not-allowed",
          checked ? "border-accent-600 bg-accent-600" : "border-surface-border bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white transition-[left] duration-150 ease-out",
            checked ? "left-[18px]" : "left-[3px]",
          )}
        />
      </button>
      {label}
    </label>
  );
}
