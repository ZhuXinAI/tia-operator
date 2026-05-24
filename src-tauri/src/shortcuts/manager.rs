use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{
    GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

use crate::{
    errors::{AppError, AppResult},
    models::{ReplayOptions, ShortcutBinding, ShortcutValidation},
    state::AppState,
};

pub fn handle_global_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }

    let accelerator = shortcut.into_string();
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>().inner().clone();
        let settings = match state.db.get_settings() {
            Ok(settings) => settings,
            Err(error) => {
                let _ = app.emit("shortcut:error", json!({ "message": error.to_string() }));
                return;
            }
        };

        if shortcut_matches(&accelerator, &settings.emergency_stop_shortcut) {
            let _ = app.emit(
                "shortcut:triggered",
                json!({
                    "accelerator": accelerator
                }),
            );
            let _ = state.stop_replay(&app);
            return;
        }

        let script_id = state
            .shortcut_routes
            .lock()
            .expect("shortcut route lock poisoned")
            .get(&accelerator)
            .cloned();

        let Some(script_id) = script_id else {
            let _ = app.emit(
                "shortcut:error",
                json!({
                    "message": "shortcut is not assigned to a script"
                }),
            );
            return;
        };

        let _ = app.emit(
            "shortcut:triggered",
            json!({
                "accelerator": accelerator,
                "scriptId": script_id.clone()
            }),
        );

        let options = ReplayOptions {
            speed_multiplier: settings.default_replay_speed,
            countdown_ms: settings.default_countdown_ms,
            use_original_timing: true,
            skip_mouse_moves: settings.skip_mouse_move_noise,
            loop_enabled: settings.default_loop_enabled,
            loop_interval_ms: settings.default_loop_interval_ms,
            fail_if_window_changed: None,
        };

        if let Err(error) = state.start_replay(app.clone(), script_id, options) {
            let _ = app.emit(
                "shortcut:error",
                json!({
                    "message": error.to_string()
                }),
            );
        }
    });
}

pub fn reload_shortcuts(app: &AppHandle, state: &AppState) -> AppResult<()> {
    state
        .shortcut_routes
        .lock()
        .expect("shortcut route lock poisoned")
        .clear();

    for binding in state.db.list_shortcuts()? {
        if binding.enabled {
            register_binding(app, state, &binding)?;
        }
    }

    let settings = state.db.get_settings()?;
    let emergency_shortcut = normalize_accelerator(&settings.emergency_stop_shortcut)?;
    if !app
        .global_shortcut()
        .is_registered(emergency_shortcut.as_str())
    {
        app.global_shortcut()
            .register(emergency_shortcut.as_str())
            .map_err(|error| {
                AppError::invalid(format!("failed to register emergency shortcut: {error}"))
            })?;
    }

    Ok(())
}

pub fn register_binding(
    app: &AppHandle,
    state: &AppState,
    binding: &ShortcutBinding,
) -> AppResult<()> {
    let normalized = normalize_accelerator(&binding.accelerator)?;
    if !app.global_shortcut().is_registered(normalized.as_str()) {
        app.global_shortcut()
            .register(normalized.as_str())
            .map_err(|error| AppError::invalid(format!("failed to register shortcut: {error}")))?;
    }

    state
        .shortcut_routes
        .lock()
        .expect("shortcut route lock poisoned")
        .insert(normalized, binding.script_id.clone());

    Ok(())
}

pub fn validate_shortcut(state: &AppState, accelerator: &str) -> AppResult<ShortcutValidation> {
    if accelerator.trim().is_empty() {
        return Ok(invalid("shortcut is required"));
    }

    let shortcut = match accelerator.trim().parse::<Shortcut>() {
        Ok(shortcut) => shortcut,
        Err(_) => {
            return Ok(invalid(
                "press one modifier plus one key, such as control+KeyR",
            ));
        }
    };
    let normalized = shortcut.into_string();

    if !has_exactly_one_primary_modifier(shortcut) {
        return Ok(invalid(
            "shortcut must use exactly one modifier plus one key",
        ));
    }

    if reserved_shortcuts().contains(&normalized.as_str()) {
        return Ok(invalid(
            "that shortcut is reserved by the operating system or app",
        ));
    }

    if let Some(binding) = find_shortcut_by_normalized_accelerator(state, &normalized)? {
        return Ok(ShortcutValidation {
            valid: false,
            reason: Some("shortcut is already assigned".to_string()),
            normalized: Some(normalized),
            conflict_script_id: Some(binding.script_id),
        });
    }

    Ok(ShortcutValidation {
        valid: true,
        reason: None,
        normalized: Some(normalized),
        conflict_script_id: None,
    })
}

