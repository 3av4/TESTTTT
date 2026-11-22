/**
 * أوامر الاقتصاد: /send /gift /redeem /bank /loan
 */
import type { Bot, Context } from "grammy";
import type { UserRow } from "../../services/users.js";
import { findUserByUsername, getUserByTelegramId } from "../../services/users.js";
import { sendCoins } from "../../services/transfer.js";
import { redeemCode } from "../../services/codes.js";
import { deposit, withdraw, estimateInterest } from "../../services/bank.js";
import { getLoanInfo, requestLoan, repayLoan } from "../../services/loans.js";
import { getNumber } from "../../services/settings.js";
import { argsOf, money, parseAmount, replyTo, tag } from "../helpers.js";

type Ctx = Context & { dbUser?: UserRow };

/** تحديد المستخدم الهدف: بالرد على رسالة أو بمنشن @username */
async function resolveTarget(ctx: Ctx): Promise<{ user: UserRow; amountArgIndex: number } | { error: string }> {
  const replied = ctx.message?.reply_to_message?.from;
  if (replied && !replied.is_bot) {
    const target = await getUserByTelegramId(replied.id);
    if (!target) return { error: "اللاعب المستهدف غير مسجل — عليه إرسال /start للبوت أولاً." };
    return { user: target, amountArgIndex: 0 };
  }

  const args = argsOf(ctx);
  const first = args[0];
  if (first?.startsWith("@")) {
    const target = await findUserByUsername(first);
    if (!target) return { error: "لم أجد هذا المستخدم. تأكد من اسمه أو استخدم الرد على رسالته." };
    return { user: target, amountArgIndex: 1 };
  }
  return { error: "حدّد المستلم بالرد على رسالته أو بمنشن @username" };
}

/** /send */
export async function sendCommand(ctx: Ctx) {
  const sender = ctx.dbUser;
  if (!sender) return;
  const args = argsOf(ctx);

  // /send 100 (بالرد) أو /send @user 100
  const target = await resolveTarget(ctx);
  if ("error" in target) {
    await replyTo(ctx, `💸 <b>طريقة التحويل</b>\n\n• <code>/send @user 100</code>\n• أو رد على رسالة الشخص واكتب <code>/send 100</code>\n\nضريبة التحويل: ${await getNumber("transfer_tax_pct")}%`);
    return;
  }

  const rawAmount = args[target.amountArgIndex];
  const amount = parseAmount(rawAmount);
  if (!amount) {
    await replyTo(ctx, "❌ مبلغ غير صالح. مثال: <code>/send @user 100</code>");
    return;
  }

  try {
    const result = await sendCoins({
      senderId: sender.id,
      recipient: target.user.id,
      amount,
      source: "bot",
    });
    await replyTo(
      ctx,
      `✅ <b>تم التحويل</b>\n\n` +
        `إلى: ${tag(target.user.username)}\n` +
        `المبلغ: <b>${money(amount)}</b>\n` +
        `الضريبة: ${money(result.tax)} (${result.taxPercent}%)\n` +
        `وصل للمستلم: <b>${money(result.net)}</b>\n` +
        `💳 رصيدك: <b>${money(result.senderBalance)}</b>`,
    );
  } catch (error) {
    const err = error as { code?: string; message?: string };
    await replyTo(ctx, `❌ ${err.message ?? "تعذر تنفيذ التحويل"}`);
  }
}

