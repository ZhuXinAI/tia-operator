use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::{
    errors::{AppError, AppResult},
    models::{
        normalize_script_events, script_duration_ms, AppSettings, CreateScriptInput, Script,
        ScriptEvent, ScriptSummary, ShortcutBinding, UpdateScriptInput,
    },
};

#[derive(Clone)]
pub struct Database {
    connection: Arc<Mutex<Connection>>,
    path: PathBuf,
}

impl Database {
    pub fn new(data_dir: impl AsRef<Path>) -> AppResult<Self> {
        fs::create_dir_all(data_dir.as_ref())?;
        let path = data_dir.as_ref().join("tia-operator.sqlite3");
        let connection = Connection::open(&path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;

        let db = Self {
            connection: Arc::new(Mutex::new(connection)),
            path,
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn migrate(&self) -> AppResult<()> {
        let connection = self.connection.lock();
        connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS scripts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                events_json TEXT NOT NULL,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                event_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS shortcut_bindings (
                id TEXT PRIMARY KEY,
                script_id TEXT NOT NULL,
                accelerator TEXT NOT NULL UNIQUE,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )?;
        Ok(())
    }

    pub fn list_scripts(&self) -> AppResult<Vec<ScriptSummary>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            r#"
            SELECT s.id, s.name, s.description, s.created_at, s.updated_at,
                   s.duration_ms, s.event_count, b.accelerator
            FROM scripts s
            LEFT JOIN shortcut_bindings b ON b.script_id = s.id AND b.enabled = 1
            ORDER BY s.updated_at DESC
            "#,
        )?;

        let rows = statement.query_map([], |row| {
            Ok(ScriptSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
                duration_ms: int_to_u64(row.get::<_, i64>(5)?),
                event_count: int_to_u64(row.get::<_, i64>(6)?),
                shortcut: row.get(7)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn get_script(&self, id: &str) -> AppResult<Script> {
        let connection = self.connection.lock();
        connection
            .query_row(
                r#"
                SELECT id, name, description, events_json, created_at, updated_at,
                       duration_ms, event_count
                FROM scripts
                WHERE id = ?1
                "#,
                params![id],
                row_to_script,
            )
            .optional()?
            .ok_or_else(|| AppError::invalid("script not found"))
    }

    pub fn create_script(&self, input: CreateScriptInput) -> AppResult<Script> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(AppError::invalid("script name is required"));
        }

        let events = normalize_script_events(input.events.unwrap_or_default());
        let duration_ms = calculate_duration(&events);
        let event_count = events.len() as u64;
        let events_json = serde_json::to_string(&events)?;
        let id = Uuid::new_v4().to_string();
        let now = now_iso();

        let connection = self.connection.lock();
        connection.execute(
            r#"
            INSERT INTO scripts (
                id, name, description, events_json, duration_ms, event_count, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            "#,
            params![
                id,
                name,
                input.description,
                events_json,
                duration_ms as i64,
                event_count as i64,
                now
            ],
        )?;
        drop(connection);

        self.get_script(&id)
    }

    pub fn update_script(&self, id: &str, input: UpdateScriptInput) -> AppResult<Script> {
        let existing = self.get_script(id)?;
        let name = input.name.unwrap_or(existing.name).trim().to_string();

        if name.is_empty() {
            return Err(AppError::invalid("script name is required"));
        }

        let description = input.description.or(existing.description);
        let events = normalize_script_events(input.events.unwrap_or(existing.events));
        let duration_ms = calculate_duration(&events);
        let event_count = events.len() as u64;
        let events_json = serde_json::to_string(&events)?;
        let now = now_iso();

        let connection = self.connection.lock();
        connection.execute(
            r#"
            UPDATE scripts
            SET name = ?2,
                description = ?3,
                events_json = ?4,
                duration_ms = ?5,
                event_count = ?6,
                updated_at = ?7
            WHERE id = ?1
            "#,
            params![
                id,
                name,
                description,
                events_json,
                duration_ms as i64,
                event_count as i64,
                now
            ],
        )?;
        drop(connection);

        self.get_script(id)
    }

    pub fn delete_script(&self, id: &str) -> AppResult<()> {
        let connection = self.connection.lock();
        connection.execute("DELETE FROM scripts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn delete_all_scripts(&self) -> AppResult<()> {
        let connection = self.connection.lock();
        connection.execute("DELETE FROM scripts", [])?;
        Ok(())
    }

    pub fn list_shortcuts(&self) -> AppResult<Vec<ShortcutBinding>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            r#"
            SELECT id, script_id, accelerator, enabled, created_at, updated_at
            FROM shortcut_bindings
            ORDER BY updated_at DESC
            "#,
        )?;

        let rows = statement.query_map([], row_to_shortcut)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(AppError::from)
    }

    pub fn find_shortcut_by_accelerator(
        &self,
        accelerator: &str,
    ) -> AppResult<Option<ShortcutBinding>> {
        let connection = self.connection.lock();
        connection
            .query_row(
                r#"
                SELECT id, script_id, accelerator, enabled, created_at, updated_at
                FROM shortcut_bindings
                WHERE accelerator = ?1
                "#,
                params![accelerator],
                row_to_shortcut,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn find_shortcut_by_script(&self, script_id: &str) -> AppResult<Option<ShortcutBinding>> {
        let connection = self.connection.lock();
        connection
            .query_row(
                r#"
                SELECT id, script_id, accelerator, enabled, created_at, updated_at
                FROM shortcut_bindings
                WHERE script_id = ?1
                "#,
                params![script_id],
                row_to_shortcut,
            )
            .optional()
            .map_err(AppError::from)
    }

    pub fn bind_shortcut(&self, script_id: &str, accelerator: &str) -> AppResult<ShortcutBinding> {
        self.get_script(script_id)?;
        let id = Uuid::new_v4().to_string();
        let now = now_iso();
        let connection = self.connection.lock();
        connection.execute(
            "DELETE FROM shortcut_bindings WHERE script_id = ?1",
            params![script_id],
        )?;
        connection.execute(
            r#"
            INSERT INTO shortcut_bindings (
                id, script_id, accelerator, enabled, created_at, updated_at
            ) VALUES (?1, ?2, ?3, 1, ?4, ?4)
            "#,
            params![id, script_id, accelerator, now],
        )?;
        drop(connection);

        self.find_shortcut_by_accelerator(accelerator)?
            .ok_or_else(|| AppError::invalid("shortcut was not saved"))
    }

    pub fn delete_shortcut(&self, binding_id: &str) -> AppResult<Option<ShortcutBinding>> {
        let binding = {
            let connection = self.connection.lock();
            connection
                .query_row(
                    r#"
                    SELECT id, script_id, accelerator, enabled, created_at, updated_at
                    FROM shortcut_bindings
                    WHERE id = ?1
                    "#,
                    params![binding_id],
                    row_to_shortcut,
                )
                .optional()?
        };

        if binding.is_some() {
            let connection = self.connection.lock();
            connection.execute(
                "DELETE FROM shortcut_bindings WHERE id = ?1",
                params![binding_id],
            )?;
        }

        Ok(binding)
    }

    pub fn get_settings(&self) -> AppResult<AppSettings> {
        let connection = self.connection.lock();
        let value = connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = 'app_settings'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        match value {
            Some(value) => Ok(serde_json::from_str(&value)?),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> AppResult<AppSettings> {
        let value_json = serde_json::to_string(settings)?;
        let now = now_iso();
        let connection = self.connection.lock();
        connection.execute(
            r#"
            INSERT INTO settings (key, value_json, updated_at)
            VALUES ('app_settings', ?1, ?2)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = excluded.updated_at
            "#,
            params![value_json, now],
        )?;
        Ok(settings.clone())
    }

    pub fn import_scripts(&self, scripts: Vec<Script>) -> AppResult<Vec<Script>> {
        let mut imported = Vec::new();
        for script in scripts {
            imported.push(self.create_script(CreateScriptInput {
                name: script.name,
                description: script.description,
                events: Some(script.events),
            })?);
        }
        Ok(imported)
    }
}

fn row_to_script(row: &rusqlite::Row<'_>) -> rusqlite::Result<Script> {
    let events_json: String = row.get(3)?;
    let events = normalize_script_events(
        serde_json::from_str::<Vec<ScriptEvent>>(&events_json).unwrap_or_default(),
    );
    let duration_ms = calculate_duration(&events);
    let event_count = events.len() as u64;
    Ok(Script {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        events,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        duration_ms,
        event_count,
    })
}

fn row_to_shortcut(row: &rusqlite::Row<'_>) -> rusqlite::Result<ShortcutBinding> {
    Ok(ShortcutBinding {
        id: row.get(0)?,
        script_id: row.get(1)?,
        accelerator: row.get(2)?,
        enabled: row.get::<_, i64>(3)? == 1,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn calculate_duration(events: &[ScriptEvent]) -> u64 {
    script_duration_ms(events)
}

fn int_to_u64(value: i64) -> u64 {
    u64::try_from(value).unwrap_or_default()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