pub fn bind_shortcut(
    app: &AppHandle,
    state: &AppState,
    script_id: &str,
    accelerator: &str,
) -> AppResult<ShortcutBinding> {
    let validation = validate_shortcut(state, accelerator)?;
    if !validation.valid {
        if validation.conflict_script_id.as_deref() == Some(script_id) {
            let normalized = normalize_accelerator(accelerator)?;
            return find_shortcut_by_normalized_accelerator(state, &normalized)?
                .ok_or_else(|| AppError::invalid("shortcut is not assigned"));
        }

        return Err(AppError::invalid(
            validation
                .reason
                .unwrap_or_else(|| "shortcut is not valid".to_string()),
        ));
    }

    if let Some(existing) = state.db.find_shortcut_by_script(script_id)? {
        unregister_accelerator(app, state, &existing.accelerator)?;
    }

    let normalized = validation
        .normalized
        .unwrap_or_else(|| accelerator.trim().to_string());

    if !app.global_shortcut().is_registered(normalized.as_str()) {
        app.global_shortcut()
            .register(normalized.as_str())
            .map_err(|error| AppError::invalid(format!("failed to register shortcut: {error}")))?;
    }

    let binding = state.db.bind_shortcut(script_id, &normalized)?;
    state
        .shortcut_routes
        .lock()
        .expect("shortcut route lock poisoned")
        .insert(binding.accelerator.clone(), binding.script_id.clone());

    Ok(binding)
}

pub fn unbind_shortcut(app: &AppHandle, state: &AppState, binding_id: &str) -> AppResult<()> {
    if let Some(binding) = state.db.delete_shortcut(binding_id)? {
        unregister_accelerator(app, state, &binding.accelerator)?;
    }
    Ok(())
}

pub fn unregister_accelerator(
    app: &AppHandle,
    state: &AppState,
    accelerator: &str,
) -> AppResult<()> {
    let normalized = normalize_accelerator(accelerator).unwrap_or_else(|_| accelerator.to_string());
    if app.global_shortcut().is_registered(normalized.as_str()) {
        app.global_shortcut()
            .unregister(normalized.as_str())
            .map_err(|error| {
                AppError::invalid(format!("failed to unregister shortcut: {error}"))
            })?;
    }

    state
        .shortcut_routes
        .lock()
        .expect("shortcut route lock poisoned")
        .remove(&normalized);
    state
        .shortcut_routes
        .lock()
        .expect("shortcut route lock poisoned")
        .remove(accelerator);
    Ok(())
}

fn normalize_accelerator(accelerator: &str) -> AppResult<String> {
    accelerator
        .trim()
        .parse::<Shortcut>()
        .map(Shortcut::into_string)
        .map_err(|_| AppError::invalid("shortcut is not valid"))
}

fn shortcut_matches(left: &str, right: &str) -> bool {
    match (normalize_accelerator(left), normalize_accelerator(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => left.trim() == right.trim(),
    }
}

fn find_shortcut_by_normalized_accelerator(
    state: &AppState,
    normalized: &str,
) -> AppResult<Option<ShortcutBinding>> {
    for binding in state.db.list_shortcuts()? {
        if shortcut_matches(&binding.accelerator, normalized) {
            return Ok(Some(binding));
        }
    }

    Ok(None)
}

fn has_exactly_one_primary_modifier(shortcut: Shortcut) -> bool {
    let primary_modifiers = [
        Modifiers::SHIFT,
        Modifiers::CONTROL,
        Modifiers::ALT,
        Modifiers::SUPER,
    ];
    primary_modifiers
        .iter()
        .filter(|modifier| shortcut.mods.contains(**modifier))
        .count()
        == 1
}

fn invalid(reason: impl Into<String>) -> ShortcutValidation {
    ShortcutValidation {
        valid: false,
        reason: Some(reason.into()),
        normalized: None,
        conflict_script_id: None,
    }
}

fn reserved_shortcuts() -> &'static [&'static str] {
    &[
        "control+KeyQ",
        "super+KeyQ",
        "alt+F4",
        "control+alt+Delete",
        "control+shift+Escape",
        "super+alt+Delete",
        "super+shift+Escape",
    ]
}
