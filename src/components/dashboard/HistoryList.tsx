"use client";

import useSWR from "swr";
import { History, Inbox } from "lucide-react";
import { Badge, Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { dateAr, fmt, txMeta } from "@/lib/api";
import type { TransactionItem } from "@/lib/types";

export function HistoryList({ userId, limit = 20 }: { userId: number; limit?: number }) {
  const { data, isLoading } = useSWR<{
    items: TransactionItem[];
    total: number;
  }>(`/user/transactions?limit=${limit}`, { refreshInterval: 30_000 });

  if (isLoading) {
    return (
      <Card className="p-5">
        <div className="mb-4 h-5 w-32 animate-pulse rounded bg-white/10" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      </Card>
    );
  }

  const items = data?.items ?? [];

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-lg bg-white/5 text-slate-300">
            <History className="size-4" />
          </span>
          <div>
            <p className="text-sm font-extrabold text-white">سجل العمليات</p>
            <p className="text-[11px] text-slate-500">{data?.total ?? 0} عملية إجمالاً</p>
          </div>
        </div>
        <Badge tone="neutral">آخر {items.length}</Badge>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Inbox className="size-6" />} title="لا عمليات بعد" description="ابدأ باستلام راتبك اليومي أو تحويل عملات لصديق." />
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {items.map((tx) => {
            const meta = txMeta(tx.type);
            const incoming = tx.recipientId === userId;
            const amount = incoming ? tx.net : tx.amount;
            const counterparty = incoming
              ? (tx.metadata?.senderName as string | undefined) ?? (tx.metadata?.senderUsername as string | undefined)
              : (tx.metadata?.recipientName as string | undefined) ?? (tx.metadata?.recipientUsername as string | undefined);

            return (
              <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-xl text-sm ${
                      meta.tone === "in" ? "bg-btp-500/10" : meta.tone === "out" ? "bg-red-500/10" : "bg-white/5"
                    }`}
                  >
                    {meta.icon}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{meta.label}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {counterparty ? `${counterparty} · ` : ""}
                      {tx.note ? `${tx.note} · ` : ""}
                      {dateAr(tx.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="text-end">
                  <p
                    className={`tabular text-sm font-extrabold ${
                      meta.tone === "neutral" ? "text-slate-300" : incoming ? "text-btp-300" : "text-red-300"
                    }`}
                  >
                    {meta.tone === "neutral" ? "" : incoming ? "+" : "-"}
                    {fmt(amount)}
                  </p>
                  {tx.tax > 0 ? <p className="text-[10px] text-slate-500">ضريبة {fmt(tx.tax)}</p> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

