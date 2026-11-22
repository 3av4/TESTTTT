"use client";

/**
 * صفحة الألعاب: نرد، عملة، ماكينة، روليت — نفس محرك الخدمة المستخدم في البوت.
 */
import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  CircleDot,
  Coins,
  Dices,
  Flame,
  Gamepad2,
  Sparkles,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { Badge, Button, Card, Field, SectionTitle, Skeleton, Stat } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/common/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import { useToast } from "@/lib/toast";
import { api, errorMessage, fmt } from "@/lib/api";
import type { GameKind, GameLimits, PlayResult, UserDashboard } from "@/lib/types";

type GameTab = "dice" | "coinflip" | "slots" | "roulette";

const GAMES: Array<{
  key: GameTab;
  name: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  ring: string;
}> = [
  { key: "dice", name: "النرد", tagline: "عالٍ أو منخفض — الفوز ×2", icon: Dices, color: "from-gold-500/20", ring: "text-gold-300" },
  { key: "coinflip", name: "العملة", tagline: "صورة أو كتابة — الفوز ×2", icon: Coins, color: "from-btp-500/20", ring: "text-btp-300" },
  { key: "slots", name: "الماكينة", tagline: "ثلاثة رموز — حتى ×10", icon: Sparkles, color: "from-purple-500/20", ring: "text-purple-300" },
  { key: "roulette", name: "الروليت", tagline: "أحمر/أسود ×2 · أخضر ×14", icon: CircleDot, color: "from-red-500/20", ring: "text-red-300" },
];

const CHOICES: Record<GameTab, Array<{ value: string; label: string; hint?: string }>> = {
  dice: [
    { value: "high", label: "عالٍ (4-6)", hint: "×2" },
    { value: "low", label: "منخفض (1-3)", hint: "×2" },
  ],
  coinflip: [
    { value: "heads", label: "👑 صورة", hint: "×2" },
    { value: "tails", label: "🦅 كتابة", hint: "×2" },
  ],
  slots: [],
  roulette: [
    { value: "red", label: "🔴 أحمر", hint: "×2" },
    { value: "black", label: "⚫ أسود", hint: "×2" },
    { value: "green", label: "🟢 أخضر (0)", hint: "×14" },
  ],
};

function Reel({ symbol, spinning }: { symbol: string; spinning: boolean }) {
  const symbols = useMemo(() => ["🍒", "🍋", "🔔", "💎", "7️⃣", "⭐"], []);
  const [face, setFace] = useState(symbol);
  useEffect(() => {
    if (!spinning) {
      setFace(symbol);
      return;
    }
    const timer = setInterval(() => {
      setFace(symbols[Math.floor(Math.random() * symbols.length)]!);
    }, 90);
    return () => clearInterval(timer);
  }, [spinning, symbol, symbols]);
  return (
    <div className="flex size-20 items-center justify-center rounded-2xl border border-white/10 bg-ink-950/80 text-4xl shadow-inner sm:size-24">
      {face}
    </div>
  );
}

