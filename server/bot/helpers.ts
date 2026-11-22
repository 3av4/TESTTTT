/**
 * أنواع وأدوات مساعدة خاصة بالبوت.
 */
import type { Context } from "grammy";
import { config } from "../config.js";
import { escapeHtml } from "../services/notifications.js";
import { formatAmount } from "../utils.js";

export interface BotUser {
  userId: number;
  telegramId: number;
  username: string | null;
  displayName: string;
  isAdmin: boolean;
  chatId: number;
  chatType: string;
  isGroup: boolean;
}

/** معرّف المستخدم من السياق (يتجاهل أنشطة القروبات للبوتات الأخرى) */
export function userIdOf(ctx: Context): number | null {
  return ctx.from?.id ?? null;
}

/** هل الرسالة في قروب/سوبر قروب؟ */
export function isGroupChat(ctx: Context): boolean {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

/** هل السياق في قناة؟ */
export function isChannel(ctx: Context): boolean {
  return ctx.chat?.type === "channel";
}

/** إزالة @BotName من نهاية الأوامر كما يرسلها تلجرام في القروبات */
export function stripBotMention(text: string): string {
  if (!config.BOT_USERNAME) return text;
  return text.replace(new RegExp(`@${config.BOT_USERNAME}\\b`, "gi"), "").trim();
}

/** استخراج وسوم (args) بعد الأمر */
export function argsOf(ctx: Context): string[] {
  const text = ctx.message?.text ?? "";
  const cleaned = stripBotMention(text);
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts.slice(1);
}

/** النص الكامل بعد الأمر */
export function restOf(ctx: Context): string {
  const text = stripBotMention(ctx.message?.text ?? "");
  const index = text.indexOf(" ");
  return index === -1 ? "" : text.slice(index + 1).trim();
}

/** تحويل مبلغ نصي إلى عدد صحيح */
export function parseAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[,_\s]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

/** رسالة آمِنة (HTML) */
export async function say(ctx: Context, html: string, extra?: Parameters<Context["reply"]>[1]) {
  try {
    return await ctx.reply(html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(extra as object),
    } as never);
  } catch {
    // تراجع لرسالة نصية عند فشل HTML
    const plain = html.replace(/<[^>]+>/g, "").slice(0, 4000);
    return ctx.reply(plain).catch(() => undefined);
  }
}

/** رد على الرسالة مع اقتباس (مفيد في القروبات) */
export async function replyTo(ctx: Context, html: string, extra?: Parameters<Context["reply"]>[1]) {
  return say(ctx, html, {
    reply_parameters: { message_id: ctx.message?.message_id ?? 0, allow_sending_without_reply: true },
    ...(extra as object),
  } as never);
}

export function money(amount: number): string {
  return formatAmount(amount, "BTP");
}

export function html(text: string): string {
  return escapeHtml(text);
}

/** اسم المستخدم بصيغة @ */
export function tag(username: string | null | undefined): string {
  return username ? `@${username}` : "لاعب";
}

/** رقم عشوائي آمن */
export function pick<T>(items: T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[Math.min(index, items.length - 1)]!;
}
