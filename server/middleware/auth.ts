/**
 * ميدلوير المصادقة والحماية:
 *  - requireAuth: يتطلب جلسة صالحة (JWT في كوكي HttpOnly).
 *  - requireAdmin: يتطلب دور أدمن أو معرّف تلجرام في ADMIN_IDS.
 *  - optionalAuth: يحمّل المستخدم إن وُجد دون فرض تسجيل الدخول.
 */
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { errors } from "../errors.js";
import { resolveSession } from "../services/auth.js";
import { userIsAdmin, type UserRow } from "../services/users.js";
import { logger } from "../logger.js";

export interface AuthContext {
  user: UserRow;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const log = logger.child("auth-mw");

function readToken(req: Request): string | null {
  const fromCookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[config.JWT_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return null;
}

/** تحميل الجلسة إن وُجدت */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readToken(req);
    if (!token) return next();
    const session = await resolveSession(token);
    if (session) req.auth = session;
    next();
  } catch (error) {
    log.warn("فشل تحميل الجلسة", { error: String(error) });
    next();
  }
}

/** فرض تسجيل الدخول */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth?.user) return next(errors.unauthorized());
  if (req.auth.user.is_banned) return next(errors.banned());
  next();
}

/** فرض صلاحية الأدمن */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const user = req.auth?.user;
  if (!user) return next(errors.unauthorized());
  if (!userIsAdmin(user)) {
    log.warn("محاولة وصول غير مصرّح للوحة الأدمن", { userId: user.id, ip: req.ip });
    return next(errors.forbidden());
  }
  next();
}

/** حماية CSRF بسيطة: تحقق من Origin/Referer للطلبات المُعدِّلة */
export function sameOriginGuard(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.headers.origin ?? req.headers.referer ?? "";
  const allowedHosts = [(() => {
    try {
      return new URL(config.APP_URL).host;
    } catch {
      return "";
    }
  })()].filter(Boolean);
  const host = req.headers.host ?? "";
  if (!origin) {
    // بعض عملاء البوت/Alamari لا يرسلون Origin — نسمح إن كان الطلب يحمل توكن Bearer
    if (req.headers.authorization) return next();
    return next(errors.forbidden("طلب غير آمن: يجب أن يحمل Origin"));
  }
  try {
    const originHost = new URL(origin).host;
    if (originHost === host || allowedHosts.includes(originHost)) return next();
    // التحقق من Preview hosts
    if (originHost.endsWith(".e2b.app") || originHost.startsWith("localhost") || originHost.startsWith("127.0.0.1")) {
      return next();
    }
  } catch {
    // origin غير صالح
  }
  return next(errors.forbidden("المصدر غير مسموح"));
}
