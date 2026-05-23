import { call } from "./tauriClient";
import type {
  AppSettings,
  AppStatus,
  CreateScriptInput,
  ReplayOptions,
  Script,
  ScriptSummary,
  ShortcutBinding,
  ShortcutValidation,
  StartRecordingInput,
  StopRecordingInput,
  UpdateScriptInput,
} from "../types";

export const operatorApi = {
  listScripts: () => call<ScriptSummary[]>("list_scripts"),
  getScript: (id: string) => call<Script>("get_script", { id }),
  createScript: (input: CreateScriptInput) =>
    call<Script>("create_script", { input }),
  updateScript: (id: string, input: UpdateScriptInput) =>
    call<Script>("update_script", { id, input }),
  deleteScript: (id: string) => call<void>("delete_script", { id }),
  startRecording: (input: StartRecordingInput) =>
    call<void>("start_recording", { input }),
  pauseRecording: () => call<void>("pause_recording"),
  resumeRecording: () => call<void>("resume_recording"),
  stopRecording: (input: StopRecordingInput) =>
    call<Script>("stop_recording", { input }),
  discardRecording: () => call<void>("discard_recording"),
  replayScript: (id: string, options: ReplayOptions) =>
    call<void>("replay_script", { id, options }),
  stopReplay: () => call<void>("stop_replay"),
  listShortcuts: () => call<ShortcutBinding[]>("list_shortcuts"),
  bindShortcut: (scriptId: string, accelerator: string) =>
    call<ShortcutBinding>("bind_shortcut", { scriptId, accelerator }),
  unbindShortcut: (bindingId: string) =>
    call<void>("unbind_shortcut", { bindingId }),
  validateShortcut: (accelerator: string) =>
    call<ShortcutValidation>("validate_shortcut", { accelerator }),
  getAppStatus: () => call<AppStatus>("get_app_status"),
  getSettings: () => call<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    call<AppSettings>("update_settings", { settings }),
  exportAllScripts: () => call<string>("export_all_scripts"),
  importScripts: (payload: string) => call<Script[]>("import_scripts", { payload }),
  deleteAllScripts: () => call<void>("delete_all_scripts"),
  restartApp: () => call<void>("restart_app"),
};
