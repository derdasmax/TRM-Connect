export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "—";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(secs: number | null): string {
  if (secs == null || !Number.isFinite(secs)) return "—";
  if (secs < 60) return `${Math.ceil(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.round(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function permissionsToString(mode: number | null): string {
  if (mode == null) return "";
  let out = "";
  for (const shift of [6, 3, 0]) {
    const bits = (mode >> shift) & 0b111;
    out += (bits & 0b100 ? "r" : "-") + (bits & 0b010 ? "w" : "-") + (bits & 0b001 ? "x" : "-");
  }
  return out;
}

export function permissionsToOctal(mode: number | null): string {
  if (mode == null) return "";
  return (mode & 0o7777).toString(8).padStart(3, "0");
}

export function joinPath(base: string, name: string, sep: "/" | "\\" = "/"): string {
  if (base === "") return name;
  return base.endsWith(sep) ? `${base}${name}` : `${base}${sep}${name}`;
}

export function parentPath(path: string, sep: "/" | "\\" = "/"): string {
  const trimmed = path.endsWith(sep) && path.length > 1 ? path.slice(0, -1) : path;
  const idx = trimmed.lastIndexOf(sep);
  if (idx <= 0) return sep;
  return trimmed.slice(0, idx);
}
