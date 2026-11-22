/**
 * أوامر البوت الأساسية: /start /help /balance /daily /profile /top /history
 */
import type { Bot, Context } from "grammy";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import { formatDateAr, formatDuration } from "../../utils.js";
import { getDailyStatus, claimDaily } from "../../services/daily.js";
import { getUserTransactions } from "../../services/ledger.js";
import { globalLeaderboard, groupLeaderboard, gamesLeaderboard } from "../../services/leaderboard.js";
import { getReferralInfo, buildReferralLink, attachReferral } from "../../services/referral.js";
import { getBankInfo } from "../../services/bank.js";
import { getUserGameStats } from "../../services/games.js";
import { getRobStatus } from "../../services/rob.js";
import { getLoanInfo } from "../../services/loans.js";
import type { UserRow } from "../../services/users.js";
import { mainMenu, backToMenu } from "../constants.js";
import { argsOf, isGroupChat, money, replyTo, say, tag } from "../helpers.js";

const log = logger.child("bot-basic");

type Ctx = Context & { dbUser?: UserRow; groupSettings?: { minBet: number | null; maxBet: number | null } };

/** /start — ترحيب + معالجة كود الإحالة */
export async function startCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;

  // معالجة ref_CODE من الرابط
  const payload = argsOf(ctx)[0];
  if (payload?.toLowerCase().startsWith("ref_")) {
    const linked = await attachReferral(user, payload.slice(4));
    if (linked) {
      await say(
        ctx,
        "🎉 تم ربط حسابك بداعي الإحالة! ستحصل أنت وداعيك على مكافأة عند أول نشاط لك.\n\n" + `رصيدك الحالي: <b>${money(Number(user.balance))}</b>`,
      );
    }
  }

  const inGroup = isGroupChat(ctx);
  if (inGroup) {
    await say(
      ctx,
      `👋 مرحباً ${ctx.from?.first_name ?? "بك"}!\n\n` +
        `أنا بوت <b>BitPoin (BTP)</b> — عملة رقمية مجتمعية.\n` +
        `استخدم /balance لرصيدك، /daily لراتبك اليومي، و/help لكل الأوامر.`,
      { reply_markup: { inline_keyboard: [[{ text: "🎁 راتبي اليومي", callback_data: "daily:claim" }]] } },
    );
    return;
  }

  const daily = await getDailyStatus(user);
  await say(
    ctx,
    `🪙 <b>أهلاً بك في BitPoin (BTP)</b> 🪙\n\n` +
      `حسابك جاهز: <b>${money(Number(user.balance))}</b>\n` +
      `🔥 سلسلة أيامك: <b>${daily.streak}</b>\n` +
      `🎁 راتبك اليومي: <b>${daily.estimatedMin}–${daily.estimatedMax} BTP</b> ${
        daily.canClaim ? "— <b>متاح الآن!</b>" : `— يتجدد بعد ${formatDuration(daily.secondsRemaining)}`
      }\n\n` +
      `🌐 تسجيل الدخول للموقع عبر تلجرام: نفس حسابك ورصيدك.\n` +
      `🔗 رابط الإحالة: <code>${buildReferralLink(user.referral_code ?? "")}</code>\n\n` +
      `اختر من القائمة أدناه 👇`,
    { reply_markup: mainMenu() },
  );
}

