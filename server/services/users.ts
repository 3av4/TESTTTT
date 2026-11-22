/**
 * خدمة المستخدمين — التسجيل، الجلب، الحظر، الأدوار، الإحصائيات.
 */
import { query, queryOne, withTransaction } from "../db.js";
import { config, isAdminTelegramId } from "../config.js";
import { errors } from "../errors.js";
import { generateCode, sanitizeDisplayName, toBigNumber } from "../utils.js";
import { getNumber } from "./settings.js";
import { logger } from "../logger.js";

export interface UserRow {
  id: string;
  telegram_id: string;
  username: string | null;
  first_name: string | null;
  photo_url: string | null;
  balance: string;
  created_at: string;
  last_daily: string | null;
  streak: number;
  is_banned: boolean;
  role: string;
  referral_code: string | null;
  referred_by: string | null;
  referral_earnings: string;
  bank_balance: string;
  last_bank_interest: string | null;
  last_rob_at: string | null;
  items: Record<string, unknown>;
  active_title: string | null;
  total_wagered: string;
  total_won: string;
  games_played: number;
  daily_count: number;
  bank_count: number;
  last_seen_at: string;
}

export interface PublicUser {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string;
  photoUrl: string | null;
  balance: number;
  bankBalance: number;
  role: "user" | "admin";
  isBanned: boolean;
  streak: number;
  lastDaily: string | null;
  referralCode: string | null;
  referralEarnings: number;
  activeTitle: string | null;
  totalWagered: number;
  totalWon: number;
  gamesPlayed: number;
  createdAt: string;
}

export interface TelegramProfile {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

/** تحويل صف قاعدة البيانات إلى كائن عام آمن */
export function toPublicUser(row: UserRow): PublicUser {
  const fullName = [row.first_name, row.username ? `@${row.username}` : ""].filter(Boolean).join(" ");
  return {
    id: toBigNumber(row.id),
    telegramId: toBigNumber(row.telegram_id),
    username: row.username,
    firstName: sanitizeDisplayName(fullName, "مستخدم"),
    photoUrl: row.photo_url,
    balance: toBigNumber(row.balance),
    bankBalance: toBigNumber(row.bank_balance),
    role: row.role === "admin" ? "admin" : "user",
    isBanned: row.is_banned,
    streak: row.streak,
    lastDaily: row.last_daily,
    referralCode: row.referral_code,
    referralEarnings: toBigNumber(row.referral_earnings),
    activeTitle: row.active_title,
    totalWagered: toBigNumber(row.total_wagered),
    totalWon: toBigNumber(row.total_won),
    gamesPlayed: row.games_played,
    createdAt: row.created_at,
  };
}

/** صف المستخدم كما يظهر للآخرين (توب، تحويل) */
export interface UserBrief {
  id: number;
  telegramId: number;
  username: string | null;
  displayName: string;
  activeTitle: string | null;
  balance: number;
}

export function toUserBrief(row: UserRow): UserBrief {
  return {
    id: toBigNumber(row.id),
    telegramId: toBigNumber(row.telegram_id),
    username: row.username,
    displayName: sanitizeDisplayName(
      [row.first_name, row.username ? `@${row.username}` : ""].filter(Boolean).join(" "),
      "لاعب",
    ),
    activeTitle: row.active_title,
    balance: toBigNumber(row.balance),
  };
}

function uniqueReferralCode(): string {
  return `BTP${generateCode(6)}`;
}

/**
 * إصلاح/إنشاء مستخدم من بيانات تلجرام — يُستخدم من الموقع والبوت.
 * إن كان المستخدم جديداً يُمنح رصيد الترحيب (إن لم يكن مدعوّاً؛ المدعو يُكافأ لاحقاً).
 */
export async function upsertTelegramUser(profile: TelegramProfile): Promise<UserRow> {
  const telegramId = String(profile.id);
  if (!/^\d{5,15}$/.test(telegramId)) throw errors.badRequest("معرّف تلجرام غير صالح");

  const firstName = sanitizeDisplayName(
    [profile.first_name, profile.last_name].filter(Boolean).join(" "),
    "مستخدم",
  );
  const username = profile.username ? profile.username.replace(/^@/, "").slice(0, 32) : null;
  const photoUrl = profile.photo_url?.slice(0, 500) ?? null;

  const existing = await queryOne<UserRow>("SELECT * FROM users WHERE telegram_id = $1", [telegramId]);
  if (existing) {
    const updated = await queryOne<UserRow>(
      `UPDATE users SET first_name = COALESCE($1, first_name), username = COALESCE($2, username),
              photo_url = COALESCE($3, photo_url), last_seen_at = now(),
              role = CASE WHEN $4 THEN 'admin' ELSE role END
       WHERE telegram_id = $5 RETURNING *`,
      [firstName, username, photoUrl, isAdminTelegramId(telegramId), telegramId],
    );
    if (updated?.is_banned) {
      // نُعيد المستخدم المحظور أيضاً (لعرض رسالة الحظر بدل خطأ غامض)
      return updated;
    }
    return updated!;
  }

  const startBalance = Math.round(await getNumber("start_balance"));

  const created = await withTransaction(async (client) => {
    let code = uniqueReferralCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await client.query("SELECT 1 FROM users WHERE referral_code = $1", [code]);
      if (clash.rowCount === 0) break;
      code = uniqueReferralCode();
    }
    const result = await client.query<UserRow>(
      `INSERT INTO users (telegram_id, username, first_name, photo_url, balance, referral_code, role)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (telegram_id) DO NOTHING
       RETURNING *`,
      [telegramId, username, firstName, photoUrl, startBalance, code, isAdminTelegramId(telegramId) ? "admin" : "user"],
    );
    if (result.rowCount === 0) {
      const again = await client.query<UserRow>("SELECT * FROM users WHERE telegram_id = $1", [telegramId]);
      return again.rows[0]!;
    }
    const user = result.rows[0]!;
    if (startBalance > 0) {
      await client.query(
        `INSERT INTO transactions (recipient_id, amount, net, type, status, note, source, recipient_balance_after)
         VALUES ($1, $2, $2, 'welcome', 'completed', 'رصيد الترحيب', 'system', $3)`,
        [user.id, startBalance, startBalance],
      );
    }
    return user;
  });

