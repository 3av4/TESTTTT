/**
 * دفتر الأستاذ المالي — كل حركة مال في النظام تمر من هنا.
 *
 * المبادئ:
 *  1) أي عملية مالية داخل withTransaction.
 *  2) قفل صفوف المستخدمين بـ SELECT ... FOR UPDATE بترتيب id ثابت (منع deadlock).
 *  3) الأرصدة BIGINT صحيحة، والحساب في قاعدة البيانات نفسها (balance = balance + x).
 *  4) كل عملية تُسجَّل في transactions وتُطلق أحداث realtime + تلجرام.
 */
import type { PoolClient } from "pg";
import { withTransaction } from "../db.js";
import { errors } from "../errors.js";
import { logger } from "../logger.js";
import { MAX_SAFE_AMOUNT, percentOf, toBigNumber } from "../utils.js";
import { addToTreasuryTx, getNumber } from "./settings.js";
import { events, type BalanceEvent } from "./events.js";

export const TX_TYPES = [
  "welcome",
  "daily",
  "transfer",
  "transfer_received",
  "game_bet",
  "game_win",
  "rob_success",
  "rob_failed",
  "rob_penalty",
  "rob_victim",
  "bank_deposit",
  "bank_withdraw",
  "bank_interest",
  "shop_purchase",
  "gift_sent",
  "gift_received",
  "redeem",
  "referral_reward",
  "loan_granted",
  "loan_repayment",
  "loan_penalty",
  "admin_credit",
  "admin_debit",
  "wealth_tax",
  "wealth_tax_received",
  "tax",
  "reward",
] as const;

export type TxType = (typeof TX_TYPES)[number] | string;

export interface TransactionRecord {
  id: number;
  senderId: number | null;
  recipientId: number | null;
  amount: number;
  tax: number;
  fee: number;
  net: number;
  type: TxType;
  status: string;
  note: string | null;
  source: string;
  balanceAfter: number | null;
  recipientBalanceAfter: number | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface LedgerResult {
  transactionId: number;
  amount: number;
  tax: number;
  fee: number;
  net: number;
  senderBalance?: number;
  recipientBalance?: number;
}

export interface TransferOptions {
  senderId: number;
  recipientId: number;
  amount: number;
  type?: TxType;
  /** نسبة الضريبة المطبقة (افتراضياً transfer_tax_pct) */
  taxPercent?: number;
  /** نسبة رسم إضافي (افتراضياً 0) */
  feePercent?: number;
  /** لصالح الخزينة تأخذ الضريبة */
  taxToTreasury?: boolean;
  note?: string;
  source?: "web" | "bot" | "system";
  metadata?: Record<string, unknown>;
  /** ينبغي أن يستلم المستلم المبلغ كاملاً ويُحصَّل الضريبة من المرسل (للتحويلات) */
  taxFromSender?: boolean;
  /** صرف صافي المبلغ للمستلم والضريبة للخزينة دون خصم من المرسل */
  grossAmount?: number;
}

/** قفل صف مستخدم وإرجاع رصيده الحالي (للاستخدام داخل Transaction) */
export async function lockUser(client: PoolClient, userId: number | string): Promise<{ id: number; balance: number; bankBalance: number; isBanned: boolean; username: string | null }> {
  const result = await client.query<{ id: string; balance: string; bank_balance: string; is_banned: boolean; username: string | null }>(
    "SELECT id, balance, bank_balance, is_banned, username FROM users WHERE id = $1 FOR UPDATE",
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw errors.notFound("المستخدم غير موجود");
  if (row.is_banned) throw errors.banned();
  return {
    id: toBigNumber(row.id),
    balance: toBigNumber(row.balance),
    bankBalance: toBigNumber(row.bank_balance),
    isBanned: row.is_banned,
    username: row.username,
  };
}

/** قراءة رصيد داخل Transaction دون قفل */
export async function readBalance(client: PoolClient, userId: number | string): Promise<number> {
  const result = await client.query<{ balance: string }>("SELECT balance FROM users WHERE id = $1", [userId]);
  return toBigNumber(result.rows[0]?.balance);
}

/** تعديل رصيد ذرّي داخل Transaction وإرجاع الرصيد الجديد */
export async function adjustBalance(
  client: PoolClient,
  userId: number | string,
  delta: number,
  options?: { allowNegative?: boolean },
): Promise<number> {
  if (!Number.isInteger(delta)) throw errors.internal("المبالغ يجب أن تكون أعداداً صحيحة");
  const result = await client.query<{ balance: string }>(
    options?.allowNegative
      ? "UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance"
      : "UPDATE users SET balance = balance + $1 WHERE id = $2 AND balance + $1 >= 0 RETURNING balance",
    [delta, userId],
  );
  const row = result.rows[0];
  if (!row) throw errors.insufficientFunds();
  const balance = toBigNumber(row.balance);
  if (balance > MAX_SAFE_AMOUNT) throw errors.badRequest("تجاوز الرصيد الحد الأقصى المسموح");
  return balance;
}

/** كتابة سجل معاملة داخل Transaction */
export async function writeTransaction(
  client: PoolClient,
  data: {
    senderId?: number | null;
    recipientId?: number | null;
    amount: number;
    tax?: number;
    fee?: number;
    net?: number;
    type: TxType;
    status?: string;
    note?: string | null;
    source?: string;
    balanceAfter?: number | null;
    recipientBalanceAfter?: number | null;
    metadata?: Record<string, unknown>;
  },
): Promise<number> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO transactions
       (sender_id, recipient_id, amount, tax, fee, net, type, status, note, source, balance_after, recipient_balance_after, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      data.senderId ?? null,
      data.recipientId ?? null,
      Math.round(data.amount),
      Math.round(data.tax ?? 0),
      Math.round(data.fee ?? 0),
      Math.round(data.net ?? data.amount),
      data.type,
      data.status ?? "completed",
      data.note ?? null,
      data.source ?? "system",
      data.balanceAfter ?? null,
      data.recipientBalanceAfter ?? null,
      JSON.stringify(data.metadata ?? {}),
    ],
  );
  return toBigNumber(result.rows[0]!.id);
}

