/**
 * نظام الإحالات:
 *  - لكل مستخدم كود/رابط إحالة فريد.
 *  - عند تسجيل حساب جديد عبر /start ref_CODE يُسجّل كمدعو بحالة pending.
 *  - عند أول تفعيل (أول راتب يومي/أول شراء/أول لعب) يُصرف للطرفين.
 *  - مكافحة الحسابات المتعددة: جهاز/حساب واحد لكل منصة + منع الإحالة الذاتية.
 */
import { query, queryOne, withTransaction } from "../db.js";
import { config } from "../config.js";
import { errors } from "../errors.js";
import { toBigNumber } from "../utils.js";
import { getBoolean, getNumber } from "./settings.js";
import { adjustBalance, writeTransaction, emitBalance } from "./ledger.js";
import { events } from "./events.js";
import { notify } from "./notifications.js";
import { getUserById, type UserRow } from "./users.js";

export interface ReferralInfo {
  code: string;
  link: string;
  invitedCount: number;
  pendingCount: number;
  paidCount: number;
  earnings: number;
  rewardInviter: number;
  rewardInvitee: number;
  enabled: boolean;
  invited: Array<{ id: number; name: string; status: string; reward: number; createdAt: string }>;
}

/** رابط الإحالة */
export function buildReferralLink(code: string): string {
  const username = config.BOT_USERNAME || "bitpoin_bot";
  return `https://t.me/${username}?start=ref_${code}`;
}

/** بيانات الإحالة لمستخدم */
export async function getReferralInfo(user: UserRow): Promise<ReferralInfo> {
  const [enabled, rewardInviter, rewardInvitee] = await Promise.all([
    getBoolean("referral_enabled"),
    getNumber("referral_reward_inviter"),
    getNumber("referral_reward_invitee"),
  ]);

  const code = user.referral_code ?? `BTP${String(user.telegram_id).slice(-6)}`;
  const rows = await query<{
    id: string;
    status: string;
    reward: string;
    created_at: string;
    first_name: string | null;
    username: string | null;
  }>(
    `SELECT r.id, r.status, r.reward, r.created_at, u.first_name, u.username
     FROM referral_claims r JOIN users u ON u.id = r.invitee_id
     WHERE r.inviter_id = $1 ORDER BY r.created_at DESC LIMIT 50`,
    [user.id],
  );

  const invitedCount = rows.length;
  const pendingCount = rows.filter((row) => row.status === "pending").length;
  const paidCount = rows.filter((row) => row.status === "paid").length;

  return {
    code,
    link: buildReferralLink(code),
    invitedCount,
    pendingCount,
    paidCount,
    earnings: toBigNumber(user.referral_earnings),
    rewardInviter: Math.round(rewardInviter),
    rewardInvitee: Math.round(rewardInvitee),
    enabled,
    invited: rows.map((row) => ({
      id: toBigNumber(row.id),
      name: row.first_name ?? row.username ?? "مستخدم",
      status: row.status,
      reward: toBigNumber(row.reward),
      createdAt: row.created_at,
    })),
  };
}

/**
 * ربط مستخدم جديد بداعي عبر كود الإحالة.
 * @returns true إن تم الربط
 */
export async function attachReferral(invitee: UserRow, code: string | null | undefined): Promise<boolean> {
  if (!code) return false;
  if (!(await getBoolean("referral_enabled"))) return false;
  const clean = code.trim().replace(/^ref_/i, "").toUpperCase();
  if (!/^[A-Z0-9]{4,20}$/.test(clean)) return false;

  const inviter = await queryOne<UserRow>("SELECT * FROM users WHERE referral_code = $1 OR referral_code = $2", [
    clean,
    `BTP${clean}`,
  ]);
  if (!inviter) return false;
  if (String(inviter.id) === String(invitee.id)) return false;
  if (invitee.referred_by) return false;

  try {
    await query(
      `INSERT INTO referral_claims (inviter_id, invitee_id, reward, status)
       VALUES ($1, $2, $3, 'pending') ON CONFLICT (invitee_id) DO NOTHING`,
      [inviter.id, invitee.id, 0],
    );
    await query("UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL", [inviter.id, invitee.id]);
    return true;
  } catch {
    return false;
  }
}

/**
 * صرف مكافأة الإحالة عند تفعيل المدعو (أول نشاط مالي).
 * idempotent: تُصرف مرة واحدة فقط.
 */
