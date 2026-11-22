"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("خطأ في الواجهة:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-pulse-ring rounded-full bg-red-500/20 blur-xl" aria-hidden="true" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl border border-red-400/25 bg-red-500/10">
          <AlertTriangle className="size-9 text-red-300" />
        </div>
      </div>

      <h1 className="text-2xl font-black text-white">حدث خطأ غير متوقع</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
        تعذّر إكمال العملية. جرّب إعادة المحاولة، وإن استمرت المشكلة فحدّث الصفحة أو تواصل مع الدعم عبر البوت.
      </p>

      {error.digest ? (
        <code className="mt-3 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-500" dir="ltr">
          {error.digest}
        </code>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-btp-400 to-btp-600 px-5 text-sm font-bold text-ink-950 transition hover:brightness-110"
        >
          <RotateCcw className="size-4" /> إعادة المحاولة
        </button>
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 text-sm font-bold text-slate-200 transition hover:bg-white/10"
        >
          <Home className="size-4" /> الرئيسية
        </Link>
      </div>
    </div>
  );
}
