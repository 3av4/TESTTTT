/**
 * نقطة انطلاق BitPoin:
 *  - Express (API + Webhook)
 *  - Next.js (الواجهة) على نفس الخادم والمنفذ
 *  - WebSocket لحظي على /ws
 *  - بوت تلجرام (Webhook أو Polling)
 *  - قاعدة البيانات (PostgreSQL أو PGlite المدمجة)
 *  - مهام دورية + نسخ احتياطي
 */
import { createServer } from "node:http";
import next from "next";
import { config } from "./server/config.js";
import { logger } from "./server/logger.js";
import { closePool, migrate } from "./server/db.js";
import { startEmbeddedDatabase, stopEmbeddedDatabase } from "./server/pglite.js";
import { realtime } from "./server/realtime.js";
import { bindRealtime } from "./server/services/events.js";
import { startBot, stopBot } from "./server/bot/index.js";
import { startBackupScheduler } from "./server/backup.js";
import { scheduler } from "./server/services/jobs.js";
import { createApp } from "./server/app.js";

const log = logger.child("server");

let shuttingDown = false;

async function main() {
  const startedAt = Date.now();
  log.info("بدء تشغيل BitPoin", { env: config.NODE_ENV, port: config.PORT });

  // 1) قاعدة البيانات
  const embedded = await startEmbeddedDatabase();
  if (embedded.started || embedded.port) {
    log.info("وضع قاعدة البيانات", { mode: "pglite", port: embedded.port });
  } else {
    log.info("وضع قاعدة البيانات", { mode: "postgresql" });
  }

  await migrate();

  // 2) البث اللحظي
  bindRealtime(realtime);

  // 3) Express API
  const expressApp = await createApp();

  // 4) Next.js
  const dev = !config.isProduction;
  const nextApp = next({ dev, dir: process.cwd(), hostname: "0.0.0.0", port: config.PORT });
  const handle = nextApp.getRequestHandler();
  await nextApp.prepare();
  log.info("تم تجهيز Next.js", { dev });

  // 5) الخادم الموحد
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/api") || req.url === "/healthz") {
      expressApp(req, res);
      return;
    }
    handle(req, res);
  });

  // 6) WebSocket
  realtime.attach(server);

  server.listen(config.PORT, "0.0.0.0", () => {
    log.info(`BitPoin يعمل على http://0.0.0.0:${config.PORT}`, { ms: Date.now() - startedAt });
    if (!config.isProduction) {
      log.info(`افتح المتصفح: ${config.APP_URL}`);
    }
  });

  // 7) البوت + المهام
  await startBot();
  scheduler.start(60_000);
  const backupTimer = startBackupScheduler();

  // 8) إغلاق نظيف
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info("إغلاق التطبيق", { signal });
    const force = setTimeout(() => {
      log.warn("إغلاق قسري بعد المهلة");
      process.exit(1);
    }, 15_000);
    force.unref();

    await stopBot().catch(() => undefined);
    scheduler.stop();
    if (backupTimer) clearInterval(backupTimer);
    await realtime.close().catch(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await closePool().catch(() => undefined);
    await stopEmbeddedDatabase().catch(() => undefined);
    log.info("تم الإغلاق بنجاح");
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    log.error("وعد مرفوض غير معالج", { reason: String(reason) });
  });
  process.on("uncaughtException", (error) => {
    log.error("استثناء غير معالج", { error: error.message, stack: error.stack?.split("\n").slice(0, 4) });
  });
}

main().catch(async (error) => {
  log.error("فشل بدء التشغيل", { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
  await stopEmbeddedDatabase().catch(() => undefined);
  await closePool().catch(() => undefined);
  process.exit(1);
});
