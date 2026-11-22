/**
 * تسجيل ويبهوك تلجرام:
 *   npm run bot:setup -- --url https://example.com
 * يُستخدم WEBHOOK_SECRET من .env (وإن لم يوجد يُولَّد ويُطبع — احفظه في .env).
 */
import crypto from "node:crypto";
import { config } from "../server/config.js";
import { setWebhook, getWebhookInfo, getMe } from "../server/bot/telegramApi.js";
import { logger } from "../server/logger.js";

const log = logger.child("webhook-setup");

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function main() {
  const base = (argValue("--url") ?? config.APP_URL).replace(/\/+$/, "");
  if (!base.startsWith("https://")) {
    log.error("تلجرام يتطلب رابط https عاماً. مرّر --url https://your-domain");
    process.exit(1);
  }
  const secret = config.WEBHOOK_SECRET || crypto.randomBytes(24).toString("hex");
  if (!config.WEBHOOK_SECRET) {
    log.warn("WEBHOOK_SECRET غير مضبوط — استخدم هذا السر واحفظه في .env:", { secret });
  }

  const me = await getMe();
  if (!me.ok) {
    log.error("توكن البوت غير صالح أو لا يوجد اتصال بتلجرام", { description: me.description });
    process.exit(1);
  }
  log.info("البوت", { username: me.result?.username, id: me.result?.id });

  const url = `${base}/api/telegram/webhook/${secret}`;
  const result = await setWebhook(url, secret);
  if (!result.ok) {
    log.error("فشل تسجيل الويبهوك", { description: result.description });
    process.exit(1);
  }
  log.info("تم تسجيل الويبهوك ✅", { url: url.replace(secret, "***") });

  const info = await getWebhookInfo();
  console.log(JSON.stringify(info.result, null, 2));
  log.info("لتشغيل وضع الويبهوك: اضبط TELEGRAM_WEBHOOK_URL=" + base + " و WEBHOOK_SECRET في .env ثم أعد تشغيل الخادم");
}

main().catch((error) => {
  log.error("خطأ", { error: String(error) });
  process.exit(1);
});
