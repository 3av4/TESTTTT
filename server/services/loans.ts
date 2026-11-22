/**
 * القروض: قرض صغير بفائدة ومدة محددة، ورهان تأخير تلقائي.
 * القرض يُمنح مرة واحدة للمستخدم النشط، ويُسدد من الرصيد.
 */
import { query, queryOne, withTransaction } from "../db.js";
import { errors } from "../errors.js";
import { percentOf, toBigNumber } from "../utils.js";
import { getNumber } from "./settings.js";
import { adjustBalance, lockUser, writeTransaction, emitBalance } from "./ledger.js";
import { notify } from "./notifications.js";

export interface Loan {
  id: number;
  principal: number;
  totalDue: number;
  paid: number;
  remaining: number;
  interestPercent: number;
  status: "active" | "overdue" | "paid" | "defaulted";
  createdAt: string;
  dueAt: string;
  hoursLeft: number;
  isOverdue: boolean;
}

export interface LoanInfo {
  active: Loan | null;
  history: Array<Pick<Loan, "id" | "principal" | "totalDue" | "paid" | "status" | "createdAt" | "dueAt">>;
  maxAmount: number;
  interestPercent: number;
  durationHours: number;
  totalLoans: number;
  eligible: boolean;
  reason?: string;
}

function toLoan(row: Record<string, unknown>): Loan {
  const dueAt = new Date(String(row.due_at));
  const hoursLeft = Math.max(0, (dueAt.getTime() - Date.now()) / 3_600_000);
  return {
    id: toBigNumber(row.id),
    principal: toBigNumber(row.principal),
    totalDue: toBigNumber(row.total_due),
    paid: toBigNumber(row.paid),
    remaining: Math.max(0, toBigNumber(row.total_due) - toBigNumber(row.paid)),
    interestPercent: 0,
    status: String(row.status) as Loan["status"],
    createdAt: String(row.created_at),
    dueAt: dueAt.toISOString(),
    hoursLeft: Math.round(hoursLeft * 10) / 10,
    isOverdue: dueAt.getTime() < Date.now() && String(row.status) !== "paid",
  };
}

/** بيانات القروض لمستخدم */
export async function getLoanInfo(userId: number | string): Promise<LoanInfo> {
  const [maxAmount, interestPercent, durationHours] = await Promise.all([
    getNumber("loan_max_amount"),
    getNumber("loan_interest_pct"),
    getNumber("loan_duration_hours"),
  ]);

  const activeRow = await queryOne<Record<string, unknown>>(
    "SELECT * FROM loans WHERE user_id = $1 AND status IN ('active','overdue') ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  const historyRows = await query<Record<string, unknown>>(
    "SELECT * FROM loans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
    [userId],
  );
  const user = await queryOne<{ total_wagered: string; created_at: string; is_banned: boolean }>(
    "SELECT total_wagered, created_at, is_banned FROM users WHERE id = $1",
    [userId],
  );

  const dayOld = user ? Date.now() - new Date(user.created_at).getTime() > 86_400_000 : false;
  const active = activeRow ? toLoan(activeRow) : null;
  const eligible = !active && dayOld && !user?.is_banned;
  const reason = active
    ? "لديك قرض نشط — سدّده أولاً"
    : !dayOld
      ? "يجب أن يمر 24 ساعة على إنشاء حسابك"
      : !user
        ? "المستخدم غير موجود"
        : undefined;

  return {
    active,
    history: historyRows.map((row) => {
      const loan = toLoan(row);
      return {
        id: loan.id,
        principal: loan.principal,
        totalDue: loan.totalDue,
        paid: loan.paid,
        status: loan.status,
        createdAt: loan.createdAt,
        dueAt: loan.dueAt,
      };
    }),
    maxAmount: Math.round(maxAmount),
    interestPercent,
    durationHours: Math.round(durationHours),
    totalLoans: historyRows.length,
    eligible,
    reason,
  };
}

