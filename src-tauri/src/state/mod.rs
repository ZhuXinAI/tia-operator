use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::{
    automation::{recorder::RecorderService, replayer::ReplayService},
    errors::{AppError, AppResult},
    models::{
        AppStatus, CreateScriptInput, PermissionStatus, PlatformStatus, RecorderState,
        ReplayOptions, Script, StartRecordingInput, StopRecordingInput,
    },
    storage::db::Database,
};

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub mode: Arc<Mutex<RecorderState>>,
    pub recorder: RecorderService,
    pub replayer: ReplayService,
    pub shortcut_routes: Arc<Mutex<HashMap<String, String>>>,
    data_dir: PathBuf,
    active_script_id: Arc<Mutex<Option<String>>>,
    replay_script_id: Arc<Mutex<Option<String>>>,
}

impl AppState {
    pub fn new(data_dir: PathBuf) -> AppResult<Self> {
        let db = Database::new(&data_dir)?;
        Ok(Self {
            db,
            mode: Arc::new(Mutex::new(RecorderState::Idle)),
            recorder: RecorderService::new(),
            replayer: ReplayService::new(),
            shortcut_routes: Arc::new(Mutex::new(HashMap::new())),
            data_dir,
            active_script_id: Arc::new(Mutex::new(None)),
            replay_script_id: Arc::new(Mutex::new(None)),
        })
    }

    pub fn start_recording(&self, app: AppHandle, input: StartRecordingInput) -> AppResult<()> {
        {
            let mut mode = self.mode.lock().expect("app mode lock poisoned");
            if *mode != RecorderState::Idle {
                return Err(AppError::conflict(
                    "recording can only start while the app is idle",
                ));
            }
            *mode = RecorderState::Recording;
        }

        if let Err(error) = self.recorder.start(app, input) {
            self.set_mode(RecorderState::Idle);
            return Err(error);
        }

        *self
            .active_script_id
            .lock()
            .expect("active script lock poisoned") = None;
        Ok(())
    }

    pub fn pause_recording(&self, app: &AppHandle) -> AppResult<()> {
        {
            let mut mode = self.mode.lock().expect("app mode lock poisoned");
            if *mode != RecorderState::Recording {
                return Err(AppError::conflict("recording is not active"));
            }
            *mode = RecorderState::RecordingPaused;
        }
        self.recorder.pause(app)
    }

    pub fn resume_recording(&self, app: &AppHandle) -> AppResult<()> {
        {
            let mut mode = self.mode.lock().expect("app mode lock poisoned");
            if *mode != RecorderState::RecordingPaused {
                return Err(AppError::conflict("recording is not paused"));
            }
            *mode = RecorderState::Recording;
        }
        self.recorder.resume(app)
    }

    pub fn stop_recording(&self, app: &AppHandle, input: StopRecordingInput) -> AppResult<Script> {
        let events = self.recorder.stop(app)?;
        self.set_mode(RecorderState::Idle);
        let script = self.db.create_script(CreateScriptInput {
            name: input.name,
            description: input.description,
            events: Some(events),
        })?;
        *self
            .active_script_id
            .lock()
            .expect("active script lock poisoned") = Some(script.id.clone());
        Ok(script)
    }

    pub fn discard_recording(&self, app: &AppHandle) -> AppResult<()> {
        self.recorder.discard(app)?;
        self.set_mode(RecorderState::Idle);
        *self
            .active_script_id
            .lock()
            .expect("active script lock poisoned") = None;
        Ok(())
    }

    pub fn start_replay(
        &self,
        app: AppHandle,
        script_id: String,
        options: ReplayOptions,
    ) -> AppResult<()> {
        {
            let mut mode = self.mode.lock().expect("app mode lock poisoned");
            if *mode != RecorderState::Idle {
                return Err(AppError::conflict(
                    "replay can only start while the app is idle",
                ));
            }
            *mode = RecorderState::Replaying;
        }

        let script = match self.db.get_script(&script_id) {
            Ok(script) => script,
            Err(error) => {
                self.set_mode(RecorderState::Idle);
                return Err(error);
            }
        };

        *self
            .replay_script_id
            .lock()
            .expect("replay script lock poisoned") = Some(script.id.clone());

        self.replayer
            .spawn_replay(app, self.mode.clone(), script, options);
        Ok(())
    }

    pub fn stop_replay(&self, app: &AppHandle) -> AppResult<()> {
        self.replayer.stop();
        {
            let mut mode = self.mode.lock().expect("app mode lock poisoned");
            if *mode == RecorderState::Replaying {
                *mode = RecorderState::Idle;
            }
        }
        *self
            .replay_script_id
            .lock()
            .expect("replay script lock poisoned") = None;
        let _ = app.emit("replay:stopRequested", json!({}));
        Ok(())
    }

    pub fn get_status(&self) -> AppResult<AppStatus> {
        let settings = self.db.get_settings()?;
        Ok(AppStatus {
            state: self.mode(),
            active_script_id: self
                .active_script_id
                .lock()
                .expect("active script lock poisoned")
                .clone(),
            recording_event_count: self.recorder.event_count(),
            recording_elapsed_ms: self.recorder.elapsed_ms(),
            replay_script_id: self
                .replay_script_id
                .lock()
                .expect("replay script lock poisoned")
                .clone(),
            platform: platform_status(),
            permissions: PermissionStatus::default(),
            emergency_stop_shortcut: settings.emergency_stop_shortcut,
            data_dir: self.data_dir.to_string_lossy().to_string(),
        })
    }

    pub fn mode(&self) -> RecorderState {
        self.mode.lock().expect("app mode lock poisoned").clone()
    }

    fn set_mode(&self, next: RecorderState) {
        *self.mode.lock().expect("app mode lock poisoned") = next;
    }
}

fn platform_status() -> PlatformStatus {
    let os = std::env::consts::OS.to_string();
    let linux_session = if cfg!(target_os = "linux") {
        std::env::var("XDG_SESSION_TYPE").ok()
    } else {
        None
    };

    let is_wayland = linux_session.as_deref() == Some("wayland");
    PlatformStatus {
        os,
        linux_session,
        replay_supported: !is_wayland,
        recording_supported: !is_wayland,
        wayland_note: is_wayland.then(|| {
            "Linux Wayland input capture and replay are experimental and unsupported in v1"
                .to_string()
        }),
    }
}
