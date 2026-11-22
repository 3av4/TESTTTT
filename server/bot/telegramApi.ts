/**
 * عميل Bot API خفيف — للإرسال المباشر (إشعارات) والتحقق من التوكن وتحميل بيانات المستخدم.
 * grammY يستخدم apiThrottler داخلياً؛ هذا العميل للرسائل خارج سياق التحديثات.
 */
import { config } from "../config.js";
import { logger } from "../logger.js";

const log = logger.child("tg-api");

const API_BASE = "https://api.telegram.org";
const TIMEOUT_MS = 10_000;

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number; migrate_to_chat_id?: number };
}

/** استدعاء خام لأي دالة في Bot API — للفحص التشخيصي */
export async function telegramApiRaw<T>(method: string, payload?: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
  return call<T>(method, payload);
}

async function call<T>(method: string, payload?: Record<string, unknown>): Promise<TelegramApiResponse<T>> {
  if (!config.BOT_TOKEN) return { ok: false, description: "BOT_TOKEN غير مضبوط" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/bot${config.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
    const json = (await response.json()) as TelegramApiResponse<T>;
    if (!json.ok) {
      log.debug("فشل استدعاء Bot API", { method, description: json.description, code: json.error_code });
    }
    return json;
  } catch (error) {
    log.warn("خطأ في اتصال Bot API", { method, error: String(error) });
    return { ok: false, description: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** إرسال رسالة HTML */
export async function sendHtml(
  chatId: number | string,
  html: string,
  options?: { silent?: boolean; replyMarkup?: unknown; disablePreview?: boolean },
): Promise<boolean> {
  const result = await call("sendMessage", {
    chat_id: chatId,
    text: html.slice(0, 4000),
    parse_mode: "HTML",
    disable_web_page_preview: options?.disablePreview ?? true,
    disable_notification: options?.silent ?? false,
    ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
  });
  return result.ok;
}

/** تحميل معلومات المستخدم (للتحديث/التحقق) */
export async function getChat(chatId: number | string): Promise<TelegramApiResponse<Record<string, unknown>>> {
  return call("getChat", { chat_id: chatId });
}

/** معلومات البوت واسم المستخدم الحقيقي */
export async function getMe(): Promise<TelegramApiResponse<{ id: number; username: string; first_name: string }>> {
  return call("getMe");
}

/** تعيين ويبهوك */
export async function setWebhook(url: string, secretToken?: string): Promise<TelegramApiResponse<boolean>> {
  return call("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "edited_message", "callback_query", "chat_member", "my_chat_member"],
    drop_pending_updates: true,
  });
}

/** حذف ويبهوك */
export async function deleteWebhook(): Promise<TelegramApiResponse<boolean>> {
  return call("deleteWebhook", { drop_pending_updates: true });
}

/** معلومات الويبهوك */
export async function getWebhookInfo(): Promise<TelegramApiResponse<Record<string, unknown>>> {
  return call("getWebhookInfo");
}

/** إرسال صورة */
export async function sendPhoto(chatId: number | string, photo: string, caption?: string): Promise<boolean> {
  const result = await call("sendPhoto", {
    chat_id: chatId,
    photo,
    caption: caption?.slice(0, 900),
    parse_mode: "HTML",
  });
  return result.ok;
}

export { call as telegramCall };
