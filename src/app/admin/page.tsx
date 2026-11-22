"use client";

/**
 * لوحة الأدمن الكاملة: نظرة عامة، المستخدمون، الإعدادات، المعاملات، البث،
 * الأكواد، المتجر، النسخ الاحتياطي، سجل التدقيق، القروبات.
 */
import { useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  Activity,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Ban,
  Banknote,
  Bell,
  CheckCircle2,
  Coins,
  Database,
  Download,
  FileClock,
  Gauge,
  HandCoins,
  Hash,
  Landmark,
  MessageSquare,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  Sliders,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import { Badge, Button, Card, Field, SectionTitle, Skeleton, Stat } from "@/components/ui/primitives";
import { RequireAuth } from "@/components/common/RequireAuth";
import { AdminSection, AdminTable } from "@/components/admin/shared";
import { BotDiagnostics } from "@/components/admin/BotDiagnostics";
import { Avatar } from "@/components/ui/primitives";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { useConfig } from "@/lib/config";
import { api, dateAr, errorMessage, fmt, fmtCompact, timeAgo } from "@/lib/api";
import type {
  AdminOverview,
  AdminTransaction,
  AuditLogItem,
  GroupSettingsItem,
  RedeemCodeItem,
  SettingRow,
  ShopItem,
  User,
} from "@/lib/types";

type Tab = "overview" | "users" | "economy" | "settings" | "transactions" | "codes" | "shop" | "audit" | "system";

const TABS: Array<{ key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "overview", label: "نظرة عامة", icon: Gauge },
  { key: "users", label: "المستخدمون", icon: Users },
  { key: "economy", label: "الاقتصاد", icon: Coins },
  { key: "settings", label: "الإعدادات", icon: Sliders },
  { key: "transactions", label: "المعاملات", icon: FileClock },
  { key: "codes", label: "الأكواد", icon: Ticket },
  { key: "shop", label: "المتجر", icon: Wallet },
  { key: "audit", label: "سجل التدقيق", icon: Shield },
  { key: "system", label: "النظام", icon: Database },
];

