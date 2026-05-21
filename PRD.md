Below is a **Codex-ready prompt** followed by a **detailed PRD + technical design** for a Tauri/Rust desktop automation app.

---

# 1. Codex Prompt

Copy/paste this into Codex.

```text
You are building a cross-platform desktop automation app using Tauri v2, Rust, TypeScript, and React.

Product goal:
Build a desktop app that lets users record mouse/keyboard actions, save them as reusable scripts, assign global shortcuts to scripts, and replay them later. The app should have a simple dashboard for managing scripts and shortcuts.

Tech stack:
- Tauri v2
- Rust backend
- React + TypeScript frontend
- SQLite for local storage
- Tauri command API for frontend/backend communication
- Tauri global shortcut plugin for registering user shortcuts
- Rust input simulation using enigo
- Rust input capture abstraction using rdev initially, but design behind a trait so it can be replaced later
- JSON event format for recorded scripts

Important constraints:
- Start with Windows, macOS, and Linux X11 support.
- Do not promise full Wayland support in v1.
- Add clear recording state indicators.
- Add an emergency stop shortcut.
- Never record hiddenly. User must explicitly press record.
- Do not record passwords or sensitive input intentionally; include a pause recording feature.
- Store everything locally first.
- Build the Rust automation layer behind clean traits so OS-specific implementations can be swapped later.

Create an initial production-quality repository with:

1. Project structure:
   - src/ React frontend
   - src-tauri/ Rust backend
   - src-tauri/src/automation/
   - src-tauri/src/storage/
   - src-tauri/src/shortcuts/
   - src-tauri/src/commands/
   - src-tauri/src/models/

2. Rust backend modules:
   - models.rs:
     - Script
     - ScriptEvent
     - EventKind
     - MouseButton
     - KeyCode
     - ShortcutBinding
     - ReplayOptions
     - RecorderState
   - automation/traits.rs:
     - InputRecorder trait
     - InputReplayer trait
   - automation/recorder.rs:
     - record_start()
     - record_stop()
     - record_pause()
     - record_resume()
     - emits events to frontend using Tauri events
   - automation/replayer.rs:
     - replay_script(script_id, options)
     - stop_replay()
     - supports delay timing
     - supports speed multiplier
   - automation/backends/enigo_replayer.rs:
     - uses enigo to replay mouse/keyboard events
   - automation/backends/rdev_recorder.rs:
     - uses rdev for global event capture where supported
   - storage/db.rs:
     - SQLite schema setup
     - CRUD for scripts
     - CRUD for shortcut bindings
   - shortcuts/manager.rs:
     - registers/unregisters global shortcuts
     - maps shortcut to script_id
     - invokes replay when shortcut is pressed
   - commands/mod.rs:
     - Tauri commands:
       - list_scripts
       - get_script
       - create_script
       - update_script
       - delete_script
       - start_recording
       - stop_recording
       - pause_recording
       - resume_recording
       - replay_script
       - stop_replay
       - list_shortcuts
       - bind_shortcut
       - unbind_shortcut
       - validate_shortcut
       - get_app_status

3. Frontend pages/components:
   - Dashboard
     - list scripts
     - search scripts
     - create new recording
     - replay button
     - edit button
     - delete button
   - ScriptDetail
     - script name
     - description
     - event count
     - duration
     - assigned shortcut
     - replay options
     - event timeline table
   - RecorderPanel
     - start recording
     - pause/resume
     - stop/save
     - visible red recording indicator
     - elapsed time
     - captured event count
   - ShortcutManager
     - assign keyboard shortcut to script
     - detect conflicts
     - unregister shortcut
   - Settings
     - emergency stop shortcut
     - replay speed default
     - countdown before replay
     - permission status placeholders for macOS Accessibility/Input Monitoring

4. Data model:
   Script:
   - id
   - name
   - description
   - events_json
   - created_at
   - updated_at
   - duration_ms
   - event_count

   ScriptEvent:
   - id
   - timestamp_ms
   - kind
   - x
   - y
   - button
   - key
   - modifiers
   - text
   - scroll_delta_x
   - scroll_delta_y
   - metadata

   ShortcutBinding:
   - id
   - script_id
   - accelerator
   - enabled
   - created_at
   - updated_at

5. Frontend/backend communication:
   - Use Tauri invoke() for commands.
   - Use Tauri events for streaming recording events and status updates.
   - Keep frontend state in a lightweight store, such as Zustand or React context.

6. UX requirements:
   - Dashboard should be clean and simple.
   - Primary actions: Record New Script, Replay, Assign Shortcut.
   - Show warning banner if permissions are missing.
   - Show platform support note for Linux Wayland.
   - Show active replay status and emergency stop instruction.
   - Use optimistic UI carefully, but backend is source of truth.

7. Safety requirements:
   - Recording can only start from explicit user action.
   - Always display recording status.
   - Add emergency stop shortcut.
   - Prevent replay while recording.
   - Prevent recording while replaying.
   - Avoid recording app’s own shortcut assignment keystrokes.
   - Store scripts locally.
   - Add future hooks for encryption, redaction, and app allowlists.

8. Deliverables:
   - Working Tauri app skeleton.
   - SQLite migrations.
   - Rust command handlers.
   - TypeScript API client wrapping invoke().
   - React UI components.
   - Mock backend fallback if native recording is unavailable.
   - README with setup, platform limitations, and next steps.

Implementation detail:
Tauri v2 provides a command system for calling Rust functions from the frontend, so expose all backend actions through #[tauri::command] functions and call them from TypeScript using invoke(). Tauri also supports Rust-to-frontend communication through events/channels, so use events for streaming recording updates. The global shortcut feature should use the official Tauri global-shortcut plugin. The input simulation backend should initially use enigo, which supports Windows, macOS, and Linux X11 by default. The global recording backend should initially use rdev, which supports macOS, Windows, and Linux X11, but wrap it behind traits because it is not guaranteed to be stable enough as a permanent abstraction.

Build this incrementally:
Milestone 1:
- App shell, dashboard, SQLite, script CRUD, fake scripts.

Milestone 2:
- Global shortcut registration and script triggering.

Milestone 3:
- Replay simple scripts using enigo.

Milestone 4:
- Record events using rdev where supported.

Milestone 5:
- Polish UX, settings, permission checks, error handling.

Generate code for the initial repository, focusing on clean architecture and compilable skeletons. Where native details are platform-specific or not yet implemented, create TODO-backed trait implementations rather than blocking the whole app.
```

