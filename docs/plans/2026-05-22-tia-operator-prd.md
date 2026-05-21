# TIA Operator PRD Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first full TIA Operator desktop automation app from `PRD.md`, including local script storage, recording, replay, shortcuts, app UI, release packaging, and updater-ready configuration.

**Architecture:** Keep the native automation layer behind Rust traits, with SQLite as the source of truth and Tauri commands/events as the frontend bridge. Build the React UI as a practical desktop app surface with dashboard, recorder, script detail, shortcut management, and settings.

**Tech Stack:** Tauri v2, Rust, React, TypeScript, SQLite via `rusqlite`, global shortcuts via Tauri plugin, replay via `enigo`, recording via an `rdev`-backed abstraction with graceful fallback.

---

### Task 1: Backend Foundation

**Files:**
- Create: `src-tauri/src/errors/mod.rs`
- Create: `src-tauri/src/models/mod.rs`
- Create: `src-tauri/src/state/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`

**Steps:**
1. Add app error types serializable through Tauri.
2. Add script, event, shortcut, recorder, replay, settings, status, and command input models.
3. Add shared app state with strict idle/recording/paused/replaying state handling.
4. Register managed state from `lib.rs`.
5. Run Rust formatting and compile checks.

### Task 2: SQLite Storage

**Files:**
- Create: `src-tauri/src/storage/mod.rs`
- Create: `src-tauri/src/storage/db.rs`
- Modify: `src-tauri/src/lib.rs`

**Steps:**
1. Initialize app-local SQLite data directory.
2. Create `scripts`, `shortcut_bindings`, and `settings` tables.
3. Add CRUD methods for scripts, shortcuts, and settings.
4. Persist timestamps, duration, event count, and JSON event payloads.
5. Add seed/demo fallback only through explicit UI action, not hidden data writes.

### Task 3: Automation Services

**Files:**
- Create: `src-tauri/src/automation/mod.rs`
- Create: `src-tauri/src/automation/traits.rs`
- Create: `src-tauri/src/automation/recorder.rs`
- Create: `src-tauri/src/automation/replayer.rs`
- Create: `src-tauri/src/automation/backends/mod.rs`
- Create: `src-tauri/src/automation/backends/enigo_replayer.rs`
- Create: `src-tauri/src/automation/backends/rdev_recorder.rs`
- Create: `src-tauri/src/automation/backends/noop_replayer.rs`
- Create: `src-tauri/src/automation/backends/noop_recorder.rs`

**Steps:**
1. Define recorder/replayer traits and stop-token behavior.
2. Implement a recorder service with start, pause, resume, stop, discard, and event streaming.
3. Implement a replay service with countdown, timing, speed, skip mouse moves, progress events, and emergency stop.
4. Implement native backend shells that use feature-compatible graceful no-op behavior when unsupported.
5. Enforce no recording while replaying and no replay while recording.

### Task 4: Tauri Commands And Shortcuts

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/shortcuts/mod.rs`
- Create: `src-tauri/src/shortcuts/manager.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

**Steps:**
1. Expose all PRD command handlers through `#[tauri::command]`.
2. Wire commands into SQLite, recorder, replayer, settings, and shortcut manager.
3. Add shortcut validation, duplicate detection, binding, unbinding, and emergency shortcut settings.
4. Register the Tauri global shortcut plugin and reload persisted shortcuts on startup.
5. Emit frontend events for recording, replay, and shortcut activity.

### Task 5: React Product UI

**Files:**
- Replace: `src/App.tsx`
- Replace: `src/App.css`
- Create: `src/types.ts`
- Create: `src/api/tauriClient.ts`
- Create: `src/api/operatorApi.ts`

**Steps:**
1. Build a small typed API client around Tauri `invoke`.
2. Build dashboard with search, filters, script cards, replay, edit, delete, import/export affordances.
3. Build recorder panel with visible recording status, pause/resume, stop/save, discard, elapsed time, and event count.
4. Build script detail with replay options, event timeline, shortcut assignment, and danger zone.
5. Build settings with emergency stop shortcut, replay defaults, permission/platform placeholders, data location, export/delete actions.
6. Subscribe to Tauri events for live recorder/replay status.

### Task 6: OSS, Release, And Updater Readiness

**Files:**
- Replace: `README.md`
- Create: `.github/workflows/release.yml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `package.json`
- Add: `LICENSE`

**Steps:**
1. Document setup, platform limitations, permissions, safety posture, development, packaging, and release downloads.
2. Add GitHub Actions for checks and multi-platform draft release builds.
3. Configure Tauri bundling and updater endpoints using public GitHub release metadata.
4. Add package metadata and useful scripts.
5. Verify frontend typecheck/build and Rust compile checks locally.
