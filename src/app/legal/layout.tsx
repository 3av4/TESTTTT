import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

const LINKS = [
  { href: "/legal/terms", label: "الشروط والأحكام" },
  { href: "/legal/privacy", label: "سياسة الخصوصية" },
  { href: "/legal/fairness", label: "عدالة الألعاب" },
];

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-btp-300">
          <ArrowLeft className="size-3.5" /> العودة للرئيسية
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-400">
          <FileText className="size-3" /> وثائق قانونية رسمية
        </span>
      </div>

      <div className="no-scrollbar mb-6 flex gap-1.5 overflow-x-auto rounded-xl border border-white/5 bg-white/[0.02] p-1">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <article className="legal-prose space-y-6 rounded-2xl border border-white/5 bg-white/[0.015] p-5 leading-relaxed sm:p-8">
        {children}
      </article>

      <p className="mt-6 text-center text-[10px] text-slate-600">
        آخر تحديث: نوفمبر 2026 · BitPoin (BTP) — عملة مجتمعية داخلية بلا قيمة نقدية حقيقية.
      </p>
    </div>
  );
}
