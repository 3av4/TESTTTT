/**
 * تسجيل منظّم (JSON في الإنتاج، مقروء في التطوير) مع إخفاء الأ secrets.
 */
import { config } from "./config.js";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: Level = (process.env.LOG_LEVEL as Level) || (config.isProduction ? "info" : "debug");

const REDACT_KEYS = /(token|secret|password|authorization|cookie|hash|jwt)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.test(key) ? "***" : redact(val, depth + 1);
  }
  return out;
}

function write(level: Level, message: string, context?: unknown) {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[MIN_LEVEL]) return;
  const timestamp = new Date().toISOString();
  if (config.isProduction) {
    const line = JSON.stringify({
      ts: timestamp,
      level,
      msg: message,
      ...(context && typeof context === "object" ? { ctx: redact(context) } : {}),
    });
    level === "error" ? console.error(line) : level === "warn" ? console.warn(line) : console.log(line);
    return;
  }
  const prefix = `[${timestamp.slice(11, 19)}] ${level.toUpperCase().padEnd(5)}`;
  if (context === undefined) {
    console.log(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`, redact(context));
  }
}

export const logger = {
  debug: (message: string, context?: unknown) => write("debug", message, context),
  info: (message: string, context?: unknown) => write("info", message, context),
  warn: (message: string, context?: unknown) => write("warn", message, context),
  error: (message: string, context?: unknown) => write("error", message, context),
  child: (scope: string) => ({
    debug: (message: string, context?: unknown) => write("debug", `[${scope}] ${message}`, context),
    info: (message: string, context?: unknown) => write("info", `[${scope}] ${message}`, context),
    warn: (message: string, context?: unknown) => write("warn", `[${scope}] ${message}`, context),
    error: (message: string, context?: unknown) => write("error", `[${scope}] ${message}`, context),
  }),
};

export type Logger = typeof logger;
