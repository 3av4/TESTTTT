/**
 * المتجر: عناصر وألقاب وشارات ومضاعفات. الشراء داخل Transaction مع قفل الصف،
 * ودعم المخزون المحدود، ومنع الشراء المتكرر للشعارات.
 */
import { query, queryOne, withTransaction } from "../db.js";
import { errors } from "../errors.js";
import { toBigNumber } from "../utils.js";
import { getBoolean } from "./settings.js";
import { adjustBalance, lockUser, writeTransaction } from "./ledger.js";
import { events } from "./events.js";
import type { UserRow } from "./users.js";

export interface ShopItem {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  price: number;
  kind: "title" | "boost" | "shield" | "badge";
  payload: Record<string, unknown>;
  stock: number | null;
  isActive: boolean;
  owned: number;
}

export interface PurchaseResult {
  item: ShopItem;
  price: number;
  balance: number;
  quantity: number;
  message: string;
}

export async function listItems(userId?: number | string): Promise<ShopItem[]> {
  const enabled = await getBoolean("shop_enabled");
  if (!enabled) return [];
  const rows = await query<{
    id: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    price: string;
    kind: string;
    payload: Record<string, unknown>;
    stock: number | null;
    is_active: boolean;
  }>("SELECT * FROM shop_items WHERE is_active = true ORDER BY price ASC");

  let owned: Record<string, number> = {};
  if (userId) {
    const user = await queryOne<{ items: Record<string, unknown> }>("SELECT items FROM users WHERE id = $1", [userId]);
    const bag = (user?.items as Record<string, unknown>)?.inventory as Record<string, number> | undefined;
    owned = bag ?? {};
  }

  return rows.map((row) => ({
    id: toBigNumber(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    icon: row.icon,
    price: toBigNumber(row.price),
    kind: row.kind as ShopItem["kind"],
    payload: row.payload ?? {},
    stock: row.stock,
    isActive: row.is_active,
    owned: owned[row.code] ?? 0,
  }));
}

interface InventoryEntry {
  code: string;
  purchasedAt: string;
  qty: number;
  payload: Record<string, unknown>;
}

/**
 * شراء عنصر.
 * @param quantity الكمية (للمضاعفات والهدايا)
 */
export async function buyItem(
  userId: number | string,
  itemCode: string,
  options?: { quantity?: number; source?: "web" | "bot" },
): Promise<PurchaseResult> {
  const enabled = await getBoolean("shop_enabled");
  if (!enabled) throw errors.disabled("المتجر معطّل حالياً");

  const quantity = Math.max(1, Math.min(Math.round(Number(options?.quantity ?? 1)), 10));

  const result = await withTransaction(async (client) => {
    const itemResult = await client.query<{
      id: string;
      code: string;
      name: string;
      description: string;
      icon: string;
      price: string;
      kind: string;
      payload: Record<string, unknown>;
      stock: number | null;
      is_active: boolean;
    }>("SELECT * FROM shop_items WHERE code = $1 AND is_active = true FOR UPDATE", [itemCode]);
    const item = itemResult.rows[0];
    if (!item) throw errors.notFound("العنصر غير موجود أو غير متوفر");

    const user = await lockUser(client, userId);
    const totalPrice = toBigNumber(item.price) * quantity;

    // تحقق مبكر بسيط (القفل أعلاه هو المرجع الفعلي)

    // المخزون
    if (item.stock !== null && item.stock < quantity) {
      throw errors.badRequest("الكمية غير متوفرة في المخزون");
    }

    // الشراء المتكرر غير مسموح للشعارات
    const userRow = await client.query<{ items: Record<string, unknown> }>(
      "SELECT items FROM users WHERE id = $1",
      [user.id],
    );
    const bag = (userRow.rows[0]?.items as Record<string, unknown>) ?? {};
    const inventory = (bag.inventory as Record<string, InventoryEntry> | undefined) ?? {};
    const boosts = (bag.boosts as Record<string, { uses?: number; multiplier?: number }> | undefined) ?? {};

    if (item.kind === "badge" && inventory[item.code]) {
      throw errors.badRequest("تملك هذه الشارة بالفعل");
    }

    if (user.balance < totalPrice) throw errors.insufficientFunds(`تحتاج ${totalPrice} BTP لإتمام الشراء`);

    const balance = await adjustBalance(client, user.id, -totalPrice);

    // تحديث الحقيبة
    const entry = inventory[item.code];
    const nextInventory: Record<string, InventoryEntry> = {
      ...inventory,
      [item.code]: {
        code: item.code,
        purchasedAt: entry?.purchasedAt ?? new Date().toISOString(),
        qty: (entry?.qty ?? 0) + quantity,
        payload: item.payload ?? {},
      },
    };

    let nextBoosts = boosts;
    let activeTitle: string | null | undefined;
    if (item.kind === "boost") {
      const multiplier = Number(item.payload?.multiplier ?? 1.5);
      const uses = Number(item.payload?.uses ?? 1) * quantity;
      const existing = boosts[item.code];
      nextBoosts = {
        ...boosts,
        [item.code]: { uses: (existing?.uses ?? 0) + uses, multiplier },
      };
    }
    if (item.kind === "title") {
      activeTitle = String(item.payload?.title ?? item.name);
    }
    let shieldUntil = (bag.shieldUntil as string | undefined) ?? null;
    if (item.kind === "shield") {
      const hours = Number(item.payload?.hours ?? 72);
      const current = shieldUntil ? new Date(shieldUntil).getTime() : Date.now();
      shieldUntil = new Date(Math.max(Date.now(), current) + hours * 3_600_000).toISOString();
    }

    const nextItems = {
      ...bag,
      inventory: nextInventory,
      boosts: nextBoosts,
      ...(shieldUntil ? { shieldUntil } : {}),
      ...(activeTitle !== undefined ? { pendingTitle: activeTitle, activeTitle } : {}),
    };

    await client.query(
      `UPDATE users SET items = $1::jsonb, active_title = COALESCE($2, active_title), last_seen_at = now()
       WHERE id = $3`,
      [JSON.stringify(nextItems), activeTitle ?? null, user.id],
    );

    if (item.stock !== null) {
      await client.query("UPDATE shop_items SET stock = stock - $1 WHERE id = $2", [quantity, item.id]);
    }

    await client.query(
      "INSERT INTO purchases (user_id, item_id, price, quantity) VALUES ($1, $2, $3, $4)",
      [user.id, item.id, totalPrice, quantity],
    );

    await writeTransaction(client, {
      senderId: user.id,
      amount: totalPrice,
      net: totalPrice,
      type: "shop_purchase",
      note: `شراء ${item.name} ×${quantity}`,
      source: options?.source ?? "web",
      balanceAfter: balance,
      metadata: { itemCode: item.code, quantity },
    });

    return {
      item: {
        id: toBigNumber(item.id),
        code: item.code,
        name: item.name,
        description: item.description,
        icon: item.icon,
        price: toBigNumber(item.price),
        kind: item.kind as ShopItem["kind"],
        payload: item.payload ?? {},
        stock: item.stock,
        isActive: item.is_active,
        owned: (nextInventory[item.code]?.qty ?? 0),
      },
      price: totalPrice,
      balance,
      quantity,
      message:
        item.kind === "title"
          ? `تم تفعيل لقب «${String(item.payload?.title ?? item.name)}» في ملفك`
          : item.kind === "boost"
            ? `أُضيف ${Number(item.payload?.uses ?? 1) * quantity} استخدام لمضاعف الراتب`
            : item.kind === "shield"
              ? "تم تفعيل درع الحماية"
              : "تمت إضافة العنصر إلى حقيبتك",
    };
  });

  events.emitEvent("balance", { userId: Number(userId), balance: result.balance, change: -result.price, reason: "shop_purchase" });
  return result;
}

/** حقيبة المستخدم */
export async function getInventory(userId: number | string): Promise<{ inventory: Record<string, InventoryEntry>; boosts: Record<string, { uses: number; multiplier: number }> }> {
  const user = await queryOne<{ items: Record<string, unknown> }>("SELECT items FROM users WHERE id = $1", [userId]);
  const bag = (user?.items as Record<string, unknown>) ?? {};
  return {
    inventory: (bag.inventory as Record<string, InventoryEntry> | undefined) ?? {},
    boosts: (bag.boosts as Record<string, { uses: number; multiplier: number }> | undefined) ?? {},
  };
}

/** تفعيل لقب من الحقيبة */
export async function equipTitle(userId: number | string, itemCode: string): Promise<string> {
  const user = await queryOne<UserRow>("SELECT * FROM users WHERE id = $1", [userId]);
  if (!user) throw errors.notFound("المستخدم غير موجود");
  const inventory = ((user.items as Record<string, unknown>)?.inventory ?? {}) as Record<string, InventoryEntry>;
  const entry = inventory[itemCode];
  if (!entry) throw errors.badRequest("لا تملك هذا العنصر");
  const title = String(entry.payload?.title ?? "");
  if (!title) throw errors.badRequest("هذا العنصر لا يمكن تفعيله كلقب");
  await query("UPDATE users SET active_title = $1 WHERE id = $2", [title, userId]);
  return title;
}

/** إلغاء اللقب */
export async function unequipTitle(userId: number | string): Promise<void> {
  await query("UPDATE users SET active_title = NULL WHERE id = $1", [userId]);
}

/** عناصر لوحة الأدمن */
export async function adminListItems() {
  const rows = await query<Record<string, unknown>>("SELECT * FROM shop_items ORDER BY id ASC");
  return rows.map((row) => ({
    id: toBigNumber(row.id),
    code: String(row.code),
    name: String(row.name),
    description: String(row.description),
    icon: String(row.icon),
    price: toBigNumber(row.price),
    kind: String(row.kind),
    payload: row.payload ?? {},
    stock: row.stock === null ? null : toBigNumber(row.stock),
    isActive: Boolean(row.is_active),
  }));
}

/** إضافة/تعديل عنصر */
export async function upsertItem(input: {
  code: string;
  name: string;
  description?: string;
  icon?: string;
  price: number;
  kind?: string;
  payload?: Record<string, unknown>;
  stock?: number | null;
  isActive?: boolean;
}): Promise<void> {
  const code = input.code.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,32}$/.test(code)) throw errors.badRequest("كود العنصر يجب أن يكون أحرفاً إنجليزية صغيرة وأرقاماً فقط");
  if (!Number.isInteger(input.price) || input.price < 0) throw errors.badRequest("السعر غير صالح");
  await query(
    `INSERT INTO shop_items (code, name, description, icon, price, kind, payload, stock, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon,
       price = EXCLUDED.price, kind = EXCLUDED.kind, payload = EXCLUDED.payload,
       stock = EXCLUDED.stock, is_active = EXCLUDED.is_active`,
    [
      code,
      input.name.slice(0, 64),
      (input.description ?? "").slice(0, 300),
      (input.icon ?? "🎁").slice(0, 8),
      input.price,
      input.kind ?? "title",
      JSON.stringify(input.payload ?? {}),
      input.stock ?? null,
      input.isActive ?? true,
    ],
  );
}