/* ------------------------------- Overview ------------------------------- */
function OverviewTab() {
  const { data, isLoading, mutate } = useSWR<AdminOverview>("/admin/overview", { refreshInterval: 20_000 });

  if (isLoading || !data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          متصلون الآن: <b className="text-btp-300">{data.realtime.connections}</b> · جلسات نشطة: <b className="text-white">{data.sessions.active}</b>
        </p>
        <Button size="sm" variant="ghost" onClick={() => mutate()} icon={<RefreshCw className="size-3.5" />}>تحديث</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="المستخدمون" value={data.stats.totalUsers} tone="green" hint={`+${data.stats.newToday} اليوم · ${data.stats.activeToday} نشط`} icon={<Users className="size-4" />} />
        <Stat label="المعروض الكلي" value={data.economy.totalSupply} tone="gold" hint={`${fmtCompact(data.economy.heldInBanks)} في البنوك`} icon={<Coins className="size-4" />} />
        <Stat label="الخزينة" value={data.economy.treasury} tone="blue" hint={`+${fmt(data.economy.taxes24h)} ضرائب اليوم`} icon={<Landmark className="size-4" />} />
        <Stat label="حجم 24 ساعة" value={data.economy.volume24h} tone="default" hint={`${data.economy.dailyTransactions} عملية`} icon={<Activity className="size-4" />} />
        <Stat label="المعاملات الكلية" value={data.stats.totalTransactions} icon={<FileClock className="size-4" />} />
        <Stat label="الضرائب المجمّعة" value={data.stats.totalTax} tone="gold" icon={<Banknote className="size-4" />} />
        <Stat label="جولات الألعاب" value={data.stats.totalGames} tone="green" hint={`${data.economy.games24h} اليوم`} icon={<Gauge className="size-4" />} />
        <Stat label="قروض نشطة" value={data.loans.active + data.loans.overdue} tone="red" hint={`${fmt(data.loans.outstanding)} مستحق`} icon={<HandCoins className="size-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSection title="توزيع الثروة" subtitle="أين توجد عملات BTP الآن">
          <div className="space-y-3">
            {[
              { label: "مع المستخدمين", value: data.economy.heldByUsers, tone: "bg-btp-400" },
              { label: "في البنوك", value: data.economy.heldInBanks, tone: "bg-sky-400" },
              { label: "الخزينة", value: data.economy.treasury, tone: "bg-gold-400" },
            ].map((row) => {
              const percent = data.economy.totalSupply ? (row.value / data.economy.totalSupply) * 100 : 0;
              return (
                <div key={row.label}>
                  <div className="mb-1 flex justify-between text-[11px] font-bold">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="tabular text-white">{fmt(row.value)} ({percent.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${row.tone}`} style={{ width: `${Math.max(2, percent)}%` }} />
                  </div>
                </div>
              );
            })}
            <div className="mt-3 grid grid-cols-2 gap-2 pt-2">
              <div className="rounded-lg bg-white/[0.03] p-2 text-center">
                <p className="text-[10px] text-slate-500">متوسط الرصيد</p>
                <p className="tabular text-sm font-bold text-white">{fmt(Math.round(data.economy.avgBalance))}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-2 text-center">
                <p className="text-[10px] text-slate-500">أعلى رصيد</p>
                <p className="tabular text-sm font-bold text-gold-300">{fmt(data.economy.topBalance)}</p>
              </div>
            </div>
          </div>
        </AdminSection>

        <AdminSection title="النشاط اليوم" subtitle="آخر 24 ساعة">
          <ul className="space-y-2">
            {[
              { label: "رواتب مدفوعة", value: `${data.economy.dailyClaims24h} (${fmt(data.economy.dailyPayout24h)} BTP)` },
              { label: "جولات ألعاب", value: `${data.economy.games24h} (${fmt(data.economy.gamesVolume24h)} BTP)` },
              { label: "معاملات", value: `${data.economy.dailyTransactions}` },
              { label: "ضرائب محصّلة", value: `${fmt(data.economy.taxes24h)} BTP` },
              { label: "مستخدمون جدد", value: `${data.economy.newUsers24h}` },
              { label: "إحالات مدفوعة", value: `${data.referrals.paid}` },
              { label: "محظورون", value: `${data.stats.bannedCount}` },
            ].map((row) => (
              <li key={row.label} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                <span className="text-slate-400">{row.label}</span>
                <span className="tabular font-bold text-white">{row.value}</span>
              </li>
            ))}
          </ul>
        </AdminSection>
      </div>
    </div>
  );
}

/* --------------------------------- Users -------------------------------- */
function UsersTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useSWR<{ items: User[]; total: number }>(
    `/admin/users?page=${page}&limit=20${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ""}`,
  );
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();

  const items = data?.items ?? [];

  async function act(action: "credit" | "debit" | "ban" | "unban" | "role", user: User) {
    const changes: Record<string, unknown> = { userId: user.id };
    if (action === "credit" || action === "debit") {
      const numeric = Number.parseInt(amount, 10);
      if (!numeric) {
        toast.error("أدخل مبلغاً صحيحاً");
        return;
      }
      changes.amount = numeric;
      changes.reason = reason || (action === "credit" ? "منحة إدارية" : "خصم إداري");
    }
    if (action === "role") changes.role = user.role === "admin" ? "user" : "admin";

    setBusy(`${action}-${user.id}`);
    try {
      await api.post(`/admin/${action}`, changes);
      toast.success("تم التنفيذ", `العملية ${action} على ${user.firstName}`);
      await mutate();
      await globalMutate("/admin/overview");
    } catch (error) {
      toast.error("فشلت العملية", errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSection
        title="إدارة المستخدمين"
        subtitle={`${fmt(data?.total ?? 0)} مستخدم مسجّل`}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-3.5 text-slate-500" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="اسم / @username / معرّف"
                className="h-9 w-52 rounded-lg border border-white/10 bg-ink-900/70 ps-8 pe-3 text-xs text-white focus:border-btp-400/60 focus:outline-none"
              />
            </div>
          </div>
        }
      >
        <AdminTable headers={["المستخدم", "الرصيد", "البنك", "السلسلة", "الحالة", "إجراءات"]} loading={isLoading} empty={items.length === 0}>
          {items.map((user) => (
            <tr key={user.id} className="align-middle">
              <td className="px-2 py-2.5">
                <div className="flex items-center gap-2">
                  <Avatar src={user.photoUrl} name={user.firstName} size={30} />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">
                      {user.activeTitle ? `${user.activeTitle} ` : ""}
                      {user.username ? `@${user.username}` : user.firstName}
                    </p>
                    <p className="text-[10px] text-slate-500">ID {user.telegramId} · {user.role === "admin" ? "مدير" : "مستخدم"}</p>
                  </div>
                </div>
              </td>
              <td className="tabular px-2 text-xs font-bold text-gold-300">{fmt(user.balance)}</td>
              <td className="tabular px-2 text-xs text-slate-400">{fmt(user.bankBalance)}</td>
              <td className="px-2 text-xs text-slate-400">{user.streak} 🔥</td>
              <td className="px-2">
                {user.isBanned ? <Badge tone="red">محظور</Badge> : <Badge tone="green">نشط</Badge>}
              </td>
              <td className="px-2">
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={() => setSelected(user)} className="rounded-lg bg-white/5 px-2 py-1 text-[10px] font-bold text-slate-300 hover:bg-white/10">
                    تحديد
                  </button>
                  <button
                    type="button"
                    onClick={() => act("ban", user)}
                    disabled={busy === `ban-${user.id}` || user.isBanned || user.role === "admin"}
                    className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-30"
                  >
                    حظر
                  </button>
                  <button
                    type="button"
                    onClick={() => act("unban", user)}
                    disabled={busy === `unban-${user.id}` || !user.isBanned}
                    className="rounded-lg bg-btp-500/10 px-2 py-1 text-[10px] font-bold text-btp-300 hover:bg-btp-500/20 disabled:opacity-30"
                  >
                    فك
                  </button>
                  <button
                    type="button"
                    onClick={() => act("role", user)}
                    disabled={busy === `role-${user.id}`}
                    className="rounded-lg bg-gold-500/10 px-2 py-1 text-[10px] font-bold text-gold-300 hover:bg-gold-500/20 disabled:opacity-30"
                  >
                    {user.role === "admin" ? "تنزيل" : "ترقية"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </AdminTable>

        {!search.trim() && (data?.total ?? 0) > 20 ? (
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>صفحة {page} من {Math.ceil((data?.total ?? 1) / 20)}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage((current) => current - 1)}>السابق</Button>
              <Button size="sm" variant="ghost" disabled={page * 20 >= (data?.total ?? 0)} onClick={() => setPage((current) => current + 1)}>التالي</Button>
            </div>
          </div>
        ) : null}
      </AdminSection>

      <AdminSection
        title="تعديل الرصيد"
        subtitle={selected ? `المحدد: ${selected.firstName} (${fmt(selected.balance)} BTP)` : "اختر مستخدماً من الجدول أعلاه"}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Field label="المبلغ" type="number" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))} suffix="BTP" disabled={!selected} />
          <Field label="السبب" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="مسابقة / تعويض…" disabled={!selected} />
          <Button
            variant="primary"
            className="self-end"
            disabled={!selected || !amount}
            loading={busy === `credit-${selected?.id}`}
            onClick={() => selected && act("credit", selected)}
            icon={<ArrowUpCircle className="size-4" />}
          >
            منح
          </Button>
          <Button
            variant="danger"
            className="self-end"
            disabled={!selected || !amount}
            loading={busy === `debit-${selected?.id}`}
            onClick={() => selected && act("debit", selected)}
            icon={<ArrowDownCircle className="size-4" />}
          >
            خصم
          </Button>
        </div>
        {!selected ? <p className="mt-2 flex items-center gap-1 text-[11px] text-amber-300"><AlertTriangle className="size-3" /> اضغط «تحديد» بجانب مستخدم أولاً</p> : null}
      </AdminSection>

      <AdminSection title="إشعار مستخدم" subtitle="إشعار داخلي + رسالة تلجرام">
        <NotifyUserForm selected={selected} />
      </AdminSection>
    </div>
  );
}

function NotifyUserForm({ selected }: { selected: User | null }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function send() {
    if (!selected || !title.trim()) return;
    setLoading(true);
    try {
      await api.post("/admin/notify", { userId: selected.id, title, body, telegram: true });
      toast.success("أُرسل الإشعار", `${selected.firstName} سيستلمه الآن`);
      setTitle("");
      setBody("");
    } catch (error) {
      toast.error("فشل الإرسال", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
      <Field label="العنوان" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="عنوان قصير" disabled={!selected} />
      <Field label="النص" value={body} onChange={(event) => setBody(event.target.value)} placeholder="تفاصيل الإشعار" disabled={!selected} />
      <Button className="self-end" variant="outline" loading={loading} disabled={!selected || !title.trim()} onClick={send} icon={<Bell className="size-4" />}>
        إرسال
      </Button>
    </div>
  );
}

/* -------------------------------- Economy ------------------------------- */
function EconomyTab() {
  const { data } = useSWR<AdminOverview>("/admin/overview", { refreshInterval: 30_000 });
  const { data: earners } = useSWR<Array<{ userId: number; name: string; earned: number }>>("/admin/top-earners");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AdminSection title="مؤشرات الاقتصاد" subtitle="تحديث كل 30 ثانية">
        {data ? (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="الخزينة" value={data.economy.treasury} tone="gold" />
            <Stat label="المعروض" value={data.economy.totalSupply} tone="green" />
            <Stat label="ضرائب اليوم" value={data.economy.taxes24h} tone="blue" />
            <Stat label="حجم التداول" value={data.economy.volume24h} />
            <Stat label="جولات اليوم" value={data.economy.games24h} />
            <Stat label="رواتب اليوم" value={data.economy.dailyClaims24h} />
            <Stat label="قروض نشطة" value={data.loans.active} tone="red" hint={`${fmt(data.loans.outstanding)} مستحق`} />
            <Stat label="إحالات مدفوعة" value={data.referrals.paid} hint={`${fmt(data.referrals.totalPaidOut)} BTP`} />
          </div>
        ) : (
          <Skeleton className="h-48" />
        )}
      </AdminSection>

      <AdminSection title="أكثر المستفيدين اليوم" subtitle="من النظام (رواتب/أرباح/مكافآت)">
        <ul className="space-y-1.5">
          {(earners ?? []).map((entry, index) => (
            <li key={entry.userId} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <span className="w-4 text-center text-xs text-slate-500">{index + 1}</span>
                <span className="font-bold text-white">{entry.name}</span>
              </span>
              <span className="tabular text-xs font-extrabold text-btp-300">+{fmt(entry.earned)}</span>
            </li>
          ))}
          {(earners ?? []).length === 0 ? <p className="py-6 text-center text-xs text-slate-500">لا بيانات اليوم</p> : null}
        </ul>
      </AdminSection>
    </div>
  );
}

/* -------------------------------- Settings ------------------------------- */
const CATEGORY_LABELS: Record<string, string> = {
  economy: "الاقتصاد",
  daily: "الراتب اليومي",
  tax: "الضرائب",
  games: "الألعاب",
  rob: "السرقة",
  bank: "البنك",
  loans: "القروض",
  shop: "المتجر",
  referral: "الإحالات",
  limits: "الحدود",
  system: "النظام",
};

function SettingsTab() {
  const { data, isLoading, mutate } = useSWR<{ rows: SettingRow[]; values: Record<string, string> }>("/admin/settings");
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();

  const grouped = useMemo(() => {
    const groups: Record<string, SettingRow[]> = {};
    for (const row of data?.rows ?? []) {
      groups[row.category] = groups[row.category] ?? [];
      groups[row.category]!.push(row);
    }
    return groups;
  }, [data]);

  async function save(row: SettingRow) {
    const value = editing[row.key] ?? row.value;
    setSaving(row.key);
    try {
      await api.post("/admin/settings", { key: row.key, value });
      toast.success("تم حفظ الإعداد", `${row.label}: ${value}`);
      await mutate();
      await globalMutate("/config");
      setEditing((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
    } catch (error) {
      toast.error("تعذّر الحفظ", errorMessage(error));
    } finally {
      setSaving(null);
    }
  }

  if (isLoading || !data) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <Settings2 className="size-4 text-btp-300" />
          هذه القيم تُقرأ مباشرة من قاعدة البيانات — أي تعديل يسري فوراً على الموقع والبوت دون إعادة تشغيل.
        </p>
      </Card>

      {Object.entries(grouped).map(([category, rows]) => (
        <AdminSection key={category} title={CATEGORY_LABELS[category] ?? category} subtitle={`${rows.length} إعداد`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const draft = editing[row.key];
              const changed = draft !== undefined && draft !== row.value;
              return (
                <div key={row.key} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-white">{row.label}</p>
                    <code className="text-[9px] text-slate-500">{row.key}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.type === "boolean" ? (
                      <select
                        value={draft ?? row.value}
                        onChange={(event) => setEditing((current) => ({ ...current, [row.key]: event.target.value }))}
                        className="h-9 flex-1 rounded-lg border border-white/10 bg-ink-900/70 px-2 text-xs text-white focus:border-btp-400/60 focus:outline-none"
                      >
                        <option value="true">مفعّل</option>
                        <option value="false">معطّل</option>
                      </select>
                    ) : (
                      <input
                        value={draft ?? row.value}
                        type={row.type === "number" ? "number" : "text"}
                        onChange={(event) => setEditing((current) => ({ ...current, [row.key]: event.target.value }))}
                        className="h-9 flex-1 rounded-lg border border-white/10 bg-ink-900/70 px-2 text-left text-xs text-white focus:border-btp-400/60 focus:outline-none"
                        dir={row.type === "number" ? "ltr" : undefined}
                      />
                    )}
                    <Button size="sm" variant={changed ? "primary" : "subtle"} disabled={!changed} loading={saving === row.key} onClick={() => save(row)}>
                      حفظ
                    </Button>
                  </div>
                  {row.description ? <p className="mt-1 text-[10px] text-slate-500">{row.description}</p> : null}
                </div>
              );
            })}
          </div>
        </AdminSection>
      ))}
    </div>
  );
}

/* ------------------------------ Transactions ----------------------------- */
function TransactionsTab() {
  const [type, setType] = useState("");
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useSWR<{ items: AdminTransaction[]; total: number }>(
    `/admin/transactions?limit=30&offset=${offset}${type ? `&type=${type}` : ""}`,
    { refreshInterval: 20_000 },
  );

  return (
    <AdminSection
      title="سجل المعاملات"
      subtitle={`${fmt(data?.total ?? 0)} معاملة`}
      actions={
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setOffset(0);
          }}
          className="h-9 rounded-lg border border-white/10 bg-ink-900 px-2 text-xs text-white focus:outline-none"
        >
          <option value="">كل الأنواع</option>
          <option value="transfer">تحويل</option>
          <option value="daily">راتب</option>
          <option value="game_win">ربح لعبة</option>
          <option value="game_bet">رهان</option>
          <option value="shop_purchase">متجر</option>
          <option value="bank_deposit">إيداع</option>
          <option value="bank_interest">فائدة</option>
          <option value="redeem">كود</option>
          <option value="admin_credit">منحة إدارية</option>
        </select>
      }
    >
      <AdminTable headers={["#", "النوع", "من", "إلى", "المبلغ", "الضريبة", "المصدر", "الوقت"]} loading={isLoading} empty={(data?.items ?? []).length === 0}>
        {(data?.items ?? []).map((tx) => (
          <tr key={tx.id} className="text-xs">
            <td className="px-2 py-2 text-slate-500">{tx.id}</td>
            <td className="px-2 py-2"><Badge tone="neutral">{tx.type}</Badge></td>
            <td className="px-2 py-2 text-slate-300">{tx.senderName ?? "—"}</td>
            <td className="px-2 py-2 text-slate-300">{tx.recipientName ?? "—"}</td>
            <td className="tabular px-2 py-2 font-bold text-white">{fmt(tx.amount)}</td>
            <td className="tabular px-2 py-2 text-gold-300">{tx.tax ? fmt(tx.tax) : "—"}</td>
            <td className="px-2 py-2 text-slate-500">{tx.source}</td>
            <td className="px-2 py-2 text-slate-500">{timeAgo(tx.createdAt)}</td>
          </tr>
        ))}
      </AdminTable>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>عرض {offset + 1}–{Math.min(offset + 30, data?.total ?? 0)} من {fmt(data?.total ?? 0)}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 30))}>السابق</Button>
          <Button size="sm" variant="ghost" disabled={offset + 30 >= (data?.total ?? 0)} onClick={() => setOffset((current) => current + 30)}>التالي</Button>
        </div>
      </div>
    </AdminSection>
  );
}

/* --------------------------------- Codes -------------------------------- */
function CodesTab() {
  const { data, isLoading, mutate } = useSWR<RedeemCodeItem[]>("/admin/codes");
  const [amount, setAmount] = useState("500");
  const [maxUses, setMaxUses] = useState("1");
  const [perUser, setPerUser] = useState("1");
  const [hours, setHours] = useState("");
  const [custom, setCustom] = useState("");
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  async function create() {
    setCreating(true);
    try {
      const result = await api.post<RedeemCodeItem>("/admin/codes", {
        amount: Number.parseInt(amount, 10),
        maxUses: Number.parseInt(maxUses, 10) || 1,
        perUser: Number.parseInt(perUser, 10) || 1,
        expiresInHours: hours ? Number.parseInt(hours, 10) : undefined,
        code: custom.trim() || undefined,
      });
      toast.success("تم إنشاء الكود", `${result.code} — ${fmt(result.amount)} BTP`);
      setCustom("");
      await mutate();
    } catch (error) {
      toast.error("تعذّر إنشاء الكود", errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function disable(code: string) {
    try {
      await api.post("/admin/codes/disable", { code });
      toast.info("تم تعطيل الكود", code);
      await mutate();
    } catch (error) {
      toast.error("فشل التعطيل", errorMessage(error));
    }
  }

  return (
    <div className="space-y-4">
      <AdminSection title="إنشاء كود هدية" subtitle="كود قابل للاسترداد عبر /redeem أو صفحة المحفظة">
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="القيمة" type="number" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))} suffix="BTP" />
          <Field label="استخدامات" type="number" value={maxUses} onChange={(event) => setMaxUses(event.target.value.replace(/[^\d]/g, ""))} />
          <Field label="لكل مستخدم" type="number" value={perUser} onChange={(event) => setPerUser(event.target.value.replace(/[^\d]/g, ""))} />
          <Field label="صلاحية (ساعة)" type="number" value={hours} onChange={(event) => setHours(event.target.value.replace(/[^\d]/g, ""))} placeholder="∞" />
          <Field label="كود مخصص" value={custom} onChange={(event) => setCustom(event.target.value.toUpperCase())} placeholder="تلقائي" />
        </div>
        <Button className="mt-3" onClick={create} loading={creating} disabled={!Number.parseInt(amount, 10)} icon={<Ticket className="size-4" />}>
          إنشاء الكود
        </Button>
      </AdminSection>

      <AdminSection title="الأكواد" subtitle={`${(data ?? []).length} كود`}>
        <AdminTable headers={["الكود", "القيمة", "الاستخدام", "لكل مستخدم", "الانتهاء", "إجراء"]} loading={isLoading} empty={(data ?? []).length === 0}>
          {(data ?? []).map((code) => {
            const expired = code.expiresAt ? new Date(code.expiresAt).getTime() <= Date.now() : false;
            return (
              <tr key={code.code} className="text-xs">
                <td className="px-2 py-2"><code className="font-bold text-btp-300">{code.code}</code></td>
                <td className="tabular px-2 py-2 text-white">{fmt(code.amount)}</td>
                <td className="px-2 py-2 text-slate-300">{code.uses} / {code.maxUses}</td>
                <td className="px-2 py-2 text-slate-400">{code.perUser}</td>
                <td className="px-2 py-2 text-slate-500">{code.expiresAt ? dateAr(code.expiresAt) : "∞"}</td>
                <td className="px-2 py-2">
                  <button type="button" onClick={() => disable(code.code)} disabled={expired || code.uses >= code.maxUses} className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300 disabled:opacity-30">
                    {expired ? "منتهي" : "تعطيل"}
                  </button>
                </td>
              </tr>
            );
          })}
        </AdminTable>
      </AdminSection>
    </div>
  );
}

/* --------------------------------- Shop --------------------------------- */
function ShopTab() {
  const { data, isLoading, mutate } = useSWR<ShopItem[]>("/admin/shop");
  const [form, setForm] = useState({ code: "", name: "", price: "1000", kind: "title", icon: "🎁", description: "" });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function save() {
    setSaving(true);
    try {
      await api.post("/admin/shop", {
        code: form.code.trim().toLowerCase(),
        name: form.name.trim(),
        price: Number.parseInt(form.price, 10) || 0,
        kind: form.kind,
        icon: form.icon || "🎁",
        description: form.description,
      });
      toast.success("تم الحفظ", "العنصر جاهز في المتجر");
      setForm({ code: "", name: "", price: "1000", kind: "title", icon: "🎁", description: "" });
      await mutate();
    } catch (error) {
      toast.error("تعذّر الحفظ", errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminSection title="إضافة / تعديل عنصر" subtitle="كود فريد، سعر صحيح، ونوع صالح">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="الكود" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="title_vip" />
          <Field label="الاسم" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="لقب VIP" />
          <Field label="السعر" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value.replace(/[^\d]/g, "") })} suffix="BTP" />
          <Field label="الأيقونة" value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })} maxLength={4} />
          <div>
            <label className="mb-1.5 block text-xs font-bold text-slate-300">النوع</label>
            <select
              value={form.kind}
              onChange={(event) => setForm({ ...form, kind: event.target.value })}
              className="h-11 w-full rounded-xl border border-white/10 bg-ink-900/70 px-3 text-sm text-white focus:outline-none"
            >
              <option value="title">لقب</option>
              <option value="boost">مضاعف راتب</option>
              <option value="shield">درع حماية</option>
              <option value="badge">شارة</option>
            </select>
          </div>
          <Field label="الوصف" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </div>
        <Button className="mt-3" onClick={save} loading={saving} disabled={!form.code || !form.name} icon={<Wallet className="size-4" />}>
          حفظ العنصر
        </Button>
      </AdminSection>

      <AdminSection title="عناصر المتجر" subtitle={`${(data ?? []).length} عنصر`}>
        <AdminTable headers={["العنصر", "الكود", "السعر", "النوع", "المخزون", "الحالة"]} loading={isLoading} empty={(data ?? []).length === 0}>
          {(data ?? []).map((item) => (
            <tr key={item.code} className="text-xs">
              <td className="px-2 py-2 font-bold text-white">{item.icon} {item.name}</td>
              <td className="px-2 py-2"><code className="text-slate-400">{item.code}</code></td>
              <td className="tabular px-2 py-2 text-gold-300">{fmt(item.price)}</td>
              <td className="px-2 py-2 text-slate-400">{item.kind}</td>
              <td className="px-2 py-2 text-slate-400">{item.stock ?? "∞"}</td>
              <td className="px-2 py-2">{item.isActive ? <Badge tone="green">مفعّل</Badge> : <Badge tone="red">معطّل</Badge>}</td>
            </tr>
          ))}
        </AdminTable>
      </AdminSection>
    </div>
  );
}

/* --------------------------------- Audit -------------------------------- */
function AuditTab() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useSWR<{ items: AuditLogItem[]; total: number }>(`/admin/audit?limit=40&offset=${offset}`);
  return (
    <AdminSection title="سجل التدقيق" subtitle={`${fmt(data?.total ?? 0)} إجراء إداري`}>
      <AdminTable headers={["#", "الفاعل", "الإجراء", "الهدف", "التفاصيل", "IP", "الوقت"]} loading={isLoading} empty={(data?.items ?? []).length === 0}>
        {(data?.items ?? []).map((log) => (
          <tr key={log.id} className="text-xs">
            <td className="px-2 py-2 text-slate-600">{log.id}</td>
            <td className="px-2 py-2 text-slate-300">{log.actorLabel || "—"}</td>
            <td className="px-2 py-2"><Badge tone="blue">{log.action}</Badge></td>
            <td className="px-2 py-2 text-slate-400">{log.targetType ?? "—"}{log.targetId ? ` #${log.targetId}` : ""}</td>
            <td className="max-w-[16rem] truncate px-2 py-2 text-slate-500">{JSON.stringify(log.details).slice(0, 80)}</td>
            <td className="px-2 py-2 text-slate-600">{log.ip ?? "—"}</td>
            <td className="px-2 py-2 text-slate-500">{timeAgo(log.createdAt)}</td>
          </tr>
        ))}
      </AdminTable>
      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <span>عرض {offset + 1}–{Math.min(offset + 40, data?.total ?? 0)}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - 40))}>السابق</Button>
          <Button size="sm" variant="ghost" disabled={offset + 40 >= (data?.total ?? 0)} onClick={() => setOffset((current) => current + 40)}>التالي</Button>
        </div>
      </div>
    </AdminSection>
  );
}

/* -------------------------------- System -------------------------------- */
function SystemTab() {
  const { data: overview, mutate: mutateOverview } = useSWR<AdminOverview>("/admin/overview");
  const { data: backups, mutate: mutateBackups } = useSWR<Array<{ file: string; bytes: number; createdAt: string }>>("/admin/backups");
  const { data: groups } = useSWR<GroupSettingsItem[]>("/admin/groups");
  const [broadcast, setBroadcast] = useState({ title: "", body: "", telegram: true });
  const [broadcasting, setBroadcasting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const toast = useToast();

  async function runBackup() {
    setBackingUp(true);
    try {
      const result = await api.post<{ ok: boolean; file?: string; bytes?: number }>("/admin/backup");
      toast.success("اكتملت النسخة الاحتياطية", result.file ?? "");
      await mutateBackups();
      await mutateOverview();
    } catch (error) {
      toast.error("فشل النسخ", errorMessage(error));
    } finally {
      setBackingUp(false);
    }
  }

  async function sendBroadcast() {
    if (!broadcast.title.trim()) return;
    setBroadcasting(true);
    try {
      const result = await api.post<{ count: number }>("/admin/broadcast", broadcast);
      toast.success("تم البث", `وصل إلى ${result.count} مستخدم`);
      setBroadcast({ title: "", body: "", telegram: true });
    } catch (error) {
      toast.error("فشل البث", errorMessage(error));
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSection title="البث الجماعي" subtitle="إشعار داخلي + رسالة تلجرام لكل المستخدمين">
          <div className="space-y-3">
            <Field label="العنوان" value={broadcast.title} onChange={(event) => setBroadcast({ ...broadcast, title: event.target.value })} placeholder="📢 إعلان مهم" />
            <div>
              <label className="mb-1.5 block text-xs font-bold text-slate-300">النص</label>
              <textarea
                value={broadcast.body}
                onChange={(event) => setBroadcast({ ...broadcast, body: event.target.value })}
                rows={4}
                maxLength={2000}
                className="w-full rounded-xl border border-white/10 bg-ink-900/70 p-3 text-sm text-white placeholder:text-slate-500 focus:border-btp-400/60 focus:outline-none"
                placeholder="تفاصيل الرسالة…"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={broadcast.telegram} onChange={(event) => setBroadcast({ ...broadcast, telegram: event.target.checked })} className="size-4 accent-emerald-400" />
              إرسال أيضاً عبر تلجرام
            </label>
            <Button onClick={sendBroadcast} loading={broadcasting} disabled={!broadcast.title.trim()} className="w-full" icon={<MessageSquare className="size-4" />}>
              إرسال البث
            </Button>
          </div>
        </AdminSection>

        <BotDiagnostics />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSection
          title="النسخ الاحتياطي"
          subtitle="تلقائي كل 6 ساعات (قابل للضبط في .env)"
          actions={<Button size="sm" variant="gold" loading={backingUp} onClick={runBackup} icon={<Download className="size-3.5" />}>نسخة الآن</Button>}
        >
          <AdminTable headers={["الملف", "الحجم", "التاريخ"]} empty={(backups ?? []).length === 0}>
            {(backups ?? []).map((backup) => (
              <tr key={backup.file} className="text-xs">
                <td className="max-w-[16rem] truncate px-2 py-2 font-mono text-slate-300">{backup.file}</td>
                <td className="tabular px-2 py-2 text-slate-400">{(backup.bytes / 1024).toFixed(1)} KB</td>
                <td className="px-2 py-2 text-slate-500">{dateAr(backup.createdAt)}</td>
              </tr>
            ))}
          </AdminTable>
        </AdminSection>

        <AdminSection title="القروبات" subtitle="إعدادات البوت داخل كل قروب">
          <AdminTable headers={["القروب", "Chat ID", "مفعّل", "ألعاب", "اقتصاد", "حدود الرهان"]} empty={(groups ?? []).length === 0}>
            {(groups ?? []).map((group) => (
              <tr key={group.chatId} className="text-xs">
                <td className="max-w-[10rem] truncate px-2 py-2 font-bold text-white">{group.title ?? "بدون اسم"}</td>
                <td className="px-2 py-2 font-mono text-slate-500">{group.chatId}</td>
                <td className="px-2 py-2">{group.enabled ? "✅" : "❌"}</td>
                <td className="px-2 py-2">{group.gamesEnabled ? "✅" : "❌"}</td>
                <td className="px-2 py-2">{group.economyEnabled ? "✅" : "❌"}</td>
                <td className="px-2 py-2 text-slate-400">{group.minBet ?? "عام"}–{group.maxBet ?? "عام"}</td>
              </tr>
            ))}
          </AdminTable>
        </AdminSection>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: Radio, title: "Webhook", text: "مسار /api/telegram/webhook محمي بسر مزدوج." },
          { icon: Database, title: "النسخ", text: "pg_dump للإنتاج وتصدير SQL لـ PGlite." },
          { icon: Hash, title: "التدقيق", text: "كل إجراء إداري مسجَّل مع IP والتفاصيل." },
          { icon: CheckCircle2, title: "السلامة", text: "أرصدة BIGINT، معاملات ذرّية، ولا أرصدة سالبة." },
        ].map((card) => (
          <Card key={card.title} className="p-4">
            <card.icon className="size-5 text-btp-300" />
            <p className="mt-2 text-sm font-extrabold text-white">{card.title}</p>
            <p className="mt-1 text-[11px] text-slate-400">{card.text}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Page -------------------------------- */
function AdminContent() {
  const [tab, setTab] = useState<Tab>("overview");
  const { user } = useAuth();
  const { symbol } = useConfig();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-white">
            <Shield className="size-6 text-gold-300" /> لوحة الإدارة
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            مرحباً {user?.firstName} · عملة {symbol} · كل التعديلات مسجّلة في سجل التدقيق
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="gold"><Shield className="size-3" /> صلاحيات كاملة</Badge>
          <Badge tone="green"><CheckCircle2 className="size-3" /> متصل</Badge>
        </div>
      </div>

      <div className="no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-xl border border-white/5 bg-white/[0.02] p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition ${
              tab === item.key ? "bg-gold-500/15 text-gold-300" : "text-slate-400 hover:text-white"
            }`}
          >
            <item.icon className="size-3.5" /> {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab /> : null}
      {tab === "users" ? <UsersTab /> : null}
      {tab === "economy" ? <EconomyTab /> : null}
      {tab === "settings" ? <SettingsTab /> : null}
      {tab === "transactions" ? <TransactionsTab /> : null}
      {tab === "codes" ? <CodesTab /> : null}
      {tab === "shop" ? <ShopTab /> : null}
      {tab === "audit" ? <AuditTab /> : null}
      {tab === "system" ? <SystemTab /> : null}
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth admin>
      <AdminContent />
    </RequireAuth>
  );
}