/** إطلاق حدث الرصيد (بعد نجاح الـ COMMIT فقط) */
export function emitBalance(event: BalanceEvent): void {
  events.emitEvent("balance", event);
}

/**
 * تحويل مالي عام بين مستخدمين مع ضريبة اختيارية.
 * - افتراضياً: الضريبة تُخصم من المبلغ المُحوَّل، فيستلم المستلم amount - tax.
 * - taxFromSender=true (التحويلات من الموقع): يستلم المستلم amount كاملاً،
 *   ويُخصم من المرسل amount + tax.
 */
export async function transfer(options: TransferOptions): Promise<LedgerResult> {
  const {
    senderId,
    recipientId,
    amount,
    taxToTreasury = true,
    source = "system",
    metadata,
  } = options;
  const type = options.type ?? "transfer";

  if (!Number.isInteger(amount) || amount <= 0) throw errors.badRequest("المبلغ يجب أن يكون عدداً صحيحاً موجباً");
  if (amount > MAX_SAFE_AMOUNT) throw errors.badRequest("المبلغ كبير جداً");
  if (Number(senderId) === Number(recipientId)) throw errors.badRequest("لا يمكن التحويل إلى نفسك");

  const taxPercent = options.taxPercent ?? (await getNumber("transfer_tax_pct"));
  const feePercent = options.feePercent ?? 0;

  // الترتيب الثابت للأقفال يمنع الـ deadlock
  const [firstId, secondId] = [Number(senderId), Number(recipientId)].sort((a, b) => a - b);

  const result = await withTransaction(async (client) => {
    const first = await lockUser(client, firstId);
    const second = await lockUser(client, secondId);
    const sender = first.id === Number(senderId) ? first : second;
    const recipient = first.id === Number(recipientId) ? first : second;

    const tax = options.grossAmount !== undefined ? Math.round(options.grossAmount) : percentOf(amount, taxPercent);
    const fee = percentOf(amount, feePercent);
    const fromSender = options.taxFromSender ?? false;

    const senderDebit = fromSender ? amount + tax + fee : amount;
    const recipientCredit = fromSender ? amount : amount - tax - fee;

    if (recipientCredit <= 0) throw errors.badRequest("المبلغ صغير جداً بعد خصم الضريبة");
    if (sender.balance < senderDebit) throw errors.insufficientFunds();

    const senderBalance = await adjustBalance(client, sender.id, -senderDebit);
    const recipientBalance = await adjustBalance(client, recipient.id, recipientCredit);

    const txId = await writeTransaction(client, {
      senderId: sender.id,
      recipientId: recipient.id,
      amount,
      tax,
      fee,
      net: recipientCredit,
      type,
      note: options.note ?? null,
      source,
      balanceAfter: senderBalance,
      recipientBalanceAfter: recipientBalance,
      metadata: { taxPercent, feePercent, senderDebit, ...(metadata ?? {}) },
    });

    if (taxToTreasury && tax + fee > 0) {
      await addToTreasuryTx(client, tax + fee);
    }

    return {
      transactionId: txId,
      amount,
      tax,
      fee,
      net: recipientCredit,
      senderBalance,
      recipientBalance,
    };
  });

  emitBalance({ userId: Number(senderId), balance: result.senderBalance!, change: -(options.taxFromSender ? amount + result.tax + result.fee : amount), reason: type });
  emitBalance({
    userId: Number(recipientId),
    balance: result.recipientBalance!,
    change: result.net,
    reason: `${type}_received`,
  });

  events.emitEvent("transaction", {
    userId: Number(senderId),
    transactionId: result.transactionId,
    senderId: Number(senderId),
    recipientId: Number(recipientId),
    amount: result.amount,
    tax: result.tax,
    net: result.net,
    type,
    direction: "out",
    note: options.note,
  });

  logger.debug("معاملة مالية", { type, senderId, recipientId, amount, tax: result.tax, txId: result.transactionId });
  return result;
}

