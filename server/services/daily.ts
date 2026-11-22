/**
 * الراتب اليومي (Daily Reward)
 * - مكافأة عشوائية secure بين daily_min و daily_max.
 * - فاصل 24 ساعة (قابل للتعديل) مع عدّاد تنازلي.
 * - سلسلة أيام (Streak) بمكافأة إضافية يومية حتى سقف معيّن.
 * - حماية صارمة من السباق (Race): قفل الصف SELECT ... FOR UPDATE + فحص
 *   شرط last_daily داخل نفس الـ Transaction قبل الكتابة.
 */
import { queryOne, withTransaction } from "../db.js";
import { errors } from "../errors.js";
import { logger } from "../logger.js";
import { MAX_SAFE_AMOUNT, randomInt, toBigNumber } from "../utils.js";
import { getNumber } from "./settings.js";
import { adjustBalance, writeTransaction } from "./ledger.js";
import { events } from "./events.js";
import type { UserRow } from "./users.js";

export interface DailyStatus {
  canClaim: boolean;
  nextClaimAt: string | null;
  secondsRemaining: number;
  streak: number;
  /** المكافأة المتوقعة إن طالب الآن (تقديري — الأساس عشوائي) */
  estimatedMin: number;
  estimatedMax: number;
  bracket: { min: number; max: number; bonusPerDay: number; maxBonusDays: number; cooldownHours: number };
}

export interface DailyResult {
  amount: number;
  base: number;
  streakBonus: number;
  streak: number;
  multiplier: number;
  balance: number;
  nextClaimAt: string;
  secondsRemaining: number;
  transactionId: number;
}

function cooldownMs(hours: number): number {
  return Math.round(hours * 3600 * 1000);
}

/** حالة الراتب اليومي لمستخدم */
export async function getDailyStatus(user: Pick<UserRow, "last_daily" | "streak">): Promise<DailyStatus> {
  const cooldownHours = await getNumber("daily_cooldown_hours");
  const bracket = {
    min: Math.round(await getNumber("daily_min")),
    max: Math.round(await getNumber("daily_max")),
    bonusPerDay: Math.round(await getNumber("streak_bonus_per_day")),
    maxBonusDays: Math.round(await getNumber("streak_bonus_max_days")),
    cooldownHours,
  };

  if (!user.last_daily) {
    const estimatedBonus = Math.min(Math.max(user.streak + 1, 1), bracket.maxBonusDays) * bracket.bonusPerDay;
    return {
      canClaim: true,
      nextClaimAt: null,
      secondsRemaining: 0,
      streak: user.streak,
      estimatedMin: bracket.min + estimatedBonus,
      estimatedMax: bracket.max + estimatedBonus,
      bracket,
    };
  }

  const last = new Date(user.last_daily).getTime();
  const next = last + cooldownMs(cooldownHours);
  const remaining = Math.max(0, next - Date.now());
  const nextStreak = remaining === 0 && Date.now() - last < cooldownMs(48) ? user.streak + 1 : user.streak + (remaining === 0 ? 1 : 0);
  const estimatedBonus = Math.min(Math.max(nextStreak, 1), bracket.maxBonusDays) * bracket.bonusPerDay;

  return {
    canClaim: remaining === 0,
    nextClaimAt: new Date(next).toISOString(),
    secondsRemaining: Math.ceil(remaining / 1000),
    streak: user.streak,
    estimatedMin: bracket.min + estimatedBonus,
    estimatedMax: bracket.max + estimatedBonus,
    bracket,
  };
}

/** هل يملك المستخدم مضاعف راتب صالحاً؟ */
function getDailyBoost(items: Record<string, unknown>): { multiplier: number; itemCodes: string[] } {
  const boosts = (items?.boosts ?? items?.boost ?? null) as Record<string, { uses?: number; multiplier?: number }> | null;
  if (!boosts || typeof boosts !== "object") return { multiplier: 1, itemCodes: [] };
  let multiplier = 1;
  const itemCodes: string[] = [];
  for (const [code, entry] of Object.entries(boosts)) {
    if (!entry || typeof entry !== "object") continue;
    const uses = Number(entry.uses ?? 0);
    const mult = Number(entry.multiplier ?? 1);
    if (uses > 0 && mult > 1) {
      multiplier = Math.max(multiplier, mult);
      itemCodes.push(code);
    }
  }
  return { multiplier, itemCodes };
}

/**
 * المطالبة بالراتب اليومي.
 * @param source "web" | "bot"
 */
