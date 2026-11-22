import Link from "next/link";

export function CoinMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="btp-rim" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE08A" />
          <stop offset="0.5" stopColor="#F5B301" />
          <stop offset="1" stopColor="#D99A00" />
        </linearGradient>
        <linearGradient id="btp-face" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#123B32" />
          <stop offset="1" stopColor="#071A15" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="23" fill="url(#btp-rim)" />
      <circle cx="24" cy="24" r="18.5" fill="url(#btp-face)" stroke="#3EE3AD" strokeOpacity="0.55" strokeWidth="1.2" />
      <path
        d="M17 13.5h9.2c3.8 0 6.3 2 6.3 5.4 0 2.2-1.1 3.8-2.9 4.6 2.3.7 3.7 2.5 3.7 5.1 0 3.8-2.8 6-7 6H17V13.5Zm4.4 3.6v5.1h4.1c1.9 0 3-.9 3-2.5 0-1.7-1.1-2.6-3-2.6h-4.1Zm0 8.6v5.5h4.7c2.1 0 3.3-1 3.3-2.8 0-1.8-1.2-2.7-3.3-2.7h-4.7Z"
        fill="url(#btp-rim)"
      />
      <path d="M31.5 10.5 34 12l1.5-2.5" stroke="#7FF5D0" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="BitPoin — الصفحة الرئيسية">
      <span className="relative inline-flex">
        <CoinMark size={compact ? 34 : 40} className="transition-transform duration-300 group-hover:rotate-12" />
        <span className="absolute inset-0 -z-10 rounded-full bg-btp-500/30 blur-lg transition-opacity group-hover:opacity-100 opacity-60" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-lg font-extrabold tracking-tight text-white">
          Bit<span className="gradient-text">Poin</span>
        </span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">BTP Coin</span>
      </span>
    </Link>
  );
}
