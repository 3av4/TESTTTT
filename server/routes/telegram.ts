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
 * GET /api/telegram/selftest — فحص تشخيصي كامل للبوت (يحتاج صلاحية أدمن).
 * يخبرك بالضبط أين المشكلة: توكن، شبكة، ويبهوك، أو صلاحيات.
 */
telegramRouter.get(
  "/selftest",
  asyncHandler(async (req, res) => {
    const { requireAdmin } = await import("../middleware/auth.js");
    await new Promise<void>((resolve, reject) => {
      requireAdmin(req, res, (error?: unknown) => (error ? reject(error) : resolve()));
    });

    const bot = await import("../bot/index.js");
    const { telegramApiRaw } = await import("../bot/telegramApi.js");
    const status = bot.getBotStatus();

    const steps: Array<{ name: string; ok: boolean; detail: string }> = [];

    // 1) التوكن
    steps.push({
      name: "BOT_TOKEN",
      ok: Boolean(config.BOT_TOKEN),
      detail: config.BOT_TOKEN ? `مضبوط (${config.BOT_TOKEN.split(":")[0]}:••••)` : "غير مضبوط!",
    });

    // 2) الوصول للشبكة + التحقق من البوت
    let me: { id: number; username?: string; first_name?: string } | null = null;
    try {
      const response = await telegramApiRaw<{ id: number; username?: string; first_name?: string }>("getMe");
      me = response.ok ? response.result ?? null : null;
      steps.push({
        name: "getMe",
        ok: response.ok,
        detail: response.ok
          ? `متصل: @${me?.username ?? "؟"} (${me?.id ?? 0})`
          : `فشل: ${response.description ?? "network_error"} — الخادم لا يستطيع الوصول إلى api.telegram.org`,
      });
    } catch (error) {
      steps.push({ name: "getMe", ok: false, detail: String(error) });
    }

    // 3) حالة الويبهوك
    if (me) {
      const info = await telegramApiRaw<{ url: string; pending_update_count: number; last_error_message?: string }>("getWebhookInfo");
      const url = info.result?.url ?? "";
      steps.push({
        name: "Webhook",
        ok: true,
        detail: url
          ? `مسجّل على ${url} · تحديثات معلّقة: ${info.result?.pending_update_count ?? 0}${info.result?.last_error_message ? ` · آخر خطأ: ${info.result.last_error_message}` : ""}`
          : "لا يوجد ويبهوك مسجّل (سيُستخدم polling)",
      });
    }

    // 4) حالة العملية
    steps.push({
      name: "حالة المعالج",
      ok: Boolean(status.running || status.initialized),
      detail: `mode=${config.TELEGRAM_WEBHOOK_URL ? "webhook" : "polling"} · running=${status.running} · updates=${status.updatesHandled}${status.startupError ? ` · آخر خطأ: ${status.startupError}` : ""}`,
    });

    const allOk = steps.every((step) => step.ok);
    const diagnosis = allOk
      ? "البوت سليم ومتصل بتلجرام. إن لم يستجب، تأكد من إرسال /start إلى البوت من حسابك."
      : !config.BOT_TOKEN
        ? "BOT_TOKEN غير مضبوط في .env — ضعه ثم أعد التشغيل."
        : !me
          ? "الخادم لا يستطيع الوصول إلى api.telegram.org. الحل: شغّل المشروع على سيرفر/VPS بوصول إنترنت كامل إلى تلجرام (بيئات المعاينة المعزولة تحجب تلجرام)، أو اضبط TELEGRAM_WEBHOOK_URL مع فتح المنفذ للعالم."
          : "البوت متصل لكن هناك مشكلة في التسجيل — راجع التفاصيل أعلاه.";

    res.json({ ok: allOk, data: { steps, diagnosis, botUsername: config.BOT_USERNAME || null } });
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
