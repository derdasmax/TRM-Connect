import type { ComponentType } from "react";
import {
  Folder,
  FolderGit2,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileVideo,
  FileText,
  FileSpreadsheet,
  FileType2,
  FileCog,
  FileJson,
  Link2,
} from "lucide-react";
import type { DirEntry } from "./types";

export interface IconSpec {
  Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  /** Tailwind text-color utility; chosen from the 400/500 range so it reads on both themes. */
  colorClass: string;
}

const FOLDER: IconSpec = { Icon: Folder, colorClass: "text-accent-400" };
const GIT_FOLDER: IconSpec = { Icon: FolderGit2, colorClass: "text-orange-400" };
const SYMLINK: IconSpec = { Icon: Link2, colorClass: "text-zinc-400" };
const DEFAULT_FILE: IconSpec = { Icon: FileIcon, colorClass: "text-zinc-500" };

const IMAGE: IconSpec = { Icon: FileImage, colorClass: "text-pink-400" };
const VIDEO: IconSpec = { Icon: FileVideo, colorClass: "text-orange-400" };
const AUDIO: IconSpec = { Icon: FileAudio, colorClass: "text-emerald-400" };
const ARCHIVE: IconSpec = { Icon: FileArchive, colorClass: "text-amber-400" };
const CODE: IconSpec = { Icon: FileCode, colorClass: "text-sky-400" };
const JSON_LIKE: IconSpec = { Icon: FileJson, colorClass: "text-sky-300" };
const PDF: IconSpec = { Icon: FileType2, colorClass: "text-red-400" };
const DOC: IconSpec = { Icon: FileText, colorClass: "text-blue-400" };
const SHEET: IconSpec = { Icon: FileSpreadsheet, colorClass: "text-green-400" };
const EXECUTABLE: IconSpec = { Icon: FileCog, colorClass: "text-violet-400" };

const EXT_MAP: Record<string, IconSpec> = {
  // Images
  png: IMAGE, jpg: IMAGE, jpeg: IMAGE, gif: IMAGE, svg: IMAGE, webp: IMAGE, bmp: IMAGE, ico: IMAGE, avif: IMAGE, heic: IMAGE, tiff: IMAGE,
  // Video
  mp4: VIDEO, mkv: VIDEO, mov: VIDEO, avi: VIDEO, webm: VIDEO, flv: VIDEO, wmv: VIDEO, m4v: VIDEO,
  // Audio
  mp3: AUDIO, wav: AUDIO, flac: AUDIO, ogg: AUDIO, aac: AUDIO, m4a: AUDIO, opus: AUDIO,
  // Archives
  zip: ARCHIVE, gz: ARCHIVE, tgz: ARCHIVE, tar: ARCHIVE, "7z": ARCHIVE, rar: ARCHIVE, bz2: ARCHIVE, xz: ARCHIVE, iso: ARCHIVE,
  // Code
  ts: CODE, tsx: CODE, js: CODE, jsx: CODE, mjs: CODE, rs: CODE, py: CODE, go: CODE, rb: CODE, php: CODE,
  java: CODE, kt: CODE, swift: CODE, c: CODE, h: CODE, cpp: CODE, hpp: CODE, cs: CODE, html: CODE, css: CODE,
  scss: CODE, less: CODE, vue: CODE, sql: CODE, yml: CODE, yaml: CODE, toml: CODE, xml: CODE, sh: CODE, bash: CODE, zsh: CODE, ps1: CODE,
  json: JSON_LIKE,
  // PDFs
  pdf: PDF,
  // Documents / text
  txt: DOC, md: DOC, log: DOC, rtf: DOC, doc: DOC, docx: DOC, odt: DOC,
  // Spreadsheets
  csv: SHEET, xls: SHEET, xlsx: SHEET, ods: SHEET, tsv: SHEET,
  // Executables / installers
  exe: EXECUTABLE, msi: EXECUTABLE, dmg: EXECUTABLE, deb: EXECUTABLE, rpm: EXECUTABLE, bat: EXECUTABLE, app: EXECUTABLE,
};

/** Folder names that get a themed icon instead of the plain folder glyph. */
const SPECIAL_FOLDERS: Record<string, IconSpec> = {
  ".git": GIT_FOLDER,
};

export function iconForEntry(entry: DirEntry): IconSpec {
  if (entry.is_dir) return SPECIAL_FOLDERS[entry.name] ?? FOLDER;
  if (entry.is_symlink) return SYMLINK;
  const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? DEFAULT_FILE;
}
