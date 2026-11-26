# TRM-Connect

A modern, animated Windows desktop client for **SFTP, SCP, FTP and FTPS** file
transfer — functionally in the spirit of WinSCP, with a contemporary,
GPU-accelerated UI.

## Stack, and why

| Layer | Choice | Why |
|---|---|---|
| Shell | **Tauri v2** | A native Rust process + the OS's own WebView2 on Windows gives a small installer, low idle RAM, and native OS integration (file dialogs, drag & drop, credential store), while the UI is a normal, fast-iterating web app. |
| Backend | **Rust** | Memory-safe systems language, first-class async (Tokio), and a mature crypto/SSH ecosystem — a good fit for a network-heavy, security-sensitive client. |
| SFTP/SCP | `russh` + `russh-sftp` | Pure-Rust SSH implementation (no OpenSSL/libssh2 linking headaches when cross-building for Windows), actively maintained, async-native. |
| FTP/FTPS | `suppaftp` + `rustls` | Async, Tokio-native FTP client with explicit/implicit FTPS over rustls (no OpenSSL dependency either). |
| Secrets | AES-256-GCM, key from OS keyring (**DPAPI** on Windows) or **Argon2id** master password | Matches the brief's own suggestion; DPAPI-backed by default so there's nothing to remember, with a master-password mode as an opt-in alternative. |
| Frontend | **React + TypeScript + Tailwind v4 + Framer Motion** | Modern, animated UI with a short iteration loop; Tailwind v4's CSS-first theming keeps the design system in one place; Framer Motion gives cheap, GPU-accelerated transitions that stay snappy. |
| Lists | `@tanstack/react-virtual` | Directories with thousands of entries stay smooth — only visible rows are rendered. |
| State | Zustand | Minimal boilerplate, no context-provider ceremony, easy to reason about for a handful of largely-independent stores (sites, transfers, settings). |
| Installer | **Tauri bundler** (NSIS + MSI) via GitHub Actions on `windows-latest` | Tauri's bundler produces both a `.exe` (NSIS) and `.msi` in one build; building on an actual Windows runner sidesteps the usual cross-compilation pain of GUI toolkits. |

WPF/WinUI 3 was the other realistic option, and would have won on deeper native
Explorer integration (context-menu extensions, ultra-native drag & drop). It
lost out because Tauri gets a smaller, faster-starting binary and a much
faster UI iteration loop for the animation-heavy design this brief asks for,
without giving up meaningful native capability — drag & drop from Explorer,
OS credential storage and native dialogs are all still first-class.

## Architecture

```
TRM-Connect/
├── src/                          React/TS frontend
│   ├── components/
│   │   ├── browser/              Dual-pane file browser (list, breadcrumbs, chmod…)
│   │   ├── sitemanager/          Site Manager + Quick Connect forms
│   │   ├── transfers/            Transfer queue panel
│   │   ├── layout/                Top bar
│   │   └── ui/                   Button, Modal, ContextMenu, form fields
│   ├── hooks/usePane.ts          Shared local/remote directory-browsing state machine
│   ├── store/                    Zustand stores: sites, transfers, settings
│   └── lib/                      Typed Tauri command wrappers, formatting, types
│
└── src-tauri/                    Rust backend
    ├── src/                      Tauri command layer + app state (thin)
    │   ├── commands/             sites.rs, connection.rs, browse.rs, transfer.rs
    │   └── state.rs              AppState: site store, active connections, transfer engine
    └── crates/trm-core/          Protocol-agnostic engine (no Tauri/GUI dependency)
        └── src/
            ├── model/            SiteProfile, DirEntry, TransferTask, …
            ├── crypto/           AES-256-GCM secret encryption (keyring or master password)
            ├── storage/          Encrypted-at-rest Site Manager persistence
            ├── protocol/         `FileTransferClient` trait + sftp.rs, scp.rs, ftp.rs, ssh_session.rs
            ├── transfer/         Background queue: pause/resume/cancel, progress/speed/ETA
            └── local.rs          Local filesystem pane operations
```