/** طلب قرض */
export async function requestLoan(
  userId: number | string,
  amount: number,
  source: "web" | "bot" = "web",
): Promise<{ loan: Loan; balance: number; transactionId: number }> {
  const value = Math.round(Number(amount));
  if (!Number.isInteger(value) || value <= 0) throw errors.badRequest("المبلغ غير صالح");

  const [maxAmount, interestPercent, durationHours] = await Promise.all([
    Math.round(await getNumber("loan_max_amount")),
    await getNumber("loan_interest_pct"),
    await getNumber("loan_duration_hours"),
  ]);
  if (value > maxAmount) throw errors.badRequest(`أعلى قرض هو ${maxAmount} BTP`);

  const result = await withTransaction(async (client) => {
    const user = await lockUser(client, userId);
    const existing = await client.query(
      "SELECT 1 FROM loans WHERE user_id = $1 AND status IN ('active','overdue')",
      [user.id],
    );
    if (existing.rowCount) throw errors.badRequest("لديك قرض نشط بالفعل — سدّده أولاً");

    const created = await client.query<{ created_at: string }>("SELECT created_at FROM users WHERE id = $1", [user.id]);
    if (Date.now() - new Date(created.rows[0]!.created_at).getTime() < 86_400_000) {
      throw errors.badRequest("يجب أن يمر 24 ساعة على إنشاء حسابك قبل طلب قرض");
    }

    const totalDue = value + percentOf(value, interestPercent);
    const dueAt = new Date(Date.now() + durationHours * 3_600_000).toISOString();

    const loanRow = await client.query<Record<string, unknown>>(
      `INSERT INTO loans (user_id, principal, total_due, paid, status, reason, due_at)
       VALUES ($1, $2, $3, 0, 'active', 'قرض من النظام', $4) RETURNING *`,
      [user.id, value, totalDue, dueAt],
    );

    const balance = await adjustBalance(client, user.id, value);
    const txId = await writeTransaction(client, {
      recipientId: user.id,
      amount: value,
      net: value,
      type: "loan_granted",
      note: `قرض — يُسدد ${totalDue} BTP`,
      source,
      recipientBalanceAfter: balance,
      metadata: { loanId: toBigNumber(loanRow.rows[0]?.id), dueAt, interestPercent },
    });

    return { loan: toLoan(loanRow.rows[0]!), balance, transactionId: txId };
  });

  emitBalance({ userId: Number(userId), balance: result.balance, change: value, reason: "loan_granted" });
  void notify({
    userId: Number(userId),
    title: "🏦 تم منحك قرضاً",
    body: `استلمت ${value} BTP. المبلغ المستحق ${result.loan.totalDue} BTP قبل ${new Date(result.loan.dueAt).toLocaleDateString("ar-DZ")}.`,
    kind: "info",
    telegram: true,
  }).catch(() => undefined);

  return result;
}

/** سداد قرض */
export async function repayLoan(
  userId: number | string,
  options?: { amount?: number; loanId?: number },
  source: "web" | "bot" = "web",
): Promise<{ paid: number; remaining: number; closed: boolean; balance: number }> {
  const result = await withTransaction(async (client) => {
    const user = await lockUser(client, userId);
    const loanRow = options?.loanId
      ? await client.query<Record<string, unknown>>(
          "SELECT * FROM loans WHERE id = $1 AND user_id = $2 FOR UPDATE",
          [options.loanId, user.id],
        )
      : await client.query<Record<string, unknown>>(
          "SELECT * FROM loans WHERE user_id = $1 AND status IN ('active','overdue') ORDER BY created_at ASC LIMIT 1 FOR UPDATE",
          [user.id],
        );
    const row = loanRow.rows[0];
    if (!row) throw errors.notFound("لا يوجد قرض نشط");
    if (String(row.status) === "paid") throw errors.badRequest("هذا القرض مسدّد بالكامل");

    const totalDue = toBigNumber(row.total_due);
    const paid = toBigNumber(row.paid);
    const remaining = Math.max(0, totalDue - paid);
    const amount = Math.min(remaining, Math.round(Number(options?.amount ?? remaining)));
    if (amount <= 0) throw errors.badRequest("المبلغ غير صالح");

    const balance = await adjustBalance(client, user.id, -amount);
    const newPaid = paid + amount;
    const closed = newPaid >= totalDue;

    const history = String(row.reason ?? "").slice(0, 60);
    await client.query(
      `UPDATE loans SET paid = $1, status = $2, closed_at = CASE WHEN $2 = 'paid' THEN now() ELSE NULL END
       WHERE id = $3`,
      [newPaid, closed ? "paid" : String(row.status), row.id],
    );

    await writeTransaction(client, {
      senderId: user.id,
      amount,
      net: amount,
      type: "loan_repayment",
      note: `سداد قرض${history ? ` — ${history}` : ""}`,
      source,
      balanceAfter: balance,
      metadata: { loanId: toBigNumber(row.id) },
    });

    return { paid: amount, remaining: Math.max(0, totalDue - newPaid), closed, balance };
  });

  emitBalance({ userId: Number(userId), balance: result.balance, change: -result.paid, reason: "loan_repayment" });
  if (result.closed) {
    void notify({
      userId: Number(userId),
      title: "✅ سداد قرض مكتمل",
      body: "تم سداد قرضك بالكامل، يمكنك طلب قرض جديد.",
      kind: "success",
    }).catch(() => undefined);
  }
  return result;
}

