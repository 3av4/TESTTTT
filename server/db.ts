/**
 * طبقة قاعدة البيانات: Pool مشترك + مساعد Transaction + ترحيل المخطط.
 * كل استعلام مالي يجب أن يمرّ عبر withTransaction لضمان الذرّية.
 */
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";

const log = logger.child("db");

let pool: Pool | null = null;

/** نقطة وصول واحدة للـ Pool */
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: Number.parseInt(process.env.PG_POOL_MAX ?? "12", 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      application_name: "bitpoin",
      // PGlite Socket لا يدعم SSL, وPostgreSQL المُدار يتطلب sslmode في الرابط
      ssl: /sslmode=(require|verify-ca|verify-full)/.test(config.DATABASE_URL)
        ? { rejectUnauthorized: false }
        : undefined,
    });
    pool.on("error", (error) => log.error("خطأ في اتصال قاعدة البيانات الآمن", { error: error.message }));
    log.info("تم تهيئة Pool قاعدة البيانات", {
      host: (() => {
        try {
          return new URL(config.DATABASE_URL).host;
        } catch {
          return "unknown";
        }
      })(),
      embedded: config.useEmbeddedDb,
    });
  }
  return pool;
}

/** استعلام واحد عبر Pool */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as never[]);
  return result.rows;
}

/** استعلام يتوقع صفاً واحداً أو null */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** تنفيذ عمليات داخل Transaction ذرّية */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>, options?: { isolation?: "read committed" | "repeatable read" | "serializable" }): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${options?.isolation ?? "READ COMMITTED"}`);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // تجاهل خطأ التراجع إن كان الاتصال ميتاً
    }
    throw error;
  } finally {
    client.release();
  }
}

/** مساعد داخل Transaction */
export class Tx {
  constructor(readonly client: PoolClient) {}

  async rows<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.query<T>(text, params as never[]);
    return result.rows;
  }

  async one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.rows<T>(text, params);
    return rows[0] ?? null;
  }

  async exec(text: string, params: unknown[] = []): Promise<number> {
    const result = await this.client.query(text, params as never[]);
    return result.rowCount ?? 0;
  }
}

/** هل الجدول موجود؟ */
export async function tableExists(name: string): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists",
    [name],
  );
  return Boolean(row?.exists);
}

export function readSql(filename: string): string {
  const filePath = path.join(process.cwd(), "db", filename);
  return fs.readFileSync(filePath, "utf8");
}

/** ترحيل المخطط + البيانات الافتراضية (idempotent) */
export async function migrate(options?: { seed?: boolean; silent?: boolean }): Promise<void> {
  const shouldSeed = options?.seed ?? true;
  const schema = readSql("schema.sql");
  await getPool().query(schema);
  if (shouldSeed) {
    const seed = readSql("seed.sql");
    await getPool().query(seed);
  }
  // تحديث دور المديرين من متغيّر البيئة (مصدر الحقيقة للصلاحيات الإدارية دائماً)
  for (const adminId of config.ADMIN_IDS) {
    const numericId = Number.parseInt(adminId, 10);
    if (!Number.isSafeInteger(numericId)) continue;
    await getPool().query("UPDATE users SET role = 'admin' WHERE telegram_id = $1 AND role <> 'admin'", [numericId]);
  }
  if (!options?.silent) log.info("تم تحديث مخطط قاعدة البيانات والبيانات الافتراضية");
}

/** إنهاء الاتصالات (عند الإغلاق) */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    log.info("تم إغلاق Pool قاعدة البيانات");
  }
}

/** هل قاعدة البيانات جاهزة؟ */
export async function healthCheck(): Promise<boolean> {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