/** /help */
export async function helpCommand(ctx: Ctx) {
  const isPrivate = !isGroupChat(ctx);
  const text =
    `📖 <b>أوامر BitPoin (BTP)</b>\n\n` +
    `💰 <b>الاقتصاد</b>\n` +
    `• /balance — رصيدك (نقدي + بنكي)\n` +
    `• /daily — الراتب اليومي (كل 24 ساعة + مكافأة سلسلة)\n` +
    `• /profile — ملفك وإحصائياتك\n` +
    `• /history — آخر 10 عمليات\n` +
    `• /send @user 100 — تحويل (أو بالرد + /send 100)\n` +
    `• /gift @user 50 — إهداء عملات\n` +
    `• /bank — إيداع/سحب/فائدة يومية\n` +
    `• /loan — قروض صغيرة\n\n` +
    `🎲 <b>الألعاب</b>\n` +
    `• /dice [رهان] [عالٍ|منخفض]\n` +
    `• /coinflip [رهان] [صورة|كتابة]\n` +
    `• /slots [رهان]\n` +
    `• /roulette [رهان] [أحمر|أسود|أخضر]\n` +
    `• /rob 100 — بالرد على الضحية أو /rob @user 100\n\n` +
    `🛒 <b>المتجر</b>\n` +
    `• /shop — عرض العناصر\n` +
    `• /buy &lt;code&gt; — شراء عنصر\n` +
    `• /redeem CODE — استرداد كود هدية\n\n` +
    `🏆 <b>المجتمع</b>\n` +
    `• /top — الأغنى عالمياً (داخل القروب: أغنى الأعضاء)\n` +
    `• /referral — رابط الإحالة والمكافآت\n\n` +
    (isPrivate ? `🛡 <b>الأدمن</b>\n• /admin — دليل أوامر الإدارة\n` : `🛡 أكتب /settings لعرض إعدادات القروب.\n`);

  await replyTo(ctx, text, { reply_markup: isPrivate ? mainMenu() : backToMenu() });
}

/** /balance */
export async function balanceCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const bank = await getBankInfo(user);
  const daily = await getDailyStatus(user);
  await replyTo(
    ctx,
    `💳 <b>محفظة ${tag(user.username)}</b>\n\n` +
      `💵 النقد: <b>${money(Number(user.balance))}</b>\n` +
      `🏦 البنك: <b>${money(Number(user.bank_balance))}</b>\n` +
      `💎 الإجمالي: <b>${money(Number(user.balance) + Number(user.bank_balance))}</b>\n\n` +
      `🔥 سلسلة الأيام: ${daily.streak}\n` +
      `🎁 الراتب القادم: ${daily.canClaim ? "متاح الآن ✅" : `بعد ${formatDuration(daily.secondsRemaining)}`}\n` +
      `📈 فائدة البنك: ${bank.interestPercent}% يومياً`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🎁 راتب", callback_data: "daily:claim" }, { text: "🏦 البنك", callback_data: "bank:view" }],
          [{ text: "📜 السجل", callback_data: "history:show" }],
        ],
      },
      reply_parameters: isGroupChat(ctx) ? { message_id: ctx.msg?.message_id ?? 0, allow_sending_without_reply: true } : undefined,
    } as never,
  );
}

/** /daily */
export async function dailyCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  try {
    const result = await claimDaily(user.id, "bot");
    const fresh = await getDailyStatus({ ...user, streak: result.streak, last_daily: new Date().toISOString() });
    await replyTo(
      ctx,
      `🎁 <b>راتبك اليومي وصل!</b>\n\n` +
        `💰 المكافأة: <b>+${money(result.amount)}</b>\n` +
        `🎲 الأساس العشوائي: ${money(result.base)}\n` +
        `🔥 مكافأة السلسلة (${result.streak} يوم): ${money(result.streakBonus)}\n` +
        (result.multiplier > 1 ? `⚡ مضاعف: ×${result.multiplier}\n` : "") +
        `\n💳 رصيدك الآن: <b>${money(result.balance)}</b>\n` +
        `⏳ الراتب القادم بعد 24 ساعة`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🏦 إيداع في البنك", callback_data: "bank:view" }],
            [{ text: "🎲 العب الآن", callback_data: "games:menu" }],
          ],
        },
      },
    );
    void fresh;
  } catch (error) {
    const err = error as { code?: string; message?: string; meta?: { secondsRemaining?: number } };
    if (err.code === "COOLDOWN") {
      const seconds = Number(err.meta?.secondsRemaining ?? 0);
      await replyTo(
        ctx,
        `⏳ <b>لم يحن موعد راتبك بعد</b>\n\n` +
          `يعود راتبك بعد: <b>${formatDuration(seconds)}</b>\n` +
          `🔥 سلسلتك الحالية: ${user.streak} يوم — لا تفوتها!\n\n` +
          `💡 استخدم /bank لحماية رصيدك، أو /shop لاستخدامه.`,
      );
      return;
    }
    if (err.code === "BANNED") {
      await replyTo(ctx, "🚫 حسابك محظور.");
      return;
    }
    log.error("فشل الراتب اليومي", { telegramId: ctx.from?.id, error: err.message });
    await replyTo(ctx, "⚠️ تعذر تنفيذ الأمر. حاول مجدداً.");
  }
}