---

# 2. PRD: Cross-Platform Input Recorder/Replayer

## Product Name

Working name: **MacroDeck**

## Product Summary

MacroDeck is a cross-platform desktop app that lets users record mouse and keyboard actions, save them as reusable automation scripts, and trigger those scripts later through global keyboard shortcuts.

The first version should target:

```text
Windows
macOS
Linux X11
```

Linux Wayland should be treated as experimental because input capture and synthetic input are more restricted and inconsistent there.

## Recommendation

Use:

```text
Tauri v2 + Rust backend + React TypeScript frontend
```

The core reason is that input recording and replay are native OS-level operations. Tauri gives you a web frontend while keeping the automation layer in Rust. Tauri’s command system is designed for calling Rust functions from the frontend, and Rust can emit events/channels back to the frontend for live recording updates. ([Tauri][1])

Use the official Tauri global shortcut plugin for shortcut registration. It supports registering shortcuts from JavaScript or Rust, and the docs show accelerator strings like `CommandOrControl+Shift+C`. ([Tauri][2])

For replay, start with **enigo**. Its docs describe it as a Rust library for simulating keyboard and mouse input on Linux X11, macOS, and Windows, but note that the API is still early/alpha and subject to change. ([Docs.rs][3])

For recording, start with **rdev** only behind an abstraction. Its docs describe global keyboard/mouse listening and sending on macOS, Windows, and Linux X11, but the crate also describes itself as a “pet project,” so the app should not tightly couple itself to rdev. ([Docs.rs][4])

---

# 3. Target Users

## Primary Users

1. **Power users**

   * Want to automate repetitive desktop workflows.
   * Comfortable assigning shortcuts and managing scripts.

2. **QA/testers**

   * Want to replay repetitive UI actions.
   * Need deterministic timing and replay speed controls.

3. **Ops/admin users**

   * Want simple macros for recurring desktop tasks.

## Non-goals for v1

The first version is **not** a full RPA platform.

Do not build these in v1:

```text
Cloud sync
Team sharing
Browser extension
AI workflow authoring
Computer vision scripting
Accessibility-tree automation
Wayland-perfect support
Marketplace
Complex conditional logic
```

