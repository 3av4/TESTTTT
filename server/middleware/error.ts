/**
 * معالجة الأخطاء المركزية + مساعد asyncHandler.
 */
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, toAppError } from "../errors.js";
import { logger } from "../logger.js";

const log = logger.child("http");

export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as T, res, next)).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "المسار غير موجود" } });
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  // أخطاء التحقق من Zod
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    res.status(422).json({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "بيانات غير صالحة", details: issues },
    });
    return;
  }

  const appError = toAppError(error);
  const status = appError.status;

  if (status >= 500) {
    log.error("خطأ داخلي", {
      path: req.path,
      method: req.method,
      error: error instanceof Error ? { message: error.message, stack: error.stack?.split("\n").slice(0, 5) } : String(error),
    });
  } else if (status !== 429 && status !== 401) {
    log.debug("خطأ عميل", { path: req.path, code: appError.code, message: appError.message });
  }

  // إن كانت الاستجابة JSON API
  if (req.path.startsWith("/api") || req.headers.accept?.includes("application/json")) {
    res.status(status).json({
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details ?? null,
        ...(appError.meta ? { meta: appError.meta } : {}),
      },
    });
    return;
  }

  // صفحات الويب: نص مبسط
  res.status(status).type("text/plain; charset=utf-8").send(appError.message);
}

export { AppError };
