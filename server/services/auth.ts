/**
 * خدمة المصادقة:
 *  - التحقق من Telegram Login Widget (HMAC-SHA256 حسب المواصفة الرسمية).
 *  - إصدار جلسات مخزّنة في قاعدة البيانات + توكن JWT في كوكي HttpOnly.
 *  - دخول المدير الاحتياطي بكلمة سر (اختياري).
 */
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config, type TelegramUserPayload } from "../config.js";
import { query, queryOne } from "../db.js";
import { errors } from "../errors.js";
import { logger } from "../logger.js";
import { randomToken, toBigNumber, timingSafeEqual } from "../utils.js";
import {
  getUserById,
  toPublicUser,
  upsertTelegramUser,
  userIsAdmin,
  type PublicUser,
  type UserRow,
} from "./users.js";

const log = logger.child("auth");

export interface TelegramAuthData {
  id: string | number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string | number;
  hash: string;
}

export interface SessionData {
  sessionId: string;
  token: string;
  user: PublicUser;
  expiresAt: string;
}

/**
 * التحقق من بيانات Telegram Login Widget.
 * data_check_string = كل الحقول ما عدا hash مرتبة أبجدياً بصيغة key=value
 * مفصولة بـ \n، ثم secret_key = SHA256(bot_token).
 */
export function verifyTelegramLogin(data: TelegramAuthData): boolean {
  if (!config.BOT_TOKEN) throw errors.unauthorized("البوت غير مُعدّ على السيرفر");
  const { hash, ...rest } = data;
  if (!hash || typeof hash !== "string") return false;

  const entries = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .sort((a, b) => a.localeCompare(b, "en"));
  const dataCheckString = entries.join("\n");

  const secretKey = crypto.createHash("sha256").update(config.BOT_TOKEN).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!timingSafeEqual(computed, hash.toLowerCase())) return false;

  const authDate = Number.parseInt(String(data.auth_date), 10);
  if (!Number.isFinite(authDate)) return false;
  const age = Date.now() / 1000 - authDate;
  // صلاحية 24 ساعة مع تسامح بسيط للساعة
  return age <= 86_400 && age >= -300;
}

/** فحص التوقيع المستقل عن الصلاحية الزمنية (لو أردت تمديد النافذة) */
export function verifyTelegramSignature(data: TelegramAuthData): boolean {
  const { hash, ...rest } = data;
  const entries = Object.entries(rest)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .sort((a, b) => a.localeCompare(b, "en"));
  const secretKey = crypto.createHash("sha256").update(config.BOT_TOKEN).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(entries.join("\n")).digest("hex");
  return timingSafeEqual(computed, String(hash ?? "").toLowerCase());
}

function signToken(payload: { sid: string; uid: number; tg: number }): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: `${config.JWT_TTL_DAYS}d`,
    issuer: "bitpoin",
    audience: "bitpoin-web",
  });
}