---

# 4. Core Product Requirements

## 4.1 Script Recording

Users must be able to:

```text
Start recording
Pause recording
Resume recording
Stop recording
Save recording as script
Discard recording
Rename script
Add description
```

Recording should capture:

```text
Mouse move
Mouse down
Mouse up
Click
Double click, if inferable
Scroll
Key down
Key up
Text input, if safely inferable
Modifier state
Timestamp offset from recording start
```

Recording should not happen invisibly. The app must show a clear visual recording indicator.

## 4.2 Script Replay

Users must be able to:

```text
Replay a saved script
Stop replay
Set replay speed
Add countdown before replay
Choose whether to use original timing
Choose whether to skip mouse move noise
```

Replay should support:

```text
Mouse move
Mouse button down/up
Keyboard key down/up
Scroll
Delay between events
Speed multiplier
Emergency stop
```

## 4.3 Dashboard

The app’s main screen should show:

```text
All saved scripts
Script name
Description
Assigned shortcut
Last modified time
Duration
Event count
Replay button
Edit button
Delete button
```

Primary CTA:

```text
Record New Script
```

Secondary actions:

```text
Import script
Export script
Settings
```

## 4.4 Shortcut Management

Users should be able to bind a global shortcut to any script.

Example:

```text
CommandOrControl+Alt+1 → Replay “Open Daily Tools”
CommandOrControl+Shift+R → Start/stop recording
Escape or CommandOrControl+Alt+Escape → Emergency stop
```

The app should validate:

```text
Shortcut format
Duplicate shortcuts
Reserved shortcuts
Shortcut already registered by the app
```

Tauri’s global shortcut API can check whether a shortcut is registered by this app, but not necessarily whether another app owns it. The docs state that `isRegistered()` returns false if the shortcut is registered by another application. ([Tauri][5])

## 4.5 Settings

Settings page should include:

```text
Default replay speed
Default countdown before replay
Emergency stop shortcut
Auto-start app on login, future
Permission status
Platform support status
Data location
Export all scripts
Delete all scripts
```

## 4.6 Permission UX

macOS likely needs special onboarding for accessibility/input-monitoring style permissions. The app should have placeholders in v1:

```text
macOS Accessibility permission: Unknown / Granted / Missing
macOS Input Monitoring permission: Unknown / Granted / Missing
Screen Recording permission: Future
```

Linux should show:

```text
Linux X11: Supported
Linux Wayland: Experimental / unsupported in v1
```

---

# 5. Technical Architecture

## 5.1 High-Level Architecture

```text
React Frontend
  |
  | Tauri invoke()
  v
Rust Commands
  |
  | calls
  v
Application Services
  |
  +--> Script Service
  +--> Recorder Service
  +--> Replayer Service
  +--> Shortcut Service
  +--> Settings Service
  |
  v
Native Backends
  |
  +--> enigo replay backend
  +--> rdev recording backend
  +--> future OS-specific backends
  |
  v
SQLite Local DB
```

## 5.2 Frontend/Backend Communication

Use two communication paths.

### Request/response commands

Frontend calls Rust using Tauri commands:

```ts
import { invoke } from "@tauri-apps/api/core";

await invoke("list_scripts");
await invoke("start_recording", { name: "Daily workflow" });
await invoke("replay_script", { scriptId, options });
```

Tauri v2’s command system supports calling Rust functions from the web app, passing arguments, returning values, async commands, and errors. ([Tauri][1])

### Streaming events

Rust emits live updates to frontend:

```text
recording:started
recording:event
recording:paused
recording:resumed
recording:stopped
replay:started
replay:progress
replay:stopped
replay:error
shortcut:triggered
```

Tauri supports Rust-to-frontend communication through its event system, channels, and other mechanisms. ([Tauri][6])

---

# 6. Rust Backend Design

## 6.1 Rust Module Structure

```text
src-tauri/src/
  main.rs
  lib.rs

  models/
    mod.rs
    script.rs
    event.rs
    shortcut.rs
    settings.rs

  commands/
    mod.rs
    scripts.rs
    recording.rs
    replay.rs
    shortcuts.rs
    settings.rs

  automation/
    mod.rs
    traits.rs
    recorder.rs
    replayer.rs
    backends/
      mod.rs
      enigo_replayer.rs
      rdev_recorder.rs
      noop_recorder.rs
      noop_replayer.rs

  storage/
    mod.rs
    db.rs
    migrations.rs
    script_repository.rs
    shortcut_repository.rs
    settings_repository.rs

  shortcuts/
    mod.rs
    manager.rs

  state/
    mod.rs
    app_state.rs

  errors/
    mod.rs
```

