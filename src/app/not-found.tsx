import Link from "next/link";
import { Compass, Gamepad2, Home, Trophy } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 rounded-full bg-btp-500/15 blur-2xl" aria-hidden="true" />
        <div className="relative flex size-20 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.03]">
          <Compass className="size-9 text-btp-300" />
        </div>
      </div>

      <p className="text-5xl font-black tracking-tighter text-white">
        4<span className="gradient-text">0</span>4
      </p>
      <h1 className="mt-2 text-lg font-extrabold text-white">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
        الرابط الذي طلبته غير صالح أو تم نقله. جرّب أحد الأقسام التالية.
      </p>

      <div className="mt-6 grid w-full max-w-sm gap-2 sm:grid-cols-3">
        {[
          { href: "/", label: "الرئيسية", icon: Home },
          { href: "/games", label: "الألعاب", icon: Gamepad2 },
          { href: "/leaderboard", label: "المتصدرون", icon: Trophy },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs font-bold text-slate-300 transition hover:border-btp-400/30 hover:text-btp-300"
          >
            <item.icon className="size-3.5" /> {item.label}
          </Link>
        ))}
      </div>

      <p className="mt-6 text-[11px] text-slate-600">
        أو استخدم <code className="text-slate-400">/start</code> في بوت تلجرام للوصول السريع.
      </p>
    </div>
  );
}
