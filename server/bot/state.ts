/**
 * حالة البوت المشتركة (منع الاستيراد الدائري).
 */
export interface BotState {
  running: boolean;
  polling: boolean;
  lastUpdateAt: string | null;
  updatesHandled: number;
  initialized: boolean;
  startupError: string | null;
  lastErrorAt: string | null;
}

const state: BotState = {
  running: false,
  polling: false,
  lastUpdateAt: null,
  updatesHandled: 0,
  initialized: false,
  startupError: null,
  lastErrorAt: null,
};

export function markRunning(mode: "webhook" | "polling"): void {
  state.running = true;
  state.polling = mode === "polling";
  state.initialized = true;
}

export function markLastUpdate(): void {
  state.updatesHandled += 1;
  state.lastUpdateAt = new Date().toISOString();
}

export function markError(message: string): void {
  state.startupError = message;
  state.lastErrorAt = new Date().toISOString();
}

export function clearError(): void {
  state.startupError = null;
}

export function markStopped(): void {
  state.running = false;
  state.polling = false;
}

export function getBotStatus(): BotState {
  return { ...state };
}