## 6.2 Core Rust Traits

The native libraries should be hidden behind traits.

```rust
pub trait InputRecorder: Send + Sync {
    fn start(&self) -> Result<(), AutomationError>;
    fn pause(&self) -> Result<(), AutomationError>;
    fn resume(&self) -> Result<(), AutomationError>;
    fn stop(&self) -> Result<Vec<ScriptEvent>, AutomationError>;
    fn state(&self) -> RecorderState;
}
```

```rust
pub trait InputReplayer: Send + Sync {
    fn replay(
        &self,
        events: Vec<ScriptEvent>,
        options: ReplayOptions,
        stop_token: StopToken,
    ) -> Result<(), AutomationError>;

    fn stop(&self) -> Result<(), AutomationError>;
}
```

Why traits matter:

```text
rdev may be replaced later
enigo may need platform-specific patches
Wayland may need a totally different backend
macOS permissions may require a specialized backend
testing should use fake/noop backends
```

## 6.3 Replay Backend

Initial replay backend:

```text
automation/backends/enigo_replayer.rs
```

Use **enigo** for:

```text
Mouse movement
Mouse button down/up
Scroll
Keyboard key down/up
Text entry
```

Important notes:

Enigo supports Windows, macOS, and Linux X11 by default, and its GitHub README notes that Wayland/libei support is behind feature flags and has bugs. ([GitHub][7])

So v1 should say:

```text
Replay supported on Windows, macOS, Linux X11.
Wayland support is experimental and not included in v1 guarantees.
```

## 6.4 Recording Backend

Initial recording backend:

```text
automation/backends/rdev_recorder.rs
```

Use **rdev** for:

```text
Global mouse events
Global keyboard events
Timestamping
Event normalization
```

rdev supports macOS, Windows, and Linux X11 according to its docs. ([Docs.rs][4])

Because rdev describes itself as a pet project, production architecture should keep it replaceable.

## 6.5 Shortcut Backend

Use:

```text
tauri-plugin-global-shortcut
```

Shortcut manager responsibilities:

```rust
pub struct ShortcutManager {
    bindings: HashMap<String, ScriptId>,
}
```

It should support:

```text
register_shortcut(script_id, accelerator)
unregister_shortcut(script_id)
reload_shortcuts_from_db()
handle_shortcut_trigger(accelerator)
validate_shortcut(accelerator)
```

When a shortcut fires:

```text
1. Check app state.
2. If recording, ignore script replay shortcut.
3. If replaying, ignore duplicate replay shortcut.
4. If emergency stop shortcut, stop immediately.
5. Load script from SQLite.
6. Replay script.
7. Emit replay status events.
```

---

# 7. Data Model

## 7.1 Script

```ts
type Script = {
  id: string;
  name: string;
  description?: string;
  events: ScriptEvent[];
  durationMs: number;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
};
```

SQLite table:

```sql
CREATE TABLE scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  events_json TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 7.2 ScriptEvent

```ts
type ScriptEvent = {
  id: string;
  timestampMs: number;
  kind:
    | "mouse_move"
    | "mouse_down"
    | "mouse_up"
    | "mouse_scroll"
    | "key_down"
    | "key_up"
    | "text";
  x?: number;
  y?: number;
  button?: "left" | "right" | "middle" | "back" | "forward";
  key?: string;
  modifiers?: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
  };
  text?: string;
  scrollDeltaX?: number;
  scrollDeltaY?: number;
  metadata?: Record<string, unknown>;
};
```

Rust model:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptEvent {
    pub id: String,
    pub timestamp_ms: u64,
    pub kind: EventKind,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub button: Option<MouseButton>,
    pub key: Option<String>,
    pub modifiers: Option<Modifiers>,
    pub text: Option<String>,
    pub scroll_delta_x: Option<i32>,
    pub scroll_delta_y: Option<i32>,
    pub metadata: Option<serde_json::Value>,
}
```

## 7.3 ShortcutBinding

