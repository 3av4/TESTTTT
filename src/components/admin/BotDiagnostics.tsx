"use client";

/**
 * لوحة تشخيص البوت — تُظهر سبب توقفه بوضوح وزر فحص فوري.
 * تُستدعى من تبويب «النظام» في لوحة الإدارة.
 */
import { useState } from "react";
import useSWR from "swr";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Send, Stethoscope, XCircle } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { api, errorMessage, timeAgo } from "@/lib/api";
import type { BotSelfTest, BotStatus } from "@/lib/types";

export function BotDiagnostics() {
  const { data: status, mutate: reloadStatus } = useSWR<BotStatus>("/telegram/status", { refreshInterval: 15_000 });
  const [test, setTest] = useState<BotSelfTest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTest() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<BotSelfTest>("/telegram/selftest");
      setTest(result);
    } catch (exception) {
      setError(errorMessage(exception));
    } finally {
      setLoading(false);
      void reloadStatus();
    }
  }

  const hasProblem = Boolean(status?.startupError) || status?.running === false;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-extrabold text-white">
            <Stethoscope className="size-4 text-btp-300" /> تشخيص البوت
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            يفكّ شفرة المشكلة: التوكن، الشبكة، الويبهوك، أو الحالة
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status ? (
            hasProblem ? (
              <Badge tone="red">
                <XCircle className="size-3" /> غير متصل
              </Badge>
            ) : (
              <Badge tone="green">
                <CheckCircle2 className="size-3" /> يعمل
              </Badge>
            )
          ) : null}
          <Button size="sm" variant="outline" loading={loading} onClick={runTest} icon={<RefreshCw className="size-3.5" />}>
            فحص الآن
          </Button>
        </div>
      </div>

      {/* الحالة الفورية */}
      <div className="space-y-1.5">
        {[
          { label: "الوضع", value: status?.mode ?? "—" },
          { label: "التوكن", value: status ? (status.configured ? "مضبوط" : "غير مضبوط") : "—" },
          { label: "مشغّل", value: status?.running ? "نعم" : "لا" },
          { label: "تحديثات معالجة", value: String(status?.updatesHandled ?? 0) },
          { label: "آخر تحديث", value: status?.lastUpdateAt ? timeAgo(status.lastUpdateAt) : "لا يوجد" },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs">
            <span className="text-slate-400">{row.label}</span>
            <span className="font-bold text-white">{row.value}</span>
          </div>
        ))}
      </div>

      {status?.startupError && !test ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/[0.07] p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div className="text-[11px] leading-relaxed text-amber-200">
            <p className="font-bold">آخر خطأ:</p>
            <p dir="ltr" className="mt-0.5 break-words font-mono text-amber-300/90">{status.startupError}</p>
            <p className="mt-1.5 text-amber-200/80">اضغط «فحص الآن» لمعرفة السبب والحل المقترح.</p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/[0.07] p-3 text-[11px] text-red-200">{error}</p>
      ) : null}

      {/* نتيجة الفحص */}
      {loading && !test ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="size-3.5 animate-spin" /> جارٍ الاختبار…
        </div>
      ) : null}

      {test ? (
        <div className="mt-4 space-y-2">
          {test.steps.map((step) => (
            <div
              key={step.name}
              className={`rounded-xl border p-2.5 ${
                step.ok ? "border-btp-400/25 bg-btp-500/[0.06]" : "border-red-400/25 bg-red-500/[0.06]"
              }`}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold">
                {step.ok ? <CheckCircle2 className="size-3.5 text-btp-300" /> : <XCircle className="size-3.5 text-red-300" />}
                <span className={step.ok ? "text-btp-200" : "text-red-200"}>{step.name}</span>
              </p>
              <p dir="auto" className="mt-1 break-words text-[11px] leading-relaxed text-slate-400">
                {step.detail}
              </p>
            </div>
          ))}

          <div
            className={`rounded-xl border p-3 text-[11px] leading-relaxed ${
              test.steps.every((step) => step.ok)
                ? "border-btp-400/25 bg-btp-500/[0.06] text-btp-200"
                : "border-amber-400/25 bg-amber-500/[0.07] text-amber-200"
            }`}
          >
            <p className="mb-1 font-extrabold">الخلاصة:</p>
            <p>{test.diagnosis}</p>
            {test.botUsername ? (
              <a
                href={`https://t.me/${test.botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 font-bold text-white hover:bg-white/15"
              >
                <Send className="size-3" /> افتح @{test.botUsername}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
