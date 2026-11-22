/**
 * ميدلوير البوت:
 *  1) التحقق من تفعيل البوت.
 *  2) تحميل/إنشاء المستخدم من قاعدة البيانات مرة واحدة لكل تحديث.
 *  3) التحقق من الحظر.
 *  4) إعدادات القروب (تفعيل/تعطيل).
 *  5) Rate limit لكل مستخدم.
 *  6) تتبع القروبات وإرسال الترحيب.
 *  7) اعتراض الأوامر غير المصرّح بها للأدمن فقط.
 */
import type { Bot, Context, NextFunction } from "grammy";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { errors } from "../errors.js";
import { getBoolean } from "../services/settings.js";
import { upsertTelegramUser, userIsAdmin, type UserRow } from "../services/users.js";
import { getGroupSettings } from "../services/groups.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { claimReferralReward } from "../services/referral.js";
import { ADMIN_COMMANDS, GROUP_ADMIN_COMMANDS } from "./constants.js";
import { isChannel, isGroupChat } from "./helpers.js";

const log = logger.child("bot-mw");

export interface BotStateContext {
  dbUser: UserRow | null;
  isAdmin: boolean;
  chatType: string;
}

/** تثبيت ميدلوير البوت على النسخة */
export function setupMiddleware(bot: Bot) {
  // 1) تفعيل البوت + فلترة القنوات
  bot.use(async (ctx: Context, next: NextFunction) => {
    if (!(await getBoolean("bot_enabled"))) return;
    if (isChannel(ctx)) return;
    await next();
  });

  // 2) تحميل المستخدم
  bot.use(async (ctx: Context, next: NextFunction) => {
    if (!ctx.from || ctx.from.is_bot) return;
    try {
      const user = await upsertTelegramUser({
        id: ctx.from.id,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        username: ctx.from.username,
      });
      (ctx as Context & { dbUser?: UserRow }).dbUser = user;
      if (user.is_banned) {
        if (ctx.chat?.type === "private") {
          await ctx.reply("🚫 حسابك محظور من استخدام BitPoin. للاعتراض تواصل مع الدعم.", {
            reply_parameters: { message_id: ctx.msg?.message_id ?? 0, allow_sending_without_reply: true },
          });
        }
        return;
      }
      // إشعارات الويبهوك: صرف مكافأة الإحالة عند أول استخدام
      if (!user.last_daily) {
        void claimReferralReward(user.id).catch(() => undefined);
      }
    } catch (error) {
      log.error("فشل تحميل مستخدم البوت", { telegramId: ctx.from.id, error: String(error) });
      return;
    }
    await next();
  });

  // 3) إعدادات القروب + الترحيب بالأعضاء الجدد
  bot.on("message:new_chat_members", async (ctx) => {
    if (!isGroupChat(ctx)) return;
    try {
      const settings = await getGroupSettings(ctx.chat.id, ctx.chat.title);
      if (!settings.enabled || !settings.welcomeEnabled) return;
      const names = ctx.message.new_chat_members
        .filter((member) => !member.is_bot)
        .map((member) => member.first_name)
        .join("، ");
      if (!names) return;
      const me = ctx.me.username;
      await ctx.reply(
        `👋 أهلاً ${names} في قروب BitPoin!\n\n` +
          `استخدم /help لمعرفة الأوامر، و/balance لعرض رصيدك، و/daily لراتبك اليومي.\n` +
          `يمكنك أيضاً اللعب مع الأصدقاء عبر /dice /coinflip /slots /roulette.`,
        {
          reply_parameters: { message_id: ctx.message.message_id, allow_sending_without_reply: true },
          reply_markup: {
            inline_keyboard: [
              [{ text: "📖 الأوامر", callback_data: "help:main" }, { text: "💰 راتبي", callback_data: "daily:claim" }],
            ],
          },
        },
      );
      void me;
    } catch {
      // تجاهل
    }
  });

  // 4) Rate limit + حماية أوامر الأدمن
  bot.use(async (ctx: Context, next: NextFunction) => {
    const user = ctx.from;
    if (!user) return;
    const inGroup = isGroupChat(ctx);

    const limited = await checkRateLimit(
      inGroup ? "bot:group" : "bot:private",
      String(user.id),
      inGroup ? 25 : 45,
      60,
    );
    if (!limited.allowed) {
      log.debug("تجاوز حد معدل البوت", { telegramId: user.id, chatId: ctx.chat?.id });
      return;
    }

    if (inGroup) {
      const settings = await getGroupSettings(ctx.chat!.id, ctx.chat!.type === "supergroup" ? ctx.chat!.title : undefined);
      if (!settings.enabled) return;
      (ctx as Context & { groupSettings?: typeof settings }).groupSettings = settings;

      if (!settings.economyEnabled) {
        const text = ctx.message?.text ?? "";
        if (/^\/(balance|send|gift|daily|bank|rob)\b/i.test(text)) {
          await ctx.reply("⚙️ تم تعطيل الأوامر الاقتصادية في هذا القروب. تواصل مع أدمن القروب.");
          return;
        }
      }
      if (!settings.gamesEnabled) {
        const text = ctx.message?.text ?? "";
        if (/^\/(dice|coinflip|slots|roulette)\b/i.test(text)) {
          await ctx.reply("🎲 تم تعطيل الألعاب في هذا القروب.");
          return;
        }
      }
    }

    // أوامر الأدمن
    const text = ctx.message?.text ?? "";
    const command = /^\/([a-zA-Z_]+)/.exec(text)?.[1]?.toLowerCase();
    if (command && ADMIN_COMMANDS.includes(command)) {
      const dbUser = (ctx as Context & { dbUser?: UserRow }).dbUser;
      const isAdmin = dbUser ? userIsAdmin(dbUser) : false;
      if (!isAdmin) {
        await ctx.reply("⛔ هذا الأمر مخصص للمديرين فقط.");
        return;
      }
      if (inGroup && !GROUP_ADMIN_COMMANDS.includes(command)) {
        await ctx.reply("🔒 أوامر الإدارة العامة تُستخدم في الخاص فقط لسجل تدقيق أوضح.");
        return;
      }
    }

    await next();
  });
}

/** التحقق من صلاحية الأدمن داخل الأوامر */
export function assertBotAdmin(ctx: Context): void {
  const dbUser = (ctx as Context & { dbUser?: UserRow }).dbUser;
  if (!dbUser || !userIsAdmin(dbUser)) {
    throw errors.forbidden("هذا الأمر للمديرين فقط");
  }
  void config;
}