/** /profile */
export async function profileCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const [games, rob, daily, referrals, loans, bank] = await Promise.all([
    getUserGameStats(user.id),
    getRobStatus(user.id),
    getDailyStatus(user),
    getReferralInfo(user),
    getLoanInfo(user.id),
    getBankInfo(user),
  ]);

  await replyTo(
    ctx,
    `👤 <b>ملف ${tag(user.username)}</b>\n` +
      `🆔 المعرّف: <code>${user.telegram_id}</code>\n` +
      `📅 عضو منذ: ${formatDateAr(user.created_at)}\n` +
      (user.active_title ? `🏅 اللقب: ${user.active_title}\n` : "") +
      `\n💵 النقد: <b>${money(Number(user.balance))}</b> | 🏦 البنك: <b>${money(Number(user.bank_balance))}</b>\n` +
      `🔥 السلسلة: ${daily.streak} يوم\n\n` +
      `🎲 <b>الألعاب</b>\n` +
      `• عدد الجولات: ${games.played}\n` +
      `• إجمالي المراهنات: ${money(games.wagered)}\n` +
      `• الأرباح: ${money(games.winnings)}\n` +
      `• أكبر فوز: ${money(games.biggestWin)}\n\n` +
      `🕵️ السرقة: ${rob.available ? "متاحة" : `بعد ${formatDuration(rob.secondsRemaining)}`}\n` +
      `🎁 الإحالات: ${referrals.invitedCount} (${referrals.paidCount} مكتملة)\n` +
      `🏦 فائدة معلّقة: ${bank.pendingInterest} BTP\n` +
      `💰 القرض: ${loans.active ? `${money(loans.active.remaining)} متبقٍ` : loans.eligible ? "متاح" : loans.reason ?? "غير متاح"}`,
    { reply_markup: backToMenu() },
  );
}

