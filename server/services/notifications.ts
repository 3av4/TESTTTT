/**
 * الإشعارات: تخزين في قاعدة البيانات + بث لحظي + إرسال عبر تلجرام.
 * كل عملية من الموقع تُطلق إشعاراً في البوت والعكس، حسب تفضيلات الأحداث.
 */
import { query, queryOne } from "../db.js";
import { logger } from "../logger.js";
import { toBigNumber } from "../utils.js";
import { events } from "./events.js";
import { getUserById } from "./users.js";

const log = logger.child("notify");

export type NotificationKind = "info" | "success" | "warning" | "danger" | "gift";

export interface NotificationRow {
  id: number;
  title: string;
  body: string;
  kind: NotificationKind;
  isRead: boolean;
  createdAt: string;
}

let telegramSender: ((chatId: number, html: string) => Promise<boolean>) | null = null;

/** يربط البوت دالة الإرسال — يُستدعى عند تهيئة البوت */
export function registerTelegramSender(sender: (chatId: number, html: string) => Promise<boolean>): void {
  telegramSender = sender;
  log.info("تم ربط قناة إشعارات تلجرام");
}

/** إرسال رسالة تلجرام مباشرة إلى مستخدم (إن كان البوت جاهزاً) */
export async function sendTelegramToUser(
  userId: number | string,
  html: string,
  options?: { silent?: boolean },
): Promise<boolean> {
  if (!telegramSender) return false;
  const user = await getUserById(userId);
  if (!user) return false;
  try {
    return await telegramSender(toBigNumber(user.telegram_id), html);
  } catch (error) {
    log.debug("تعذر إرسال رسالة تلجرام", { userId, error: String(error), silent: options?.silent });
    return false;
  }
}

export interface NotifyOptions {
  userId: number | string;
  title: string;
  body?: string;
  kind?: NotificationKind;
  /** هل أيضاً إشعار تلجرام */
  telegram?: boolean;
  /** نص مخصص لتلجرام بصيغة HTML */
  telegramHtml?: string;
  silentTelegram?: boolean;
}

/** إنشاء إشعار (قاعدة بيانات + realtime + تلجرام) */
export async function notify(options: NotifyOptions): Promise<NotificationRow> {
  const kind = options.kind ?? "info";
  const row = await queryOne<{ id: string; created_at: string }>(
    `INSERT INTO notifications (user_id, title, body, kind)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [options.userId, options.title.slice(0, 200), (options.body ?? "").slice(0, 2000), kind],
  );

  events.emitEvent("notification", {
    userId: toBigNumber(options.userId),
    title: options.title,
    body: options.body ?? "",
    kind,
    telegram: options.telegram,
  });

  if (options.telegram) {
    void sendTelegramToUser(
      options.userId,
      options.telegramHtml ?? `<b>${escapeHtml(options.title)}</b>\n${escapeHtml(options.body ?? "")}`,
      { silent: options.silentTelegram },
    ).catch(() => undefined);
  }

  return {
    id: toBigNumber(row?.id),
    title: options.title,
    body: options.body ?? "",
    kind,
    isRead: false,
    createdAt: row?.created_at ?? new Date().toISOString(),
  };
}

/** إشعار جماعي (بث) — يُخزَّن لكل مستخدم ويُرسل عبر تلجرام تدريجياً */
export async function notifyAll(options: {
  title: string;
  body: string;
  kind?: NotificationKind;
  telegram?: boolean;
  telegramHtml?: string;
}): Promise<{ count: number }> {
  const rows = await query<{ id: string }>("SELECT id FROM users WHERE is_banned = false");
  if (rows.length === 0) return { count: 0 };

  // إدخال جماعي دفعة واحدة
  const values: unknown[] = [];
  const placeholders: string[] = [];
  const kind = options.kind ?? "info";
  rows.forEach((row, index) => {
    const base = index * 4;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    values.push(row.id, options.title.slice(0, 200), options.body.slice(0, 2000), kind);
  });

  const CHUNK = 400;
  for (let i = 0; i < placeholders.length; i += CHUNK) {
    const slice = placeholders.slice(i, i + CHUNK);
    const sliceValues = values.slice(i * 4, (i + CHUNK) * 4);
    await query(
      `INSERT INTO notifications (user_id, title, body, kind) VALUES ${slice.join(", ")}`,
      sliceValues,
    );
  }

  for (const row of rows) {
    events.emitEvent("notification", {
      userId: toBigNumber(row.id),
      title: options.title,
      body: options.body,
      kind,
    });
  }

  if (options.telegram && telegramSender) {
    const html = options.telegramHtml ?? `<b>${escapeHtml(options.title)}</b>\n${escapeHtml(options.body)}`;
    // إرسال متوازٍ محدود لتجنب تجاوز حدود تلجرام
    const users = await query<{ telegram_id: string }>("SELECT telegram_id FROM users WHERE is_banned = false");
    let sent = 0;
    let failed = 0;
    const queue = [...users];
    const workers = Array.from({ length: 5 }, async () => {
      while (queue.length) {
        const user = queue.shift();
        if (!user || !telegramSender) continue;
        try {
          const ok = await telegramSender(toBigNumber(user.telegram_id), html);
          ok ? sent++ : failed++;
        } catch {
          failed++;
        }
        await new Promise((resolve) => setTimeout(resolve, 45));
      }
    });
    await Promise.all(workers);
    log.info("بث تلجرام مكتمل", { sent, failed, total: users.length });
  }

  return { count: rows.length };
}

/** إشعارات مستخدم */
export async function listNotifications(userId: number | string, limit = 30): Promise<NotificationRow[]> {
  const rows = await query<{
    id: string;
    title: string;
    body: string;
    kind: NotificationKind;
    is_read: boolean;
    created_at: string;
  }>(
    `SELECT id, title, body, kind, is_read, created_at
     FROM notifications WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map((row) => ({
    id: toBigNumber(row.id),
    title: row.title,
    body: row.body,
    kind: row.kind,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));
}

/** تعليم إشعار كمقروء */
export async function markRead(userId: number | string, notificationId?: number): Promise<void> {
  if (notificationId) {
    await query("UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2", [notificationId, userId]);
  } else {
    await query("UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false", [userId]);
  }
}

/** عدد الإشعارات غير المقروءة */
export async function unreadCount(userId: number | string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT count(*) AS count FROM notifications WHERE user_id = $1 AND is_read = false",
    [userId],
  );
  return toBigNumber(row?.count);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
