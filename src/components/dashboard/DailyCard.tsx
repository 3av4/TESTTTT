"use client";

/**
 * بطاقة الراتب اليومي: عداد تنازلي مباشر + زر مطالبة + Streak + توقعات المكافأة.
 */
import { useEffect, useState } from "react";
import useSWR from "swr";
import { CalendarCheck, Flame, Gift, Timer } from "lucide-react";
import { Badge, Button, Card, Progress } from "@/components/ui/primitives";
import { api, countdown, duration, errorMessage, fmt } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { useSWRConfig } from "swr";
import type { DailyClaim, DailyStatus, UserDashboard } from "@/lib/types";

export function DailyCard({ daily, streak }: { daily: DailyStatus; streak: number }) {
  const [secondsLeft, setSecondsLeft] = useState(daily.secondsRemaining);
  const [claiming, setClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState<DailyClaim | null>(null);
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { mutate } = useSWR<UserDashboard>("/user/me");

  useEffect(() => {
    setSecondsLeft(daily.secondsRemaining);
  }, [daily.secondsRemaining]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const canClaim = secondsLeft <= 0;
  const totalWindow = daily.bracket.cooldownHours * 3600;
  const progress = canClaim ? 0 : (secondsLeft / Math.max(1, totalWindow)) * 100;
  const currentStreak = justClaimed?.streak ?? streak;
  const bracketBonus = Math.min(Math.max(currentStreak, 1), daily.bracket.maxBonusDays) * daily.bracket.bonusPerDay;

  async function claim() {
    setClaiming(true);
    try {
      const result = await api.post<DailyClaim>("/user/daily");
      setJustClaimed(result);
      setSecondsLeft(result.secondsRemaining);
      toast.success(`🎁 +${fmt(result.amount)} BTP`, `راتبك اليومي — سلسلة ${result.streak} يوم`);
      await mutate();
      void globalMutate("/user/transactions");
      void globalMutate("/user/daily");
      void globalMutate("/auth/me");
    } catch (error) {
      const message = errorMessage(error);
      toast.error("لم يتم استلام الراتب", message);
      void mutate();
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Card strong className="relative overflow-hidden p-5 sm:p-6">
      <div className="pointer-events-none absolute -end-10 -top-14 size-48 rounded-full bg-gold-500/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-gold-500/15 text-gold-300">
            <Gift className="size-5" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-white">الراتب اليومي</p>
            <p className="text-[11px] text-slate-400">
              {fmt(daily.bracket.min)}–{fmt(daily.bracket.max)} BTP + مكافأة السلسلة
            </p>
          </div>
        </div>
        <Badge tone={currentStreak > 1 ? "gold" : "neutral"}>
          <Flame className="size-3" /> {currentStreak} يوم
        </Badge>
      </div>

      <div className="relative mt-5 rounded-2xl border border-white/5 bg-ink-950/60 p-4">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="flex items-center gap-1.5 text-slate-400">
            <Timer className="size-3.5" /> {canClaim ? "الراتب متاح الآن" : "الراتب القادم بعد"}
          </span>
          <span className={`tabular text-base font-black ${canClaim ? "text-btp-300" : "text-white"}`}>
            {canClaim ? "جاهز ✅" : countdown(secondsLeft)}
          </span>
        </div>
        <Progress value={100 - progress} className="mt-3" />
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-white/[0.03] py-2">
            <p className="text-[10px] font-bold text-slate-500">مكافأة السلسلة</p>
            <p className="tabular text-sm font-extrabold text-gold-300">+{fmt(bracketBonus)}</p>
          </div>
          <div className="rounded-lg bg-white/[0.03] py-2">
            <p className="text-[10px] font-bold text-slate-500">المتوقع الآن</p>
            <p className="tabular text-sm font-extrabold text-white">
              {fmt(daily.estimatedMin)}–{fmt(daily.estimatedMax)}
            </p>
          </div>
        </div>
      </div>

      <Button
        onClick={claim}
        disabled={!canClaim}
        loading={claiming}
        variant={canClaim ? "gold" : "subtle"}
        size="lg"
        className="relative mt-4 w-full"
        icon={<CalendarCheck className="size-4" />}
      >
        {canClaim ? "استلم راتبك اليومي" : `يتجدد بعد ${duration(secondsLeft)}`}
      </Button>

      {justClaimed ? (
        <div className="relative mt-3 rounded-xl border border-btp-400/20 bg-btp-500/[0.06] px-3 py-2 text-center text-[11px] font-bold text-btp-300">
          استلمت {fmt(justClaimed.amount)} BTP (أساس {fmt(justClaimed.base)} + سلسلة {fmt(justClaimed.streakBonus)}
          {justClaimed.multiplier > 1 ? ` × ${justClaimed.multiplier}` : ""})
        </div>
      ) : null}
    </Card>
  );
}