function GamesContent() {
  const { user } = useAuth();
  const { config, symbol } = useConfig();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [game, setGame] = useState<GameTab>("dice");
  const [bet, setBet] = useState("100");
  const [choice, setChoice] = useState<string>("high");
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [results, setResults] = useState<PlayResult[]>([]);
  const [lastResult, setLastResult] = useState<PlayResult | null>(null);
  const [reels, setReels] = useState<string[]>(["🍒", "🍋", "🔔"]);

  const { data: limits } = useSWR<Record<GameKind, GameLimits>>("/games");
  const { data: dashboard } = useSWR<UserDashboard>("/user/me");
  const { data: top } = useSWR<Array<{ userId: number; username: string | null; name: string; netProfit: number }>>("/games/top");

  const currentLimits = limits?.[game] ?? { min: Number(config.bet_min), max: Number(config.bet_max), taxPercent: Number(config.game_tax_pct) };
  const balance = dashboard?.user.balance ?? user?.balance ?? 0;
  const numericBet = Number.parseInt(bet, 10) || 0;
  const validBet = numericBet >= currentLimits.min && numericBet <= currentLimits.max && numericBet <= balance;
  const currentGame = GAMES.find((item) => item.key === game)!;

  useEffect(() => {
    setChoice(CHOICES[game][0]?.value ?? "");
  }, [game]);

  async function play() {
    if (!validBet) return;
    setLoading(true);
    setSpinning(game === "slots");
    try {
      const result = await api.post<PlayResult>("/games/play", {
        game,
        bet: numericBet,
        choice: game === "slots" ? undefined : choice,
      });
      // تأخير بصري للماكينة
      if (game === "slots" && Array.isArray(result.details.reels)) {
        await new Promise((resolve) => setTimeout(resolve, 850));
        setReels(result.details.reels as string[]);
      }
      setLastResult(result);
      setResults((current) => [result, ...current].slice(0, 8));
      if (result.won) {
        toast.success(`🎉 فوز +${fmt(result.payout)} BTP`, `النتيجة: ${result.result}`);
      } else {
        toast.info(`😢 خسارة ${fmt(result.bet)} BTP`, `النتيجة: ${result.result}`);
      }
      await mutate("/user/me");
      await mutate("/auth/me");
      await mutate("/games/stats");
      await mutate("/user/transactions");
      await mutate("/leaderboard?scope=games");
    } catch (error) {
      toast.error("تعذّرت الجولة", errorMessage(error));
    } finally {
      setLoading(false);
      setSpinning(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white">
            <Gamepad2 className="size-6 text-btp-300" /> الألعاب والمراهنات
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            نفس المحرك في الموقع والبوت · ضريبة أرباح {currentLimits.taxPercent}% · نتائج عشوائية آمنة
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="gold">
            <TrendingUp className="size-3" /> رصيدك {fmt(balance)} {symbol}
          </Badge>
          <Badge tone="neutral">حدود {fmt(currentLimits.min)}–{fmt(currentLimits.max)}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* منطقة اللعب */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GAMES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setGame(item.key)}
                className={`group relative overflow-hidden rounded-2xl border p-3 text-start transition ${
                  game === item.key
                    ? "border-btp-400/40 bg-btp-500/[0.08]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-bl ${item.color} to-transparent opacity-60`} />
                <div className="relative">
                  <item.icon className={`size-5 ${item.ring}`} />
                  <p className="mt-2 text-sm font-extrabold text-white">{item.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">{item.tagline}</p>
                </div>
              </button>
            ))}
          </div>

          <Card strong className="relative overflow-hidden p-5 sm:p-7">
            <div className="pointer-events-none absolute -end-20 -top-24 size-64 rounded-full bg-btp-500/10 blur-3xl" aria-hidden="true" />

            <div className="relative flex flex-col items-center">
              {game === "slots" ? (
                <div className="flex gap-3">
                  {[0, 1, 2].map((index) => (
                    <Reel key={index} symbol={lastResult?.details.reels?.[index] ?? reels[index] ?? "🍒"} spinning={spinning} />
                  ))}
                </div>
              ) : game === "dice" ? (
                <div
                  className={`flex size-28 items-center justify-center rounded-3xl border border-white/10 bg-gradient-to-bl from-gold-500/20 to-transparent text-6xl transition-transform ${
                    loading ? "animate-bounce" : ""
                  }`}
                >
                  {loading ? "🎲" : "🎲"}
                </div>
              ) : game === "coinflip" ? (
                <div
                  className={`flex size-28 items-center justify-center rounded-full border border-white/10 bg-gradient-to-bl from-btp-500/20 to-transparent text-6xl ${
                    loading ? "animate-spin" : ""
                  }`}
                >
                  {lastResult?.game === "coinflip" ? ((lastResult.details.face as string) === "heads" ? "👑" : "🦅") : "🪙"}
                </div>
              ) : (
                <div
                  className={`flex size-28 items-center justify-center rounded-full border-4 text-5xl transition-all ${
                    loading ? "animate-spin" : ""
                  } ${
                    lastResult?.game === "roulette"
                      ? lastResult.details.color === "red"
                        ? "border-red-500/60 bg-red-500/10"
                        : lastResult.details.color === "green"
                          ? "border-btp-400/60 bg-btp-500/10"
                          : "border-slate-500/60 bg-slate-500/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  {lastResult?.game === "roulette" ? (lastResult.details.number as number) : "🎡"}
                </div>
              )}

              <div className="mt-4 text-center">
                {lastResult ? (
                  <>
                    <p className={`text-lg font-black ${lastResult.won ? "text-btp-300" : "text-red-300"}`}>
                      {lastResult.won ? `🎉 +${fmt(lastResult.payout)} BTP` : `😢 -${fmt(lastResult.bet)} BTP`}
                    </p>
                    <p className="mt-1 text-sm font-bold text-white">{lastResult.result}</p>
                    {lastResult.tax > 0 ? <p className="text-[11px] text-slate-500">ضريبة {fmt(lastResult.tax)} BTP</p> : null}
                  </>
                ) : (
                  <p className="text-sm font-bold text-slate-400">اختر رهانك واضغط العب</p>
                )}
              </div>
            </div>

            <div className="relative mt-6 space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="bet" className="text-xs font-bold text-slate-300">الرهان</label>
                  <span className="text-[10px] text-slate-500">
                    {fmt(currentLimits.min)} — {fmt(currentLimits.max)} BTP
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Field
                    id="bet"
                    type="number"
                    inputMode="numeric"
                    value={bet}
                    onChange={(event) => setBet(event.target.value.replace(/[^\d]/g, ""))}
                    suffix="BTP"
                    error={numericBet > balance ? "رصيدك لا يكفي" : numericBet > 0 && numericBet < currentLimits.min ? `أدنى رهان ${fmt(currentLimits.min)}` : null}
                  />
                  <div className="flex shrink-0 gap-1">
                    {[0.5, 1, 2].map((factor) => (
                      <button
                        key={factor}
                        type="button"
                        onClick={() => setBet(String(Math.min(currentLimits.max, Math.floor(balance * factor))))}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-white/10"
                      >
                        {factor === 0.5 ? "½" : factor === 1 ? "كل" : "×2"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {CHOICES[game].length > 0 ? (
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${CHOICES[game].length}, minmax(0, 1fr))` }}>
                  {CHOICES[game].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setChoice(option.value)}
                      className={`rounded-xl border py-2.5 text-xs font-bold transition ${
                        choice === option.value
                          ? "border-btp-400/50 bg-btp-500/10 text-btp-300"
                          : "border-white/10 bg-white/[0.02] text-slate-300 hover:border-white/20"
                      }`}
                    >
                      {option.label}
                      {option.hint ? <span className="ms-1 text-[10px] text-slate-500">{option.hint}</span> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl bg-white/[0.03] p-3 text-center text-[11px] text-slate-400">
                  🍒🍒🍒 ×4 · 💎×7 · 7️⃣×10 · رابحان من نفس الرمز ×1.5
                </p>
              )}

              <Button
                onClick={play}
                disabled={!validBet}
                loading={loading}
                size="lg"
                variant="gold"
                className="w-full"
                icon={<Zap className="size-5" />}
              >
                العب الآن {numericBet > 0 ? `— ${fmt(numericBet)} BTP` : ""}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle title="آخر الجولات" icon={<Flame className="size-5" />} subtitle="نفس جلستك الحالية" />
            {results.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-500">لم تلعب بعد — ابدأ بجولة صغيرة!</p>
            ) : (
              <ul className="divide-y divide-white/[0.04]">
                {results.map((result, index) => (
                  <li key={`${result.transactionId}-${index}`} className="flex items-center justify-between py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${result.won ? "bg-btp-400" : "bg-red-400"}`} />
                      <span className="font-bold text-white">{result.result}</span>
                    </span>
                    <span className={`tabular text-xs font-extrabold ${result.won ? "text-btp-300" : "text-red-300"}`}>
                      {result.won ? "+" : "-"}
                      {fmt(result.won ? result.payout : result.bet)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* الشريط الجانبي */}
        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle title="ملخص حسابك" />
            {!dashboard ? (
              <Skeleton className="h-20" />
            ) : (
              <div className="space-y-3">
                <Stat label="الرصيد" value={dashboard.user.balance} tone="green" hint={symbol} />
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-white/[0.03] py-2">
                    <p className="text-[10px] text-slate-500">جولات</p>
                    <p className="tabular font-extrabold text-white">{dashboard.games.played}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] py-2">
                    <p className="text-[10px] text-slate-500">فوز</p>
                    <p className="tabular font-extrabold text-btp-300">
                      {dashboard.games.played ? Math.round((dashboard.games.won / dashboard.games.played) * 100) : 0}%
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] py-2">
                    <p className="text-[10px] text-slate-500">مراهنات</p>
                    <p className="tabular font-extrabold text-white">{fmt(dashboard.games.wagered)}</p>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] py-2">
                    <p className="text-[10px] text-slate-500">أرباح</p>
                    <p className="tabular font-extrabold text-gold-300">{fmt(dashboard.games.winnings)}</p>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle title="أفضل اللاعبين" icon={<Trophy className="size-5" />} subtitle="صافي الربح" />
            <ul className="space-y-1.5">
              {(top ?? []).slice(0, 6).map((entry, index) => (
                <li key={entry.userId} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    <span className="w-4 text-center text-slate-500">{["🥇", "🥈", "🥉"][index] ?? index + 1}</span>
                    <span className="max-w-[8rem] truncate font-bold text-white">{entry.username ? `@${entry.username}` : entry.name}</span>
                  </span>
                  <span className={`tabular font-extrabold ${entry.netProfit >= 0 ? "text-btp-300" : "text-red-300"}`}>
                    {entry.netProfit >= 0 ? "+" : ""}
                    {fmt(entry.netProfit)}
                  </span>
                </li>
              ))}
              {(top ?? []).length === 0 ? <p className="py-3 text-center text-xs text-slate-500">كن أول الرابحين!</p> : null}
            </ul>
          </Card>

          <Card className="p-5">
            <p className="mb-2 text-sm font-extrabold text-white">قواعد سريعة</p>
            <ul className="space-y-2 text-[11px] leading-relaxed text-slate-400">
              <li>• الرهان يُخصم فوراً، والمكسب يُضاف بعد خصم ضريبة الأرباح {currentLimits.taxPercent}%.</li>
              <li>• النتائج تُحدَّد عشوائياً عبر crypto.randomInt على السيرفر — لا يمكن التلاعب من المتصفح.</li>
              <li>• نفس الجولة تظهر في سجل الموقع ورسائل البوت.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function GamesPage() {
  return (
    <RequireAuth>
      <GamesContent />
    </RequireAuth>
  );
}
