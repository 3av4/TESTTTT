/**
 * اختبار دخاني للخدمات المالية (لا يعتمد على الشبكة): npm run smoke
 * ينشئ مستخدمين تجريبيين وينفّذ: راتب، تحويل + ضريبة، لعبة، بنك، كود، إحالة، سرقة.
 */
import crypto from "node:crypto";
import { startEmbeddedDatabase, stopEmbeddedDatabase } from "../server/pglite.js";
import { closePool, migrate, query } from "../server/db.js";
import { claimDaily } from "../server/services/daily.js";
import { sendCoins } from "../server/services/transfer.js";
import { upsertTelegramUser } from "../server/services/users.js";
import { play } from "../server/services/games.js";
import { deposit, withdraw } from "../server/services/bank.js";
import { createCode, redeemCode } from "../server/services/codes.js";
import { attachReferral, claimReferralReward } from "../server/services/referral.js";
import { buyItem } from "../server/services/shop.js";
import { rob } from "../server/services/rob.js";
import { getTreasuryBalance } from "../server/services/settings.js";
import { getSystemStats } from "../server/services/users.js";

function id(): number {
  return 700_000_000 + crypto.randomInt(1_000_000);
}

async function main() {
  await startEmbeddedDatabase();
  await migrate();
  const a = await upsertTelegramUser({ id: id(), first_name: "أحمد" });
  const b = await upsertTelegramUser({ id: id(), first_name: "سارة" });

  console.log("start balance", a.balance, b.balance);

  const d1 = await claimDaily(a.id, "web");
  console.log("daily", d1.amount, "streak", d1.streak, "balance", d1.balance);
  let raceSafe = "FAIL";
  try {
    await claimDaily(a.id, "web");
  } catch (e) {
    raceSafe = (e as { code?: string }).code ?? "ERR";
  }
  console.log("second daily blocked:", raceSafe);

  const before = await getTreasuryBalance();
  const tr = await sendCoins({ senderId: a.id, recipient: b.id, amount: 500, source: "web" });
  const after = await getTreasuryBalance();
  console.log("transfer", tr.amount, "tax", tr.tax, "net", tr.net, "treasury delta", after - before);

  const game = await play({ userId: a.id, game: "dice", bet: 100, choice: "high", source: "web" });
  console.log("game", game.result, "won", game.won, "payout", game.payout, "tax", game.tax, "balance", game.balance);

  const dep = await deposit(b.id, 200);
  console.log("bank deposit", dep.bankBalance, "cash", dep.balance);
  const wd = await withdraw(b.id, 50);
  console.log("bank withdraw", wd.bankBalance, "cash", wd.balance);

  const code = await createCode({ amount: 250, maxUses: 2, createdBy: Number(a.id) });
  const red = await redeemCode(b.id, code.code);
  console.log("redeem", red.amount, "balance", red.balance, "usesLeft", red.usesLeft);

  const c = await upsertTelegramUser({ id: id(), first_name: "مدعو" });
  const linked = await attachReferral(c, `ref_${(await query<{ referral_code: string }>("SELECT referral_code FROM users WHERE id=$1", [a.id]))[0]!.referral_code}`);
  const reward = await claimReferralReward(c.id);
  console.log("referral linked", linked, "paid", reward.paid, "inviter+", reward.inviterReward);

  const buyer = await upsertTelegramUser({ id: id(), first_name: "مشتري" });
  await query("UPDATE users SET balance = 6000 WHERE id = $1", [buyer.id]);
  const bought = await buyItem(buyer.id, "title_whale");
  console.log("shop", bought.item.code, "price", bought.price, "balance", bought.balance);

  const r = await rob({ robberId: buyer.id, victimId: a.id, amount: 100, source: "bot" });
  console.log("rob success", r.success, "roll", r.roll, "balance", r.balance);

  const stats = await getSystemStats();
  console.log("stats users", stats.totalUsers, "volume", stats.totalVolume, "treasury", stats.treasury);
  const negatives = await query("SELECT count(*) c FROM users WHERE balance < 0");
  const mismatched = await query<{ c: string }>("SELECT count(*) c FROM transactions WHERE amount <= 0");
  console.log("negative balances", negatives[0], "invalid tx", mismatched[0]);

  await closePool();
  await stopEmbeddedDatabase();
  process.exit(0);
}

main().catch(async (error) => {
  console.error("SMOKE FAILED", error);
  await closePool().catch(() => undefined);
  await stopEmbeddedDatabase().catch(() => undefined);
  process.exit(1);
});
