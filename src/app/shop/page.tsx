"use client";

/**
 * المتجر: ألقاب، مضاعفات، دروع، شارات — شراء داخل Transaction مع قفل الصف.
 */
import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { BadgeCheck, Check, PackageOpen, Shield, ShoppingBag, Sparkles, Zap } from "lucide-react";
import { Badge, Button, Card, EmptyState, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/common/RequireAuth";
import { useConfig } from "@/lib/config";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/lib/toast";
import { api, errorMessage, fmt } from "@/lib/api";
import type { ShopItem, UserDashboard } from "@/lib/types";

const KIND_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; tone: "green" | "gold" | "blue" | "neutral" }> = {
  title: { label: "لقب", icon: Sparkles, tone: "gold" },
  boost: { label: "مضاعف", icon: Zap, tone: "green" },
  shield: { label: "حماية", icon: Shield, tone: "blue" },
  badge: { label: "شارة", icon: BadgeCheck, tone: "neutral" },
};

function ShopContent() {
  const { symbol } = useConfig();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { connected } = useRealtime();
  const { data, isLoading } = useSWR<{ items: ShopItem[] }>("/shop");
  const { data: dashboard } = useSWR<UserDashboard>("/user/me");
  const [filter, setFilter] = useState<string>("all");
  const [buying, setBuying] = useState<string | null>(null);

  const items = data?.items ?? [];
  const filtered = useMemo(() => (filter === "all" ? items : items.filter((item) => item.kind === filter)), [items, filter]);
  const balance = dashboard?.user.balance ?? 0;
  const activeTitle = dashboard?.user.activeTitle ?? null;

  async function buy(item: ShopItem) {
    setBuying(item.code);
    try {
      const result = await api.post<{ message: string; balance: number; activeTitle: string | null }>("/shop/buy", {
        code: item.code,
      });
      toast.success(`✅ ${item.name}`, result.message);
      await mutate("/user/me");
      await mutate("/shop");
      await mutate("/auth/me");
      await mutate("/user/transactions");
    } catch (error) {
      toast.error("تعذّر الشراء", errorMessage(error));
    } finally {
      setBuying(null);
    }
  }

  async function equip(item: ShopItem) {
    setBuying(item.code);
    try {
      await api.post("/shop/equip", { code: item.code });
      toast.success("تم تفعيل اللقب", item.name);
      await mutate("/user/me");
      await mutate("/auth/me");
    } catch (error) {
      toast.error("تعذّر التفعيل", errorMessage(error));
    } finally {
      setBuying(null);
    }
  }

  async function unequip() {
    try {
      await api.post("/shop/unequip");
      toast.info("تم إلغاء اللقب");
      await mutate("/user/me");
      await mutate("/auth/me");
    } catch (error) {
      toast.error("تعذّر الإلغاء", errorMessage(error));
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white">
            <ShoppingBag className="size-6 text-gold-300" /> المتجر
          </h1>
          <p className="mt-1 text-sm text-slate-400">ألقاب تظهر بجانب اسمك في المجموعات · دروع حماية · مضاعفات راتب</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="gold">رصيدك {fmt(balance)} {symbol}</Badge>
          {activeTitle ? (
            <button type="button" onClick={unequip} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-300 hover:bg-white/10">
              إلغاء اللقب: {activeTitle}
            </button>
          ) : null}
          <Badge tone={connected ? "green" : "neutral"}>
            <span className={`size-1.5 rounded-full ${connected ? "bg-btp-400" : "bg-slate-500"}`} /> {connected ? "لحظي" : "غير متصل"}
          </Badge>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {[
          { key: "all", label: "الكل" },
          { key: "title", label: "الألقاب" },
          { key: "boost", label: "المضاعفات" },
          { key: "shield", label: "الحماية" },
          { key: "badge", label: "الشارات" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setFilter(tab.key)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
              filter === tab.key ? "bg-gold-500/15 text-gold-300" : "bg-white/[0.03] text-slate-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-52" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<PackageOpen className="size-6" />} title="لا عناصر في هذا القسم" description="جرّب قسماً آخر أو عد لاحقاً." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const meta = KIND_META[item.kind] ?? KIND_META.title!;
            const owned = item.owned > 0;
            const isActive = item.kind === "title" && activeTitle === String(item.payload?.title ?? "");
            const canAfford = balance >= item.price;
            const outOfStock = item.stock !== null && item.stock <= 0;
            return (
              <Card key={item.code} className="card-hover relative overflow-hidden p-5">
                <div className="pointer-events-none absolute -end-8 -top-10 size-32 rounded-full bg-gold-500/5 blur-2xl" aria-hidden="true" />
                <div className="relative flex items-start justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.04] text-2xl">{item.icon}</span>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    {owned ? <Badge tone="green">تملك {item.owned}</Badge> : null}
                  </div>
                </div>
                <h3 className="relative mt-3 text-base font-extrabold text-white">{item.name}</h3>
                <p className="relative mt-1 line-clamp-2 min-h-[2.5rem] text-xs text-slate-400">{item.description}</p>
                <div className="relative mt-3 flex items-center justify-between">
                  <p className="tabular text-lg font-black text-gold-300">
                    {fmt(item.price)} <span className="text-xs font-bold text-slate-500">{symbol}</span>
                  </p>
                  {item.stock !== null ? (
                    <span className={`text-[10px] font-bold ${outOfStock ? "text-red-300" : "text-slate-500"}`}>
                      {outOfStock ? "نفد المخزون" : `متبقي ${item.stock}`}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-500">مخزون غير محدود</span>
                  )}
                </div>
                <div className="relative mt-3">
                  {isActive ? (
                    <Button variant="subtle" className="w-full" disabled icon={<Check className="size-4" />}>
                      اللقب مفعّل
                    </Button>
                  ) : owned && item.kind === "title" ? (
                    <Button variant="outline" className="w-full" loading={buying === item.code} onClick={() => equip(item)} icon={<Check className="size-4" />}>
                      تفعيل اللقب
                    </Button>
                  ) : (
                    <Button
                      variant={canAfford && !outOfStock ? "gold" : "subtle"}
                      className="w-full"
                      loading={buying === item.code}
                      disabled={!canAfford || outOfStock || (item.kind === "badge" && owned)}
                      onClick={() => buy(item)}
                      icon={<ShoppingBag className="size-4" />}
                    >
                      {outOfStock ? "نفد المخزون" : owned && item.kind === "badge" ? "مملوك" : canAfford ? "شراء" : "رصيد غير كافٍ"}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="mt-6 p-5">
        <SectionTitle title="كيف تعمل العناصر؟" icon={<Sparkles className="size-5" />} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: "الألقاب", text: "تظهر بجانب اسمك في التوب ورسائل البوت — يتحقق منها السيرفر عند كل عرض." },
            { title: "مضاعفات الراتب", text: "تُستهلك تلقائياً عند استلام الراتب اليومي القادم (×1.5)." },
            { title: "دروع الحماية", text: "تمنع سرقة رصيدك النقدي لمدة 3 أيام." },
            { title: "الشارات", text: "شارة توثيق دائمة في ملفك — شراء لمرة واحدة فقط." },
          ].map((card) => (
            <div key={card.title} className="rounded-xl bg-white/[0.03] p-3">
              <p className="text-xs font-extrabold text-white">{card.title}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{card.text}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function ShopPage() {
  return (
    <RequireAuth>
      <ShopContent />
    </RequireAuth>
  );
}
