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
                    "eventCount": script.events.len(),
                    "loopEnabled": options.loop_enabled,
                    "loopIntervalMs": options.loop_interval_ms
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
            let mut replay_error = None;
            let mut loop_index = 0_u64;

            loop {
                if token.is_stopped() {
                    break;
                }

                loop_index += 1;
                let mut previous_ts = 0;

                for (index, event) in events.iter().enumerate() {
                    if token.is_stopped() {
                        break;
                    }

                    if options.use_original_timing {
                        let delay = event.timestamp_ms.saturating_sub(previous_ts);
                        let adjusted_delay = (delay as f64 / speed).round() as u64;
                        wait_countdown(&token, adjusted_delay);
                    }

                    if token.is_stopped() {
                        break;
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
                            "total": total,
                            "loopIndex": loop_index
                        }),
                    );
                }

                if replay_error.is_some()
                    || token.is_stopped()
                    || !options.loop_enabled
                    || total == 0
                {
                    break;
                }

                let _ = app.emit(
                    "replay:loopCompleted",
                    json!({
                        "scriptId": script.id,
                        "loopIndex": loop_index,
                        "nextIntervalMs": options.loop_interval_ms
                    }),
                );

                wait_countdown(&token, options.loop_interval_ms);
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