```ts
type ShortcutBinding = {
  id: string;
  scriptId: string;
  accelerator: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
```

SQLite:

```sql
CREATE TABLE shortcut_bindings (
  id TEXT PRIMARY KEY,
  script_id TEXT NOT NULL,
  accelerator TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);
```

## 7.4 Settings

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Example settings:

```json
{
  "defaultReplaySpeed": 1.0,
  "defaultCountdownMs": 3000,
  "emergencyStopShortcut": "CommandOrControl+Alt+Escape",
  "skipMouseMoveNoise": false,
  "showReplayOverlay": true
}
```

---

# 8. Tauri Commands

## Script Commands

```rust
#[tauri::command]
async fn list_scripts(state: State<'_, AppState>) -> Result<Vec<ScriptSummary>, AppError>;

#[tauri::command]
async fn get_script(id: String, state: State<'_, AppState>) -> Result<Script, AppError>;

#[tauri::command]
async fn create_script(input: CreateScriptInput, state: State<'_, AppState>) -> Result<Script, AppError>;

#[tauri::command]
async fn update_script(id: String, input: UpdateScriptInput, state: State<'_, AppState>) -> Result<Script, AppError>;

#[tauri::command]
async fn delete_script(id: String, state: State<'_, AppState>) -> Result<(), AppError>;
```

## Recording Commands

```rust
#[tauri::command]
async fn start_recording(input: StartRecordingInput, app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError>;

#[tauri::command]
async fn pause_recording(state: State<'_, AppState>) -> Result<(), AppError>;

#[tauri::command]
async fn resume_recording(state: State<'_, AppState>) -> Result<(), AppError>;

#[tauri::command]
async fn stop_recording(input: StopRecordingInput, state: State<'_, AppState>) -> Result<Script, AppError>;
```

## Replay Commands

```rust
#[tauri::command]
async fn replay_script(id: String, options: ReplayOptions, app: AppHandle, state: State<'_, AppState>) -> Result<(), AppError>;

#[tauri::command]
async fn stop_replay(state: State<'_, AppState>) -> Result<(), AppError>;
```

## Shortcut Commands

```rust
#[tauri::command]
async fn list_shortcuts(state: State<'_, AppState>) -> Result<Vec<ShortcutBinding>, AppError>;

#[tauri::command]
async fn bind_shortcut(script_id: String, accelerator: String, state: State<'_, AppState>) -> Result<ShortcutBinding, AppError>;

#[tauri::command]
async fn unbind_shortcut(binding_id: String, state: State<'_, AppState>) -> Result<(), AppError>;

#[tauri::command]
async fn validate_shortcut(accelerator: String, state: State<'_, AppState>) -> Result<ShortcutValidation, AppError>;
```

---

# 9. Frontend Design

## 9.1 Frontend Stack

Use:

```text
React
TypeScript
Vite
Tailwind or plain CSS modules
Zustand or React Context
Tauri invoke API
Tauri event listeners
```

Suggested structure:

```text
src/
  main.tsx
  App.tsx

  api/
    tauriClient.ts
    scriptsApi.ts
    recordingApi.ts
    replayApi.ts
    shortcutsApi.ts
    settingsApi.ts

  components/
    Layout.tsx
    Sidebar.tsx
    StatusBanner.tsx
    ScriptCard.tsx
    EmptyState.tsx
    ConfirmDialog.tsx

  pages/
    DashboardPage.tsx
    ScriptDetailPage.tsx
    RecorderPage.tsx
    SettingsPage.tsx

  features/
    scripts/
      ScriptList.tsx
      ScriptEditor.tsx
      EventTimeline.tsx
    recorder/
      RecorderPanel.tsx
      RecordingIndicator.tsx
    shortcuts/
      ShortcutManager.tsx
      ShortcutInput.tsx
    replay/
      ReplayControls.tsx
      ReplayStatus.tsx

  store/
    appStore.ts
    scriptsStore.ts
    recorderStore.ts
    replayStore.ts
```

## 9.2 Dashboard UX

Dashboard layout:

```text
Top bar:
  MacroDeck
  Platform status
  Recording/Replaying state

Main CTA:
  Record New Script

Script list:
  Search input
  Filter: All / With Shortcut / No Shortcut
  Sort: Recently Updated / Name / Duration

Each script card:
  Name
  Description
  Assigned shortcut
  Duration
  Event count
  Replay button
  Edit button
  Delete menu
```

