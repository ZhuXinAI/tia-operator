import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import { operatorApi } from "./api/operatorApi";
import type {
  AppSettings,
  AppStatus,
  EventKind,
  ReplayOptions,
  Script,
  ScriptEvent,
  ScriptSummary,
  ShortcutBinding,
} from "./types";

type View = "dashboard" | "recorder" | "detail" | "settings";
type Filter = "all" | "withShortcut" | "withoutShortcut";
type SortMode = "updated" | "name" | "duration";
type Notice = {
  tone: "info" | "success" | "warning" | "danger";
  message: string;
};

const defaultStatus: AppStatus = {
  state: "idle",
  activeScriptId: null,
  recordingEventCount: 0,
  recordingElapsedMs: 0,
  replayScriptId: null,
  platform: {
    os: "unknown",
    linuxSession: null,
    replaySupported: true,
    recordingSupported: true,
    waylandNote: null,
  },
  permissions: {
    macosAccessibility: "unknown",
    macosInputMonitoring: "unknown",
    screenRecording: "future",
  },
  emergencyStopShortcut: "CommandOrControl+Alt+Escape",
  dataDir: "",
};

const defaultSettings: AppSettings = {
  defaultReplaySpeed: 1,
  defaultCountdownMs: 3000,
  emergencyStopShortcut: "CommandOrControl+Alt+Escape",
  skipMouseMoveNoise: false,
  showReplayOverlay: true,
};

const defaultReplayOptions: ReplayOptions = {
  speedMultiplier: 1,
  countdownMs: 3000,
  useOriginalTiming: true,
  skipMouseMoves: false,
  failIfWindowChanged: null,
};

