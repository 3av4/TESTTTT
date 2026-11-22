/**
 * مسارات الألعاب: الحدود، اللعب، الإحصائيات.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { limits } from "../middleware/rateLimit.js";
import { getAllLimits, getUserGameStats, play, getTopGamblers, type GameKind } from "../services/games.js";
import { getUserById, toPublicUser } from "../services/users.js";
import { claimReferralReward } from "../services/referral.js";

export const gamesRouter = Router();

/** GET /api/games — حدود كل لعبة (عام) */
gamesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const all = await getAllLimits();
    res.json({ ok: true, data: all });
  }),
);

const playSchema = z.object({
  game: z.enum(["dice", "coinflip", "slots", "roulette"]),
  bet: z.coerce.number().int().positive().max(9_000_000_000),
  choice: z.string().max(16).optional(),
});

/** POST /api/games/play */
gamesRouter.post(
  "/play",
  requireAuth,
  limits.games,
  asyncHandler(async (req, res) => {
    const body = playSchema.parse(req.body ?? {});
    const result = await play({
      userId: req.auth!.user.id,
      game: body.game as GameKind,
      bet: body.bet,
      choice: body.choice,
      source: "web",
    });
    const fresh = await getUserById(req.auth!.user.id);
    void claimReferralReward(req.auth!.user.id).catch(() => undefined);
    res.json({ ok: true, data: { ...result, user: fresh ? toPublicUser(fresh) : null } });
  }),
);

/** GET /api/games/stats */
gamesRouter.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getUserGameStats(req.auth!.user.id) });
  }),
);

/** GET /api/games/top */
gamesRouter.get(
  "/top",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await getTopGamblers(10) });
  }),
);
