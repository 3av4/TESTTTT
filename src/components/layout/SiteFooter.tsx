import Link from "next/link";
import { CoinMark } from "@/components/ui/Logo";
import { ShieldCheck, Zap, Globe2 } from "lucide-react";

const LINKS = [
  { href: "/dashboard", label: "لوحة المستخدم" },
  { href: "/games", label: "الألعاب" },
  { href: "/shop", label: "المتجر" },
  { href: "/leaderboard", label: "المتصدرون" },
  { href: "/referral", label: "الإحالات" },
];

const LEGAL = [
  { href: "/legal/terms", label: "الشروط والأحكام" },
  { href: "/legal/privacy", label: "الخصوصية" },
  { href: "/legal/fairness", label: "عدالة الألعاب" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/5 bg-ink-950/60">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              <CoinMark size={38} />
              <div>
                <p className="text-lg font-extrabold text-white">
                  Bit<span className="gradient-text">Poin</span>
                </p>
                <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-500">BTP · Community Coin</p>
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
              عملة رقمية مجتمعية متكاملة: راتب يومي، ألعاب ومراهنات، بنك بفائدة، متجر ألقاب، ونظام إحالات —
              بحساب واحد يعمل في الموقع وبوت تلجرام على نفس قاعدة البيانات.
            </p>
            <div className="mt-5 flex flex-wrap gap-3 text-[11px] font-bold text-slate-400">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <ShieldCheck className="size-3.5 text-btp-400" /> معاملات ذرّية ومُدقَّقة
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <Zap className="size-3.5 text-gold-400" /> تحديث لحظي WebSocket
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                <Globe2 className="size-3.5 text-sky-400" /> عربي · RTL · متجاوب
              </span>
            </div>
          </div>

          <div>
            <p className="mb-4 text-sm font-extrabold text-white">المنصة</p>
            <ul className="space-y-2.5">
              {LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400 transition hover:text-btp-300">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-4 text-sm font-extrabold text-white">المعلومات</p>
            <ul className="space-y-2.5">
              {LEGAL.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400 transition hover:text-btp-300">
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href="https://t.me/BitPoinBot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-400 transition hover:text-btp-300"
                >
                  بوت تلجرام
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-white/5 pt-6 text-center sm:flex-row sm:text-start">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} BitPoin — جميع الحقوق محفوظة.</p>
          <p className="text-[11px] text-slate-600">
            BitPoin عملة مجتمعية للترفيه والمكافآت، ولا تمثل استثماراً مالياً أو عملة قانونية.
          </p>
        </div>
      </div>
    </footer>
  );
}
