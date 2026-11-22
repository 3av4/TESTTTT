/**
 * إعدادات التطبيق — تُقرأ من .env مرة واحدة وتُتحقّق من صحتها عند الإقلاع.
 */
import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";

function env(name: string, fallback = ""): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name, fallback ? "true" : "false").toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

function parseIdList(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s));
}

const environment = env("NODE_ENV", "development");
const NODE_ENV = environment;
const isProduction = NODE_ENV === "production";

const BOT_TOKEN = env("BOT_TOKEN");
const DATABASE_URL = env("DATABASE_URL");
const JWT_SECRET = env("JWT_SECRET");

/** أدنى طول مقبول لسر التوقيع */
const MIN_SECRET_LENGTH = 32;

if (!JWT_SECRET) {
  throw new Error("[config] JWT_SECRET مطلوب — ضعه في ملف .env (32 حرفاً على الأقل)");
}
if (JWT_SECRET.length < MIN_SECRET_LENGTH) {
  throw new Error(
    `[config] JWT_SECRET قصير جداً (${JWT_SECRET.length} حرفاً). الحد الأدنى ${MIN_SECRET_LENGTH}.`,
  );
}
if (!BOT_TOKEN) {
  // البوت اختياري أثناء تشغيل الموقع فقط، لكن الأفضل دائماً ضبطه.
  console.warn("[config] BOT_TOKEN غير مضبوط — ستعمل الواجهات لكن البوت والإشعارات معطّلة.");
}

/** اشتقاق اسم البوت من التوكن عند عدم ضبط BOT_USERNAME */
const BOT_USERNAME = env("BOT_USERNAME").replace(/^@/, "");

/** هل نستخدم قاعدة PGlite المدمجة؟ */
const useEmbeddedDb = DATABASE_URL.length === 0;

const DB_ENGINE = env("DB_ENGINE", "auto").toLowerCase();
if (!useEmbeddedDb && DB_ENGINE === "pglite") {
  throw new Error("[config] DB_ENGINE=pglite لا يتوافق مع ضبط DATABASE_URL. احذف أحدهما.");
}

const ADMIN_IDS = parseIdList(env("ADMIN_IDS"));
const ADMIN_PASSWORD = env("ADMIN_PASSWORD");

if (isProduction && !ADMIN_PASSWORD) {
  console.warn(
    "[config] ADMIN_PASSWORD غير مضبوط — تسجيل دخول الأدمن بكلمة المرور معطّل. " +
      "استخدم Telegram Login أو اضبط ADMIN_PASSWORD قبل النشر.",
  );
}
if (isProduction && ADMIN_PASSWORD && ADMIN_PASSWORD.length < 12) {
  console.warn("[config] ADMIN_PASSWORD قصير (أقل من 12 حرفاً) — استخدم كلمة مرور أقوى في الإنتاج.");
}
if (isProduction && envBool("DEMO_MODE", false) && !envBool("DEMO_ALLOW_PRODUCTION", false)) {
  console.warn("[config] DEMO_MODE=true في بيئة إنتاج — سيُتجاهل. للتفعيل المؤقت في بيئة معاينة فقط اضبط DEMO_ALLOW_PRODUCTION=true.");
}
if (isProduction && envBool("DEMO_ALLOW_PRODUCTION", false)) {
  console.warn(
    "⚠️ [config] الدخول التجريبي مُفعَّل على بيئة إنتاج (DEMO_ALLOW_PRODUCTION=true). " +
      "هذا يسمح لأي زائر بالدخول كمدير! استخدمه في بيئات المعاينة فقط وأطفئه قبل النشر الحقيقي.",
  );
}

const PORT = envInt("PORT", 3000);
/**
 * رابط التطبيق العام.
 *
 * الترتيب: APP_URL ← RENDER_EXTERNAL_URL ← localhost
 *
 * ملاحظة: لا نستخدم env() هنا لأنها تعتبر السلسلة الفارغة "غير مضبوطة" وتقفز
 * للاحتياطي — وهذا صحيح. لكن المشكلة أن dotenv قد يضع APP_URL فارغاً في الإنتاج،
 * بينما RENDER_EXTERNAL_URL يوفّره Render تلقائياً. لذا نقرأ الاثنين مباشرة.
 */
function resolveAppUrl(): string {
  const explicit = (process.env.APP_URL ?? "").trim();
  const renderUrl = (process.env.RENDER_EXTERNAL_URL ?? "").trim();
  const chosen = explicit || renderUrl || `http://localhost:${PORT}`;
  return chosen.replace(/\/+$/, "");
}
const APP_URL = resolveAppUrl();
const TRUST_PROXY = envBool("TRUST_PROXY", true);

const WEBHOOK_SECRET = env("WEBHOOK_SECRET", "");
const TELEGRAM_WEBHOOK_URL = env("TELEGRAM_WEBHOOK_URL");

const JWT_COOKIE = "btp_session";
const JWT_TTL_DAYS = envInt("JWT_TTL_DAYS", 30);

const BACKUP_ENABLED = envBool("BACKUP_ENABLED", true);
const BACKUP_INTERVAL_HOURS = envInt("BACKUP_INTERVAL_HOURS", 6);
const BACKUP_DIR = path.resolve(env("BACKUP_DIR", "./backups"));
const BACKUP_KEEP = envInt("BACKUP_KEEP", 14);

const DATA_DIR = path.resolve(env("PGLITE_DATA_DIR", "./db/pglite-data"));
const EMBEDDED_PG_PORT = envInt("PGLITE_PORT", 5432);

/** بيانات مستخدم تلجرام كما تصل من الويدجت أو البوت */
export interface TelegramUserPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export const config = {
  NODE_ENV,
  isProduction,
  PORT,
  APP_URL,
  TRUST_PROXY,
  BOT_TOKEN,
  BOT_USERNAME,
  useEmbeddedDb,
  DB_ENGINE,
  DATABASE_URL: useEmbeddedDb
    ? `postgres://postgres:postgres@127.0.0.1:${EMBEDDED_PG_PORT}/postgres`
    : DATABASE_URL,
  JWT_SECRET,
  ADMIN_IDS,
  ADMIN_PASSWORD,
  /** بصمة قصيرة للتوكن تُستخدم في التحقق من Telegram Login — لا يُكشف التوكن */
  botTokenFingerprint: BOT_TOKEN
    ? crypto.createHash("sha256").update(BOT_TOKEN).digest()
    : crypto.createHash("sha256").update(`no-bot-${JWT_SECRET}`).digest(),
  WEBHOOK_SECRET,
  TELEGRAM_WEBHOOK_URL,
  JWT_COOKIE,
  JWT_TTL_DAYS,
  BACKUP_ENABLED,
  BACKUP_INTERVAL_HOURS,
  BACKUP_DIR,
  BACKUP_KEEP,
  DATA_DIR,
  EMBEDDED_PG_PORT,
  /** وضع العرض التجريبي: يفعّل دخولاً تجريبياً سريعاً للواجهة (ممنوع في الإنتاج) */
  DEMO_MODE:
    envBool("DEMO_MODE", false) &&
    (environment !== "production" || envBool("DEMO_ALLOW_PRODUCTION", false)),
  RATE_LIMIT_ENABLED: envBool("RATE_LIMIT_ENABLED", true),
  TRUST_TELEGRAM_PROXY: envBool("TRUST_TELEGRAM_PROXY", true),
} as const;

export type AppConfig = typeof config;

/** التحقق من أن معرّف تلجرام مدير */
export function isAdminTelegramId(id: string | number): boolean {
  return config.ADMIN_IDS.includes(String(id));
}
