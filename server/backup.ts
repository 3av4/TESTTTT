/**
 * النسخ الاحتياطي:
 *  - PostgreSQL حقيقي: pg_dump بصيغة custom (قابل للاستعادة بـ pg_restore).
 *  - PGlite: لقطة مجلد البيانات (tar.gz) أو تصدير SQL منطقي.
 *  - الاحتفاظ بآخر BACKUP_KEEP نسخة، وحذف الأقدم.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { query } from "./db.js";

const log = logger.child("backup");

export interface BackupResult {
  ok: boolean;
  file?: string;
  bytes?: number;
  mode: "pg_dump" | "pglite-data" | "sql";
  error?: string;
  startedAt: string;
  durationMs: number;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

/** تشغيل pg_dump (يتطلب أداة pg_dump في PATH) */
function runPgDump(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["--format=custom", "--no-owner", "--no-acl", "--file", filePath, config.DATABASE_URL];
    const child = spawn("pg_dump", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk).slice(0, 2000);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("انتهت مهلة pg_dump (120 ثانية)"));
    }, 120_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`pg_dump exit ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });
}

/** نسخة منطقية SQL (تعمل مع PGlite بدون أدوات خارجية) */
async function dumpLogicalSql(): Promise<string> {
  const tables = [
    "system_settings",
    "shop_items",
    "redeem_codes",
    "users",
    "transactions",
    "games",
    "purchases",
    "code_redemptions",
    "loans",
    "referral_claims",
    "notifications",
    "audit_logs",
    "group_settings",
    "sessions",
  ];
  const parts: string[] = [
    `-- BitPoin logical backup ${new Date().toISOString()}`,
    "SET client_min_messages = warning;",
    "BEGIN;",
    // ترتيب الحذف معكوس لاحترام المفاتيح الأجنبية
    ...tables.slice().reverse().map((table) => `DELETE FROM ${table};`),
  ];

  for (const table of tables) {
    const rows = await query<Record<string, unknown>>(`SELECT * FROM ${table}`);
    for (const row of rows) {
      const columns = Object.keys(row);
      const values = columns.map((column) => {
        const value = row[column];
        if (value === null || value === undefined) return "NULL";
        if (typeof value === "number") return String(value);
        if (typeof value === "boolean") return value ? "true" : "false";
        if (value instanceof Date) return `'${value.toISOString()}'`;
        if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
        return `'${String(value).replace(/'/g, "''")}'`;
      });
      parts.push(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")});`);
    }
  }
  parts.push("COMMIT;");
  return parts.join("\n");
}

/** حذف النسخ القديمة بما يزيد عن الحد */
async function pruneOldBackups(dir: string): Promise<void> {
  try {
    const files = (await fsp.readdir(dir))
      .filter((file) => file.startsWith("bitpoin-") && (file.endsWith(".dump") || file.endsWith(".sql.gz") || file.endsWith(".tar.gz")))
      .sort();
    const excess = files.length - config.BACKUP_KEEP;
    for (let i = 0; i < excess; i++) {
      await fsp.unlink(path.join(dir, files[i]!)).catch(() => undefined);
    }
    if (excess > 0) log.info("حُذفت نسخ احتياطية قديمة", { count: excess });
  } catch {
    // لا شيء
  }
}

/** إنشاء نسخة احتياطية */
export async function runBackup(options?: { manual?: boolean }): Promise<BackupResult> {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  await ensureDir(config.BACKUP_DIR);

  const stamp = timestamp();
  try {
    let file: string;
    let mode: BackupResult["mode"];

    if (config.useEmbeddedDb) {
      // PGlite: تصدير SQL منطقي مضغوط
      file = path.join(config.BACKUP_DIR, `bitpoin-${stamp}.sql.gz`);
      const sql = await dumpLogicalSql();
      await fsp.writeFile(file, gzipSync(Buffer.from(sql, "utf8")));
      mode = "sql";
    } else {
      file = path.join(config.BACKUP_DIR, `bitpoin-${stamp}.dump`);
      mode = "pg_dump";
      try {
        await runPgDump(file);
      } catch (error) {
        // في حال عدم توفر pg_dump نرجع للتصدير المنطقي
        log.warn("فشل pg_dump، سيتم استخدام التصدير المنطقي", { error: String(error) });
        file = path.join(config.BACKUP_DIR, `bitpoin-${stamp}.sql.gz`);
        const sql = await dumpLogicalSql();
        await fsp.writeFile(file, gzipSync(Buffer.from(sql, "utf8")));
        mode = "sql";
      }
    }

    const stat = await fsp.stat(file);
    await query(
      `INSERT INTO audit_logs (actor_id, actor_label, action, target_type, target_id, details)
       VALUES (NULL, $1, 'backup', 'database', $2, $3)`,
      [options?.manual ? "admin-manual" : "scheduler", file, JSON.stringify({ bytes: stat.size, mode })],
    ).catch(() => undefined);
    await pruneOldBackups(config.BACKUP_DIR);

    const result: BackupResult = {
      ok: true,
      file,
      bytes: stat.size,
      mode,
      startedAt,
      durationMs: Date.now() - start,
    };
    log.info("اكتملت النسخة الاحتياطية", result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("فشل النسخ الاحتياطي", { error: message });
    return { ok: false, error: message, mode: config.useEmbeddedDb ? "sql" : "pg_dump", startedAt, durationMs: Date.now() - start };
  }
}

/** قائمة النسخ الاحتياطية */
export async function listBackups(): Promise<Array<{ file: string; bytes: number; createdAt: string }>> {
  await ensureDir(config.BACKUP_DIR);
  const files = await fsp.readdir(config.BACKUP_DIR);
  const out: Array<{ file: string; bytes: number; createdAt: string }> = [];
  for (const name of files.filter((file) => file.startsWith("bitpoin-"))) {
    const full = path.join(config.BACKUP_DIR, name);
    try {
      const stat = await fsp.stat(full);
      if (stat.isFile()) out.push({ file: name, bytes: stat.size, createdAt: stat.mtime.toISOString() });
    } catch {
      // ignore
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** جدولة النسخ الاحتياطي التلقائي */
export function startBackupScheduler(): NodeJS.Timeout | null {
  if (!config.BACKUP_ENABLED) {
    log.info("النسخ الاحتياطي التلقائي معطّل (BACKUP_ENABLED=false)");
    return null;
  }
  fs.mkdirSync(config.BACKUP_DIR, { recursive: true });
  const intervalMs = Math.max(1, config.BACKUP_INTERVAL_HOURS) * 3_600_000;
  const timer = setInterval(() => {
    runBackup().catch((error) => log.error("خطأ في النسخ الاحتياطي المجدول", { error: String(error) }));
  }, intervalMs);
  timer.unref?.();
  log.info("جُدول النسخ الاحتياطي التلقائي", { everyHours: config.BACKUP_INTERVAL_HOURS, dir: config.BACKUP_DIR });
  return timer;
}
