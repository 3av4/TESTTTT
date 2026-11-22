"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/primitives";

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (admin && !isAdmin) router.replace("/dashboard");
  }, [user, loading, isAdmin, admin, router]);

  if (loading || !user || (admin && !isAdmin)) {
    return (
      <div className="mx-auto flex max-w-5xl items-center justify-center px-4 py-24">
        <Card className="flex items-center gap-3 px-6 py-4">
          <Loader2 className="size-5 animate-spin text-btp-400" />
          <span className="text-sm font-bold text-slate-300">جارٍ التحقق من الجلسة…</span>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
