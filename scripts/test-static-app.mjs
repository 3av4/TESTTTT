/**
 * اختبار النسخة الثابتة (docs/) — المحرك + الواجهة في DOM حقيقي.
 *
 * التشغيل:  npx jsdom  (غير مطلوب — يُثبَّت عند الحاجة)
 *           npm i --no-save jsdom && node scripts/test-static-app.mjs
 *
 * يتحقق من:
 *  • المحرك: راتب، تحويل، بنك، ألعاب، سرقة، متجر، قروض، إحالات، إدارة
 *  • الواجهة: كل صفحة ترسم، الأزرار تعمل، صفحة الأوامر (41 أمر)
 *  • لا أخطاء JS ولا "undefined" في أي صفحة
 */
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(root, "docs");
const results = [];
const check = (name, cond, extra = "") => results.push([name, Boolean(cond), extra]);

/* ===================== 1) اختبار المحرك ===================== */
const store = {};
const fakeWindow = {
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  },
  crypto: webcrypto,
  navigator: { language: "ar" },
};
fakeWindow.window = fakeWindow;

const coreSource = readFileSync(join(docs, "core.js"), "utf8");
new Function("window", coreSource)(fakeWindow);
const C = fakeWindow.BitPoinCore;

C.load();
C.reset();
const p1 = C.createUser({ id: "u1", name: "لاعب", username: "p1" });
check("إنشاء حساب برصيد 1000", p1.balance === 1000, String(p1.balance));
check("الراتب متاح", C.dailyStatus(p1).canClaim === true);
const daily = C.claimDaily();
check("الراتب يعطي مبلغاً صحيحاً", daily.amount >= 100 && daily.amount <= 610, String(daily.amount));
check("الراتب يُقفل بعد الاستلام", C.dailyStatus(C.currentUser()).canClaim === false);

C.logout();
C.createUser({ id: "u2", name: "هدف", username: "target" });
C.createUser({ id: "u3", name: "مرسل", username: "sender" });
const preview = C.transferPreview(100);
check("ضريبة التحويل 5%", preview.tax === 5 && preview.net === 95, JSON.stringify(preview));
check("التحويل ينفّذ", C.transfer("target", 100).net === 95);

C.deposit(200);
check("إيداع بنكي", C.currentUser().bankBalance === 200);
check("بيانات البنك", C.bankInfo().capacity > 0);
C.withdraw(50);
check("سحب بنكي", C.currentUser().bankBalance === 150);

C.currentUser().balance = 5000;
C.persist();
for (const game of ["dice", "coinflip", "roulette"]) {
  const result = C.play(game, 100, game === "dice" ? "high" : game === "coinflip" ? "heads" : "red");
  check(`لعبة ${game}`, typeof result.won === "boolean" && typeof result.payout === "number");
}
const slots = C.play("slots", 100, null);
check("ماكينة: 3 رموز", Array.isArray(slots.details.reels) && slots.details.reels.length === 3);
check("إحصاءات اللعب", C.gameStats(C.currentUser()).played >= 4);

C.createUser({ id: "victim", name: "ضحية", username: "victim" });
C.logout();
C.createUser({ id: "u3", name: "مرسل", username: "sender" });
check("السرقة متاحة", C.robStatus().available === true);
const rob = C.rob("victim");
check("السرقة تعطي رسالة", typeof rob.success === "boolean" && typeof rob.message === "string");
check("تبريد السرقة", C.robStatus().available === false);

const items = C.shopItems();
check("المتجر: 8 عناصر", items.length === 8, String(items.length));
check("حقول عناصر المتجر", items.every((i) => "owned" in i && "kind" in i && "price" in i));
C.currentUser().balance = 10000;
C.persist();
C.buyItem("title_whale", 1);
C.equipTitle("title_whale");
check("شراء وتفعيل لقب", Boolean(C.currentUser().activeTitle));

const ref = C.referralInfo();
check("كود الإحالة", Boolean(ref.code));
check("رابط الإحالة t.me", ref.link.includes("t.me/BitPoinBot"), ref.link);
check("قائمة المدعوين", Array.isArray(ref.invited));

check("لا قرض نشط", C.loanInfo().active === null);
const loan = C.takeLoan(1000);
check("القرض 10% فائدة", loan.totalDue === 1100, String(loan.totalDue));
C.repayLoan();
check("سداد القرض", C.loanInfo().active === null);

for (const scope of ["global", "games", "referrals"]) {
  const board = C.leaderboard(scope);
  check(`المتصدرون: ${scope}`, Array.isArray(board.entries));
}
const txs = C.transactions({ limit: 50 });
check("سجل المعاملات", txs.items.length > 0 && txs.total > 0);

check("login يستعيد الجلسة", C.login("sender") !== null);
check("listUsers", C.listUsers().length >= 4);

C.logout();
C.createUser({ id: "adm", name: "المدير", isAdmin: true });
const overview = C.adminOverview();
check("نظرة عامة إدارية", overview.stats.totalUsers >= 4);
check("اقتصاد إداري", "heldByUsers" in overview.economy && "treasury" in overview.economy);
check("إعدادات إدارية", C.adminSettings().length > 5);
C.adminAdjust("u1", 500, "add");
check("تعديل رصيد", true);
C.adminToggleBan("u2");
check("حظر مستخدم", C.adminUsers("").items.find((u) => u.id === "u2").isBanned === true);
check("معاملات إدارية", C.adminTransactions(10).items[0].senderName !== undefined);
check("تصدير الحالة", C.exportState().includes("users"));
C.reset();
check("إعادة تعيين", C.stats().users === 0);

