export type RecorderState =
  | "idle"
  | "recording"
  | "recordingPaused"
  | "replaying"
  | "error";

export type EventKind =
  | "mouse_move"
  | "mouse_down"
  | "mouse_up"
  | "mouse_scroll"
  | "key_down"
  | "key_up"
  | "text"
  | "wait";

export type MouseButton =
  | "left"
  | "right"
  | "middle"
  | "back"
  | "forward"
  | "unknown";

export type Modifiers = {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
};

export type ScriptEvent = {
  id: string;
  timestampMs: number;
  kind: EventKind;
  x?: number | null;
  y?: number | null;
  button?: MouseButton | null;
  key?: string | null;
  modifiers?: Modifiers | null;
  text?: string | null;
  waitMs?: number | null;
  scrollDeltaX?: number | null;
  scrollDeltaY?: number | null;
  metadata?: unknown;
};

export type Script = {
  id: string;
  name: string;
  description?: string | null;
  events: ScriptEvent[];
  createdAt: string;
  updatedAt: string;
  durationMs: number;
  eventCount: number;
};

export type ScriptSummary = Omit<Script, "events"> & {
  shortcut?: string | null;
};

export type ShortcutBinding = {
  id: string;
  scriptId: string;
  accelerator: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ReplayOptions = {
  speedMultiplier: number;
  countdownMs: number;
  useOriginalTiming: boolean;
  skipMouseMoves: boolean;
  loopEnabled: boolean;
  loopIntervalMs: number;
  failIfWindowChanged?: boolean | null;
};

export type AppSettings = {
  defaultReplaySpeed: number;
  defaultCountdownMs: number;
  defaultLoopEnabled: boolean;
  defaultLoopIntervalMs: number;
  emergencyStopShortcut: string;
  skipMouseMoveNoise: boolean;
  recordMouseMoves: boolean;
  showReplayOverlay: boolean;
  language: string;
};

export type PlatformStatus = {
  os: string;
  linuxSession?: string | null;
  replaySupported: boolean;
  recordingSupported: boolean;
  waylandNote?: string | null;
};

export type PermissionStatus = {
  macosAccessibility: string;
  macosInputMonitoring: string;
  screenRecording: string;
};

export type AppStatus = {
  state: RecorderState;
  activeScriptId?: string | null;
  recordingEventCount: number;
  recordingElapsedMs: number;
  replayScriptId?: string | null;
  platform: PlatformStatus;
  permissions: PermissionStatus;
  emergencyStopShortcut: string;
  dataDir: string;
};

export type ShortcutValidation = {
  valid: boolean;
  reason?: string | null;
  normalized?: string | null;
  conflictScriptId?: string | null;
};

export type CreateScriptInput = {
  name: string;
  description?: string | null;
  events?: ScriptEvent[];
};

export type UpdateScriptInput = {
  name?: string;
  description?: string | null;
  events?: ScriptEvent[];
};

export type StartRecordingInput = {
  name?: string | null;
  description?: string | null;
};

export type StopRecordingInput = {
  name: string;
  description?: string | null;
};
