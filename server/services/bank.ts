/**
 * البنك: إيداع/سحب + فائدة يومية صغيرة تُصرف تلقائياً (أو عند أول فتح للبنك).
 * الرصيد البنكي محمي من السرقة والضرائب المباشرة.
 */
import { query, queryOne, withTransaction } from "../db.js";
import { errors } from "../errors.js";
import { percentOf, toBigNumber } from "../utils.js";
import { getNumber } from "./settings.js";
import { adjustBalance, lockUser, writeTransaction, emitBalance } from "./ledger.js";
import { events } from "./events.js";
import type { UserRow } from "./users.js";

export interface BankInfo {
  balance: number;
  bankBalance: number;
  capacity: number;
  interestPercent: number;
  minDeposit: number;
  pendingInterest: number;
  lastInterestAt: string | null;
  secondsToInterest: number;
  claims: number;
  history: Array<{ amount: number; createdAt: string }>;
}

export interface BankMoveResult {
  balance: number;
  bankBalance: number;
  amount: number;
  interestCredited: number;
}

/** احتساب الفائدة المستحقة (بدون كتابة) */
export function estimateInterest(bankBalance: number, percent: number, capacity: number): number {
  const capped = Math.min(bankBalance, capacity);
  if (capped <= 0) return 0;
  return Math.max(0, percentOf(capped, percent));
}

/** بيانات البنك الحالية + الفائدة المعلقة */
export async function getBankInfo(user: Pick<UserRow, "balance" | "bank_balance" | "last_bank_interest" | "bank_count">): Promise<BankInfo> {
  const [capacity, interestPercent, minDeposit] = await Promise.all([
    getNumber("bank_capacity"),
    getNumber("bank_interest_pct"),
    getNumber("bank_min_deposit"),
  ]);
  const last = user.last_bank_interest ? new Date(user.last_bank_interest).getTime() : null;
  const nextAt = last ? last + 86_400_000 : Date.now();
  const remaining = Math.max(0, nextAt - Date.now());
  const bankBalance = toBigNumber(user.bank_balance);
  return {
    balance: toBigNumber(user.balance),
    bankBalance,
    capacity: Math.round(capacity),
    interestPercent,
    minDeposit: Math.round(minDeposit),
    pendingInterest: remaining === 0 ? estimateInterest(bankBalance, interestPercent, capacity) : 0,
    lastInterestAt: user.last_bank_interest,
    secondsToInterest: Math.ceil(remaining / 1000),
    claims: user.bank_count,
    history: [],
  };
}

/**
 * احتساب الفائدة المستحقة داخل Transaction (تُستدعى قبل أي إيداع/سحب وقبل عرض البنك).
 * تُدفع الفائدة مرة واحدة كل 24 ساعة على الأقل.
 */
export async function accrueInterestInTx(
  client: import("pg").PoolClient,
  userId: number | string,
  percent: number,
  capacity: number,
): Promise<number> {
  const result = await client.query<{ bank_balance: string; last_bank_interest: string | null }>(
    "SELECT bank_balance, last_bank_interest FROM users WHERE id = $1",
    [userId],
  );
  const row = result.rows[0];
  if (!row) return 0;
  const last = row.last_bank_interest ? new Date(row.last_bank_interest).getTime() : null;
  if (last !== null && Date.now() - last < 86_400_000) return 0;

  const bankBalance = toBigNumber(row.bank_balance);
  const interest = estimateInterest(bankBalance, percent, capacity);
  if (interest <= 0) {
    await client.query("UPDATE users SET last_bank_interest = now() WHERE id = $1", [userId]);
    return 0;
  }
  const updated = await client.query<{ bank_balance: string }>(
    `UPDATE users SET bank_balance = bank_balance + $1, last_bank_interest = now(), bank_count = bank_count + 1
     WHERE id = $2 RETURNING bank_balance`,
    [interest, userId],
  );
  await writeTransaction(client, {
    recipientId: Number(userId),
    amount: interest,
    net: interest,
    type: "bank_interest",
    note: "فائدة بنكية يومية",
    source: "system",
    recipientBalanceAfter: toBigNumber(updated.rows[0]?.bank_balance),
  });
  return interest;
}

/** صرف الفائدة المستحقة لمستخدم (تُستدعى بشكل دوري/عند العرض) */
export async function claimInterest(userId: number | string): Promise<number> {
  const [percent, capacity] = await Promise.all([getNumber("bank_interest_pct"), getNumber("bank_capacity")]);
  const interest = await withTransaction(async (client) => {
    await lockUser(client, userId);
    return accrueInterestInTx(client, userId, percent, capacity);
  });
  if (interest > 0) {
    const user = await queryOne<{ bank_balance: string }>("SELECT bank_balance FROM users WHERE id = $1", [userId]);
    events.emitEvent("notification", {
      userId: Number(userId),
      title: "🏦 فائدة بنكية",
      body: `أُضيفت فائدة ${interest} BTP إلى رصيدك البنكي.`,
      kind: "success",
    });
    void user;
  }
  return interest;
}

