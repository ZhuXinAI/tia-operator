use enigo::{
    Axis, Button as EnigoButton, Coordinate, Direction, Enigo, Key, Keyboard, Mouse, Settings,
};

use crate::{
    automation::traits::InputReplayer,
    errors::{AppError, AppResult},
    models::{EventKind, MouseButton, ScriptEvent},
};

#[derive(Default)]
pub struct EnigoReplayer;

impl EnigoReplayer {
    pub fn new() -> Self {
        Self
    }
}

impl InputReplayer for EnigoReplayer {
    fn replay_event(&self, event: &ScriptEvent) -> AppResult<()> {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|error| {
            AppError::invalid(format!("failed to initialize input replay: {error}"))
        })?;

        match event.kind {
            EventKind::MouseMove => {
                if let (Some(x), Some(y)) = (event.x, event.y) {
                    enigo
                        .move_mouse(x, y, Coordinate::Abs)
                        .map_err(replay_error)?;
                }
            }
            EventKind::MouseDown => {
                move_to_event_position(&mut enigo, event)?;
                if let Some(button) = event.button.as_ref().and_then(map_mouse_button) {
                    enigo
                        .button(button, Direction::Press)
                        .map_err(replay_error)?;
                }
            }
            EventKind::MouseUp => {
                move_to_event_position(&mut enigo, event)?;
                if let Some(button) = event.button.as_ref().and_then(map_mouse_button) {
                    enigo
                        .button(button, Direction::Release)
                        .map_err(replay_error)?;
                }
            }
            EventKind::MouseScroll => {
                if let Some(delta_y) = event.scroll_delta_y {
                    if delta_y != 0 {
                        enigo
                            .scroll(delta_y, Axis::Vertical)
                            .map_err(replay_error)?;
                    }
                }
                if let Some(delta_x) = event.scroll_delta_x {
                    if delta_x != 0 {
                        enigo
                            .scroll(delta_x, Axis::Horizontal)
                            .map_err(replay_error)?;
                    }
                }
            }
            EventKind::KeyDown => {
                if let Some(key) = event.key.as_deref().and_then(map_key) {
                    enigo.key(key, Direction::Press).map_err(replay_error)?;
                } else if let Some(text) = event.text.as_deref() {
                    enigo.text(text).map_err(replay_error)?;
                }
            }
            EventKind::KeyUp => {
                if let Some(key) = event.key.as_deref().and_then(map_key) {
                    enigo.key(key, Direction::Release).map_err(replay_error)?;
                }
            }
            EventKind::Text => {
                if let Some(text) = event.text.as_deref() {
                    enigo.text(text).map_err(replay_error)?;
                }
            }
        }

        Ok(())
    }
}

fn move_to_event_position(enigo: &mut Enigo, event: &ScriptEvent) -> AppResult<()> {
    if let (Some(x), Some(y)) = (event.x, event.y) {
        enigo
            .move_mouse(x, y, Coordinate::Abs)
            .map_err(replay_error)?;
    }

    Ok(())
}

fn replay_error(error: enigo::InputError) -> AppError {
    AppError::invalid(format!("input replay failed: {error}"))
}

fn map_mouse_button(button: &MouseButton) -> Option<EnigoButton> {
    match button {
        MouseButton::Left => Some(EnigoButton::Left),
        MouseButton::Right => Some(EnigoButton::Right),
        MouseButton::Middle => Some(EnigoButton::Middle),
        MouseButton::Back => Some(EnigoButton::Back),
        MouseButton::Forward => Some(EnigoButton::Forward),
        MouseButton::Unknown => None,
    }
}

fn map_key(key: &str) -> Option<Key> {
    let normalized = key.trim();
    if normalized.chars().count() == 1 {
        return normalized.chars().next().map(Key::Unicode);
    }

    if let Some(character) = map_printable_key_code(normalized) {
        return Some(Key::Unicode(character));
    }

    match normalized {
        "Alt" | "AltLeft" | "AltRight" | "Option" => Some(Key::Alt),
        "Backspace" => Some(Key::Backspace),
        "CapsLock" => Some(Key::CapsLock),
        "Control" | "ControlLeft" | "ControlRight" | "Ctrl" => Some(Key::Control),
        "Delete" => Some(Key::Delete),
        "DownArrow" | "ArrowDown" | "Down" => Some(Key::DownArrow),
        "End" => Some(Key::End),
        "Escape" | "Esc" => Some(Key::Escape),
        "F1" => Some(Key::F1),
        "F2" => Some(Key::F2),
        "F3" => Some(Key::F3),
        "F4" => Some(Key::F4),
        "F5" => Some(Key::F5),
        "F6" => Some(Key::F6),
        "F7" => Some(Key::F7),
        "F8" => Some(Key::F8),
        "F9" => Some(Key::F9),
        "F10" => Some(Key::F10),
        "F11" => Some(Key::F11),
        "F12" => Some(Key::F12),
        "Home" => Some(Key::Home),
        "LeftArrow" | "ArrowLeft" | "Left" => Some(Key::LeftArrow),
        "Meta" | "MetaLeft" | "MetaRight" | "Command" | "Super" => Some(Key::Meta),
        "PageDown" => Some(Key::PageDown),
        "PageUp" => Some(Key::PageUp),
        "Return" | "Enter" => Some(Key::Return),
        "RightArrow" | "ArrowRight" | "Right" => Some(Key::RightArrow),
        "Shift" | "ShiftLeft" | "ShiftRight" => Some(Key::Shift),
        "Space" => Some(Key::Space),
        "Tab" => Some(Key::Tab),
        "UpArrow" | "ArrowUp" | "Up" => Some(Key::UpArrow),
        _ => None,
    }
}

fn map_printable_key_code(key: &str) -> Option<char> {
    if let Some(letter) = key.strip_prefix("Key") {
        if letter.len() == 1 {
            return letter
                .chars()
                .next()
                .map(|character| character.to_ascii_lowercase());
        }
    }

    if let Some(number) = key.strip_prefix("Num") {
        if number.len() == 1 {
            return number.chars().next();
        }
    }

    match key {
        "BackQuote" | "Grave" => Some('`'),
        "Minus" => Some('-'),
        "Equal" => Some('='),
        "LeftBracket" => Some('['),
        "RightBracket" => Some(']'),
        "BackSlash" | "Backslash" => Some('\\'),
        "Semicolon" => Some(';'),
        "Quote" => Some('\''),
        "Comma" => Some(','),
        "Dot" | "Period" => Some('.'),
        "Slash" => Some('/'),
        _ => None,
    }
}
