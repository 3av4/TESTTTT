"use client";

/**
 * تسجيل الدخول عبر Telegram Login Widget — بدون أي مكتبة خارجية.
 * يعرض زراً أنيقاً يفتح نافذة تلجرام (oauth.telegram.org)، ويعالج
 * callback المسماة onTelegramAuth ثم يرسل البيانات للتحقق على السيرفر.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Bot, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { errorMessage } from "@/lib/api";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    onBtpTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

interface TelegramLoginProps {
  botUsername: string | null;
  size?: "large" | "medium";
  onSuccess?: () => void;
}

export function TelegramLogin({ botUsername, size = "large", onSuccess }: TelegramLoginProps) {
  const { loginWithTelegram } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [origin, setOrigin] = useState("");
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const handleAuth = useCallback(
    async (payload: Record<string, unknown>) => {
      setLoading(true);
      try {
        const user = await loginWithTelegram(payload);
        toast.success(`أهلاً ${user.firstName} 👋`, "تم تسجيل الدخول بحسابك الموحّد");
        onSuccess?.();
        router.push("/dashboard");
      } catch (error) {
        toast.error("تعذّر تسجيل الدخول", errorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [loginWithTelegram, onSuccess, router, toast],
  );

  useEffect(() => {
    window.onBtpTelegramAuth = (user) => {
      void handleAuth(user);
    };
    return () => {
      delete window.onBtpTelegramAuth;
    };
  }, [handleAuth]);

  // بعد تحميل سكربت تلجرام نطلب منه إعادة رسم الودجت
  useEffect(() => {
    if (!ready || !botUsername || !containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", size);
    script.setAttribute("data-radius", "12");
    script.setAttribute("data-userpic", "true");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onBtpTelegramAuth(user)");
    container.appendChild(script);
  }, [ready, botUsername, size]);

  return (
    <div className="w-full">
      <Script
        src="https://telegram.org/js/telegram-widget.js?22"
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
      />

      {botUsername ? (
        <>
          <div ref={containerRef} className="flex min-h-[52px] items-center justify-center" />
          {loading ? (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm font-bold text-btp-300">
              <Loader2 className="size-4 animate-spin" /> جارٍ التحقق من تلجرام…
            </div>
          ) : null}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500">
            <ShieldCheck className="size-3.5" /> يتم التحقق من التوقيع مشفّراً على السيرفر — لا نشارك بياناتك.
          </p>
          <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
            <p className="text-[11px] leading-relaxed text-slate-500">
              إن لم يظهر الزر، تأكد أن دومين الموقع مضبوط في BotFather (<code className="text-slate-400">/setdomain</code>).
              <br />
              الدومين الحالي: <code className="text-btp-300/80">{origin || "…"}</code>
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-center">
          <Bot className="mx-auto mb-2 size-6 text-amber-300" />
          <p className="text-sm font-bold text-amber-200">لم يُضبط اسم البوت على الخادم</p>
          <p className="mt-1 text-[11px] text-slate-400">
            أضف <code>BOT_USERNAME</code> و<code>BOT_TOKEN</code> في ملف .env ثم أعد تشغيل الخادم.
          </p>
        </div>
      )}
    </div>
  );
}