/** إنشاء جلسة جديدة لمستخدم */
export async function createSession(
  user: UserRow,
  context?: { ip?: string | null; userAgent?: string | null },
): Promise<SessionData> {
  const sessionId = randomToken(32);
  const expiresAt = new Date(Date.now() + config.JWT_TTL_DAYS * 86_400_000);
  await query(
    `INSERT INTO sessions (id, user_id, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, user.id, context?.ip ?? null, (context?.userAgent ?? "").slice(0, 300), expiresAt.toISOString()],
  );
  const token = signToken({ sid: sessionId, uid: toBigNumber(user.id), tg: toBigNumber(user.telegram_id) });
  return {
    sessionId,
    token,
    user: toPublicUser(user),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * تسجيل الدخول عبر ويدجت تلجرام.
 * ملاحظة الأمان: منع إعادة استخدام (auth_date, hash) عبر تخزين بصمة الجلسة.
 */
export async function loginWithTelegram(
  data: TelegramAuthData,
  context?: { ip?: string | null; userAgent?: string | null },
): Promise<SessionData> {
  if (!verifyTelegramLogin(data)) {
    throw errors.unauthorized("بيانات تلجرام غير صالحة أو منتهية الصلاحية");
  }
  const replayKey = crypto
    .createHash("sha256")
    .update(`${data.id}:${data.auth_date}:${data.hash}`)
    .digest("hex");

  const user = await upsertTelegramUser({
    id: data.id,
    first_name: data.first_name,
    last_name: data.last_name,
    username: data.username,
    photo_url: data.photo_url,
  });
  if (user.is_banned) throw errors.banned();

  // سجل إعادة الاستخدام داخل جدول الجلسات كحماية إضافية (أول مرة فقط)
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM sessions WHERE id = $1",
    [`replay:${replayKey}`],
  );
  if (existing) throw errors.unauthorized("تم استخدام هذه البيانات سابقاً — أعد تحميل الصفحة");
  await query(
    `INSERT INTO sessions (id, user_id, ip, user_agent, expires_at, revoked_at)
     VALUES ($1, $2, $3, $4, now(), now())`,
    [`replay:${replayKey}`, user.id, context?.ip ?? null, (context?.userAgent ?? "").slice(0, 300)],
  );

  log.info("تسجيل دخول عبر تلجرام", { userId: user.id, telegramId: user.telegram_id, ip: context?.ip });
  return createSession(user, context);
}

/** التحقق من توكن وتحميل الجلسة */
export async function resolveSession(token: string): Promise<{ user: UserRow; sessionId: string } | null> {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, { issuer: "bitpoin", audience: "bitpoin-web" }) as {
      sid?: string;
      uid?: number;
    };
    if (!payload?.sid) return null;
    const session = await queryOne<{ id: string; user_id: string; expires_at: string; revoked_at: string | null }>(
      "SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE id = $1",
      [payload.sid],
    );
    if (!session || session.revoked_at) return null;
    if (new Date(session.expires_at).getTime() < Date.now()) return null;
    const user = await getUserById(session.user_id);
    if (!user || user.is_banned) return null;
    return { user, sessionId: session.id };
  } catch {
    return null;
  }
}

/** إبطال جلسة */
export async function revokeSession(sessionId: string): Promise<void> {
  await query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [sessionId]);
}

/** إبطال كل جلسات مستخدم */
export async function revokeAllSessions(userId: number | string): Promise<number> {
  const result = await queryOne<{ count: string }>(
    "WITH updated AS (UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING 1) SELECT count(*) FROM updated",
    [userId],
  );
  return toBigNumber(result?.count);
}

/**
 * دخول احتياطي للمدير بكلمة سر (عند تعذّر ويدجت تلجرام).
 * يبحث عن أول مدير في ADMIN_IDS تم تسجيله مسبقاً عبر البوت.
 */
export async function loginAdminWithPassword(
  password: string,
  context?: { ip?: string | null; userAgent?: string | null },
): Promise<SessionData> {
  if (!config.ADMIN_PASSWORD) throw errors.forbidden("الدخول الاحتياطي معطّل (ADMIN_PASSWORD غير مضبوط)");
  if (!timingSafeEqual(password, config.ADMIN_PASSWORD)) throw errors.unauthorized("كلمة المرور غير صحيحة");

  for (const adminTg of config.ADMIN_IDS) {
    const admin = await queryOne<UserRow>(
      "SELECT * FROM users WHERE telegram_id = $1 AND is_banned = false",
      [adminTg],
    );
    if (admin) {
      await query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.id]);
      const session = await createSession(admin, context);
      log.warn("دخول مدير بكلمة مرور احتياطية", { userId: admin.id, ip: context?.ip });
      return session;
    }
  }
  throw errors.notFound("لم يُسجّل أي مدير عبر البوت بعد — أرسل /start للبوت أولاً");
}

/**
 * دخول تجريبي (DEMO_MODE فقط، غير الإنتاج): ينشئ/يجلب حسابات عرض جاهزة
 * لمعاينة الواجهة دون الحاجة إلى دومين تلجرام مهيّأ.
 */
export async function loginDemo(
  kind: "user" | "admin",
  context?: { ip?: string | null; userAgent?: string | null },
): Promise<SessionData> {
  if (!config.DEMO_MODE) throw errors.forbidden("وضع العرض التجريبي معطّل");
  const telegramId = kind === "admin" ? config.ADMIN_IDS[0] ?? "123456789" : "880000001";
  const user = await upsertTelegramUser({
    id: telegramId,
    first_name: kind === "admin" ? "مدير BitPoin" : "لاعب تجريبي",
    username: kind === "admin" ? "btp_admin" : "btp_demo",
  });
  await query("UPDATE users SET role = $1 WHERE id = $2", [kind === "admin" ? "admin" : "user", user.id]);
  const fresh = await getUserById(user.id);
  return createSession(fresh!, context);
}

/** معلومات الحساب من الجلسة */
export async function getSessionUser(user: UserRow): Promise<PublicUser & { isAdmin: boolean }> {
  return { ...toPublicUser(user), isAdmin: userIsAdmin(user) };
}

/** إحصائيات الجلسات (للأدمن) */
export async function sessionStats(): Promise<{ active: number; today: number }> {
  const row = await queryOne<{ active: string; today: string }>(
    `SELECT count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now()) AS active,
            count(DISTINCT user_id) FILTER (WHERE created_at > now() - interval '24 hours' AND revoked_at IS NULL) AS today
     FROM sessions WHERE id NOT LIKE 'replay:%'`,
  );
  return { active: toBigNumber(row?.active), today: toBigNumber(row?.today) };
}

export type { PublicUser };
export type { TelegramUserPayload };
