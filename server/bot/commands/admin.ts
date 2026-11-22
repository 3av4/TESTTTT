/**
 * أوامر الأدمن:
 * /addcoins /removecoins /ban /unban /broadcast /setfee /stats
 * /createcode /setoption /award /admin /setgroup
 */
import type { Bot, Context } from "grammy";
import type { UserRow } from "../../services/users.js";
import {
  findUserByUsername,
  getUserByTelegramId,
  getUserById,
  getSystemStats,
  resolveUser,
  setBanned,
  userIsAdmin,
  listUsers,
} from "../../services/users.js";
import { adminAdjust } from "../../services/ledger.js";
import { notify, notifyAll } from "../../services/notifications.js";
import { getEconomyOverview } from "../../services/platformStats.js";
import { createCode } from "../../services/codes.js";
import { listSettings, updateSetting, getTreasuryBalance, getNumber } from "../../services/settings.js";
import { updateGroupSettings } from "../../services/groups.js";
import { listAudit } from "../../services/audit.js";
import { audit } from "../../services/audit.js";
import { runBackup } from "../../backup.js";
import { loanStats } from "../../services/loans.js";
import { referralStats } from "../../services/referral.js";
import { formatAmount } from "../../utils.js";
import { ADMIN_COMMAND_LIST } from "../constants.js";
import { argsOf, money, restOf, replyTo } from "../helpers.js";

type Ctx = Context & { dbUser?: UserRow };

function actorOf(ctx: Ctx) {
  const user = ctx.dbUser;
  return {
    id: user ? Number(user.id) : null,
    label: user ? `${user.first_name ?? "أدمن"} (${user.telegram_id})` : "bot-admin",
  };
}

function isAdmin(ctx: Ctx): boolean {
  return Boolean(ctx.dbUser && userIsAdmin(ctx.dbUser));
}

/** استخراج الهدف والمبلغ من الأمر: /addcoins @user 100 سبب */
async function resolveTargetAndAmount(ctx: Ctx): Promise<{ target: UserRow; amount: number; reason: string } | null> {
  const replied = ctx.message?.reply_to_message?.from;
  const args = argsOf(ctx);

  let target: UserRow | null = null;
  let amountRaw: string | undefined;
  let reasonIndex = 1;

  if (replied && !replied.is_bot) {
    target = await getUserByTelegramId(replied.id);
    amountRaw = args[0];
    reasonIndex = 1;
  } else if (args[0]?.startsWith("@")) {
    target = await findUserByUsername(args[0]);
    amountRaw = args[1];
    reasonIndex = 2;
  } else if (args[0] && /^\d{5,15}$/.test(args[0])) {
    target = (await getUserByTelegramId(args[0])) ?? (await getUserById(args[0]));
    amountRaw = args[1];
    reasonIndex = 2;
  }

  if (!target) return null;
  const amount = Number.parseInt(String(amountRaw ?? ""), 10);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const reason = args.slice(reasonIndex).join(" ").slice(0, 200);
  return { target, amount, reason };
}

/** /addcoins */
export async function addCoinsCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const parsed = await resolveTargetAndAmount(ctx);
  if (!parsed) {
    await replyTo(ctx, "💰 <b>المنح</b>\n\n• <code>/addcoins @user 100 سبب</code>\n• أو بالرد: <code>/addcoins 100</code>");
    return;
  }
  const result = await adminAdjust({
    userId: Number(parsed.target.id),
    amount: parsed.amount,
    action: "add",
    actorId: actorOf(ctx).id,
    reason: parsed.reason || "منحة من الإدارة",
    source: "bot",
  });
  await audit({
    actorId: actorOf(ctx).id,
    actorLabel: actorOf(ctx).label,
    action: "credit",
    targetType: "user",
    targetId: parsed.target.id,
    details: { amount: parsed.amount, reason: parsed.reason, via: "bot" },
  });
  void notify({
    userId: Number(parsed.target.id),
    title: "💰 منحة إدارية",
    body: `أُضيف إلى رصيدك ${parsed.amount} BTP.${parsed.reason ? ` السبب: ${parsed.reason}` : ""}`,
    kind: "gift",
    telegram: true,
  }).catch(() => undefined);
  await replyTo(
    ctx,
    `✅ منحت <b>${money(parsed.amount)}</b> إلى ${parsed.target.username ? `@${parsed.target.username}` : parsed.target.first_name ?? "لاعب"}\n` +
      `💳 رصيده الآن: ${money(result.balance)}`,
  );
}

