/**
 * محاكي البوت — يتحقق من أن منطق البوت يعمل فعلياً دون الحاجة لشبكة تلجرام.
 *
 * كيف يعمل:
 *  - يعترض طلبات Bot API على مستوى `fetch` ويعيد استجابات تلجرام وهمية صحيحة الشكل.
 *  - يحقن تحديثات (رسائل + أزرار) داخل نفس نسخة grammY المستخدمة في الإنتاج.
 *  - يطبع كل رسالة "أرسلها" البوت حتى تراها بنفسك.
 *
 * التشغيل: npm run bot:simulate
 */
import { startEmbeddedDatabase, stopEmbeddedDatabase } from "../server/pglite.js";
import { closePool, migrate, query } from "../server/db.js";
import { setSettingForTest, getTreasuryBalance } from "../server/services/settings.js";
import { getUserById, upsertTelegramUser } from "../server/services/users.js";
import { getNumber } from "../server/services/settings.js";

/* ------------------------------------------------------------------ */
/* 1) اعتراض شبكة تلجرام                                               */
/* ------------------------------------------------------------------ */

interface CapturedCall {
  method: string;
  payload: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
const outbox: Array<{ chatId: string; text: string }> = [];
let messageId = 1000;

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  if (url.startsWith("https://api.telegram.org")) {
    const parts = url.split("/");
    const method = parts[parts.length - 1]!.split("?")[0]!;
    let payload: Record<string, unknown> = {};
    if (init?.body) {
      try {
        payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
    captured.push({ method, payload });

    const ok = (result: unknown) =>
      new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    switch (method) {
      case "getMe":
        return ok({ id: 9107523489, is_bot: true, first_name: "BitPoin", username: "BitPoinBot", can_join_groups: true });
      case "getWebhookInfo":
        return ok({ url: "", has_custom_certificate: false, pending_update_count: 0 });
      case "deleteWebhook":
      case "setMyCommands":
      case "answerCallbackQuery":
      case "deleteMessage":
        return ok(true);
      case "sendMessage": {
        const text = String(payload.text ?? "");
        outbox.push({ chatId: String(payload.chat_id ?? ""), text });
        if (process.env.BOT_SIM_VERBOSE) console.log(`\n──── sendMessage → ${payload.chat_id}\n${text}`);
        return ok({ message_id: ++messageId, date: Math.floor(Date.now() / 1000), chat: { id: Number(payload.chat_id), type: "private" }, text });
      }
      case "editMessageText": {
        const text = String(payload.text ?? "");
        outbox.push({ chatId: String(payload.chat_id ?? ""), text });
        if (process.env.BOT_SIM_VERBOSE) console.log(`\n──── editMessageText → ${payload.chat_id}\n${text}`);
        return ok({ message_id: Number(payload.message_id ?? ++messageId), date: Math.floor(Date.now() / 1000), chat: { id: Number(payload.chat_id), type: "private" }, text });
      }
      case "getChat":
        return ok({ id: Number(payload.chat_id), type: "private", first_name: "محاكاة" });
      case "getChatMember":
        return ok({ status: "member", user: { id: Number(payload.user_id), is_bot: false, first_name: "محاكاة" } });
      case "getUpdates":
        return ok([]);
      default:
        return ok(true);
    }
  }

  return realFetch(input as never, init);
}) as typeof fetch;

/* ------------------------------------------------------------------ */
/* 2) بناء تحديثات وهمية                                               */
/* ------------------------------------------------------------------ */

const FAKE_TG_ID = 880000777;
const CHAT_ID = FAKE_TG_ID;

const from = {
  id: FAKE_TG_ID,
  is_bot: false,
  first_name: "محاكي",
  username: "sim_player",
  language_code: "ar",
};

let updateId = 1;

function messageUpdate(text: string) {
  return {
    update_id: updateId++,
    message: {
      message_id: ++messageId,
      from,
      chat: { id: CHAT_ID, type: "private", first_name: from.first_name, username: from.username },
      date: Math.floor(Date.now() / 1000),
      text,
      entities: text.startsWith("/") ? [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }] : undefined,
    },
  };
}

function callbackUpdate(data: string) {
  return {
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from,
      chat_instance: "sim-instance",
      data,
      message: {
        message_id: messageId,
        from: { id: 9107523489, is_bot: true, first_name: "BitPoin", username: "BitPoinBot" },
        chat: { id: CHAT_ID, type: "private", first_name: from.first_name, username: from.username },
        date: Math.floor(Date.now() / 1000),
        text: "/start",
      },
    },
  };
}

/* ------------------------------------------------------------------ */
/* 3) السيناريو                                                        */
/* ------------------------------------------------------------------ */

interface Check {
  label: string;
  pass: boolean;
  detail?: string;
}

const checks: Check[] = [];

