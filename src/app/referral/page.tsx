"use client";

/**
 * صفحة الإحالات (عامة): اشرح النظام واعرض رابطك إن كنت مسجلاً.
 */
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Copy, Gift, Share2, Sparkles, UserPlus, Users } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, LinkButton, SectionTitle, Skeleton, Stat } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/common/RequireAuth";
import { useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import { useToast } from "@/lib/toast";
import { fmt, timeAgo } from "@/lib/api";
import type { LeaderboardEntry, ReferralInfo } from "@/lib/types";

function ReferralContent() {
  const { config, symbol } = useConfig();
  const toast = useToast();
  const { data, isLoading } = useSWR<ReferralInfo>("/user/referral");

  async function copy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.link);
      toast.success("تم نسخ الرابط", "شاركه مع أصدقائك الآن");
    } catch {
      toast.info("الرابط", data.link);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent("انضم إلى BitPoin واحصل على مكافأة ترحيب فورية!")}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-black text-white">
          <Users className="size-6 text-btp-300" /> برنامج الإحالة
        </h1>
        <p className="mt-1 text-sm text-slate-400">ادعُ أصدقاءك واربح {config.referral_reward_inviter} BTP عن كل صديق — ويحصل هو على {config.referral_reward_invitee} BTP.</p>
      </div>

      <Card strong className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -start-20 -top-24 size-72 rounded-full bg-btp-500/10 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <Badge tone="green">
              <Sparkles className="size-3" /> مكافأة فورية للطرفين
            </Badge>
            <h2 className="mt-3 text-2xl font-black text-white">
              +{fmt(data.rewardInviter)} BTP لك <span className="text-slate-500">·</span> +{fmt(data.rewardInvitee)} BTP لصديقك
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              كل صديق ينضم عبر رابطك ويبدأ استخدام البوت يمنحك مكافأة نقدية فورية. لا حدود لعدد الأصدقاء.
            </p>

            <div className="mt-4 rounded-xl border border-white/10 bg-ink-950/70 p-3">
              <p className="text-[10px] font-bold text-slate-500">رابطك الخاص</p>
              <p dir="ltr" className="mt-1 truncate text-xs font-extrabold text-btp-300">{data.link}</p>
              <p className="mt-1 text-[10px] text-slate-500">كودك: <code className="text-gold-300">{data.code}</code></p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={copy} variant="ghost" size="sm" icon={<Copy className="size-3.5" />}>
                نسخ الرابط
              </Button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-b from-btp-400 to-btp-600 px-4 text-xs font-bold text-ink-950"
              >
                <Share2 className="size-3.5" /> مشاركة عبر تلجرام
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 self-center">
            <Stat label="مدعوون" value={data.invitedCount} tone="default" icon={<UserPlus className="size-4" />} />
            <Stat label="مكتمل" value={data.paidCount} tone="green" icon={<CheckCircle2 className="size-4" />} />
            <Stat label="معلّق" value={data.pendingCount} tone="gold" />
            <Stat label="الأرباح" value={data.earnings} tone="blue" hint={symbol} />
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {[
          { step: "1", title: "شارك رابطك", text: "أرسل الرابط لأصدقائك في تلجرام أو القروبات." },
          { step: "2", title: "صديقك يبدأ البوت", text: "يفتح الرابط ويرسل /start — يُربط بحسابك تلقائياً ويحصل على مكافأته." },
          { step: "3", title: "تحصل أنت على مكافأتك", text: `عند أول نشاط له (راتب/لعبة) يُضاف لك ${fmt(data.rewardInviter)} BTP فوراً.` },
        ].map((item) => (
          <Card key={item.step} className="p-5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-btp-500/15 text-sm font-black text-btp-300">{item.step}</span>
            <p className="mt-3 text-sm font-extrabold text-white">{item.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.text}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-5">
        <SectionTitle title="المدعوون" icon={<Users className="size-5" />} subtitle="حالة كل صديق دعوته" />
        {data.invited.length === 0 ? (
          <EmptyState
            icon={<Gift className="size-6" />}
            title="لم تدعُ أحداً بعد"
            description={`ابدأ بمشاركة رابطك واربح ${fmt(data.rewardInviter)} BTP عن كل صديق.`}
            action={<Button onClick={copy} size="sm" variant="primary" icon={<Copy className="size-3.5" />}>انسخ الرابط</Button>}
          />
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {data.invited.map((invitee) => (
              <li key={invitee.id} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2.5">
                  <Avatar name={invitee.name} size={32} />
                  <span>
                    <span className="block text-sm font-bold text-white">{invitee.name}</span>
                    <span className="block text-[10px] text-slate-500">{timeAgo(invitee.createdAt)}</span>
                  </span>
                </span>
                <Badge tone={invitee.status === "paid" ? "green" : "gold"}>
                  {invitee.status === "paid" ? `+${fmt(invitee.reward)} BTP` : "بانتظار التفعيل"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TopReferrers() {
  const { data } = useSWR<{ entries: LeaderboardEntry[] }>("/leaderboard?scope=referrals&limit=10");
  const entries = data?.entries ?? [];
  if (entries.length === 0) return null;
  return (
    <Card className="mt-4 p-5">
      <SectionTitle title="أفضل الداعين" icon={<Users className="size-5" />} />
      <ul className="space-y-1.5">
        {entries.map((entry) => (
          <li key={entry.userId} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="w-5 text-center text-xs font-black text-slate-500">
                {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : entry.rank}
              </span>
              <span className="max-w-[10rem] truncate font-bold text-white">{entry.username ? `@${entry.username}` : entry.name}</span>
            </span>
            <span className="text-xs font-extrabold text-btp-300">{entry.score ?? 0} دعوة</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ReferralPage() {
  const { user } = useAuth();
  return (
    <RequireAuth>
      <ReferralContent />
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <TopReferrers />
        <div className="mt-6 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs text-slate-400">
          <span>هل تحتاج مساعدة؟ اكتب /referral في البوت.</span>
          <Link href="/dashboard" className="flex items-center gap-1 font-bold text-btp-300 hover:text-btp-200">
            لوحتي <ArrowLeft className="size-3.5" />
          </Link>
        </div>
      </div>
      {!user ? (
        <div className="mx-auto mt-6 max-w-5xl px-4">
          <LinkButton href="/login" variant="primary">سجّل الدخول للبدء</LinkButton>
        </div>
      ) : null}
    </RequireAuth>
  );
}
