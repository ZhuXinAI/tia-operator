pub mod automation;
pub mod commands;
pub mod errors;
pub mod models;
pub mod shortcuts;
pub mod state;
pub mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(shortcuts::manager::handle_global_shortcut)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| -> Result<(), Box<dyn std::error::Error>> {
            let data_dir = app.path().app_data_dir()?;
            let state = state::AppState::new(data_dir)
                .map_err(|error| -> Box<dyn std::error::Error> { error.to_string().into() })?;
            app.manage(state.clone());

            if let Err(error) = shortcuts::manager::reload_shortcuts(app.handle(), &state) {
                eprintln!("failed to register saved shortcuts: {error}");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_scripts,
            commands::get_script,
            commands::create_script,
            commands::update_script,
            commands::delete_script,
            commands::start_recording,
            commands::pause_recording,
            commands::resume_recording,
            commands::stop_recording,
            commands::discard_recording,
            commands::replay_script,
            commands::stop_replay,
            commands::list_shortcuts,
            commands::bind_shortcut,
            commands::unbind_shortcut,
            commands::validate_shortcut,
            commands::get_app_status,
            commands::get_settings,
            commands::update_settings,
            commands::export_all_scripts,
            commands::import_scripts,
            commands::delete_all_scripts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