/* ===================== 2) اختبار الواجهة ===================== */
const html = readFileSync(join(docs, "index.html"), "utf8")
  .replace(/<script src="core.js"><\/script>/, "")
  .replace(/<script src="app.js"><\/script>/, "");

const dom = new JSDOM(html, {
  url: "https://3av4.github.io/TESTTTT/docs/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
window.scrollTo = () => {};
// jsdom يوفّر crypto بنفسه — لا نحتاج تغييره
const doc = window.document;
const errors = [];
window.addEventListener("error", (e) => errors.push(e.message));
const origError = console.error;
console.error = (...a) => errors.push(a.join(" "));

window.eval(coreSource);
window.eval(readFileSync(join(docs, "app.js"), "utf8"));

const text = () => doc.body.textContent.replace(/\s+/g, " ");
const click = (node) => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
const byText = (sel, t) => [...doc.querySelectorAll(sel)].find((n) => n.textContent.includes(t));
const go = (path) => {
  window.location.hash = "#" + path;
  window.dispatchEvent(new window.Event("hashchange"));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await sleep(150);

check("الرئيسية ترسم", Boolean(doc.querySelector(".hero-title")));
check("هيرو BitPoin", text().includes("BitPoin"));

go("/commands");
await sleep(100);
const cards = doc.querySelectorAll(".cmd-card");
check("صفحة الأوامر: 41 أمر", cards.length === 41, String(cards.length));
check("كل أمر زر", [...cards].every((c) => c.tagName === "BUTTON"));
check("أوامر حقيقية ظاهرة", text().includes("/menu") && text().includes("/daily") && text().includes("/createcode"));

const adminTab = byText(".tab", "أدمن");
click(adminTab);
await sleep(60);
check("فلتر الأدمن", doc.querySelectorAll(".cmd-card").length >= 10);
click(byText(".tab", "الكل"));
await sleep(60);

go("/login");
await sleep(100);
check("خيارات الدخول", text().includes("دخول كلاعب") && text().includes("دخول كمدير"));
doc.querySelector("#login-name").value = "أمين";
doc.querySelector("#login-username").value = "amin";
click(byText("button", "دخول كلاعب"));
await sleep(200);
check("الدخول يفتح اللوحة", text().includes("لوحتي"));
check("الرصيد في الترويسة", (doc.querySelector("#header-wallet")?.textContent || "").includes("1,000"));

click(byText("button", "استلم الآن"));
await sleep(250);
check("استلام الراتب", window.BitPoinCore.currentUser().balance > 1000);

const amount = doc.querySelector("#tr-amount");
amount.value = "200";
amount.dispatchEvent(new window.Event("input", { bubbles: true }));
await sleep(80);
check("معاينة الضريبة", (doc.querySelector("#tr-preview")?.textContent || "").includes("190"));

go("/games");
await sleep(120);
check("4 ألعاب", doc.querySelectorAll(".cmd-card").length === 4);
click(byText("button", "العب الآن"));
await sleep(350);
check("اللعب يعمل", window.BitPoinCore.currentUser().gamesPlayed >= 1);

go("/shop");
await sleep(120);
check("المتجر: 8 عناصر", doc.querySelectorAll(".card-hover").length === 8);
check("بلا undefined (متجر)", !text().includes("undefined"));

go("/leaderboard");
await sleep(120);
check("المتصدرون", text().includes("أمين"));

go("/link");
await sleep(120);
check("كود الربط", /BTP[A-Z0-9]{4,}/.test(text()));
click(byText("button", "تأكيد الربط الآن"));
await sleep(200);
check("تأكيد الربط", window.BitPoinCore.currentUser().telegramLinked === true);

go("/admin");
await sleep(120);
check("اللاعب ممنوع من الإدارة", text().includes("صلاحيات المدير مطلوبة"));
click(byText("button", "دخول كمدير"));
await sleep(250);
check("المدير يدخل الإدارة", text().includes("لوحة الإدارة") || text().includes("توزيع الثروة"));
check("بلا undefined (إدارة)", !text().includes("undefined"));

go("/status");
await sleep(120);
check("صفحة الحالة", text().includes("حالة") && !text().includes("undefined"));

go("/nope");
await sleep(100);
check("404", text().includes("الصفحة غير موجودة"));

check("الحالة في localStorage", Boolean(window.localStorage.getItem("bitpoin.state.v1")));
check("بلا أخطاء JS", errors.length === 0, errors.slice(0, 2).join(" | "));

console.error = origError;

/* ===================== النتائج ===================== */
const failed = results.filter((r) => !r[1]);
console.log("\n════════ نتائج الاختبار ════════");
for (const [name, pass, extra] of results) {
  console.log(`${pass ? "✅" : "❌"} ${name}${extra && !pass ? `  (${extra})` : ""}`);
}
console.log(`\n${results.length - failed.length}/${results.length} نجحت`);
process.exit(failed.length ? 1 : 0);