/** /removecoins */
export async function removeCoinsCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const parsed = await resolveTargetAndAmount(ctx);
  if (!parsed) {
    await replyTo(ctx, "⚠️ <b>الخصم</b>\n\n• <code>/removecoins @user 100 سبب</code>\n• أو بالرد: <code>/removecoins 100</code>");
    return;
  }
  try {
    const result = await adminAdjust({
      userId: Number(parsed.target.id),
      amount: parsed.amount,
      action: "remove",
      actorId: actorOf(ctx).id,
      reason: parsed.reason || "خصم من الإدارة",
      source: "bot",
    });
    await audit({
      actorId: actorOf(ctx).id,
      actorLabel: actorOf(ctx).label,
      action: "debit",
      targetType: "user",
      targetId: parsed.target.id,
      details: { amount: parsed.amount, reason: parsed.reason, via: "bot" },
    });
    void notify({
      userId: Number(parsed.target.id),
      title: "⚠️ خصم إداري",
      body: `خُصم من رصيدك ${parsed.amount} BTP.${parsed.reason ? ` السبب: ${parsed.reason}` : ""}`,
      kind: "warning",
      telegram: true,
    }).catch(() => undefined);
    await replyTo(ctx, `✅ خصمت <b>${money(parsed.amount)}</b>. رصيده الآن: ${money(result.balance)}`);
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

/** /ban /unban */
export async function banCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const args = argsOf(ctx);
  const replied = ctx.message?.reply_to_message?.from;
  let target: UserRow | null = null;
  if (replied && !replied.is_bot) target = await getUserByTelegramId(replied.id);
  if (!target && args[0]?.startsWith("@")) target = await findUserByUsername(args[0]);
  if (!target && args[0]) target = await resolveUser(args[0]);
  if (!target) {
    await replyTo(ctx, "🚫 <b>الحظر</b>\n\n• <code>/ban @user</code> أو بالرد على رسالة المستخدم");
    return;
  }
  if (userIsAdmin(target)) {
    await replyTo(ctx, "⛔ لا يمكن حظر مدير.");
    return;
  }
  const reason = args.filter((arg) => !arg.startsWith("@") && arg !== args[0]).join(" ").slice(0, 200);
  await setBanned(Number(target.id), true, actorOf(ctx).id);
  await audit({
    actorId: actorOf(ctx).id,
    actorLabel: actorOf(ctx).label,
    action: "ban",
    targetType: "user",
    targetId: target.id,
    details: { reason, via: "bot" },
  });
  await replyTo(ctx, `🚫 تم حظر ${target.username ? `@${target.username}` : target.first_name ?? "المستخدم"}${reason ? `\nالسبب: ${reason}` : ""}.`);
}

export async function unbanCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const args = argsOf(ctx);
  const replied = ctx.message?.reply_to_message?.from;
  let target: UserRow | null = null;
  if (replied && !replied.is_bot) target = await getUserByTelegramId(replied.id);
  if (!target && args[0]?.startsWith("@")) target = await findUserByUsername(args[0]);
  if (!target && args[0]) target = await resolveUser(args[0]);
  if (!target) {
    await replyTo(ctx, "✅ <b>فك الحظر</b>\n\n• <code>/unban @user</code> أو بالرد على رسالته");
    return;
  }
  await setBanned(Number(target.id), false, actorOf(ctx).id);
  await audit({
    actorId: actorOf(ctx).id,
    actorLabel: actorOf(ctx).label,
    action: "unban",
    targetType: "user",
    targetId: target.id,
    details: { via: "bot" },
  });
  await replyTo(ctx, `✅ تم فك حظر ${target.username ? `@${target.username}` : target.first_name ?? "المستخدم"}.`);
}

