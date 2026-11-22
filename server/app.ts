/**
 * تطبيق Express: الأمان، الـ parsers، الراوتات، معالجة الأخطاء.
 * ملاحظة: Next.js يملك الصفحات، و Express يملك /api/* و /ws فقط.
 */
import express, { type Express } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { optionalAuth, sameOriginGuard } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { authRouter } from "./routes/auth.js";
import { userRouter } from "./routes/user.js";
import { publicRouter } from "./routes/public.js";
import { gamesRouter } from "./routes/gameRoutes.js";
import { shopRouter } from "./routes/shopRoutes.js";
import { coinsRouter } from "./routes/coins.js";
import { adminRouter } from "./routes/admin.js";
import { telegramRouter } from "./routes/telegram.js";
import { healthCheck } from "./db.js";
import { realtime } from "./realtime.js";
import { createBot } from "./bot/index.js";

const log = logger.child("express");

export async function createApp(): Promise<Express> {
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY) app.set("trust proxy", 1);

  // ملاحظة: البوت يحتاج payload كبيراً نسبياً لبعض التحديثات فقط (نص عادةً صغير)
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "64kb" }));
  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      frameguard: false,
    }),
  );

  // رأس موحّد + تتبع
  app.use((req, res, next) => {
    res.setHeader("X-BitPoin", "BTP/1.0");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // الصحة (بدون حد معدل)
  app.get("/healthz", async (_req, res) => {
    const db = await healthCheck();
    res.status(db ? 200 : 503).json({
      ok: db,
      data: { db, uptime: Math.round(process.uptime()), env: config.NODE_ENV, realtime: realtime.stats() },
    });
  });

  app.get("/api/health", async (_req, res) => {
    const db = await healthCheck();
    res.status(db ? 200 : 503).json({ ok: db, data: { db, uptime: Math.round(process.uptime()) } });
  });

  // تحميل الجلسة اختيارياً لكل مسارات API
  app.use("/api", optionalAuth);
  app.use("/api", rateLimit({ name: "api-global", limit: 300, windowSeconds: 60 }));

  // الراوتات
  app.use("/api/auth", authRouter);
  app.use("/api/user", userRouter);
  app.use("/api/games", gamesRouter);
  app.use("/api/shop", shopRouter);
  app.use("/api/coins", coinsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/telegram", telegramRouter);
  app.use("/api", publicRouter);

  // حماية CSRF للطلبات المُعدِّلة (بعد راوتات الويبهوك لتجنب تعارضها)
  app.use("/api", sameOriginGuard);

  app.use("/api", notFoundHandler);

  // معالج الأخطاء المركزي — يجب أن يكون آخر ما يُسجَّل على التطبيق
  app.use(errorHandler);

  // تهيئة البوت مبكراً حتى تكون إشعارات تلجرام جاهزة
  void createBot().catch((error) => log.warn("تعذر تهيئة البوت مبكراً", { error: String(error) }));

  log.info("تم تجهيز تطبيق Express");
  return app;
}

/** متوافق مع الاستدعاء القديم — المعالج مُسجَّل بالفعل داخل createApp */
export function attachErrorHandler(app: Express): void {
  void app;
}
