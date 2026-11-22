"use client";

import { useConfig } from "@/lib/config";
import { Megaphone } from "lucide-react";

export function AnnouncementBar() {
  const { config } = useConfig();
  if (!config.announcement) return null;

  return (
    <div className="relative overflow-hidden border-b border-gold-500/20 bg-gradient-to-l from-gold-500/15 via-gold-500/5 to-transparent">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-xs font-bold text-gold-200 sm:px-6">
        <Megaphone className="size-3.5 shrink-0 text-gold-400" />
        <p className="truncate">{config.announcement}</p>
      </div>
    </div>
  );
}
