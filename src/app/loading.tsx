import { CoinMark } from "@/components/ui/Logo";

export default function Loading() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-6xl flex-col items-center justify-center px-4">
      <div className="relative">
        <div className="absolute inset-0 animate-ping rounded-full bg-btp-500/25" aria-hidden="true" />
        <div className="relative flex size-20 items-center justify-center rounded-full border border-white/10 bg-ink-900/80">
          <CoinMark size={44} />
        </div>
      </div>
      <p className="mt-5 text-sm font-extrabold text-white">جارٍ التحميل…</p>
      <p className="mt-1 text-[11px] text-slate-500">نُزامن رصيدك مع قاعدة البيانات</p>

      <div className="mt-6 w-full max-w-2xl space-y-2">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-3 animate-pulse rounded-full bg-gradient-to-l from-white/[0.06] via-white/[0.12] to-white/[0.06]"
            style={{ width: `${88 - index * 16}%`, animationDelay: `${index * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
