"use client";

import type { ReactNode } from "react";
import { Badge, Card, Skeleton } from "@/components/ui/primitives";

export function AdminSection({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-white">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </Card>
  );
}

export function AdminTable({
  headers,
  children,
  loading,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10" />
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-start text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {headers.map((header) => (
              <th key={header} className="px-2 py-2 text-start">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {empty ? (
            <tr>
              <td colSpan={headers.length} className="py-8 text-center text-slate-500">لا بيانات</td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DiffBadge({ value, threshold = 0 }: { value: number; threshold?: number }) {
  const positive = value >= threshold;
  return <Badge tone={positive ? "green" : "red"}>{positive ? "+" : ""}{value.toLocaleString("en-US")}</Badge>;
}

export function MiniList({ items }: { items: Array<{ label: string; value: string | number }> }) {
  return (
    <ul className="divide-y divide-white/[0.04]">
      {items.map((item) => (
        <li key={item.label} className="flex items-center justify-between py-2 text-sm">
          <span className="text-slate-400">{item.label}</span>
          <span className="tabular font-bold text-white">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}