function App() {
  const [view, setView] = useState<View>("dashboard");
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>([]);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [status, setStatus] = useState<AppStatus>(defaultStatus);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [recordingName, setRecordingName] = useState("New automation");
  const [recordingDescription, setRecordingDescription] = useState("");
  const [detailName, setDetailName] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [shortcutDraft, setShortcutDraft] = useState("CommandOrControl+Alt+1");
  const [replayOptions, setReplayOptions] =
    useState<ReplayOptions>(defaultReplayOptions);
  const [exportPayload, setExportPayload] = useState("");
  const [importPayload, setImportPayload] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextScripts, nextShortcuts, nextStatus, nextSettings] =
      await Promise.all([
        operatorApi.listScripts(),
        operatorApi.listShortcuts(),
        operatorApi.getAppStatus(),
        operatorApi.getSettings(),
      ]);
    setScripts(nextScripts);
    setShortcuts(nextShortcuts);
    setStatus(nextStatus);
    setSettings(nextSettings);
    setReplayOptions((current) => ({
      ...current,
      speedMultiplier: nextSettings.defaultReplaySpeed,
      countdownMs: nextSettings.defaultCountdownMs,
      skipMouseMoves: nextSettings.skipMouseMoveNoise,
    }));
  }, []);

  useEffect(() => {
    refresh().catch((error: Error) =>
      setNotice({ tone: "danger", message: error.message }),
    );
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      operatorApi
        .getAppStatus()
        .then(setStatus)
        .catch(() => undefined);
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const subscriptions = Promise.all([
      listen<{ eventCount: number }>("recording:event", (event) => {
        setStatus((current) => ({
          ...current,
          state: "recording",
          recordingEventCount: event.payload.eventCount,
        }));
      }),
      listen("recording:paused", () => {
        setStatus((current) => ({ ...current, state: "recordingPaused" }));
      }),
      listen("recording:resumed", () => {
        setStatus((current) => ({ ...current, state: "recording" }));
      }),
      listen("recording:stopped", () => {
        setStatus((current) => ({ ...current, state: "idle" }));
        refresh().catch(() => undefined);
      }),
      listen<{ scriptId: string }>("replay:started", (event) => {
        setStatus((current) => ({
          ...current,
          state: "replaying",
          replayScriptId: event.payload.scriptId,
        }));
        setNotice({
          tone: "info",
          message: `Replay started: ${findScriptName(scripts, event.payload.scriptId)}`,
        });
      }),
      listen("replay:stopped", () => {
        setStatus((current) => ({
          ...current,
          state: "idle",
          replayScriptId: null,
        }));
      }),
      listen<{ message: string }>("replay:error", (event) => {
        setNotice({ tone: "danger", message: event.payload.message });
      }),
      listen<{ accelerator: string }>("shortcut:triggered", (event) => {
        setNotice({
          tone: "info",
          message: `Shortcut triggered: ${event.payload.accelerator}`,
        });
      }),
      listen<{ message: string }>("shortcut:error", (event) => {
        setNotice({ tone: "warning", message: event.payload.message });
      }),
    ]);

    return () => {
      subscriptions.then((unlisteners) => {
        unlisteners.forEach((unlisten) => unlisten());
      });
    };
  }, [refresh, scripts]);

  useEffect(() => {
    if (selectedScript) {
      setDetailName(selectedScript.name);
      setDetailDescription(selectedScript.description ?? "");
      const binding = shortcuts.find(
        (shortcut) => shortcut.scriptId === selectedScript.id,
      );
      setShortcutDraft(binding?.accelerator ?? "CommandOrControl+Alt+1");
    }
  }, [selectedScript, shortcuts]);

  const filteredScripts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scripts
      .filter((script) => {
        const matchesQuery =
          !query ||
          script.name.toLowerCase().includes(query) ||
          (script.description ?? "").toLowerCase().includes(query);
        const matchesFilter =
          filter === "all" ||
          (filter === "withShortcut" && Boolean(script.shortcut)) ||
          (filter === "withoutShortcut" && !script.shortcut);
        return matchesQuery && matchesFilter;
      })
      .sort((first, second) => {
        if (sortMode === "name") {
          return first.name.localeCompare(second.name);
        }
        if (sortMode === "duration") {
          return second.durationMs - first.durationMs;
        }
        return (
          new Date(second.updatedAt).getTime() -
          new Date(first.updatedAt).getTime()
        );
      });
  }, [filter, scripts, search, sortMode]);

  const selectedShortcut = useMemo(
    () =>
      selectedScript
        ? shortcuts.find((shortcut) => shortcut.scriptId === selectedScript.id)
        : undefined,
    [selectedScript, shortcuts],
  );

  const runAction = async (action: string, work: () => Promise<void>) => {
    setBusyAction(action);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      setNotice({
        tone: "danger",
        message: error instanceof Error ? error.message : "Action failed",
      });
    } finally {
      setBusyAction(null);
    }
  };

  const openScript = async (id: string) => {
    await runAction("open-script", async () => {
      const script = await operatorApi.getScript(id);
      setSelectedScript(script);
      setView("detail");
    });
  };

  const startRecording = async () => {
    await runAction("start-recording", async () => {
      await operatorApi.startRecording({
        name: recordingName,
        description: recordingDescription,
      });
      setStatus((current) => ({ ...current, state: "recording" }));
      setView("recorder");
      setNotice({ tone: "success", message: "Recording started" });
    });
  };

  const stopRecording = async () => {
    await runAction("stop-recording", async () => {
      const script = await operatorApi.stopRecording({
        name: recordingName,
        description: recordingDescription,
      });
      setSelectedScript(script);
      setView("detail");
      await refresh();
      setNotice({ tone: "success", message: "Recording saved" });
    });
  };

  const replayScript = async (scriptId: string) => {
    await runAction(`replay-${scriptId}`, async () => {
      await operatorApi.replayScript(scriptId, replayOptions);
      await refresh();
    });
  };

  const saveDetail = async () => {
    if (!selectedScript) {
      return;
    }

    await runAction("save-detail", async () => {
      const updated = await operatorApi.updateScript(selectedScript.id, {
        name: detailName,
        description: detailDescription,
      });
      setSelectedScript(updated);
      await refresh();
      setNotice({ tone: "success", message: "Script saved" });
    });
  };

  const deleteScript = async (scriptId: string) => {
    const confirmed = window.confirm("Delete this script?");
    if (!confirmed) {
      return;
    }

    await runAction(`delete-${scriptId}`, async () => {
      await operatorApi.deleteScript(scriptId);
      if (selectedScript?.id === scriptId) {
        setSelectedScript(null);
        setView("dashboard");
      }
      await refresh();
      setNotice({ tone: "success", message: "Script deleted" });
    });
  };

  const createDemoScript = async () => {
    await runAction("demo-script", async () => {
      const script = await operatorApi.createScript({
        name: "Type sample text",
        description: "A local sample script for testing replay safely.",
        events: createDemoEvents(),
      });
      setSelectedScript(script);
      setView("detail");
      await refresh();
      setNotice({ tone: "success", message: "Sample script created" });
    });
  };

  const bindShortcut = async () => {
    if (!selectedScript) {
      return;
    }

    await runAction("bind-shortcut", async () => {
      const validation = await operatorApi.validateShortcut(shortcutDraft);
      if (
        !validation.valid &&
        validation.conflictScriptId !== selectedScript.id
      ) {
        throw new Error(validation.reason ?? "Shortcut is not valid");
      }
      await operatorApi.bindShortcut(selectedScript.id, shortcutDraft);
      await refresh();
      setNotice({ tone: "success", message: "Shortcut assigned" });
    });
  };

  const unbindShortcut = async () => {
    if (!selectedShortcut) {
      return;
    }

    await runAction("unbind-shortcut", async () => {
      await operatorApi.unbindShortcut(selectedShortcut.id);
      await refresh();
      setNotice({ tone: "success", message: "Shortcut removed" });
    });
  };

  const saveSettings = async () => {
    await runAction("save-settings", async () => {
      const saved = await operatorApi.updateSettings(settings);
      setSettings(saved);
      await refresh();
      setNotice({ tone: "success", message: "Settings saved" });
    });
  };

  const exportScripts = async () => {
    await runAction("export-scripts", async () => {
      const payload = await operatorApi.exportAllScripts();
      setExportPayload(payload);
      setNotice({ tone: "success", message: "Export is ready below" });
    });
  };

  const importScripts = async () => {
    await runAction("import-scripts", async () => {
      await operatorApi.importScripts(importPayload);
      setImportPayload("");
      await refresh();
      setNotice({ tone: "success", message: "Scripts imported" });
    });
  };

  const deleteAllScripts = async () => {
    const confirmed = window.confirm("Delete all local scripts?");
    if (!confirmed) {
      return;
    }

    await runAction("delete-all", async () => {
      await operatorApi.deleteAllScripts();
      setSelectedScript(null);
      await refresh();
      setNotice({ tone: "success", message: "All scripts deleted" });
    });
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">TO</div>
          <div>
            <h1>TIA Operator</h1>
            <p>Local desktop macros</p>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Primary">
          <button
            className={view === "dashboard" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={view === "recorder" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => setView("recorder")}
          >
            Recorder
          </button>
          <button
            className={view === "settings" ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => setView("settings")}
          >
            Settings
          </button>
        </nav>

        <div className={`mode-pill ${status.state}`}>
          <span aria-hidden="true" />
          {stateLabel(status.state)}
        </div>
        <p className="shortcut-note">Stop: {status.emergencyStopShortcut}</p>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Private by default</p>
            <h2>{viewTitle(view, selectedScript)}</h2>
          </div>
          <div className="topbar-actions">
            {status.state === "replaying" ? (
              <button className="danger-button" type="button" onClick={() => void operatorApi.stopReplay()}>
                Stop Replay
              </button>
            ) : null}
            <button className="primary-button" type="button" onClick={() => void startRecording()}>
              Record New Script
            </button>
          </div>
        </header>

        <StatusBanners status={status} notice={notice} />

        {view === "dashboard" ? (
          <Dashboard
            scripts={filteredScripts}
            search={search}
            filter={filter}
            sortMode={sortMode}
            busyAction={busyAction}
            onSearch={setSearch}
            onFilter={setFilter}
            onSort={setSortMode}
            onOpen={openScript}
            onReplay={replayScript}
            onDelete={deleteScript}
            onCreateDemo={createDemoScript}
          />
        ) : null}

        {view === "recorder" ? (
          <RecorderPanel
            status={status}
            recordingName={recordingName}
            recordingDescription={recordingDescription}
            busyAction={busyAction}
            onNameChange={setRecordingName}
            onDescriptionChange={setRecordingDescription}
            onStart={startRecording}
            onPause={() => void runAction("pause-recording", () => operatorApi.pauseRecording())}
            onResume={() => void runAction("resume-recording", () => operatorApi.resumeRecording())}
            onStop={stopRecording}
            onDiscard={() =>
              void runAction("discard-recording", async () => {
                await operatorApi.discardRecording();
                await refresh();
                setView("dashboard");
              })
            }
          />
        ) : null}

        {view === "detail" && selectedScript ? (
          <ScriptDetail
            script={selectedScript}
            shortcut={selectedShortcut}
            replayOptions={replayOptions}
            detailName={detailName}
            detailDescription={detailDescription}
            shortcutDraft={shortcutDraft}
            busyAction={busyAction}
            onNameChange={setDetailName}
            onDescriptionChange={setDetailDescription}
            onReplayOptionsChange={setReplayOptions}
            onShortcutDraftChange={setShortcutDraft}
            onSave={saveDetail}
            onReplay={() => void replayScript(selectedScript.id)}
            onBindShortcut={bindShortcut}
            onUnbindShortcut={unbindShortcut}
            onDelete={() => void deleteScript(selectedScript.id)}
          />
        ) : null}

        {view === "settings" ? (
          <Settings
            settings={settings}
            status={status}
            exportPayload={exportPayload}
            importPayload={importPayload}
            busyAction={busyAction}
            onSettingsChange={setSettings}
            onSaveSettings={saveSettings}
            onExportScripts={exportScripts}
            onImportPayloadChange={setImportPayload}
            onImportScripts={importScripts}
            onDeleteAllScripts={deleteAllScripts}
          />
        ) : null}
      </section>
    </main>
  );
}

