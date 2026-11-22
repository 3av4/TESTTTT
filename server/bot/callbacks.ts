/**
 * أزرار Inline Keyboard — كل زر ينادي نفس خدمات الموقع.
 */
import type { Bot, Context } from "grammy";
import { logger } from "../logger.js";
import type { UserRow } from "../services/users.js";
import { getDailyStatus, claimDaily } from "../services/daily.js";
import { getBankInfo, deposit, withdraw } from "../services/bank.js";
import { listItems, buyItem } from "../services/shop.js";
import { globalLeaderboard, gamesLeaderboard, referralLeaderboard } from "../services/leaderboard.js";
import { getUserTransactions } from "../services/ledger.js";
import { play, getLimits, type GameKind } from "../services/games.js";
import { getReferralInfo } from "../services/referral.js";
import { toPublicUser } from "../services/users.js";
import { getNumber } from "../services/settings.js";
import { formatDateAr, formatDuration } from "../utils.js";
import { LOGIN_URL_PLACEHOLDER } from "./urls.js";
import { backToMenu, gamesMenu, mainMenu } from "./constants.js";
import { money, tag } from "./helpers.js";

const log = logger.child("bot-callbacks");
type Ctx = Context & { dbUser?: UserRow };

/** الرد على الزر وإظهار رسالة قصيرة */
async function ack(ctx: Ctx, text?: string) {
  try {
    await ctx.answerCallbackQuery(text ? { text, show_alert: false } : undefined);
  } catch {
    // انتهت صلاحية الزر
  }
}

/** تعديل الرسالة الحالية أو إرسالها */
async function render(ctx: Ctx, html: string, keyboard?: unknown) {
  try {
    await ctx.editMessageText(html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: keyboard as never } : {}),
    });
  } catch {
    await ctx.reply(html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(keyboard ? { reply_markup: keyboard as never } : {}),
    });
  }
}

async function showBalance(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const daily = await getDailyStatus(user);
  const bank = await getBankInfo(user);
  await render(
    ctx,
    `💳 <b>رصيد ${tag(user.username)}</b>\n\n` +
      `💵 النقد: <b>${money(Number(user.balance))}</b>\n` +
      `🏦 البنك: <b>${money(Number(user.bank_balance))}</b>\n` +
      `💎 الإجمالي: <b>${money(Number(user.balance) + Number(user.bank_balance))}</b>\n\n` +
      `🔥 السلسلة: ${daily.streak}\n` +
      `🎁 الراتب: ${daily.canClaim ? "متاح ✅" : `بعد ${formatDuration(daily.secondsRemaining)}`}\n` +
      `📈 فائدة البنك: ${bank.interestPercent}%`,
    {
      inline_keyboard: [
        [
          { text: "🎁 راتب", callback_data: "daily:claim" },
          { text: "🏦 البنك", callback_data: "bank:view" },
        ],
        [{ text: "⬅️ القائمة", callback_data: "menu:main" }],
      ],
    },
  );
}

async function showBank(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const bank = await getBankInfo(user);
  const minDeposit = Math.round(await getNumber("bank_min_deposit"));
  const quick = [100, 500, 1000, 5000].filter((amount) => amount >= minDeposit).slice(0, 3);
  await render(
    ctx,
    `🏦 <b>بنك BitPoin</b>\n\n` +
      `💵 نقدك: <b>${money(bank.balance)}</b>\n` +
      `🏦 رصيد البنك: <b>${money(Number(user.bank_balance))}</b>\n` +
      `📈 الفائدة: ${bank.interestPercent}% يومياً\n` +
      `⏳ المتوقع: <b>${money(bank.pendingInterest)}</b>\n` +
      `💎 السعة: ${money(bank.capacity)}\n\n` +
      `استخدم:<code>/bank deposit 500</code> أو <code>/bank withdraw 200</code>`,
    {
      inline_keyboard: [
        ...quick.map((amount) => [
          { text: `➕ إيداع ${amount}`, callback_data: `bank:deposit:${amount}` },
          { text: `➖ سحب ${amount}`, callback_data: `bank:withdraw:${amount}` },
        ]),
        [{ text: "⬅️ القائمة", callback_data: "menu:main" }],
      ],
    },
  );
}

async function showShop(ctx: Ctx) {
  const user = ctx.dbUser;
  const items = await listItems(user?.id);
  if (items.length === 0) {
    await render(ctx, "🛒 المتجر معطّل حالياً أو فارغ.", backToMenu());
    return;
  }
  const lines = items.slice(0, 6).map((item) => `${item.icon} <b>${item.name}</b> — ${money(item.price)} · <code>${item.code}</code>`);
  const buttons = items.slice(0, 6).map((item) => [
    { text: `${item.icon} ${item.name} — ${item.price}`, callback_data: `shop:buy:${item.code}` },
  ]);
  await render(
    ctx,
    `🛒 <b>المتجر</b>\n\n${lines.join("\n")}\n\n💳 رصيدك: <b>${money(Number(user?.balance ?? 0))}</b>`,
    { inline_keyboard: [...buttons, [{ text: "⬅️ القائمة", callback_data: "menu:main" }]] },
  );
}

