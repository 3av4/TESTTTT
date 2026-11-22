/**
 * أدوات مساعدة عامة: تنسيق المبالغ، أرقام صحيحة آمنة، توليد أكواد.
 */
import crypto from "node:crypto";

/** أكبر قيمة آمنة للتعامل كـ Number (أقل من Number.MAX_SAFE_INTEGER) */
export const MAX_SAFE_AMOUNT = 9_000_000_000_000; // 9e12

/** أرصدة لا تتجاوز 2^53-1 */
export function toSafeInt(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

/** تحويل آمن لقيمة BIGINT من قاعدة البيانات */
export function toBigNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** تنسيق مبلغ مع فواصل الآلاف */
export function formatAmount(amount: number | string | null | undefined, symbol = "BTP"): string {
  const n = toSafeInt(amount);
  return `${n.toLocaleString("en-US")} ${symbol}`;
}

/** تنسيق مبلغ مختصر (1.2K / 3.4M) */
export function formatCompact(amount: number | null | undefined): string {
  const n = toSafeInt(amount);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** أرقام عشوائية آمنة تشفيرياً داخل نطاق مغلق [min, max] */
export function randomInt(min: number, max: number): number {
  if (max < min) [min, max] = [max, min];
  const range = max - min + 1;
  if (range <= 0) return min;
  return min + crypto.randomInt(range);
}

/** نسبة مئوية بأعداد صحيحة — تُستخدم للمبالغ والضرائب */
export function percentOf(amount: number, percent: number): number {
  const value = (Math.max(0, amount) * Math.max(0, percent)) / 100;
  return Math.round(value);
}

/** توليد كود عشوائي آمن (أحرف كبيرة وأرقام بدون الحروف الملبسة) */
export function generateCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

/** توليد معرّف جلسة */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** مقارنة آمنة ضد هجمات التوقيت */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** هل القيمة رقم صحيح موجب */
export function isPositiveInt(value: unknown): boolean {
  if (typeof value === "string") {
    return /^\d+$/.test(value.trim()) && Number(value) > 0;
  }
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** تنسيق مدة (ثوانٍ) إلى نص عربي مختصر */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} يوم`);
  if (h) parts.push(`${h} ساعة`);
  if (m) parts.push(`${m} دقيقة`);
  if (!d && !h && m) return parts.join(" و ");
  if (!d && !h && !m) parts.push(`${sec} ثانية`);
  return parts.slice(0, 2).join(" و ");
}

/** تنسيق العربية للأرقام */
export function formatNum(value: number | string | null | undefined): string {
  return toSafeInt(value).toLocaleString("en-US");
}

/** التاريخ بصيغة عربية قصيرة */
export function formatDateAr(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-DZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  });
}

/** تنظيف اسم العرض (منع رموز التحكم) */
export function sanitizeDisplayName(name: string | null | undefined, fallback = "لاعب"): string {
  if (!name) return fallback;
  const cleaned = name.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
  return cleaned.length ? cleaned.slice(0, 32) : fallback;
}

/** تسلسل JSON آمن */
export function safeJson<T = unknown>(value: unknown, fallback: T): T {
  try {
    if (typeof value === "string") return JSON.parse(value) as T;
    if (value && typeof value === "object") return value as T;
    return fallback;
  } catch {
    return fallback;
  }
}

/** فصل مصفوفة إلى صفحات */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const start = Math.max(0, (page - 1) * pageSize);
  return items.slice(start, start + pageSize);
}
