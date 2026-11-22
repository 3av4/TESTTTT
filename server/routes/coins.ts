/**
 * مسارات العملة الإضافية: السرقة، القروض، الهدايا.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { limits } from "../middleware/rateLimit.js";
import { rob, getRobStatus } from "../services/rob.js";
import { requestLoan, repayLoan, getLoanInfo } from "../services/loans.js";
import { sendCoins } from "../services/transfer.js";
import { getUserById, resolveUser, toPublicUser } from "../services/users.js";
import { claimReferralReward } from "../services/referral.js";
import { notify } from "../services/notifications.js";

export const coinsRouter = Router();
coinsRouter.use(requireAuth);

/** GET /api/coins/rob */
coinsRouter.get(
  "/rob",
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getRobStatus(req.auth!.user.id) });
  }),
);

const robSchema = z.object({
  victimId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive().max(9_000_000_000),
});

/** POST /api/coins/rob */
coinsRouter.post(
  "/rob",
  limits.write,
  asyncHandler(async (req, res) => {
    const body = robSchema.parse(req.body ?? {});
    const result = await rob({
      robberId: req.auth!.user.id,
      victimId: body.victimId,
      amount: body.amount,
      source: "web",
    });
    res.json({ ok: true, data: result });
  }),
);

/** GET /api/coins/loans */
coinsRouter.get(
  "/loans",
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getLoanInfo(req.auth!.user.id) });
  }),
);

/** POST /api/coins/loans */
coinsRouter.post(
  "/loans",
  limits.write,
  asyncHandler(async (req, res) => {
    const { amount } = z.object({ amount: z.coerce.number().int().positive() }).parse(req.body ?? {});
    const result = await requestLoan(req.auth!.user.id, amount, "web");
    res.json({ ok: true, data: result });
  }),
);

/** POST /api/coins/loans/repay */
coinsRouter.post(
  "/loans/repay",
  limits.write,
  asyncHandler(async (req, res) => {
    const body = z.object({ amount: z.coerce.number().int().positive().optional() }).parse(req.body ?? {});
    res.json({ ok: true, data: await repayLoan(req.auth!.user.id, { amount: body.amount }, "web") });
  }),
);

/** GET /api/coins/gift?to=@user */
coinsRouter.get(
  "/gift",
  asyncHandler(async (req, res) => {
    const target = String(req.query.to ?? "").trim();
    if (!target) {
      res.json({ ok: true, data: { found: false } });
      return;
    }
    const user = await resolveUser(target.replace(/^@/, ""));
    res.json({
      ok: true,
      data: user
        ? {
            found: true,
            user: {
              id: Number(user.id),
              username: user.username,
              firstName: user.first_name,
              photoUrl: user.photo_url,
            },
          }
        : { found: false },
    });
  }),
);

const giftSchema = z.object({
  recipient: z.string().min(1).max(64),
  amount: z.coerce.number().int().positive().max(9_000_000_000),
  message: z.string().max(120).optional(),
});

/** POST /api/coins/gift */
coinsRouter.post(
  "/gift",
  limits.write,
  asyncHandler(async (req, res) => {
    const body = giftSchema.parse(req.body ?? {});
    const result = await sendCoins({
      senderId: req.auth!.user.id,
      recipient: body.recipient,
      amount: body.amount,
      note: body.message ? `هدية: ${body.message}` : "هدية",
      source: "web",
    });
    const target = await resolveUser(String(body.recipient).replace(/^@/, ""));
    if (target) {
      void notify({
        userId: Number(target.id),
        title: "🎁 وصلتك هدية",
        body: `${req.auth!.user.first_name ?? "مستخدم"} أرسل لك ${result.net} BTP${
          body.message ? ` مع رسالة: «${body.message}»` : ""
        }.`,
        kind: "gift",
        telegram: true,
      }).catch(() => undefined);
    }
    const fresh = await getUserById(req.auth!.user.id);
    void claimReferralReward(req.auth!.user.id).catch(() => undefined);
    res.json({ ok: true, data: { ...result, user: fresh ? toPublicUser(fresh) : null } });
  }),
);
