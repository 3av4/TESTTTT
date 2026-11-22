/**
 * مسارات المستخدم: الملف، الراتب اليومي، التحويل، السجل، البنك، الإشعارات، الإحالات.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { requireAuth } from "../middleware/auth.js";
import { limits } from "../middleware/rateLimit.js";
import { getUserById, toPublicUser } from "../services/users.js";
import { getDailyStatus, claimDaily } from "../services/daily.js";
import { sendCoins, formatTransferPreview } from "../services/transfer.js";
import { countUserTransactions, getUserTransactions } from "../services/ledger.js";
import {
  deposit,
  estimateInterest,
  getBankInfo,
  listInterestHistory,
  withdraw,
} from "../services/bank.js";
import { getUserGameStats } from "../services/games.js";
import { getRobStatus } from "../services/rob.js";
import {
  getReferralInfo,
  ensureReferralCode,
  claimReferralReward,
} from "../services/referral.js";
import { getLoanInfo } from "../services/loans.js";
import { getNumber, getString } from "../services/settings.js";
import { getInventory } from "../services/shop.js";
import { listNotifications, markRead, unreadCount } from "../services/notifications.js";

export const userRouter = Router();
userRouter.use(requireAuth);

/** GET /api/user/me */
userRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = req.auth!.user;
    const [daily, bank, rob, games, referrals, loans, unread, inventory] = await Promise.all([
      getDailyStatus(user),
      getBankInfo(user),
      getRobStatus(user.id),
      getUserGameStats(user.id),
      getReferralInfo(user),
      getLoanInfo(user.id),
      unreadCount(user.id),
      getInventory(user.id),
    ]);
    res.json({
      ok: true,
      data: {
        user: toPublicUser(user),
        daily,
        bank,
        rob,
        games,
        referrals,
        loans: {
          active: loans.active,
          eligible: loans.eligible,
          reason: loans.reason,
          maxAmount: loans.maxAmount,
          interestPercent: loans.interestPercent,
        },
        unreadNotifications: unread,
        inventory,
      },
    });
  }),
);

/** GET /api/user/daily — حالة الراتب */
userRouter.get(
  "/daily",
  asyncHandler(async (req, res) => {
    const fresh = await getUserById(req.auth!.user.id);
    res.json({ ok: true, data: await getDailyStatus(fresh!) });
  }),
);

/** POST /api/user/daily — المطالبة بالراتب */
userRouter.post(
  "/daily",
  limits.daily,
  asyncHandler(async (req, res) => {
    const user = req.auth!.user;
    const result = await claimDaily(user.id, "web");
    // صرف مكافأة الإحالة عند أول تفعيل
    void claimReferralReward(user.id).catch(() => undefined);
    res.json({
      ok: true,
      data: {
        ...result,
        daily: await getDailyStatus(await getUserById(user.id).then((u) => u!)),
      },
    });
  }),
);

const transferSchema = z.object({
  recipient: z.string().min(1).max(64),
  amount: z.coerce.number().int().positive().max(9_000_000_000),
  note: z.string().max(100).optional(),
});

/** POST /api/user/transfer/preview — معاينة ضريبة التحويل */
userRouter.post(
  "/transfer/preview",
  asyncHandler(async (req, res) => {
    const { amount } = transferSchema.pick({ amount: true }).parse(req.body ?? {});
    const taxPercent = await getNumber("transfer_tax_pct");
    res.json({ ok: true, data: formatTransferPreview(amount, taxPercent) });
  }),
);

/** POST /api/user/transfer */
userRouter.post(
  "/transfer",
  limits.write,
  asyncHandler(async (req, res) => {
    const body = transferSchema.parse(req.body ?? {});
    const result = await sendCoins({
      senderId: req.auth!.user.id,
      recipient: body.recipient,
      amount: body.amount,
      note: body.note,
      source: "web",
    });
    void claimReferralReward(req.auth!.user.id).catch(() => undefined);
    res.json({ ok: true, data: result });
  }),
);

const bankSchema = z.object({ amount: z.coerce.number().int().positive().max(9_000_000_000) });

/** GET /api/user/bank */
userRouter.get(
  "/bank",
  asyncHandler(async (req, res) => {
    const fresh = await getUserById(req.auth!.user.id);
    const [info, history] = await Promise.all([getBankInfo(fresh!), listInterestHistory(fresh!.id)]);
    res.json({ ok: true, data: { ...info, history } });
  }),
);

/** POST /api/user/deposit */
userRouter.post(
  "/deposit",
  limits.write,
  asyncHandler(async (req, res) => {
    const { amount } = bankSchema.parse(req.body ?? {});
    const result = await deposit(req.auth!.user.id, amount, "web");
    res.json({ ok: true, data: result });
  }),
);

/** POST /api/user/withdraw */
userRouter.post(
  "/withdraw",
  limits.write,
  asyncHandler(async (req, res) => {
    const { amount } = bankSchema.parse(req.body ?? {});
    const result = await withdraw(req.auth!.user.id, amount, "web");
    res.json({ ok: true, data: result });
  }),
);

/** GET /api/user/transactions?limit=&offset=&type= */
userRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "30"), 10) || 30, 1), 100);
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const type = typeof req.query.type === "string" && req.query.type ? req.query.type : undefined;
    const [items, total] = await Promise.all([
      getUserTransactions(req.auth!.user.id, limit, { offset, type }),
      countUserTransactions(req.auth!.user.id),
    ]);
    res.json({ ok: true, data: { items, total, limit, offset } });
  }),
);

/** GET /api/user/notifications */
userRouter.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
      listNotifications(req.auth!.user.id, 40),
      unreadCount(req.auth!.user.id),
    ]);
    res.json({ ok: true, data: { items, unread } });
  }),
);

/** POST /api/user/notifications/read */
userRouter.post(
  "/notifications/read",
  asyncHandler(async (req, res) => {
    const id = req.body?.id ? Number(req.body.id) : undefined;
    await markRead(req.auth!.user.id, id);
    res.json({ ok: true, data: { unread: await unreadCount(req.auth!.user.id) } });
  }),
);

/** GET /api/user/referral */
userRouter.get(
  "/referral",
  asyncHandler(async (req, res) => {
    await ensureReferralCode(req.auth!.user.id);
    const fresh = await getUserById(req.auth!.user.id);
    res.json({ ok: true, data: await getReferralInfo(fresh!) });
  }),
);

/** GET /api/user/loans */
userRouter.get(
  "/loans",
  asyncHandler(async (req, res) => {
    res.json({ ok: true, data: await getLoanInfo(req.auth!.user.id) });
  }),
);

/** GET /api/user/stats */
userRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const user = req.auth!.user;
    const [games, rob] = await Promise.all([getUserGameStats(user.id), getRobStatus(user.id)]);
    res.json({
      ok: true,
      data: {
        games,
        rob,
        accountAgeDays: Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86_400_000),
        dailyClaims: user.daily_count,
        bankClaims: user.bank_count,
      },
    });
  }),
);

/** GET /api/user/events — بيانات أولية للـ WebSocket */
userRouter.get(
  "/events",
  asyncHandler(async (req, res) => {
    const user = req.auth!.user;
    res.json({
      ok: true,
      data: {
        sessionId: req.auth!.sessionId,
        balance: Number(user.balance),
        bankBalance: Number(user.bank_balance),
        announcement: await getString("announcement"),
        interestEstimate: estimateInterest(Number(user.bank_balance), await getNumber("bank_interest_pct"), await getNumber("bank_capacity")),
      },
    });
  }),
);