async function showTop(ctx: Ctx, scope: "global" | "refs") {
  const medal = ["🥇", "🥈", "🥉"];
  if (scope === "refs") {
    const rows = await referralLeaderboard(10);
    await render(
      ctx,
      `🔗 <b>أفضل الداعين</b>\n\n${rows.map((entry, index) => `${medal[index] ?? `${index + 1}.`} ${tag(entry.username)} — ${entry.score ?? 0} دعوة`).join("\n") || "لا بيانات"}`,
      backToMenu(),
    );
    return;
  }
  const board = await globalLeaderboard({ limit: 10, meId: ctx.dbUser?.id });
  const games = await gamesLeaderboard(3);
  await render(
    ctx,
    `🌍 <b>الأغنى عالمياً</b>\n\n` +
      board.entries.map((entry, index) => `${medal[index] ?? `${index + 1}.`} ${tag(entry.username)} — ${money(entry.balance)}`).join("\n") +
      (board.me ? `\n\n📍 ترتيبك: #${board.me.rank}` : "") +
      `\n\n🎲 <b>أفضل اللاعبين</b>\n${games.map((entry, index) => `${medal[index] ?? `${index + 1}.`} ${tag(entry.username)} — ${money(entry.score ?? 0)}`).join("\n")}`,
    {
      inline_keyboard: [
        [
          { text: "🌍 عالمي", callback_data: "top:global" },
          { text: "💎 إحالات", callback_data: "top:refs" },
        ],
        [{ text: "⬅️ القائمة", callback_data: "menu:main" }],
      ],
    },
  );
}

async function showHistory(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const transactions = await getUserTransactions(user.id, 8);
  const labels: Record<string, string> = {
    daily: "🎁 راتب",
    transfer: "💸 تحويل صادر",
    transfer_received: "💰 تحويل وارد",
    game_win: "🎲 ربح",
    game_bet: "🎲 خسارة",
    bank_deposit: "🏦 إيداع",
    bank_withdraw: "🏦 سحب",
    bank_interest: "📈 فائدة",
    shop_purchase: "🛒 شراء",
    redeem: "🎟 كود",
    referral_reward: "🔗 إحالة",
  };
  const lines = transactions.map((tx) => {
    const incoming = tx.recipientId === Number(user.id);
    return `${labels[tx.type] ?? tx.type} <b>${incoming ? "+" : "-"}${money(incoming ? tx.net : tx.amount)}</b> · ${formatDateAr(tx.createdAt)}`;
  });
  await render(ctx, `📜 <b>آخر العمليات</b>\n\n${lines.join("\n") || "لا عمليات بعد"}`, backToMenu());
}

async function showReferral(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const info = await getReferralInfo(user);
  await render(
    ctx,
    `🔗 <b>إحالاتك</b>\n\n` +
      `👥 المدعوون: ${info.invitedCount}\n✅ مكتملة: ${info.paidCount}\n⏳ معلقة: ${info.pendingCount}\n` +
      `💰 أرباحك: <b>${money(info.earnings)}</b>\n\n` +
      `🔗 رابطك:\n<code>${info.link}</code>\n\n` +
      `مكافأة الداعي: ${info.rewardInviter} BTP | مكافأة المدعو: ${info.rewardInvitee} BTP`,
    {
      inline_keyboard: [
        [{ text: "📤 مشاركة", url: `https://t.me/share/url?url=${encodeURIComponent(info.link)}` }],
        [{ text: "⬅️ القائمة", callback_data: "menu:main" }],
      ],
    },
  );
}

async function showProfile(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  await render(
    ctx,
    `👤 <b>${tag(user.username)}</b>\n` +
      `🆔 <code>${user.telegram_id}</code>\n` +
      `📅 ${formatDateAr(user.created_at)}\n` +
      `💵 ${money(Number(user.balance))} | 🏦 ${money(Number(user.bank_balance))}\n` +
      `🔥 ${user.streak} يوم\n` +
      (user.active_title ? `🏅 ${user.active_title}\n` : ""),
    backToMenu(),
  );
}

