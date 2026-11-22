/**
 * خدمة الإعدادات — جدول system_settings هو مصدر الحقيقة لكل الأرقام.
 * تُقرأ الإعدادات مع كاش قصير (5 ثوانٍ) لتخفيف الحمل، ويُبطَل الكاش عند أي تعديل.
 */
import { query, queryOne } from "../db.js";
import { errors } from "../errors.js";
import { logger } from "../logger.js";

export interface SettingRow {
  key: string;
  value: string;
  type: "number" | "string" | "boolean";
  category: string;
  label: string;
  description: string;
  min_value: string | null;
  max_value: string | null;
  updated_at: string;
}

export const SETTING_DEFAULTS = {
  currency_name: "BitPoin",
  currency_symbol: "BTP",
  start_balance: 1000,

  daily_min: 100,
  daily_max: 400,
  daily_cooldown_hours: 24,
  streak_bonus_per_day: 30,
  streak_bonus_max_days: 7,

  transfer_tax_pct: 5,
  game_tax_pct: 5,
  wealth_tax_pct: 0,
  wealth_tax_threshold: 100000,
  wealth_tax_interval_hours: 24,
  treasury_balance: 0,

  shop_enabled: true,
  referral_enabled: true,
  referral_reward_inviter: 300,
  referral_reward_invitee: 150,

  min_transfer: 10,
  max_transfer: 1_000_000,
  bot_enabled: true,
  announcement: "",
  treasury_address: "BTP-TREASURY",

  bet_min: 10,
  bet_max: 5000,
  dice_min: 10,
  dice_max: 5000,
  coinflip_min: 10,
  coinflip_max: 5000,
  slots_min: 10,
  slots_max: 5000,
  roulette_min: 10,
  roulette_max: 5000,

  rob_min: 50,
  rob_max: 5000,
  rob_success_pct: 40,
  rob_cooldown_minutes: 30,
  rob_penalty_pct: 20,
  rob_victim_share_pct: 50,

  bank_interest_pct: 0.5,
  bank_min_deposit: 100,
  bank_capacity: 1_000_000,

  loan_interest_pct: 10,
  loan_max_amount: 5000,
  loan_duration_hours: 24,
  loan_overdue_penalty: 20,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

interface CacheEntry {
  map: Map<string, string>;
  at: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 5000;

async function loadAll(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.map;
  try {
    const rows = await query<{ key: string; value: string }>("SELECT key, value FROM system_settings");
    const map = new Map<string, string>();
    for (const [key, def] of Object.entries(SETTING_DEFAULTS)) map.set(key, String(def));
    for (const row of rows) map.set(row.key, row.value);
    cache = { map, at: Date.now() };
    return map;
  } catch (error) {
    logger.warn("تعذر تحميل الإعدادات، سيتم استخدام القيم الافتراضية", { error: String(error) });
    const map = new Map<string, string>();
    for (const [key, def] of Object.entries(SETTING_DEFAULTS)) map.set(key, String(def));
    return map;
  }
}

export function invalidateSettingsCache(): void {
  cache = null;
}

/** قراءة إعداد رقمي */
export async function getNumber(key: SettingKey): Promise<number> {
  const map = await loadAll();
  const raw = map.get(key);
  const parsed = Number.parseFloat(raw ?? "");
  if (Number.isFinite(parsed)) return parsed;
  const fallback = SETTING_DEFAULTS[key];
  return typeof fallback === "number" ? fallback : 0;
}

/** قراءة إعداد نصي */
export async function getString(key: SettingKey): Promise<string> {
  const map = await loadAll();
  return map.get(key) ?? String(SETTING_DEFAULTS[key] ?? "");
}

/** قراءة إعداد منطقي */
export async function getBoolean(key: SettingKey): Promise<boolean> {
  const raw = (await getString(key)).toLowerCase();
  return ["1", "true", "yes", "on"].includes(raw);
}

/** قراءة كل الإعدادات دفعة واحدة (للواجهة/اللوحة) */
export async function getAllSettings(): Promise<Record<string, string>> {
  const map = await loadAll();
  return Object.fromEntries(map.entries());
}

/** قائمة صفوف الإعدادات الكاملة (لوحة الأدمن) */
export async function listSettings(): Promise<SettingRow[]> {
  const rows = await query<SettingRow>(
    `SELECT key, value, type, category, label, description, min_value, max_value, updated_at
     FROM system_settings ORDER BY category, key`,
  );
  return rows;
}

/** تعديل إعداد واحد مع التحقق من النوع والحدود */
export async function updateSetting(
  key: string,
  value: string,
  actorId?: number | null,
): Promise<SettingRow> {
  if (!(key in SETTING_DEFAULTS)) {
    throw errors.badRequest(`الإعداد "${key}" غير معروف`);
  }
  const row = await queryOne<SettingRow>("SELECT * FROM system_settings WHERE key = $1", [key]);
  if (!row) throw errors.notFound("الإعداد غير موجود في قاعدة البيانات");

  const clean = String(value).trim();
  if (row.type === "number") {
    if (!/^-?\d+(\.\d+)?$/.test(clean)) throw errors.badRequest("القيمة يجب أن تكون رقماً");
    const numeric = Number.parseFloat(clean);
    if (row.min_value !== null && numeric < Number.parseFloat(row.min_value)) {
      throw errors.badRequest(`القيمة أقل من الحد الأدنى (${row.min_value})`);
    }
    if (row.max_value !== null && numeric > Number.parseFloat(row.max_value)) {
      throw errors.badRequest(`القيمة أكبر من الحد الأعلى (${row.max_value})`);
    }
  }
  if (row.type === "boolean" && !["true", "false", "0", "1"].includes(clean.toLowerCase())) {
    throw errors.badRequest("القيمة يجب أن تكون true أو false");
  }
  if (clean.length > 500) throw errors.badRequest("القيمة طويلة جداً");

  const updated = await queryOne<SettingRow>(
    `UPDATE system_settings SET value = $1, updated_by = $2, updated_at = now()
     WHERE key = $3 RETURNING *`,
    [clean, actorId ?? null, key],
  );
  invalidateSettingsCache();
  logger.info("تم تعديل إعداد نظام", { key, value: clean, actorId });
  return updated!;
}

/** زيادة رصيد خزينة النظام باستخدام اتصال Transaction قائم (إلزامي داخل withTransaction) */
export async function addToTreasuryTx(
  client: import("pg").PoolClient,
  amount: number,
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) return;
  await client.query(
    `UPDATE system_settings
     SET value = (COALESCE(NULLIF(value, ''), '0')::bigint + $1)::text, updated_at = now()
     WHERE key = 'treasury_balance'`,
    [amount],
  );
  cache = null;
}

/** زيادة رصيد خزينة النظام (خارج Transaction — للمهام المنفردة فقط) */
export async function addToTreasury(amount: number): Promise<void> {
  if (amount === 0) return;
  await query(
    `UPDATE system_settings
     SET value = (COALESCE(NULLIF(value, ''), '0')::bigint + $1)::text, updated_at = now()
     WHERE key = 'treasury_balance'`,
    [Math.round(amount)],
  );
  cache = null;
}

/** قراءة رصيد الخزينة */
export async function getTreasuryBalance(): Promise<number> {
  return Math.round(await getNumber("treasury_balance"));
}