/** /broadcast رسالة */
export async function broadcastCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  if (ctx.chat?.type !== "private") {
    await replyTo(ctx, "🔒 البث يُنفَّذ من الخاص فقط.");
    return;
  }
  const message = restOf(ctx).replace(/^\s*/, "");
  if (!message) {
    await replyTo(ctx, "📢 <b>البث</b>\n\n• <code>/broadcast رسالتك هنا</code>\n• مثال: <code>/broadcast صيانة الليلة 12:00</code>");
    return;
  }
  await replyTo(ctx, "⏳ جارٍ إرسال البث لكل المستخدمين…");
  const result = await notifyAll({
    title: "📢 إعلان من فريق BitPoin",
    body: message,
    kind: "info",
    telegram: true,
    telegramHtml: `📢 <b>إعلان من فريق BitPoin</b>\n\n${message}`,
  });
  await audit({
    actorId: actorOf(ctx).id,
    actorLabel: actorOf(ctx).label,
    action: "broadcast",
    targetType: "all",
    targetId: null,
    details: { message: message.slice(0, 200), count: result.count, via: "bot" },
  });
  await replyTo(ctx, `✅ أُرسل البث إلى <b>${result.count}</b> مستخدم.`);
}

/** /setfee [transfer|game|wealth] [نسبة] */
export async function setFeeCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const args = argsOf(ctx);
  const map: Record<string, string> = {
    transfer: "transfer_tax_pct",
    game: "game_tax_pct",
    games: "game_tax_pct",
    wealth: "wealth_tax_pct",
    تحويل: "transfer_tax_pct",
    العاب: "game_tax_pct",
    ألعاب: "game_tax_pct",
    ثروة: "wealth_tax_pct",
  };
  const key = map[(args[0] ?? "").toLowerCase()];
  const value = args[1];

  if (!key || value === undefined) {
    const [transfer, game, wealth] = await Promise.all([
      getNumber("transfer_tax_pct"),
      getNumber("game_tax_pct"),
      getNumber("wealth_tax_pct"),
    ]);
    await replyTo(
      ctx,
      `⚙️ <b>الضرائب الحالية</b>\n\n` +
        `• التحويل: <b>${transfer}%</b>\n` +
        `• أرباح الألعاب: <b>${game}%</b>\n` +
        `• الثروة: <b>${wealth}%</b>\n\n` +
        `📝 التعديل: <code>/setfee transfer 5</code>\nالخيارات: transfer | game | wealth`,
    );
    return;
  }
  try {
    const row = await updateSetting(key, value, actorOf(ctx).id);
    await audit({
      actorId: actorOf(ctx).id,
      actorLabel: actorOf(ctx).label,
      action: "setting_update",
      targetType: "setting",
      targetId: key,
      details: { value, via: "bot" },
    });
    await replyTo(ctx, `✅ تم تعديل <b>${row.label}</b> إلى <b>${row.value}%</b>`);
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

/** /stats */
export async function statsCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const [stats, economy, loans, referrals, treasury, recentUsers, auditRows] = await Promise.all([
    getSystemStats(),
    getEconomyOverview(),
    loanStats(),
    referralStats(),
    getTreasuryBalance(),
    listUsers({ limit: 3, sort: "recent" }),
    listAudit({ limit: 3 }),
  ]);

  await replyTo(
    ctx,
    `📊 <b>إحصائيات BitPoin</b>\n\n` +
      `👥 المستخدمون: <b>${stats.totalUsers}</b> (نشطون اليوم: ${stats.activeToday})\n` +
      `🆕 اليوم: ${stats.newToday} | 🚫 محظورون: ${stats.bannedCount}\n\n` +
      `💰 النقد الكلي: ${formatAmount(economy.heldByUsers)}\n` +
      `🏦 أرصدة البنوك: ${formatAmount(economy.heldInBanks)}\n` +
      `🏛 الخزينة: <b>${formatAmount(treasury)}</b>\n` +
      `🪙 المعروض الإجمالي: ${formatAmount(economy.totalSupply)}\n\n` +
      `📈 عمليات اليوم: ${economy.dailyTransactions} بقيمة ${formatAmount(economy.volume24h)}\n` +
      `💸 ضرائب اليوم: ${formatAmount(economy.taxes24h)} | الإجمالي: ${formatAmount(economy.taxesCollected)}\n` +
      `🎲 ألعاب اليوم: ${economy.games24h} (${formatAmount(economy.gamesVolume24h)})\n` +
      `🎁 رواتب اليوم: ${economy.dailyClaims24h}\n\n` +
      `🏦 قروض نشطة: ${loans.active + loans.overdue} — متأخرة: ${loans.overdue}\n` +
      `🔗 إحالات مدفوعة: ${referrals.paid}\n\n` +
      `🆕 أحدث المستخدمين:\n${recentUsers.items.map((user) => `• ${user.first_name ?? "مستخدم"} (<code>${user.telegram_id}</code>)`).join("\n") || "—"}\n\n` +
      `📝 آخر إجراءات إدارية:\n${auditRows.map((row) => `• ${row.action} — ${row.actorLabel}`).join("\n") || "—"}`,
  );
}