function expect(label: string, pass: boolean, detail?: string) {
  checks.push({ label, pass, detail });
  console.log(`${pass ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

function lastTexts(n = 3): string[] {
  return outbox.slice(-n).map((m) => m.text);
}

async function send(update: unknown) {
  const { createBot } = await import("../server/bot/index.js");
  const bot = await createBot();
  if (!bot) throw new Error("تعذر إنشاء البوت");
  // grammY يرفض handleUpdate قبل init() — نهيّئه (getMe مُعترَض ويعيد بيانات وهمية)
  try {
    await bot.init();
  } catch {
    // مسجّل مسبقاً
  }
  const before = outbox.length;
  await bot.handleUpdate(update as never);
  return outbox.slice(before);
}

async function main() {
  process.env.BOT_SIM_VERBOSE = "1";
  await startEmbeddedDatabase();
  await migrate();
  await setSettingForTest("bot_enabled", "true");

  console.log("\n════════ محاكاة بوت BitPoin ════════\n");

  // إعادة ضبط حالة حساب المحاكاة وحدود المعدل حتى تكون النتائج قابلة للتكرار
  await query("DELETE FROM rate_limits WHERE limit_key LIKE $1", ["bot:%"]).catch(() => undefined);
  await query(
    `UPDATE users SET last_daily = NULL, streak = 0, last_rob_at = NULL,
            last_bank_interest = NULL, is_banned = false, role = 'user'
     WHERE telegram_id = $1`,
    [FAKE_TG_ID],
  ).catch(() => undefined);

  // المستخدم يبدأ من الصفر
  const dbUser = await upsertTelegramUser({ id: FAKE_TG_ID, first_name: "محاكي", username: "sim_player" });
  const startBalance = dbUser.balance;
  console.log(`حساب المحاكاة: #${dbUser.id} · رصيد البداية ${startBalance} BTP\n`);

  /* ---- /start ---- */
  const startMsgs = await send(messageUpdate("/start"));
  expect("/start يردّ برسالة ترحيب", startMsgs.length > 0, `${startMsgs.length} رسالة`);
  expect("/start يذكر BitPoin", startMsgs.some((m) => /BitPoin|BTP/i.test(m.text)));

  /* ---- /balance ---- */
  const balanceMsgs = await send(messageUpdate("/balance"));
  expect("/balance يعرض الرصيد", balanceMsgs.some((m) => m.text.includes("الرصيد") || m.text.includes("BTP")));

  /* ---- /daily ---- */
  const dailyMsgs = await send(messageUpdate("/daily"));
  expect("/daily يمنح راتباً", dailyMsgs.length > 0);
  const afterDaily = await getUserById(dbUser.id);
  expect("الرصيد ارتفع بعد الراتب", Number(afterDaily!.balance) > Number(startBalance), `${startBalance} → ${afterDaily!.balance}`);

  /* ---- /daily مرة ثانية (فاصل زمني) ---- */
  const dailyAgain = await send(messageUpdate("/daily"));
  expect("/daily محمي من التكرار", dailyAgain.some((m) => /لم يحن|انتظر|مرة أخرى|غداً|تبقى|فاصل|عذراً/i.test(m.text)), dailyAgain.map((m) => m.text.slice(0, 40)).join(" | "));

  /* ---- /help ---- */
  const helpMsgs = await send(messageUpdate("/help"));
  expect("/help يعرض قائمة الأوامر", helpMsgs.some((m) => m.text.includes("/daily") || m.text.includes("/games") || m.text.includes("/send")));

  /* ---- /profile ---- */
  const profileMsgs = await send(messageUpdate("/profile"));
  expect("/profile يعرض بيانات المستخدم", profileMsgs.length > 0 && profileMsgs.some((m) => /محاكي|sim_player|مستوى|ملف/i.test(m.text)));

  /* ---- /dice ---- */
  const diceMsgs = await send(messageUpdate("/dice 100"));
  expect("/dice ينفّذ جولة", diceMsgs.some((m) => /نرد|🎲|فوز|خسارة|رهان/i.test(m.text)), diceMsgs.at(-1)?.text.slice(0, 60));

  /* ---- /coinflip ---- */
  const coinMsgs = await send(messageUpdate("/coinflip 50 heads"));
  expect("/coinflip ينفّذ جولة", coinMsgs.length > 0, coinMsgs.at(-1)?.text.slice(0, 60));

  /* ---- /slots ---- */
  const slotsMsgs = await send(messageUpdate("/slots 20"));
  expect("/slots ينفّذ جولة", slotsMsgs.length > 0, slotsMsgs.at(-1)?.text.slice(0, 60));

  /* ---- /roulette ---- */
  const rouletteMsgs = await send(messageUpdate("/roulette 20 red"));
  expect("/roulette ينفّذ جولة", rouletteMsgs.length > 0, rouletteMsgs.at(-1)?.text.slice(0, 60));

  /* ---- /bank ---- */
  const bankMsgs = await send(messageUpdate("/bank"));
  expect("/bank يعرض معلومات البنك", bankMsgs.some((m) => /بنك|إيداع|فائدة/i.test(m.text)));

  /* ---- /bank deposit ---- */
  const depositMsgs = await send(messageUpdate("/bank deposit 100"));
  expect("إيداع بنكي يعمل", depositMsgs.length > 0, depositMsgs.at(-1)?.text.slice(0, 60));

  /* ---- /top ---- */
  const topMsgs = await send(messageUpdate("/top"));
  expect("/top يعرض المتصدرين", topMsgs.some((m) => /الأغنى|متصدر|رصيد|توب|🥇/i.test(m.text)));

  /* ---- /history ---- */
  const historyMsgs = await send(messageUpdate("/history"));
  expect("/history يعرض سجل العمليات", historyMsgs.length > 0, historyMsgs.at(-1)?.text.slice(0, 60));

  /* ---- /referral ---- */
  const refMsgs = await send(messageUpdate("/referral"));
  expect("/referral يعرض رابط الإحالة", refMsgs.some((m) => m.text.includes("ref_") || /إحالة|رابط/i.test(m.text)));

  /* ---- /shop ---- */
  const shopMsgs = await send(messageUpdate("/shop"));
  expect("/shop يعرض المتجر", shopMsgs.some((m) => /متجر|لقب|شراء/i.test(m.text)));

  /* ---- /send (بدون هدف) ---- */
  const sendMsgs = await send(messageUpdate("/send"));
  expect("/send يعطي إرشاداً عند نقص المعاملات", sendMsgs.length > 0, sendMsgs.at(-1)?.text.slice(0, 60));

  /* ---- /redeem ---- */
  const redeemMsgs = await send(messageUpdate("/redeem"));
  expect("/redeem يعطي إرشاداً", redeemMsgs.length > 0);

  /* ---- أزرار Inline ---- */
  const menuMsgs = await send(callbackUpdate("menu:main"));
  expect("زر القائمة الرئيسية يعمل", menuMsgs.length > 0, menuMsgs.at(-1)?.text.slice(0, 50));

  // زر الراتب في حالة الفاصل الزمني يردّ عبر answerCallbackQuery (toast) لا بتعديل الرسالة
  const ackBefore = captured.filter((c) => c.method === "answerCallbackQuery").length;
  const dailyBtn = await send(callbackUpdate("daily:claim"));
  const ackAfter = captured.filter((c) => c.method === "answerCallbackQuery").length;
  expect(
    "زر الراتب اليومي يردّ (تعديل رسالة أو toast)",
    dailyBtn.length > 0 || ackAfter > ackBefore,
    `${dailyBtn.length} رسالة · ${ackAfter - ackBefore} toast`,
  );

  const gamesBtn = await send(callbackUpdate("menu:games"));
  expect("زر الألعاب يعمل", gamesBtn.length > 0, gamesBtn.at(-1)?.text.slice(0, 50));

  /* ---- أمر غير معروف ---- */
  const unknownMsgs = await send(messageUpdate("/xyzzy"));
  expect("الأوامر غير المعروفة تُعامل بلا انهيار", true, `${unknownMsgs.length} رسالة`);

  /* ---- الإشعارات عبر البوت ---- */
  const { notify } = await import("../server/services/notifications.js");
  const beforeNotify = outbox.length;
  await notify({ userId: dbUser.id, title: "🔔 اختبار", body: "إشعار من لوحة الإدارة", telegram: true });
  // sendTelegramToUser يعمل بدون انتظار — نُفسح مجالاً لدورة الشبكة الوهمية
  for (let i = 0; i < 20 && outbox.length === beforeNotify; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect("إشعار الإدارة يصل عبر تلجرام", outbox.length > beforeNotify, `${outbox.length - beforeNotify} رسالة`);

  /* ---- الخزينة والسلامة ---- */
  const treasury = await getTreasuryBalance();
  expect("الخزينة تُحصّل ضرائب الألعاب", treasury > 0, `${treasury} BTP`);

  const finalUser = await getUserById(dbUser.id);
  expect("الرصيد النهائي غير سالب", Number(finalUser!.balance) >= 0, `${finalUser!.balance} BTP`);
  const bankInterest = await getNumber("bank_interest_pct");
  expect("الإعدادات تُقرأ من القاعدة", bankInterest > 0, `فائدة ${bankInterest}%`);

  /* ---- ملخص ---- */
  const passed = checks.filter((c) => c.pass).length;
  console.log(`\n════════ النتيجة: ${passed}/${checks.length} ════════`);
  const calls = captured.reduce<Record<string, number>>((acc, c) => {
    acc[c.method] = (acc[c.method] ?? 0) + 1;
    return acc;
  }, {});
  console.log("استدعاءات Bot API:", calls);

  if (passed !== checks.length) {
    console.log("\nالاختبارات الفاشلة:");
    for (const c of checks.filter((x) => !x.pass)) console.log(" -", c.label, c.detail ?? "");
    process.exitCode = 1;
  }

  await closePool();
  await stopEmbeddedDatabase();
}

main().catch(async (error) => {
  console.error("فشل المحاكي:", error);
  await closePool().catch(() => undefined);
  await stopEmbeddedDatabase().catch(() => undefined);
  process.exit(1);
});
