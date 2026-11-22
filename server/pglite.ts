/**
 * قاعدة PGlite المدمجة (PostgreSQL في WASM) — للتطوير فقط.
 *
 * تُشغّل خادم PostgreSQL على منفذ محلي (5432 افتراضياً) بحيث يتعامل التطبيق
 * معها عبر بروتوكول PostgreSQL القياسي (مكتبة pg) دون أي فرق في الكود،
 * بما في ذلك Transaction و قفل الصفوف FOR UPDATE.
 *
 * في الإنتاج استخدم PostgreSQL حقيقياً وضبط DATABASE_URL.
 */
import net from "node:net";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { config } from "./config.js";
import { logger } from "./logger.js";

const log = logger.child("pglite");

let server: PGLiteSocketServer | null = null;
let db: PGlite | null = null;

function isPortOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(600);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/**
 * تشغيل PGlite إن لم يكن هناك DATABASE_URL.
 * إن كان المنفذ مستخدماً مسبقاً (خادم PGlite من تشغيل سابق) نتّصل به مباشرة.
 */
export async function startEmbeddedDatabase(): Promise<{ started: boolean; port: number }> {
  if (!config.useEmbeddedDb) {
    return { started: false, port: 0 };
  }
  const port = config.EMBEDDED_PG_PORT;

  if (await isPortOpen(port)) {
    log.info(`يوجد خادم قاعدة بيانات يعمل مسبقاً على المنفذ ${port} — سيتم الاتصال به`);
    return { started: false, port };
  }

  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  log.info(`تشغيل قاعدة PGlite المدمجة في ${config.DATA_DIR} على المنفذ ${port}`);

  db = await PGlite.create({ dataDir: config.DATA_DIR });
  server = new PGLiteSocketServer({
    db,
    port,
    host: "127.0.0.1",
    maxConnections: 20,
    idleTimeout: 0,
  });

  await server.start();
  log.info("قاعدة PGlite جاهزة (تطوير فقط — استخدم PostgreSQL في الإنتاج)");
  return { started: true, port };
}

/** إيقاف PGlite (يُستدعى عند إغلاق التطبيق) */
export async function stopEmbeddedDatabase(): Promise<void> {
  if (server) {
    await server.stop().catch((error) => log.warn("فشل إيقاف خادم PGlite", { error: String(error) }));
    server = null;
  }
  if (db) {
    await db.close().catch((error) => log.warn("فشل إغلاق قاعدة PGlite", { error: String(error) }));
    db = null;
  }
}

/** مسار بيانات PGlite (لأخذ نسخة احتياطية) */
export function getEmbeddedDataDir(): string {
  return config.DATA_DIR;
}

export function isEmbeddedRunning(): boolean {
  return server !== null;
}
