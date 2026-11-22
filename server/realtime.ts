/**
 * البث اللحظي (WebSocket) — يربط الموقع بالبوت:
 * كل خدمة مالية تنادي `realtime.emitToUser(...)` فيصل التحديث فوراً للمتصفحات
 * المفتوحة لذلك المستخدم. البوت لا يحتاج WebSocket (المستخدم لا يرى رسائله),
 * لكنه يستقبل إشعارات تلجرام من نفس الأحداث عبر `notifier`.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { query } from "./db.js";
import { logger } from "./logger.js";
import { timingSafeEqual } from "./utils.js";

const log = logger.child("ws");

export type RealtimeEvent =
  | { type: "hello"; data: { ok: true } }
  | { type: "balance"; data: { balance: number; change: number; reason: string } }
  | { type: "transaction"; data: Record<string, unknown> }
  | { type: "daily"; data: Record<string, unknown> }
  | { type: "notification"; data: { title: string; body: string; kind: string } }
  | { type: "game"; data: Record<string, unknown> }
  | { type: "presence"; data: { online: number } };

interface Client {
  socket: WebSocket;
  userId: number | null;
  isAlive: boolean;
}

export class RealtimeHub {
  private clients = new Set<Client>();
  private wss: WebSocketServer | null = null;
  private heartbeat: NodeJS.Timeout | null = null;

  /** ربط الخادم بمسار /ws */
  attach(httpServer: HttpServer): void {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 });

    httpServer.on("upgrade", (req, socket, head) => {
      const pathname = (() => {
        try {
          return new URL(req.url ?? "/", "http://localhost").pathname;
        } catch {
          return "/";
        }
      })();
      if (pathname !== "/ws") {
        socket.destroy();
        return;
      }
      if (this.wss) {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.handleConnection(ws, req));
      }
    });

    this.heartbeat = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.socket.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        try {
          client.socket.ping();
        } catch {
          client.socket.terminate();
          this.clients.delete(client);
        }
      }
    }, 30_000);
    this.heartbeat.unref?.();

    log.info("خدمة WebSocket جاهزة على المسار /ws");
  }

  private async authenticate(req: IncomingMessage): Promise<number | null> {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const sid = url.searchParams.get("sid");
      if (!sid) return null;
      const rows = await query<{ user_id: string }>(
        "SELECT user_id FROM sessions WHERE id = $1 AND revoked_at IS NULL AND expires_at > now() LIMIT 1",
        [sid],
      );
      return rows[0] ? Number(rows[0].user_id) : null;
    } catch {
      return null;
    }
  }

  private async handleConnection(socket: WebSocket, req: IncomingMessage) {
    const userId = await this.authenticate(req);
    const client: Client = { socket, userId, isAlive: true };
    this.clients.add(client);
    log.debug("اتصال WebSocket جديد", { userId, total: this.clients.size });

    socket.on("pong", () => {
      client.isAlive = true;
    });
    socket.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw).slice(0, 1024));
        if (message?.type === "ping") socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
      } catch {
        // تجاهل رسائل غير صالحة
      }
    });
    socket.on("close", () => {
      this.clients.delete(client);
      this.broadcastOnline();
    });
    socket.on("error", () => {
      this.clients.delete(client);
    });

    this.send(client, { type: "hello", data: { ok: true } });
    this.broadcastOnline();
  }

  private send(client: Client, event: RealtimeEvent) {
    if (client.socket.readyState !== WebSocket.OPEN) return;
    try {
      client.socket.send(JSON.stringify(event));
    } catch {
      this.clients.delete(client);
    }
  }

  /** إرسال حدث لمستخدم واحد */
  emitToUser(userId: number | string, event: RealtimeEvent): void {
    const id = Number(userId);
    for (const client of this.clients) {
      if (client.userId === id) this.send(client, event);
    }
  }

  /** إرسال حدث لكل المتصلين */
  broadcast(event: RealtimeEvent): void {
    for (const client of this.clients) this.send(client, event);
  }

  /** إعلان للمستخدم بعد كل عملية مالية */
  pushBalance(userId: number, balance: number, change: number, reason: string): void {
    this.emitToUser(userId, { type: "balance", data: { balance, change, reason } });
  }

  private broadcastOnline() {
    const online = new Set([...this.clients].map((c) => c.userId).filter(Boolean)).size;
    this.broadcast({ type: "presence", data: { online } });
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const client of this.clients) {
      try {
        client.socket.close(1001, "server shutdown");
      } catch {
        // ignore
      }
    }
    this.clients.clear();
    await new Promise<void>((resolve) => {
      if (!this.wss) return resolve();
      this.wss.close(() => resolve());
    });
  }

  stats() {
    return { connections: this.clients.size, authenticated: [...this.clients].filter((c) => c.userId).length };
  }
}

export const realtime = new RealtimeHub();

/** يُستخدم من الراوتات للتحقق من سر الويبهوك بأمان */
export function secretMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(provided, expected);
}
