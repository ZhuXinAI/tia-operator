use crate::{automation::traits::InputReplayer, errors::AppResult, models::ScriptEvent};

#[derive(Default)]
pub struct NoopReplayer;

impl InputReplayer for NoopReplayer {
    fn replay_event(&self, _event: &ScriptEvent) -> AppResult<()> {
        Ok(())
    }
}
