/**
 * المتصدرون: عالمياً وداخل القروبات.
 */
import { query, queryOne } from "../db.js";
import { toBigNumber } from "../utils.js";

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  telegramId: number;
  username: string | null;
  name: string;
  activeTitle: string | null;
  balance: number;
  score?: number;
  isMe?: boolean;
}

export interface LeaderboardResult {
  scope: "global" | "group";
  chatId: number | null;
  title: string;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  updatedAt: string;
}

/** المتصدرون عالمياً حسب الرصيد */
export async function globalLeaderboard(options?: { limit?: number; meId?: number | string; offset?: number }): Promise<LeaderboardResult> {
  const limit = Math.min(Math.max(options?.limit ?? 25, 1), 100);
  const rows = await query<{
    id: string;
    telegram_id: string;
    username: string | null;
    first_name: string | null;
    active_title: string | null;
    balance: string;
  }>(
    `SELECT id, telegram_id, username, first_name, active_title, balance
     FROM users WHERE is_banned = false AND role <> 'system'
     ORDER BY balance DESC, created_at ASC
     LIMIT $1 OFFSET $2`,
    [limit, options?.offset ?? 0],
  );

  const entries: LeaderboardEntry[] = rows.map((row, index) => ({
    rank: (options?.offset ?? 0) + index + 1,
    userId: toBigNumber(row.id),
    telegramId: toBigNumber(row.telegram_id),
    username: row.username,
    name: row.first_name ?? "لاعب",
    activeTitle: row.active_title,
    balance: toBigNumber(row.balance),
    isMe: options?.meId ? toBigNumber(row.id) === toBigNumber(options.meId) : false,
  }));

  let me: LeaderboardEntry | null = null;
  if (options?.meId) {
    const mine = await queryOne<{ rank: string; id: string; telegram_id: string; username: string | null; first_name: string | null; active_title: string | null; balance: string }>(
      `SELECT rank, id, telegram_id, username, first_name, active_title, balance FROM (
         SELECT id, telegram_id, username, first_name, active_title, balance,
                ROW_NUMBER() OVER (ORDER BY balance DESC, created_at ASC) AS rank
         FROM users WHERE is_banned = false AND role <> 'system'
       ) ranked WHERE id = $1`,
      [options.meId],
    );
    if (mine) {
      me = {
        rank: toBigNumber(mine.rank),
        userId: toBigNumber(mine.id),
        telegramId: toBigNumber(mine.telegram_id),
        username: mine.username,
        name: mine.first_name ?? "لاعب",
        activeTitle: mine.active_title,
        balance: toBigNumber(mine.balance),
        isMe: true,
      };
    }
  }

  return { scope: "global", chatId: null, title: "الأغنى عالمياً 🌍", entries, me, updatedAt: new Date().toISOString() };
}

/**
 * متصدرو قروب محدد.
 * ملاحظة: لا يوجد جدول أعضاء منفصل، لذلك نعتمد على اللاعبين الذين تفاعلوا
 * داخل نفس القروب (ألعاب/عمليات مسجّلة بـ chat_id) — وهو الأنسب للخصوصية.
 */
export async function groupLeaderboard(chatId: number, options?: { limit?: number; meId?: number | string }): Promise<LeaderboardResult> {
  const limit = Math.min(Math.max(options?.limit ?? 15, 1), 50);
  const rows = await query<{
    id: string;
    telegram_id: string;
    username: string | null;
    first_name: string | null;
    active_title: string | null;
    balance: string;
    games: string;
  }>(
    `SELECT u.id, u.telegram_id, u.username, u.first_name, u.active_title, u.balance, count(g.id) AS games
     FROM users u
     JOIN games g ON g.user_id = u.id
     WHERE g.chat_id = $1 AND u.is_banned = false
     GROUP BY u.id
     ORDER BY u.balance DESC
     LIMIT $2`,
    [chatId, limit],
  );

  const entries: LeaderboardEntry[] = rows.map((row, index) => ({
    rank: index + 1,
    userId: toBigNumber(row.id),
    telegramId: toBigNumber(row.telegram_id),
    username: row.username,
    name: row.first_name ?? "لاعب",
    activeTitle: row.active_title,
    balance: toBigNumber(row.balance),
    score: toBigNumber(row.games),
    isMe: options?.meId ? toBigNumber(row.id) === toBigNumber(options.meId) : false,
  }));

  const me = options?.meId ? entries.find((entry) => toBigNumber(entry.userId) === toBigNumber(options.meId!)) ?? null : null;

  return {
    scope: "group",
    chatId,
    title: "أغنى أعضاء القروب 👥",
    entries,
    me: me ? { ...me, isMe: true } : null,
    updatedAt: new Date().toISOString(),
  };
}

/** أكثر الرابحين في الألعاب */
export async function gamesLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const rows = await query<{
    user_id: string;
    telegram_id: string;
    username: string | null;
    first_name: string | null;
    active_title: string | null;
    net: string;
    balance: string;
  }>(
    `SELECT g.user_id, u.telegram_id, u.username, u.first_name, u.active_title, sum(g.payout - g.bet) AS net, u.balance
     FROM games g JOIN users u ON u.id = g.user_id
     WHERE u.is_banned = false
     GROUP BY g.user_id, u.telegram_id, u.username, u.first_name, u.active_title, u.balance
     ORDER BY net DESC LIMIT $1`,
    [Math.min(limit, 50)],
  );
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: toBigNumber(row.user_id),
    telegramId: toBigNumber(row.telegram_id),
    username: row.username,
    name: row.first_name ?? "لاعب",
    activeTitle: row.active_title,
    balance: toBigNumber(row.balance),
    score: toBigNumber(row.net),
  }));
}

/** أفضل الداعين (الإحالات) */
export async function referralLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const rows = await query<{
    id: string;
    telegram_id: string;
    username: string | null;
    first_name: string | null;
    active_title: string | null;
    balance: string;
    earnings: string;
    count: string;
  }>(
    `SELECT u.id, u.telegram_id, u.username, u.first_name, u.active_title, u.balance,
            COALESCE(sum(r.reward) FILTER (WHERE r.status = 'paid'), 0) AS earnings,
            count(r.id) AS count
     FROM users u LEFT JOIN referral_claims r ON r.inviter_id = u.id
     WHERE u.is_banned = false
     GROUP BY u.id HAVING count(r.id) > 0
     ORDER BY count DESC, earnings DESC LIMIT $1`,
    [Math.min(limit, 50)],
  );
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: toBigNumber(row.id),
    telegramId: toBigNumber(row.telegram_id),
    username: row.username,
    name: row.first_name ?? "لاعب",
    activeTitle: row.active_title,
    balance: toBigNumber(row.balance),
    score: toBigNumber(row.count),
  }));
}
