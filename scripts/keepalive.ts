/**
 * حارس تشغيل: يعيد تشغيل الخادم تلقائياً إذا انهار.
 *   npx tsx scripts/keepalive.ts
 * للإنتاج الحقيقي استخدم pm2 أو Docker (restart: unless-stopped).
 */
import { spawn } from "node:child_process";

let restarts = 0;
let child: ReturnType<typeof spawn> | null = null;
let stopping = false;

function start() {
  child = spawn("npx", ["tsx", "server.ts"], {
    stdio: "inherit",
    env: { ...process.env },
    shell: false,
  });
  const startedAt = Date.now();
  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    const livedMs = Date.now() - startedAt;
    restarts += 1;
    const delay = livedMs < 5000 ? Math.min(30_000, 1000 * restarts) : 1000;
    console.log(`\n[keepalive] توقف الخادم (code=${code} signal=${signal}) — إعادة تشغيل #${restarts} بعد ${delay}ms`);
    setTimeout(start, delay);
  });
  child.on("error", (error) => {
    console.error("[keepalive] فشل تشغيل الخادم:", error);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
    setTimeout(() => process.exit(0), 3000);
  });
}

start();
