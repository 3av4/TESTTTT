/**
 * ويبهوك تلجرام — يستقبل تحديثات البوت على نفس السيرفر.
 * المسار محمي بسر في الرابط (WEBHOOK_SECRET) والمصادقة مزدوجة عبر
 * X-Telegram-Bot-Api-Secret-Token.
 */
import { Router } from "express";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { timingSafeEqual } from "../utils.js";
import { asyncHandler } from "../middleware/error.js";
import { AppError } from "../errors.js";

const log = logger.child("telegram-webhook");

export const telegramRouter = Router();

/** حالة الويبهوك (للتشخيص — لا يكشف أي أسرار) */
telegramRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const bot = await import("../bot/index.js");
    res.json({
      ok: true,
      data: {
        configured: Boolean(config.TELEGRAM_WEBHOOK_URL),
        mode: config.TELEGRAM_WEBHOOK_URL ? "webhook" : "polling",
        botUsername: config.BOT_USERNAME || null,
        ...bot.getBotStatus(),
      },
    });
  }),
);

/**
 * POST /api/telegram/webhook/:secret
 * ملاحظة: نُجيب 200 دائماً لتلجرام حتى لا يُعيد المحاولة عند أخطاء منطقية،
 * لكن نُسجّل الخطأ.
 */
telegramRouter.post(
  "/webhook/:secret",
  asyncHandler(async (req, res) => {
    const { secret } = req.params;
    const headerSecret = String(req.headers["x-telegram-bot-api-secret-token"] ?? "");

    const validPath = Boolean(config.WEBHOOK_SECRET) && timingSafeEqual(secret, config.WEBHOOK_SECRET);
    const validHeader = !config.WEBHOOK_SECRET || timingSafeEqual(headerSecret, config.WEBHOOK_SECRET);

    if (!validPath || !validHeader) {
      log.warn("محاولة ويبهوك غير مصرّح بها", { ip: req.ip });
      throw new AppError("UNAUTHORIZED", "ويبهوك غير مصرّح به");
    }

    const bot = await import("../bot/index.js");
    try {
      await bot.handleWebhookUpdate(req.body);
    } catch (error) {
      log.error("فشل معالجة تحديث تلجرام", { error: String(error) });
    }
    res.json({ ok: true });
  }),
);
