import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import {
  Database,
  Download,
  Keyboard,
  LayoutDashboard,
  MonitorCog,
  MousePointer2,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Save,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  Sun,
  Moon,
  Scroll,
  Info,
  AlertTriangle,
  CheckCircle,
} from "lucide-react";
import "./App.css";
import { operatorApi } from "./api/operatorApi";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./components/ui/sidebar";
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
type UpdaterStatus = {
  state:
    | "idle"
    | "checking"
    | "available"
    | "downloading"
    | "installing"
    | "upToDate"
    | "error";
  version?: string;
  currentVersion?: string;
  message?: string;
  downloadedBytes?: number;
  totalBytes?: number;
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
  recordMouseMoves: false,
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
  const [theme, setTheme] = useState<"light" | "dark">(
    () => {
      const saved = localStorage.getItem("tia-theme");
      if (saved === "light" || saved === "dark") return saved;
      return "dark"; // Default to dark mode for premium look
    }
  );

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("tia-theme", theme);
  }, [theme]);

  const [view, setView] = useState<View>("dashboard");
  const [scripts, setScripts] = useState<ScriptSummary[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutBinding[]>([]);
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [status, setStatus] = useState<AppStatus>(defaultStatus);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [updaterStatus, setUpdaterStatus] = useState<UpdaterStatus>({
    state: "idle",
  });
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

  const checkForUpdates = useCallback(async (manual = true) => {
    if (manual) {
      setUpdaterStatus({ state: "checking" });
    }

    try {
      const update = await check({ timeout: 10_000 });
      if (!update) {
        setUpdaterStatus(
          manual
            ? { state: "upToDate", message: "TIA Operator is up to date." }
            : { state: "idle" },
        );
        return;
      }

      const nextStatus: UpdaterStatus = {
        state: "available",
        version: update.version,
        currentVersion: update.currentVersion,
        message: update.body,
      };
      await update.close();
      setUpdaterStatus(nextStatus);
    } catch (error) {
      setUpdaterStatus(
        manual
          ? {
              state: "error",
              message: `Update check failed: ${getErrorMessage(error)}`,
            }
          : { state: "idle" },
      );
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setUpdaterStatus((current) => ({
      ...current,
      state: "downloading",
      downloadedBytes: 0,
      totalBytes: undefined,
    }));

    try {
      const update = await check({ timeout: 10_000 });
      if (!update) {
        setUpdaterStatus({
          state: "upToDate",
          message: "The release feed no longer has a newer version.",
        });
        return;
      }

      const version = update.version;
      let downloadedBytes = 0;
      let totalBytes: number | undefined;

      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          downloadedBytes = 0;
          totalBytes = event.data.contentLength;
        }

        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
        }

        if (event.event === "Finished") {
          downloadedBytes = totalBytes ?? downloadedBytes;
        }

        setUpdaterStatus({
          state: event.event === "Finished" ? "installing" : "downloading",
          version,
          currentVersion: update.currentVersion,
          downloadedBytes,
          totalBytes,
        });
      });

      setUpdaterStatus({
        state: "installing",
        version,
        currentVersion: update.currentVersion,
        message: "Update installed. Restarting TIA Operator.",
      });
      await operatorApi.restartApp();
    } catch (error) {
      setUpdaterStatus({
        state: "error",
        message: `Update install failed: ${getErrorMessage(error)}`,
      });
    }
  }, []);

  useEffect(() => {
    refresh().catch((error: Error) =>
      setNotice({ tone: "danger", message: error.message }),
    );
  }, [refresh]);

  useEffect(() => {
    void checkForUpdates(false);
  }, [checkForUpdates]);

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
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="brand-block">
            <div className="brand-mark">TO</div>
            <div className="brand-copy">
              <h1>TIA Operator</h1>
              <p>Local desktop macros</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={view === "dashboard"}
                    tooltip="Dashboard"
                    onClick={() => setView("dashboard")}
                  >
                    <LayoutDashboard aria-hidden="true" />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={view === "recorder"}
                    tooltip="Recorder"
                    onClick={() => setView("recorder")}
                  >
                    <Radio aria-hidden="true" />
                    <span>Recorder</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={view === "settings"}
                    tooltip="Settings"
                    onClick={() => setView("settings")}
                  >
                    <SettingsIcon aria-hidden="true" />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <div className="sidebar-footer-container">
            <div className={`mode-pill ${status.state}`}>
              <span aria-hidden="true" />
              <strong>{stateLabel(status.state)}</strong>
            </div>
            <p className="shortcut-note">Stop: {status.emergencyStopShortcut}</p>

            <div className="theme-toggle-container">
              <div className="theme-toggle-buttons">
                <button
                  type="button"
                  className={`theme-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => setTheme("light")}
                  title="Light Mode"
                >
                  <Sun size={14} />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  className={`theme-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => setTheme("dark")}
                  title="Dark Mode"
                >
                  <Moon size={14} />
                  <span>Dark</span>
                </button>
              </div>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <SidebarTrigger className="sidebar-trigger" />
            <div>
              <p className="eyebrow">Private by default</p>
              <h2>{viewTitle(view, selectedScript)}</h2>
            </div>
          </div>
          <div className="topbar-actions">
            {status.state === "replaying" ? (
              <Button variant="destructive" onClick={() => void operatorApi.stopReplay()}>
                <Square aria-hidden="true" className="size-4" />
                Stop Replay
              </Button>
            ) : null}
            <Button variant="default" onClick={() => void startRecording()}>
              <Plus aria-hidden="true" className="size-4" />
              Record New Script
            </Button>
          </div>
        </header>

        <StatusBanners
          status={status}
          notice={notice}
          updaterStatus={updaterStatus}
          onInstallUpdate={installUpdate}
        />

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
            updaterStatus={updaterStatus}
            onSettingsChange={setSettings}
            onSaveSettings={saveSettings}
            onExportScripts={exportScripts}
            onImportPayloadChange={setImportPayload}
            onImportScripts={importScripts}
            onDeleteAllScripts={deleteAllScripts}
            onCheckForUpdates={() => checkForUpdates(true)}
            onInstallUpdate={installUpdate}
          />
        ) : null}
        </section>
      </SidebarInset>
    </SidebarProvider>
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
        <div className="search-input-wrapper">
          <Input
            aria-label="Search scripts"
            className="search-input"
            value={search}
            onChange={(event) => onSearch(event.currentTarget.value)}
            placeholder="Search scripts..."
          />
        </div>
        <select
          value={filter}
          onChange={(event) => onFilter(event.currentTarget.value as Filter)}
          aria-label="Filter scripts"
          className="toolbar-select"
        >
          <option value="all">All Shortcuts</option>
          <option value="withShortcut">With shortcut</option>
          <option value="withoutShortcut">No shortcut</option>
        </select>
        <select
          value={sortMode}
          onChange={(event) => onSort(event.currentTarget.value as SortMode)}
          aria-label="Sort scripts"
          className="toolbar-select"
        >
          <option value="updated">Recently updated</option>
          <option value="name">Name</option>
          <option value="duration">Duration</option>
        </select>
        <Button
          variant="outline"
          onClick={() => void onCreateDemo()}
          disabled={busyAction === "demo-script"}
          className="toolbar-btn"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add Sample
        </Button>
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
                <Button size="sm" onClick={() => void onReplay(script.id)} className="flex-1">
                  <Play aria-hidden="true" className="size-3.5" />
                  Replay
                </Button>
                <Button variant="outline" size="sm" onClick={() => void onOpen(script.id)} className="flex-1">
                  <Pencil aria-hidden="true" className="size-3.5" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void onDelete(script.id)}
                  className="flex-1"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Delete
                </Button>
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
          <span aria-hidden="true" className={isRecording ? "animate-pulse" : ""} />
          {isRecording ? "Recording" : isPaused ? "Paused" : "Ready"}
        </div>
        <label className="form-label">
          Script name
          <Input
            value={recordingName}
            onChange={(event) => onNameChange(event.currentTarget.value)}
            disabled={!canStart}
          />
        </label>
        <label className="form-label">
          Description
          <textarea
            value={recordingDescription}
            onChange={(event) => onDescriptionChange(event.currentTarget.value)}
            rows={4}
            disabled={!canStart}
            className="workspace-textarea"
          />
        </label>
        <div className="button-row">
          {canStart ? (
            <Button
              variant="default"
              onClick={() => void onStart()}
              disabled={busyAction === "start-recording"}
            >
              <Radio aria-hidden="true" className="size-4" />
              Start Recording
            </Button>
          ) : (
            <>
              {isRecording ? (
                <Button variant="outline" onClick={onPause}>
                  <Pause aria-hidden="true" className="size-4" />
                  Pause
                </Button>
              ) : isPaused ? (
                <Button variant="outline" onClick={onResume}>
                  <Play aria-hidden="true" className="size-4" />
                  Resume
                </Button>
              ) : null}

              <Button
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:text-white"
                onClick={() => void onStop()}
              >
                <Save aria-hidden="true" className="size-4" />
                Stop & Save
              </Button>
              <Button
                variant="destructive"
                onClick={onDiscard}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Discard
              </Button>
            </>
          )}
        </div>
      </div>

      <dl className="recorder-stats">
        <div className="stat-card">
          <dt>Elapsed</dt>
          <dd className="timer-font">{formatDuration(status.recordingElapsedMs)}</dd>
        </div>
        <div className="stat-card">
          <dt>Events captured</dt>
          <dd>{status.recordingEventCount}</dd>
        </div>
        <div className="stat-card">
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
        <label className="form-label">
          Script name
          <Input
            value={detailName}
            onChange={(event) => onNameChange(event.currentTarget.value)}
          />
        </label>
        <label className="form-label">
          Description
          <textarea
            value={detailDescription}
            onChange={(event) => onDescriptionChange(event.currentTarget.value)}
            rows={3}
            className="workspace-textarea"
          />
        </label>
        <div className="button-row">
          <Button
            variant="default"
            onClick={() => void onSave()}
            disabled={busyAction === "save-detail"}
          >
            <Save aria-hidden="true" className="size-4" />
            Save
          </Button>
          <Button variant="outline" onClick={onReplay}>
            <Play aria-hidden="true" className="size-4" />
            Replay
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="panel side-panel">
        <h3>
          <SlidersHorizontal aria-hidden="true" className="section-icon" />
          Replay Options
        </h3>
        <label className="form-label">
          Speed
          <Input
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
        <label className="form-label">
          Countdown (ms)
          <Input
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
            className="workspace-checkbox"
          />
          <span>Original timing</span>
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
            className="workspace-checkbox"
          />
          <span>Skip mouse moves</span>
        </label>
      </div>

      <div className="panel side-panel">
        <h3>
          <Keyboard aria-hidden="true" className="section-icon" />
          Shortcut
        </h3>
        <div className="shortcut-box">
          <p className="eyebrow">Current Binding</p>
          <p className="current-shortcut">
            {shortcut?.accelerator ?? "No shortcut assigned"}
          </p>
        </div>
        <Input
          value={shortcutDraft}
          onChange={(event) => onShortcutDraftChange(event.currentTarget.value)}
          placeholder="e.g. CommandOrControl+Alt+1"
        />
        <div className="button-row">
          <Button variant="default" onClick={() => void onBindShortcut()} className="flex-1">
            <Save aria-hidden="true" className="size-4" />
            Assign
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onUnbindShortcut()}
            disabled={!shortcut}
            className="flex-1"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Remove
          </Button>
        </div>
      </div>

      <div className="panel timeline-panel">
        <div className="card-heading-row">
          <h3>
            <Database aria-hidden="true" className="section-icon" />
            Event Timeline
          </h3>
          <span className="badge">{script.eventCount} events</span>
        </div>
        <EventTimeline events={script.events} />
      </div>
    </section>
  );
}

