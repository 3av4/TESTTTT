"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, Home, Trophy, User, Wallet } from "lucide-react";

const ITEMS = [
  { href: "/", label: "الرئيسية", icon: Home },
  { href: "/games", label: "ألعاب", icon: Gamepad2 },
  { href: "/dashboard", label: "محفظتي", icon: Wallet },
  { href: "/leaderboard", label: "المتصدرون", icon: Trophy },
  { href: "/login", label: "حسابي", icon: User },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink-950/95 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors ${
                active ? "text-btp-300" : "text-slate-500"
              }`}
            >
              <item.icon className={`size-5 ${active ? "drop-shadow-[0_0_10px_rgba(62,227,173,0.6)]" : ""}`} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
