/**
 * ناقل الأحداث بين طبقة الخدمات والواجهات (WebSocket + بوت تلجرام).
 * الخدمات تُطلق الأحداث فقط، والمستهلكون (realtime/notifier) يقررون كيفية العرض.
 */
import { EventEmitter } from "node:events";
import type { RealtimeHub } from "../realtime.js";

export interface BalanceEvent {
  userId: number;
  balance: number;
  change: number;
  reason: string;
}

export interface TransactionEvent {
  userId: number;
  transactionId: number;
  senderId: number | null;
  recipientId: number | null;
  amount: number;
  tax: number;
  net: number;
  type: string;
  direction: "in" | "out" | "self";
  note?: string;
}

export interface NotificationEvent {
  userId: number;
  title: string;
  body: string;
  kind: "info" | "success" | "warning" | "danger" | "gift";
  /** إن كانت الرسالة موجهة لتلجرام أيضاً */
  telegram?: boolean;
}

export interface GameEvent {
  userId: number;
  game: string;
  bet: number;
  payout: number;
  result: string;
  balance: number;
}

export interface AppEvents {
  balance: (event: BalanceEvent) => void;
  transaction: (event: TransactionEvent) => void;
  notification: (event: NotificationEvent) => void;
  game: (event: GameEvent) => void;
  userUpdated: (userId: number) => void;
}

class TypedEmitter extends EventEmitter {
  emitEvent<K extends keyof AppEvents>(name: K, ...args: Parameters<AppEvents[K]>): boolean {
    return super.emit(name, ...args);
  }
  onEvent<K extends keyof AppEvents>(name: K, listener: AppEvents[K]): this {
    return super.on(name, listener as (...args: unknown[]) => void);
  }
}

export const events = new TypedEmitter();
events.setMaxListeners(50);

/** ربط الأحداث بالبث اللحظي */
export function bindRealtime(hub: RealtimeHub): void {
  events.onEvent("balance", (event) => {
    hub.pushBalance(event.userId, event.balance, event.change, event.reason);
  });
  events.onEvent("transaction", (event) => {
    hub.emitToUser(event.userId, {
      type: "transaction",
      data: {
        id: event.transactionId,
        amount: event.amount,
        tax: event.tax,
        net: event.net,
        type: event.type,
        direction: event.direction,
        note: event.note ?? null,
      },
    });
    if (event.recipientId && event.senderId) {
      hub.emitToUser(event.recipientId, {
        type: "transaction",
        data: {
          id: event.transactionId,
          amount: event.amount,
          net: event.net,
          type: event.type,
          direction: "in",
          note: event.note ?? null,
        },
      });
    }
  });
  events.onEvent("notification", (event) => {
    hub.emitToUser(event.userId, {
      type: "notification",
      data: { title: event.title, body: event.body, kind: event.kind },
    });
  });
  events.onEvent("game", (event) => {
    hub.emitToUser(event.userId, { type: "game", data: { ...event } });
  });
}