/** /createcode [مبلغ] [عدد] [ساعات] */
export async function createCodeCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const args = argsOf(ctx);
  const amount = Number.parseInt(args[0] ?? "", 10);
  const maxUses = Number.parseInt(args[1] ?? "1", 10) || 1;
  const expiresInHours = Number.parseInt(args[2] ?? "0", 10) || undefined;

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    await replyTo(
      ctx,
      "🎟 <b>إنشاء كود هدية</b>\n\n" +
        "<code>/createcode 100</code> — كود لاستخدام واحد بقيمة 100\n" +
        "<code>/createcode 100 10</code> — 10 استخدامات\n" +
        "<code>/createcode 100 10 24</code> — صالح 24 ساعة",
    );
    return;
  }
  const code = await createCode({ amount, maxUses, expiresInHours, createdBy: actorOf(ctx).id });
  await audit({
    actorId: actorOf(ctx).id,
    actorLabel: actorOf(ctx).label,
    action: "create_code",
    targetType: "code",
    targetId: code.code,
    details: { amount, maxUses, via: "bot" },
  });
  await replyTo(
    ctx,
    `🎟 <b>تم إنشاء الكود</b>\n\n` +
      `<code>${code.code}</code>\n\n` +
      `💰 القيمة: ${money(code.amount)}\n` +
      `👥 الاستخدامات: ${code.maxUses}\n` +
      `⏳ الانتهاء: ${code.expiresAt ? new Date(code.expiresAt).toLocaleString("ar-DZ") : "بدون"}\n\n` +
      `📤 شاركه: <code>/redeem ${code.code}</code>`,
  );
}