/** تطبيق عقوبة التأخير (مهمة دورية) */
export async function applyOverdueLoans(): Promise<{ checked: number; penalized: number }> {
  const penaltyPct = await getNumber("loan_overdue_penalty");
  const rows = await query<{ id: string; user_id: string; principal: string; total_due: string; paid: string }>(
    `SELECT id, user_id, principal, total_due, paid FROM loans
     WHERE status = 'active' AND due_at < now() LIMIT 200`,
  );

  let penalized = 0;
  for (const row of rows) {
    try {
      await withTransaction(async (client) => {
        const locked = await client.query<{ status: string; total_due: string; paid: string }>(
          "SELECT status, total_due, paid FROM loans WHERE id = $1 FOR UPDATE",
          [row.id],
        );
        const loan = locked.rows[0];
        if (!loan || loan.status !== "active") return;

        const remaining = toBigNumber(loan.total_due) - toBigNumber(loan.paid);
        const penalty = Math.max(1, percentOf(remaining, penaltyPct));
        await client.query(
          "UPDATE loans SET total_due = total_due + $1, status = 'overdue' WHERE id = $2",
          [penalty, row.id],
        );
        const userRow = await client.query<{ balance: string }>("SELECT balance FROM users WHERE id = $1", [row.user_id]);
        await writeTransaction(client, {
          senderId: toBigNumber(row.user_id),
          amount: penalty,
          net: penalty,
          type: "loan_penalty",
          note: "عقوبة تأخير سداد قرض",
          source: "system",
          balanceAfter: toBigNumber(userRow.rows[0]?.balance),
          metadata: { loanId: toBigNumber(row.id) },
        });
        penalized++;
        void notify({
          userId: toBigNumber(row.user_id),
          title: "⚠️ تأخر سداد القرض",
          body: `أُضيفت عقوبة تأخير ${penalty} BTP على قرضك. المبلغ المستحق الآن ${toBigNumber(loan.total_due) + penalty} BTP.`,
          kind: "warning",
          telegram: true,
        }).catch(() => undefined);
      });
    } catch {
      // تجاهل الأخطاء الفردية لاستمرار المهمة
    }
  }
  return { checked: rows.length, penalized };
}

/** إحصائيات القروض */
export async function loanStats(): Promise<{ active: number; overdue: number; paid: number; outstanding: number }> {
  const row = await queryOne<Record<string, string | null>>(
    `SELECT count(*) FILTER (WHERE status = 'active') AS active,
            count(*) FILTER (WHERE status = 'overdue') AS overdue,
            count(*) FILTER (WHERE status = 'paid') AS paid,
            COALESCE(sum(total_due - paid) FILTER (WHERE status IN ('active','overdue')), 0) AS outstanding
     FROM loans`,
  );
  return {
    active: toBigNumber(row?.active),
    overdue: toBigNumber(row?.overdue),
    paid: toBigNumber(row?.paid),
    outstanding: toBigNumber(row?.outstanding),
  };
}
