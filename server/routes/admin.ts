/**
 * لوحة الأدمن: إحصائيات، إدارة المستخدمين، الإعدادات، المعاملات، البث، الأكواد،
 * المتجر، النسخ الاحتياطي، سجل التدقيق، القروبات.
 * كل الإجراءات مسجّلة في audit_logs.
 */
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/error.js";
import { requireAdmin } from "../middleware/auth.js";
import { limits } from "../middleware/rateLimit.js";
import { errors } from "../errors.js";
import {
  getUserById,
  getSystemStats,
  listUsers,
  searchUsers,
  setBanned,
  setRole,
  resolveUser,
  toPublicUser,
  refreshTelegramProfile,
} from "../services/users.js";
import { getEconomyOverview, topEarnersToday } from "../services/platformStats.js";
import { getTreasuryBalance, listSettings, updateSetting, getAllSettings } from "../services/settings.js";
import { getUserTransactions } from "../services/ledger.js";
import { adminAdjust } from "../services/ledger.js";
import { notify, notifyAll } from "../services/notifications.js";
import { audit, listAudit, countAudit } from "../services/audit.js";
import { createCode, disableCode, listCodes } from "../services/codes.js";
import { adminListItems, upsertItem } from "../services/shop.js";
import { runBackup, listBackups } from "../backup.js";
import { listGroups, updateGroupSettings } from "../services/groups.js";
import { sessionStats } from "../services/auth.js";
import { loanStats } from "../services/loans.js";
import { referralStats } from "../services/referral.js";
import { getPool } from "../db.js";
import { realtime } from "../realtime.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin, limits.admin);

function actor(req: import("express").Request) {
  const user = req.auth!.user;
  return {
    id: Number(user.id),
    label: `${user.first_name ?? "أدمن"} (${user.telegram_id})`,
    ip: req.ip ?? null,
  };
}

/** GET /api/admin/overview */
adminRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const [stats, economy, sessions, loans, referrals, treasury, backups, auditCount] = await Promise.all([
      getSystemStats(),
      getEconomyOverview(),
      sessionStats(),
      loanStats(),
      referralStats(),
      getTreasuryBalance(),
      listBackups(),
      countAudit(),
    ]);
    res.json({
      ok: true,
      data: {
        stats: { ...stats, treasury },
        economy,
        sessions,
        loans,
        referrals,
        backups: backups.slice(0, 5),
        auditCount,
        realtime: realtime.stats(),
        actor: actor(req),
      },
    });
  }),
);

/** GET /api/admin/users?search=&page=&limit=&banned= */
adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const page = Math.max(Number.parseInt(String(req.query.page ?? "1"), 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
    const banned = req.query.banned === "true" ? true : req.query.banned === "false" ? false : undefined;

    if (search.trim()) {
      const rows = await searchUsers(search, 50);
      res.json({
        ok: true,
        data: { items: rows.map((row) => ({ ...toPublicUser(row), telegramId: Number(row.telegram_id) })), total: rows.length, page: 1, limit: rows.length },
      });
      return;
    }
    const { items, total } = await listUsers({ limit, offset: (page - 1) * limit, banned });
    res.json({
      ok: true,
      data: { items: items.map((row) => ({ ...toPublicUser(row), telegramId: Number(row.telegram_id) })), total, page, limit },
    });
  }),
);

/** GET /api/admin/users/:id */
adminRouter.get(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const user = await getUserById(req.params.id);
    if (!user) throw errors.notFound("المستخدم غير موجود");
    const transactions = await getUserTransactions(user.id, 20);
    res.json({ ok: true, data: { user: toPublicUser(user), transactions } });
  }),
);

