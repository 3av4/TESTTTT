/**
 * نسخة احتياطية يدوية: npm run db:backup
 */
import { runBackup, listBackups } from "../server/backup.js";
import { closePool } from "../server/db.js";
import { logger } from "../server/logger.js";
import { startEmbeddedDatabase, stopEmbeddedDatabase } from "../server/pglite.js";

const log = logger.child("backup-cli");

async function main() {
  await startEmbeddedDatabase();
  const result = await runBackup({ manual: true });
  if (!result.ok) {
    log.error("فشل النسخ الاحتياطي", { error: result.error });
    process.exitCode = 1;
  } else {
    log.info("تم إنشاء النسخة", { file: result.file, bytes: result.bytes, mode: result.mode });
  }
  console.table(await listBackups());
  await closePool();
  await stopEmbeddedDatabase();
  process.exit(process.exitCode ?? 0);
}

main().catch(async (error) => {
  log.error("خطأ", { error: String(error) });
  await stopEmbeddedDatabase().catch(() => undefined);
  process.exit(1);
});