## 9.3 Recorder UX

Recorder panel:

```text
[Start Recording]
[Pause]
[Resume]
[Stop & Save]
[Discard]

Elapsed: 00:12
Events captured: 142
Status: Recording
```

Must show a strong recording indicator:

```text
Red dot
“Recording”
Floating mini overlay, future
```

## 9.4 Shortcut Manager UX

Shortcut assignment flow:

```text
1. User clicks “Assign Shortcut”
2. Modal opens
3. User presses desired key combination
4. App captures combo
5. App validates conflict
6. User saves
7. Backend registers shortcut
```

Show examples:

```text
CommandOrControl+Alt+1
CommandOrControl+Shift+R
CommandOrControl+Alt+Escape
```

## 9.5 Script Detail UX

Script detail page:

```text
Script name
Description
Shortcut
Replay button
Replay speed
Countdown
Event timeline
Danger zone
```

Event timeline columns:

```text
Time
Type
Input
Position
Details
```

---

# 10. State Machine

The app should have a strict global state machine.

```text
Idle
Recording
RecordingPaused
Replaying
Error
```

Allowed transitions:

```text
Idle -> Recording
Recording -> RecordingPaused
RecordingPaused -> Recording
Recording -> Idle
RecordingPaused -> Idle
Idle -> Replaying
Replaying -> Idle
Any -> Error
Error -> Idle
```

Disallowed:

```text
Recording -> Replaying
Replaying -> Recording
Replaying -> Replaying
```

---

# 11. Replay Algorithm

Pseudo-code:

```rust
fn replay(events: Vec<ScriptEvent>, options: ReplayOptions, stop_token: StopToken) {
    let speed = options.speed_multiplier.unwrap_or(1.0);
    let mut previous_ts = 0;

    for event in events {
        if stop_token.is_stopped() {
            break;
        }

        let delay = event.timestamp_ms - previous_ts;
        let adjusted_delay = delay as f64 / speed;

        sleep(Duration::from_millis(adjusted_delay as u64));

        match event.kind {
            MouseMove => enigo.mouse_move_to(event.x, event.y),
            MouseDown => enigo.mouse_down(event.button),
            MouseUp => enigo.mouse_up(event.button),
            MouseScroll => enigo.mouse_scroll(event.scroll_delta_y),
            KeyDown => enigo.key_down(event.key),
            KeyUp => enigo.key_up(event.key),
            Text => enigo.text(event.text),
        }

        previous_ts = event.timestamp_ms;
    }
}
```

Replay options:

```ts
type ReplayOptions = {
  speedMultiplier: number;
  countdownMs: number;
  useOriginalTiming: boolean;
  skipMouseMoves: boolean;
  failIfWindowChanged?: boolean;
};
```

---

# 12. Recording Algorithm

Pseudo-code:

```rust
fn start_recording() {
    set_state(Recording);
    clear_buffer();
    start_time = now();

    backend.listen(move |native_event| {
        if state != Recording {
            return;
        }

        let event = normalize(native_event, start_time);
        buffer.push(event.clone());
        app.emit("recording:event", event);
    });
}
```

Normalization should convert native library events into app-level events:

```text
Native key code -> string key
Native mouse button -> MouseButton enum
Absolute time -> timestamp offset
Platform modifiers -> common modifier object
```

---

# 13. Safety Requirements

This category matters a lot because global input recording can look like keylogging.

Required:

```text
User must explicitly start recording
Visible recording indicator must always be shown
Emergency stop shortcut must be available
Recording must pause when assigning shortcuts
Replay must not start while recording
Recording must not start while replaying
All scripts stored locally
No hidden background recording
No automatic upload
```

Recommended:

```text
Sensitive app pause list, future
Password-field detection, future where possible
Encrypted local storage, future
Script export warning
Audit log, future
```

---

# 14. Milestones

## Milestone 1: App Skeleton

Deliver:

```text
Tauri app boots
React dashboard
SQLite initialized
Script CRUD works with fake data
Settings page exists
```

Acceptance criteria:

```text
User can create, rename, delete fake script
Data persists after restart
Frontend calls Rust commands successfully
```

## Milestone 2: Shortcut System

Deliver:

