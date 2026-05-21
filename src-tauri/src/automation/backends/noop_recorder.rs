use crate::{
    automation::traits::InputRecorder,
    errors::AppResult,
    models::{RecorderState, ScriptEvent},
};

#[derive(Default)]
pub struct NoopRecorder;

impl InputRecorder for NoopRecorder {
    fn start(&self) -> AppResult<()> {
        Ok(())
    }

    fn pause(&self) -> AppResult<()> {
        Ok(())
    }

    fn resume(&self) -> AppResult<()> {
        Ok(())
    }

    fn stop(&self) -> AppResult<Vec<ScriptEvent>> {
        Ok(Vec::new())
    }

    fn state(&self) -> RecorderState {
        RecorderState::Idle
    }
}
