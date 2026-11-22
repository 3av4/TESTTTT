"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, Gamepad2, LayoutDashboard, LogOut, Menu, Shield, ShoppingBag, Trophy, Users, Wallet, X } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Avatar, LinkButton, Badge } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { useRealtime } from "@/lib/realtime";
import { useToast } from "@/lib/toast";
import { api, fmt } from "@/lib/api";
import useSWR from "swr";
import type { NotificationItem } from "@/lib/types";

const NAV = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard },
  { href: "/dashboard", label: "لوحتي", icon: Wallet },
  { href: "/games", label: "الألعاب", icon: Gamepad2 },
  { href: "/shop", label: "المتجر", icon: ShoppingBag },
  { href: "/leaderboard", label: "المتصدرون", icon: Trophy },
  { href: "/referral", label: "الإحالات", icon: Users },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { user, isAdmin, loading, logout } = useAuth();
  const { connected } = useRealtime();
  const [open, setOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data } = useSWR<{ items: NotificationItem[]; unread: number }>(user ? "/user/notifications" : null, {
    refreshInterval: 60_000,
  });
  const toast = useToast();

  useEffect(() => {
    setOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

  const unread = data?.unread ?? 0;

  async function markAllRead() {
    try {
      await api.post("/user/notifications/read", {});
      toast.success("تم تعليم كل الإشعارات كمقروءة");
    } catch {
      // تجاهل
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo compact />
          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                    active ? "bg-white/[0.08] text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {isAdmin ? (
              <Link
                href="/admin"
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                  pathname.startsWith("/admin") ? "bg-gold-500/15 text-gold-300" : "text-gold-400/80 hover:bg-gold-500/10 hover:text-gold-300"
                }`}
              >
                <Shield className="size-4" /> الأدمن
              </Link>
            ) : null}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${
              connected ? "border-btp-400/30 bg-btp-500/10 text-btp-300" : "border-white/10 bg-white/5 text-slate-400"
            }`}
            title={connected ? "متصل لحظياً" : "غير متصل"}
          >
            <span className={`size-1.5 rounded-full ${connected ? "bg-btp-400 animate-pulse" : "bg-slate-500"}`} />
            {connected ? "لحظي" : "غير متصل"}
          </span>

          {user ? (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen((value) => !value)}
                  className="relative flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
                  aria-label="الإشعارات"
                >
                  <Bell className="size-4.5" />
                  {unread > 0 ? (
                    <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </button>
                {notificationsOpen ? (
                  <div className="absolute end-0 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-ink-850 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                      <p className="text-sm font-bold text-white">الإشعارات</p>
                      {unread > 0 ? (
                        <button type="button" onClick={markAllRead} className="text-[11px] font-bold text-btp-300 hover:text-btp-200">
                          تعليم الكل كمقروء
                        </button>
                      ) : null}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {(data?.items ?? []).length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-slate-500">لا إشعارات بعد</p>
                      ) : (
                        (data?.items ?? []).slice(0, 12).map((item) => (
                          <div
                            key={item.id}
                            className={`border-b border-white/5 px-4 py-3 text-sm ${item.isRead ? "opacity-60" : ""}`}
                          >
                            <p className="font-bold text-white">{item.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{item.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <Link
                href="/dashboard"
                className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 transition hover:bg-white/10"
              >
                <Avatar src={user.photoUrl} name={user.firstName} size={30} />
                <span className="hidden text-start sm:block">
                  <span className="block max-w-[9rem] truncate text-xs font-bold text-white">{user.firstName}</span>
                  <span className="tabular block text-[10px] font-semibold text-gold-300">{fmt(user.balance)} BTP</span>
                </span>
              </Link>

              <button
                type="button"
                onClick={logout}
                className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-red-500/10 hover:text-red-300"
                aria-label="تسجيل الخروج"
              >
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <LinkButton href="/login" variant="primary" size="sm">
                دخول بتلجرام
              </LinkButton>
            </div>
          )}

          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 lg:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="القائمة"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-white/5 bg-ink-900/95 px-4 py-3 lg:hidden">
          <nav className="grid grid-cols-2 gap-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold ${
                  pathname.startsWith(item.href) ? "bg-btp-500/10 text-btp-300" : "bg-white/5 text-slate-300"
                }`}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
            {isAdmin ? (
              <Link href="/admin" className="flex items-center gap-2 rounded-xl bg-gold-500/10 px-3 py-2.5 text-sm font-bold text-gold-300">
                <Shield className="size-4" /> لوحة الأدمن
              </Link>
            ) : null}
          </nav>
          {!user ? (
            <div className="mt-3">
              <LinkButton href="/login" size="md" className="w-full">
                تسجيل الدخول عبر تلجرام
              </LinkButton>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <Avatar src={user.photoUrl} name={user.firstName} size={28} />
                <div>
                  <p className="text-xs font-bold text-white">{user.firstName}</p>
                  <p className="tabular text-[10px] text-gold-300">{fmt(user.balance)} BTP</p>
                </div>
              </div>
              <Badge tone="green">متصل</Badge>
            </div>
          )}
        </div>
      ) : null}

      {loading && !user ? <div className="h-0.5 w-full animate-pulse bg-btp-500/40" /> : null}
    </header>
  );
}
