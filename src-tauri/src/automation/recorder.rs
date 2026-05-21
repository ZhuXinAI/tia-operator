use std::{
    sync::{atomic::AtomicBool, Arc},
    time::{Duration, Instant},
};

use parking_lot::Mutex;
use serde_json::json;
use tauri::{AppHandle, Emitter};

use crate::{
    automation::backends::rdev_recorder::{ensure_listener, RdevRecorderInner},
    errors::{AppError, AppResult},
    models::{RecorderState, ScriptEvent, StartRecordingInput},
};

#[derive(Clone)]
pub struct RecorderService {
    inner: Arc<Mutex<RdevRecorderInner>>,
    listener_started: Arc<AtomicBool>,
}

impl RecorderService {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(RdevRecorderInner::default())),
            listener_started: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(
        &self,
        app: AppHandle,
        input: StartRecordingInput,
        record_mouse_moves: bool,
    ) -> AppResult<()> {
        {
            let mut guard = self.inner.lock();
            guard.status = RecorderState::Recording;
            guard.started_at = Some(Instant::now());
            guard.paused_at = None;
            guard.total_paused = Duration::ZERO;
            guard.record_mouse_moves = record_mouse_moves;
            guard.last_mouse_position = None;
            guard.last_recorded_mouse_move_ms = None;
            guard.buffer.clear();
        }

        ensure_listener(
            app.clone(),
            self.inner.clone(),
            self.listener_started.clone(),
        );

        let _ = app.emit(
            "recording:started",
            json!({
                "name": input.name,
                "description": input.description
            }),
        );

        Ok(())
    }

    pub fn pause(&self, app: &AppHandle) -> AppResult<()> {
        let mut guard = self.inner.lock();
        if guard.status != RecorderState::Recording {
            return Err(AppError::conflict("recording is not active"));
        }

        guard.status = RecorderState::RecordingPaused;
        guard.paused_at = Some(Instant::now());
        drop(guard);

        let _ = app.emit("recording:paused", json!({}));
        Ok(())
    }

    pub fn resume(&self, app: &AppHandle) -> AppResult<()> {
        let mut guard = self.inner.lock();
        if guard.status != RecorderState::RecordingPaused {
            return Err(AppError::conflict("recording is not paused"));
        }

        if let Some(paused_at) = guard.paused_at.take() {
            guard.total_paused += Instant::now().saturating_duration_since(paused_at);
        }
        guard.status = RecorderState::Recording;
        drop(guard);

        let _ = app.emit("recording:resumed", json!({}));
        Ok(())
    }

    pub fn stop(&self, app: &AppHandle) -> AppResult<Vec<ScriptEvent>> {
        let mut guard = self.inner.lock();
        if guard.status != RecorderState::Recording
            && guard.status != RecorderState::RecordingPaused
        {
            return Err(AppError::conflict("recording is not active"));
        }

        guard.status = RecorderState::Idle;
        guard.started_at = None;
        guard.paused_at = None;
        guard.total_paused = Duration::ZERO;
        let events = guard.buffer.clone();
        guard.buffer.clear();
        drop(guard);

        let _ = app.emit(
            "recording:stopped",
            json!({
                "eventCount": events.len()
            }),
        );

        Ok(events)
    }

    pub fn discard(&self, app: &AppHandle) -> AppResult<()> {
        let mut guard = self.inner.lock();
        if guard.status != RecorderState::Recording
            && guard.status != RecorderState::RecordingPaused
        {
            return Err(AppError::conflict("recording is not active"));
        }

        guard.status = RecorderState::Idle;
        guard.started_at = None;
        guard.paused_at = None;
        guard.total_paused = Duration::ZERO;
        guard.buffer.clear();
        drop(guard);

        let _ = app.emit("recording:discarded", json!({}));
        Ok(())
    }

    pub fn event_count(&self) -> u64 {
        self.inner.lock().buffer.len() as u64
    }

    pub fn elapsed_ms(&self) -> u64 {
        let guard = self.inner.lock();
        let Some(started_at) = guard.started_at else {
            return 0;
        };

        let end = guard.paused_at.unwrap_or_else(Instant::now);
        end.saturating_duration_since(started_at)
            .saturating_sub(guard.total_paused)
            .as_millis() as u64
    }
}

impl Default for RecorderService {
    fn default() -> Self {
        Self::new()
    }
}