/**
 * منح/خصم إداري — يُستخدم من /addcoins و/removecoins ولوحة الأدمن.
 */
export async function adminAdjust(options: {
  userId: number;
  amount: number;
  action: "add" | "remove";
  actorId?: number | null;
  reason?: string;
  source?: "web" | "bot" | "system";
  type?: TxType;
}): Promise<{ transactionId: number; balance: number }> {
  const { userId, amount, action, actorId, reason } = options;
  if (!Number.isInteger(amount) || amount <= 0) throw errors.badRequest("المبلغ يجب أن يكون عدداً صحيحاً موجباً");
  if (amount > MAX_SAFE_AMOUNT) throw errors.badRequest("المبلغ كبير جداً");

  const result = await withTransaction(async (client) => {
    await lockUser(client, userId);
    const delta = action === "add" ? amount : -amount;
    const balance = await adjustBalance(client, userId, delta);
    const txId = await writeTransaction(client, {
      senderId: action === "remove" ? userId : null,
      recipientId: action === "add" ? userId : null,
      amount,
      tax: 0,
      net: amount,
      type: options.type ?? (action === "add" ? "admin_credit" : "admin_debit"),
      note: reason ?? (action === "add" ? "منح من الإدارة" : "خصم من الإدارة"),
      source: options.source ?? "system",
      balanceAfter: balance,
      metadata: { actorId: actorId ?? null },
    });
    return { transactionId: txId, balance };
  });

  emitBalance({ userId, balance: result.balance, change: action === "add" ? amount : -amount, reason: action === "add" ? "admin_credit" : "admin_debit" });
  events.emitEvent("transaction", {
    userId,
    transactionId: result.transactionId,
    senderId: action === "remove" ? userId : null,
    recipientId: action === "add" ? userId : null,
    amount,
    tax: 0,
    net: amount,
    type: action === "add" ? "admin_credit" : "admin_debit",
    direction: action === "add" ? "in" : "out",
    note: reason,
  });
  return result;
}

/** منح مكافأة نظام لمستخدم (بدون خصم) داخل Transaction قائم */
export async function creditReward(
  client: PoolClient,
  options: {
    userId: number;
    amount: number;
    type: TxType;
    note?: string;
    source?: "web" | "bot" | "system";
    metadata?: Record<string, unknown>;
  },
): Promise<{ transactionId: number; balance: number }> {
  const { userId, amount, type } = options;
  if (!Number.isInteger(amount) || amount < 0) throw errors.badRequest("قيمة المكافأة غير صالحة");
  const balance = await adjustBalance(client, userId, amount);
  const txId = await writeTransaction(client, {
    recipientId: userId,
    amount,
    net: amount,
    type,
    note: options.note ?? null,
    source: options.source ?? "system",
    recipientBalanceAfter: balance,
    metadata: options.metadata,
  });
  return { transactionId: txId, balance };
}

/** جلب سجل معاملات مستخدم */
export async function getUserTransactions(
  userId: number | string,
  limit = 30,
  options?: { offset?: number; type?: string },
): Promise<TransactionRecord[]> {
  const rows = await withTransaction(async (client) => {
    const result = await client.query(
      `SELECT t.*, 
              su.username AS sender_username, su.first_name AS sender_name,
              ru.username AS recipient_username, ru.first_name AS recipient_name
       FROM transactions t
       LEFT JOIN users su ON su.id = t.sender_id
       LEFT JOIN users ru ON ru.id = t.recipient_id
       WHERE (t.sender_id = $1 OR t.recipient_id = $1)
         AND ($3::text IS NULL OR t.type = $3)
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $4`,
      [userId, Math.min(Math.max(limit, 1), 100), options?.type ?? null, options?.offset ?? 0],
    );
    return result.rows;
  });

  return rows.map((row) => ({
    id: toBigNumber(row.id),
    senderId: row.sender_id ? toBigNumber(row.sender_id) : null,
    recipientId: row.recipient_id ? toBigNumber(row.recipient_id) : null,
    amount: toBigNumber(row.amount),
    tax: toBigNumber(row.tax),
    fee: toBigNumber(row.fee),
    net: toBigNumber(row.net),
    type: row.type,
    status: row.status,
    note: row.note,
    source: row.source,
    balanceAfter: row.balance_after === null ? null : toBigNumber(row.balance_after),
    recipientBalanceAfter: row.recipient_balance_after === null ? null : toBigNumber(row.recipient_balance_after),
    createdAt: row.created_at,
    metadata: { ...(row.metadata ?? {}), senderName: row.sender_name ?? null, senderUsername: row.sender_username ?? null, recipientName: row.recipient_name ?? null, recipientUsername: row.recipient_username ?? null },
  }));
}

/** عدد معاملات مستخدم */
export async function countUserTransactions(userId: number | string): Promise<number> {
  return withTransaction(async (client) => {
    const result = await client.query<{ count: string }>(
      "SELECT count(*) AS count FROM transactions WHERE sender_id = $1 OR recipient_id = $1",
      [userId],
    );
    return toBigNumber(result.rows[0]?.count);
  });
}

export type { PoolClient };
