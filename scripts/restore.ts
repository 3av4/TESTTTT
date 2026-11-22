/**
 * استعادة نسخة احتياطية:
 *   PostgreSQL: npm run db:restore -- backups/bitpoin-xxx.dump
 *   PGlite:     npm run db:restore -- backups/bitpoin-xxx.sql.gz
 *
 * تحذير: تُعيد بناء الجداول وتستبدل بياناتها — استخدمها على مسؤوليتك.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { config } from "../server/config.js";
import { getPool, closePool } from "../server/db.js";
import { logger } from "../server/logger.js";
import { startEmbeddedDatabase, stopEmbeddedDatabase } from "../server/pglite.js";

const log = logger.child("restore-cli");

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exit ${code}`))));
  });
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    log.error("مرر مسار النسخة: npm run db:restore -- backups/bitpoin-xxx.dump");
    process.exit(1);
  }
  const file = path.resolve(target);
  if (!fs.existsSync(file)) {
    log.error("الملف غير موجود", { file });
    process.exit(1);
  }

  await startEmbeddedDatabase();

  if (file.endsWith(".dump")) {
    if (config.useEmbeddedDb) {
      log.error("نسخ pg_dump لا تُستعاد على PGlite — استخدم نسخة .sql.gz");
      process.exit(1);
    }
    log.info("استعادة pg_dump", { file });
    await run("pg_restore", [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-acl",
      "--dbname",
      config.DATABASE_URL,
      "--verbose",
      file,
    ]);
  } else if (file.endsWith(".sql.gz")) {
    const sql = gunzipSync(fs.readFileSync(file)).toString("utf8");
    if (config.useEmbeddedDb) {
      log.info("استعادة SQL منطقي على PGlite");
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    } else {
      const temp = path.join(config.BACKUP_DIR, `restore-${Date.now()}.sql`);
      fs.writeFileSync(temp, sql);
      await run("psql", [config.DATABASE_URL, "--set", "ON_ERROR_STOP=1", "-f", temp]);
      fs.unlinkSync(temp);
    }
  } else {
    log.error("صيغة غير مدعومة (المدعوم: .dump و .sql.gz)");
    process.exit(1);
  }

  log.info("اكتملت الاستعادة ✅");
  await closePool();
  await stopEmbeddedDatabase();
  process.exit(0);
}

main().catch(async (error) => {
  log.error("فشل الاستعادة", { error: String(error) });
  await closePool().catch(() => undefined);
  await stopEmbeddedDatabase().catch(() => undefined);
  process.exit(1);
});
