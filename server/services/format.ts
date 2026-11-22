/**
 * أدوات عرض مشتركة بين الموقع والبوت.
 */
import { sanitizeDisplayName } from "../utils.js";

/** اسم آمن للعرض */
export function sanitizeName(name: string | null | undefined, fallback = "مستخدم"): string {
  return sanitizeDisplayName(name, fallback);
}

/** اسم العرض لمستخدم داخل رسائل البوت (مع اللقب النشط) */
export function displayName(
  user: { first_name?: string | null; username?: string | null; active_title?: string | null } | null | undefined,
  fallback = "مستخدم",
): string {
  if (!user) return fallback;
  const base = sanitizeDisplayName(user.first_name ?? (user.username ? `@${user.username}` : null), fallback);
  return user.active_title ? `${user.active_title} ${base}` : base;
}
