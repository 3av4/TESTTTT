/**
 * أوامر معلوماتية إضافية: /about /price /invite /search /help_group
 */
import type { Bot, Context } from "grammy";
import type { UserRow } from "../../services/users.js";
import { searchUsers } from "../../services/users.js";
import { getNumber, getString } from "../../services/settings.js";
import { getEconomyOverview } from "../../services/platformStats.js";
import { argsOf, money, replyTo } from "../helpers.js";

type Ctx = Context & { dbUser?: UserRow };

/** /about */
export async function aboutCommand(ctx: Ctx) {
  const symbol = await getString("currency_symbol");
  await replyTo(
    ctx,
    `ℹ️ <b>عن BitPoin (${symbol})</b>\n\n` +
      `عملة رقمية مجتمعية تعمل عبر بوت تلجرام وموقع ويب متكاملين بنفس الحساب والرصيد.\n\n` +
      `• الراتب اليومي: ${Math.round(await getNumber("daily_min"))}–${Math.round(await getNumber("daily_max"))} BTP\n` +
      `• ضريبة التحويل: ${await getNumber("transfer_tax_pct")}%\n` +
      `• ضريبة أرباح الألعاب: ${await getNumber("game_tax_pct")}%\n` +
      `• فائدة البنك: ${await getNumber("bank_interest_pct")}% يومياً\n\n` +
      `🔐 كل العمليات محفوظة ومسجلة، والأرصدة أعداد صحيحة داخل Transactions ذرّية.`,
  );
}

/** /price — مؤشرات الاقتصاد */
export async function priceCommand(ctx: Ctx) {
  const economy = await getEconomyOverview();
  await replyTo(
    ctx,
    `📈 <b>اقتصاد BitPoin اليوم</b>\n\n` +
      `🪙 المعروض: ${money(economy.totalSupply)}\n` +
      `🏛 الخزينة: ${money(economy.treasury)}\n` +
      `💵 مع المتداولين: ${money(economy.heldByUsers)}\n` +
      `🏦 في البنوك: ${money(economy.heldInBanks)}\n` +
      `📊 متوسط الرصيد: ${money(Math.round(economy.avgBalance))}\n\n` +
      `🔄 عمليات آخر 24 ساعة: ${economy.dailyTransactions}\n` +
      `📦 حجم التداول: ${money(economy.volume24h)}\n` +
      `🎁 رواتب مدفوعة: ${economy.dailyClaims24h}`,
  );
}

/** /search @user — عرض ملف عام */
export async function searchCommand(ctx: Ctx) {
  const query = argsOf(ctx).join(" ");
  if (!query) {
    await replyTo(ctx, "🔍 استخدم: <code>/search @username</code>");
    return;
  }
  const rows = await searchUsers(query, 5);
  if (rows.length === 0) {
    await replyTo(ctx, "🔍 لا نتائج.");
    return;
  }
  await replyTo(
    ctx,
    `🔍 <b>نتائج البحث</b>\n\n` +
      rows
        .map(
          (user) =>
            `• ${user.username ? `@${user.username}` : user.first_name ?? "لاعب"} — ${money(Number(user.balance))}` +
            `${user.active_title ? ` — ${user.active_title}` : ""}`,
        )
        .join("\n"),
  );
}

/** /guide — شرح الاستخدام للمبتدئين */
export async function guideCommand(ctx: Ctx) {
  await replyTo(
    ctx,
    `🎓 <b>دليل البداية السريعة</b>\n\n` +
      `1️⃣ /start — تفعيل حسابك\n` +
      `2️⃣ /daily — راتبك الأول (100–400 BTP)\n` +
      `3️⃣ /bank deposit 500 — احمِ رصيدك واحصل على فائدة يومية\n` +
      `4️⃣ /shop — اشترِ لقباً أو مضاعف راتب\n` +
      `5️⃣ /referral — شارك رابطك واربح من كل صديق\n` +
      `6️⃣ /top — تنافس على صدارة المتصدرين\n\n` +
      `🎲 جرّب الألعاب بحدود صغيرة أولاً: /dice 10\n` +
      `⚠️ تذكّر: 5% ضريبة على التحويلات وأرباح الألعاب.`,
  );
}

export function registerInfoCommands(bot: Bot) {
  bot.command(["about", "info"], aboutCommand);
  bot.command(["price", "economy", "market"], priceCommand);
  bot.command(["search", "find"], searchCommand);
  bot.command(["guide", "tutorial"], guideCommand);
}
