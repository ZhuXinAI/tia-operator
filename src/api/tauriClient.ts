import { invoke } from "@tauri-apps/api/core";

type TauriError = {
  message?: string;
};

export async function call<T>(command: string, args?: Record<string, unknown>) {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (typeof error === "string") {
      throw new Error(error);
    }

    const tauriError = error as TauriError;
    throw new Error(tauriError.message ?? "The native app returned an error");
  }
}