  logger.info("مستخدم جديد", { telegramId, userId: created.id });
  return created;
}

/** جلب مستخدم بمعرّف قاعدة البيانات */
export async function getUserById(id: number | string): Promise<UserRow | null> {
  return queryOne<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
}

/** جلب مستخدم بمعرّف تلجرام */
export async function getUserByTelegramId(telegramId: number | string): Promise<UserRow | null> {
  return queryOne<UserRow>("SELECT * FROM users WHERE telegram_id = $1", [String(telegramId)]);
}

/** جلب مستخدم إلزامي مع التحقق من الحظر */
export async function requireUser(id: number | string): Promise<UserRow> {
  const user = await getUserById(id);
  if (!user) throw errors.notFound("المستخدم غير موجود");
  assertNotBanned(user);
  return user;
}

/** جلب مستخدم بالمعرّف أو معرّف تلجرام */
export async function resolveUser(identifier: number | string): Promise<UserRow | null> {
  const asString = String(identifier);
  const byTg = await getUserByTelegramId(asString);
  if (byTg) return byTg;
  if (/^\d+$/.test(asString)) return getUserById(asString);
  return null;
}

export function assertNotBanned(user: { is_banned: boolean }): void {
  if (user.is_banned) throw errors.banned();
}

/** البحث عن مستخدم بالاسم / المعرف / الرد */
export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const clean = username.replace(/^@/, "").trim();
  if (!clean) return null;
  return queryOne<UserRow>("SELECT * FROM users WHERE lower(username) = lower($1)", [clean]);
}

/** بحث نصي (لوحة الأدمن) */
export async function searchUsers(term: string, limit = 20): Promise<UserRow[]> {
  const clean = term.trim().replace(/^@/, "");
  if (!clean) return [];
  const like = `%${clean}%`;
  return query<UserRow>(
    `SELECT * FROM users
     WHERE CAST(telegram_id AS TEXT) = $1 OR id::text = $1
        OR username ILIKE $2 OR first_name ILIKE $2
     ORDER BY balance DESC LIMIT $3`,
    [clean, like, Math.min(limit, 100)],
  );
}

