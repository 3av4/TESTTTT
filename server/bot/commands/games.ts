/**
 * ألعاب البوت: /dice /coinflip /slots /roulette /rob
 * كل لعبة تستخدم خدمة games المشتركة مع الموقع (نفس الاقتصاد ونفس الضريبة).
 */
import type { Bot, Context } from "grammy";
import { getNumber } from "../../services/settings.js";
import type { UserRow } from "../../services/users.js";
import { findUserByUsername, getUserByTelegramId } from "../../services/users.js";
import { getLimits, play, type GameKind } from "../../services/games.js";
import { rob } from "../../services/rob.js";
import { formatDuration } from "../../utils.js";
import { argsOf, isGroupChat, money, parseAmount, replyTo } from "../helpers.js";

type Ctx = Context & {
  dbUser?: UserRow;
  groupSettings?: { minBet: number | null; maxBet: number | null };
};

const CHOICE_AR: Record<string, Record<string, string>> = {
  dice: { high: "عالٍ", low: "منخفض", عالي: "high", عال: "high", منخفض: "low", واطي: "low" },
  coinflip: { heads: "heads", tails: "tails", صورة: "heads", كتابة: "tails", وجه: "heads", ظهر: "tails" },
  roulette: { red: "red", black: "black", green: "green", أحمر: "red", اسود: "black", أسود: "black", اخضر: "green", أخضر: "green" },
};

function normalizeChoice(game: GameKind, raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim().toLowerCase();
  return CHOICE_AR[game]?.[key] ?? key;
}

/** تشغيل لعبة عامة */
async function runGame(ctx: Ctx, game: GameKind) {
  const user = ctx.dbUser;
  if (!user) return;

  if (isGroupChat(ctx)) {
    const settings = ctx.groupSettings;
    if (settings && ctx.chat) {
      // نتأكد أن الألعاب مسموحة
      const { getGroupSettings } = await import("../../services/groups.js");
      const fresh = await getGroupSettings(ctx.chat.id);
      if (!fresh.enabled || !fresh.gamesEnabled) {
        await replyTo(ctx, "⚠️ الألعاب معطلة في هذا القروب.");
        return;
      }
    }
  }

  const args = argsOf(ctx);
  const limits = await getLimits(game);
  const min = ctx.groupSettings?.minBet ?? limits.min;
  const max = ctx.groupSettings?.maxBet ?? limits.max;

  let bet: number | null = parseAmount(args[0]);
  // السماح بـ /dice high 100 أو /dice 100 high
  let choiceRaw = args[1];
  if (!bet && args[0] && Number.isNaN(Number(args[0]))) {
    choiceRaw = args[0];
    bet = parseAmount(args[1]);
  }

  if (!bet) {
    await replyTo(
      ctx,
      `${emojiOf(game)} <b>لعبة ${nameOf(game)}</b>\n\n` +
        `ضع رهانك: <code>/${game} ${min}</code>\n` +
        `• الحد الأدنى: ${money(min)} • الحد الأعلى: ${money(max)}\n` +
        `• ضريبة الأرباح: ${await getNumber("game_tax_pct")}%\n\n` +
        choicesHelp(game),
    );
    return;
  }

  try {
    const result = await play({
      userId: user.id,
      game,
      bet,
      choice: normalizeChoice(game, choiceRaw),
      chatId: ctx.chat?.id ?? null,
      source: "bot",
      groupLimits: ctx.groupSettings ? { min: ctx.groupSettings.minBet, max: ctx.groupSettings.maxBet } : null,
    });

    const statusLine = result.won
      ? `🎉 <b>فوز!</b> ربحت <b>+${money(result.payout)}</b> (صافي ${money(result.profit)})`
      : `😢 <b>خسارة</b> — خسرت <b>${money(bet)}</b>`;
    const taxLine = result.tax > 0 ? `\n💸 ضريبة الأرباح: ${money(result.tax)}` : "";

    await replyTo(
      ctx,
      `${emojiOf(game)} <b>${nameOf(game)}</b>\n\n` +
        `🎲 النتيجة: <b>${result.result}</b>\n` +
        `${statusLine}${taxLine}\n` +
        `💳 رصيدك: <b>${money(result.balance)}</b>`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔁 نفس الرهان", callback_data: `game:again:${game}:${bet}:${normalizeChoice(game, choiceRaw) ?? "-"}` },
              { text: "🎮 ألعاب أخرى", callback_data: "games:menu" },
            ],
          ],
        },
      },
    );
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === "COOLDOWN") {
      await replyTo(ctx, `⏳ ${err.message}`);
      return;
    }
    await replyTo(ctx, `❌ ${err.message ?? "تعذر تنفيذ اللعبة"}`);
  }
}

