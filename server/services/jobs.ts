/**
 * المهام المجدولة (تُشغَّل داخل نفس العملية):
 *  - فائدة البنك اليومية لجميع الحسابات.
 *  - ضريبة الثروة الدورية (اختيارية).
 *  - عقوبات تأخر القروض.
 *  - نسخة احتياطية دورية.
 * كل مهمة محمية بقفل استشاري في PostgreSQL (pg_try_advisory_lock) كي لا تتكرر
 * عند تشغيل أكثر من نسخة من التطبيق.
 */
import { query, queryOne, withTransaction } from "../db.js";
import { logger } from "../logger.js";
import { toBigNumber } from "../utils.js";
import { getNumber, addToTreasuryTx } from "./settings.js";
import { adjustBalance, writeTransaction } from "./ledger.js";
import { notify } from "./notifications.js";
import { applyOverdueLoans } from "./loans.js";

const log = logger.child("jobs");

const LOCK_NAMESPACE = 7_721_001;

async function withJobLock(name: string, fn: () => Promise<void>): Promise<void> {
  const client = await (await import("../db.js")).getPool().connect();
  try {
    const lock = await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1, hashtext($2)) AS ok", [LOCK_NAMESPACE, name]);
    if (!lock.rows[0]?.ok) {
      log.debug(`المهمة ${name} قيد التشغيل في نسخة أخرى`);
      return;
    }
    const startedAt = Date.now();
    try {
      await fn();
      await query("UPDATE jobs SET last_run_at = now(), last_status = 'ok', last_error = NULL, run_count = run_count + 1 WHERE name = $1", [name]);
      log.info(`اكتملت المهمة ${name}`, { ms: Date.now() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await query("UPDATE jobs SET last_run_at = now(), last_status = 'error', last_error = $2 WHERE name = $1", [name, message.slice(0, 500)]).catch(() => undefined);
      log.error(`فشلت المهمة ${name}`, { error: message });
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, hashtext($2))", [LOCK_NAMESPACE, name]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
}

/** فائدة البنك اليومية لكل الحسابات التي مضى على فائدتها 24 ساعة */
export async function runBankInterest(): Promise<{ accounts: number; total: number }> {
  const [percent, capacity] = await Promise.all([getNumber("bank_interest_pct"), getNumber("bank_capacity")]);
  if (percent <= 0) return { accounts: 0, total: 0 };

  const rows = await query<{ id: string; bank_balance: string }>(
    `SELECT id, bank_balance FROM users
     WHERE bank_balance > 0
       AND (last_bank_interest IS NULL OR last_bank_interest <= now() - interval '24 hours')
     LIMIT 1000`,
  );

  let accounts = 0;
  let total = 0;
  for (const row of rows) {
    try {
      await withTransaction(async (client) => {
        const locked = await client.query<{ bank_balance: string; last_bank_interest: string | null }>(
          "SELECT bank_balance, last_bank_interest FROM users WHERE id = $1 FOR UPDATE",
          [row.id],
        );
        const user = locked.rows[0];
        if (!user) return;
        const last = user.last_bank_interest ? new Date(user.last_bank_interest).getTime() : null;
        if (last !== null && Date.now() - last < 86_400_000) return;

        const bankBalance = Math.min(toBigNumber(user.bank_balance), Math.round(capacity));
        if (bankBalance <= 0) return;
        const interest = Math.round((bankBalance * percent) / 100);
        if (interest <= 0) {
          await client.query("UPDATE users SET last_bank_interest = now() WHERE id = $1", [row.id]);
          return;
        }
        await client.query(
          `UPDATE users SET bank_balance = bank_balance + $1, last_bank_interest = now(), bank_count = bank_count + 1
           WHERE id = $2`,
          [interest, row.id],
        );
        await writeTransaction(client, {
          recipientId: toBigNumber(row.id),
          amount: interest,
          net: interest,
          type: "bank_interest",
          note: "فائدة بنكية يومية",
          source: "system",
          recipientBalanceAfter: bankBalance + interest,
        });
        accounts++;
        total += interest;
      });
    } catch (error) {
      log.warn("فشل احتساب فائدة لمستخدم", { userId: row.id, error: String(error) });
    }
  }

  if (accounts > 0) {
    log.info("فائدة البنك اليومية", { accounts, total });
  }
  return { accounts, total };
}

/** ضريبة الثروة الدورية على الأرصدة فوق الحد */
export async function runWealthTax(): Promise<{ taxed: number; total: number }> {
  const [percent, threshold, intervalHours] = await Promise.all([
    getNumber("wealth_tax_pct"),
    getNumber("wealth_tax_threshold"),
    getNumber("wealth_tax_interval_hours"),
  ]);
  if (percent <= 0) return { taxed: 0, total: 0 };

  const rows = await query<{ id: string; balance: string }>(
    `SELECT id, balance FROM users
     WHERE balance > $1
       AND (last_seen_at IS NULL OR last_seen_at > now() - interval '30 days')
     LIMIT 500`,
    [Math.round(threshold)],
  );

  let taxed = 0;
  let total = 0;
  const lastRun = await queryOne<{ last_run_at: string | null }>("SELECT last_run_at FROM jobs WHERE name = 'wealth_tax'");
  if (lastRun?.last_run_at && Date.now() - new Date(lastRun.last_run_at).getTime() < intervalHours * 3_600_000) {
    return { taxed: 0, total: 0 };
  }

  for (const row of rows) {
    try {
      const tax = await withTransaction(async (client) => {
        const locked = await client.query<{ balance: string }>("SELECT balance FROM users WHERE id = $1 FOR UPDATE", [row.id]);
        const balance = toBigNumber(locked.rows[0]?.balance);
        if (balance <= threshold) return 0;
        const amount = Math.max(1, Math.round(((balance - threshold) * percent) / 100));
        const newBalance = await adjustBalance(client, row.id, -amount);
        await writeTransaction(client, {
          senderId: toBigNumber(row.id),
          amount,
          net: 0,
          type: "wealth_tax",
          note: `ضريبة ثروة ${percent}% على ما يزيد عن ${Math.round(threshold)} BTP`,
          source: "system",
          balanceAfter: newBalance,
        });
        await addToTreasuryTx(client, amount);
        return amount;
      });
      if (tax > 0) {
        taxed++;
        total += tax;
        void notify({
          userId: toBigNumber(row.id),
          title: "💸 ضريبة ثروة",
          body: `خُصمت ${tax} BTP كضريبة ثروة على رصيدك الذي يتجاوز ${Math.round(threshold)} BTP.`,
          kind: "info",
          telegram: true,
        }).catch(() => undefined);
      }
    } catch (error) {
      log.warn("فشل احتساب ضريبة ثروة", { userId: row.id, error: String(error) });
    }
  }
  return { taxed, total };
}

/** كل المهام الدورية (تُنادى كل دقيقة) */
export async function runScheduledTasks(): Promise<void> {
  await withJobLock("bank_interest", async () => {
    const result = await runBankInterest();
    if (result.accounts === 0) {
      // نُحدّث وقت التشغيل فقط عندما توجد حسابات لتجنّب استعلامات متكررة
      await query("UPDATE jobs SET last_run_at = now(), last_status = 'ok' WHERE name = 'bank_interest'").catch(() => undefined);
    }
  });
  await withJobLock("wealth_tax", async () => {
    await runWealthTax();
  });
  await withJobLock("loan_overdue", async () => {
    const result = await applyOverdueLoans();
    if (result.penalized > 0) log.info("عقوبات تأخر القروض", result);
  });
}

/** هل حان موعد المهمة؟ (تعتمد على jobs.last_run_at) */
export async function shouldRun(name: string, intervalMinutes: number): Promise<boolean> {
  const row = await queryOne<{ last_run_at: string | null }>("SELECT last_run_at FROM jobs WHERE name = $1", [name]);
  if (!row?.last_run_at) return true;
  return Date.now() - new Date(row.last_run_at).getTime() >= intervalMinutes * 60_000;
}

export const scheduler = {
  timer: null as NodeJS.Timeout | null,
  start(intervalMs = 60_000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      runScheduledTasks().catch((error) => log.error("خطأ في المهام المجدولة", { error: String(error) }));
    }, intervalMs);
    this.timer.unref?.();
    log.info("بدء جدولة المهام الدورية", { intervalMs });
  },
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  },
};