/** قائمة المستخدمين مع ترقيم صفحات (لوحة الأدمن) */
export async function listUsers(options?: {
  limit?: number;
  offset?: number;
  banned?: boolean;
  sort?: "balance" | "recent" | "activity";
}): Promise<{ items: UserRow[]; total: number }> {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);
  const sort = options?.sort ?? "balance";
  const orderBy = sort === "recent" ? "created_at DESC" : sort === "activity" ? "last_seen_at DESC" : "balance DESC";
  const bannedFilter = options?.banned === undefined ? "" : options.banned ? "WHERE is_banned = true" : "WHERE is_banned = false";
  const items = await query<UserRow>(
    `SELECT * FROM users ${bannedFilter} ORDER BY ${orderBy} LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  const total = await queryOne<{ count: string }>(`SELECT count(*) AS count FROM users ${bannedFilter}`);
  return { items, total: toBigNumber(total?.count) };
}

/** حظر/فك حظر */
export async function setBanned(userId: number | string, banned: boolean, actorId?: number | null): Promise<UserRow> {
  const user = await queryOne<UserRow>(
    "UPDATE users SET is_banned = $1 WHERE id = $2 RETURNING *",
    [banned, userId],
  );
  if (!user) throw errors.notFound("المستخدم غير موجود");
  if (banned) {
    await query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [user.id]);
  }
  logger.info(banned ? "حظر مستخدم" : "فك حظر مستخدم", { userId: user.id, actorId });
  return user;
}

/** تعديل الدور */
export async function setRole(userId: number | string, role: "user" | "admin"): Promise<UserRow> {
  const user = await queryOne<UserRow>("UPDATE users SET role = $1 WHERE id = $2 RETURNING *", [role, userId]);
  if (!user) throw errors.notFound("المستخدم غير موجود");
  return user;
}

export interface UserStats {
  totalUsers: number;
  totalBalance: number;
  totalBank: number;
  totalTransactions: number;
  totalVolume: number;
  totalTax: number;
  activeToday: number;
  newToday: number;
  bannedCount: number;
  totalGames: number;
  treasury: number;
  totalLoans: number;
}

/** إحصائيات النظام (لوحة الأدمن + /stats) */
export async function getSystemStats(): Promise<UserStats> {
  const row = await queryOne<Record<string, string | null>>(
    `SELECT
       (SELECT count(*) FROM users) AS total_users,
       (SELECT COALESCE(sum(balance), 0) FROM users) AS total_balance,
       (SELECT COALESCE(sum(bank_balance), 0) FROM users) AS total_bank,
       (SELECT count(*) FROM transactions) AS total_transactions,
       (SELECT COALESCE(sum(amount), 0) FROM transactions) AS total_volume,
       (SELECT COALESCE(sum(tax), 0) FROM transactions) AS total_tax,
       (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '24 hours') AS active_today,
       (SELECT count(*) FROM users WHERE created_at > now() - interval '24 hours') AS new_today,
       (SELECT count(*) FROM users WHERE is_banned) AS banned_count,
       (SELECT count(*) FROM games) AS total_games,
       (SELECT COALESCE(value, '0') FROM system_settings WHERE key = 'treasury_balance') AS treasury,
       (SELECT COALESCE(sum(principal - paid), 0) FROM loans WHERE status IN ('active','overdue')) AS total_loans`,
  );
  const n = (value: string | null | undefined) => toBigNumber(value);
  return {
    totalUsers: n(row?.total_users),
    totalBalance: n(row?.total_balance),
    totalBank: n(row?.total_bank),
    totalTransactions: n(row?.total_transactions),
    totalVolume: n(row?.total_volume),
    totalTax: n(row?.total_tax),
    activeToday: n(row?.active_today),
    newToday: n(row?.new_today),
    bannedCount: n(row?.banned_count),
    totalGames: n(row?.total_games),
    treasury: n(row?.treasury),
    totalLoans: n(row?.total_loans),
  };
}

/** تحديث بيانات الملف الشخصي القادمة من تلجرام */
export async function refreshTelegramProfile(userId: number | string, profile: TelegramProfile): Promise<void> {
  const firstName = sanitizeDisplayName(
    [profile.first_name, profile.last_name].filter(Boolean).join(" "),
    "مستخدم",
  );
  await query(
    `UPDATE users SET first_name = $1, username = COALESCE($2, username),
            photo_url = COALESCE($3, photo_url), last_seen_at = now()
     WHERE id = $4`,
    [firstName, profile.username ? profile.username.replace(/^@/, "") : null, profile.photo_url ?? null, userId],
  );
}

/** تحديث اللقب النشط */
export async function setActiveTitle(userId: number | string, title: string | null): Promise<void> {
  await query("UPDATE users SET active_title = $1 WHERE id = $2", [title, userId]);
}

/** هل للمستخدم صلاحية إدارة (من البيئة أو الدور) */
export function userIsAdmin(user: Pick<UserRow, "role" | "telegram_id">): boolean {
  return user.role === "admin" || isAdminTelegramId(user.telegram_id) || config.ADMIN_IDS.includes(String(user.telegram_id));
}