/** /top */
export async function topCommand(ctx: Ctx) {
  const medal = ["🥇", "🥈", "🥉"];
  if (isGroupChat(ctx) && ctx.chat) {
    const board = await groupLeaderboard(ctx.chat.id, { limit: 10, meId: ctx.dbUser?.id });
    if (board.entries.length === 0) {
      await replyTo(ctx, "📊 لا يوجد لاعبون في هذا القروب بعد. العبوا /dice لظهوركم في القائمة!");
      return;
    }
    const lines = board.entries.map(
      (entry, index) => `${medal[index] ?? `${index + 1}.`} ${entry.activeTitle ? `${entry.activeTitle} ` : ""}${tag(entry.username)} — <b>${money(entry.balance)}</b>`,
    );
    await replyTo(ctx, `🏆 <b>أغنى أعضاء القروب</b>\n\n${lines.join("\n")}`);
    return;
  }

  const board = await globalLeaderboard({ limit: 10, meId: ctx.dbUser?.id });
  const lines = board.entries.map(
    (entry, index) => `${medal[index] ?? `${index + 1}.`} ${entry.activeTitle ? `${entry.activeTitle} ` : ""}${tag(entry.username)} — <b>${money(entry.balance)}</b>`,
  );
  const gamesBoard = await gamesLeaderboard(3);
  const gamesLines = gamesBoard.map((entry, index) => `${medal[index] ?? `${index + 1}.`} ${tag(entry.username)} — ${money(entry.score ?? 0)}`);

  await replyTo(
    ctx,
    `🌍 <b>الأغنى عالمياً</b>\n\n${lines.join("\n") || "لا يوجد لاعبون بعد"}\n\n` +
      (board.me ? `\n📍 ترتيبك: <b>#${board.me.rank}</b> برصيد <b>${money(board.me.balance)}</b>\n` : "") +
      `\n🎲 <b>أفضل لاعبي الألعاب</b>\n${gamesLines.join("\n") || "—"}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🌍 عالمي", callback_data: "top:global" }, { text: "💎 إحالات", callback_data: "top:refs" }],
        ],
      },
    },
  );
}

/** /history */
export async function historyCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const transactions = await getUserTransactions(user.id, 10);
  if (transactions.length === 0) {
    await replyTo(ctx, "📜 لا توجد عمليات بعد. ابدأ بـ /daily أو /dice!");
    return;
  }
  const labels: Record<string, string> = {
    daily: "🎁 راتب يومي",
    transfer: "💸 تحويل صادر",
    transfer_received: "💰 تحويل وارد",
    game_win: "🎲 ربح لعبة",
    game_bet: "🎲 خسارة لعبة",
    bank_deposit: "🏦 إيداع",
    bank_withdraw: "🏦 سحب",
    bank_interest: "📈 فائدة",
    shop_purchase: "🛒 شراء",
    redeem: "🎟 كود هدية",
    referral_reward: "🔗 مكافأة إحالة",
    rob_success: "🕵️ سرقة ناجحة",
    rob_failed: "🕵️ سرقة فاشلة",
    gift_sent: "🎁 هدية صادرة",
    gift_received: "🎁 هدية واردة",
    loan_granted: "🏦 قرض",
    loan_repayment: "🏦 سداد قرض",
    admin_credit: "🎖 منحة إدارية",
    admin_debit: "⚠️ خصم إداري",
    wealth_tax: "💸 ضريبة ثروة",
    welcome: "👋 رصيد ترحيبي",
  };
  const lines = transactions.map((tx) => {
    const isIncoming = tx.recipientId === Number(user.id);
    const sign = isIncoming ? "+" : "-";
    const amount = isIncoming ? tx.net : tx.amount;
    return (
      `${labels[tx.type] ?? tx.type} — <b>${sign}${money(Math.abs(amount))}</b>` +
      (tx.tax > 0 ? ` (ضريبة ${tx.tax})` : "") +
      `\n   <i>${formatDateAr(tx.createdAt)}</i>`
    );
  });
  await replyTo(ctx, `📜 <b>آخر 10 عمليات</b>\n\n${lines.join("\n\n")}`);
}

/** /referral */
export async function referralCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const info = await getReferralInfo(user);
  if (!info.enabled) {
    await replyTo(ctx, "🔗 نظام الإحالات معطّل حالياً.");
    return;
  }
  await replyTo(
    ctx,
    `🔗 <b>نظام إحالة BitPoin</b>\n\n` +
      `اربح <b>${info.rewardInviter} BTP</b> لكل صديق ينضم عبر رابطك، ويحصل هو على <b>${info.rewardInvitee} BTP</b>.\n\n` +
      `🔗 رابطك:\n<code>${info.link}</code>\n\n` +
      `👥 المدعوون: ${info.invitedCount}\n` +
      `✅ مكتملون: ${info.paidCount} | ⏳ قيد الانتظار: ${info.pendingCount}\n` +
      `💰 إجمالي أرباحك: <b>${money(info.earnings)}</b>\n\n` +
      `💡 شارك الرابط في القروبات، والمكافأة تُصرف عند أول نشاط للمدعو.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "📤 مشاركة الرابط",
              url: `https://t.me/share/url?url=${encodeURIComponent(info.link)}&text=${encodeURIComponent("انضم إلى BitPoin واحصل على مكافأة ترحيب!")}`,
            },
          ],
        ],
      },
    },
  );
}

export function registerBasicCommands(bot: Bot) {
  bot.command("start", startCommand);
  bot.command("help", helpCommand);
  bot.command(["balance", "b", "wallet"], balanceCommand);
  bot.command(["daily", "work"], dailyCommand);
  bot.command(["profile", "me"], profileCommand);
  bot.command(["top", "leaderboard"], topCommand);
  bot.command(["history", "log"], historyCommand);
  bot.command(["referral", "ref", "invite"], referralCommand);
}
