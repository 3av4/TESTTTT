/**
 * تشغيل البوت فقط — بلا موقع ولا واجهة ولا منفذ HTTP.
 *
 * مفيد عندما يكون الموقع مستضافاً في بيئة تحجب api.telegram.org
 * (مثل بيئات المعاينة المعزولة) بينما لديك جهاز/VPS بوصول كامل لتلجرام:
 * شغّل هذا السكربت هناك، وسيستخدم **نفس قاعدة البيانات** عبر DATABASE_URL.
 *
 * التشغيل:
 *   DATABASE_URL=postgres://... BOT_TOKEN=... npx tsx scripts/bot-only.ts
 *
 * في هذه الحالة لا تستخدم PGlite (قاعدتها محلية داخل صندوق المعاينة)؛
 * بل قاعدة PostgreSQL حقيقية يشترك فيها الموقع والبوت.
 */
import { config } from "../server/config.js";
import { logger } from "../server/logger.js";
import { closePool, migrate } from "../server/db.js";
import { startEmbeddedDatabase, stopEmbeddedDatabase } from "../server/pglite.js";
import { startBot, stopBot, getBotStatus } from "../server/bot/index.js";
import { getWebhookInfo } from "../server/bot/telegramApi.js";

const log = logger.child("bot-only");

async function main() {
  log.info("بدء تشغيل البوت المستقل", {
    mode: config.TELEGRAM_WEBHOOK_URL ? "webhook" : "polling",
    database: config.DATABASE_URL.includes("127.0.0.1") ? "pglite/local" : "postgresql",
  });

  if (!config.BOT_TOKEN) {
    log.error("BOT_TOKEN غير مضبوط — لا يمكن تشغيل البوت.");
    process.exit(1);
  }

  // تشغيل قاعدة PGlite المدمجة إن لم يكن هناك Postgres خارجي.
  // بدونه يفشل الاتصال بـ 127.0.0.1:5432 (خطأ ECONNREFUSED).
  const embedded = await startEmbeddedDatabase();
  log.info("قاعدة البيانات جاهزة", {
    mode: embedded.started || embedded.port ? "pglite" : "postgresql",
  });

  await migrate();
  await startBot();

  // انتظار قصير ثم تقرير الحالة الفعلي
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const status = getBotStatus();
  if (status.startupError) {
    log.error("البوت لم يتصل بتلجرام", {
      error: status.startupError,
      check: "شغّل: curl https://api.telegram.org/bot<TOKEN>/getMe",
    });
  } else {
    log.info("البوت يعمل بنجاح", { running: status.running, polling: status.polling });
  }

  const info = await getWebhookInfo().catch(() => null);
  if (info?.result) {
    const details = info.result as { url?: string; pending_update_count?: number };
    log.info("حالة الويبهوك", { url: details.url || "لا يوجد", pending: details.pending_update_count ?? 0 });
  }

  const shutdown = async (signal: string) => {
    log.info("إيقاف البوت", { signal });
    await stopBot().catch(() => undefined);
    await closePool().catch(() => undefined);
    await stopEmbeddedDatabase().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch(async (error) => {
  log.error("فشل تشغيل البوت المستقل", { error: String(error) });
  await closePool().catch(() => undefined);
  await stopEmbeddedDatabase().catch(() => undefined);
  process.exit(1);
});
