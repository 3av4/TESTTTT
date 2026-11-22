/**
 * حدود معدل الطلبات — نافذة ثابتة مخزّنة في PostgreSQL (تعمل عبر عدة نسخ من التطبيق).
 * تُستخدم للـ API ولأوامر البوت.
 */
import type { NextFunction, Request, Response } from "express";
import { query } from "../db.js";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";

export interface RateLimitOptions {
  /** اسم الحد (يُخزَّن في المفتاح) */
  name: string;
  /** عدد الطلبات المسموح بها */
  limit: number;
  /** طول النافذة بالثواني */
  windowSeconds: number;
  /** الحصول على مفتاح التمييز (مستخدم/ip) */
  key?: (req: Request) => string;
  /** هل نُعيد خطأ أو نمرر دون تفعيل */
  skipIfDisabled?: boolean;
}

const log = logger.child("rate-limit");

/** فحص الحد وإرجاع { allowed, remaining, retryAfter } */
export async function checkRateLimit(
  name: string,
  subject: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; retryAfter: number; count: number }> {
  if (!config.RATE_LIMIT_ENABLED) return { allowed: true, remaining: limit, retryAfter: 0, count: 0 };
  const key = `${name}:${subject}`;
  try {
    const row = await query<{ window_start: string; count: number }>(
      `INSERT INTO rate_limits AS rl (limit_key, window_start, count)
       VALUES ($1, now(), 1)
       ON CONFLICT (limit_key) DO UPDATE SET
         count = CASE WHEN rl.window_start < now() - ($2 || ' seconds')::interval THEN 1 ELSE rl.count + 1 END,
         window_start = CASE WHEN rl.window_start < now() - ($2 || ' seconds')::interval THEN now() ELSE rl.window_start END
       RETURNING window_start, count`,
      [key, String(windowSeconds)],
    );
    const current = row[0];
    if (!current) return { allowed: true, remaining: limit, retryAfter: 0, count: 0 };
    const count = Number(current.count);
    const elapsed = (Date.now() - new Date(current.window_start).getTime()) / 1000;
    const retryAfter = Math.max(1, Math.ceil(windowSeconds - elapsed));
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), retryAfter, count };
  } catch (error) {
    // لا نُعطّل الخدمة إذا فشل تخزين الحدود
    log.warn("تعذر فحص حد المعدل", { error: String(error), name });
    return { allowed: true, remaining: limit, retryAfter: 0, count: 0 };
  }
}

/** ميدلوير Express */
export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const subject = options.key ? options.key(req) : req.ip ?? "unknown";
    const result = await checkRateLimit(options.name, subject, options.limit, options.windowSeconds);
    res.setHeader("X-RateLimit-Limit", String(options.limit));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfter));
      return next(
        new AppError("RATE_LIMITED", "عدد المحاولات كبير جداً — انتظر قليلاً ثم حاول مجدداً", {
          meta: { retryAfter: result.retryAfter },
        }),
      );
    }
    next();
  };
}

/** تنظيف السجلات المنتهية (مهمة دورية خفيفة) */
export async function cleanupRateLimits(): Promise<void> {
  await query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'").catch(() => undefined);
}

/** مفتاح التمييز حسب المستخدم المسجّل أو الـ IP */
function userKey(req: Request): string {
  const auth = (req as Request & { auth?: { user?: { id: number } } }).auth;
  return auth?.user?.id ? `u:${auth.user.id}` : `ip:${req.ip ?? "anon"}`;
}

/** حدود جاهزة */
export const limits = {
  login: rateLimit({ name: "login", limit: 10, windowSeconds: 60 }),
  api: rateLimit({ name: "api", limit: 120, windowSeconds: 60 }),
  write: rateLimit({ name: "write", limit: 40, windowSeconds: 60, key: userKey }),
  daily: rateLimit({ name: "daily", limit: 12, windowSeconds: 60, key: userKey }),
  games: rateLimit({ name: "games", limit: 30, windowSeconds: 60, key: userKey }),
  admin: rateLimit({ name: "admin", limit: 60, windowSeconds: 60 }),
};
