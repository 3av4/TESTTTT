/**
 * /rob — سرقة بنسبة نجاح، فاصل زمني، وعقوبة عند الفشل تُعاد جزئياً للضحية.
 * حماية من التكرار: قفل صف السارق + فحص last_rob_at داخل نفس المعاملة.
 */
import { withTransaction } from "../db.js";
import { errors } from "../errors.js";
import { logger } from "../logger.js";
import { percentOf, randomInt, toBigNumber } from "../utils.js";
import { getNumber } from "./settings.js";
import { adjustBalance, lockUser, writeTransaction } from "./ledger.js";
import { events } from "./events.js";
import { notify } from "./notifications.js";
import { getUserById } from "./users.js";

export interface RobResult {
  success: boolean;
  amount: number;
  penalty: number;
  victimShare: number;
  balance: number;
  victimBalance: number;
  cooldownEndsAt: string;
  roll: number;
  needed: number;
  victimName: string;
  transactionId: number;
}

export async function rob(options: {
  robberId: number | string;
  victimId: number | string;
  amount: number;
  source?: "web" | "bot";
}): Promise<RobResult> {
  const { robberId, victimId } = options;
  const amount = Math.round(Number(options.amount));
  if (!Number.isInteger(amount) || amount <= 0) throw errors.badRequest("المبلغ يجب أن يكون عدداً صحيحاً موجباً");
  if (Number(robberId) === Number(victimId)) throw errors.badRequest("لا يمكنك سرقة نفسك 😅");

  const [min, max, successPct, cooldownMinutes, penaltyPct, victimSharePct] = await Promise.all([
    getNumber("rob_min"),
    getNumber("rob_max"),
    getNumber("rob_success_pct"),
    getNumber("rob_cooldown_minutes"),
    getNumber("rob_penalty_pct"),
    getNumber("rob_victim_share_pct"),
  ]);

  const roundedAmount = Math.round(amount);
  if (roundedAmount < Math.round(min)) throw errors.badRequest(`أدنى مبلغ للسرقة هو ${Math.round(min)} BTP`);
  if (roundedAmount > Math.round(max)) throw errors.badRequest(`أعلى مبلغ للسرقة هو ${Math.round(max)} BTP`);

  const victim = await getUserById(victimId);
  if (!victim) throw errors.notFound("الضحية غير موجودة");
  const robberRow = await getUserById(robberId);
  if (!robberRow) throw errors.notFound("السارق غير موجود");
  const robberName = robberRow.username ? `@${robberRow.username}` : robberRow.first_name ?? "لاعب";

  const [firstId, secondId] = [Number(robberId), Number(victimId)].sort((a, b) => a - b);
  const roll = randomInt(1, 100);

  const outcome = await withTransaction(async (client) => {
    const first = await lockUser(client, firstId);
    const second = await lockUser(client, secondId);
    const robber = first.id === Number(robberId) ? first : second;
    const target = first.id === Number(victimId) ? first : second;

    // الفاصل الزمني على السارق (داخل القفل لمنع التكرار)
    const robberRow = await client.query<{ last_rob_at: string | null }>(
      "SELECT last_rob_at FROM users WHERE id = $1",
      [robber.id],
    );
    const lastRob = robberRow.rows[0]?.last_rob_at ? new Date(robberRow.rows[0].last_rob_at!).getTime() : null;
    if (lastRob !== null) {
      const remaining = lastRob + cooldownMinutes * 60_000 - Date.now();
      if (remaining > 0) {
        throw errors.cooldown("يجب أن تنتظر قبل محاولة سرقة أخرى", {
          secondsRemaining: Math.ceil(remaining / 1000),
          nextAt: new Date(lastRob + cooldownMinutes * 60_000).toISOString(),
        });
      }
    }

    const success = roll <= Math.round(successPct);
    let balance = robber.balance;
    let victimBalance = target.balance;
    let failedPenalty = 0;
    let failedVictimShare = 0;

    if (success) {
      // لا يمكن سرقة أكثر من رصيد الضحية
      const stealable = Math.min(roundedAmount, target.balance);
      if (stealable <= 0) throw errors.badRequest("الضحية لا يملك رصيداً يمكن سرقته");
      victimBalance = await adjustBalance(client, target.id, -stealable);
      balance = await adjustBalance(client, robber.id, stealable);
      await writeTransaction(client, {
        senderId: target.id,
        recipientId: robber.id,
        amount: stealable,
        tax: 0,
        net: stealable,
        type: "rob_success",
        note: `سرقة ناجحة من ${target.username ? `@${target.username}` : "لاعب"}`,
        source: options.source ?? "bot",
        balanceAfter: victimBalance,
        recipientBalanceAfter: balance,
        metadata: { roll, successPct, victimId: target.id },
      });
    } else {
      // الفشل: عقوبة على السارق، جزء منها يعود للضحية
      const penalty = Math.max(0, Math.min(percentOf(roundedAmount, penaltyPct), robber.balance));
      const victimShare = Math.max(0, Math.min(percentOf(penalty, victimSharePct), penalty));
      failedPenalty = penalty;
      failedVictimShare = victimShare;
      if (penalty > 0) {
        balance = await adjustBalance(client, robber.id, -penalty);
        if (victimShare > 0) victimBalance = await adjustBalance(client, target.id, victimShare);
        await writeTransaction(client, {
          senderId: robber.id,
          recipientId: victimShare > 0 ? target.id : null,
          amount: penalty,
          tax: 0,
          net: victimShare,
          type: "rob_failed",
          note: `محاولة سرقة فاشلة (${roll}/${successPct})`,
          source: options.source ?? "bot",
          balanceAfter: balance,
          recipientBalanceAfter: victimShare > 0 ? victimBalance : null,
          metadata: { roll, successPct, victimId: target.id, victimShare },
        });
      }
    }

    const cooldownEndsAt = new Date(Date.now() + cooldownMinutes * 60_000).toISOString();
    await client.query("UPDATE users SET last_rob_at = now() WHERE id = $1", [robber.id]);
    await client.query("UPDATE users SET last_seen_at = now() WHERE id = $1", [target.id]);

    return {
      success,
      amount: roundedAmount,
      balance,
      victimBalance,
      penalty: failedPenalty,
      victimShare: failedVictimShare,
      cooldownEndsAt,
    };
  });

  events.emitEvent("balance", {
    userId: Number(robberId),
    balance: outcome.balance,
    change: outcome.success ? roundedAmount : -outcome.penalty,
    reason: outcome.success ? "rob_success" : "rob_failed",
  });
  events.emitEvent("balance", {
    userId: Number(victimId),
    balance: outcome.victimBalance,
    change: outcome.success ? -roundedAmount : outcome.victimShare,
    reason: outcome.success ? "rob_victim" : "rob_victim",
  });

  if (outcome.penalty > 0) {
    void notify({
      userId: Number(victimId),
      title: "🕵️ محاولة سرقة فاشلة",
      body: `حاول ${robberName} سرقة ${outcome.amount} BTP منك وفشل! وصلتك تعويضات ${outcome.victimShare} BTP.`,
      kind: "warning",
      telegram: true,
    }).catch(() => undefined);
  }

  logger.info("محاولة سرقة", { robberId, victimId, roll, success: outcome.success, amount: roundedAmount });

  if (outcome.success) {
    void notify({
      userId: Number(victimId),
      title: "🚨 تمت سرقتك!",
      body: `تمت سرقة ${outcome.amount} BTP من رصيدك بواسطة ${robberName}. ضع رصيدك في البنك لحمايته.`,
      kind: "danger",
      telegram: true,
    }).catch(() => undefined);
  }

  return {
    success: outcome.success,
    amount: roundedAmount,
    penalty: outcome.penalty,
    victimShare: outcome.victimShare,
    balance: outcome.balance,
    victimBalance: outcome.victimBalance,
    cooldownEndsAt: outcome.cooldownEndsAt,
    roll,
    needed: Math.round(successPct),
    victimName: victim.first_name ?? "لاعب",
    transactionId: 0,
  };
}

/** حالة السرقة (هل الكولداون منتهٍ) */
export async function getRobStatus(userId: number | string): Promise<{ available: boolean; secondsRemaining: number; nextAt: string | null }> {
  const cooldownMinutes = await getNumber("rob_cooldown_minutes");
  const user = await getUserById(userId);
  if (!user?.last_rob_at) return { available: true, secondsRemaining: 0, nextAt: null };
  const nextAt = new Date(new Date(user.last_rob_at).getTime() + cooldownMinutes * 60_000);
  const remaining = Math.max(0, nextAt.getTime() - Date.now());
  return { available: remaining === 0, secondsRemaining: Math.ceil(remaining / 1000), nextAt: nextAt.toISOString() };
}
