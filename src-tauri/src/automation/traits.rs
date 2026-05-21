use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};

use crate::{
    errors::AppResult,
    models::{RecorderState, ReplayOptions, ScriptEvent},
};

#[derive(Clone, Debug)]
pub struct StopToken {
    stopped: Arc<AtomicBool>,
}

impl StopToken {
    pub fn new() -> Self {
        Self {
            stopped: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.stopped.store(false, Ordering::SeqCst);
    }

    pub fn is_stopped(&self) -> bool {
        self.stopped.load(Ordering::SeqCst)
    }
}

impl Default for StopToken {
    fn default() -> Self {
        Self::new()
    }
}

pub trait InputRecorder: Send + Sync {
    fn start(&self) -> AppResult<()>;
    fn pause(&self) -> AppResult<()>;
    fn resume(&self) -> AppResult<()>;
    fn stop(&self) -> AppResult<Vec<ScriptEvent>>;
    fn state(&self) -> RecorderState;
}

pub trait InputReplayer: Send + Sync {
    fn replay_event(&self, event: &ScriptEvent) -> AppResult<()>;
    fn replay(
        &self,
        events: Vec<ScriptEvent>,
        options: ReplayOptions,
        stop_token: StopToken,
    ) -> AppResult<()> {
        let speed = options.speed_multiplier.max(0.1);
        let mut previous_ts = 0;

        for event in events {
            if stop_token.is_stopped() {
                break;
            }

            if options.use_original_timing {
                let delay = event.timestamp_ms.saturating_sub(previous_ts);
                let adjusted_delay = (delay as f64 / speed).round() as u64;
                if adjusted_delay > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(adjusted_delay));
                }
            }

            self.replay_event(&event)?;
            previous_ts = event.timestamp_ms;
        }

        Ok(())
    }
}
