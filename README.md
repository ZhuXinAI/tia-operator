# TIA Operator

TIA Operator is a local-first desktop automation app for recording mouse and keyboard actions, saving them as reusable scripts, assigning global shortcuts, and replaying them later.

It is built with Tauri v2, Rust, React, TypeScript, SQLite, rdev, enigo, and the official Tauri global shortcut and updater plugins.

## Status

This is a v1 implementation scaffold with real local storage, command handlers, app state gates, shortcut registration, native recording/replay backends, and release packaging. Native input permissions vary by OS, so the app degrades with visible status and platform notes instead of recording silently.

Supported v1 targets:

- Windows
- macOS
- Linux X11

Linux Wayland is not a v1 guarantee because global input capture and synthetic input are heavily restricted there.

## Safety Model

- Recording only starts from an explicit user action.
- The UI always shows recording state.
- Scripts are stored locally in SQLite.
- Replay is blocked while recording.
- Recording is blocked while replaying.
- A global emergency stop shortcut is available.
- Future hooks are left for encryption, redaction, app allowlists, and richer permission checks.

## Local Development

Prerequisites:

- Node.js 20+
- pnpm
- Rust 1.85+
- Tauri system dependencies for your OS

Install dependencies:

```bash
pnpm install
```

Run the desktop app:

```bash
pnpm tauri:dev
```

Run checks:

```bash
pnpm build
cd src-tauri && cargo check
```

Build an installer locally:

```bash
pnpm tauri:build
```

Generated bundles are written under `src-tauri/target/release/bundle`.

## Platform Notes

macOS may require Accessibility and Input Monitoring permissions before recording or replay works. The settings screen shows placeholders for these states in v1.

Linux X11 is the supported Linux target for v1. Wayland sessions may show limited support because global input automation is intentionally constrained by the compositor.

Windows global shortcuts and replay depend on OS-level shortcut availability. A shortcut can be valid but still unavailable if another app owns it.

## Data

TIA Operator stores local data in the app data directory reported in Settings. The SQLite database is named:

```text
tia-operator.sqlite3
```

Scripts can be exported and imported as JSON from Settings.

## Release Downloads

This repo includes `.github/workflows/release.yml`. Pushing a tag like `v0.1.0` builds release artifacts for macOS, Windows, and Linux and uploads them to a GitHub Release through `tauri-apps/tauri-action`.

Before publishing:

1. Replace `OWNER` in `package.json` and `src-tauri/tauri.conf.json`.
2. Replace `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY` in `src-tauri/tauri.conf.json`.
3. Add updater signing secrets to GitHub:
   - `TAURI_UPDATER_PUBLIC_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
4. Push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow runs `scripts/prepare-release-config.mjs`, which replaces the updater endpoint with the current GitHub repository and requires updater signing secrets before publishing.

## Auto Update Readiness

The Tauri updater plugin is registered in Rust and permitted in `src-tauri/capabilities/default.json`.

The app is configured to check this updater endpoint after you replace `OWNER`:

```text
https://github.com/OWNER/tia-operator/releases/latest/download/latest.json
```

Tauri updater signatures require a real keypair. Generate one with:

```bash
pnpm tauri signer generate
```

Put the public key in `src-tauri/tauri.conf.json` and store the private key in GitHub Actions secrets.

## Project Structure

```text
src/
  api/                 Typed Tauri invoke client
  App.tsx              Product UI
  types.ts             Shared frontend types

src-tauri/src/
  automation/          Recorder/replayer traits and native backends
  commands/            Tauri command handlers
  errors/              Serializable command errors
  models/              Rust data contracts
  shortcuts/           Global shortcut manager
  state/               Runtime state machine
  storage/             SQLite setup and repositories
```

## License

MIT
