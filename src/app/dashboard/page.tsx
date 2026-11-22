"use client";

/**
 * لوحة المستخدم: الرصيد، الراتب اليومي، التحويل، البنك، السجل، الإحالات، القروض، الحقيبة.
 */
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowUpRight,
  Award,
  Banknote,
  CalendarClock,
  Coins,
  Copy,
  Dice5,
  Gift,
  HandCoins,
  Landmark,
  Loader2,
  Lock,
  PiggyBank,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UserRound,
  Wallet,
} from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, LinkButton, Progress, SectionTitle, Skeleton, Stat } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/common/RequireAuth";
import { DailyCard } from "@/components/dashboard/DailyCard";
import { TransferForm, RedeemCard } from "@/components/dashboard/TransferForm";
import { BankPanel } from "@/components/dashboard/BankPanel";
import { HistoryList } from "@/components/dashboard/HistoryList";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/lib/toast";
import { useConfig } from "@/lib/config";
import { api, dateAr, duration, errorMessage, fmt, timeAgo } from "@/lib/api";
import type { LoanInfo, UserDashboard } from "@/lib/types";
import { useSWRConfig } from "swr";

function DashboardContent() {
  const { user, refresh } = useAuth();
  const { connected } = useRealtime();
  const { config, symbol } = useConfig();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { data, isLoading, mutate: refreshDashboard } = useSWR<UserDashboard>("/user/me", { refreshInterval: 45_000 });
  const { data: loans } = useSWR<LoanInfo>("/user/loans");
  const [tab, setTab] = useState<"overview" | "bank" | "referral" | "loans" | "inventory">("overview");
  const [loanAmount, setLoanAmount] = useState("");
  const [loanLoading, setLoanLoading] = useState<"request" | "repay" | null>(null);

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-28" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const dashboardUser = data.user;
  const total = dashboardUser.balance + dashboardUser.bankBalance;
  const winRate = data.games.played > 0 ? Math.round((data.games.won / data.games.played) * 100) : 0;

  const referrals = data.referrals;

  async function copyReferral() {
    try {
      await navigator.clipboard.writeText(referrals.link);
      toast.success("تم نسخ رابط الإحالة");
    } catch {
      toast.info("رابط الإحالة", referrals.link);
    }
  }

  async function requestLoan() {
    const amount = Number.parseInt(loanAmount, 10);
    if (!amount) return;
    setLoanLoading("request");
    try {
      await api.post("/coins/loans", { amount });
      toast.success("تم منحك القرض", `${fmt(amount)} BTP أضيفت لرصيدك`);
      setLoanAmount("");
      await mutate("/coins/loans");
      await refreshDashboard();
      await mutate("/user/transactions");
    } catch (error) {
      toast.error("تعذّر منح القرض", errorMessage(error));
    } finally {
      setLoanLoading(null);
    }
  }

  async function repayLoan() {
    setLoanLoading("repay");
    try {
      const result = await api.post<{ paid: number; remaining: number; closed: boolean }>("/coins/loans/repay", {});
      toast.success("تم السداد", result.closed ? "أُغلق القرض بالكامل ✅" : `المتبقي ${fmt(result.remaining)} BTP`);
      await mutate("/coins/loans");
      await refreshDashboard();
      await refresh();
    } catch (error) {
      toast.error("تعذّر السداد", errorMessage(error));
    } finally {
      setLoanLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      {/* رأس اللوحة */}
      <Card strong className="overflow-hidden">
        <div className="relative p-5 sm:p-6">
          <div className="pointer-events-none absolute -start-16 -top-24 size-64 rounded-full bg-btp-500/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar src={dashboardUser.photoUrl} name={dashboardUser.firstName} size={56} ring />
                <span className="absolute -bottom-1 -end-1 flex size-5 items-center justify-center rounded-full border-2 border-ink-900 bg-btp-500 text-[9px] font-black text-ink-950">
                  ✓
                </span>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-black text-white">{dashboardUser.firstName}</h1>
                  {dashboardUser.activeTitle ? <Badge tone="gold">{dashboardUser.activeTitle}</Badge> : null}
                  {dashboardUser.isAdmin ? <Badge tone="red">مدير</Badge> : null}
                  <Badge tone={connected ? "green" : "neutral"}>
                    <span className={`size-1.5 rounded-full ${connected ? "bg-btp-400" : "bg-slate-500"}`} />
                    {connected ? "لحظي" : "غير متصل"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {dashboardUser.username ? `@${dashboardUser.username} · ` : ""}
                  معرّف {dashboardUser.telegramId} · عضو منذ {dateAr(dashboardUser.createdAt)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await refreshDashboard();
                  await refresh();
                  toast.info("تم تحديث البيانات");
                }}
                icon={<RefreshCw className="size-3.5" />}
              >
                تحديث
              </Button>
              <LinkButton href="/games" variant="primary" size="sm">
                <Dice5 className="size-3.5" /> العب
              </LinkButton>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="الرصيد النقدي" value={dashboardUser.balance} icon={<Wallet className="size-4" />} tone="green" hint={symbol} />
            <Stat label="رصيد البنك" value={dashboardUser.bankBalance} icon={<Landmark className="size-4" />} tone="blue" hint={`+${fmt(data.bank.pendingInterest)} فائدة معلقة`} />
            <Stat label="الإجمالي" value={total} icon={<Coins className="size-4" />} tone="gold" />
            <Stat label="السلسلة" value={`${dashboardUser.streak} يوم`} icon={<CalendarClock className="size-4" />} tone="default" hint={`مكافأة ${config.streak_bonus_per_day} BTP/يوم`} />
          </div>
        </div>
      </Card>

      {/* التبويبات */}
      <div className="no-scrollbar mt-6 flex gap-1 overflow-x-auto rounded-xl border border-white/5 bg-white/[0.02] p-1">
        {[
          { key: "overview", label: "نظرة عامة", icon: Wallet },
          { key: "bank", label: "البنك", icon: Landmark },
          { key: "loans", label: "القروض", icon: HandCoins },
          { key: "referral", label: "الإحالات", icon: Share2 },
          { key: "inventory", label: "حقيبتي", icon: ShoppingBag },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key as typeof tab)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              tab === item.key ? "bg-btp-500/15 text-btp-300" : "text-slate-400 hover:text-white"
            }`}
          >
            <item.icon className="size-3.5" /> {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <DailyCard daily={data.daily} streak={dashboardUser.streak} />
            <div className="grid gap-4 sm:grid-cols-2">
              <TransferForm balance={dashboardUser.balance} />
              <div className="space-y-4">
                <RedeemCard />
                <Card className="p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-extrabold text-white">إحصائيات الألعاب</p>
                    <Badge tone="blue">{data.games.played} جولة</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="rounded-xl bg-white/[0.03] py-2">
                      <p className="text-[10px] font-bold text-slate-500">نسبة الفوز</p>
                      <p className="tabular text-lg font-black text-btp-300">{winRate}%</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] py-2">
                      <p className="text-[10px] font-bold text-slate-500">أكبر فوز</p>
                      <p className="tabular text-lg font-black text-gold-300">{fmt(data.games.biggestWin)}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] py-2">
                      <p className="text-[10px] font-bold text-slate-500">إجمالي المراهنات</p>
                      <p className="tabular text-sm font-extrabold text-white">{fmt(data.games.wagered)}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.03] py-2">
                      <p className="text-[10px] font-bold text-slate-500">إجمالي المكاسب</p>
                      <p className="tabular text-sm font-extrabold text-white">{fmt(data.games.winnings)}</p>
                    </div>
                  </div>
                  <LinkButton href="/games" variant="outline" size="sm" className="mt-3 w-full">
                    <Dice5 className="size-3.5" /> اذهب للألعاب
                  </LinkButton>
                </Card>
              </div>
            </div>
            <HistoryList userId={dashboardUser.id} limit={15} />
          </div>

          <div className="space-y-4">
            <BankPanel bank={data.bank} cash={dashboardUser.balance} bankBalance={dashboardUser.bankBalance} />
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-300">
                    <Share2 className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-extrabold text-white">رابط الإحالة</p>
                    <p className="text-[11px] text-slate-500">+{config.referral_reward_inviter} لك · +{config.referral_reward_invitee} لصديقك</p>
                  </div>
                </div>
                <Badge tone="gold">{data.referrals.paidCount} مكتمل</Badge>
              </div>
              <div className="rounded-xl border border-white/5 bg-ink-950/60 p-3">
                <p dir="ltr" className="truncate text-center text-[11px] font-bold text-btp-300">{data.referrals.link}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button size="sm" variant="ghost" onClick={copyReferral} icon={<Copy className="size-3.5" />}>
                  نسخ
                </Button>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(data.referrals.link)}&text=${encodeURIComponent("انضم إلى BitPoin واحصل على مكافأة ترحيب!")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-btp-400 to-btp-600 px-3.5 text-xs font-bold text-ink-950"
                >
                  <Share2 className="size-3.5" /> مشاركة
                </a>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="rounded-lg bg-white/[0.03] py-1.5">
                  <p className="text-slate-500">مدعوون</p>
                  <p className="tabular text-sm font-extrabold text-white">{data.referrals.invitedCount}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] py-1.5">
                  <p className="text-slate-500">معلق</p>
                  <p className="tabular text-sm font-extrabold text-gold-300">{data.referrals.pendingCount}</p>
                </div>
                <div className="rounded-lg bg-white/[0.03] py-1.5">
                  <p className="text-slate-500">أرباح</p>
                  <p className="tabular text-sm font-extrabold text-btp-300">{fmt(data.referrals.earnings)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <p className="mb-2 text-sm font-extrabold text-white">إجراءات سريعة</p>
              <div className="grid gap-2">
                <LinkButton href="/shop" variant="subtle" size="sm">
                  <ShoppingBag className="size-3.5" /> المتجر والألقاب
                </LinkButton>
                <LinkButton href="/leaderboard" variant="subtle" size="sm">
                  <Award className="size-3.5" /> لوحة المتصدرين
                </LinkButton>
                <LinkButton href="/games" variant="subtle" size="sm">
                  <Dice5 className="size-3.5" /> الألعاب والمراهنات
                </LinkButton>
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "bank" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BankPanel bank={data.bank} cash={dashboardUser.balance} bankBalance={dashboardUser.bankBalance} />
            <Card className="mt-4 p-5">
              <SectionTitle title="سجل الفوائد" icon={<PiggyBank className="size-5" />} subtitle="آخر الفوائد المضافة تلقائياً" />
              {data.bank.history && data.bank.history.length > 0 ? (
                <ul className="divide-y divide-white/[0.04]">
                  {data.bank.history.map((item, index) => (
                    <li key={index} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-slate-400">{dateAr(item.createdAt)}</span>
                      <span className="tabular font-bold text-btp-300">+{fmt(item.amount)} BTP</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<PiggyBank className="size-6" />} title="لا فوائد بعد" description="أودع مبلغاً وسيبدأ احتساب الفائدة خلال 24 ساعة." />
              )}
            </Card>
          </div>
          <Card className="p-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-extrabold text-white">
              <ShieldCheck className="size-4 text-btp-300" /> لماذا البنك؟
            </p>
            <ul className="space-y-3 text-xs text-slate-400">
              <li className="rounded-xl bg-white/[0.03] p-3">
                <b className="text-white">حماية من السرقة</b> — أموال البنك لا يمكن سرقتها بأمر /rob.
              </li>
              <li className="rounded-xl bg-white/[0.03] p-3">
                <b className="text-white">فائدة {config.bank_interest_pct}% يومياً</b> — تُضاف تلقائياً كل 24 ساعة.
              </li>
              <li className="rounded-xl bg-white/[0.03] p-3">
                <b className="text-white">سعة قصوى</b> — {fmt(data.bank.capacity)} BTP لكل حساب.
              </li>
              <li className="rounded-xl bg-white/[0.03] p-3">
                <b className="text-white">سحب فوري</b> — أموالك متاحة في أي وقت دون رسوم.
              </li>
            </ul>
          </Card>
        </div>
      ) : null}

      {tab === "loans" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <SectionTitle title="القروض" icon={<HandCoins className="size-5" />} subtitle={`حتى ${fmt(loans?.maxAmount ?? 0)} BTP بفائدة ${loans?.interestPercent ?? 0}%`} />
            {loans?.active ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-gold-400/20 bg-gold-500/[0.05] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-gold-200">قرض نشط</p>
                    {loans.active.isOverdue ? <Badge tone="red">متأخر</Badge> : <Badge tone="gold">قيد السداد</Badge>}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] text-slate-500">أصل</p>
                      <p className="tabular text-sm font-bold text-white">{fmt(loans.active.principal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">مسدد</p>
                      <p className="tabular text-sm font-bold text-btp-300">{fmt(loans.active.paid)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">متبقي</p>
                      <p className="tabular text-sm font-bold text-red-300">{fmt(loans.active.remaining)}</p>
                    </div>
                  </div>
                  <Progress value={(loans.active.paid / Math.max(1, loans.active.totalDue)) * 100} className="mt-3" />
                  <p className="mt-2 text-[10px] text-slate-400">
                    الاستحقاق {dateAr(loans.active.dueAt)} · {loans.active.isOverdue ? "متأخر!" : `متبقي ${duration(loans.active.hoursLeft * 3600)}`}
                  </p>
                </div>
                <Button onClick={repayLoan} loading={loanLoading === "repay"} className="w-full" variant="gold" icon={<HandCoins className="size-4" />}>
                  سداد كامل المبلغ ({fmt(loans.active.remaining)} BTP)
                </Button>
              </div>
            ) : loans?.eligible ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-white/[0.03] p-4 text-xs text-slate-400">
                  يمكنك طلب قرض حتى <b className="text-white">{fmt(loans.maxAmount)} BTP</b>، يُستحق خلال{" "}
                  <b className="text-white">{loans.durationHours} ساعة</b> بفائدة <b className="text-gold-300">{loans.interestPercent}%</b>.
                  <br />
                  عند التأخير تُطبّق عقوبة يومية.
                </div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={loans.maxAmount}
                  value={loanAmount}
                  onChange={(event) => setLoanAmount(event.target.value.replace(/[^\d]/g, ""))}
                  placeholder={`المبلغ (حتى ${fmt(loans.maxAmount)})`}
                  className="h-11 w-full rounded-xl border border-white/10 bg-ink-900/70 px-3.5 text-left text-sm text-white focus:border-btp-400/60 focus:outline-none"
                  dir="ltr"
                />
                <Button
                  onClick={requestLoan}
                  loading={loanLoading === "request"}
                  className="w-full"
                  disabled={!Number.parseInt(loanAmount, 10) || Number.parseInt(loanAmount, 10) > loans.maxAmount}
                  icon={<Sparkles className="size-4" />}
                >
                  طلب القرض
                </Button>
              </div>
            ) : (
              <EmptyState icon={<Lock className="size-6" />} title="القروض غير متاحة" description={loans?.reason ?? "لديك قرض نشط أو حسابك حديث."} />
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle title="سجل القروض" icon={<Banknote className="size-5" />} />
            {loans?.history && loans.history.length > 0 ? (
              <ul className="divide-y divide-white/[0.04]">
                {loans.history.map((loan) => (
                  <li key={loan.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-bold text-white">{fmt(loan.principal)} BTP</p>
                      <p className="text-[11px] text-slate-500">{dateAr(loan.createdAt)} · مستحق {fmt(loan.totalDue)}</p>
                    </div>
                    <Badge tone={loan.status === "paid" ? "green" : loan.status === "overdue" ? "red" : "gold"}>
                      {loan.status === "paid" ? "مسدد" : loan.status === "overdue" ? "متأخر" : "نشط"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<HandCoins className="size-6" />} title="لا قروض بعد" description="بعد مرور 24 ساعة على حسابك يمكنك طلب أول قرض." />
            )}
          </Card>
        </div>
      ) : null}

      {tab === "referral" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="p-5 lg:col-span-2">
            <SectionTitle title="نظام الإحالة" icon={<Share2 className="size-5" />} subtitle="اربح مع كل صديق ينضم ويُفعّل حسابه" />
            <div className="rounded-2xl border border-btp-400/20 bg-btp-500/[0.05] p-4 text-center">
              <p className="text-[11px] font-bold text-slate-400">رابط الإحالة الخاص بك</p>
              <p dir="ltr" className="mt-1 truncate text-sm font-extrabold text-btp-300">{data.referrals.link}</p>
              <div className="mt-3 flex justify-center gap-2">
                <Button size="sm" variant="ghost" onClick={copyReferral} icon={<Copy className="size-3.5" />}>
                  نسخ
                </Button>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(data.referrals.link)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-b from-btp-400 to-btp-600 px-4 text-xs font-bold text-ink-950"
                >
                  <Share2 className="size-3.5" /> مشاركة
                </a>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="مدعوون" value={data.referrals.invitedCount} tone="default" />
              <Stat label="مكتمل" value={data.referrals.paidCount} tone="green" />
              <Stat label="معلق" value={data.referrals.pendingCount} tone="gold" />
              <Stat label="أرباحك" value={data.referrals.earnings} tone="blue" />
            </div>
            <div className="mt-5">
              <p className="mb-2 text-sm font-extrabold text-white">المدعوون</p>
              {data.referrals.invited.length > 0 ? (
                <ul className="divide-y divide-white/[0.04]">
                  {data.referrals.invited.map((invitee) => (
                    <li key={invitee.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="flex items-center gap-2 text-slate-300">
                        <UserRound className="size-3.5 text-slate-500" /> {invitee.name}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">{timeAgo(invitee.createdAt)}</span>
                        <Badge tone={invitee.status === "paid" ? "green" : "gold"}>
                          {invitee.status === "paid" ? `+${fmt(invitee.reward)}` : "بانتظار التفعيل"}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Share2 className="size-6" />} title="لم تدعُ أحداً بعد" description="شارك رابطك وستحصل على مكافأة عند تفعيل حساب صديقك." />
              )}
            </div>
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-sm font-extrabold text-white">كيف يعمل؟</p>
            <ol className="space-y-3 text-xs text-slate-400">
              <li className="rounded-xl bg-white/[0.03] p-3"><b className="text-white">1.</b> شارك رابطك مع الأصدقاء.</li>
              <li className="rounded-xl bg-white/[0.03] p-3"><b className="text-white">2.</b> يبدأ صديقك البوت عبر رابطك ويحصل مباشرة على <b className="text-btp-300">{config.referral_reward_invitee} BTP</b>.</li>
              <li className="rounded-xl bg-white/[0.03] p-3"><b className="text-white">3.</b> عند أول نشاط له (راتب/لعبة) تحصل أنت على <b className="text-gold-300">{config.referral_reward_inviter} BTP</b>.</li>
              <li className="rounded-xl border border-red-400/20 bg-red-500/[0.04] p-3 text-red-200/80">
                الحسابات المتعددة لنفس الشخص تُحظر تلقائياً.
              </li>
            </ol>
          </Card>
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <SectionTitle title="حقيبتي" icon={<ShoppingBag className="size-5" />} subtitle="العناصر التي اشتريتها من المتجر" />
            {Object.keys(data.inventory.inventory).length > 0 || Object.keys(data.inventory.boosts).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(data.inventory.inventory).map(([code, item]) => (
                  <div key={code} className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3">
                    <div>
                      <p className="text-sm font-bold text-white">{code}</p>
                      <p className="text-[11px] text-slate-500">الكمية: {item.qty}</p>
                    </div>
                    <Badge tone="green">مملوك</Badge>
                  </div>
                ))}
                {Object.entries(data.inventory.boosts).map(([code, boost]) => (
                  <div key={code} className="flex items-center justify-between rounded-xl border border-gold-400/20 bg-gold-500/[0.05] p-3">
                    <div>
                      <p className="text-sm font-bold text-white">{code}</p>
                      <p className="text-[11px] text-gold-300/70">مضاعف ×{boost.multiplier}</p>
                    </div>
                    <Badge tone="gold">{boost.uses} استخدام</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Gift className="size-6" />}
                title="حقيبتك فارغة"
                description="اشترِ ألقاباً ودروع حماية ومضاعفات راتب من المتجر."
                action={<LinkButton href="/shop" size="sm">زيارة المتجر <ArrowUpRight className="size-3.5" /></LinkButton>}
              />
            )}
          </Card>
          <Card className="p-5">
            <SectionTitle title="التقدّم" icon={<Award className="size-5" />} />
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400">السلسلة اليومية</span>
                  <span className="text-btp-300">{dashboardUser.streak} / 7</span>
                </div>
                <Progress value={Math.min(100, (dashboardUser.streak / 7) * 100)} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400">جولات الألعاب</span>
                  <span className="text-gold-300">{dashboardUser.gamesPlayed}</span>
                </div>
                <Progress value={Math.min(100, dashboardUser.gamesPlayed)} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400">الإحالات المكتملة</span>
                  <span className="text-sky-300">{data.referrals.paidCount}</span>
                </div>
                <Progress value={Math.min(100, data.referrals.paidCount * 20)} />
              </div>
              <div className="rounded-xl bg-white/[0.03] p-3 text-[11px] text-slate-400">
                💡 نصيحة: استلم راتبك يومياً دون انقطاع لرفع مكافأة السلسلة إلى الحد الأقصى ({config.streak_bonus_max_days} أيام).
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
