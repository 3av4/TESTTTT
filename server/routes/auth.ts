/**
 * مسارات المصادقة: دخول تلجرام، الجلسة، الخروج، دخول المدير الاحتياطي.
 */
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { errors } from "../errors.js";
import { asyncHandler } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { limits } from "../middleware/rateLimit.js";
import {
  getSessionUser,
  loginAdminWithPassword,
  loginDemo,
  loginWithTelegram,
  revokeSession,
} from "../services/auth.js";
import { audit } from "../services/audit.js";
import { upsertTelegramUser } from "../services/users.js";

export const authRouter = Router();

const telegramAuthSchema = z.object({
  id: z.union([z.number(), z.string()]).transform((value) => String(value)),
  first_name: z.string().max(64).optional(),
  last_name: z.string().max(64).optional(),
  username: z.string().max(32).optional(),
  photo_url: z.string().max(500).optional(),
  auth_date: z.union([z.number(), z.string()]),
  hash: z.string().regex(/^[a-fA-F0-9]{64}$/),
});

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.isProduction || config.APP_URL.startsWith("https://"),
    path: "/",
    maxAge: maxAgeSeconds * 1000,
  };
}

/** POST /api/auth/telegram — تسجيل الدخول عبر ويدجت تلجرام */
authRouter.post(
  "/telegram",
  limits.login,
  asyncHandler(async (req, res) => {
    const payload = telegramAuthSchema.parse(req.body ?? {});
    const session = await loginWithTelegram(payload, {
      ip: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.cookie(config.JWT_COOKIE, session.token, cookieOptions(config.JWT_TTL_DAYS * 86_400));
    await audit({
      actorId: session.user.id,
      actorLabel: `${session.user.firstName} (${session.user.telegramId})`,
      action: "login",
      targetType: "user",
      targetId: session.user.id,
      details: { method: "telegram" },
      ip: req.ip ?? null,
    });
    res.json({ ok: true, data: { user: session.user, sessionId: session.sessionId, expiresAt: session.expiresAt, token: session.token } });
  }),
);

/** POST /api/auth/admin-login — دخول احتياطي للمدير */
authRouter.post(
  "/admin-login",
  limits.login,
  asyncHandler(async (req, res) => {
    const { password } = z.object({ password: z.string().min(1).max(200) }).parse(req.body ?? {});
    const session = await loginAdminWithPassword(password, {
      ip: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
    });
    res.cookie(config.JWT_COOKIE, session.token, cookieOptions(config.JWT_TTL_DAYS * 86_400));
    await audit({
      actorId: session.user.id,
      actorLabel: "admin-password",
      action: "login_admin",
      targetType: "user",
      targetId: session.user.id,
      ip: req.ip ?? null,
    });
    res.json({ ok: true, data: { user: session.user, sessionId: session.sessionId, expiresAt: session.expiresAt, token: session.token } });
  }),
);

/** POST /api/auth/demo-login — دخول تجريبي (DEMO_MODE فقط) */
authRouter.post(
  "/demo-login",
  limits.login,
  asyncHandler(async (req, res) => {
    const { kind } = z.object({ kind: z.enum(["user", "admin"]).default("user") }).parse(req.body ?? {});
    const session = await loginDemo(kind, { ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null });
    res.cookie(config.JWT_COOKIE, session.token, cookieOptions(config.JWT_TTL_DAYS * 86_400));
    res.json({ ok: true, data: { user: session.user, sessionId: session.sessionId, expiresAt: session.expiresAt, token: session.token } });
  }),
);

/** GET /api/auth/me — جلب الجلسة الحالية */
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.auth!.user;
    // تحديث آخر ظهور
    const updated = await upsertTelegramUser({
      id: user.telegram_id,
      first_name: user.first_name ?? undefined,
      username: user.username ?? undefined,
      photo_url: user.photo_url ?? undefined,
    });
    res.json({ ok: true, data: await getSessionUser(updated) });
  }),
);

/** POST /api/auth/logout */
authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await revokeSession(req.auth!.sessionId);
    res.clearCookie(config.JWT_COOKIE, { path: "/" });
    res.json({ ok: true, data: { message: "تم تسجيل الخروج" } });
  }),
);

/** GET /api/auth/config — إعدادات الواجهة العامة (بوت، تسجيل الدخول) */
authRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    res.json({
      ok: true,
      data: {
        botUsername: config.BOT_USERNAME || null,
        telegramLoginEnabled: Boolean(config.BOT_TOKEN && config.BOT_USERNAME),
        adminPasswordLoginEnabled: Boolean(config.ADMIN_PASSWORD),
        demoMode: config.DEMO_MODE,
        environment: config.NODE_ENV,
        appUrl: config.APP_URL,
      },
    });
  }),
);

export { errors };
