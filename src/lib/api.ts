/**
 * عميل API للواجهة — يغلّف fetch مع استخراج رسائل الخطأ العربية.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly meta?: Record<string, unknown>;

  constructor(message: string, code: string, status: number, details?: unknown, meta?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.meta = meta;
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown; meta?: Record<string, unknown> };
}

async function request<T>(path: string, options?: Omit<RequestInit, "body"> & { body?: unknown }): Promise<T> {
  const { body, headers, ...rest } = options ?? {};
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...rest,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(headers ?? {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError("تعذّر الاتصال بالخادم — تحقق من الشبكة", "NETWORK", 0);
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.ok) {
    throw new ApiError(
      payload?.error?.message ?? `خطأ ${response.status}`,
      payload?.error?.code ?? "HTTP_ERROR",
      response.status,
      payload?.error?.details,
      payload?.error?.meta,
    );
  }
  return payload.data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ?? {} }),
};

/** جلب وإعادة المحاولة لـ SWR */
export const fetcher = <T>(path: string) => api.get<T>(path);

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "حدث خطأ غير متوقع";
}

/** تنسيق المبالغ */
export function fmt(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return value.toLocaleString("en-US");
}

export function fmtCompact(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** مدة بالثواني → نص عربي */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} يوم و ${h} ساعة`;
  if (h > 0) return `${h} ساعة و ${m} دقيقة`;
  if (m > 0) return `${m} دقيقة و ${sec} ثانية`;
  return `${sec} ثانية`;
}

export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function dateAr(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-DZ", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    numberingSystem: "latn",
  });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return "—";
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} ساعة`;
  if (diff < 604800) return `قبل ${Math.floor(diff / 86400)} يوم`;
  return dateAr(value);
}

/** أسماء أنواع المعاملات بالعربية */
export const TX_LABELS: Record<string, { label: string; icon: string; tone: "in" | "out" | "neutral" }> = {
  welcome: { label: "رصيد ترحيبي", icon: "👋", tone: "in" },
  daily: { label: "راتب يومي", icon: "🎁", tone: "in" },
  transfer: { label: "تحويل", icon: "💸", tone: "out" },
  transfer_received: { label: "تحويل وارد", icon: "💰", tone: "in" },
  game_bet: { label: "رهان لعبة", icon: "🎲", tone: "out" },
  game_win: { label: "ربح لعبة", icon: "🏆", tone: "in" },
  rob_success: { label: "سرقة ناجحة", icon: "🕵️", tone: "in" },
  rob_failed: { label: "سرقة فاشلة", icon: "🚨", tone: "out" },
  rob_victim: { label: "تعويض سرقة", icon: "🛡️", tone: "in" },
  rob_penalty: { label: "عقوبة سرقة", icon: "⚠️", tone: "out" },
  bank_deposit: { label: "إيداع بنكي", icon: "🏦", tone: "neutral" },
  bank_withdraw: { label: "سحب بنكي", icon: "🏦", tone: "neutral" },
  bank_interest: { label: "فائدة بنكية", icon: "📈", tone: "in" },
  shop_purchase: { label: "شراء من المتجر", icon: "🛒", tone: "out" },
  gift_sent: { label: "هدية صادرة", icon: "🎁", tone: "out" },
  gift_received: { label: "هدية واردة", icon: "🎁", tone: "in" },
  redeem: { label: "كود هدية", icon: "🎟️", tone: "in" },
  referral_reward: { label: "مكافأة إحالة", icon: "🔗", tone: "in" },
  loan_granted: { label: "قرض", icon: "🏦", tone: "in" },
  loan_repayment: { label: "سداد قرض", icon: "🏦", tone: "out" },
  loan_penalty: { label: "عقوبة قرض", icon: "⚠️", tone: "out" },
  admin_credit: { label: "منحة إدارية", icon: "🎖️", tone: "in" },
  admin_debit: { label: "خصم إداري", icon: "⚠️", tone: "out" },
  wealth_tax: { label: "ضريبة ثروة", icon: "💸", tone: "out" },
  tax: { label: "ضريبة", icon: "🏛️", tone: "out" },
  reward: { label: "مكافأة", icon: "🏅", tone: "in" },
};

export function txMeta(type: string) {
  return TX_LABELS[type] ?? { label: type, icon: "•", tone: "neutral" as const };
}
