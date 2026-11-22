"use client";

/**
 * صفحة الحالة — تُجيب فوراً على سؤال «هل النظام شغال؟»
 * تعرض: الموقع، قاعدة البيانات، WebSocket، والبوت (مع سبب توقفه إن وُجد).
 */
import useSWR from "swr";
import { Activity, AlertTriangle, Bot, CheckCircle2, Database, Globe, MessageCircle, Radio, RefreshCw, XCircle } from "lucide-react";
import { Badge, Button, Card, LinkButton } from "@/components/ui/primitives";
import { api, errorMessage, timeAgo } from "@/lib/api";
import type { BotStatus } from "@/lib/types";

interface HealthResponse {
  ok: boolean;
  data: { db: boolean; uptime: number; env: string; realtime: { connections: number; authenticated: number } };
}

export default function StatusPage() {
  const { data: health, error: healthError, mutate: reloadHealth } = useSWR<HealthResponse>("../healthz", {
    refreshInterval: 10_000,
    fetcher: async (url: string) => {
      const response = await fetch(`/${url.replace(/^\.\.\//, "")}`, { cache: "no-store" });
      return (await response.json()) as HealthResponse;
    },
  });
  const { data: bot, error: botError, mutate: reloadBot } = useSWR<BotStatus>("/telegram/status", {
    refreshInterval: 10_000,
  });
  const { data: stats } = useSWR<{ users: number; totalTransactions: number; treasury: number }>("/stats");

  const siteOk = Boolean(health?.ok) && !healthError;
  const botError_ = Boolean(bot?.startupError);
  const botOk = bot ? bot.running && !botError_ : false;
  const networkBlocked = botError_ && /api\.telegram\.org|network|fetch/i.test(bot?.startupError ?? "");

  const rows = [
    {
      icon: Globe,
      name: "الموقع",
      ok: siteOk,
      detail: siteOk ? `يعمل · بيئة ${health?.data.env ?? "—"} · مدة التشغيل ${Math.round((health?.data.uptime ?? 0) / 60)} د` : "لا يستجيب",
    },
    {
      icon: Database,
      name: "قاعدة البيانات",
      ok: Boolean(health?.data.db),
      detail: health?.data.db ? "متصل · المعاملات الذرّية جاهزة" : "غير متصل",
    },
    {
      icon: Radio,
      name: "التحديث اللحظي (WebSocket)",
      ok: true,
      detail: `${health?.data.realtime.connections ?? 0} اتصال مفتوح الآن`,
    },
    {
      icon: Bot,
      name: "بوت تلجرام",
      ok: botOk,
      detail: bot
        ? botError_
          ? `متوقف — ${bot.startupError}`
          : `يعمل بوضع ${bot.mode} · ${bot.updatesHandled} تحديث مُعالج${bot.lastUpdateAt ? ` · آخر تحديث ${timeAgo(bot.lastUpdateAt)}` : ""}`
        : "جارٍ الفحص…",
    },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white">
            <Activity className="size-6 text-btp-300" /> حالة النظام
          </h1>
          <p className="mt-1 text-sm text-slate-400">فحص حيّ كل 10 ثوانٍ</p>
        </div>
        <div className="flex items-center gap-2">
          {botOk ? <Badge tone="green">كل الأنظمة تعمل</Badge> : <Badge tone="gold">مشكلة في البوت</Badge>}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void reloadHealth();
              void reloadBot();
            }}
            icon={<RefreshCw className="size-3.5" />}
          >
            تحديث
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <Card key={row.name} className="flex items-start gap-3 p-4">
            <span
              className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${
                row.ok ? "bg-btp-500/10 text-btp-300" : "bg-red-500/10 text-red-300"
              }`}
            >
              <row.icon className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold text-white">{row.name}</p>
                {row.ok ? (
                  <CheckCircle2 className="size-4 shrink-0 text-btp-400" />
                ) : (
                  <XCircle className="size-4 shrink-0 text-red-400" />
                )}
              </div>
              <p className={`mt-0.5 break-words text-[11px] leading-relaxed ${row.ok ? "text-slate-400" : "text-red-300"}`} dir="auto">
                {row.detail}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {networkBlocked ? (
        <Card className="mt-4 border-amber-400/25 bg-amber-500/[0.06] p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-amber-200">
            <AlertTriangle className="size-4" /> البوت يحتاج اتصالاً مباشراً بتلجرام
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-200/80">
            الموقع وقاعدة البيانات يعملان تماماً. البوت وحده لا يستطيع الاتصال بـ
            <code className="mx-1 rounded bg-black/30 px-1 py-0.5 text-[10px]">api.telegram.org</code>
            من هذه البيئة. شغّل المشروع على سيرفر/VPS بوصول إنترنت كامل (أو استخدم{" "}
            <code className="rounded bg-black/30 px-1 py-0.5 text-[10px]">npm run bot:only</code>
            {" "}على جهاز آخر يشترك في نفس قاعدة البيانات).
          </p>
        </Card>
      ) : null}

      {botError && !bot ? (
        <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/[0.07] p-3 text-[11px] text-red-200">
          {errorMessage(botError)}
        </p>
      ) : null}

      <Card className="mt-4 p-5">
        <p className="text-sm font-extrabold text-white">إحصاءات مباشرة</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "المستخدمون", value: stats?.users ?? "—" },
            { label: "المعاملات", value: stats?.totalTransactions ?? "—" },
            { label: "الخزينة", value: stats?.treasury ?? "—" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-white/[0.03] py-2.5">
              <p className="tabular text-lg font-black text-white">{item.value}</p>
              <p className="text-[10px] text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/" variant="ghost" size="sm">
          الرئيسية
        </LinkButton>
        <LinkButton href="/login" variant="primary" size="sm">
          دخول تجريبي
        </LinkButton>
        <a
          href="https://t.me/BitPoinBot"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-slate-200 hover:bg-white/10"
        >
          <MessageCircle className="size-3.5" /> @BitPoinBot
        </a>
      </div>
    </div>
  );
}
