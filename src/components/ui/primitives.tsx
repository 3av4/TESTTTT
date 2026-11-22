"use client";

/**
 * مكوّنات واجهة أساسية موحّدة.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef, useId } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { fmt } from "@/lib/api";

/* --------------------------------- Button -------------------------------- */
type Variant = "primary" | "gold" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-btp-400 to-btp-600 text-ink-950 shadow-[0_10px_30px_-12px_rgba(62,227,173,0.7)] hover:from-btp-300 hover:to-btp-500",
  gold: "bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 shadow-[0_10px_30px_-12px_rgba(245,179,1,0.75)] hover:from-gold-300 hover:to-gold-400",
  ghost: "bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10",
  outline: "border border-btp-400/40 text-btp-300 hover:bg-btp-500/10",
  danger: "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25",
  subtle: "bg-ink-700/60 text-slate-300 hover:bg-ink-600/70 border border-white/5",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-xs rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm rounded-xl gap-2",
  lg: "h-13 px-7 text-base rounded-2xl gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className = "", children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-btp-400/70 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98] ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center font-bold transition-all duration-200 active:scale-[0.98] ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {children}
    </Link>
  );
}

/* ---------------------------------- Card ---------------------------------- */
export function Card({
  className = "",
  children,
  strong = false,
  id,
}: {
  className?: string;
  children: ReactNode;
  strong?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`${strong ? "glass-strong" : "glass"} rounded-2xl ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-extrabold text-white sm:text-2xl">
          {icon ? <span className="text-btp-400">{icon}</span> : null}
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------- Badge --------------------------------- */
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "gold" | "red" | "blue";
  className?: string;
}) {
  const tones = {
    neutral: "bg-white/5 text-slate-300 border-white/10",
    green: "bg-btp-500/10 text-btp-300 border-btp-400/30",
    gold: "bg-gold-500/10 text-gold-300 border-gold-400/30",
    red: "bg-red-500/10 text-red-300 border-red-400/30",
    blue: "bg-sky-500/10 text-sky-300 border-sky-400/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------------------------------- Input --------------------------------- */
export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  suffix?: string;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, suffix, error, className = "", id, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="w-full">
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold text-slate-300">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          dir={rest.dir ?? (rest.type === "number" || suffix ? "ltr" : undefined)}
          className={`h-11 w-full rounded-xl border bg-ink-900/70 px-3.5 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-btp-400/60 focus:outline-none focus:ring-2 focus:ring-btp-400/20 ${
            error ? "border-red-400/60" : "border-white/10"
          } ${suffix ? "pe-14" : ""} ${className}`}
          {...rest}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-bold text-slate-500">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? <p className="mt-1 text-[11px] font-semibold text-red-300">{error}</p> : null}
      {hint && !error ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
});

/* -------------------------------- Stat card ------------------------------- */
export function Stat({
  label,
  value,
  icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon?: ReactNode;
  hint?: string;
  tone?: "default" | "green" | "gold" | "blue" | "red";
}) {
  const tones = {
    default: "from-white/[0.04] to-transparent",
    green: "from-btp-500/15 to-transparent",
    gold: "from-gold-500/15 to-transparent",
    blue: "from-sky-500/15 to-transparent",
    red: "from-red-500/15 to-transparent",
  };
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-bl ${tones[tone]} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        {icon ? <span className="text-slate-400">{icon}</span> : null}
      </div>
      <p className="tabular mt-2 text-2xl font-extrabold text-white">{typeof value === "number" ? fmt(value) : value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------- Progress -------------------------------- */
export function Progress({ value, max = 100, className = "" }: { value: number; max?: number; className?: string }) {
  const percent = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-white/10 ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-l from-btp-400 to-btp-600 transition-all duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/* --------------------------------- Avatar --------------------------------- */
export function Avatar({
  src,
  name,
  size = 40,
  ring = false,
}: {
  src?: string | null;
  name: string;
  size?: number;
  ring?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("");
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-bl from-btp-500/40 to-ink-700 text-white ${
        ring ? "ring-2 ring-gold-400/60 ring-offset-2 ring-offset-ink-900" : ""
      }`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="font-extrabold">{initials || "؟"}</span>
      )}
    </span>
  );
}

/* ---------------------------------- Empty --------------------------------- */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
        {icon ?? <Sparkles className="size-6" />}
      </div>
      <p className="font-bold text-white">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* -------------------------------- Skeleton -------------------------------- */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}

/* --------------------------------- Banner --------------------------------- */
export function FeaturePill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-btp-400/25 bg-btp-500/[0.08] px-3 py-1 text-[11px] font-bold text-btp-300">
      {children}
    </span>
  );
}

export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 text-sm font-bold text-btp-300 hover:text-btp-200">
      {children}
      <ArrowRight className="size-4 transition-transform group-hover:-translate-x-1 rtl:rotate-180" />
    </Link>
  );
}
