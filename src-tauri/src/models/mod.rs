use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Script {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub events: Vec<ScriptEvent>,
    pub created_at: String,
    pub updated_at: String,
    pub duration_ms: u64,
    pub event_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptSummary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub duration_ms: u64,
    pub event_count: u64,
    pub shortcut: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptEvent {
    pub id: String,
    #[serde(default)]
    pub timestamp_ms: u64,
    pub kind: EventKind,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub button: Option<MouseButton>,
    pub key: Option<String>,
    pub modifiers: Option<Modifiers>,
    pub text: Option<String>,
    #[serde(default)]
    pub wait_ms: Option<u64>,
    pub scroll_delta_x: Option<i32>,
    pub scroll_delta_y: Option<i32>,
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    MouseMove,
    MouseDown,
    MouseUp,
    MouseScroll,
    KeyDown,
    KeyUp,
    Text,
    Wait,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MouseButton {
    Left,
    Right,
    Middle,
    Back,
    Forward,
    Unknown,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Modifiers {
    pub shift: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub meta: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBinding {
    pub id: String,
    pub script_id: String,
    pub accelerator: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayOptions {
    pub speed_multiplier: f64,
    pub countdown_ms: u64,
    pub use_original_timing: bool,
    pub skip_mouse_moves: bool,
    #[serde(default)]
    pub loop_enabled: bool,
    #[serde(default = "default_loop_interval_ms")]
    pub loop_interval_ms: u64,
    pub fail_if_window_changed: Option<bool>,
}

impl Default for ReplayOptions {
    fn default() -> Self {
        Self {
            speed_multiplier: 1.0,
            countdown_ms: 3000,
            use_original_timing: true,
            skip_mouse_moves: false,
            loop_enabled: false,
            loop_interval_ms: default_loop_interval_ms(),
            fail_if_window_changed: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RecorderState {
    Idle,
    Recording,
    RecordingPaused,
    Replaying,
    Error,
}

impl Default for RecorderState {
    fn default() -> Self {
        Self::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub default_replay_speed: f64,
    pub default_countdown_ms: u64,
    #[serde(default)]
    pub default_loop_enabled: bool,
    #[serde(default = "default_loop_interval_ms")]
    pub default_loop_interval_ms: u64,
    pub emergency_stop_shortcut: String,
    pub skip_mouse_move_noise: bool,
    #[serde(default)]
    pub record_mouse_moves: bool,
    #[serde(default = "default_show_replay_overlay")]
    pub show_replay_overlay: bool,
    #[serde(default = "default_language")]
    pub language: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_replay_speed: 1.0,
            default_countdown_ms: 3000,
            default_loop_enabled: false,
            default_loop_interval_ms: default_loop_interval_ms(),
            emergency_stop_shortcut: "CommandOrControl+Alt+Escape".to_string(),
            skip_mouse_move_noise: false,
            record_mouse_moves: false,
            show_replay_overlay: true,
            language: default_language(),
        }
    }
}

fn default_loop_interval_ms() -> u64 {
    1000
}

fn default_language() -> String {
    "system".to_string()
}

fn default_show_replay_overlay() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateScriptInput {
    pub name: String,
    pub description: Option<String>,
    pub events: Option<Vec<ScriptEvent>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateScriptInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub events: Option<Vec<ScriptEvent>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRecordingInput {
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StopRecordingInput {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutValidation {
    pub valid: bool,
    pub reason: Option<String>,
    pub normalized: Option<String>,
    pub conflict_script_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionStatus {
    pub macos_accessibility: String,
    pub macos_input_monitoring: String,
    pub screen_recording: String,
}

impl Default for PermissionStatus {
    fn default() -> Self {
        Self {
            macos_accessibility: "unknown".to_string(),
            macos_input_monitoring: "unknown".to_string(),
            screen_recording: "future".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformStatus {
    pub os: String,
    pub linux_session: Option<String>,
    pub replay_supported: bool,
    pub recording_supported: bool,
    pub wayland_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStatus {
    pub state: RecorderState,
    pub active_script_id: Option<String>,
    pub recording_event_count: u64,
    pub recording_elapsed_ms: u64,
    pub replay_script_id: Option<String>,
    pub platform: PlatformStatus,
    pub permissions: PermissionStatus,
    pub emergency_stop_shortcut: String,
    pub data_dir: String,
}

pub fn normalize_script_events(events: Vec<ScriptEvent>) -> Vec<ScriptEvent> {
    if events.iter().any(|event| event.kind == EventKind::Wait) {
        return events.into_iter().map(normalize_explicit_event).collect();
    }

    let mut normalized = Vec::with_capacity(events.len());
    let mut previous_timestamp = 0;

    for mut event in events {
        let delay = event.timestamp_ms.saturating_sub(previous_timestamp);
        if delay > 0 {
            normalized.push(create_wait_event(delay));
        }

        previous_timestamp = event.timestamp_ms;
        event.timestamp_ms = 0;
        event.wait_ms = None;
        normalized.push(event);
    }

    normalized
}

pub fn script_duration_ms(events: &[ScriptEvent]) -> u64 {
    if events.iter().any(|event| event.kind == EventKind::Wait) {
        return events
            .iter()
            .filter_map(|event| {
                if event.kind == EventKind::Wait {
                    event.wait_ms
                } else {
                    None
                }
            })
            .sum();
    }

    events
        .iter()
        .map(|event| event.timestamp_ms)
        .max()
        .unwrap_or(0)
}

fn normalize_explicit_event(mut event: ScriptEvent) -> ScriptEvent {
    if event.kind == EventKind::Wait {
        event.wait_ms = Some(event.wait_ms.unwrap_or(event.timestamp_ms));
    } else {
        event.wait_ms = None;
    }

    event.timestamp_ms = 0;
    event
}

fn create_wait_event(wait_ms: u64) -> ScriptEvent {
    ScriptEvent {
        id: Uuid::new_v4().to_string(),
        timestamp_ms: 0,
        kind: EventKind::Wait,
        x: None,
        y: None,
        button: None,
        key: None,
        modifiers: None,
        text: None,
        wait_ms: Some(wait_ms),
        scroll_delta_x: None,
        scroll_delta_y: None,
        metadata: Some(serde_json::json!({
            "source": "timing"
        })),
    }
}