export async function claimReferralReward(inviteeId: number | string): Promise<{
  paid: boolean;
  inviterReward: number;
  inviteeReward: number;
  inviterId: number | null;
}> {
  if (!(await getBoolean("referral_enabled"))) {
    return { paid: false, inviterReward: 0, inviteeReward: 0, inviterId: null };
  }

  const [rewardInviter, rewardInvitee] = await Promise.all([
    Math.round(await getNumber("referral_reward_inviter")),
    Math.round(await getNumber("referral_reward_invitee")),
  ]);

  const result = await withTransaction(async (client) => {
    const claim = await client.query<{ id: string; inviter_id: string; status: string }>(
      "SELECT * FROM referral_claims WHERE invitee_id = $1 FOR UPDATE",
      [inviteeId],
    );
    const row = claim.rows[0];
    if (!row || row.status !== "pending") return null;

    const inviterBalance = await adjustBalance(client, row.inviter_id, rewardInviter);
    const inviteeBalance = await adjustBalance(client, inviteeId, rewardInvitee);

    await writeTransaction(client, {
      recipientId: Number(row.inviter_id),
      amount: rewardInviter,
      net: rewardInviter,
      type: "referral_reward",
      note: "مكافأة إحالة (داعٍ)",
      source: "system",
      recipientBalanceAfter: inviterBalance,
      metadata: { inviteeId: Number(inviteeId) },
    });
    await writeTransaction(client, {
      recipientId: Number(inviteeId),
      amount: rewardInvitee,
      net: rewardInvitee,
      type: "referral_reward",
      note: "مكافأة إحالة (مدعو)",
      source: "system",
      recipientBalanceAfter: inviteeBalance,
      metadata: { inviterId: Number(row.inviter_id) },
    });

    await client.query(
      `UPDATE referral_claims SET status = 'paid', reward = $1, claimed_at = now() WHERE id = $2`,
      [rewardInviter, row.id],
    );
    await client.query("UPDATE users SET referral_earnings = referral_earnings + $1 WHERE id = $2", [
      rewardInviter,
      row.inviter_id,
    ]);

    return {
      inviterId: toBigNumber(row.inviter_id),
      inviterBalance,
      inviteeBalance,
      inviteeName: (await client.query<{ first_name: string | null }>("SELECT first_name FROM users WHERE id = $1", [inviteeId])).rows[0]?.first_name,
    };
  });

  if (!result) return { paid: false, inviterReward: 0, inviteeReward: 0, inviterId: null };

  emitBalance({ userId: result.inviterId, balance: result.inviterBalance, change: rewardInviter, reason: "referral_reward" });
  emitBalance({ userId: Number(inviteeId), balance: result.inviteeBalance, change: rewardInvitee, reason: "referral_reward" });
  events.emitEvent("transaction", {
    userId: result.inviterId,
    transactionId: 0,
    senderId: null,
    recipientId: result.inviterId,
    amount: rewardInviter,
    tax: 0,
    net: rewardInviter,
    type: "referral_reward",
    direction: "in",
    note: "مكافأة إحالة",
  });

  void notify({
    userId: result.inviterId,
    title: "🎁 مكافأة إحالة",
    body: `انضم ${result.inviteeName ?? "صديقك"} عبر رابطك، وأُضيف ${rewardInviter} BTP إلى رصيدك.`,
    kind: "gift",
    telegram: true,
  }).catch(() => undefined);

  void notify({
    userId: Number(inviteeId),
    title: "🎁 مكافأة الانضمام",
    body: `تم إضافة ${rewardInvitee} BTP كمكافأة انضمام عبر رابط إحالة.`,
    kind: "gift",
    telegram: true,
  }).catch(() => undefined);

  return { paid: true, inviterReward: rewardInviter, inviteeReward: rewardInvitee, inviterId: result.inviterId };
}

/** كود الإحالة لمستخدم (يُنشئ إن لم يوجد) */
export async function ensureReferralCode(userId: number | string): Promise<string> {
  const user = await getUserById(userId);
  if (!user) throw errors.notFound("المستخدم غير موجود");
  if (user.referral_code) return user.referral_code;
  const code = `BTP${String(user.telegram_id).slice(-6)}${Math.floor(Math.random() * 90 + 10)}`;
  await query("UPDATE users SET referral_code = $1 WHERE id = $2", [code, userId]);
  return code;
}

/** إحصائيات الإحالات (أدمن) */
export async function referralStats(): Promise<{ total: number; pending: number; paid: number; totalPaidOut: number }> {
  const row = await queryOne<{ total: string; pending: string; paid: string; paid_out: string | null }>(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE status = 'pending') AS pending,
            count(*) FILTER (WHERE status = 'paid') AS paid,
            COALESCE(sum(reward) FILTER (WHERE status = 'paid'), 0) AS paid_out
     FROM referral_claims`,
  );
  return {
    total: toBigNumber(row?.total),
    pending: toBigNumber(row?.pending),
    paid: toBigNumber(row?.paid),
    totalPaidOut: toBigNumber(row?.paid_out),
  };
}
