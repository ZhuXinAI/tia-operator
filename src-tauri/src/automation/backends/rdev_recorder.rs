use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};

use parking_lot::Mutex;
use rdev::{Button, Event, EventType, Key};
use serde_json::json;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::models::{EventKind, Modifiers, MouseButton, RecorderState, ScriptEvent};

#[derive(Debug)]
pub struct RdevRecorderInner {
    pub status: RecorderState,
    pub started_at: Option<Instant>,
    pub paused_at: Option<Instant>,
    pub total_paused: Duration,
    pub buffer: Vec<ScriptEvent>,
    pub modifiers: Modifiers,
}

impl Default for RdevRecorderInner {
    fn default() -> Self {
        Self {
            status: RecorderState::Idle,
            started_at: None,
            paused_at: None,
            total_paused: Duration::ZERO,
            buffer: Vec::new(),
            modifiers: Modifiers::default(),
        }
    }
}

pub fn ensure_listener(
    app: AppHandle,
    inner: Arc<Mutex<RdevRecorderInner>>,
    listener_started: Arc<AtomicBool>,
) {
    if listener_started.swap(true, Ordering::SeqCst) {
        return;
    }

    std::thread::spawn(move || {
        let app_for_error = app.clone();
        let result = rdev::listen(move |event| handle_native_event(&app, &inner, event));
        if let Err(error) = result {
            let _ = app_for_error.emit(
                "recording:error",
                json!({
                    "message": format!("native input listener stopped: {error:?}")
                }),
            );
        }
    });
}

fn handle_native_event(app: &AppHandle, inner: &Arc<Mutex<RdevRecorderInner>>, event: Event) {
    let mut guard = inner.lock();
    if guard.status != RecorderState::Recording {
        return;
    }

    let Some(started_at) = guard.started_at else {
        return;
    };

    update_modifiers(&mut guard.modifiers, &event.event_type);

    let timestamp = Instant::now()
        .saturating_duration_since(started_at)
        .saturating_sub(guard.total_paused)
        .as_millis() as u64;

    let Some(script_event) = normalize_event(event, timestamp, guard.modifiers.clone()) else {
        return;
    };

    guard.buffer.push(script_event.clone());
    let event_count = guard.buffer.len();
    drop(guard);

    let _ = app.emit(
        "recording:event",
        json!({
            "event": script_event,
            "eventCount": event_count
        }),
    );
}

fn normalize_event(event: Event, timestamp_ms: u64, modifiers: Modifiers) -> Option<ScriptEvent> {
    let base = || ScriptEvent {
        id: Uuid::new_v4().to_string(),
        timestamp_ms,
        kind: EventKind::MouseMove,
        x: None,
        y: None,
        button: None,
        key: None,
        modifiers: Some(modifiers.clone()),
        text: None,
        scroll_delta_x: None,
        scroll_delta_y: None,
        metadata: Some(json!({
            "source": "rdev"
        })),
    };

    match event.event_type {
        EventType::MouseMove { x, y } => Some(ScriptEvent {
            kind: EventKind::MouseMove,
            x: Some(x.round() as i32),
            y: Some(y.round() as i32),
            ..base()
        }),
        EventType::ButtonPress(button) => Some(ScriptEvent {
            kind: EventKind::MouseDown,
            button: Some(map_button(button)),
            ..base()
        }),
        EventType::ButtonRelease(button) => Some(ScriptEvent {
            kind: EventKind::MouseUp,
            button: Some(map_button(button)),
            ..base()
        }),
        EventType::Wheel { delta_x, delta_y } => Some(ScriptEvent {
            kind: EventKind::MouseScroll,
            scroll_delta_x: Some(delta_x as i32),
            scroll_delta_y: Some(delta_y as i32),
            ..base()
        }),
        EventType::KeyPress(key) => Some(ScriptEvent {
            kind: EventKind::KeyDown,
            key: Some(format!("{key:?}")),
            text: event.name,
            ..base()
        }),
        EventType::KeyRelease(key) => Some(ScriptEvent {
            kind: EventKind::KeyUp,
            key: Some(format!("{key:?}")),
            ..base()
        }),
    }
}

fn map_button(button: Button) -> MouseButton {
    match button {
        Button::Left => MouseButton::Left,
        Button::Right => MouseButton::Right,
        Button::Middle => MouseButton::Middle,
        Button::Unknown(_) => MouseButton::Unknown,
    }
}

fn update_modifiers(modifiers: &mut Modifiers, event_type: &EventType) {
    match event_type {
        EventType::KeyPress(key) => set_modifier(modifiers, key, true),
        EventType::KeyRelease(key) => set_modifier(modifiers, key, false),
        _ => {}
    }
}

fn set_modifier(modifiers: &mut Modifiers, key: &Key, pressed: bool) {
    match key {
        Key::ShiftLeft | Key::ShiftRight => modifiers.shift = pressed,
        Key::ControlLeft | Key::ControlRight => modifiers.ctrl = pressed,
        Key::Alt | Key::AltGr => modifiers.alt = pressed,
        Key::MetaLeft | Key::MetaRight => modifiers.meta = pressed,
        _ => {}
    }
}
