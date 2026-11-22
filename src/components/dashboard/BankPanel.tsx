"use client";

/**
 * لوحة البنك: إيداع/سحب، فائدة معلّقة، وعداد استحقاق الفائدة.
 */
import { useEffect, useState } from "react";
import { useSWRConfig } from "swr";
import { ArrowDownToLine, ArrowUpFromLine, Landmark, PiggyBank, ShieldCheck, TrendingUp } from "lucide-react";
import { Badge, Button, Card, Field, Progress } from "@/components/ui/primitives";
import { api, countdown, errorMessage, fmt } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useToast } from "@/lib/toast";
import type { BankInfo } from "@/lib/types";

export function BankPanel({ bank, cash, bankBalance }: { bank: BankInfo; cash: number; bankBalance: number }) {
  const { num } = useConfig();
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(bank.secondsToInterest);
  const toast = useToast();
  const { mutate } = useSWRConfig();

  useEffect(() => {
    setSecondsLeft(bank.secondsToInterest);
  }, [bank.secondsToInterest]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  const numeric = Number.parseInt(amount, 10) || 0;
  const maxAllowed = mode === "deposit" ? cash : bankBalance;
  const projectedInterest = Math.round((Math.min(bankBalance, bank.capacity) * bank.interestPercent) / 100);
  const minDeposit = num("bank_min_deposit");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (numeric <= 0) return;
    setLoading(true);
    try {
      const result = await api.post<{ balance: number; bankBalance: number; interestCredited: number }>(
        mode === "deposit" ? "/user/deposit" : "/user/withdraw",
        { amount: numeric },
      );
      toast.success(mode === "deposit" ? "🏦 تم الإيداع" : "🏦 تم السحب", `رصيد البنك: ${fmt(result.bankBalance)} BTP`);
      setAmount("");
      await mutate("/user/me");
      await mutate("/user/bank");
      await mutate("/user/transactions");
    } catch (error) {
      toast.error("تعذّرت العملية", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }


  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-btp-500/10 text-btp-300">
            <Landmark className="size-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-white">البنك</p>
            <p className="text-[11px] text-slate-500">فائدة {bank.interestPercent}% يومياً — محمي من السرقة</p>
          </div>
        </div>
        <Badge tone="green">
          <ShieldCheck className="size-3" /> آمن
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/5 bg-gradient-to-bl from-btp-500/10 to-transparent p-3">
          <p className="text-[10px] font-bold text-slate-500">في البنك</p>
          <p className="tabular mt-0.5 text-xl font-black text-white">{fmt(bankBalance)}</p>
          <p className="mt-0.5 text-[10px] text-btp-300">فائدة متوقعة ~{fmt(projectedInterest)}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
          <p className="text-[10px] font-bold text-slate-500">نقدك</p>
          <p className="tabular mt-0.5 text-xl font-black text-white">{fmt(cash)}</p>
          <p className="mt-0.5 text-[10px] text-slate-500">السعة {fmt(bank.capacity)}</p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="flex items-center gap-1 text-slate-400">
            <TrendingUp className="size-3.5" /> استحقاق الفائدة
          </span>
          <span className="tabular text-btp-300">{secondsLeft <= 0 ? "مستحقة الآن ✅" : countdown(secondsLeft)}</span>
        </div>
        <Progress value={100 - (secondsLeft / 86400) * 100} className="mt-2" />
        <p className="mt-1 text-[10px] text-slate-500">
          فائدة معلّقة: <b className="text-btp-300">{fmt(bank.pendingInterest)} BTP</b> — تُضاف تلقائياً كل 24 ساعة
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-ink-900/80 p-1">
        <button
          type="button"
          onClick={() => setMode("deposit")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
            mode === "deposit" ? "bg-btp-500/15 text-btp-300" : "text-slate-500"
          }`}
        >
          <ArrowDownToLine className="size-3.5" /> إيداع
        </button>
        <button
          type="button"
          onClick={() => setMode("withdraw")}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition ${
            mode === "withdraw" ? "bg-gold-500/15 text-gold-300" : "text-slate-500"
          }`}
        >
          <ArrowUpFromLine className="size-3.5" /> سحب
        </button>
      </div>

      <form onSubmit={submit} className="mt-3 space-y-2.5">
        <Field
          type="number"
          inputMode="numeric"
          min={1}
          placeholder={mode === "deposit" ? `أدنى إيداع ${fmt(minDeposit)}` : "مبلغ السحب"}
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
          suffix="BTP"
          error={numeric > maxAllowed ? (mode === "deposit" ? "رصيدك النقدي لا يكفي" : "رصيد البنك لا يكفي") : null}
        />
        <Button
          type="submit"
          variant={mode === "deposit" ? "primary" : "gold"}
          className="w-full"
          size="sm"
          loading={loading}
          disabled={numeric <= 0 || numeric > maxAllowed || (mode === "deposit" && numeric < minDeposit)}
          icon={<PiggyBank className="size-4" />}
        >
          {mode === "deposit" ? "إيداع في البنك" : "سحب إلى المحفظة"}
        </Button>
      </form>
    </Card>
  );
}
