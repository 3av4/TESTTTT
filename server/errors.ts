/**
 * أخطاء العمل (AppError) — تُترجم إلى استجابات HTTP عربية واضحة.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INSUFFICIENT_FUNDS"
  | "COOLDOWN"
  | "BANNED"
  | "DISABLED"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INSUFFICIENT_FUNDS: 400,
  COOLDOWN: 429,
  BANNED: 403,
  DISABLED: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** بيانات إضافية يحتاجها البوت لعرض الأزرار/النصوص */
  readonly meta?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options?: { details?: unknown; meta?: Record<string, unknown> }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code] ?? 400;
    this.details = options?.details;
    this.meta = options?.meta;
  }

  toJSON() {
    return {
      ok: false,
      error: { code: this.code, message: this.message, details: this.details ?? null },
    };
  }
}

export const errors = {
  badRequest: (message = "طلب غير صالح", details?: unknown) => new AppError("BAD_REQUEST", message, { details }),
  validation: (message = "بيانات غير صالحة", details?: unknown) =>
    new AppError("VALIDATION_ERROR", message, { details }),
  unauthorized: (message = "يجب تسجيل الدخول أولاً") => new AppError("UNAUTHORIZED", message),
  forbidden: (message = "لا تملك صلاحية تنفيذ هذا الإجراء") => new AppError("FORBIDDEN", message),
  notFound: (message = "العنصر غير موجود") => new AppError("NOT_FOUND", message),
  conflict: (message = "تعارض في البيانات") => new AppError("CONFLICT", message),
  rateLimited: (message = "عدد المحاولات كبير، انتظر قليلاً", meta?: Record<string, unknown>) =>
    new AppError("RATE_LIMITED", message, { meta }),
  insufficientFunds: (message = "رصيدك غير كافٍ") => new AppError("INSUFFICIENT_FUNDS", message),
  cooldown: (message: string, meta?: Record<string, unknown>) => new AppError("COOLDOWN", message, { meta }),
  banned: (message = "حسابك محظور. تواصل مع الدعم.") => new AppError("BANNED", message),
  disabled: (message = "هذه الميزة معطّلة حالياً") => new AppError("DISABLED", message),
  internal: (message = "حدث خطأ غير متوقع") => new AppError("INTERNAL", message),
};

/** هل الخطأ ناتج عن انتهاك قيد فريد في PostgreSQL */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/** تحويل أي خطأ إلى AppError */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (isUniqueViolation(error)) return new AppError("CONFLICT", "هذا العنصر موجود مسبقاً");
  return new AppError("INTERNAL", "حدث خطأ غير متوقع في الخادم");
}
