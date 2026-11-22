"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Bot, KeyRound, Loader2, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { Card, Button, Field, Badge, FeaturePill, Skeleton } from "@/components/ui/primitives";
import { CoinMark } from "@/components/ui/Logo";
import { TelegramLogin } from "@/components/auth/TelegramLogin";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";

interface AuthConfig {
  botUsername: string | null;
  telegramLoginEnabled: boolean;
  adminPasswordLoginEnabled: boolean;
  demoMode: boolean;
  environment: string;
  appUrl: string;
}

export default function LoginPage() {
  const { data: config, isLoading } = useSWR<AuthConfig>("/auth/config", { revalidateOnFocus: false });
  const { user, loginAsAdmin, refresh } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [mode, setMode] = useState<"telegram" | "admin">("telegram");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState<"user" | "admin" | null>(null);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  async function handleAdminLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!password) return;
    setLoading(true);
    try {
      await loginAsAdmin(password);
      toast.success("مرحباً أيها المدير", "تم تسجيل الدخول بصلاحيات الإدارة");
      router.push("/admin");
    } catch (error) {
      toast.error("فشل تسجيل الدخول", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo(kind: "user" | "admin") {
    setDemoLoading(kind);
    try {
      const result = await api.post<{ user: { firstName: string } }>("/auth/demo-login", { kind });
      await refresh();
      toast.success(`أهلاً ${result.user.firstName}`, kind === "admin" ? "دخول تجريبي كمدير" : "دخول تجريبي كلاعب");
      router.push(kind === "admin" ? "/admin" : "/dashboard");
    } catch (error) {
      toast.error("تعذّر الدخول التجريبي", errorMessage(error));
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden="true" />

      <div className="relative grid w-full items-center gap-10 lg:grid-cols-2">
        {/* الجانب الترويجي */}
        <div className="hidden lg:block">
          <div className="flex items-center gap-3">
            <CoinMark size={52} />
            <div>
              <p className="text-2xl font-black text-white">
                Bit<span className="gradient-text">Poin</span>
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.34em] text-slate-500">Decentralized Community Coin</p>
            </div>
          </div>
          <h1 className="mt-8 text-4xl font-black leading-tight text-white">
            حساب واحد.
            <br />
            موقع وبوت.
            <br />
            <span className="gradient-text">رصيد واحد.</span>
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            سجّل الدخول بتلجرام مرة واحدة، وستجد نفس محفظتك في الموقع وبوت تلجرام. أي عملية تنفّذها هنا تظهر هناك فوراً.
          </p>

          <div className="mt-8 space-y-3">
            {[
              { icon: ShieldCheck, title: "تحقق تشفيري", text: "Hmac-SHA256 على بيانات تلجرام — لا كلمات مرور ولا حسابات وهمية." },
              { icon: Sparkles, title: "رصيد ترحيبي فوري", text: "1000 BTP تلقائياً لحسابك الجديد." },
              { icon: Bot, title: "إشعارات لحظية", text: "كل عملية من الموقع تصل رسالة في البوت والعكس." },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-btp-500/10 text-btp-300">
                  <item.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{item.title}</p>
                  <p className="text-xs text-slate-400">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* بطاقة الدخول */}
        <Card strong className="animate-rise p-6 sm:p-8">
          <div className="mb-6 text-center lg:text-start">
            <div className="mb-3 flex justify-center lg:hidden">
              <CoinMark size={44} />
            </div>
            <h2 className="text-2xl font-black text-white">تسجيل الدخول</h2>
            <p className="mt-1 text-sm text-slate-400">ادخل إلى محفظتك ومكافآتك في ثوانٍ</p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-ink-900/80 p-1">
            <button
              type="button"
              onClick={() => setMode("telegram")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                mode === "telegram" ? "bg-btp-500/15 text-btp-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Bot className="size-3.5" /> تلجرام
            </button>
            <button
              type="button"
              onClick={() => setMode("admin")}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
                mode === "admin" ? "bg-gold-500/15 text-gold-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <KeyRound className="size-3.5" /> مدير
            </button>
          </div>

          {mode === "telegram" ? (
            isLoading ? (
              <Skeleton className="h-32" />
            ) : (
              <TelegramLogin botUsername={config?.botUsername ?? null} />
            )
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <Badge tone="gold">دخول احتياطي — للمديرين فقط</Badge>
              <Field
                label="كلمة مرور المدير"
                type="password"
                placeholder="••••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                hint={config?.adminPasswordLoginEnabled ? "تُضبط عبر ADMIN_PASSWORD في .env" : "الدخول الاحتياطي معطّل على هذا الخادم"}
                disabled={!config?.adminPasswordLoginEnabled}
                autoComplete="current-password"
              />
              <Button
                type="submit"
                variant="gold"
                className="w-full"
                loading={loading}
                disabled={!config?.adminPasswordLoginEnabled || !password}
                icon={<KeyRound className="size-4" />}
              >
                دخول لوحة الإدارة
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                يتطلب وجود حساب مدير مسجّل مسبقاً عبر البوت (أرسل /start إلى البوت من حسابك المدرج في ADMIN_IDS).
              </p>
            </form>
          )}

          {config?.demoMode ? (
            <div className="mt-6 rounded-xl border border-dashed border-gold-400/30 bg-gold-500/[0.04] p-3">
              <div className="mb-2 flex items-center justify-between">
                <FeaturePill>
                  <Sparkles className="size-3" /> وضع العرض التجريبي
                </FeaturePill>
                <span className="text-[10px] text-slate-500">معطّل في الإنتاج</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  loading={demoLoading === "user"}
                  onClick={() => handleDemo("user")}
                  icon={<UserRound className="size-3.5" />}
                >
                  دخول كلاعب
                </Button>
                <Button
                  type="button"
                  variant="subtle"
                  size="sm"
                  loading={demoLoading === "admin"}
                  onClick={() => handleDemo("admin")}
                  icon={<ShieldCheck className="size-3.5" />}
                >
                  دخول كمدير
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-slate-500">
            <a href="/legal/terms" className="hover:text-slate-300">الشروط</a>
            <span>·</span>
            <a href="/legal/privacy" className="hover:text-slate-300">الخصوصية</a>
            <span>·</span>
            <a href="/legal/fairness" className="hover:text-slate-300">العدالة</a>
          </div>
        </Card>
      </div>

      {isLoading ? (
        <div className="fixed bottom-4 start-4 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="size-3 animate-spin" /> تحميل إعدادات الدخول…
        </div>
      ) : null}
    </div>
  );
}
