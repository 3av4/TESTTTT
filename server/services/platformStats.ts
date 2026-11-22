/**
 * إحصائيات المنصة الشاملة (تبويب "الاقتصاد" في لوحة الأدمن).
 */
import { query, queryOne } from "../db.js";
import { toBigNumber } from "../utils.js";
import { getTreasuryBalance } from "./settings.js";

export interface EconomyOverview {
  treasury: number;
  totalSupply: number;
  heldByUsers: number;
  heldInBanks: number;
  totalTransactions: number;
  dailyTransactions: number;
  volume24h: number;
  taxesCollected: number;
  taxes24h: number;
  games24h: number;
  gamesVolume24h: number;
  dailyClaims24h: number;
  dailyPayout24h: number;
  activeUsers24h: number;
  newUsers24h: number;
  avgBalance: number;
  topBalance: number;
}

export async function getEconomyOverview(): Promise<EconomyOverview> {
  const row = await queryOne<Record<string, string | null>>(
    `SELECT
      (SELECT COALESCE(sum(balance),0) FROM users) AS held_by_users,
      (SELECT COALESCE(sum(bank_balance),0) FROM users) AS held_in_banks,
      (SELECT count(*) FROM transactions) AS total_transactions,
      (SELECT count(*) FROM transactions WHERE created_at > now() - interval '24 hours') AS daily_transactions,
      (SELECT COALESCE(sum(amount),0) FROM transactions WHERE created_at > now() - interval '24 hours') AS volume_24h,
      (SELECT COALESCE(sum(tax),0) FROM transactions) AS taxes_collected,
      (SELECT COALESCE(sum(tax),0) FROM transactions WHERE created_at > now() - interval '24 hours') AS taxes_24h,
      (SELECT count(*) FROM games WHERE created_at > now() - interval '24 hours') AS games_24h,
      (SELECT COALESCE(sum(bet),0) FROM games WHERE created_at > now() - interval '24 hours') AS games_volume_24h,
      (SELECT count(*) FROM transactions WHERE type='daily' AND created_at > now() - interval '24 hours') AS daily_claims_24h,
      (SELECT COALESCE(sum(amount),0) FROM transactions WHERE type='daily' AND created_at > now() - interval '24 hours') AS daily_payout_24h,
      (SELECT count(*) FROM users WHERE last_seen_at > now() - interval '24 hours') AS active_users_24h,
      (SELECT count(*) FROM users WHERE created_at > now() - interval '24 hours') AS new_users_24h,
      (SELECT COALESCE(avg(balance),0) FROM users) AS avg_balance,
      (SELECT COALESCE(max(balance),0) FROM users) AS top_balance`,
  );

  const n = (key: string) => toBigNumber(row?.[key]);
  const treasury = await getTreasuryBalance();

  return {
    treasury,
    heldByUsers: n("held_by_users"),
    heldInBanks: n("held_in_banks"),
    totalSupply: treasury + n("held_by_users") + n("held_in_banks"),
    totalTransactions: n("total_transactions"),
    dailyTransactions: n("daily_transactions"),
    volume24h: n("volume_24h"),
    taxesCollected: n("taxes_collected"),
    taxes24h: n("taxes_24h"),
    games24h: n("games_24h"),
    gamesVolume24h: n("games_volume_24h"),
    dailyClaims24h: n("daily_claims_24h"),
    dailyPayout24h: n("daily_payout_24h"),
    activeUsers24h: n("active_users_24h"),
    newUsers24h: n("new_users_24h"),
    avgBalance: n("avg_balance"),
    topBalance: n("top_balance"),
  };
}

/** أكثر المستخدمين حصولاً على أموال من النظام اليوم */
export async function topEarnersToday(limit = 10): Promise<Array<{ userId: number; name: string; earned: number }>> {
  const rows = await query<{ user_id: string; first_name: string | null; username: string | null; earned: string }>(
    `SELECT t.recipient_id AS user_id, u.first_name, u.username, sum(t.net) AS earned
     FROM transactions t JOIN users u ON u.id = t.recipient_id
     WHERE t.recipient_id IS NOT NULL
       AND t.created_at > now() - interval '24 hours'
       AND t.type IN ('daily','game_win','bank_interest','redeem','referral_reward','admin_credit','loan_granted')
     GROUP BY t.recipient_id, u.first_name, u.username
     ORDER BY earned DESC LIMIT $1`,
    [Math.min(limit, 50)],
  );
  return rows.map((row) => ({
    userId: toBigNumber(row.user_id),
    name: row.first_name ?? row.username ?? "مستخدم",
    earned: toBigNumber(row.earned),
  }));
}
