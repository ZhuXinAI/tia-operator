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
  createI18n,
  languageOptions,
  type I18n,
} from "./i18n";
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
  defaultLoopEnabled: false,
  defaultLoopIntervalMs: 1000,
  emergencyStopShortcut: "CommandOrControl+Alt+Escape",
  skipMouseMoveNoise: false,
  recordMouseMoves: false,
  showReplayOverlay: true,
  language: "system",
};

const defaultReplayOptions: ReplayOptions = {
  speedMultiplier: 1,
  countdownMs: 3000,
  useOriginalTiming: true,
  skipMouseMoves: false,
  loopEnabled: false,
  loopIntervalMs: 1000,
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
  const [recordingName, setRecordingName] = useState(() =>
    createI18n("system").t("script.newAutomation"),
  );
  const [recordingDescription, setRecordingDescription] = useState("");
  const [detailName, setDetailName] = useState("");
  const [detailDescription, setDetailDescription] = useState("");
  const [shortcutDraft, setShortcutDraft] = useState("CommandOrControl+Alt+1");
  const [replayOptions, setReplayOptions] =
    useState<ReplayOptions>(defaultReplayOptions);
  const [exportPayload, setExportPayload] = useState("");
  const [importPayload, setImportPayload] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const i18n = useMemo(() => createI18n(settings.language), [settings.language]);
  const { t } = i18n;

  useEffect(() => {
    document.documentElement.lang = i18n.locale;
    document.documentElement.dir = "ltr";
  }, [i18n.locale]);

  useEffect(() => {
    setRecordingName((current) =>
      current === "New automation" || current === "新自动化"
        ? t("script.newAutomation")
        : current,
    );
  }, [t]);

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
      loopEnabled: nextSettings.defaultLoopEnabled,
      loopIntervalMs: nextSettings.defaultLoopIntervalMs,
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
            ? { state: "upToDate", message: t("notice.upToDate") }
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
              message: t("notice.updateCheckFailed", {
                message: getErrorMessage(error),
              }),
            }
          : { state: "idle" },
      );
    }
  }, [t]);

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
          message: t("notice.updateFeedChanged"),
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
        message: t("notice.updateInstalled"),
      });
      await operatorApi.restartApp();
    } catch (error) {
      setUpdaterStatus({
        state: "error",
        message: t("notice.updateInstallFailed", {
          message: getErrorMessage(error),
        }),
      });
    }
  }, [t]);

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
          message: t("notice.replayStarted", {
            name: findScriptName(scripts, event.payload.scriptId),
          }),
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
          message: t("notice.shortcutTriggered", {
            accelerator: event.payload.accelerator,
          }),
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
  }, [refresh, scripts, t]);

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
        message: error instanceof Error ? error.message : t("error.actionFailed"),
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
      setNotice({ tone: "success", message: t("notice.recordingStarted") });
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
      setNotice({ tone: "success", message: t("notice.recordingSaved") });
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
      setNotice({ tone: "success", message: t("notice.scriptSaved") });
    });
  };

  const deleteScript = async (scriptId: string) => {
    const confirmed = window.confirm(t("confirm.deleteScript"));
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
      setNotice({ tone: "success", message: t("notice.scriptDeleted") });
    });
  };

  const createDemoScript = async () => {
    await runAction("demo-script", async () => {
      const script = await operatorApi.createScript({
        name: t("script.demoName"),
        description: t("script.demoDescription"),
        events: createDemoEvents(),
      });
      setSelectedScript(script);
      setView("detail");
      await refresh();
      setNotice({ tone: "success", message: t("notice.sampleCreated") });
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
      setNotice({ tone: "success", message: t("notice.shortcutAssigned") });
    });
  };

  const unbindShortcut = async () => {
    if (!selectedShortcut) {
      return;
    }

    await runAction("unbind-shortcut", async () => {
      await operatorApi.unbindShortcut(selectedShortcut.id);
      await refresh();
      setNotice({ tone: "success", message: t("notice.shortcutRemoved") });
    });
  };

  const saveSettings = async () => {
    await runAction("save-settings", async () => {
      const saved = await operatorApi.updateSettings(settings);
      setSettings(saved);
      await refresh();
      setNotice({ tone: "success", message: t("notice.settingsSaved") });
    });
  };

  const exportScripts = async () => {
    await runAction("export-scripts", async () => {
      const payload = await operatorApi.exportAllScripts();
      setExportPayload(payload);
      setNotice({ tone: "success", message: t("notice.exportReady") });
    });
  };

  const importScripts = async () => {
    await runAction("import-scripts", async () => {
      await operatorApi.importScripts(importPayload);
      setImportPayload("");
      await refresh();
      setNotice({ tone: "success", message: t("notice.scriptsImported") });
    });
  };

  const deleteAllScripts = async () => {
    const confirmed = window.confirm(t("confirm.deleteAllScripts"));
    if (!confirmed) {
      return;
    }

    await runAction("delete-all", async () => {
      await operatorApi.deleteAllScripts();
      setSelectedScript(null);
      await refresh();
      setNotice({ tone: "success", message: t("notice.allScriptsDeleted") });
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
              <p>{t("app.tagline")}</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("nav.workspace")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={view === "dashboard"}
                    tooltip={t("nav.dashboard")}
                    onClick={() => setView("dashboard")}
                  >
                    <LayoutDashboard aria-hidden="true" />
                    <span>{t("nav.dashboard")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={view === "recorder"}
                    tooltip={t("nav.recorder")}
                    onClick={() => setView("recorder")}
                  >
                    <Radio aria-hidden="true" />
                    <span>{t("nav.recorder")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={view === "settings"}
                    tooltip={t("nav.settings")}
                    onClick={() => setView("settings")}
                  >
                    <SettingsIcon aria-hidden="true" />
                    <span>{t("nav.settings")}</span>
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
              <strong>{stateLabel(status.state, i18n)}</strong>
            </div>
            <p className="shortcut-note">
              {t("sidebar.stop", { shortcut: status.emergencyStopShortcut })}
            </p>

            <div className="theme-toggle-container">
              <div className="theme-toggle-buttons">
                <button
                  type="button"
                  className={`theme-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => setTheme("light")}
                  title={t("theme.lightMode")}
                >
                  <Sun size={14} />
                  <span>{t("theme.light")}</span>
                </button>
                <button
                  type="button"
                  className={`theme-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => setTheme("dark")}
                  title={t("theme.darkMode")}
                >
                  <Moon size={14} />
                  <span>{t("theme.dark")}</span>
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
              <p className="eyebrow">{t("topbar.eyebrow")}</p>
              <h2>{viewTitle(view, selectedScript, i18n)}</h2>
            </div>
          </div>
          <div className="topbar-actions">
            {status.state === "replaying" ? (
              <Button variant="destructive" onClick={() => void operatorApi.stopReplay()}>
                <Square aria-hidden="true" className="size-4" />
                {t("topbar.stopReplay")}
              </Button>
            ) : null}
            <Button variant="default" onClick={() => void startRecording()}>
              <Plus aria-hidden="true" className="size-4" />
              {t("topbar.recordNewScript")}
            </Button>
          </div>
        </header>

        <StatusBanners
          status={status}
          notice={notice}
          updaterStatus={updaterStatus}
          i18n={i18n}
          onInstallUpdate={installUpdate}
        />

        {view === "dashboard" ? (
          <Dashboard
            scripts={filteredScripts}
            search={search}
            filter={filter}
            sortMode={sortMode}
            busyAction={busyAction}
            i18n={i18n}
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
            i18n={i18n}
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
            i18n={i18n}
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
            i18n={i18n}
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
  i18n: I18n;
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
  i18n,
  onSearch,
  onFilter,
  onSort,
  onOpen,
  onReplay,
  onDelete,
  onCreateDemo,
}: DashboardProps) {
  const { t } = i18n;

  return (
    <section className="panel">
      <div className="toolbar-row">
        <div className="search-input-wrapper">
          <Input
            aria-label={t("dashboard.searchAria")}
            className="search-input"
            value={search}
            onChange={(event) => onSearch(event.currentTarget.value)}
            placeholder={t("dashboard.searchPlaceholder")}
          />
        </div>
        <select
          value={filter}
          onChange={(event) => onFilter(event.currentTarget.value as Filter)}
          aria-label={t("dashboard.filterAria")}
          className="toolbar-select"
        >
          <option value="all">{t("dashboard.allShortcuts")}</option>
          <option value="withShortcut">{t("dashboard.withShortcut")}</option>
          <option value="withoutShortcut">{t("dashboard.noShortcut")}</option>
        </select>
        <select
          value={sortMode}
          onChange={(event) => onSort(event.currentTarget.value as SortMode)}
          aria-label={t("dashboard.sortAria")}
          className="toolbar-select"
        >
          <option value="updated">{t("dashboard.recentlyUpdated")}</option>
          <option value="name">{t("dashboard.name")}</option>
          <option value="duration">{t("dashboard.duration")}</option>
        </select>
        <Button
          variant="outline"
          onClick={() => void onCreateDemo()}
          disabled={busyAction === "demo-script"}
          className="toolbar-btn"
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("dashboard.addSample")}
        </Button>
      </div>

      {scripts.length === 0 ? (
        <div className="empty-state">
          <h3>{t("dashboard.emptyTitle")}</h3>
          <p>{t("dashboard.emptyBody")}</p>
        </div>
      ) : (
        <div className="script-grid">
          {scripts.map((script) => (
            <article className="script-card" key={script.id}>
              <div>
                <div className="card-heading-row">
                  <h3>{script.name}</h3>
                  <span className={script.shortcut ? "badge" : "badge muted"}>
                    {script.shortcut ?? t("script.noShortcut")}
                  </span>
                </div>
                <p>{script.description || t("script.noDescription")}</p>
              </div>
              <dl className="metric-row">
                <div>
                  <dt>{t("script.events")}</dt>
                  <dd>{script.eventCount}</dd>
                </div>
                <div>
                  <dt>{t("script.duration")}</dt>
                  <dd>{formatDuration(script.durationMs)}</dd>
                </div>
                <div>
                  <dt>{t("script.updated")}</dt>
                  <dd>{formatDate(script.updatedAt, i18n)}</dd>
                </div>
              </dl>
              <div className="card-actions">
                <Button size="sm" onClick={() => void onReplay(script.id)} className="flex-1">
                  <Play aria-hidden="true" className="size-3.5" />
                  {t("action.replay")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void onOpen(script.id)} className="flex-1">
                  <Pencil aria-hidden="true" className="size-3.5" />
                  {t("action.edit")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void onDelete(script.id)}
                  className="flex-1"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  {t("action.delete")}
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
  i18n: I18n;
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
  i18n,
  onNameChange,
  onDescriptionChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onDiscard,
}: RecorderPanelProps) {
  const { t } = i18n;
  const isRecording = status.state === "recording";
  const isPaused = status.state === "recordingPaused";
  const canStart = status.state === "idle";

  return (
    <section className="panel recorder-layout">
      <div className="recorder-main">
        <div className={isRecording ? "recording-light active" : "recording-light"}>
          <span aria-hidden="true" className={isRecording ? "animate-pulse" : ""} />
          {isRecording
            ? t("recorder.statusRecording")
            : isPaused
              ? t("recorder.statusPaused")
              : t("recorder.statusReady")}
        </div>
        <label className="form-label">
          {t("recorder.scriptName")}
          <Input
            value={recordingName}
            onChange={(event) => onNameChange(event.currentTarget.value)}
            disabled={!canStart}
          />
        </label>
        <label className="form-label">
          {t("recorder.description")}
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
              {t("recorder.start")}
            </Button>
          ) : (
            <>
              {isRecording ? (
                <Button variant="outline" onClick={onPause}>
                  <Pause aria-hidden="true" className="size-4" />
                  {t("recorder.pause")}
                </Button>
              ) : isPaused ? (
                <Button variant="outline" onClick={onResume}>
                  <Play aria-hidden="true" className="size-4" />
                  {t("recorder.resume")}
                </Button>
              ) : null}

              <Button
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:text-white"
                onClick={() => void onStop()}
              >
                <Save aria-hidden="true" className="size-4" />
                {t("recorder.stopSave")}
              </Button>
              <Button
                variant="destructive"
                onClick={onDiscard}
              >
                <Trash2 aria-hidden="true" className="size-4" />
                {t("recorder.discard")}
              </Button>
            </>
          )}
        </div>
      </div>

      <dl className="recorder-stats">
        <div className="stat-card">
          <dt>{t("recorder.elapsed")}</dt>
          <dd className="timer-font">{formatDuration(status.recordingElapsedMs)}</dd>
        </div>
        <div className="stat-card">
          <dt>{t("recorder.eventsCaptured")}</dt>
          <dd>{status.recordingEventCount}</dd>
        </div>
        <div className="stat-card">
          <dt>{t("recorder.state")}</dt>
          <dd>{stateLabel(status.state, i18n)}</dd>
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
  i18n: I18n;
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
  i18n,
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
  const { t } = i18n;

  return (
    <section className="detail-layout">
      <div className="panel detail-editor">
        <label className="form-label">
          {t("recorder.scriptName")}
          <Input
            value={detailName}
            onChange={(event) => onNameChange(event.currentTarget.value)}
          />
        </label>
        <label className="form-label">
          {t("recorder.description")}
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
            {t("action.save")}
          </Button>
          <Button variant="outline" onClick={onReplay}>
            <Play aria-hidden="true" className="size-4" />
            {t("action.replay")}
          </Button>
          <Button variant="destructive" onClick={onDelete}>
            <Trash2 aria-hidden="true" className="size-4" />
            {t("action.delete")}
          </Button>
        </div>
      </div>

      <div className="panel side-panel">
        <h3>
          <SlidersHorizontal aria-hidden="true" className="section-icon" />
          {t("detail.replayOptions")}
        </h3>
        <label className="form-label">
          {t("detail.speed")}
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
          {t("detail.countdownMs")}
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
          <span>{t("detail.originalTiming")}</span>
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
          <span>{t("detail.skipMouseMoves")}</span>
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={replayOptions.loopEnabled}
            onChange={(event) =>
              onReplayOptionsChange({
                ...replayOptions,
                loopEnabled: event.currentTarget.checked,
              })
            }
            className="workspace-checkbox"
          />
          <span>{t("detail.loopReplay")}</span>
        </label>
        <label className="form-label">
          {t("detail.loopIntervalMs")}
          <Input
            type="number"
            min="0"
            step="500"
            value={replayOptions.loopIntervalMs}
            onChange={(event) =>
              onReplayOptionsChange({
                ...replayOptions,
                loopIntervalMs: Number(event.currentTarget.value),
              })
            }
          />
        </label>
      </div>

      <div className="panel side-panel">
        <h3>
          <Keyboard aria-hidden="true" className="section-icon" />
          {t("detail.shortcut")}
        </h3>
        <div className="shortcut-box">
          <p className="eyebrow">{t("detail.currentBinding")}</p>
          <p className="current-shortcut">
            {shortcut?.accelerator ?? t("detail.noShortcutAssigned")}
          </p>
        </div>
        <Input
          value={shortcutDraft}
          onChange={(event) => onShortcutDraftChange(event.currentTarget.value)}
          placeholder={t("detail.shortcutPlaceholder")}
        />
        <div className="button-row">
          <Button variant="default" onClick={() => void onBindShortcut()} className="flex-1">
            <Save aria-hidden="true" className="size-4" />
            {t("action.assign")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onUnbindShortcut()}
            disabled={!shortcut}
            className="flex-1"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {t("action.remove")}
          </Button>
        </div>
      </div>

      <div className="panel timeline-panel">
        <div className="card-heading-row">
          <h3>
            <Database aria-hidden="true" className="section-icon" />
            {t("detail.eventTimeline")}
          </h3>
          <span className="badge">
            {t("detail.eventCount", { count: script.eventCount })}
          </span>
        </div>
        <EventTimeline events={script.events} i18n={i18n} />
      </div>
    </section>
  );
}

function EventTimeline({ events, i18n }: { events: ScriptEvent[]; i18n: I18n }) {
  const { t } = i18n;

  if (events.length === 0) {
    return <p className="muted-text text-center py-6">{t("timeline.empty")}</p>;
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
        <span>{t("timeline.time")}</span>
        <span>{t("timeline.type")}</span>
        <span>{t("timeline.input")}</span>
        <span>{t("timeline.position")}</span>
      </div>
      <div className="timeline-body">
        {events.slice(0, 500).map((event) => (
          <div className="timeline-row" key={event.id}>
            <span className="timer-font">{formatDuration(event.timestampMs)}</span>
            <span className="event-type-cell">
              {getEventIcon(event.kind)}
              <span className="capitalize">{eventKindLabel(event.kind, i18n)}</span>
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
  i18n: I18n;
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
  i18n,
  onSettingsChange,
  onSaveSettings,
  onExportScripts,
  onImportPayloadChange,
  onImportScripts,
  onDeleteAllScripts,
  onCheckForUpdates,
  onInstallUpdate,
}: SettingsProps) {
  const { t } = i18n;

  return (
    <section className="settings-grid">
      <div className="panel settings-panel">
        <h3>
          <SlidersHorizontal aria-hidden="true" className="section-icon" />
          {t("settings.replayDefaults")}
        </h3>
        <label className="form-label">
          {t("settings.defaultSpeed")}
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
          {t("settings.defaultCountdownMs")}
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
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.defaultLoopEnabled}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                defaultLoopEnabled: event.currentTarget.checked,
              })
            }
            className="workspace-checkbox"
          />
          <span>{t("settings.loopByDefault")}</span>
        </label>
        <label className="form-label">
          {t("settings.defaultLoopIntervalMs")}
          <Input
            type="number"
            min="0"
            step="500"
            value={settings.defaultLoopIntervalMs}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                defaultLoopIntervalMs: Number(event.currentTarget.value),
              })
            }
          />
        </label>
        <label className="form-label">
          {t("settings.emergencyStopShortcut")}
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
          <span>{t("settings.skipMouseMovesDefault")}</span>
        </label>
        <label className="form-label">
          {t("settings.language")}
          <select
            value={settings.language}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                language: event.currentTarget.value,
              })
            }
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="default"
          onClick={() => void onSaveSettings()}
          disabled={busyAction === "save-settings"}
          className="w-full sm:w-auto"
        >
          <Save aria-hidden="true" className="size-4" />
          {t("settings.save")}
        </Button>
      </div>

      <div className="panel settings-panel">
        <h3>
          <MousePointer2 aria-hidden="true" className="section-icon" />
          {t("settings.recording")}
        </h3>
        <div className="settings-control-card">
          <label className="checkbox-row settings-checkbox-row">
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
            <span>{t("settings.recordMouseMoves")}</span>
          </label>
          <p className="muted-text">{t("settings.recordMouseMovesHelp")}</p>
        </div>
      </div>

      <div className="panel settings-panel">
        <h3>
          <MonitorCog aria-hidden="true" className="section-icon" />
          {t("settings.platform")}
        </h3>
        <dl className="settings-list">
          <div>
            <dt>{t("settings.os")}</dt>
            <dd>{status.platform.os}</dd>
          </div>
          <div>
            <dt>{t("settings.linuxSession")}</dt>
            <dd>{status.platform.linuxSession ?? t("settings.na")}</dd>
          </div>
          <div>
            <dt>{t("action.replay")}</dt>
            <dd className="capitalize">
              {status.platform.replaySupported
                ? t("settings.supported")
                : t("settings.limited")}
            </dd>
          </div>
          <div>
            <dt>{t("settings.recording")}</dt>
            <dd className="capitalize">
              {status.platform.recordingSupported
                ? t("settings.supported")
                : t("settings.limited")}
            </dd>
          </div>
          <div>
            <dt>{t("settings.macosAccessibility")}</dt>
            <dd className="capitalize">{status.permissions.macosAccessibility}</dd>
          </div>
          <div>
            <dt>{t("settings.macosInputMonitoring")}</dt>
            <dd className="capitalize">{status.permissions.macosInputMonitoring}</dd>
          </div>
          <div>
            <dt>{t("settings.dataDirectory")}</dt>
            <dd className="text-xs break-all font-mono opacity-80">
              {status.dataDir || t("settings.pending")}
            </dd>
          </div>
        </dl>
      </div>

      <div className="panel settings-panel">
        <h3>
          <Download aria-hidden="true" className="section-icon" />
          {t("settings.updates")}
        </h3>
        <p className="muted-text">{updaterStatusText(updaterStatus, i18n)}</p>
        {updaterStatus.state === "downloading" ? (
          <UpdateProgress status={updaterStatus} i18n={i18n} />
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
            {t("action.checkForUpdates")}
          </Button>
          {updaterStatus.state === "available" ? (
            <Button variant="default" onClick={() => void onInstallUpdate()}>
              <Download aria-hidden="true" className="size-4" />
              {t("action.install")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="panel settings-panel data-panel">
        <h3>
          <Database aria-hidden="true" className="section-icon" />
          {t("settings.dataBackupReset")}
        </h3>
        <div className="button-row">
          <Button variant="outline" onClick={() => void onExportScripts()}>
            <Download aria-hidden="true" className="size-4" />
            {t("settings.exportAllScripts")}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onDeleteAllScripts()}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {t("settings.deleteAllScripts")}
          </Button>
        </div>
        <div className="data-box-group">
          <label className="form-label">
            {t("settings.exportPayload")}
            <textarea
              className="payload-box workspace-textarea"
              value={exportPayload}
              readOnly
              placeholder={t("settings.exportPlaceholder")}
              rows={6}
            />
          </label>
          <label className="form-label">
            {t("settings.importPayload")}
            <textarea
              className="payload-box workspace-textarea"
              value={importPayload}
              onChange={(event) => onImportPayloadChange(event.currentTarget.value)}
              placeholder={t("settings.importPlaceholder")}
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
          {t("settings.importScripts")}
        </Button>
      </div>
    </section>
  );
}

function StatusBanners({
  status,
  notice,
  updaterStatus,
  i18n,
  onInstallUpdate,
}: {
  status: AppStatus;
  notice: Notice | null;
  updaterStatus: UpdaterStatus;
  i18n: I18n;
  onInstallUpdate: () => Promise<void>;
}) {
  const { t } = i18n;
  const platformWarning =
    status.platform.waylandNote ||
    (status.platform.os === "macos"
      ? t("status.platformMac")
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
          <span>
            {t("status.replayActive", {
              shortcut: status.emergencyStopShortcut,
            })}
          </span>
        </div>
      ) : null}
      {updaterStatus.state !== "idle" ? (
        <div className={`status-banner ${updaterBannerTone(updaterStatus)}`}>
          <Download className="size-4 shrink-0" />
          <div className="status-banner-content">
            <span>{updaterStatusText(updaterStatus, i18n)}</span>
            {updaterStatus.state === "downloading" ? (
              <UpdateProgress status={updaterStatus} i18n={i18n} />
            ) : null}
          </div>
          {updaterStatus.state === "available" ? (
            <Button
              size="sm"
              onClick={() => void onInstallUpdate()}
              className="status-banner-action"
            >
              {t("action.install")}
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

function updaterStatusText(status: UpdaterStatus, i18n: I18n) {
  const { t } = i18n;

  switch (status.state) {
    case "checking":
      return t("update.checking");
    case "available":
      return t("update.available", { version: status.version ?? "" });
    case "downloading": {
      const total = status.totalBytes ? ` of ${formatBytes(status.totalBytes)}` : "";
      return t("update.downloading", {
        version: status.version ?? "",
        downloaded: formatBytes(status.downloadedBytes ?? 0),
        total,
      });
    }
    case "installing":
      return status.message ?? t("update.installing");
    case "upToDate":
      return status.message ?? t("update.upToDate");
    case "error":
      return status.message ?? t("update.error");
    case "idle":
    default:
      return t("update.idle");
  }
}

function UpdateProgress({ status, i18n }: { status: UpdaterStatus; i18n: I18n }) {
  const { t } = i18n;
  const progress =
    status.totalBytes && status.totalBytes > 0
      ? Math.min(100, Math.round(((status.downloadedBytes ?? 0) / status.totalBytes) * 100))
      : null;

  return (
    <div className="update-progress" aria-label={t("status.downloading")}>
      <div
        className="update-progress-bar"
        style={{ width: `${progress ?? 18}%` }}
      />
      <span>{progress === null ? t("status.downloading") : `${progress}%`}</span>
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

function stateLabel(state: AppStatus["state"], i18n: I18n) {
  const labels: Record<AppStatus["state"], string> = {
    idle: i18n.t("state.idle"),
    recording: i18n.t("state.recording"),
    recordingPaused: i18n.t("state.recordingPaused"),
    replaying: i18n.t("state.replaying"),
    error: i18n.t("state.error"),
  };
  return labels[state];
}

function viewTitle(view: View, script: Script | null, i18n: I18n) {
  if (view === "detail" && script) {
    return script.name;
  }

  const titles: Record<View, string> = {
    dashboard: i18n.t("view.scripts"),
    recorder: i18n.t("view.recorder"),
    detail: i18n.t("view.detail"),
    settings: i18n.t("view.settings"),
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

function formatDate(value: string, i18n: I18n) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return i18n.t("settings.na");
  }
  return date.toLocaleDateString(i18n.locale, {
    month: "short",
    day: "numeric",
  });
}

function eventKindLabel(kind: EventKind, i18n: I18n) {
  const labels: Record<EventKind, string> = {
    mouse_move: i18n.t("event.mouse_move"),
    mouse_down: i18n.t("event.mouse_down"),
    mouse_up: i18n.t("event.mouse_up"),
    mouse_scroll: i18n.t("event.mouse_scroll"),
    key_down: i18n.t("event.key_down"),
    key_up: i18n.t("event.key_up"),
    text: i18n.t("event.text"),
  };
  return labels[kind];
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