```text
Global shortcut plugin installed
Shortcut manager works
Shortcut bindings stored in SQLite
Shortcut can trigger fake replay
```

Acceptance criteria:

```text
User can bind CommandOrControl+Alt+1 to a script
Pressing shortcut emits shortcut event
Duplicate shortcut rejected
Emergency stop shortcut configured
```

## Milestone 3: Replay Engine

Deliver:

```text
enigo replay backend
Replay saved JSON script
Stop replay
Replay speed multiplier
Countdown
```

Acceptance criteria:

```text
A manually created script can move mouse/click/type
Replay can be stopped
Replay cannot start while recording
```

## Milestone 4: Recording Engine

Deliver:

```text
rdev recording backend
Start/pause/resume/stop recording
Stream events to frontend
Save recording as script
```

Acceptance criteria:

```text
User records a simple click/type sequence
Saved script appears on dashboard
User can replay saved script
Event timeline shows captured events
```

## Milestone 5: Platform Hardening

Deliver:

```text
macOS permission UX
Linux Wayland warnings
Better error messages
Shortcut conflict handling
Installer/package polish
```

Acceptance criteria:

```text
User sees clear explanation when native capture/replay is unavailable
App does not crash on unsupported backend
Logs are useful for debugging
```

---

# 15. Key Engineering Risks

## Risk 1: Linux Wayland

Wayland is the highest-risk platform. Treat it as out of scope for v1 or experimental.

Mitigation:

```text
Support Linux X11 first
Detect Wayland session
Show warning
Investigate libei/uinput later
```

## Risk 2: macOS Permissions

Recording/replay may fail without permissions.

Mitigation:

```text
Add permission diagnostics page
Show setup instructions
Fail gracefully
```

## Risk 3: Library Stability

enigo and rdev may have API or maintenance limitations.

Mitigation:

```text
Hide them behind traits
Keep event model independent
Add noop/mock backend
Add platform-specific backend later if needed
```

## Risk 4: Coordinate-Based Replay Fragility

A script may fail if windows move or UI changes.

Mitigation:

```text
Add countdown
Warn user
Future: image anchors
Future: accessibility-tree anchors
Future: active-window validation
```

---

# 16. Suggested First Repository Implementation

Start with this exact development order:

```text
1. Create Tauri v2 + React + TypeScript app
2. Add SQLite layer
3. Add models and command skeletons
4. Build dashboard using fake data
5. Implement script CRUD
6. Add global shortcut plugin
7. Implement shortcut binding UI
8. Add fake replay event
9. Add enigo replay backend
10. Add rdev recorder backend
11. Add event timeline
12. Add settings and permission warnings
```

This order avoids getting stuck on native input too early.

---

# 17. MVP Definition

The MVP is successful when a user can:

```text
Open the app
Click “Record New Script”
Record a few clicks and keystrokes
Stop and save the script
See it on dashboard
Assign a global shortcut
Press that shortcut
Watch the script replay
Stop replay with emergency shortcut
```

The MVP does **not** need:

```text
Cloud sync
Visual scripting
AI actions
Wayland support
Computer vision
Multi-device sync
Team sharing
```

---

# 18. Final Technical Choice

Use this stack:

```text
Tauri v2
React + TypeScript
Rust backend
SQLite
tauri-plugin-global-shortcut
enigo for replay
rdev for first recording backend
Trait-based abstraction for all native input operations
```

That gives you a clean path from MVP to production without locking the product to one fragile native input library.

[1]: https://v2.tauri.app/develop/calling-rust/?utm_source=chatgpt.com "Calling Rust from the Frontend"
[2]: https://v2.tauri.app/plugin/global-shortcut/?utm_source=chatgpt.com "Global Shortcut"
[3]: https://docs.rs/enigo/?utm_source=chatgpt.com "enigo - Rust"
[4]: https://docs.rs/rdev/?utm_source=chatgpt.com "rdev - Rust"
[5]: https://v2.tauri.app/reference/javascript/global-shortcut/?utm_source=chatgpt.com "@tauri-apps/plugin-global-shortcut"
[6]: https://v2.tauri.app/develop/calling-frontend/?utm_source=chatgpt.com "Calling the Frontend from Rust"
[7]: https://github.com/enigo-rs/enigo?utm_source=chatgpt.com "Enigo - Cross platform input simulation in Rust"
