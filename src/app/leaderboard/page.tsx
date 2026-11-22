"use client";

/**
 * المتصدرون: الأغنى عالمياً، أفضل لاعبي الألعاب، أفضل الداعين.
 */
import { useState } from "react";
import useSWR from "swr";
import { Crown, Flame, Gift, RefreshCw, Trophy, Users } from "lucide-react";
import { Avatar, Button, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import { fmt, timeAgo } from "@/lib/api";
import type { LeaderboardEntry, LeaderboardResult } from "@/lib/types";

type Scope = "global" | "games" | "referrals";

const SCOPES = [
  { key: "global", label: "الأغنى", icon: Crown },
  { key: "games", label: "أفضل اللاعبين", icon: Flame },
  { key: "referrals", label: "أفضل الداعين", icon: Users },
];

function RankRow({ entry, scope }: { entry: LeaderboardEntry; scope: Scope }) {
  const medal = entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : null;
  const isTop = entry.rank <= 3;
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition ${
        entry.isMe
          ? "bg-btp-500/[0.08] ring-1 ring-btp-400/30"
          : isTop
            ? "bg-gradient-to-l from-gold-500/[0.07] to-transparent"
            : "bg-white/[0.02]"
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex w-6 shrink-0 justify-center text-sm font-black text-slate-500">{medal ?? entry.rank}</span>
        <Avatar name={entry.name} size={34} ring={isTop} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">
            {entry.activeTitle ? <span className="me-1">{entry.activeTitle}</span> : null}
            {entry.username ? `@${entry.username}` : entry.name}
            {entry.isMe ? <span className="ms-1.5 rounded bg-btp-500/20 px-1 text-[9px] font-black text-btp-300">أنت</span> : null}
          </p>
          <p className="text-[10px] text-slate-500">
            {scope === "referrals" ? `${entry.score ?? 0} إحالة مكتملة` : scope === "games" ? `صافي ${fmt(entry.score ?? 0)} BTP` : `معرّف ${entry.telegramId}`}
          </p>
        </div>
      </div>
      <div className="text-end">
        <p className="tabular text-sm font-extrabold text-gold-300">{fmt(entry.balance)}</p>
        <p className="text-[9px] text-slate-500">BTP</p>
      </div>
    </li>
  );
}

export default function LeaderboardPage() {
  const [scope, setScope] = useState<Scope>("global");
  const { user } = useAuth();
  const { symbol } = useConfig();
  const { data, isLoading, mutate, isValidating } = useSWR<LeaderboardResult | { entries: LeaderboardEntry[]; scope: string }>(
    `/leaderboard?scope=${scope}&limit=50`,
    { refreshInterval: 30_000 },
  );

  const entries = data && "entries" in data ? data.entries : [];
  const me = data && "me" in data ? data.me : null;
  const updatedAt = data && "updatedAt" in data ? data.updatedAt : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white">
            <Trophy className="size-6 text-gold-300" /> لوحة المتصدرين
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            ترتيب حي حسب الرصيد والأداء {updatedAt ? `· آخر تحديث ${timeAgo(updatedAt)}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" loading={isValidating} onClick={() => mutate()} icon={<RefreshCw className="size-3.5" />}>
          تحديث
        </Button>
      </div>

      <Card className="p-5">
        <div className="mb-5 flex flex-wrap gap-1.5">
          {SCOPES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setScope(item.key as Scope)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                scope === item.key ? "bg-gold-500/15 text-gold-300" : "bg-white/[0.03] text-slate-400 hover:text-white"
              }`}
            >
              <item.icon className="size-3.5" /> {item.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState icon={<Trophy className="size-6" />} title="لا بيانات بعد" description="كن أول من يظهر في لوحة المتصدرين!" />
        ) : (
          <ul className="space-y-1.5">
            {entries.map((entry) => (
              <RankRow key={`${entry.userId}-${entry.rank}`} entry={entry} scope={scope} />
            ))}
          </ul>
        )}

        {me && scope === "global" ? (
          <div className="mt-5 rounded-xl border border-btp-400/20 bg-btp-500/[0.05] p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-bold text-white">
                <Trophy className="size-4 text-btp-300" /> ترتيبك
              </span>
              <span className="tabular font-extrabold text-btp-300">
                #{me.rank} · {fmt(me.balance)} {symbol}
              </span>
            </div>
          </div>
        ) : null}

        {user ? null : (
          <div className="mt-5 rounded-xl border border-gold-400/20 bg-gold-500/[0.05] p-3 text-center text-xs text-gold-200">
            <Gift className="mx-auto mb-1 size-4" /> سجّل الدخول لتظهر في القائمة وتنافس على الصدارة.
          </div>
        )}
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Crown, title: "المتصدر الأول", text: "أعلى رصيد نقدي في المنصة — يحمل لقب «الأغنى»." },
          { icon: Flame, title: "أفضل لاعب", text: "المستخدم صاحب أعلى صافي ربح في الألعاب (المكاسب − المراهنات)." },
          { icon: Users, title: "أفضل داعٍ", text: "الأكثر إحالة ناجحة — يحصل على مكافأة إضافية من الإدارة أحياناً!" },
        ].map((item) => (
          <Card key={item.title} className="p-4">
            <item.icon className="size-5 text-gold-300" />
            <p className="mt-2 text-sm font-extrabold text-white">{item.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.text}</p>
          </Card>
        ))}
      </div>

    </div>
  );
}