async function playGameFromButton(ctx: Ctx, game: GameKind, bet: number, choice?: string) {
  const user = ctx.dbUser;
  if (!user) return;
  try {
    const limits = await getLimits(game);
    if (bet < limits.min || bet > limits.max) {
      await ack(ctx, `الرهان يجب أن يكون بين ${limits.min} و ${limits.max}`);
      return;
    }
    const result = await play({
      userId: user.id,
      game,
      bet,
      choice,
      chatId: ctx.chat?.id ?? null,
      source: "bot",
    });
    await ack(ctx, result.won ? `🎉 ربحت ${result.payout}` : `😢 خسرت ${bet}`);
    await render(
      ctx,
      `🎲 <b>${result.result}</b>\n\n` +
        `${result.won ? `🎉 <b>فوز!</b> +${money(result.payout)}` : `😢 خسارة ${money(bet)}`}\n` +
        `💳 رصيدك: <b>${money(result.balance)}</b>`,
      {
        inline_keyboard: [
          [{ text: "🔁 مرة أخرى", callback_data: `game:again:${game}:${bet}:${choice ?? "-"}` }],
          [{ text: "🎮 الألعاب", callback_data: "games:menu" }],
        ],
      },
    );
  } catch (error) {
    await ack(ctx, (error as Error).message.slice(0, 180));
  }
}