function EventTimeline({ events }: { events: ScriptEvent[] }) {
  if (events.length === 0) {
    return <p className="muted-text text-center py-6">No events captured.</p>;
  }

  const getEventIcon = (kind: string) => {
    switch (kind) {
      case "mouse_move":
        return <MousePointer2 className="size-3.5 text-sky-500" />;
      case "mouse_down":
      case "mouse_up":
        return <MousePointer2 className="size-3.5 text-indigo-500" />;
      case "mouse_scroll":
        return <Scroll className="size-3.5 text-amber-500" />;
      case "key_down":
      case "key_up":
        return <Keyboard className="size-3.5 text-purple-500" />;
      case "text":
        return <Keyboard className="size-3.5 text-emerald-500" />;
      default:
        return <Database className="size-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className="timeline-table">
      <div className="timeline-header">
        <span>Time</span>
        <span>Type</span>
        <span>Input</span>
        <span>Position</span>
      </div>
      <div className="timeline-body">
        {events.slice(0, 500).map((event) => (
          <div className="timeline-row" key={event.id}>
            <span className="timer-font">{formatDuration(event.timestampMs)}</span>
            <span className="event-type-cell">
              {getEventIcon(event.kind)}
              <span className="capitalize">{eventKindLabel(event.kind)}</span>
            </span>
            <span className="font-mono text-xs">{eventInput(event)}</span>
            <span className="font-mono text-xs text-muted-foreground">{eventPosition(event)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type SettingsProps = {
  settings: AppSettings;
  status: AppStatus;
  exportPayload: string;
  importPayload: string;
  busyAction: string | null;
  updaterStatus: UpdaterStatus;
  onSettingsChange: (settings: AppSettings) => void;
  onSaveSettings: () => Promise<void>;
  onExportScripts: () => Promise<void>;
  onImportPayloadChange: (value: string) => void;
  onImportScripts: () => Promise<void>;
  onDeleteAllScripts: () => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  onInstallUpdate: () => Promise<void>;
};

function Settings({
  settings,
  status,
  exportPayload,
  importPayload,
  busyAction,
  updaterStatus,
  onSettingsChange,
  onSaveSettings,
  onExportScripts,
  onImportPayloadChange,
  onImportScripts,
  onDeleteAllScripts,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsProps) {
  return (
    <section className="settings-grid">
      <div className="panel settings-panel">
        <h3>
          <SlidersHorizontal aria-hidden="true" className="section-icon" />
          Replay Defaults
        </h3>
        <label className="form-label">
          Default speed
          <Input
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
        <label className="form-label">
          Countdown (ms)
          <Input
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
        <label className="form-label">
          Emergency stop shortcut
          <Input
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
            className="workspace-checkbox"
          />
          <span>Skip mouse moves by default</span>
        </label>
        <Button
          variant="default"
          onClick={() => void onSaveSettings()}
          disabled={busyAction === "save-settings"}
          className="w-full sm:w-auto"
        >
          <Save aria-hidden="true" className="size-4" />
          Save Settings
        </Button>
      </div>

      <div className="panel settings-panel">
        <h3>
          <MousePointer2 aria-hidden="true" className="section-icon" />
          Recording
        </h3>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.recordMouseMoves}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                recordMouseMoves: event.currentTarget.checked,
              })
            }
            className="workspace-checkbox"
          />
          <span>Record mouse move events</span>
        </label>
        <p className="muted-text">
          Mouse moves are sampled at most every 100ms when this is enabled.
        </p>
      </div>

      <div className="panel settings-panel">
        <h3>
          <MonitorCog aria-hidden="true" className="section-icon" />
          Platform
        </h3>
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
            <dd className="capitalize">{status.platform.replaySupported ? "supported" : "limited"}</dd>
          </div>
          <div>
            <dt>Recording</dt>
            <dd className="capitalize">{status.platform.recordingSupported ? "supported" : "limited"}</dd>
          </div>
          <div>
            <dt>macOS Accessibility</dt>
            <dd className="capitalize">{status.permissions.macosAccessibility}</dd>
          </div>
          <div>
            <dt>macOS Input Monitoring</dt>
            <dd className="capitalize">{status.permissions.macosInputMonitoring}</dd>
          </div>
          <div>
            <dt>Data Directory</dt>
            <dd className="text-xs break-all font-mono opacity-80">{status.dataDir || "pending"}</dd>
          </div>
        </dl>
      </div>

      <div className="panel settings-panel">
        <h3>
          <Download aria-hidden="true" className="section-icon" />
          Updates
        </h3>
        <p className="muted-text">{updaterStatusText(updaterStatus)}</p>
        {updaterStatus.state === "downloading" ? (
          <UpdateProgress status={updaterStatus} />
        ) : null}
        <div className="button-row">
          <Button
            variant="outline"
            onClick={() => void onCheckForUpdates()}
            disabled={
              updaterStatus.state === "checking" ||
              updaterStatus.state === "downloading" ||
              updaterStatus.state === "installing"
            }
          >
            <Download aria-hidden="true" className="size-4" />
            Check for Updates
          </Button>
          {updaterStatus.state === "available" ? (
            <Button variant="default" onClick={() => void onInstallUpdate()}>
              <Download aria-hidden="true" className="size-4" />
              Install Update
            </Button>
          ) : null}
        </div>
      </div>

      <div className="panel settings-panel data-panel">
        <h3>
          <Database aria-hidden="true" className="section-icon" />
          Data Backup & Reset
        </h3>
        <div className="button-row">
          <Button variant="outline" onClick={() => void onExportScripts()}>
            <Download aria-hidden="true" className="size-4" />
            Export All Scripts
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onDeleteAllScripts()}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete All Scripts
          </Button>
        </div>
        <div className="data-box-group">
          <label className="form-label">
            Export Payload
            <textarea
              className="payload-box workspace-textarea"
              value={exportPayload}
              readOnly
              placeholder="Exported JSON will appear here after clicking Export All."
              rows={6}
            />
          </label>
          <label className="form-label">
            Import Payload
            <textarea
              className="payload-box workspace-textarea"
              value={importPayload}
              onChange={(event) => onImportPayloadChange(event.currentTarget.value)}
              placeholder="Paste exported JSON here to import scripts."
              rows={6}
            />
          </label>
        </div>
        <Button
          variant="default"
          onClick={() => void onImportScripts()}
          disabled={!importPayload.trim()}
          className="w-full sm:w-auto"
        >
          <Upload aria-hidden="true" className="size-4" />
          Import Scripts
        </Button>
      </div>
    </section>
  );
}

function StatusBanners({
  status,
  notice,
  updaterStatus,
  onInstallUpdate,
}: {
  status: AppStatus;
  notice: Notice | null;
  updaterStatus: UpdaterStatus;
  onInstallUpdate: () => Promise<void>;
}) {
  const platformWarning =
    status.platform.waylandNote ||
    (status.platform.os === "macos"
      ? "macOS may require Accessibility and Input Monitoring permission before capture or replay works."
      : null);

  const getNoticeIcon = (tone: Notice["tone"]) => {
    switch (tone) {
      case "success":
        return <CheckCircle className="size-4 shrink-0 text-emerald-500" />;
      case "info":
        return <Info className="size-4 shrink-0 text-sky-500" />;
      case "warning":
        return <AlertTriangle className="size-4 shrink-0 text-amber-500" />;
      case "danger":
        return <AlertTriangle className="size-4 shrink-0 text-red-500" />;
      default:
        return <Info className="size-4 shrink-0" />;
    }
  };

  return (
    <div className="banner-stack">
      {platformWarning ? (
        <div className="status-banner warning">
          <AlertTriangle className="size-4 shrink-0 text-amber-500" />
          <span>{platformWarning}</span>
        </div>
      ) : null}
      {status.state === "replaying" ? (
        <div className="status-banner info">
          <Info className="size-4 shrink-0 text-sky-500" />
          <span>Replay active. Emergency stop: {status.emergencyStopShortcut}</span>
        </div>
      ) : null}
      {updaterStatus.state !== "idle" ? (
        <div className={`status-banner ${updaterBannerTone(updaterStatus)}`}>
          <Download className="size-4 shrink-0" />
          <div className="status-banner-content">
            <span>{updaterStatusText(updaterStatus)}</span>
            {updaterStatus.state === "downloading" ? (
              <UpdateProgress status={updaterStatus} />
            ) : null}
          </div>
          {updaterStatus.state === "available" ? (
            <Button
              size="sm"
              onClick={() => void onInstallUpdate()}
              className="status-banner-action"
            >
              Install
            </Button>
          ) : null}
        </div>
      ) : null}
      {notice ? (
        <div className={`status-banner ${notice.tone}`}>
          {getNoticeIcon(notice.tone)}
          <span>{notice.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function updaterBannerTone(status: UpdaterStatus): Notice["tone"] {
  if (status.state === "available" || status.state === "downloading" || status.state === "installing") {
    return "info";
  }

  if (status.state === "upToDate") {
    return "success";
  }

  if (status.state === "error") {
    return "warning";
  }

  return "info";
}

function updaterStatusText(status: UpdaterStatus) {
  switch (status.state) {
    case "checking":
      return "Checking GitHub Releases for updates.";
    case "available":
      return `Update ${status.version} is available.`;
    case "downloading": {
      const total = status.totalBytes ? ` of ${formatBytes(status.totalBytes)}` : "";
      return `Downloading update${status.version ? ` ${status.version}` : ""}: ${formatBytes(
        status.downloadedBytes ?? 0,
      )}${total}.`;
    }
    case "installing":
      return status.message ?? "Installing update. TIA Operator will restart when it is ready.";
    case "upToDate":
      return status.message ?? "TIA Operator is up to date.";
    case "error":
      return status.message ?? "Update check failed.";
    case "idle":
    default:
      return "TIA Operator checks GitHub Releases for signed updates.";
  }
}

function UpdateProgress({ status }: { status: UpdaterStatus }) {
  const progress =
    status.totalBytes && status.totalBytes > 0
      ? Math.min(100, Math.round(((status.downloadedBytes ?? 0) / status.totalBytes) * 100))
      : null;

  return (
    <div className="update-progress" aria-label="Update download progress">
      <div
        className="update-progress-bar"
        style={{ width: `${progress ?? 18}%` }}
      />
      <span>{progress === null ? "Downloading" : `${progress}%`}</span>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
