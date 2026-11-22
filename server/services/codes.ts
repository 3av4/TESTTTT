/**
 * أكواد الهدايا (Redeem Codes) — إنشاء من الأدمن، واسترداد مرة لكل مستخدم داخل Transaction.
 */
import { query, queryOne, withTransaction } from "../db.js";
import { errors } from "../errors.js";
import { generateCode, toBigNumber } from "../utils.js";
import { adjustBalance, writeTransaction } from "./ledger.js";
import { events } from "./events.js";

export interface RedeemCode {
  code: string;
  amount: number;
  maxUses: number;
  uses: number;
  perUser: number;
  expiresAt: string | null;
  createdAt: string;
  createdBy: number | null;
}

export interface RedeemResult {
  code: string;
  amount: number;
  balance: number;
  usesLeft: number;
  transactionId: number;
}

function toRedeemCode(row: Record<string, unknown>): RedeemCode {
  return {
    code: String(row.code),
    amount: toBigNumber(row.amount),
    maxUses: toBigNumber(row.max_uses),
    uses: toBigNumber(row.uses),
    perUser: toBigNumber(row.per_user),
    expiresAt: (row.expires_at as string | null) ?? null,
    createdAt: String(row.created_at),
    createdBy: row.created_by ? toBigNumber(row.created_by) : null,
  };
}

/** إنشاء كود هدية (كود مخصص أو عشوائي) */
export async function createCode(options: {
  amount: number;
  maxUses?: number;
  perUser?: number;
  expiresInHours?: number | null;
  code?: string;
  createdBy?: number | null;
}): Promise<RedeemCode> {
  const amount = Math.round(Number(options.amount));
  const maxUses = Math.max(1, Math.min(Math.round(Number(options.maxUses ?? 1)), 100_000));
  const perUser = Math.max(1, Math.min(Math.round(Number(options.perUser ?? 1)), maxUses));
  const expiresInHours = options.expiresInHours ?? null;

  if (!Number.isInteger(amount) || amount <= 0) throw errors.badRequest("قيمة الكود يجب أن تكون عدداً صحيحاً موجباً");
  if (amount > 1_000_000_000) throw errors.badRequest("قيمة الكود كبيرة جداً");

  let code = (options.code ?? generateCode(8)).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (code.length < 4 || code.length > 32) throw errors.badRequest("طول الكود يجب أن يكون بين 4 و32 حرفاً");

  for (let attempt = 0; attempt < 6; attempt++) {
    const exists = await queryOne("SELECT 1 FROM redeem_codes WHERE code = $1", [code]);
    if (!exists) break;
    if (options.code) throw errors.conflict("هذا الكود موجود مسبقاً");
    code = generateCode(8);
  }

  const expiresAt = expiresInHours && expiresInHours > 0
    ? new Date(Date.now() + expiresInHours * 3_600_000).toISOString()
    : null;

  const row = await queryOne<Record<string, unknown>>(
    `INSERT INTO redeem_codes (code, amount, max_uses, per_user, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [code, amount, maxUses, perUser, options.createdBy ?? null, expiresAt],
  );
  return toRedeemCode(row!);
}

/** استرداد كود */
export async function redeemCode(userId: number | string, rawCode: string, source: "web" | "bot" = "web"): Promise<RedeemResult> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{4,32}$/.test(code)) throw errors.badRequest("صيغة الكود غير صحيحة");

  const result = await withTransaction(async (client) => {
    // قفل الكود يمنع استرداد أكثر من الحد تحت التزامن
    const codeRow = await client.query<Record<string, unknown>>(
      "SELECT * FROM redeem_codes WHERE code = $1 FOR UPDATE",
      [code],
    );
    const record = codeRow.rows[0];
    if (!record) throw errors.notFound("الكود غير موجود");
    if (record.expires_at && new Date(String(record.expires_at)).getTime() < Date.now()) {
      throw errors.badRequest("انتهت صلاحية هذا الكود");
    }
    if (toBigNumber(record.uses) >= toBigNumber(record.max_uses)) {
      throw errors.badRequest("تم استهلاك هذا الكود بالكامل");
    }

    const userRow = await client.query<{ balance: string; is_banned: boolean }>(
      "SELECT balance, is_banned FROM users WHERE id = $1 FOR UPDATE",
      [userId],
    );
    const user = userRow.rows[0];
    if (!user) throw errors.notFound("المستخدم غير موجود");
    if (user.is_banned) throw errors.banned();

    const redemptions = await client.query<{ count: string }>(
      "SELECT count(*) AS count FROM code_redemptions WHERE code = $1 AND user_id = $2",
      [code, userId],
    );
    if (toBigNumber(redemptions.rows[0]?.count) >= toBigNumber(record.per_user)) {
      throw errors.badRequest("استرددت هذا الكود بالفعل");
    }

    const amount = toBigNumber(record.amount);
    await client.query("INSERT INTO code_redemptions (code, user_id) VALUES ($1, $2)", [code, userId]);
    await client.query("UPDATE redeem_codes SET uses = uses + 1 WHERE code = $1", [code]);

    const balance = await adjustBalance(client, userId, amount);
    const txId = await writeTransaction(client, {
      recipientId: Number(userId),
      amount,
      net: amount,
      type: "redeem",
      note: `استرداد كود هدية ${code}`,
      source,
      recipientBalanceAfter: balance,
      metadata: { code },
    });

    return {
      code,
      amount,
      balance,
      usesLeft: toBigNumber(record.max_uses) - toBigNumber(record.uses) - 1,
      transactionId: txId,
    };
  });

  events.emitEvent("balance", { userId: Number(userId), balance: result.balance, change: result.amount, reason: "redeem" });
  events.emitEvent("transaction", {
    userId: Number(userId),
    transactionId: result.transactionId,
    senderId: null,
    recipientId: Number(userId),
    amount: result.amount,
    tax: 0,
    net: result.amount,
    type: "redeem",
    direction: "in",
    note: `كود ${code}`,
  });
  return result;
}

/** قائمة الأكواد (أدمن) */
export async function listCodes(limit = 50): Promise<RedeemCode[]> {
  const rows = await query<Record<string, unknown>>(
    "SELECT * FROM redeem_codes ORDER BY created_at DESC LIMIT $1",
    [Math.min(Math.max(limit, 1), 200)],
  );
  return rows.map(toRedeemCode);
}

/** تعطيل كود */
export async function disableCode(code: string): Promise<boolean> {
  const row = await queryOne<{ code: string }>(
    "UPDATE redeem_codes SET expires_at = now() WHERE code = $1 RETURNING code",
    [code.toUpperCase()],
  );
  return Boolean(row);
}