/** GET /api/admin/resolve?q= */
adminRouter.get(
  "/resolve",
  asyncHandler(async (req, res) => {
    const query = String(req.query.q ?? "").trim().replace(/^@/, "");
    if (!query) throw errors.badRequest("أدخل اسماً أو معرّفاً");
    const user = (await resolveUser(query)) ?? (await searchUsers(query, 1))[0] ?? null;
    if (!user) throw errors.notFound("لم يتم العثور على المستخدم");
    res.json({ ok: true, data: toPublicUser(user) });
  }),
);

const adjustSchema = z.object({
  userId: z.coerce.number().int().positive(),
  amount: z.coerce.number().int().positive().max(9_000_000_000),
  reason: z.string().max(200).optional(),
  notifyUser: z.boolean().optional(),
});

/** POST /api/admin/credit & /api/admin/debit */
adminRouter.post(
  "/credit",
  limits.write,
  asyncHandler(async (req, res) => {
    const body = adjustSchema.parse(req.body ?? {});
    const result = await adminAdjust({
      userId: body.userId,
      amount: body.amount,
      action: "add",
      actorId: actor(req).id,
      reason: body.reason ?? "منحة إدارية",
      source: "web",
    });
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "credit", targetType: "user", targetId: body.userId, details: { amount: body.amount, reason: body.reason }, ip: actor(req).ip });
    if (body.notifyUser !== false) {
      void notify({
        userId: body.userId,
        title: "💰 منحة إدارية",
        body: `أُضيف إلى رصيدك ${body.amount} BTP.${body.reason ? ` السبب: ${body.reason}` : ""}`,
        kind: "gift",
        telegram: true,
      }).catch(() => undefined);
    }
    res.json({ ok: true, data: result });
  }),
);

adminRouter.post(
  "/debit",
  limits.write,
  asyncHandler(async (req, res) => {
    const body = adjustSchema.parse(req.body ?? {});
    const result = await adminAdjust({
      userId: body.userId,
      amount: body.amount,
      action: "remove",
      actorId: actor(req).id,
      reason: body.reason ?? "خصم إداري",
      source: "web",
    });
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "debit", targetType: "user", targetId: body.userId, details: { amount: body.amount, reason: body.reason }, ip: actor(req).ip });
    if (body.notifyUser !== false) {
      void notify({
        userId: body.userId,
        title: "⚠️ خصم إداري",
        body: `خُصم من رصيدك ${body.amount} BTP.${body.reason ? ` السبب: ${body.reason}` : ""}`,
        kind: "warning",
        telegram: true,
      }).catch(() => undefined);
    }
    res.json({ ok: true, data: result });
  }),
);

/** POST /api/admin/ban | /unban */
adminRouter.post(
  "/ban",
  limits.write,
  asyncHandler(async (req, res) => {
    const { userId, reason } = z.object({ userId: z.coerce.number().int().positive(), reason: z.string().max(200).optional() }).parse(req.body ?? {});
    const user = await setBanned(userId, true, actor(req).id);
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "ban", targetType: "user", targetId: userId, details: { reason }, ip: actor(req).ip });
    res.json({ ok: true, data: toPublicUser(user) });
  }),
);

adminRouter.post(
  "/unban",
  limits.write,
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(req.body ?? {});
    const user = await setBanned(userId, false, actor(req).id);
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "unban", targetType: "user", targetId: userId, details: {}, ip: actor(req).ip });
    res.json({ ok: true, data: toPublicUser(user) });
  }),
);

/** POST /api/admin/role */
adminRouter.post(
  "/role",
  limits.write,
  asyncHandler(async (req, res) => {
    const { userId, role } = z
      .object({ userId: z.coerce.number().int().positive(), role: z.enum(["user", "admin"]) })
      .parse(req.body ?? {});
    const user = await setRole(userId, role);
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "set_role", targetType: "user", targetId: userId, details: { role }, ip: actor(req).ip });
    res.json({ ok: true, data: toPublicUser(user) });
  }),
);

/** GET /api/admin/settings */
adminRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: { rows: await listSettings(), values: await getAllSettings() } });
  }),
);

