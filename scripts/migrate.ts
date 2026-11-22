/**
 * ترحيل قاعدة البيانات: npm run db:migrate
 * يدعم PGlite المدمج (بدون DATABASE_URL) و PostgreSQL حقيقي.
 */
import { config } from "../server/config.js";
import { closePool, migrate } from "../server/db.js";
import { logger } from "../server/logger.js";
import { startEmbeddedDatabase, stopEmbeddedDatabase } from "../server/pglite.js";

const log = logger.child("migrate");

async function main() {
  log.info("بدء الترحيل", { mode: config.useEmbeddedDb ? "pglite" : "postgresql" });
  await startEmbeddedDatabase();
  await migrate({ seed: true });
  log.info("اكتمل الترحيل بنجاح");
  await closePool();
  await stopEmbeddedDatabase();
  process.exit(0);
}

main().catch(async (error) => {
  log.error("فشل الترحيل", { error: error instanceof Error ? error.message : String(error) });
  await closePool().catch(() => undefined);
  await stopEmbeddedDatabase().catch(() => undefined);
  process.exit(1);
});
