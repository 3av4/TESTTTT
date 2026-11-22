/**
 * مسارات المتجر.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { limits } from "../middleware/rateLimit.js";
import { buyItem, equipTitle, getInventory, listItems, unequipTitle } from "../services/shop.js";
import { getUserById } from "../services/users.js";
import { claimReferralReward } from "../services/referral.js";

export const shopRouter = Router();

/** GET /api/shop */
shopRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.auth?.user.id;
    res.json({ ok: true, data: { items: await listItems(userId) } });
  }),
);

const buySchema = z.object({
  code: z.string().min(2).max(32),
  quantity: z.coerce.number().int().min(1).max(10).optional(),
});

/** POST /api/shop/buy */
shopRouter.post(
  "/buy",
  requireAuth,
  limits.write,
  asyncHandler(async (req, res) => {
    const body = buySchema.parse(req.body ?? {});
    const result = await buyItem(req.auth!.user.id, body.code, { quantity: body.quantity, source: "web" });
    const fresh = await getUserById(req.auth!.user.id);
    void claimReferralReward(req.auth!.user.id).catch(() => undefined);
    res.json({
      ok: true,
      data: {
        ...result,
        balance: fresh ? Number(fresh.balance) : result.balance,
        activeTitle: fresh?.active_title ?? null,
      },
    });
  }),
);

/** GET /api/shop/inventory */
shopRouter.get(
  "/inventory",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getInventory(req.auth!.user.id) });
  }),
);

/** POST /api/shop/equip */
shopRouter.post(
  "/equip",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(2).max(32) }).parse(req.body ?? {});
    const title = await equipTitle(req.auth!.user.id, code);
    res.json({ ok: true, data: { activeTitle: title } });
  }),
);

/** POST /api/shop/unequip */
shopRouter.post(
  "/unequip",
  requireAuth,
  asyncHandler(async (req, res) => {
    await unequipTitle(req.auth!.user.id);
    res.json({ ok: true, data: { activeTitle: null } });
  }),
);
