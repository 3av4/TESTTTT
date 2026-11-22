/**
 * تسجيل كل أوامر البوت + قائمة الأوامر الرسمية لدى تلجرام.
 */
import type { Bot } from "grammy";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import { ADMIN_COMMAND_LIST, PUBLIC_COMMANDS } from "../constants.js";
import { registerBasicCommands } from "./basic.js";
import { registerEconomyCommands } from "./economy.js";
import { registerGameCommands } from "./games.js";
import { registerShopCommands } from "./shop.js";
import { registerAdminCommands } from "./admin.js";
import { registerInfoCommands } from "./info.js";

const log = logger.child("bot-commands");

let commandsPublished = false;

export function registerCommands(bot: Bot) {
  registerBasicCommands(bot);
  registerEconomyCommands(bot);
  registerGameCommands(bot);
  registerShopCommands(bot);
  registerInfoCommands(bot);
  registerAdminCommands(bot);

  // توجيه الأوامر المكتوبة بدون / في الخاص
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim().toLowerCase();
    if (ctx.chat.type !== "private") return;
    if (text.startsWith("/")) return;
    if (["menu", "قائمة", "بداية", "start"].includes(text)) {
      await ctx.reply("استخدم /help لعرض كل الأوامر أو اختر من القائمة:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "💰 الرصيد", callback_data: "balance:show" }, { text: "🎁 راتب", callback_data: "daily:claim" }],
            [{ text: "🎲 ألعاب", callback_data: "games:menu" }, { text: "🛒 المتجر", callback_data: "shop:list" }],
          ],
        },
      });
    }
  });

  // نشر قائمة الأوامر (مرة واحدة لكل تشغيل)
  if (!commandsPublished) {
    commandsPublished = true;
    void publishCommands(bot);
  }
}

async function publishCommands(bot: Bot) {
  try {
    await bot.api.setMyCommands(PUBLIC_COMMANDS);
    if (config.ADMIN_IDS.length > 0) {
      await bot.api.setMyCommands(ADMIN_COMMAND_LIST, {
        scope: { type: "chat", chat_id: Number(config.ADMIN_IDS[0]) },
      }).catch(() => undefined);
    }
    log.info("تم نشر قائمة الأوامر");
  } catch (error) {
    log.warn("تعذر نشر قائمة الأوامر", { error: String(error) });
  }
}