type DashboardProps = {
  scripts: ScriptSummary[];
  search: string;
  filter: Filter;
  sortMode: SortMode;
  busyAction: string | null;
  onSearch: (value: string) => void;
  onFilter: (value: Filter) => void;
  onSort: (value: SortMode) => void;
  onOpen: (id: string) => Promise<void>;
  onReplay: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onCreateDemo: () => Promise<void>;
};

function Dashboard({
  scripts,
  search,
  filter,
  sortMode,
  busyAction,
  onSearch,
  onFilter,
  onSort,
  onOpen,
  onReplay,
  onDelete,
  onCreateDemo,
}: DashboardProps) {
  return (
    <section className="panel">
      <div className="toolbar-row">
        <input
          aria-label="Search scripts"
          className="search-input"
          value={search}
          onChange={(event) => onSearch(event.currentTarget.value)}
          placeholder="Search scripts"
        />
        <select
          value={filter}
          onChange={(event) => onFilter(event.currentTarget.value as Filter)}
          aria-label="Filter scripts"
        >
          <option value="all">All</option>
          <option value="withShortcut">With shortcut</option>
          <option value="withoutShortcut">No shortcut</option>
        </select>
        <select
          value={sortMode}
          onChange={(event) => onSort(event.currentTarget.value as SortMode)}
          aria-label="Sort scripts"
        >
          <option value="updated">Recently updated</option>
          <option value="name">Name</option>
          <option value="duration">Duration</option>
        </select>
        <button
          className="secondary-button"
          type="button"
          onClick={() => void onCreateDemo()}
          disabled={busyAction === "demo-script"}
        >
          Add Sample
        </button>
      </div>

      {scripts.length === 0 ? (
        <div className="empty-state">
          <h3>No scripts yet</h3>
          <p>Record a workflow or add a safe sample script.</p>
        </div>
      ) : (
        <div className="script-grid">
          {scripts.map((script) => (
            <article className="script-card" key={script.id}>
              <div>
                <div className="card-heading-row">
                  <h3>{script.name}</h3>
                  <span className={script.shortcut ? "badge" : "badge muted"}>
                    {script.shortcut ?? "No shortcut"}
                  </span>
                </div>
                <p>{script.description || "No description"}</p>
              </div>
              <dl className="metric-row">
                <div>
                  <dt>Events</dt>
                  <dd>{script.eventCount}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatDuration(script.durationMs)}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatDate(script.updatedAt)}</dd>
                </div>
              </dl>
              <div className="card-actions">
                <button type="button" onClick={() => void onReplay(script.id)}>
                  Replay
                </button>
                <button type="button" onClick={() => void onOpen(script.id)}>
                  Edit
                </button>
                <button
                  className="ghost-danger"
                  type="button"
                  onClick={() => void onDelete(script.id)}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type RecorderPanelProps = {
  status: AppStatus;
  recordingName: string;
  recordingDescription: string;
  busyAction: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStart: () => Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onStop: () => Promise<void>;
  onDiscard: () => void;
};

function RecorderPanel({
  status,
  recordingName,
  recordingDescription,
  busyAction,
  onNameChange,
  onDescriptionChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onDiscard,
}: RecorderPanelProps) {
  const isRecording = status.state === "recording";
  const isPaused = status.state === "recordingPaused";
  const canStart = status.state === "idle";

  return (
    <section className="panel recorder-layout">
      <div className="recorder-main">
        <div className={isRecording ? "recording-light active" : "recording-light"}>
          <span aria-hidden="true" />
          {isRecording ? "Recording" : isPaused ? "Paused" : "Ready"}
        </div>
        <label>
          Script name
          <input
            value={recordingName}
            onChange={(event) => onNameChange(event.currentTarget.value)}
          />
        </label>
        <label>
          Description
          <textarea
            value={recordingDescription}
            onChange={(event) => onDescriptionChange(event.currentTarget.value)}
            rows={4}
          />
        </label>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => void onStart()}
            disabled={!canStart || busyAction === "start-recording"}
          >
            Start
          </button>
          <button type="button" onClick={onPause} disabled={!isRecording}>
            Pause
          </button>
          <button type="button" onClick={onResume} disabled={!isPaused}>
            Resume
          </button>
          <button
            className="success-button"
            type="button"
            onClick={() => void onStop()}
            disabled={!isRecording && !isPaused}
          >
            Stop and Save
          </button>
          <button
            className="ghost-danger"
            type="button"
            onClick={onDiscard}
            disabled={!isRecording && !isPaused}
          >
            Discard
          </button>
        </div>
      </div>

      <dl className="recorder-stats">
        <div>
          <dt>Elapsed</dt>
          <dd>{formatDuration(status.recordingElapsedMs)}</dd>
        </div>
        <div>
          <dt>Events captured</dt>
          <dd>{status.recordingEventCount}</dd>
        </div>
        <div>
          <dt>State</dt>
          <dd>{stateLabel(status.state)}</dd>
        </div>
      </dl>
    </section>
  );
}

type ScriptDetailProps = {
  script: Script;
  shortcut?: ShortcutBinding;
  replayOptions: ReplayOptions;
  detailName: string;
  detailDescription: string;
  shortcutDraft: string;
  busyAction: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onReplayOptionsChange: (value: ReplayOptions) => void;
  onShortcutDraftChange: (value: string) => void;
  onSave: () => Promise<void>;
  onReplay: () => void;
  onBindShortcut: () => Promise<void>;
  onUnbindShortcut: () => Promise<void>;
  onDelete: () => void;
};

function ScriptDetail({
  script,
  shortcut,
  replayOptions,
  detailName,
  detailDescription,
  shortcutDraft,
  busyAction,
  onNameChange,
  onDescriptionChange,
  onReplayOptionsChange,
  onShortcutDraftChange,
  onSave,
  onReplay,
  onBindShortcut,
  onUnbindShortcut,
  onDelete,
}: ScriptDetailProps) {
  return (
    <section className="detail-layout">
      <div className="panel detail-editor">
        <label>
          Script name
          <input
            value={detailName}
            onChange={(event) => onNameChange(event.currentTarget.value)}
          />
        </label>
        <label>
          Description
          <textarea
            value={detailDescription}
            onChange={(event) => onDescriptionChange(event.currentTarget.value)}
            rows={3}
          />
        </label>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={() => void onSave()}
            disabled={busyAction === "save-detail"}
          >
            Save
          </button>
          <button type="button" onClick={onReplay}>
            Replay
          </button>
          <button className="ghost-danger" type="button" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="panel side-panel">
        <h3>Replay Options</h3>
        <label>
          Speed
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={replayOptions.speedMultiplier}
            onChange={(event) =>
              onReplayOptionsChange({
                ...replayOptions,
                speedMultiplier: Number(event.currentTarget.value),
              })
            }
          />
        </label>
        <label>
          Countdown (ms)
          <input
            type="number"
            min="0"
            step="250"
            value={replayOptions.countdownMs}
            onChange={(event) =>
              onReplayOptionsChange({
                ...replayOptions,
                countdownMs: Number(event.currentTarget.value),
              })
            }
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={replayOptions.useOriginalTiming}
            onChange={(event) =>
              onReplayOptionsChange({
                ...replayOptions,
                useOriginalTiming: event.currentTarget.checked,
              })
            }
          />
          Original timing
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={replayOptions.skipMouseMoves}
            onChange={(event) =>
              onReplayOptionsChange({
                ...replayOptions,
                skipMouseMoves: event.currentTarget.checked,
              })
            }
          />
          Skip mouse moves
        </label>
      </div>

      <div className="panel side-panel">
        <h3>Shortcut</h3>
        <p className="current-shortcut">
          {shortcut?.accelerator ?? "No shortcut assigned"}
        </p>
        <input
          value={shortcutDraft}
          onChange={(event) => onShortcutDraftChange(event.currentTarget.value)}
        />
        <div className="button-row">
          <button type="button" onClick={() => void onBindShortcut()}>
            Assign
          </button>
          <button
            className="ghost-danger"
            type="button"
            onClick={() => void onUnbindShortcut()}
            disabled={!shortcut}
          >
            Remove
          </button>
        </div>
      </div>

      <div className="panel timeline-panel">
        <div className="card-heading-row">
          <h3>Event Timeline</h3>
          <span className="badge">{script.eventCount} events</span>
        </div>
        <EventTimeline events={script.events} />
      </div>
    </section>
  );
}

function EventTimeline({ events }: { events: ScriptEvent[] }) {
  if (events.length === 0) {
    return <p className="muted-text">No events captured.</p>;
  }

  return (
    <div className="timeline-table">
      <div className="timeline-header">
        <span>Time</span>
        <span>Type</span>
        <span>Input</span>
        <span>Position</span>
      </div>
      {events.slice(0, 500).map((event) => (
        <div className="timeline-row" key={event.id}>
          <span>{formatDuration(event.timestampMs)}</span>
          <span>{eventKindLabel(event.kind)}</span>
          <span>{eventInput(event)}</span>
          <span>{eventPosition(event)}</span>
        </div>
      ))}
    </div>
  );
}

type SettingsProps = {
  settings: AppSettings;
  status: AppStatus;
  exportPayload: string;
  importPayload: string;
  busyAction: string | null;
  onSettingsChange: (settings: AppSettings) => void;
  onSaveSettings: () => Promise<void>;
  onExportScripts: () => Promise<void>;
  onImportPayloadChange: (value: string) => void;
  onImportScripts: () => Promise<void>;
  onDeleteAllScripts: () => Promise<void>;
};

function Settings({
  settings,
  status,
  exportPayload,
  importPayload,
  busyAction,
  onSettingsChange,
  onSaveSettings,
  onExportScripts,
  onImportPayloadChange,
  onImportScripts,
  onDeleteAllScripts,
}: SettingsProps) {
  return (
    <section className="settings-grid">
      <div className="panel settings-panel">
        <h3>Replay Defaults</h3>
        <label>
          Default speed
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={settings.defaultReplaySpeed}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                defaultReplaySpeed: Number(event.currentTarget.value),
              })
            }
          />
        </label>
        <label>
          Countdown (ms)
          <input
            type="number"
            min="0"
            step="250"
            value={settings.defaultCountdownMs}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                defaultCountdownMs: Number(event.currentTarget.value),
              })
            }
          />
        </label>
        <label>
          Emergency stop shortcut
          <input
            value={settings.emergencyStopShortcut}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                emergencyStopShortcut: event.currentTarget.value,
              })
            }
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.skipMouseMoveNoise}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                skipMouseMoveNoise: event.currentTarget.checked,
              })
            }
          />
          Skip mouse moves by default
        </label>
        <button
          className="primary-button"
          type="button"
          onClick={() => void onSaveSettings()}
          disabled={busyAction === "save-settings"}
        >
          Save Settings
        </button>
      </div>

      <div className="panel settings-panel">
        <h3>Platform</h3>
        <dl className="settings-list">
          <div>
            <dt>OS</dt>
            <dd>{status.platform.os}</dd>
          </div>
          <div>
            <dt>Linux session</dt>
            <dd>{status.platform.linuxSession ?? "n/a"}</dd>
          </div>
          <div>
            <dt>Replay</dt>
            <dd>{status.platform.replaySupported ? "supported" : "limited"}</dd>
          </div>
          <div>
            <dt>Recording</dt>
            <dd>{status.platform.recordingSupported ? "supported" : "limited"}</dd>
          </div>
          <div>
            <dt>macOS Accessibility</dt>
            <dd>{status.permissions.macosAccessibility}</dd>
          </div>
          <div>
            <dt>macOS Input Monitoring</dt>
            <dd>{status.permissions.macosInputMonitoring}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{status.dataDir || "pending"}</dd>
          </div>
        </dl>
      </div>

      <div className="panel settings-panel data-panel">
        <h3>Data</h3>
        <div className="button-row">
          <button type="button" onClick={() => void onExportScripts()}>
            Export All
          </button>
          <button
            className="ghost-danger"
            type="button"
            onClick={() => void onDeleteAllScripts()}
          >
            Delete All
          </button>
        </div>
        <textarea
          className="payload-box"
          value={exportPayload}
          readOnly
          placeholder="Exported JSON appears here"
          rows={8}
        />
        <textarea
          className="payload-box"
          value={importPayload}
          onChange={(event) => onImportPayloadChange(event.currentTarget.value)}
          placeholder="Paste exported JSON to import"
          rows={8}
        />
        <button
          type="button"
          onClick={() => void onImportScripts()}
          disabled={!importPayload.trim()}
        >
          Import
        </button>
      </div>
    </section>
  );
}

