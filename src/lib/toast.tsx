"use client";

/**
 * نظام إشعارات Toast خفيف (بدون مكتبات خارجية) — للنجاح والأخطاء وأحداث البث اللحظي.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type NotificationKind = "info" | "success" | "warning" | "danger" | "gift";

export interface ToastItem {
  id: number;
  title: string;
  body?: string;
  kind: NotificationKind;
}

interface ToastContextValue {
  toast: (title: string, options?: { body?: string; kind?: NotificationKind }) => void;
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<NotificationKind, string> = {
  info: "ℹ️",
  success: "✅",
  warning: "⚠️",
  danger: "🚨",
  gift: "🎁",
};

const TONES: Record<NotificationKind, string> = {
  info: "border-sky-400/30 bg-sky-500/10",
  success: "border-btp-400/40 bg-btp-500/10",
  warning: "border-amber-400/40 bg-amber-500/10",
  danger: "border-red-400/40 bg-red-500/10",
  gift: "border-gold-400/40 bg-gold-500/10",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (title: string, options?: { body?: string; kind?: NotificationKind }) => {
      const id = ++counter.current;
      const item: ToastItem = { id, title, body: options?.body, kind: options?.kind ?? "info" };
      setToasts((current) => [...current.slice(-3), item]);
      setTimeout(() => dismiss(id), 5200);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, body) => toast(title, { body, kind: "success" }),
      error: (title, body) => toast(title, { body, kind: "danger" }),
      info: (title, body) => toast(title, { body, kind: "info" }),
      dismiss,
    }),
    [toast, dismiss],
  );

  // ربط أحداث البث اللحظي/الصفحة بالـ Toast
  useEffect(() => {
    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ title: string; body: string; kind: NotificationKind }>).detail;
      if (detail?.title) toast(detail.title, { body: detail.body, kind: detail.kind ?? "info" });
    };
    const onBalance = (event: Event) => {
      const detail = (event as CustomEvent<{ change: number; reason: string }>).detail;
      if (!detail || detail.change === 0) return;
      const sign = detail.change > 0 ? "+" : "";
      toast(`${sign}${detail.change.toLocaleString("en-US")} BTP`, { kind: detail.change > 0 ? "success" : "warning" });
    };
    window.addEventListener("btp:notification", onNotification);
    window.addEventListener("btp:balance", onBalance);
    return () => {
      window.removeEventListener("btp:notification", onNotification);
      window.removeEventListener("btp:balance", onBalance);
    };
  }, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-2 sm:left-6 sm:translate-x-0"
        role="status"
        aria-live="polite"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto animate-rise rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl ${TONES[item.kind]}`}
            onClick={() => dismiss(item.id)}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg leading-none">{ICONS[item.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{item.title}</p>
                {item.body ? <p className="mt-0.5 line-clamp-2 text-xs text-slate-300">{item.body}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
