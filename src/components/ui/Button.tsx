import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  primary: "bg-accent-600 text-white hover:bg-accent-500 active:bg-accent-700 shadow-sm shadow-accent-700/30",
  secondary: "bg-surface-3 text-zinc-100 hover:bg-surface-3/80 border border-surface-border",
  ghost: "text-zinc-300 hover:bg-surface-2 hover:text-zinc-100",
  danger: "bg-red-600/90 text-white hover:bg-red-500",
};

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  className,
  active,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-all duration-100 hover:scale-110 hover:bg-surface-2 hover:text-zinc-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100 disabled:hover:bg-transparent",
        active && "bg-surface-2 text-accent-400",
        className,
      )}
      {...props}
    />
  );
}
