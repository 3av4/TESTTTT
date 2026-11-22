/**
 * إعداد Render بنقرة واحدة — يُشغَّل في سطر الأوامر من جهازك (ليس داخل Render).
 *
 * ماذا يفعل:
 *   1) يقرأ BOT_TOKEN و PUBLIC_URL من البيئة أو من الوسائط.
 *   2) يولّد WEBHOOK_SECRET (أو يستخدم الموجود).
 *   3) يسجّل الويبهوك على تلجرام مباشرة.
 *   4) يطبع القيم التي تنسخها إلى لوحة Render.
 *
 * الاستخدام:
 *   BOT_TOKEN=123:ABC PUBLIC_URL=https://bitpoin.onrender.com npx tsx scripts/render-setup.ts
 *
 * أو:
 *   npx tsx scripts/render-setup.ts --token 123:ABC --url https://bitpoin.onrender.com
 *
 * ملاحظة: لا يحتاج قاعدة بيانات، ولا يتصل بمشروعك — فقط بـ api.telegram.org.
 */
import crypto from "node:crypto";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const TOKEN = (arg("--token") ?? process.env.BOT_TOKEN ?? "").trim();
let BASE = (arg("--url") ?? process.env.PUBLIC_URL ?? process.env.APP_URL ?? "").trim();

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function die(message: string): never {
  console.error(`\n${red("✖")} ${message}\n`);
  process.exit(1);
}

if (!TOKEN) {
  die(
    [
      "التوكن مفقود.",
      "",
      "شغّل الأمر هكذا:",
      `  ${bold("BOT_TOKEN=التوكن_الجديد npx tsx scripts/render-setup.ts --url https://bitpoin.onrender.com")}`,
    ].join("\n"),
  );
}

if (!/^\d+:[\w-]{30,}$/.test(TOKEN)) {
  die("شكل التوكن غير صحيح. لازم يكون مثل: 123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
}

if (!BASE) die("الرابط مفقود. مرّر --url https://<اسم-خدمتك>.onrender.com");

BASE = BASE.replace(/\/+$/, "");
if (!BASE.startsWith("https://")) {
  die(`تلجرام يشترط https. الرابط الحالي: ${BASE}\nاستخدم رابط Render (https) وليس localhost.`);
}

const SECRET = (arg("--secret") ?? process.env.WEBHOOK_SECRET ?? crypto.randomBytes(24).toString("hex")).trim();
if (SECRET.length < 16) die("WEBHOOK_SECRET قصير جداً — 16 حرفاً على الأقل.");

const WEBHOOK_URL = `${BASE}/api/telegram/webhook/${SECRET}`;

async function tg(method: string, body?: unknown): Promise<{ ok: boolean; result?: any; description?: string }> {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await response.json()) as never;
}

async function main(): Promise<void> {
  console.log(`\n${bold("BitPoin — إعداد Render")}\n${"─".repeat(48)}`);
  console.log(`الرابط:  ${BASE}`);
  console.log(`الويبهوك: ${WEBHOOK_URL.slice(0, 60)}…\n`);

  // 1) التحقق من التوكن
  const me = await tg("getMe");
  if (!me.ok) {
    die(
      [
        "تلجرام رفض التوكن.",
        `السبب: ${me.description ?? "غير معروف"}`,
        "",
        "تأكد أنك نسخت التوكن كاملاً، وأنك لم تستخدم /revoke بعده.",
      ].join("\n"),
    );
  }
  console.log(`${green("✔")} البوت: @${me.result.username} (id: ${me.result.id})`);

  // 2) تسجيل الويبهوك
  const set = await tg("setWebhook", {
    url: WEBHOOK_URL,
    secret_token: SECRET,
    allowed_updates: ["message", "edited_message", "callback_query", "chat_member", "my_chat_member"],
    drop_pending_updates: true,
  });
  if (!set.ok) {
    die(
      [
        "فشل تسجيل الويبهوك.",
        `السبب: ${set.description ?? "غير معروف"}`,
        "",
        "إن كان السبب Conflict فلديك نسخة قديمة تعمل بنفس التوكن.",
        "أوقفها، ثم أعد المحاولة.",
      ].join("\n"),
    );
  }
  console.log(`${green("✔")} تم تسجيل الويبهوك`);

  // 3) تحقق نهائي
  const info = await tg("getWebhookInfo");
  const current = info.result?.url ?? "";
  const matches = current === WEBHOOK_URL;
  console.log(`${matches ? green("✔") : red("✖")} تحقق: getWebhookInfo → ${matches ? "مطابق" : current || "(فارغ)"}`);

  console.log(`\n${bold("القيم التي تنسخها إلى Render → Environment:")}\n${"─".repeat(48)}`);
  console.log(`TELEGRAM_WEBHOOK_URL = ${BASE}`);
  console.log(`WEBHOOK_SECRET       = ${SECRET}`);
  console.log(`APP_URL              = ${BASE}`);
  console.log(`${"─".repeat(48)}`);
  console.log(`\n${yellow("الخطوة الأخيرة:")} بعد لصق القيم أعلاه اضغط "Save Changes" ثم انتظر إعادة النشر.\n`);
  console.log(`اختبار: افتح https://t.me/${me.result.username} وأرسل /menu\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  die(`تعذّر الاتصال بتلجرام: ${message}\n\nتأكد أن جهازك يتصل بالإنترنت وليس خلف حجب لـ api.telegram.org.`);
});