/** إيداع في البنك */
export async function deposit(userId: number | string, amount: number, source: "web" | "bot" = "web"): Promise<BankMoveResult> {
  const value = Math.round(Number(amount));
  if (!Number.isInteger(value) || value <= 0) throw errors.badRequest("المبلغ غير صالح");
  const [minDeposit, capacity, percent] = await Promise.all([
    getNumber("bank_min_deposit"),
    getNumber("bank_capacity"),
    getNumber("bank_interest_pct"),
  ]);
  if (value < Math.round(minDeposit)) throw errors.badRequest(`أدنى إيداع بنكي هو ${Math.round(minDeposit)} BTP`);

  const result = await withTransaction(async (client) => {
    const user = await lockUser(client, userId);
    const interestCredited = await accrueInterestInTx(client, user.id, percent, capacity);
    const currentBank = toBigNumber(
      (await client.query<{ bank_balance: string }>("SELECT bank_balance FROM users WHERE id = $1", [user.id])).rows[0]?.bank_balance,
    );
    if (currentBank + value > capacity) throw errors.badRequest(`تجاوزت سعة البنك (${Math.round(capacity)} BTP)`);
    if (user.balance < value) throw errors.insufficientFunds();

    const balance = await adjustBalance(client, user.id, -value);
    const bankRow = await client.query<{ bank_balance: string }>(
      "UPDATE users SET bank_balance = bank_balance + $1, bank_count = bank_count + 1, last_seen_at = now() WHERE id = $2 RETURNING bank_balance",
      [value, user.id],
    );
    const bankBalance = toBigNumber(bankRow.rows[0]?.bank_balance);

    await writeTransaction(client, {
      senderId: user.id,
      amount: value,
      net: value,
      type: "bank_deposit",
      note: `إيداع بنكي${interestCredited ? ` (+${interestCredited} فائدة)` : ""}`,
      source,
      balanceAfter: balance,
      metadata: { bankBalance },
    });

    return { balance, bankBalance, amount: value, interestCredited };
  });

  emitBalance({ userId: Number(userId), balance: result.balance, change: -value, reason: "bank_deposit" });
  return result;
}

/** سحب من البنك */
export async function withdraw(userId: number | string, amount: number, source: "web" | "bot" = "web"): Promise<BankMoveResult> {
  const value = Math.round(Number(amount));
  if (!Number.isInteger(value) || value <= 0) throw errors.badRequest("المبلغ غير صالح");
  const [capacity, percent] = await Promise.all([getNumber("bank_capacity"), getNumber("bank_interest_pct")]);

  const result = await withTransaction(async (client) => {
    const user = await lockUser(client, userId);
    const interestCredited = await accrueInterestInTx(client, user.id, percent, capacity);
    const currentBank = toBigNumber(
      (await client.query<{ bank_balance: string }>("SELECT bank_balance FROM users WHERE id = $1", [user.id])).rows[0]?.bank_balance,
    );
    if (currentBank < value) throw errors.badRequest("رصيدك البنكي لا يكفي");

    const bankRow = await client.query<{ bank_balance: string }>(
      "UPDATE users SET bank_balance = bank_balance - $1, last_seen_at = now() WHERE id = $2 RETURNING bank_balance",
      [value, user.id],
    );
    const bankBalance = toBigNumber(bankRow.rows[0]?.bank_balance);
    const balance = await adjustBalance(client, user.id, value);

    await writeTransaction(client, {
      recipientId: user.id,
      amount: value,
      net: value,
      type: "bank_withdraw",
      note: `سحب بنكي${interestCredited ? ` (+${interestCredited} فائدة)` : ""}`,
      source,
      recipientBalanceAfter: balance,
      metadata: { bankBalance },
    });

    return { balance, bankBalance, amount: value, interestCredited };
  });

  emitBalance({ userId: Number(userId), balance: result.balance, change: value, reason: "bank_withdraw" });
  return result;
}

/** إجمالي أرصدة البنوك في النظام */
export async function getBankTotals(): Promise<{ accounts: number; total: number }> {
  const row = await queryOne<{ accounts: string; total: string | null }>(
    "SELECT count(*) FILTER (WHERE bank_balance > 0) AS accounts, COALESCE(sum(bank_balance), 0) AS total FROM users",
  );
  return { accounts: toBigNumber(row?.accounts), total: toBigNumber(row?.total) };
}

/** سجل الفوائد */
export async function listInterestHistory(userId: number | string, limit = 10) {
  const rows = await query<{ amount: string; created_at: string }>(
    `SELECT amount, created_at FROM transactions
     WHERE recipient_id = $1 AND type = 'bank_interest'
     ORDER BY created_at DESC LIMIT $2`,
    [userId, Math.min(limit, 50)],
  );
  return rows.map((row) => ({ amount: toBigNumber(row.amount), createdAt: row.created_at }));
}
