/**
 * مسارات عامة: الإعدادات العامة، المتصدرون، كشف الهدايا (استرداد يتطلب تسجيل دخول).
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { limits } from "../middleware/rateLimit.js";
import { getAllSettings } from "../services/settings.js";
import { gamesLeaderboard, globalLeaderboard, referralLeaderboard } from "../services/leaderboard.js";
import { getSystemStats } from "../services/users.js";
import { getEconomyOverview } from "../services/platformStats.js";
import { redeemCode } from "../services/codes.js";
import { claimReferralReward } from "../services/referral.js";
import { getUserById } from "../services/users.js";

export const publicRouter = Router();

const PUBLIC_SETTING_KEYS = [
  "currency_name",
  "currency_symbol",
  "daily_min",
  "daily_max",
  "daily_cooldown_hours",
  "streak_bonus_per_day",
  "streak_bonus_max_days",
  "transfer_tax_pct",
  "game_tax_pct",
  "wealth_tax_pct",
  "wealth_tax_threshold",
  "bet_min",
  "bet_max",
  "rob_success_pct",
  "rob_cooldown_minutes",
  "rob_min",
  "rob_max",
  "bank_interest_pct",
  "bank_min_deposit",
  "shop_enabled",
  "referral_enabled",
  "referral_reward_inviter",
  "referral_reward_invitee",
  "announcement",
  "min_transfer",
  "max_transfer",
  "loan_max_amount",
  "loan_interest_pct",
];

/** GET /api/config — إعدادات عامة للواجهة */
publicRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const settings = await getAllSettings();
    const data: Record<string, string> = {};
    for (const key of PUBLIC_SETTING_KEYS) data[key] = settings[key] ?? "";
    res.json({ ok: true, data });
  }),
);

/** GET /api/leaderboard?scope=global|games|referrals&limit= */
publicRouter.get(
  "/leaderboard",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const scope = String(req.query.scope ?? "global");
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "25"), 10) || 25, 1), 100);
    if (scope === "games") {
      res.json({ ok: true, data: { scope, entries: await gamesLeaderboard(limit) } });
      return;
    }
    if (scope === "referrals") {
      res.json({ ok: true, data: { scope, entries: await referralLeaderboard(limit) } });
      return;
    }
    const meId = req.auth?.user.id;
    res.json({ ok: true, data: await globalLeaderboard({ limit, meId }) });
  }),
);

/** GET /api/stats — إحصائيات عامة */
publicRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const [stats, economy] = await Promise.all([getSystemStats(), getEconomyOverview()]);
    res.json({
      ok: true,
      data: {
        users: stats.totalUsers,
        activeToday: stats.activeToday,
        totalTransactions: stats.totalTransactions,
        totalVolume: stats.totalVolume,
        treasury: stats.treasury,
        gamesPlayed: stats.totalGames,
        supply: economy.totalSupply,
        dailyPayout24h: economy.dailyPayout24h,
      },
    });
  }),
);

/** POST /api/promo/redeem */
publicRouter.post(
  "/promo/redeem",
  requireAuth,
  limits.write,
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(4).max(32) }).parse(req.body ?? {});
    const result = await redeemCode(req.auth!.user.id, code, "web");
    const fresh = await getUserById(req.auth!.user.id);
    void claimReferralReward(req.auth!.user.id).catch(() => undefined);
    res.json({ ok: true, data: { ...result, balance: fresh ? Number(fresh.balance) : result.balance } });
  }),
);