`trm-core` deliberately has **no dependency on Tauri or any GUI toolkit** —
every protocol client, the crypto/storage layer and the transfer engine are
plain, testable Rust (`cargo test -p trm-core` runs 5 unit tests covering
crypto round-trips, encrypted-storage persistence, and local FS listing).
The `src-tauri` crate is a thin adapter that turns `trm-core`'s API into
`#[tauri::command]`s and forwards transfer progress as window events. This
split is also why development in this particular sandbox (no GTK/WebKit
system libraries available on Linux) could still be verified end-to-end for
the engine, even though the GUI shell itself can only be *built* on
Windows/macOS/Linux-with-webkit.

## Connections

- **SFTP** — full implementation over `russh`/`russh-sftp`: list/stat/mkdir/
  remove/rename/chmod/canonicalize, streamed upload/download with
  pause/cancel checked between chunks.
- **SCP** — real `scp` wire protocol for transfers; since legacy SCP has no
  "list directory" primitive, browsing/management (`ls`, `mkdir`, `rm`,
  `mv`, `chmod`, `readlink`) shells out over the same SSH session, exactly
  as WinSCP itself does in SCP mode. Requires a POSIX shell + coreutils on
  the server — use SFTP where available.
- **FTP/FTPS** — `suppaftp` over Tokio + rustls, both explicit (`AUTH TLS`)
  and implicit FTPS, active/passive mode. FTP has no permissions model, so
  `chmod` correctly reports "unsupported" rather than pretending to work.
- **Host keys** — trust-on-first-use with a visible fingerprint banner and
  an explicit "trust & remember" action that pins the fingerprint on the
  saved site; a later mismatch is treated as a hard failure (possible
  MITM), never silently accepted.
- **Secrets** — encrypted at rest with AES-256-GCM. Default key source is
  the OS credential store (`keyring` crate → Windows Credential Manager /
  DPAPI); a master-password (Argon2id-derived key) backend exists as a
  drop-in alternative in `trm-core::crypto`, not yet wired to a "set master
  password" UI flow (see Known limitations).

## Status by milestone

1. **Connection manager + SFTP** — done (Site Manager persistence, encrypted
   secrets, SFTP connect/list/browse).
2. **Dual-pane browser** — done (local + remote panes, virtualized lists,
   breadcrumbs, context menus, mkdir/rename/delete, chmod).
3. **Transfers with progress** — done (queue, pause/resume/cancel per task
   or globally, speed/ETA, background — each transfer opens its own
   connection so browsing never blocks on an active transfer).
4. **UI polish/animations** — done (dark-first theme, Framer Motion
   transitions, skeleton loading states, animated transfer queue).
5. **Installer** — done (Tauri bundler configured for NSIS + MSI; GitHub
   Actions workflow builds both on `windows-latest` and attaches them to
   GitHub Releases on version tags).

### What's actually been run, not just compiled

This sandbox has no Windows runner, so the installer itself is unverified —
`build-windows.yml` producing a real, working `.exe`/`.msi` on
`windows-latest` should be treated as this project's first real Windows
build. But the *app* has been run and exercised for real, on Linux, with a
GTK/WebKit build of the Tauri shell installed in this container:
`cargo test -p trm-core` (5/5 passing) plus `cargo build -p app` and
`cargo clippy` (both clean) were followed by actually launching the app
under Xvfb and driving it with `xdotool` against a real local `sshd`:

- Quick Connect over real SFTP to `127.0.0.1:2222`, including the
  trust-on-first-use host key banner with a real fingerprint.
- Browsing both panes (virtualized list, breadcrumbs, path-edit navigation)
  against the live remote filesystem.
- A real upload (`.claude.json`, 37 KB) that completed with a correct,
  live-updating progress bar, and was verified byte-for-byte on disk
  afterwards (`ls -la` matched exactly).
- Protocol switching in the connect form (port/field changes for FTP vs.
  SFTP), and both dark and light themes.

That pass caught and fixed three real bugs no amount of reading would have:
1. `TransferEngine::new()` called `tokio::spawn` from inside Tauri's
   synchronous `setup()` closure, which isn't running inside an entered
   Tokio runtime — startup reliably panicked. Fixed by wrapping the
   `AppState::new()` call in `tauri::async_runtime::block_on`.
2. A `<button>` nested inside another `<button>` in the transfer queue
   header (invalid HTML) — split into a sibling `<div>`/`<button>` pair.