/** /setoption key value */
export async function setOptionCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const args = argsOf(ctx);
  if (args.length < 2) {
    const rows = await listSettings();
    const grouped = rows.filter((row) => row.category === "economy" || row.category === "tax" || row.category === "daily").slice(0, 12);
    await replyTo(
      ctx,
      `⚙️ <b>إعدادات سريعة</b>\n\n` +
        `${grouped.map((row) => `• <code>${row.key}</code> = ${row.value} — ${row.label}`).join("\n")}\n\n` +
        `📝 التعديل: <code>/setoption transfer_tax_pct 5</code>`,
    );
    return;
  }
  try {
    const row = await updateSetting(args[0]!, args.slice(1).join(" "), actorOf(ctx).id);
    await audit({
      actorId: actorOf(ctx).id,
      actorLabel: actorOf(ctx).label,
      action: "setting_update",
      targetType: "setting",
      targetId: row.key,
      details: { value: row.value, via: "bot" },
    });
    await replyTo(ctx, `✅ <b>${row.label}</b> = <b>${row.value}</b>`);
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

/** /award — نسخة مختصرة من addcoins مع أسباب جاهزة */
export async function awardCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const parsed = await resolveTargetAndAmount(ctx);
  if (!parsed) {
    await replyTo(ctx, "🏆 <b>مكافأة</b>\n\n<code>/award @user 500 مسابقة</code>");
    return;
  }
  await adminAdjust({
    userId: Number(parsed.target.id),
    amount: parsed.amount,
    action: "add",
    actorId: actorOf(ctx).id,
    reason: parsed.reason || "مكافأة إدارية",
    source: "bot",
    type: "reward",
  });
  await audit({
    actorId: actorOf(ctx).id,
    actorLabel: actorOf(ctx).label,
    action: "award",
    targetType: "user",
    targetId: parsed.target.id,
    details: { amount: parsed.amount, reason: parsed.reason, via: "bot" },
  });
  await replyTo(ctx, `🏆 منحت مكافأة <b>${money(parsed.amount)}</b> لـ ${parsed.target.username ? `@${parsed.target.username}` : parsed.target.first_name ?? "لاعب"}.`);
}

/** /setgroup — إعدادات القروب الحالي (لأدمن القروب أو أدمن البوت) */
export async function setGroupCommand(ctx: Ctx) {
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    await replyTo(ctx, "⚙️ هذا الأمر داخل القروبات فقط.");
    return;
  }
  const args = argsOf(ctx);
  const chatId = ctx.chat.id;
  const globalAdmin = isAdmin(ctx);
  const member = await ctx.getChatMember(ctx.from!.id).catch(() => null);
  const chatAdmin = member?.status === "creator" || member?.status === "administrator";
  if (!globalAdmin && !chatAdmin) {
    await replyTo(ctx, "🔒 هذا الأمر لأدمن القروب فقط.");
    return;
  }

  const known: Record<string, { field: string; label: string }> = {
    games: { field: "gamesEnabled", label: "الألعاب" },
    games_enabled: { field: "gamesEnabled", label: "الألعاب" },
    economy: { field: "economyEnabled", label: "الاقتصاد" },
    economy_enabled: { field: "economyEnabled", label: "الاقتصاد" },
    welcome: { field: "welcomeEnabled", label: "الترحيب" },
    welcome_enabled: { field: "welcomeEnabled", label: "الترحيب" },
    daily: { field: "dailyEnabled", label: "الراتب اليومي" },
    daily_enabled: { field: "dailyEnabled", label: "الراتب اليومي" },
    logs: { field: "logTransactions", label: "سجل المعاملات" },
    log_transactions: { field: "logTransactions", label: "سجل المعاملات" },
    enabled: { field: "enabled", label: "البوت في القروب" },
  };

  const key = (args[0] ?? "").toLowerCase();
  const onOff = (args[1] ?? "").toLowerCase();

  if (!key) {
    const { getGroupSettings } = await import("../../services/groups.js");
    const settings = await getGroupSettings(chatId, ctx.chat.title);
    await replyTo(
      ctx,
      `⚙️ <b>إعدادات القروب</b>\n\n` +
        `• البوت: ${settings.enabled ? "✅" : "❌"}\n` +
        `• الألعاب: ${settings.gamesEnabled ? "✅" : "❌"}\n` +
        `• الاقتصاد: ${settings.economyEnabled ? "✅" : "❌"}\n` +
        `• الترحيب: ${settings.welcomeEnabled ? "✅" : "❌"}\n` +
        `• الراتب اليومي: ${settings.dailyEnabled ? "✅" : "❌"}\n` +
        `• سجل المعاملات: ${settings.logTransactions ? "✅" : "❌"}\n` +
        `• حدود الرهان: ${settings.minBet ?? "عام"} — ${settings.maxBet ?? "عام"}\n\n` +
        `📝 مثال: <code>/setgroup games off</code>\n` +
        `حدود: <code>/setgroup minbet 20</code> أو <code>/setgroup maxbet 500</code>`,
    );
    return;
  }

  try {
    if (key === "minbet" || key === "maxbet") {
      const value = Number.parseInt(args[1] ?? "", 10);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error("أدخل رقماً صالحاً");
      const settings = await updateGroupSettings(chatId, key === "minbet" ? { minBet: value } : { maxBet: value });
      await replyTo(ctx, `✅ تم ضبط ${key === "minbet" ? "الحد الأدنى" : "الحد الأعلى"} للرهان إلى ${money(value)}\n(نشط: ${settings.minBet ?? "عام"}–${settings.maxBet ?? "عام"})`);
      return;
    }
    const entry = known[key];
    if (!entry) {
      await replyTo(ctx, "❌ خيار غير معروف. الخيارات: games, economy, welcome, daily, logs, minbet, maxbet");
      return;
    }
    const value = ["on", "true", "1", "فعل", "تشغيل", "نعم"].includes(onOff);
    const settings = await updateGroupSettings(chatId, { [entry.field]: value } as never);
    await replyTo(ctx, `✅ ${entry.label}: ${value ? "مفعّل" : "معطّل"}`);
    void settings;
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

/** /admin — دليل الأوامر */
export async function adminHelpCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) {
    await replyTo(ctx, "⛔ هذا الأمر للمديرين فقط.");
    return;
  }
  await replyTo(
    ctx,
    `🛡 <b>أوامر الإدارة</b>\n\n` +
      `${ADMIN_COMMAND_LIST.map((cmd) => `• /${cmd.command} — ${cmd.description}`).join("\n")}\n\n` +
      `💾 <code>/backup</code> — نسخة احتياطية يدوية\n` +
      `👥 <code>/users [بحث]</code> — البحث عن مستخدم`,
  );
}

