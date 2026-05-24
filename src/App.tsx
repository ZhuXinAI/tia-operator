import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { check, type DownloadEvent } from "@tauri-apps/plugin-updater";
import {
  Database,
  Download,
  ArrowDown,
  ArrowUp,
  GripVertical,
  Keyboard,
  Languages,
  LayoutDashboard,
  ListPlus,
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
  const [detailEvents, setDetailEvents] = useState<ScriptEvent[]>([]);
  const [shortcutDraft, setShortcutDraft] = useState("");
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
      setDetailEvents(selectedScript.events);
      const binding = shortcuts.find(
        (shortcut) => shortcut.scriptId === selectedScript.id,
      );
      setShortcutDraft(binding?.accelerator ?? "");
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
        events: detailEvents,
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

  const createCustomScript = async () => {
    await runAction("custom-script", async () => {
      const script = await operatorApi.createScript({
        name: t("script.customName"),
        description: t("script.customDescription"),
        events: [],
      });
      setSelectedScript(script);
      setDetailEvents(script.events);
      setView("detail");
      await refresh();
      setNotice({ tone: "success", message: t("notice.customScriptCreated") });
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
            <Button
              variant="outline"
              onClick={() => void createCustomScript()}
              disabled={busyAction === "custom-script"}
            >
              <ListPlus aria-hidden="true" className="size-4" />
              {t("topbar.createScript")}
            </Button>
            <Button variant="default" onClick={() => void startRecording()}>
              <Radio aria-hidden="true" className="size-4" />
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
            onCreateCustom={createCustomScript}
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
            shortcut={selectedShortcut}
            replayOptions={replayOptions}
            detailName={detailName}
            detailDescription={detailDescription}
            events={detailEvents}
            shortcutDraft={shortcutDraft}
            busyAction={busyAction}
            i18n={i18n}
            onNameChange={setDetailName}
            onDescriptionChange={setDetailDescription}
            onEventsChange={setDetailEvents}
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
  onCreateCustom: () => Promise<void>;
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
  onCreateCustom,
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
          onClick={() => void onCreateCustom()}
          disabled={busyAction === "custom-script"}
          className="toolbar-btn"
        >
          <ListPlus aria-hidden="true" className="size-4" />
          {t("dashboard.createScript")}
        </Button>
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
  shortcut?: ShortcutBinding;
  replayOptions: ReplayOptions;
  detailName: string;
  detailDescription: string;
  events: ScriptEvent[];
  shortcutDraft: string;
  busyAction: string | null;
  i18n: I18n;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onEventsChange: (events: ScriptEvent[]) => void;
  onReplayOptionsChange: (value: ReplayOptions) => void;
  onShortcutDraftChange: (value: string) => void;
  onSave: () => Promise<void>;
  onReplay: () => void;
  onBindShortcut: () => Promise<void>;
  onUnbindShortcut: () => Promise<void>;
  onDelete: () => void;
};

function ScriptDetail({
  shortcut,
  replayOptions,
  detailName,
  detailDescription,
  events,
  shortcutDraft,
  busyAction,
  i18n,
  onNameChange,
  onDescriptionChange,
  onEventsChange,
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
            {shortcut?.accelerator
              ? formatShortcutDisplay(shortcut.accelerator)
              : t("detail.noShortcutAssigned")}
          </p>
        </div>
        <ShortcutCaptureField
          value={shortcutDraft}
          i18n={i18n}
          onChange={onShortcutDraftChange}
        />
        <div className="button-row">
          <Button
            variant="default"
            onClick={() => void onBindShortcut()}
            disabled={!shortcutDraft}
            className="flex-1"
          >
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
            {t("detail.eventCount", { count: events.length })}
          </span>
        </div>
        <EventTimeline
          events={events}
          i18n={i18n}
          onEventsChange={onEventsChange}
        />
      </div>
    </section>
  );
}

function ShortcutCaptureField({
  value,
  i18n,
  onChange,
}: {
  value: string;
  i18n: I18n;
  onChange: (value: string) => void;
}) {
  const { t } = i18n;
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    if (!capturing) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setCapturing(false);
        setCaptureError(null);
        return;
      }

      const nextShortcut = shortcutFromKeyboardEvent(event);
      if (!nextShortcut) {
        setCaptureError(t("detail.shortcutCaptureWaiting"));
        return;
      }

      if (nextShortcut === "multiple-modifiers") {
        setCaptureError(t("detail.shortcutCaptureOneModifier"));
        return;
      }

      onChange(nextShortcut);
      setCaptureError(null);
      setCapturing(false);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [capturing, onChange, t]);

  return (
    <div className="shortcut-capture">
      <button
        type="button"
        className={capturing ? "shortcut-capture-button listening" : "shortcut-capture-button"}
        onClick={() => {
          setCapturing(true);
          setCaptureError(null);
        }}
      >
        <Keyboard aria-hidden="true" className="size-4" />
        <span>
          {capturing
            ? t("detail.shortcutCaptureActive")
            : value
              ? formatShortcutDisplay(value)
              : t("detail.shortcutCaptureIdle")}
        </span>
      </button>
      <p className={captureError ? "shortcut-capture-help error" : "shortcut-capture-help"}>
        {captureError ?? t("detail.shortcutCaptureHelp")}
      </p>
    </div>
  );
}

function EventTimeline({
  events,
  i18n,
  onEventsChange,
}: {
  events: ScriptEvent[];
  i18n: I18n;
  onEventsChange?: (events: ScriptEvent[]) => void;
}) {
  const { t } = i18n;
  const [stepTemplate, setStepTemplate] = useState<StepTemplate>("click");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const editable = Boolean(onEventsChange);

  const updateEvent = (index: number, nextEvent: ScriptEvent) => {
    onEventsChange?.(events.map((event, eventIndex) =>
      eventIndex === index ? nextEvent : event,
    ));
  };

  const removeEvent = (index: number) => {
    onEventsChange?.(events.filter((_, eventIndex) => eventIndex !== index));
  };

  const moveEvent = (fromIndex: number, toIndex: number) => {
    onEventsChange?.(moveTimelineEvent(events, fromIndex, toIndex));
  };

  const addStep = () => {
    onEventsChange?.([
      ...events,
      ...createEventsFromTemplate(stepTemplate),
    ]);
  };

  const dropEvent = (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      return;
    }

    moveEvent(dragIndex, toIndex);
    setDragIndex(null);
  };

  if (events.length === 0) {
    return (
      <div className="timeline-empty-block">
        {editable ? (
          <StepToolbar
            i18n={i18n}
            stepTemplate={stepTemplate}
            onStepTemplateChange={setStepTemplate}
            onAddStep={addStep}
          />
        ) : null}
        <p className="muted-text text-center py-6">{t("timeline.empty")}</p>
      </div>
    );
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
      case "wait":
        return <Pause className="size-3.5 text-amber-500" />;
      default:
        return <Database className="size-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div className={editable ? "timeline-table editable" : "timeline-table"}>
      {editable ? (
        <StepToolbar
          i18n={i18n}
          stepTemplate={stepTemplate}
          onStepTemplateChange={setStepTemplate}
          onAddStep={addStep}
        />
      ) : null}
      <div className="timeline-header">
        {editable ? <span aria-hidden="true" /> : null}
        <span>{t("timeline.type")}</span>
        <span>{t("timeline.input")}</span>
        <span>{t("timeline.position")}</span>
        {editable ? <span>{t("timeline.actions")}</span> : null}
      </div>
      <div className="timeline-body">
        {events.slice(0, 500).map((event, index) => (
          <div
            className={editable && dragIndex === index ? "timeline-row dragging" : "timeline-row"}
            key={event.id}
            onDragOver={(dragEvent) => {
              if (editable) {
                dragEvent.preventDefault();
              }
            }}
            onDrop={() => dropEvent(index)}
          >
            {editable ? (
              <div className="timeline-cell drag-cell">
                <button
                  type="button"
                  className="icon-button drag-handle"
                  draggable
                  aria-label={t("timeline.dragStep")}
                  onDragStart={() => setDragIndex(index)}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <GripVertical aria-hidden="true" className="size-4" />
                </button>
              </div>
            ) : null}
            <div className="timeline-cell event-type-cell">
              {getEventIcon(event.kind)}
              {editable ? (
                <select
                  aria-label={t("timeline.type")}
                  value={event.kind}
                  onChange={(changeEvent) =>
                    updateEvent(
                      index,
                      convertEventKind(event, changeEvent.currentTarget.value as EventKind),
                    )
                  }
                >
                  {eventKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {eventKindLabel(kind, i18n)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="capitalize">{eventKindLabel(event.kind, i18n)}</span>
              )}
            </div>
            <div className="timeline-cell">
              {editable ? (
                <EventInputEditor
                  event={event}
                  i18n={i18n}
                  onChange={(nextEvent) => updateEvent(index, nextEvent)}
                />
              ) : (
                <span className="font-mono text-xs">{eventInput(event)}</span>
              )}
            </div>
            <div className="timeline-cell">
              {editable ? (
                <EventPositionEditor
                  event={event}
                  i18n={i18n}
                  onChange={(nextEvent) => updateEvent(index, nextEvent)}
                />
              ) : (
                <span className="font-mono text-xs text-muted-foreground">
                  {eventPosition(event)}
                </span>
              )}
            </div>
            {editable ? (
              <div className="timeline-cell timeline-actions">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("timeline.moveUp")}
                  disabled={index === 0}
                  onClick={() => moveEvent(index, index - 1)}
                >
                  <ArrowUp aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("timeline.moveDown")}
                  disabled={index === events.length - 1}
                  onClick={() => moveEvent(index, index + 1)}
                >
                  <ArrowDown aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label={t("timeline.removeStep")}
                  onClick={() => removeEvent(index)}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StepToolbar({
  i18n,
  stepTemplate,
  onStepTemplateChange,
  onAddStep,
}: {
  i18n: I18n;
  stepTemplate: StepTemplate;
  onStepTemplateChange: (value: StepTemplate) => void;
  onAddStep: () => void;
}) {
  const { t } = i18n;

  return (
    <div className="step-toolbar">
      <select
        aria-label={t("timeline.addStepType")}
        value={stepTemplate}
        onChange={(event) => onStepTemplateChange(event.currentTarget.value as StepTemplate)}
      >
        {stepTemplates.map((template) => (
          <option key={template} value={template}>
            {stepTemplateLabel(template, i18n)}
          </option>
        ))}
      </select>
      <Button variant="outline" size="sm" onClick={onAddStep}>
        <Plus aria-hidden="true" className="size-4" />
        {t("timeline.addStep")}
      </Button>
    </div>
  );
}

function EventInputEditor({
  event,
  i18n,
  onChange,
}: {
  event: ScriptEvent;
  i18n: I18n;
  onChange: (event: ScriptEvent) => void;
}) {
  const { t } = i18n;

  if (event.kind === "mouse_down" || event.kind === "mouse_up") {
    return (
      <select
        aria-label={t("timeline.input")}
        value={event.button ?? "left"}
        onChange={(changeEvent) =>
          onChange({
            ...event,
            button: changeEvent.currentTarget.value as ScriptEvent["button"],
          })
        }
      >
        {mouseButtons.map((button) => (
          <option key={button} value={button}>
            {button}
          </option>
        ))}
      </select>
    );
  }

  if (event.kind === "key_down" || event.kind === "key_up") {
    return (
      <Input
        aria-label={t("timeline.input")}
        className="timeline-field mono-field"
        value={event.key ?? ""}
        placeholder="Return"
        onChange={(changeEvent) =>
          onChange({ ...event, key: changeEvent.currentTarget.value })
        }
      />
    );
  }

  if (event.kind === "text") {
    return (
      <Input
        aria-label={t("timeline.input")}
        className="timeline-field"
        value={event.text ?? ""}
        placeholder="Text"
        onChange={(changeEvent) =>
          onChange({ ...event, text: changeEvent.currentTarget.value })
        }
      />
    );
  }

  if (event.kind === "wait") {
    return (
      <Input
        aria-label={t("timeline.waitMs")}
        className="timeline-field mono-field"
        type="number"
        min="0"
        step="50"
        value={event.waitMs ?? 250}
        onChange={(changeEvent) =>
          onChange({ ...event, waitMs: Number(changeEvent.currentTarget.value) })
        }
      />
    );
  }

  return <span className="muted-text">{eventInput(event)}</span>;
}

function EventPositionEditor({
  event,
  i18n,
  onChange,
}: {
  event: ScriptEvent;
  i18n: I18n;
  onChange: (event: ScriptEvent) => void;
}) {
  const { t } = i18n;

  if (event.kind === "mouse_move" || event.kind === "mouse_down" || event.kind === "mouse_up") {
    return (
      <div className="position-editor">
        <Input
          aria-label={t("timeline.x")}
          className="timeline-field mono-field"
          type="number"
          value={event.x ?? 0}
          onChange={(changeEvent) =>
            onChange({ ...event, x: Number(changeEvent.currentTarget.value) })
          }
        />
        <Input
          aria-label={t("timeline.y")}
          className="timeline-field mono-field"
          type="number"
          value={event.y ?? 0}
          onChange={(changeEvent) =>
            onChange({ ...event, y: Number(changeEvent.currentTarget.value) })
          }
        />
      </div>
    );
  }

  if (event.kind === "mouse_scroll") {
    return (
      <div className="position-editor">
        <Input
          aria-label={t("timeline.deltaX")}
          className="timeline-field mono-field"
          type="number"
          value={event.scrollDeltaX ?? 0}
          onChange={(changeEvent) =>
            onChange({
              ...event,
              scrollDeltaX: Number(changeEvent.currentTarget.value),
            })
          }
        />
        <Input
          aria-label={t("timeline.deltaY")}
          className="timeline-field mono-field"
          type="number"
          value={event.scrollDeltaY ?? 0}
          onChange={(changeEvent) =>
            onChange({
              ...event,
              scrollDeltaY: Number(changeEvent.currentTarget.value),
            })
          }
        />
      </div>
    );
  }

  return <span className="muted-text">-</span>;
}

type SettingsProps = {
  settings: AppSettings;
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
          <Languages aria-hidden="true" className="section-icon" />
          {t("settings.language")}
        </h3>
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

type StepTemplate = "click" | EventKind;

const eventKinds: EventKind[] = [
  "wait",
  "mouse_down",
  "mouse_up",
  "mouse_move",
  "mouse_scroll",
  "key_down",
  "key_up",
  "text",
];

const stepTemplates: StepTemplate[] = [
  "click",
  "wait",
  "mouse_down",
  "mouse_up",
  "mouse_move",
  "mouse_scroll",
  "key_down",
  "key_up",
  "text",
];

const mouseButtons = ["left", "right", "middle", "back", "forward", "unknown"] as const;

function createDemoEvents(): ScriptEvent[] {
  return [
    {
      id: crypto.randomUUID(),
      timestampMs: 0,
      kind: "text",
      text: "Hello from TIA Operator",
    },
    {
      id: crypto.randomUUID(),
      timestampMs: 0,
      kind: "wait",
      waitMs: 200,
    },
    {
      id: crypto.randomUUID(),
      timestampMs: 0,
      kind: "key_down",
      key: "Return",
    },
    {
      id: crypto.randomUUID(),
      timestampMs: 0,
      kind: "wait",
      waitMs: 120,
    },
    {
      id: crypto.randomUUID(),
      timestampMs: 0,
      kind: "key_up",
      key: "Return",
    },
  ];
}

function createEventsFromTemplate(template: StepTemplate): ScriptEvent[] {
  if (template === "click") {
    return [
      createDefaultEvent("mouse_down", {
        button: "left",
        x: 0,
        y: 0,
      }),
      createDefaultEvent("wait", {
        waitMs: 80,
      }),
      createDefaultEvent("mouse_up", {
        button: "left",
        x: 0,
        y: 0,
      }),
    ];
  }

  return [createDefaultEvent(template)];
}

function createDefaultEvent(
  kind: EventKind,
  overrides: Partial<ScriptEvent> = {},
): ScriptEvent {
  const base: ScriptEvent = {
    id: crypto.randomUUID(),
    timestampMs: 0,
    kind,
  };

  return { ...convertEventKind(base, kind), ...overrides };
}

function convertEventKind(event: ScriptEvent, kind: EventKind): ScriptEvent {
  const base = {
    id: event.id,
    timestampMs: 0,
    kind,
    metadata: event.metadata,
  } satisfies Pick<ScriptEvent, "id" | "timestampMs" | "kind" | "metadata">;

  if (kind === "wait") {
    return {
      ...base,
      waitMs: event.waitMs ?? (event.timestampMs > 0 ? event.timestampMs : 250),
    };
  }

  if (kind === "mouse_down" || kind === "mouse_up") {
    return {
      ...base,
      x: event.x ?? 0,
      y: event.y ?? 0,
      button: event.button ?? "left",
    };
  }

  if (kind === "mouse_move") {
    return {
      ...base,
      x: event.x ?? 0,
      y: event.y ?? 0,
    };
  }

  if (kind === "mouse_scroll") {
    return {
      ...base,
      scrollDeltaX: event.scrollDeltaX ?? 0,
      scrollDeltaY: event.scrollDeltaY ?? -600,
    };
  }

  if (kind === "key_down" || kind === "key_up") {
    return {
      ...base,
      key: event.key ?? event.text ?? "Return",
    };
  }

  return {
    ...base,
    text: event.text ?? event.key ?? "Text",
  };
}

function moveTimelineEvent(events: ScriptEvent[], fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= events.length ||
    toIndex >= events.length ||
    fromIndex === toIndex
  ) {
    return events;
  }

  const nextEvents = [...events];
  const [moving] = nextEvents.splice(fromIndex, 1);
  nextEvents.splice(toIndex, 0, moving);
  return nextEvents;
}

function stepTemplateLabel(template: StepTemplate, i18n: I18n) {
  if (template === "click") {
    return i18n.t("event.click");
  }

  return eventKindLabel(template, i18n);
}

function shortcutFromKeyboardEvent(event: KeyboardEvent) {
  if (isModifierCode(event.code)) {
    return null;
  }

  const altGraph = event.getModifierState?.("AltGraph") || event.key === "AltGraph";
  const modifiers = [
    event.shiftKey ? "shift" : null,
    event.ctrlKey && !altGraph ? "control" : null,
    event.altKey || altGraph ? "alt" : null,
    event.metaKey ? "super" : null,
  ].filter(Boolean) as string[];

  if (modifiers.length === 0) {
    return null;
  }

  if (modifiers.length > 1) {
    return "multiple-modifiers";
  }

  const key = shortcutKeyFromCode(event.code);
  return key ? `${modifiers[0]}+${key}` : null;
}

function isModifierCode(code: string) {
  return [
    "AltLeft",
    "AltRight",
    "ControlLeft",
    "ControlRight",
    "MetaLeft",
    "MetaRight",
    "ShiftLeft",
    "ShiftRight",
  ].includes(code);
}

function shortcutKeyFromCode(code: string) {
  if (!code || code === "Unidentified") {
    return null;
  }

  return code;
}

function formatShortcutDisplay(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) => {
      const normalized = part.trim();
      const lower = normalized.toLowerCase();
      if (lower === "control") return "Ctrl";
      if (lower === "shift") return "Shift";
      if (lower === "alt") return "Alt";
      if (lower === "super") {
        return navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Win";
      }
      if (normalized.startsWith("Key")) return normalized.slice(3).toUpperCase();
      if (normalized.startsWith("Digit")) return normalized.slice(5);
      if (normalized.startsWith("Numpad")) return `Num ${normalized.slice(6)}`;
      if (normalized.startsWith("Arrow")) return normalized.replace("Arrow", "");
      return normalized;
    })
    .join(" + ");
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
    wait: i18n.t("event.wait"),
  };
  return labels[kind];
}

function eventInput(event: ScriptEvent) {
  if (event.kind === "wait") {
    return `${event.waitMs ?? 0} ms`;
  }

  return event.text ?? event.key ?? event.button ?? "-";
}

function eventPosition(event: ScriptEvent) {
  if (event.kind === "wait") {
    return "-";
  }

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