function StatusBanners({
  status,
  notice,
}: {
  status: AppStatus;
  notice: Notice | null;
}) {
  const platformWarning =
    status.platform.waylandNote ||
    (status.platform.os === "macos"
      ? "macOS may require Accessibility and Input Monitoring permission before capture or replay works."
      : null);

  return (
    <div className="banner-stack">
      {platformWarning ? (
        <div className="status-banner warning">{platformWarning}</div>
      ) : null}
      {status.state === "replaying" ? (
        <div className="status-banner info">
          Replay active. Emergency stop: {status.emergencyStopShortcut}
        </div>
      ) : null}
      {notice ? (
        <div className={`status-banner ${notice.tone}`}>{notice.message}</div>
      ) : null}
    </div>
  );
}

function createDemoEvents(): ScriptEvent[] {
  return [
    {
      id: crypto.randomUUID(),
      timestampMs: 300,
      kind: "text",
      text: "Hello from TIA Operator",
    },
    {
      id: crypto.randomUUID(),
      timestampMs: 500,
      kind: "key_down",
      key: "Return",
    },
    {
      id: crypto.randomUUID(),
      timestampMs: 620,
      kind: "key_up",
      key: "Return",
    },
  ];
}

function stateLabel(state: AppStatus["state"]) {
  const labels: Record<AppStatus["state"], string> = {
    idle: "Idle",
    recording: "Recording",
    recordingPaused: "Paused",
    replaying: "Replaying",
    error: "Error",
  };
  return labels[state];
}

function viewTitle(view: View, script: Script | null) {
  if (view === "detail" && script) {
    return script.name;
  }

  const titles: Record<View, string> = {
    dashboard: "Scripts",
    recorder: "Recorder",
    detail: "Script Detail",
    settings: "Settings",
  };
  return titles[view];
}

function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0:00";
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function eventKindLabel(kind: EventKind) {
  return kind.replace(/_/g, " ");
}

function eventInput(event: ScriptEvent) {
  return event.text ?? event.key ?? event.button ?? "-";
}

function eventPosition(event: ScriptEvent) {
  if (typeof event.x === "number" && typeof event.y === "number") {
    return `${event.x}, ${event.y}`;
  }
  if (event.scrollDeltaX || event.scrollDeltaY) {
    return `${event.scrollDeltaX ?? 0}, ${event.scrollDeltaY ?? 0}`;
  }
  return "-";
}

function findScriptName(scripts: ScriptSummary[], id: string) {
  return scripts.find((script) => script.id === id)?.name ?? "script";
}

export default App;
