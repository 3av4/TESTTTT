"use client";

/**
 * نموذج التحويل: معاينة الضريبة قبل التنفيذ، تحقق من الحدود، وتحديث فوري للرصيد.
 */
import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { AtSign, Send, Users } from "lucide-react";
import { Button, Card, Field, Badge } from "@/components/ui/primitives";
import { api, errorMessage, fmt } from "@/lib/api";
import { useConfig } from "@/lib/config";
import { useToast } from "@/lib/toast";
import type { TransferResult } from "@/lib/types";

export function TransferForm({ balance }: { balance: number }) {
  const { config } = useConfig();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<TransferResult | null>(null);

  const taxPercent = Number.parseFloat(config.transfer_tax_pct) || 0;
  const numericAmount = Number.parseInt(amount, 10) || 0;
  const tax = Math.round((numericAmount * taxPercent) / 100);
  const net = Math.max(0, numericAmount - tax);
  const insufficient = numericAmount > balance;
  const underMin = numericAmount > 0 && numericAmount < Number.parseFloat(config.min_transfer);
  const overMax = numericAmount > Number.parseFloat(config.max_transfer);
  const valid = recipient.trim().length > 1 && numericAmount > 0 && !insufficient && !underMin && !overMax;

  const quick = useMemo(
    () => [100, 500, 1000, 5000].filter((value) => value <= balance),
    [balance],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setLoading(true);
    try {
      const result = await api.post<TransferResult>("/user/transfer", {
        recipient: recipient.trim(),
        amount: numericAmount,
        note: note.trim() || undefined,
      });
      setLastResult(result);
      toast.success("✅ تم التحويل", `وصل ${fmt(result.net)} BTP إلى ${result.recipientName}`);
      setAmount("");
      setNote("");
      await mutate("/user/me");
      await mutate("/user/transactions");
      await mutate("/auth/me");
    } catch (error) {
      toast.error("فشل التحويل", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">
            <Send className="size-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-white">تحويل BTP</p>
            <p className="text-[11px] text-slate-500">ضريبة {taxPercent}% تذهب لخزينة النظام</p>
          </div>
        </div>
        <Badge tone="blue">رصيدك {fmt(balance)}</Badge>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Field
          label="المستلم"
          placeholder="@username أو معرّف تلجرام"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          suffix=""
          hint="يجب أن يكون المستلم قد بدأ استخدام البوت من قبل"
        />
        <Field
          label="المبلغ (BTP)"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="0"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
          suffix="BTP"
          error={insufficient ? "رصيدك غير كافٍ" : underMin ? `أدنى تحويل ${config.min_transfer} BTP` : overMax ? `أعلى تحويل ${fmt(Number.parseFloat(config.max_transfer))} BTP` : null}
        />

        {quick.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {quick.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-bold text-slate-300 transition hover:border-sky-400/40 hover:text-white"
              >
                {fmt(value)}
              </button>
            ))}
          </div>
        ) : null}

        <Field
          label="ملاحظة (اختياري)"
          placeholder="مثال: سداد رهان أمس"
          value={note}
          maxLength={100}
          onChange={(event) => setNote(event.target.value)}
        />

        {numericAmount > 0 ? (
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/5 bg-ink-950/60 p-3 text-center">
            <div>
              <p className="text-[10px] font-bold text-slate-500">المبلغ</p>
              <p className="tabular text-sm font-extrabold text-white">{fmt(numericAmount)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500">الضريبة</p>
              <p className="tabular text-sm font-extrabold text-red-300">-{fmt(tax)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500">يستلم</p>
              <p className="tabular text-sm font-extrabold text-btp-300">{fmt(net)}</p>
            </div>
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={!valid} loading={loading} icon={<Send className="size-4" />}>
          إرسال التحويل
        </Button>
      </form>

      {lastResult ? (
        <div className="mt-3 rounded-xl border border-btp-400/20 bg-btp-500/[0.06] p-3 text-[11px] font-bold text-btp-300">
          <p className="flex items-center gap-1.5">
            <Users className="size-3.5" /> آخر تحويل: {fmt(lastResult.net)} BTP إلى {lastResult.recipientName}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-slate-400">
            <AtSign className="size-3" /> رصيدك الآن {fmt(lastResult.senderBalance)} BTP
          </p>
        </div>
      ) : null}
    </Card>
  );
}

/** نموذج استرداد كود هدية */
export function RedeemCard() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ amount: number; balance: number } | null>(null);
  const toast = useToast();
  const { mutate } = useSWRConfig();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (code.trim().length < 4) return;
    setLoading(true);
    try {
      const data = await api.post<{ amount: number; balance: number }>("/promo/redeem", { code: code.trim() });
      setResult(data);
      setCode("");
      toast.success("🎟 تم استرداد الكود", `+${fmt(data.amount)} BTP`);
      await mutate("/user/me");
      await mutate("/user/transactions");
    } catch (error) {
      toast.error("كود غير صالح", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-purple-500/10 text-purple-300">🎟️</span>
        <div>
          <p className="text-sm font-extrabold text-white">كود هدية</p>
          <p className="text-[11px] text-slate-500">أدخل كوداً من الإدارة أو الأحداث</p>
        </div>
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <Field
          placeholder="BTPGIFT1"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
          maxLength={32}
          className="uppercase tracking-wider"
          dir="ltr"
        />
        <Button type="submit" variant="outline" loading={loading} disabled={code.trim().length < 4} className="shrink-0">
          استرداد
        </Button>
      </form>
      {result ? (
        <p className="mt-2 text-[11px] font-bold text-btp-300">
          تمت إضافة {fmt(result.amount)} BTP — رصيدك {fmt(result.balance)}
        </p>
      ) : null}
    </Card>
  );
}

