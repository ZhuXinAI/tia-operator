use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::{
    automation::{
        backends::enigo_replayer::EnigoReplayer,
        traits::{InputReplayer, StopToken},
    },
    models::{EventKind, RecorderState, ReplayOptions, Script},
};

#[derive(Clone)]
pub struct ReplayService {
    stop_token: StopToken,
}

impl ReplayService {
    pub fn new() -> Self {
        Self {
            stop_token: StopToken::new(),
        }
    }

    pub fn stop(&self) {
        self.stop_token.stop();
    }

    pub fn spawn_replay(
        &self,
        app: AppHandle,
        mode: Arc<Mutex<RecorderState>>,
        script: Script,
        options: ReplayOptions,
    ) {
        self.stop_token.reset();
        let token = self.stop_token.clone();

        std::thread::spawn(move || {
            let _ = app.emit(
                "replay:started",
                json!({
                    "scriptId": script.id,
                    "countdownMs": options.countdown_ms,
                    "eventCount": script.events.len()
                }),
            );

            wait_countdown(&token, options.countdown_ms);

            let backend = EnigoReplayer::new();
            let speed = options.speed_multiplier.max(0.1);
            let events = if options.skip_mouse_moves {
                script
                    .events
                    .iter()
                    .filter(|event| event.kind != EventKind::MouseMove)
                    .cloned()
                    .collect::<Vec<_>>()
            } else {
                script.events.clone()
            };
            let total = events.len();
            let mut previous_ts = 0;
            let mut replay_error = None;

            for (index, event) in events.iter().enumerate() {
                if token.is_stopped() {
                    break;
                }

                if options.use_original_timing {
                    let delay = event.timestamp_ms.saturating_sub(previous_ts);
                    let adjusted_delay = (delay as f64 / speed).round() as u64;
                    if adjusted_delay > 0 {
                        std::thread::sleep(Duration::from_millis(adjusted_delay));
                    }
                }

                if let Err(error) = backend.replay_event(event) {
                    replay_error = Some(error.to_string());
                    break;
                }

                previous_ts = event.timestamp_ms;
                let _ = app.emit(
                    "replay:progress",
                    json!({
                        "scriptId": script.id,
                        "index": index + 1,
                        "total": total
                    }),
                );
            }

            {
                let mut guard = mode.lock().expect("app mode lock poisoned");
                if *guard == RecorderState::Replaying {
                    *guard = RecorderState::Idle;
                }
            }

            if let Some(message) = replay_error {
                let _ = app.emit(
                    "replay:error",
                    json!({
                        "scriptId": script.id,
                        "message": message
                    }),
                );
            }

            let _ = app.emit(
                "replay:stopped",
                json!({
                    "scriptId": script.id,
                    "stopped": token.is_stopped()
                }),
            );
        });
    }
}

impl Default for ReplayService {
    fn default() -> Self {
        Self::new()
    }
}

fn wait_countdown(token: &StopToken, countdown_ms: u64) {
    let mut remaining = countdown_ms;
    while remaining > 0 && !token.is_stopped() {
        let step = remaining.min(100);
        std::thread::sleep(Duration::from_millis(step));
        remaining = remaining.saturating_sub(step);
    }
}