/** /gift — هدية عملات (بدون ضريبة إضافية، تُسجل كهدية) */
export async function giftCommand(ctx: Ctx) {
  const sender = ctx.dbUser;
  if (!sender) return;
  const args = argsOf(ctx);
  const target = await resolveTarget(ctx);
  if ("error" in target) {
    await replyTo(ctx, `🎁 <b>الإهداء</b>\n\n• <code>/gift @user 50</code>\n• أو بالرد: <code>/gift 50 مرحباً!</code>`);
    return;
  }
  const amount = parseAmount(args[target.amountArgIndex]);
  if (!amount) {
    await replyTo(ctx, "❌ مبلغ غير صالح. مثال: <code>/gift @user 50</code>");
    return;
  }
  const message = args.slice(target.amountArgIndex + 1).join(" ").slice(0, 100);
  try {
    const result = await sendCoins({
      senderId: sender.id,
      recipient: target.user.id,
      amount,
      note: message ? `هدية: ${message}` : "هدية",
      source: "bot",
    });
    const { notify } = await import("../../services/notifications.js");
    void notify({
      userId: Number(target.user.id),
      title: "🎁 وصلتك هدية",
      body: `${sender.first_name ?? "مستخدم"} أرسل لك ${result.net} BTP${message ? ` مع رسالة: «${message}»` : ""}.`,
      kind: "gift",
      telegram: true,
    }).catch(() => undefined);
    await replyTo(
      ctx,
      `🎁 <b>تم الإهداء</b>\n\nإلى: ${tag(target.user.username)}\n` +
        `المبلغ: <b>${money(amount)}</b> (وصل ${money(result.net)} بعد الضريبة)\n` +
        (message ? `الرسالة: «${message}»\n` : "") +
        `💳 رصيدك: <b>${money(result.senderBalance)}</b>`,
    );
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

/** /redeem CODE */
export async function redeemCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const code = argsOf(ctx)[0];
  if (!code) {
    await replyTo(ctx, "🎟 <b>استرداد كود</b>\n\nاستخدم: <code>/redeem CODE</code>\nمثال: /redeem BTPGIFT1");
    return;
  }
  try {
    const result = await redeemCode(user.id, code, "bot");
    await replyTo(
      ctx,
      `🎟 <b>تم استرداد الكود!</b>\n\n💰 أضيف لك: <b>${money(result.amount)}</b>\n💳 رصيدك: <b>${money(result.balance)}</b>`,
    );
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

/** /bank — عرض/إيداع/سحب */
export async function bankCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const args = argsOf(ctx);
  const action = args[0]?.toLowerCase();
  const amount = parseAmount(args[1]);
  const [minDeposit, interestPct, capacity] = await Promise.all([
    getNumber("bank_min_deposit"),
    getNumber("bank_interest_pct"),
    getNumber("bank_capacity"),
  ]);

  try {
    if (action === "deposit" || action === "dep" || action === "إيداع") {
      if (!amount) {
        await replyTo(ctx, `🏦 استخدم: <code>/bank deposit ${Math.round(minDeposit)}</code>`);
        return;
      }
      const result = await deposit(user.id, amount, "bot");
      await replyTo(
        ctx,
        `🏦 <b>تم الإيداع</b>\n\nالمبلغ: ${money(amount)}\n` +
          `رصيد البنك: <b>${money(result.bankBalance)}</b>\n` +
          `رصيدك النقدي: ${money(result.balance)}` +
          (result.interestCredited ? `\n📈 فائدة مضافة: ${money(result.interestCredited)}` : ""),
      );
      return;
    }
    if (action === "withdraw" || action === "with" || action === "سحب") {
      if (!amount) {
        await replyTo(ctx, `🏦 استخدم: <code>/bank withdraw 100</code>`);
        return;
      }
      const result = await withdraw(user.id, amount, "bot");
      await replyTo(
        ctx,
        `🏦 <b>تم السحب</b>\n\nالمبلغ: ${money(amount)}\n` +
          `رصيدك النقدي: <b>${money(result.balance)}</b>\n` +
          `رصيد البنك: ${money(result.bankBalance)}` +
          (result.interestCredited ? `\n📈 فائدة مضافة: ${money(result.interestCredited)}` : ""),
      );
      return;
    }

    const pending = estimateInterest(Number(user.bank_balance), interestPct, capacity);
    await replyTo(
      ctx,
      `🏦 <b>بنك BitPoin</b>\n\n` +
        `💰 رصيد البنك: <b>${money(Number(user.bank_balance))}</b>\n` +
        `💵 رصيدك النقدي: <b>${money(Number(user.balance))}</b>\n\n` +
        `📈 الفائدة: <b>${interestPct}%</b> يومياً (مرة كل 24 ساعة)\n` +
        `⏳ الفائدة المتوقعة عند الاستحقاق: <b>${money(pending)} BTP</b>\n` +
        `💎 سعة البنك: ${money(Math.round(capacity))}\n\n` +
        `🛡 أموال البنك محمية من السرقة.\n` +
        `• <code>/bank deposit 500</code> — إيداع\n` +
        `• <code>/bank withdraw 200</code> — سحب`,
      { reply_markup: { inline_keyboard: [[{ text: "🏦 لوحة البنك", callback_data: "bank:view" }]] } },
    );
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

/** /loan — عرض/طلب/سداد */
export async function loanCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const args = argsOf(ctx);
  const action = args[0]?.toLowerCase();
  const amount = parseAmount(args[1]);

  try {
    if (action === "repay" || action === "سداد") {
      const result = await repayLoan(user.id, amount ? { amount } : undefined, "bot");
      await replyTo(
        ctx,
        `🏦 <b>تم السداد</b>\n\nدفعت: ${money(result.paid)}\n` +
          `المتبقي: ${money(result.remaining)}\n` +
          `💳 رصيدك: ${money(result.balance)}` +
          (result.closed ? "\n✅ تم إغلاق القرض بالكامل!" : ""),
      );
      return;
    }
    if (amount) {
      const result = await requestLoan(user.id, amount, "bot");
      await replyTo(
        ctx,
        `🏦 <b>تم منحك القرض</b>\n\n` +
          `استلمت: <b>${money(amount)}</b>\n` +
          `المبلغ المستحق: <b>${money(result.loan.totalDue)}</b>\n` +
          `تاريخ الاستحقاق: ${new Date(result.loan.dueAt).toLocaleDateString("ar-DZ")}\n` +
          `💳 رصيدك: ${money(result.balance)}\n\n` +
          `💡 السداد: <code>/loan repay</code>`,
      );
      return;
    }

    const info = await getLoanInfo(user.id);
    await replyTo(
      ctx,
      `🏦 <b>قروض BitPoin</b>\n\n` +
        (info.active
          ? `📌 قرض نشط:\n• أصل القرض: ${money(info.active.principal)}\n• المستحق: ${money(info.active.totalDue)}\n• المدفوع: ${money(info.active.paid)}\n• المتبقي: <b>${money(info.active.remaining)}</b>\n• الساعات المتبقية: ${info.active.hoursLeft}\n${info.active.isOverdue ? "⚠️ <b>القرض متأخر!</b>\n" : ""}\n• السداد: <code>/loan repay</code>`
          : info.eligible
            ? `✅ يمكنك طلب قرض حتى <b>${money(info.maxAmount)}</b> بفائدة ${info.interestPercent}%.\nمثال: <code>/loan 1000</code>`
            : `⛔ ${info.reason ?? "غير متاح حالياً"}`),
    );
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

/** /history inside group shows lighter output */
export function registerEconomyCommands(bot: Bot) {
  bot.command(["send", "transfer", "pay"], sendCommand);
  bot.command(["gift"], giftCommand);
  bot.command(["redeem"], redeemCommand);
  bot.command(["bank"], bankCommand);
  bot.command(["loan", "loans"], loanCommand);
}
