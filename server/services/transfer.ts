/**
 * التحويل بين المستخدمين (من الموقع أو البوت).
 * ضريبة التحويل تُخصم من المبلغ المُحوَّل ويستلم المستلم الصافي، وتذهب للخزينة.
 */
import { errors } from "../errors.js";
import { sanitizeDisplayName, toBigNumber } from "../utils.js";
import { getNumber } from "./settings.js";
import { transfer as ledgerTransfer } from "./ledger.js";
import { notify, escapeHtml } from "./notifications.js";
import { findUserByUsername, getUserById, resolveUser } from "./users.js";

export interface TransferResult {
  transactionId: number;
  amount: number;
  tax: number;
  net: number;
  senderBalance: number;
  recipientBalance: number;
  recipientName: string;
  recipientUsername: string | null;
  taxPercent: number;
}

export interface TransferRequest {
  senderId: number | string;
  /** معرّف قاعدة البيانات أو @username */
  recipient: string | number;
  amount: number;
  note?: string;
  source?: "web" | "bot";
}

/**
 * تحويل بالاسم أو المعرف.
 * الضريبة تُخصم من المبلغ (المستلم يستلم amount - tax) — كما في أوامر البوت /send.
 */
export async function sendCoins(request: TransferRequest): Promise<TransferResult> {
  const { senderId, amount } = request;
  const source = request.source ?? "web";

  const [minTransfer, maxTransfer, taxPercent] = await Promise.all([
    getNumber("min_transfer"),
    getNumber("max_transfer"),
    getNumber("transfer_tax_pct"),
  ]);

  const value = Math.round(Number(amount));
  if (!Number.isInteger(value) || value <= 0) throw errors.badRequest("المبلغ يجب أن يكون عدداً صحيحاً موجباً");
  if (value < Math.round(minTransfer)) throw errors.badRequest(`أدنى مبلغ للتحويل هو ${Math.round(minTransfer)} BTP`);
  if (value > Math.round(maxTransfer)) throw errors.badRequest(`أعلى مبلغ للتحويل هو ${Math.round(maxTransfer)} BTP`);

  const sender = await getUserById(senderId);
  if (!sender) throw errors.notFound("المرسل غير موجود");
  if (sender.is_banned) throw errors.banned();

  let recipientRow = null;
  const identifier = String(request.recipient).trim();
  if (/^@?[a-zA-Z0-9_]{3,32}$/.test(identifier) && !/^\d+$/.test(identifier)) {
    recipientRow = await findUserByUsername(identifier);
  } else if (/^\d+$/.test(identifier)) {
    // رقم قد يكون id داخلياً أو telegram_id — نجرب الاثنين
    const byId = await resolveUser(identifier);
    recipientRow = byId ?? (await findUserByUsername(identifier));
  } else {
    throw errors.badRequest("اسم المستلم غير صالح — استخدم @username أو معرّف تلجرام");
  }

  if (!recipientRow) throw errors.notFound("المستلم غير موجود. تأكد أنه بدأ استخدام البوت أولاً");
  if (String(recipientRow.id) === String(sender.id)) throw errors.badRequest("لا يمكنك التحويل إلى نفسك");
  if (recipientRow.is_banned) throw errors.badRequest("لا يمكن التحويل إلى حساب محظور");

  const result = await ledgerTransfer({
    senderId: toBigNumber(sender.id),
    recipientId: toBigNumber(recipientRow.id),
    amount: value,
    type: "transfer",
    taxPercent,
    taxFromSender: false,
    note: request.note?.slice(0, 100),
    source,
    metadata: { recipientUsername: recipientRow.username },
  });

  const recipientName = sanitizeDisplayName(recipientRow.first_name ?? recipientRow.username, "مستخدم");

  // إشعارات الطرفين
  void notify({
    userId: toBigNumber(recipientRow.id),
    title: "💰 وصلتك حوالة",
    body: `استلمت ${result.net} BTP (بعد ضريبة ${result.tax} BTP) من ${sender.first_name ?? "مستخدم"}.`,
    kind: "success",
    telegram: true,
    telegramHtml:
      `💰 <b>وصلتك حوالة جديدة</b>\n` +
      `المُرسل: ${escapeHtml(sender.first_name ?? "مستخدم")}\n` +
      `المبلغ: <b>${result.net} BTP</b>\n` +
      `الضريبة: ${result.tax} BTP (${taxPercent}%)\n` +
      `الرصيد الحالي: <b>${result.recipientBalance} BTP</b>`,
  }).catch(() => undefined);

  void notify({
    userId: toBigNumber(sender.id),
    title: "✅ تم التحويل",
    body: `حوّلت ${value} BTP إلى ${recipientName} (ضريبة ${result.tax} BTP).`,
    kind: "info",
    telegram: source === "web",
    telegramHtml:
      `✅ <b>تم تنفيذ التحويل</b>\n` +
      `إلى: ${escapeHtml(recipientName)}\n` +
      `المبلغ: <b>${value} BTP</b>\n` +
      `الضريبة: ${result.tax} BTP\n` +
      `رصيدك: <b>${result.senderBalance} BTP</b>`,
  }).catch(() => undefined);

  return {
    transactionId: result.transactionId,
    amount: value,
    tax: result.tax,
    net: result.net,
    senderBalance: result.senderBalance!,
    recipientBalance: result.recipientBalance!,
    recipientName,
    recipientUsername: recipientRow.username,
    taxPercent,
  };
}

export function formatTransferPreview(amount: number, taxPercent: number) {
  const tax = Math.round((amount * taxPercent) / 100);
  return { amount, tax, net: amount - tax, taxPercent };
}
