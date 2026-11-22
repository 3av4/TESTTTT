/**
 * تهيئة بوت تلجرام (grammY):
 *  - Webhook على نفس السيرفر (الإنتاج) أو Long Polling (تطوير).
 *  - ربط إشعارات الخدمات بتلجرام (registerTelegramSender).
 *  - لا يحتوي أي منطق مالي — كل شيء عبر الخدمات المشتركة.
 */
import { Bot, type Context } from "grammy";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { Update } from "grammy/types";
import { registerTelegramSender } from "../services/notifications.js";
import { getBotStatus as statusOf, markRunning, markStopped, markError, markLastUpdate, clearError } from "./state.js";
import { setupMiddleware } from "./middleware.js";
import { registerCommands } from "./commands/index.js";
import { registerCallbacks } from "./callbacks.js";
import { sendHtml } from "./telegramApi.js";

const log = logger.child("bot");

let bot: Bot | null = null;

/** إنشاء البوت (مرة واحدة) */
export async function createBot(): Promise<Bot | null> {
  if (bot) return bot;
  if (!config.BOT_TOKEN) {
    log.warn("BOT_TOKEN غير مضبوط — لن يعمل البوت");
    return null;
  }

  bot = new Bot(config.BOT_TOKEN, {
    client: {
      canUseWebhookReply: () => false,
      timeoutSeconds: 30,
      // نستخدم fetch العالمي بدل shim الخاص بـ grammY ليتوافق مع اعتراض المحاكي
      // ويلغي أي اعتماد على node-fetch القديم (يدعم AbortSignal الأصلي).
      fetch: ((input: never, init?: never) => globalThis.fetch(input, init)) as never,
    },
  });

  setupMiddleware(bot);
  registerCommands(bot);
  registerCallbacks(bot);

  bot.catch((error) => {
    const ctx = error.ctx;
    const err = error.error;
    log.error("خطأ في معالجة تحديث البوت", {
      updateId: ctx.update.update_id,
      chatId: ctx.chat?.id,
      error: err instanceof Error ? err.message : String(err),
    });
    // إبلاغ المستخدم عند الأخطاء الحقيقية فقط (وليس أخطاء التحقق المتوقعة)
    void ctx
      .reply("⚠️ حدث خطأ غير متوقع. حاول مجدداً بعد قليل.")
      .catch(() => undefined);
  });

  // معالجة أخطاء الاتصال في polling (مع كبح الضجيج في السجلات)
  let lastNetworkWarningAt = 0;
  bot.api.config.use(async (prev, method, payload, signal) => {
    try {
      const result = await prev(method, payload, signal);
      // نجاح الاتصال يُلغي حالة الخطأ السابقة
      if (method !== "getUpdates" && statusOf().startupError) clearError();
      return result;
    } catch (error) {
      if (method === "getUpdates") return { ok: true, result: [] } as never;
      const now = Date.now();
      const offline = /fetch|network|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|abort|ECONN/i.test(String(error));
      if (offline) {
        // تلجرام غير متاح: تنبيه مرة كل 30 ثانية فقط حتى لا تُغرق السجلات
        if (now - lastNetworkWarningAt > 30_000) {
          lastNetworkWarningAt = now;
          log.warn("تعذّر الوصول إلى api.telegram.org — البوت لن يستقبل تحديثات حتى يُسمح بالشبكة", {
            method,
            hint: "تحقق من اتصال الخادم الخارجي أو استخدم سيرفراً بوصول مباشر لتلجرام",
          });
        }
        markError("تعذّر الوصول إلى api.telegram.org");
      } else {
        log.warn("فشل استدعاء API البوت", { method, error: String(error) });
      }
      throw error;
    }
  });

  // ربط إشعارات تلجرام
  registerTelegramSender(async (chatId, html) => sendHtml(chatId, html, { disablePreview: true }));

  try {
    const me = await bot.api.getMe();
    if (!config.BOT_USERNAME) {
      process.env.BOT_USERNAME = me.username;
      log.info("اسم البوت من تلجرام", { username: me.username });
    }
    log.info("تم تهيئة البوت", { username: me.username, id: me.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markError(message);
    log.warn("تعذر الاتصال بتلجرام عند الإقلاع (سيُعاد المحاولة)", { error: message });
  }

  return bot;
}

/** بدء البوت: webhook إن ضُبط رابط عام، وإلا polling للتطوير */
export async function startBot(): Promise<void> {
  const instance = await createBot();
  if (!instance) return;

  if (config.TELEGRAM_WEBHOOK_URL) {
    // نستخدم راوت Express لاستقبال التحديثات (npm run bot:setup لتسجيل الرابط)
    markRunning("webhook");
    log.info("البوت يعمل بوضع Webhook", { endpoint: "/api/telegram/webhook/:secret" });
    return;
  }

  if (config.isProduction) {
    log.warn("لا يوجد TELEGRAM_WEBHOOK_URL في الإنتاج — سيتم استخدام polling (غير مُوصى به).");
  }

  // منع تشغيل polling إن كان هناك ويبهوك مسجل على تلجرام
  try {
    const info = await instance.api.getWebhookInfo();
    if (info.url) {
      log.warn("يوجد ويبهوك مسجّل على تلجرام — لن يبدأ polling. احذفه بـ npm run bot:delete أو اضبط TELEGRAM_WEBHOOK_URL", { url: info.url });
      markRunning("webhook");
      return;
    }
  } catch {
    // تجاهل — نحاول polling على أي حال
  }

  markRunning("polling");
  void instance
    .start({
      drop_pending_updates: false,
      allowed_updates: ["message", "edited_message", "callback_query", "chat_member", "my_chat_member"],
      onStart: (info) => log.info("بدأ البوت بـ polling", { username: info.username }),
    })
    .catch((error) => {
      markStopped();
      markError(error instanceof Error ? error.message : String(error));
      log.error("توقف polling", { error: error instanceof Error ? error.message : String(error) });
    });
}

/** معالج تحديثات الويبهوك (يُستدعى من راوت Express) */
export async function handleWebhookUpdate(update: unknown): Promise<void> {
  const instance = await createBot();
  if (!instance) return;
  markLastUpdate();
  try {
    await instance.handleUpdate(update as Update);
  } catch (error) {
    log.error("فشل معالجة تحديث ويبهوك", { error: String(error) });
  }
}

/** إيقاف البوت */
export async function stopBot(): Promise<void> {
  if (bot) {
    try {
      await bot.stop();
    } catch {
      // ignore
    }
  }
  markStopped();
}

/** حالة البوت للتشخيص */
export function getBotStatus() {
  return { ...statusOf(), initialized: Boolean(bot) };
}

/** جلب بيانات مستخدم تلجرام مباشرة (لوحة الأدمن) */
export async function fetchTelegramProfile(telegramId: number | string) {
  if (!config.BOT_TOKEN) return null;
  const { getChat } = await import("./telegramApi.js");
  const response = await getChat(telegramId);
  if (!response.ok || !response.result) return null;
  const result = response.result as {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    photo?: { small_file_id: string };
  };
  return {
    id: result.id,
    first_name: result.first_name,
    last_name: result.last_name,
    username: result.username,
  };
}

/** الحصول على نسخة البوت (للأوامر التي تحتاج API مباشرة) */
export function getBot(): Bot | null {
  return bot;
}

export type BotContext = Context;
