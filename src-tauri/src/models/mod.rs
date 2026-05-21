use serde::{Deserialize, Serialize};
use serde_json::Value;

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
    pub fail_if_window_changed: Option<bool>,
}

impl Default for ReplayOptions {
    fn default() -> Self {
        Self {
            speed_multiplier: 1.0,
            countdown_ms: 3000,
            use_original_timing: true,
            skip_mouse_moves: false,
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
    pub emergency_stop_shortcut: String,
    pub skip_mouse_move_noise: bool,
    #[serde(default)]
    pub record_mouse_moves: bool,
    pub show_replay_overlay: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_replay_speed: 1.0,
            default_countdown_ms: 3000,
            emergency_stop_shortcut: "CommandOrControl+Alt+Escape".to_string(),
            skip_mouse_move_noise: false,
            record_mouse_moves: false,
            show_replay_overlay: true,
        }
    }
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
