/**
 * المتجر داخل البوت: /shop /buy
 */
import type { Bot, Context } from "grammy";
import type { UserRow } from "../../services/users.js";
import { buyItem, listItems } from "../../services/shop.js";
import { getBoolean } from "../../services/settings.js";
import { argsOf, money, replyTo } from "../helpers.js";

type Ctx = Context & { dbUser?: UserRow };

/** /shop */
export async function shopCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!(await getBoolean("shop_enabled"))) {
    await replyTo(ctx, "🛒 المتجر معطّل حالياً.");
    return;
  }
  const items = await listItems(user?.id);
  if (items.length === 0) {
    await replyTo(ctx, "🛒 لا توجد عناصر متاحة حالياً.");
    return;
  }

  const kindLabel: Record<string, string> = {
    title: "🏅 لقب",
    boost: "⚡ مضاعف",
    shield: "🛡️ حماية",
    badge: "✅ شارة",
  };

  const lines = items.slice(0, 20).map((item) => {
    const stock = item.stock === null ? "∞" : String(item.stock);
    const owned = item.owned > 0 ? ` — تملك ${item.owned}` : "";
    return `${item.icon} <b>${item.name}</b> — ${money(item.price)}\n   <code>${item.code}</code> | ${kindLabel[item.kind] ?? item.kind} | مخزون: ${stock}${owned}\n   <i>${item.description}</i>`;
  });

  const buttons = items.slice(0, 8).map((item) => [
    { text: `${item.icon} ${item.name} (${item.price})`, callback_data: `shop:buy:${item.code}` },
  ]);

  await replyTo(
    ctx,
    `🛒 <b>متجر BitPoin</b>\n\n${lines.join("\n\n")}\n\n` +
      `💡 الشراء: <code>/buy code</code>\nمثال: <code>/buy title_king</code>\n` +
      `رصيدك: <b>${money(Number(user?.balance ?? 0))}</b>`,
    { reply_markup: { inline_keyboard: buttons } },
  );
}

/** /buy code */
export async function buyCommand(ctx: Ctx) {
  const user = ctx.dbUser;
  if (!user) return;
  const code = argsOf(ctx)[0]?.toLowerCase();
  if (!code) {
    await replyTo(ctx, "🛒 استخدم: <code>/buy code</code>\nمثال: <code>/buy title_whale</code>\nاعرف الأكواد من /shop");
    return;
  }
  try {
    const result = await buyItem(user.id, code, { source: "bot" });
    await replyTo(
      ctx,
      `✅ <b>تم الشراء</b>\n\n` +
        `${result.item.icon} ${result.item.name}\n` +
        `💸 السعر: ${money(result.price)}\n` +
        `💳 رصيدك: ${money(result.balance)}\n` +
        `📦 ${result.message}`,
    );
  } catch (error) {
    await replyTo(ctx, `❌ ${(error as Error).message}`);
  }
}

export function registerShopCommands(bot: Bot) {
  bot.command(["shop", "store"], shopCommand);
  bot.command(["buy", "purchase"], buyCommand);
}