/** /backup */
export async function backupCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  await replyTo(ctx, "💾 جارٍ إنشاء نسخة احتياطية…");
  const result = await runBackup({ manual: true });
  if (result.ok) {
    await replyTo(ctx, `✅ تم إنشاء النسخة\n📁 <code>${result.file}</code>\n📦 ${(result.bytes ?? 0) / 1024} KB`);
  } else {
    await replyTo(ctx, `❌ فشل النسخ: ${result.error}`);
  }
}

/** /users [بحث] */
export async function usersCommand(ctx: Ctx) {
  if (!isAdmin(ctx)) return;
  const query = argsOf(ctx).join(" ");
  const { searchUsers } = await import("../../services/users.js");
  const rows = query ? await searchUsers(query, 10) : (await listUsers({ limit: 10 })).items;
  await replyTo(
    ctx,
    `👥 <b>المستخدمون</b>\n\n` +
      (rows
        .map(
          (user) =>
            `• ${user.is_banned ? "🚫 " : ""}${user.username ? `@${user.username}` : user.first_name ?? "لاعب"} ` +
            `— <code>${user.telegram_id}</code> — ${money(Number(user.balance))}`,
        )
        .join("\n") || "لا نتائج"),
  );
}

export function registerAdminCommands(bot: Bot) {
  bot.command(["addcoins", "givecoins"], addCoinsCommand);
  bot.command(["removecoins", "takecoins"], removeCoinsCommand);
  bot.command("ban", banCommand);
  bot.command("unban", unbanCommand);
  bot.command("broadcast", broadcastCommand);
  bot.command("setfee", setFeeCommand);
  bot.command("stats", statsCommand);
  bot.command("createcode", createCodeCommand);
  bot.command("setoption", setOptionCommand);
  bot.command("award", awardCommand);
  bot.command("setgroup", setGroupCommand);
  bot.command(["settings"], setGroupCommand);
  bot.command("admin", adminHelpCommand);
  bot.command("backup", backupCommand);
  bot.command("users", usersCommand);
}