function emojiOf(game: GameKind): string {
  return game === "dice" ? "🎲" : game === "coinflip" ? "🪙" : game === "slots" ? "🎰" : "🎡";
}
function nameOf(game: GameKind): string {
  return game === "dice" ? "النرد" : game === "coinflip" ? "العملة" : game === "slots" ? "ماكينة الحظ" : "الروليت";
}
function choicesHelp(game: GameKind): string {
  switch (game) {
    case "dice":
      return "الخيارات: <code>عالٍ</code> (4-6) أو <code>منخفض</code> (1-3)\nمثال: <code>/dice 100 عالي</code>\n💡 الفوز يضاعف رهانك ×2";
    case "coinflip":
      return "الخيارات: <code>صورة</code> أو <code>كتابة</code>\nمثال: <code>/coinflip 50 صورة</code>\n💡 الفوز يضاعف رهانك ×2";
    case "slots":
      return "🎰 ثلاثة رموز متشابهة = جائزة (×4 إلى ×10)\nرمزين متشابهين = ×1.5\nمثال: <code>/slots 100</code>";
    case "roulette":
      return "الخيارات: <code>أحمر</code> (×2) أو <code>أسود</code> (×2) أو <code>أخضر</code> (×14)\nمثال: <code>/roulette 100 أحمر</code>";
    default:
      return "";
  }
}

export async function diceCommand(ctx: Ctx) {
  await runGame(ctx, "dice");
}
export async function coinflipCommand(ctx: Ctx) {
  await runGame(ctx, "coinflip");
}
export async function slotsCommand(ctx: Ctx) {
  await runGame(ctx, "slots");
}
export async function rouletteCommand(ctx: Ctx) {
  await runGame(ctx, "roulette");
}

/** /rob */
export async function robCommand(ctx: Ctx) {
  const robber = ctx.dbUser;
  if (!robber) return;
  const args = argsOf(ctx);

  if (!isGroupChat(ctx)) {
    await replyTo(ctx, "🕵️ السرقة متاحة داخل القروبات فقط — فيها الإثارة! أضف البوت إلى قروب وابدأ.");
    return;
  }

  // تحديد الضحية: رد أو @mention
  const replied = ctx.message?.reply_to_message?.from;
  let victim: UserRow | null = null;
  let amountIndex = 0;

  if (replied && !replied.is_bot) {
    victim = await getUserByTelegramId(replied.id);
  } else if (args[0]?.startsWith("@")) {
    victim = await findUserByUsername(args[0]);
    amountIndex = 1;
  }

  const amount = parseAmount(args[amountIndex]);
  const [min, max, successPct, cooldown, penaltyPct] = await Promise.all([
    getNumber("rob_min"),
    getNumber("rob_max"),
    getNumber("rob_success_pct"),
    getNumber("rob_cooldown_minutes"),
    getNumber("rob_penalty_pct"),
  ]);

  if (!victim) {
    await replyTo(
      ctx,
      `🕵️ <b>السرقة</b>\n\n` +
        `رد على رسالة الضحية واكتب: <code>/rob 100</code>\n` +
        `أو: <code>/rob @username 100</code>\n\n` +
        `📊 نسبة النجاح: ${successPct}%\n` +
        `💰 المبلغ: ${Math.round(min)}–${Math.round(max)} BTP\n` +
        `⏳ الفاصل: ${cooldown} دقيقة\n` +
        `⚠️ عند الفشل: عقوبة ${penaltyPct}% من المبلغ`,
    );
    return;
  }

  if (!amount) {
    await replyTo(ctx, `🕵️ استخدم: <code>/rob ${Math.round(min)}</code> بالرد على رسالة الضحية.`);
    return;
  }

  try {
    const result = await rob({ robberId: robber.id, victimId: victim.id, amount, source: "bot" });
    if (result.success) {
      await replyTo(
        ctx,
        `🕵️‍♂️ <b>سرقة ناجحة!</b>\n\n` +
          `🎯 الضحية: ${victim.first_name ?? "لاعب"}\n` +
          `💰 سرقت: <b>${money(amount)}</b>\n` +
          `🎲 محاولتك: ${result.roll}/${result.needed}\n` +
          `💳 رصيدك: <b>${money(result.balance)}</b>\n` +
          `⏳ المحاولة القادمة بعد ${cooldown} دقيقة`,
      );
    } else {
      await replyTo(
        ctx,
        `🚨 <b>فشلت السرقة!</b>\n\n` +
          `🎲 محاولتك: ${result.roll}/${result.needed}\n` +
          `💸 عقوبة: <b>-${money(result.penalty)}</b>\n` +
          `🎁 وصل للضحية: ${money(result.victimShare)}\n` +
          `💳 رصيدك: <b>${money(result.balance)}</b>`,
      );
    }
  } catch (error) {
    const err = error as { code?: string; message?: string; meta?: { secondsRemaining?: number } };
    if (err.code === "COOLDOWN") {
      await replyTo(ctx, `⏳ يجب أن تنتظر <b>${formatDuration(Number(err.meta?.secondsRemaining ?? 0))}</b> قبل محاولة سرقة أخرى.`);
      return;
    }
    await replyTo(ctx, `❌ ${err.message ?? "تعذر تنفيذ السرقة"}`);
  }
}

export function registerGameCommands(bot: Bot) {
  bot.command(["dice", "d"], diceCommand);
  bot.command(["coinflip", "cf", "coin", "flip"], coinflipCommand);
  bot.command(["slots", "slot", "machine"], slotsCommand);
  bot.command(["roulette", "rl"], rouletteCommand);
  bot.command(["rob", "steal"], robCommand);
}
