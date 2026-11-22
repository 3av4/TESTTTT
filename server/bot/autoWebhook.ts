/**
 * تسجيل الويبهوك تلقائياً عند الإقلاع.
 *
 * المشكلة التي يحلّها: على Render (الخطة المجانية) لا يوجد Shell، فلا يمكن
 * تشغيل `npm run webhook:set`. وكان البوت يبقى صامتاً حتى يضبط المستخدم
 * TELEGRAM_WEBHOOK_URL يدوياً.
 *
 * الحل: عند الإقلاع، إن كان لدينا رابط عام (APP_URL أو RENDER_EXTERNAL_URL)
 * وتوكن بوت، نسجّل الويبهوك بأنفسنا. لا حاجة لأي خطوة يدوية.
 *
 * الحماية:
 *  • لا يعمل إلا في الإنتاج أو عند وجود رابط https عام.
 *  • لا يعمل مع localhost (تلجرام يرفض غير https).
 *  • إن فشل، لا يمنع الإقلاع — يُسجّل تحذيراً ويكمل (قد يكون الشبكة محجوبة).
 */
import { config } from "../config.js";
import { logger } from "../logger.js";
import { setWebhook, getWebhookInfo } from "./telegramApi.js";

const log = logger.child("auto-webhook");

/** هل الرابط صالح لتلجرام؟ */
function isPublicHttps(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  try {
    const { hostname } = new URL(url);
    return Boolean(hostname) && hostname !== "localhost" && hostname !== "127.0.0.1" && !hostname.endsWith(".local");
  } catch {
    return false;
  }
}

/**
 * يسجّل الويبهوك إن لزم.
 * @returns true إذا أصبح الويبهوك مضبوطاً (سجّلناه الآن أو كان مطابقاً).
 */
export async function ensureWebhookRegistered(): Promise<boolean> {
  if (!config.BOT_TOKEN) return false;

  const base = config.APP_URL.replace(/\/+$/, "");
  if (!isPublicHttps(base)) {
    log.info("تخطّي تسجيل الويبهوك — الرابط ليس https عاماً", { appUrl: base });
    return false;
  }

  const secret = config.WEBHOOK_SECRET;
  if (!secret) {
    log.warn("WEBHOOK_SECRET غير مضبوط — لا يمكن تسجيل ويبهوك آمن");
    return false;
  }

  const expected = `${base}/api/telegram/webhook/${secret}`;

  // 1) هل الويبهوك مسجّل بنفس الرابط؟
  try {
    const info = await getWebhookInfo();
    const current = typeof info.result?.url === "string" ? info.result.url : "";
    if (info.ok && current === expected) {
      log.info("الويبهوك مسجّل مسبقاً ومطابق", { url: expected.slice(0, 56) + "…" });
      return true;
    }
    if (info.ok && current && current !== expected) {
      log.info("الويبهوك القديم لا يطابق — سيُستبدل", { old: current.slice(0, 56) + "…" });
    }
  } catch (error) {
    // لا نعرف الحالة — نحاول التسجيل على أي حال
    log.warn("تعذّر قراءة حالة الويبهوك", { error: error instanceof Error ? error.message : String(error) });
  }

  // 2) التسجيل
  const result = await setWebhook(expected, secret);
  if (result.ok) {
    log.info("✔ تم تسجيل الويبهوك تلقائياً", { url: expected.slice(0, 56) + "…" });
    return true;
  }

  log.error("فشل تسجيل الويبهوك تلقائياً", {
    reason: result.description ?? "غير معروف",
    hint: "تحقق أن الرابط العام يصل إلى هذا الخادم وأن التوكن صحيح",
  });
  return false;
}