3. A real race: for a transfer fast enough to complete before its
   `enqueue_*` command's promise resolved in the frontend, the
   `transfer://progress`/`transfer://status` events arrived before the
   optimistic task entry existed in the store and were silently dropped,
   leaving the UI stuck at "0 B / 0 B COMPLETED". Fixed with a small
   pending-event buffer in `useTransferStore` that's replayed once the task
   is inserted.
4. (Caught in review, not at runtime) the theme toggle changed state but
   there was no actual light-mode palette — only a `.dark` class was ever
   toggled against dark-only colors. Added a real light theme: the
   `--color-surface-*` tokens swap under `:root:not(.dark)`, plus explicit
   overrides for the zinc/red/amber/emerald utility classes used for body
   text and status banners.
- **Directory sync preview**, **remote-file-in-external-editor** round-trip,
  and **recursive folder upload/download** (today's transfer engine moves
  one file per task; a folder drop/selection needs to be expanded into
  per-file tasks client-side, which isn't wired up yet) are in the original
  brief but not yet implemented.
- **SSH agent authentication** is modeled (`AuthMethod::Agent`) but not
  implemented — currently returns a clear error instead of silently falling
  back to another method.
- Master-password vault mode exists in `trm-core` but has no Settings UI
  toggle yet; DPAPI/keyring mode is the only one reachable from the app
  today.
- Pane-to-pane HTML5 drag & drop (as opposed to the Explorer → remote pane
  native drop, and the toolbar transfer button, both of which work) is
  implemented but unverified — Tauri's `dragDropEnabled: true` (needed for
  real Explorer drops) is documented to disable the browser's HTML5 file
  drag API, so in-pane dragging may not doubles as a working *file* transfer
  trigger on Windows. The toolbar's transfer button is the reliable path
  today.

## Code signing

The installer is unsigned by default — Windows SmartScreen will warn on
first run. To sign it later:

1. Buy or obtain a code signing certificate (an EV certificate on a
   hardware token avoids most SmartScreen reputation issues; a standard
   OV certificate also works but takes longer to build reputation).
2. Export it as a base64-encoded `.pfx` and store it as a GitHub Actions
   secret (`WINDOWS_CERTIFICATE`, plus `WINDOWS_CERTIFICATE_PASSWORD`).
3. Uncomment the "Import code signing certificate" step in
   `.github/workflows/build-windows.yml` and set
   `tauri.conf.json → bundle.windows.certificateThumbprint` (or use
   `signCommand` for a cloud HSM / `signtool`-compatible signing service).
4. Tauri's bundler invokes `signtool` (or your custom `signCommand`)
   automatically once a thumbprint/command is configured — no other code
   changes needed.

## Releasing & Updates

The app checks `https://github.com/derdasmax/TRM-Connect/releases/latest/download/latest.json`
for updates (via `tauri-plugin-updater`) and installs them in place through
`tauri-plugin-process`'s `relaunch()` — no reinstall needed. Every build is
signed with an Ed25519 keypair (`tauri signer generate`); the public half is
already in `tauri.conf.json` (`plugins.updater.pubkey`), and the private half
must exist only as the GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — never commit it to the repository.

To ship a release:

1. Bump the version in `package.json`, `src-tauri/Cargo.toml`, and
   `src-tauri/tauri.conf.json` (all three — they're independent and nothing
   cross-checks them).
2. Push a `vX.Y.Z` tag matching that version (`git tag v0.2.1 && git push
   origin v0.2.1`).
3. `.github/workflows/build-windows.yml`'s `release` job builds, signs (using
   the secrets above), and publishes a **non-draft** GitHub Release with the
   NSIS/MSI installers plus `latest.json` attached — a draft release never
   shows up as "latest", so the updater would never find it.
4. Already-installed copies pick it up next time they check (on startup if
   "Check for updates automatically" is on in Settings, or via Settings →
   Updates → "Check for updates" / the Command Palette).

## Development

```bash
npm install
npm run dev          # Vite dev server
npm run tauri dev     # full app (requires Rust + platform WebView deps)
npm run build         # frontend only: tsc + vite build
cargo test -p trm-core --manifest-path src-tauri/Cargo.toml   # engine unit tests
```

Building the actual Windows installer requires either a Windows machine
(`npm run tauri build`) or the `build-windows.yml` GitHub Actions workflow.
