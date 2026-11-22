/**
 * إعدادات القروبات — لكل قروب إعدادات مستقلة يضبطها الأدمن.
 */
import { query, queryOne } from "../db.js";
import { errors } from "../errors.js";
import { toBigNumber } from "../utils.js";

export interface GroupSettings {
  chatId: number;
  title: string | null;
  enabled: boolean;
  gamesEnabled: boolean;
  economyEnabled: boolean;
  welcomeEnabled: boolean;
  dailyEnabled: boolean;
  logTransactions: boolean;
  minBet: number | null;
  maxBet: number | null;
  updatedAt: string;
}

function toGroup(row: Record<string, unknown>): GroupSettings {
  return {
    chatId: toBigNumber(row.chat_id),
    title: (row.title as string | null) ?? null,
    enabled: Boolean(row.enabled),
    gamesEnabled: Boolean(row.games_enabled),
    economyEnabled: Boolean(row.economy_enabled),
    welcomeEnabled: Boolean(row.welcome_enabled),
    dailyEnabled: Boolean(row.daily_enabled),
    logTransactions: Boolean(row.log_transactions),
    minBet: row.min_bet === null ? null : toBigNumber(row.min_bet),
    maxBet: row.max_bet === null ? null : toBigNumber(row.max_bet),
    updatedAt: String(row.updated_at),
  };
}

const DEFAULT_SETTINGS: GroupSettings = {
  chatId: 0,
  title: null,
  enabled: true,
  gamesEnabled: true,
  economyEnabled: true,
  welcomeEnabled: true,
  dailyEnabled: true,
  logTransactions: false,
  minBet: null,
  maxBet: null,
  updatedAt: new Date().toISOString(),
};

/** جلب إعدادات قروب (يُنشئ صفاً افتراضياً عند أول استخدام) */
export async function getGroupSettings(chatId: number, title?: string | null): Promise<GroupSettings> {
  const row = await queryOne<Record<string, unknown>>("SELECT * FROM group_settings WHERE chat_id = $1", [chatId]);
  if (row) {
    if (title && title !== row.title) {
      await query("UPDATE group_settings SET title = $1, updated_at = now() WHERE chat_id = $2", [title.slice(0, 100), chatId]);
    }
    return toGroup(row);
  }
  try {
    const created = await queryOne<Record<string, unknown>>(
      `INSERT INTO group_settings (chat_id, title) VALUES ($1, $2)
       ON CONFLICT (chat_id) DO UPDATE SET updated_at = now() RETURNING *`,
      [chatId, title?.slice(0, 100) ?? null],
    );
    return created ? toGroup(created) : { ...DEFAULT_SETTINGS, chatId, title: title ?? null };
  } catch {
    return { ...DEFAULT_SETTINGS, chatId, title: title ?? null };
  }
}

/** هل أوامر القروب مسموحة */
export async function isGroupEnabled(chatId: number): Promise<boolean> {
  const settings = await getGroupSettings(chatId);
  return settings.enabled;
}

/** تعديل إعدادات القروب (أدمن فقط — يُفرض في الراوت/الأمر) */
export async function updateGroupSettings(
  chatId: number,
  patch: Partial<Omit<GroupSettings, "chatId" | "updatedAt" | "title">> & { title?: string | null },
): Promise<GroupSettings> {
  const current = await getGroupSettings(chatId, patch.title ?? null);
  const next = { ...current, ...patch };
  if (next.minBet !== null && next.maxBet !== null && next.minBet > next.maxBet) {
    throw errors.badRequest("الحد الأدنى للرهان أكبر من الحد الأعلى");
  }
  const row = await queryOne<Record<string, unknown>>(
    `UPDATE group_settings SET enabled = $1, games_enabled = $2, economy_enabled = $3,
            welcome_enabled = $4, min_bet = $5, max_bet = $6, daily_enabled = $7,
            log_transactions = $8, updated_at = now()
     WHERE chat_id = $9 RETURNING *`,
    [
      next.enabled,
      next.gamesEnabled,
      next.economyEnabled,
      next.welcomeEnabled,
      next.minBet,
      next.maxBet,
      next.dailyEnabled,
      next.logTransactions,
      chatId,
    ],
  );
  return toGroup(row!);
}

/** حذف إعدادات قروب (عند إزالة البوت) */
export async function deleteGroupSettings(chatId: number): Promise<void> {
  await query("DELETE FROM group_settings WHERE chat_id = $1", [chatId]);
}

/** قائمة القروبات */
export async function listGroups(limit = 100): Promise<GroupSettings[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM group_settings ORDER BY updated_at DESC LIMIT $1",
    [Math.min(limit, 500)],
  );
  return rows.map(toGroup);
}

/** إحصائيات القروب */
export async function groupStats(chatId: number): Promise<{
  plays: number;
  wagered: number;
  uniquePlayers: number;
  totalBalance: number;
}> {
  const row = await queryOne<Record<string, string | null>>(
    `SELECT count(*) AS plays,
            COALESCE(sum(bet), 0) AS wagered,
            count(DISTINCT user_id) AS unique_players,
            (SELECT COALESCE(sum(u.balance), 0) FROM users u WHERE u.id IN (SELECT DISTINCT user_id FROM games WHERE chat_id = $1)) AS total_balance
     FROM games WHERE chat_id = $1`,
    [chatId],
  );
  return {
    plays: toBigNumber(row?.plays),
    wagered: toBigNumber(row?.wagered),
    uniquePlayers: toBigNumber(row?.unique_players),
    totalBalance: toBigNumber(row?.total_balance),
  };
}
