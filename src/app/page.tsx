"use client";

/**
 * الصفحة الرئيسية — واجهة تسويقية حيّة تعرض إحصائيات المنصة الحقيقية.
 */
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  Bot,
  Coins,
  Dice5,
  Gift,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { CoinMark } from "@/components/ui/Logo";
import { Badge, Button, Card, FeaturePill, LinkButton, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { useConfig } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { fmt, fmtCompact } from "@/lib/api";
import type { LeaderboardResult, PlatformStats } from "@/lib/types";

const FEATURES = [
  {
    icon: Gift,
    title: "راتب يومي مضمون",
    text: "مكافأة عشوائية كل 24 ساعة، مع مكافأة إضافية لكل يوم استمرارية حتى ×7.",
    href: "/dashboard",
    tone: "text-btp-300",
  },
  {
    icon: Dice5,
    title: "4 ألعاب ومراهنات",
    text: "نرد، عملة، ماكينة حظ وروليت — حدود رهان مرنة وشفافية كاملة في النتائج.",
    href: "/games",
    tone: "text-gold-300",
  },
  {
    icon: Banknote,
    title: "بنك بفائدة يومية",
    text: "أودع رصيدك واحمِه من السرقة، واربح فائدة تلقائية كل 24 ساعة.",
    href: "/dashboard",
    tone: "text-sky-300",
  },
  {
    icon: ShoppingBag,
    title: "متجر ألقاب وشارات",
    text: "لقب مميز بجانب اسمك في القروبات، دروع حماية، ومضاعفات راتب.",
    href: "/shop",
    tone: "text-purple-300",
  },
  {
    icon: Users,
    title: "إحالات بمكافآت",
    text: "اربح 300 BTP عن كل صديق، ويحصل هو على 150 BTP فوراً.",
    href: "/referral",
    tone: "text-emerald-300",
  },
  {
    icon: Bot,
    title: "حساب موحّد",
    text: "نفس الرصيد في الموقع وبوت تلجرام — أي عملية تظهر فوراً في الاثنين.",
    href: "/login",
    tone: "text-cyan-300",
  },
];

export default function HomePage() {
  const { config, symbol } = useConfig();
  const { user } = useAuth();
  const { connected, online } = useRealtime();
  const { data: stats } = useSWR<PlatformStats>("/stats", { refreshInterval: 30_000 });
  // نعرض الإحصاءات في الـ Hero، ويُستخدم stats أيضاً لعداد العمليات

  const { data: leaderboard } = useSWR<LeaderboardResult>("/leaderboard?scope=global&limit=5", {
    refreshInterval: 45_000,
  });

  return (
    <div className="relative overflow-hidden">
      {/* خلفية */}
      <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden="true" />

      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-4 pt-14 pb-20 sm:px-6 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="animate-rise">
            <div className="flex flex-wrap items-center gap-2">
              <FeaturePill>
                <Sparkles className="size-3.5" /> عملة مجتمعية جديدة
              </FeaturePill>
              <FeaturePill>
                <span className={`size-1.5 rounded-full ${connected ? "bg-btp-400" : "bg-slate-500"}`} />
                {online > 0 ? `${online} متصل الآن` : "بث لحظي"}
              </FeaturePill>
            </div>

            <h1 className="mt-5 text-4xl font-black leading-[1.15] text-white sm:text-5xl lg:text-6xl">
              اربح <span className="gradient-text">BitPoin</span> كل يوم
              <br />
              والعب ونافس الأصدقاء
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
              منصة <b className="text-slate-200">BTP</b> تجمع الراتب اليومي، الألعاب، البنك، المتجر والإحالات في تجربة
              واحدة — عبر الموقع أو بوت تلجرام، بنفس الحساب وبنفس الرصيد لحظة بلحظة.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {user ? (
                <LinkButton href="/dashboard" size="lg" variant="primary">
                  <Zap className="size-4" /> ادخل لوحتك — {fmt(user.balance)} {symbol}
                </LinkButton>
              ) : (
                <LinkButton href="/login" size="lg" variant="primary">
                  <Bot className="size-4" /> ابدأ الآن بتلجرام
                </LinkButton>
              )}
              <LinkButton href="/games" size="lg" variant="ghost">
                <Dice5 className="size-4" /> جرّب الألعاب
                <ArrowLeft className="size-4" />
              </LinkButton>
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "اللاعبون", value: stats ? fmtCompact(stats.users) : "—" },
                { label: "حجم التداول", value: stats ? `${fmtCompact(stats.totalVolume)}` : "—" },
                { label: "الخزينة", value: stats ? `${fmtCompact(stats.treasury)}` : "—" },
                { label: "عمليات", value: stats ? fmtCompact(stats.totalTransactions) : "—" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{item.label}</dt>
                  <dd className="tabular mt-0.5 text-lg font-extrabold text-white">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* العملة */}
          <div className="relative flex items-center justify-center">
            <div className="absolute size-72 rounded-full bg-btp-500/20 blur-3xl sm:size-96" aria-hidden="true" />
            <div className="absolute size-56 rounded-full border border-btp-400/20 animate-pulse-ring sm:size-72" aria-hidden="true" />
            <div className="absolute size-72 rounded-full border border-gold-400/10 sm:size-[26rem]" aria-hidden="true" />

            <div className="relative animate-float">
              <Card strong className="w-[19rem] rounded-3xl p-6 shadow-2xl sm:w-[22rem]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CoinMark size={40} />
                    <div>
                      <p className="text-sm font-extrabold text-white">BitPoin</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">BTP</p>
                    </div>
                  </div>
                  <Badge tone="green">
                    <span className="size-1.5 rounded-full bg-btp-400" /> LIVE
                  </Badge>
                </div>

                <div className="mt-6 rounded-2xl border border-white/10 bg-ink-950/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">رصيدك</p>
                  <p className="tabular mt-1 text-3xl font-black text-white">
                    {user ? fmt(user.balance) : "1,000"} <span className="text-sm font-bold text-gold-300">BTP</span>
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-[11px] font-bold">
                    <span className="rounded-full bg-btp-500/15 px-2 py-0.5 text-btp-300">+{config.daily_min}–{config.daily_max} / يوم</span>
                    <span className="rounded-full bg-gold-500/15 px-2 py-0.5 text-gold-300">فائدة {config.bank_interest_pct}%</span>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "ضريبة تحويل", value: `${config.transfer_tax_pct}%` },
                    { label: "ضريبة ألعاب", value: `${config.game_tax_pct}%` },
                    { label: "سلسلة أيام", value: `×${config.streak_bonus_max_days}` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] py-2">
                      <p className="text-[9px] font-bold text-slate-500">{item.label}</p>
                      <p className="tabular text-sm font-extrabold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* المزايا */}
      <section className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <SectionTitle
          title="كل ما تحتاجه في مكان واحد"
          subtitle="نظام اقتصادي مكتمل مبني على معاملات ذرّية وأرقام صحيحة فقط"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Link key={feature.title} href={feature.href}>
              <Card className="card-hover h-full p-5">
                <div className={`mb-3 flex size-11 items-center justify-center rounded-xl bg-white/5 ${feature.tone}`}>
                  <feature.icon className="size-5" />
                </div>
                <h3 className="text-base font-extrabold text-white">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{feature.text}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* كيف تبدأ */}
      <section className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card strong className="p-6 lg:col-span-2">
            <SectionTitle title="ابدأ في 3 خطوات" subtitle="أقل من دقيقة وتبدأ بالكسب" />
            <ol className="space-y-4">
              {[
                { title: "سجّل دخولك عبر تلجرام", text: "زر واحد — نتحقق من توقيع تلجرام المشفّر، ويُنشأ حسابك مع 1000 BTP ترحيبية." },
                { title: "استلم راتبك اليومي", text: "من الموقع أو بأمر /daily في البوت. كل يوم استمرارية يزيد مكافأتك." },
                { title: "العب، ودّع، واستثمر", text: "ألعاب بحدود آمنة، بنك بفائدة، إحالات، ومتجر ألقاب للتميّز." },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-btp-500/15 text-sm font-black text-btp-300">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-bold text-white">{step.title}</p>
                    <p className="mt-0.5 text-sm text-slate-400">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-wrap gap-2">
              {user ? (
                <LinkButton href="/dashboard" variant="primary" size="sm">
                  إلى لوحتك
                </LinkButton>
              ) : (
                <LinkButton href="/login" variant="primary" size="sm">
                  تسجيل الدخول
                </LinkButton>
              )}
              <LinkButton href="/leaderboard" variant="outline" size="sm">
                <Trophy className="size-3.5" /> المتصدرون
              </LinkButton>
            </div>
          </Card>

          <Card className="p-6">
            <SectionTitle title="المتصدرون" subtitle="أغنى 5 لاعبين الآن" icon={<Trophy className="size-5" />} />
            {!leaderboard ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-11" />
                ))}
              </div>
            ) : (
              <ul className="space-y-1.5">
                {leaderboard.entries.map((entry, index) => (
                  <li
                    key={entry.userId}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                      entry.isMe ? "bg-btp-500/10 ring-1 ring-btp-400/30" : "bg-white/[0.03]"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="w-5 text-center text-sm font-black text-slate-500">
                        {["🥇", "🥈", "🥉"][index] ?? index + 1}
                      </span>
                      <span className="max-w-[9rem] truncate text-sm font-bold text-white">
                        {entry.activeTitle ? `${entry.activeTitle} ` : ""}
                        {entry.username ? `@${entry.username}` : entry.name}
                      </span>
                    </span>
                    <span className="tabular text-xs font-extrabold text-gold-300">{fmt(entry.balance)}</span>
                  </li>
                ))}
                {leaderboard.entries.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">كن أول المتصدرين!</p>
                ) : null}
              </ul>
            )}
          </Card>
        </div>
      </section>

      {/* الأمان */}
      <section className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <Card className="overflow-hidden p-6 sm:p-8">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: ShieldCheck, title: "معاملات آمنة", text: "كل عملية مالية داخل Transaction ذرّية مع قفل صفوف، وأرقام صحيحة فقط — لا كسور ولا تعويم." },
              { icon: Coins, title: "اقتصاد شفاف", text: "ضرائب معلنة، خزينة نظام ظاهرة، وسجل كامل لكل معاملة مع ضريبتها." },
              { icon: Zap, title: "مزامنة لحظية", text: "WebSocket يبث تغيّر الرصيد فوراً، وكل عملية من الموقع تصل إشعاراً في البوت." },
            ].map((item) => (
              <div key={item.title} className="flex gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-btp-500/10 text-btp-300">
                  <item.icon className="size-5" />
                </div>
                <div>
                  <p className="font-extrabold text-white">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-btp-400/20 bg-gradient-to-l from-btp-500/15 via-ink-850 to-gold-500/10 p-8 text-center sm:p-12">
          <div className="absolute -end-16 -top-16 size-64 rounded-full bg-btp-500/20 blur-3xl" aria-hidden="true" />
          <h2 className="relative text-2xl font-black text-white sm:text-3xl">جاهز تبدأ رحلتك في BitPoin؟</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">
            حساب واحد، رصيد واحد، وموقعان: الويب وبوت تلجرام. سجّل الآن واستلم رصيد الترحيب ومكافأة صديقك.
          </p>
          <div className="relative mt-6 flex flex-wrap justify-center gap-3">
            <LinkButton href={user ? "/dashboard" : "/login"} size="lg" variant="gold">
              <Sparkles className="size-4" /> {user ? "ادخل لوحتك" : "ابدأ الآن"}
            </LinkButton>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => window.open("https://t.me/Bitpoin_bot", "_blank", "noopener")}
              icon={<Bot className="size-4" />}
            >
              افتح البوت
            </Button>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] font-bold text-slate-500">
            <span>رواتب: {config.daily_min}–{config.daily_max} BTP</span>
            <span>·</span>
            <span>ضريبة تحويل {config.transfer_tax_pct}%</span>
            <span>·</span>
            <span>فائدة بنك {config.bank_interest_pct}% يومياً</span>
          </div>
        </div>
      </section>

    </div>
  );
}