export async function claimDaily(userId: number | string, source: "web" | "bot" = "web"): Promise<DailyResult> {
  const cooldownHours = await getNumber("daily_cooldown_hours");
  const dailyMin = Math.round(await getNumber("daily_min"));
  const dailyMax = Math.round(await getNumber("daily_max"));
  const bonusPerDay = Math.round(await getNumber("streak_bonus_per_day"));
  const maxBonusDays = Math.round(await getNumber("streak_bonus_max_days"));

  if (dailyMax < dailyMin) throw errors.internal("إعدادات الراتب غير صالحة (daily_max < daily_min)");

  const outcome = await withTransaction(async (client) => {
    // 🔒 قفل الصف: أول معاملة تفوز، والبقية ينتظرون ثم يجدون last_daily محدّثاً
    const result = await client.query<UserRow>(
      "SELECT * FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const user = result.rows[0];
    if (!user) throw errors.notFound("المستخدم غير موجود");
    if (user.is_banned) throw errors.banned();

    const now = Date.now();
    const last = user.last_daily ? new Date(user.last_daily).getTime() : null;
    const cooldown = cooldownMs(cooldownHours);

    if (last !== null && now < last + cooldown) {
      const secondsRemaining = Math.ceil((last + cooldown - now) / 1000);
      throw errors.cooldown("لم يحن موعد راتبك اليومي بعد", {
        secondsRemaining,
        nextClaimAt: new Date(last + cooldown).toISOString(),
      });
    }

    // سلسلة الأيام: إذا كان آخر راتب خلال نافذة سماح 48 ساعة → استمرار، وإلا تصفير
    const continues = last !== null && now - last <= cooldownMs(48);
    const streak = continues ? Math.min(user.streak + 1, 3650) : 1;
    const bonusDays = Math.min(streak, Math.max(1, maxBonusDays));
    const streakBonus = bonusDays * bonusPerDay;
    const base = randomInt(dailyMin, dailyMax);

    const boost = getDailyBoost((user.items as Record<string, unknown>) ?? {});
    const multiplier = boost.multiplier;
    let amount = Math.round((base + streakBonus) * multiplier);
    amount = Math.min(amount, MAX_SAFE_AMOUNT);

    // استهلاك مضاعف الراتب
    let items = (user.items as Record<string, unknown>) ?? {};
    if (boost.multiplier > 1) {
      const boosts = { ...(items.boosts as Record<string, { uses?: number; multiplier?: number }> | undefined) };
      for (const code of boost.itemCodes) {
        const entry = boosts[code];
        if (!entry) continue;
        const uses = Number(entry.uses ?? 0) - 1;
        if (uses <= 0) delete boosts[code];
        else boosts[code] = { ...entry, uses };
      }
      items = { ...items, boosts };
    }

    const balance = await adjustBalance(client, user.id, amount);
    await client.query(
      `UPDATE users
         SET last_daily = now(), streak = $1, daily_count = daily_count + 1, items = $2::jsonb, last_seen_at = now()
       WHERE id = $3`,
      [streak, JSON.stringify(items), user.id],
    );

    const txId = await writeTransaction(client, {
      recipientId: toBigNumber(user.id),
      amount,
      net: amount,
      type: "daily",
      note: `راتب يومي (سلسلة ${streak} يوم)`,
      source,
      recipientBalanceAfter: balance,
      metadata: { base, streakBonus, streak, multiplier },
    });

    const nextClaimAt = new Date(now + cooldown).toISOString();
    return {
      transactionId: txId,
      amount,
      base,
      streakBonus,
      streak,
      multiplier,
      balance,
      nextClaimAt,
      secondsRemaining: Math.ceil(cooldown / 1000),
    };
  });

  events.emitEvent("balance", { userId: Number(userId), balance: outcome.balance, change: outcome.amount, reason: "daily" });
  events.emitEvent("transaction", {
    userId: Number(userId),
    transactionId: outcome.transactionId,
    senderId: null,
    recipientId: Number(userId),
    amount: outcome.amount,
    tax: 0,
    net: outcome.amount,
    type: "daily",
    direction: "in",
    note: `راتب يومي — سلسلة ${outcome.streak}`,
  });

  logger.info("مطالبة راتب يومي", { userId, amount: outcome.amount, streak: outcome.streak, source });
  return outcome;
}

/** عدد المستخدمين الذين طالبوا اليوم (للإحصائيات) */
export async function dailyClaimStats(): Promise<{ today: number; total: number }> {
  const row = await queryOne<{ today: string; total: string }>(
    `SELECT count(*) FILTER (WHERE last_daily > now() - interval '24 hours') AS today,
            count(*) AS total
     FROM users WHERE last_daily IS NOT NULL`,
  );
  return { today: toBigNumber(row?.today), total: toBigNumber(row?.total) };
}
