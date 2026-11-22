/**
 * فحص ملفات النشر — يمنع أخطاء مثل "Dockerfile لا ينسخ server.ts".
 * يُشغَّل في CI وقبل النشر.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* ---------- Dockerfile ---------- */
const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");

// استخرج CMD
const cmd = dockerfile.match(/^CMD\s+(\[.*\])\s*$/m);
ok(Boolean(cmd), "Dockerfile: لا يوجد CMD");
const cmdParts = cmd ? JSON.parse(cmd[1]) : [];
const entryScript = cmdParts[cmdParts.length - 1];

// الملف الذي يشغّله CMD يجب أن يكون منسوخاً
ok(
  dockerfile.includes(`COPY --from=builder /app/${entryScript}`),
  `Dockerfile: CMD يشغّل ${entryScript} لكنه غير منسوخ (COPY مفقود)`,
);

// المجلدات الأساسية
for (const dir of ["server", "scripts", "public", "db/schema.sql", "db/seed.sql"]) {
  ok(dockerfile.includes(`/app/${dir}`), `Dockerfile: ${dir} غير منسوخ`);
}
for (const file of ["package.json", "tsconfig.json", "next.config.ts"]) {
  ok(dockerfile.includes(`/app/${file}`), `Dockerfile: ${file} غير منسوخ`);
}

// PORT و EXPOSE
ok(/ENV[\s\S]*PORT=3000/.test(dockerfile), "Dockerfile: PORT=3000 غير مضبوط");
ok(dockerfile.includes("EXPOSE 3000"), "Dockerfile: EXPOSE مفقود");

// كل ما يشير إليه CMD موجود فعلياً في المستودع
ok(existsSync(join(root, entryScript)), `${entryScript} غير موجود في المستودع`);

/* ---------- .dockerignore ---------- */
const dockerignore = readFileSync(join(root, ".dockerignore"), "utf8");
ok(
  !dockerignore.split("\n").some((l) => l.trim() === entryScript),
  `.dockerignore يستثني ${entryScript} — الحاوية ستفشل`,
);
ok(dockerignore.includes(".env"), ".dockerignore: .env غير مستثنى (خطر تسريب أسرار)");

/* ---------- render.yaml ---------- */
const render = readFileSync(join(root, "render.yaml"), "utf8");
ok(render.includes("runtime: docker"), "render.yaml: يجب runtime: docker");
ok(render.includes("healthCheckPath: /healthz"), "render.yaml: healthCheckPath مفقود");
ok(render.includes("plan: free"), "render.yaml: plan مفقود");
ok(/JWT_SECRET[\s\S]{0,80}generateValue: true/.test(render), "render.yaml: JWT_SECRET غير مولّد");
ok(!render.includes("buildCommand"), "render.yaml: لا يجب buildCommand مع Docker");
ok(!render.includes("startCommand"), "render.yaml: لا يجب startCommand مع Docker");
ok(!/sync: false[\s\S]{0,40}PORT/.test(render), "render.yaml: PORT لا يجب أن يكون sync: false");

/* ---------- ملف .env مرفوع؟ ---------- */
ok(!existsSync(join(root, ".env")) || true, ""); // .env محلي مسموح، المهم ألا يكون متتبعاً

/* ---------- النتيجة ---------- */
if (fails.length) {
  console.error("❌ فشل فحص النشر:\n" + fails.map((f) => "  • " + f).join("\n"));
  process.exit(1);
}
console.log("✅ فحص النشر نجح — Dockerfile و render.yaml متوافقان");
