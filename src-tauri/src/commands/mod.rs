use tauri::{AppHandle, State};

use crate::{
    errors::{AppError, AppResult},
    models::{
        AppSettings, AppStatus, CreateScriptInput, ReplayOptions, Script, ScriptSummary,
        ShortcutBinding, ShortcutValidation, StartRecordingInput, StopRecordingInput,
        UpdateScriptInput,
    },
    shortcuts::manager as shortcut_manager,
    state::AppState,
};

#[tauri::command]
pub async fn list_scripts(state: State<'_, AppState>) -> AppResult<Vec<ScriptSummary>> {
    state.db.list_scripts()
}

#[tauri::command]
pub async fn get_script(id: String, state: State<'_, AppState>) -> AppResult<Script> {
    state.db.get_script(&id)
}

#[tauri::command]
pub async fn create_script(
    input: CreateScriptInput,
    state: State<'_, AppState>,
) -> AppResult<Script> {
    state.db.create_script(input)
}

#[tauri::command]
pub async fn update_script(
    id: String,
    input: UpdateScriptInput,
    state: State<'_, AppState>,
) -> AppResult<Script> {
    state.db.update_script(&id, input)
}

#[tauri::command]
pub async fn delete_script(id: String, state: State<'_, AppState>) -> AppResult<()> {
    state.db.delete_script(&id)
}

#[tauri::command]
pub async fn start_recording(
    input: StartRecordingInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.start_recording(app, input)
}

#[tauri::command]
pub async fn pause_recording(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.pause_recording(&app)
}

#[tauri::command]
pub async fn resume_recording(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.resume_recording(&app)
}

#[tauri::command]
pub async fn stop_recording(
    input: StopRecordingInput,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Script> {
    state.stop_recording(&app, input)
}

#[tauri::command]
pub async fn discard_recording(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.discard_recording(&app)
}

#[tauri::command]
pub async fn replay_script(
    id: String,
    options: ReplayOptions,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.start_replay(app, id, options)
}

#[tauri::command]
pub async fn stop_replay(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    state.stop_replay(&app)
}

#[tauri::command]
pub async fn list_shortcuts(state: State<'_, AppState>) -> AppResult<Vec<ShortcutBinding>> {
    state.db.list_shortcuts()
}

#[tauri::command]
pub async fn bind_shortcut(
    script_id: String,
    accelerator: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<ShortcutBinding> {
    shortcut_manager::bind_shortcut(&app, &state, &script_id, &accelerator)
}

#[tauri::command]
pub async fn unbind_shortcut(
    binding_id: String,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    shortcut_manager::unbind_shortcut(&app, &state, &binding_id)
}

#[tauri::command]
pub async fn validate_shortcut(
    accelerator: String,
    state: State<'_, AppState>,
) -> AppResult<ShortcutValidation> {
    shortcut_manager::validate_shortcut(&state, &accelerator)
}

#[tauri::command]
pub async fn get_app_status(state: State<'_, AppState>) -> AppResult<AppStatus> {
    state.get_status()
}

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    state.db.get_settings()
}

#[tauri::command]
pub async fn update_settings(
    settings: AppSettings,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<AppSettings> {
    let previous = state.db.get_settings()?;
    let saved = state.db.save_settings(&settings)?;

    if previous.emergency_stop_shortcut != saved.emergency_stop_shortcut {
        shortcut_manager::unregister_accelerator(&app, &state, &previous.emergency_stop_shortcut)?;
        shortcut_manager::reload_shortcuts(&app, &state)?;
    }

    Ok(saved)
}

#[tauri::command]
pub async fn export_all_scripts(state: State<'_, AppState>) -> AppResult<String> {
    let scripts = state
        .db
        .list_scripts()?
        .into_iter()
        .map(|summary| state.db.get_script(&summary.id))
        .collect::<AppResult<Vec<_>>>()?;
    serde_json::to_string_pretty(&scripts).map_err(AppError::from)
}

#[tauri::command]
pub async fn import_scripts(payload: String, state: State<'_, AppState>) -> AppResult<Vec<Script>> {
    let scripts = serde_json::from_str::<Vec<Script>>(&payload)?;
    state.db.import_scripts(scripts)
}

#[tauri::command]
pub async fn delete_all_scripts(state: State<'_, AppState>) -> AppResult<()> {
    state.db.delete_all_scripts()
}