/** POST /api/admin/settings */
adminRouter.post(
  "/settings",
  limits.write,
  asyncHandler(async (req, res) => {
    const { key, value } = z.object({ key: z.string().min(1).max(80), value: z.string().max(500) }).parse(req.body ?? {});
    const row = await updateSetting(key, value, actor(req).id);
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "setting_update", targetType: "setting", targetId: key, details: { value }, ip: actor(req).ip });
    res.json({ ok: true, data: row });
  }),
);

/** GET /api/admin/transactions?limit=&offset=&type= */
adminRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "40"), 10) || 40, 1), 200);
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const type = typeof req.query.type === "string" && req.query.type ? req.query.type : null;
    const pool = getPool();
    const rows = await pool.query(
      `SELECT t.*, su.username AS sender_username, su.first_name AS sender_name,
              ru.username AS recipient_username, ru.first_name AS recipient_name
       FROM transactions t
       LEFT JOIN users su ON su.id = t.sender_id
       LEFT JOIN users ru ON ru.id = t.recipient_id
       WHERE ($3::text IS NULL OR t.type = $3)
       ORDER BY t.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset, type],
    );
    const count = await pool.query("SELECT count(*) AS count FROM transactions WHERE ($1::text IS NULL OR type = $1)", [type]);
    res.json({
      ok: true,
      data: {
        items: rows.rows.map((row) => ({
          id: Number(row.id),
          senderId: row.sender_id ? Number(row.sender_id) : null,
          recipientId: row.recipient_id ? Number(row.recipient_id) : null,
          senderName: row.sender_name ?? row.sender_username ?? null,
          recipientName: row.recipient_name ?? row.recipient_username ?? null,
          amount: Number(row.amount),
          tax: Number(row.tax),
          fee: Number(row.fee),
          net: Number(row.net),
          type: row.type,
          status: row.status,
          note: row.note,
          source: row.source,
          createdAt: row.created_at,
        })),
        total: Number(count.rows[0]?.count ?? 0),
        limit,
        offset,
      },
    });
  }),
);

/** POST /api/admin/broadcast */
adminRouter.post(
  "/broadcast",
  limits.write,
  asyncHandler(async (req, res) => {
    const { title, body, telegram } = z
      .object({
        title: z.string().min(1).max(200),
        body: z.string().max(2000).default(""),
        telegram: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const result = await notifyAll({ title, body, kind: "info", telegram: telegram ?? true });
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "broadcast", targetType: "all", targetId: null, details: { title, telegram: telegram ?? true, count: result.count }, ip: actor(req).ip });
    res.json({ ok: true, data: result });
  }),
);

/** POST /api/admin/notify — إشعار مستخدم واحد */
adminRouter.post(
  "/notify",
  asyncHandler(async (req, res) => {
    const { userId, title, body, telegram } = z
      .object({
        userId: z.coerce.number().int().positive(),
        title: z.string().min(1).max(200),
        body: z.string().max(2000).default(""),
        telegram: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    const note = await notify({ userId, title, body, kind: "info", telegram: telegram ?? true });
    res.json({ ok: true, data: note });
  }),
);

/** GET /api/admin/codes & POST /api/admin/codes */
adminRouter.get(
  "/codes",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await listCodes(100) });
  }),
);

adminRouter.post(
  "/codes",
  limits.write,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        amount: z.coerce.number().int().positive().max(1_000_000_000),
        maxUses: z.coerce.number().int().min(1).max(100_000).optional(),
        perUser: z.coerce.number().int().min(1).max(1000).optional(),
        expiresInHours: z.coerce.number().int().min(1).max(8760).optional(),
        code: z.string().min(4).max(32).optional(),
      })
      .parse(req.body ?? {});
    const code = await createCode({ ...body, createdBy: actor(req).id });
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "create_code", targetType: "code", targetId: code.code, details: { amount: code.amount, maxUses: code.maxUses }, ip: actor(req).ip });
    res.json({ ok: true, data: code });
  }),
);

adminRouter.post(
  "/codes/disable",
  asyncHandler(async (req, res) => {
    const { code } = z.object({ code: z.string().min(1).max(32) }).parse(req.body ?? {});
    const ok = await disableCode(code);
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "disable_code", targetType: "code", targetId: code, details: {}, ip: actor(req).ip });
    res.json({ ok: true, data: { disabled: ok } });
  }),
);

/** GET/POST /api/admin/shop */
adminRouter.get(
  "/shop",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await adminListItems() });
  }),
);

adminRouter.post(
  "/shop",
  limits.write,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        code: z.string().min(2).max(32),
        name: z.string().min(1).max(64),
        description: z.string().max(300).optional(),
        icon: z.string().max(8).optional(),
        price: z.coerce.number().int().min(0).max(9_000_000_000),
        kind: z.enum(["title", "boost", "shield", "badge"]).optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
        stock: z.coerce.number().int().min(0).nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body ?? {});
    await upsertItem(body);
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "shop_upsert", targetType: "item", targetId: body.code, details: { price: body.price }, ip: actor(req).ip });
    res.json({ ok: true, data: { saved: true } });
  }),
);

/** POST /api/admin/backup */
adminRouter.post(
  "/backup",
  asyncHandler(async (req, res) => {
    const result = await runBackup({ manual: true });
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "backup_manual", targetType: "database", targetId: result.file ?? null, details: { ok: result.ok, bytes: result.bytes }, ip: actor(req).ip });
    res.json({ ok: true, data: result });
  }),
);

/** GET /api/admin/backups */
adminRouter.get(
  "/backups",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await listBackups() });
  }),
);

/** GET /api/admin/audit */
adminRouter.get(
  "/audit",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    const action = typeof req.query.action === "string" && req.query.action ? req.query.action : undefined;
    const [items, total] = await Promise.all([listAudit({ limit, offset, action }), countAudit(action)]);
    res.json({ ok: true, data: { items, total, limit, offset } });
  }),
);

/** GET /api/admin/groups & POST /api/admin/groups */
adminRouter.get(
  "/groups",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await listGroups(200) });
  }),
);

adminRouter.post(
  "/groups",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        chatId: z.coerce.number().int(),
        enabled: z.boolean().optional(),
        gamesEnabled: z.boolean().optional(),
        economyEnabled: z.boolean().optional(),
        welcomeEnabled: z.boolean().optional(),
        dailyEnabled: z.boolean().optional(),
        logTransactions: z.boolean().optional(),
        minBet: z.coerce.number().int().nullable().optional(),
        maxBet: z.coerce.number().int().nullable().optional(),
      })
      .parse(req.body ?? {});
    const { chatId, ...patch } = body;
    const settings = await updateGroupSettings(chatId, patch);
    await audit({ actorId: actor(req).id, actorLabel: actor(req).label, action: "group_update", targetType: "group", targetId: chatId, details: patch, ip: actor(req).ip });
    res.json({ ok: true, data: settings });
  }),
);

/** GET /api/admin/top-earners */
adminRouter.get(
  "/top-earners",
  asyncHandler(async (_req, res) => {
    res.json({ ok: true, data: await topEarnersToday(10) });
  }),
);

/** POST /api/admin/sync-user — إعادة جلب بيانات مستخدم من تلجرام (اختياري: عبر البوت) */
adminRouter.post(
  "/sync-user",
  asyncHandler(async (req, res) => {
    const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(req.body ?? {});
    const user = await getUserById(userId);
    if (!user) throw errors.notFound("المستخدم غير موجود");
    const bot = await import("../bot/index.js");
    const fresh = await bot.fetchTelegramProfile(user.telegram_id);
    if (fresh) {
      await refreshTelegramProfile(user.id, fresh);
    }
    const updated = await getUserById(userId);
    res.json({ ok: true, data: toPublicUser(updated!) });
  }),
);