export function registerCallbacks(bot: Bot) {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const user = (ctx as Ctx).dbUser;
    if (!user) {
      await ack(ctx, "أرسل /start أولاً");
      return;
    }
    if (user.is_banned) {
      await ack(ctx, "حسابك محظور");
      return;
    }

    try {
      const [action, ...rest] = data.split(":");

      // الرهان السريع: game:quick:<game>:<bet>
      if (action === "game" && rest[0] === "quick") {
        await ack(ctx);
        await playGameFromButton(ctx, rest[1] as GameKind, Number(rest[2] ?? 0));
        return;
      }

      switch (action) {
        case "menu": {
          await ack(ctx);
          const daily = await getDailyStatus(user);
          await render(
            ctx,
            `🪙 <b>BitPoin</b>\n\n💵 رصيدك: <b>${money(Number(user.balance))}</b>\n🔥 سلسلة: ${daily.streak}\n🎁 الراتب: ${
              daily.canClaim ? "متاح ✅" : `بعد ${formatDuration(daily.secondsRemaining)}`
            }`,
            mainMenu(),
          );
          return;
        }
        case "balance": {
          await ack(ctx);
          await showBalance(ctx);
          return;
        }
        case "daily": {
          if (rest[0] === "claim") {
            try {
              const result = await claimDaily(user.id, "bot");
              await ack(ctx, `🎉 +${result.amount} BTP`);
              await render(
                ctx,
                `🎁 <b>تم استلام راتبك!</b>\n\n` +
                  `💰 <b>+${money(result.amount)}</b>\n` +
                  `🎲 الأساس: ${money(result.base)}\n` +
                  `🔥 السلسلة (${result.streak}): +${money(result.streakBonus)}\n` +
                  (result.multiplier > 1 ? `⚡ مضاعف: ×${result.multiplier}\n` : "") +
                  `\n💳 رصيدك: <b>${money(result.balance)}</b>`,
                {
                  inline_keyboard: [
                    [{ text: "🎲 العب", callback_data: "games:menu" }, { text: "🏦 البنك", callback_data: "bank:view" }],
                    [{ text: "⬅️ القائمة", callback_data: "menu:main" }],
                  ],
                },
              );
            } catch (error) {
              const err = error as { code?: string; meta?: { secondsRemaining?: number }; message?: string };
              if (err.code === "COOLDOWN") {
                await ack(ctx, `⏳ بعد ${formatDuration(Number(err.meta?.secondsRemaining ?? 0))}`);
              } else {
                await ack(ctx, (err.message ?? "تعذر").slice(0, 180));
              }
            }
            return;
          }
          await ack(ctx);
          const daily = await getDailyStatus(user);
          await render(
            ctx,
            `🎁 <b>الراتب اليومي</b>\n\n` +
              `💰 المتوقع: ${daily.estimatedMin}–${daily.estimatedMax} BTP\n` +
              `🔥 السلسلة: ${daily.streak}\n` +
              (daily.canClaim ? "✅ متاح الآن!" : `⏳ بعد ${formatDuration(daily.secondsRemaining)}`),
            daily.canClaim
              ? { inline_keyboard: [[{ text: "🎁 استلم الآن", callback_data: "daily:claim" }]] }
              : backToMenu(),
          );
          return;
        }
        case "bank": {
          const sub = rest[0];
          if (sub === "deposit" || sub === "withdraw") {
            const amount = Number(rest[1]);
            try {
              const result = sub === "deposit" ? await deposit(user.id, amount, "bot") : await withdraw(user.id, amount, "bot");
              await ack(ctx, `✅ ${sub === "deposit" ? "أُودع" : "سُحب"} ${amount}`);
              await render(
                ctx,
                `🏦 <b>تمت العملية</b>\n\n💵 النقد: <b>${money(result.balance)}</b>\n🏦 البنك: <b>${money(result.bankBalance)}</b>`,
                {
                  inline_keyboard: [
                    [{ text: "🏦 البنك", callback_data: "bank:view" }],
                    [{ text: "⬅️ القائمة", callback_data: "menu:main" }],
                  ],
                },
              );
            } catch (error) {
              await ack(ctx, (error as Error).message.slice(0, 180));
            }
            return;
          }
          await ack(ctx);
          await showBank(ctx);
          return;
        }
        case "shop": {
          if (rest[0] === "buy") {
            const code = rest[1]!;
            try {
              const result = await buyItem(user.id, code, { source: "bot" });
              await ack(ctx, `✅ ${result.item.name}`);
              await render(
                ctx,
                `✅ <b>تم الشراء</b>\n\n${result.item.icon} ${result.item.name}\n💸 ${money(result.price)}\n💳 ${money(result.balance)}\n\n${result.message}`,
                {
                  inline_keyboard: [
                    [{ text: "🛒 المتجر", callback_data: "shop:list" }],
                    [{ text: "⬅️ القائمة", callback_data: "menu:main" }],
                  ],
                },
              );
            } catch (error) {
              await ack(ctx, (error as Error).message.slice(0, 180));
            }
            return;
          }
          await ack(ctx);
          await showShop(ctx);
          return;
        }
        case "games": {
          await ack(ctx);
          await render(
            ctx,
            `🎮 <b>الألعاب</b>\n\nاختر لعبة ثم اكتب مبلغ الرهان:\n` +
              `• <code>/dice 100 عالي</code>\n• <code>/coinflip 100 صورة</code>\n• <code>/slots 100</code>\n• <code>/roulette 100 أحمر</code>`,
            gamesMenu(),
          );
          return;
        }
        case "game": {
          if (rest[0] === "again" && rest[1] && rest[2]) {
            await ack(ctx);
            await playGameFromButton(ctx, rest[1] as GameKind, Number(rest[2]), rest[3] === "-" ? undefined : rest[3]);
            return;
          }
          const game = rest[0] as GameKind;
          await ack(ctx);
          const limits = await getLimits(game);
          const title = game === "dice" ? "🎲 النرد" : game === "coinflip" ? "🪙 العملة" : game === "slots" ? "🎰 الماكينة" : "🎡 الروليت";
          await render(
            ctx,
            `${title}\n\n` +
              `💰 الرهان: ${money(limits.min)}–${money(limits.max)}\n\n` +
              `اكتب الأمر مباشرة:\n` +
              (game === "dice"
                ? "• <code>/dice 100 عالي</code>\n• <code>/dice 100 منخفض</code>"
                : game === "coinflip"
                  ? "• <code>/coinflip 100 صورة</code>\n• <code>/coinflip 100 كتابة</code>"
                  : game === "slots"
                    ? "• <code>/slots 100</code>"
                    : "• <code>/roulette 100 أحمر</code>\n• <code>/roulette 100 أسود</code>\n• <code>/roulette 100 أخضر</code>"),
            {
              inline_keyboard: [
                [limits.min, limits.min * 5, limits.min * 10].filter((bet) => bet <= limits.max).map((bet) => ({
                  text: `▶️ ${bet}`,
                  callback_data: `game:quick:${game}:${bet}`,
                })),
                [{ text: "⬅️ رجوع", callback_data: "games:menu" }],
              ],
            },
          );
          return;
        }
        case "help": {
          await ack(ctx);
          await render(
            ctx,
            `📖 <b>الأوامر الرئيسية</b>\n\n` +
              `/balance /daily /profile /history /send /top /bank /shop /redeem /referral /loan\n\n` +
              `🎲 /dice /coinflip /slots /roulette /rob\n` +
              `🌐 سجّل دخولك للموقع بنفس الحساب عبر تلجرام: ${LOGIN_URL_PLACEHOLDER}`,
            backToMenu(),
          );
          return;
        }
        case "top": {
          await ack(ctx);
          await showTop(ctx, rest[0] === "refs" ? "refs" : "global");
          return;
        }
        case "history": {
          await ack(ctx);
          await showHistory(ctx);
          return;
        }
        case "ref": {
          await ack(ctx);
          await showReferral(ctx);
          return;
        }
        case "profile": {
          await ack(ctx);
          await showProfile(ctx);
          return;
        }
        default: {
          await ack(ctx);
          log.debug("زر غير معروف", { data });
        }
      }
    } catch (error) {
      log.error("خطأ في معالجة زر", { data, error: String(error) });
      await ack(ctx, "⚠️ حدث خطأ، حاول مجدداً").catch(() => undefined);
    }
  });

  void toPublicUser;
}
