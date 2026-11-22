"use client";

/**
 * مزوّد البث اللحظي: يفتح WebSocket على /ws ويربطه بـ SWR:
 *  - يحدّث الرصيد فوراً (optimistic) عند أي حدث.
 *  - يُعيد جلب البيانات عند تغيّرات المعاملات.
 *  - يعرض Toast لكل حدث وارد.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSWRConfig } from "swr";
import { useAuth } from "./auth";
import type { NotificationKind } from "./toast";

interface RealtimeContextValue {
  connected: boolean;
  online: number;
  lastEventAt: string | null;
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connected: false,
  online: 0,
  lastEventAt: null,
});

export interface RealtimeHandlers {
  onBalance?: (data: { balance: number; change: number; reason: string }) => void;
  onNotification?: (data: { title: string; body: string; kind: NotificationKind }) => void;
  onTransaction?: (data: Record<string, unknown>) => void;
  onGame?: (data: Record<string, unknown>) => void;
}

/** حدث مخصص يستمع له المكوّنات */
export type RealtimeListener = (event: { type: string; data: unknown }) => void;
const listeners = new Set<RealtimeListener>();

export function subscribeRealtime(listener: RealtimeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { mutate } = useSWRConfig();
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposed = useRef(false);

  const handleEvent = useCallback(
    (event: { type: string; data: unknown }) => {
      setLastEventAt(new Date().toISOString());
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // تجاهل أخطاء المستمعين
        }
      }

      switch (event.type) {
        case "balance": {
          const data = event.data as { balance: number; change: number; reason: string };
          // تحديث فوري للرصيد في الكاش
          void mutate(
            "/user/me",
            (current: unknown) => {
              if (!current || typeof current !== "object") return current;
              const dashboard = current as Record<string, unknown>;
              const userData = dashboard.user as Record<string, unknown> | undefined;
              if (!userData) return current;
              return { ...dashboard, user: { ...userData, balance: data.balance } };
            },
            { revalidate: false },
          );
          void mutate("/auth/me", (current: unknown) => {
            if (!current || typeof current !== "object") return current;
            return { ...(current as Record<string, unknown>), balance: data.balance };
          }, { revalidate: false });
          window.dispatchEvent(new CustomEvent("btp:balance", { detail: data }));
          break;
        }
        case "transaction": {
          void mutate("/user/transactions");
          void mutate("/user/me");
          window.dispatchEvent(new CustomEvent("btp:transaction", { detail: event.data }));
          break;
        }
        case "daily": {
          void mutate("/user/me");
          void mutate("/user/daily");
          break;
        }
        case "game": {
          void mutate("/games/stats");
          void mutate("/leaderboard?scope=games");
          break;
        }
        case "notification": {
          void mutate("/user/notifications");
          window.dispatchEvent(new CustomEvent("btp:notification", { detail: event.data }));
          break;
        }
        case "presence": {
          const data = event.data as { online: number };
          setOnline(data.online ?? 0);
          break;
        }
        default:
          break;
      }
    },
    [mutate],
  );

  useEffect(() => {
    if (!user) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      return;
    }
    disposed.current = false;

    const connect = () => {
      if (disposed.current) return;
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
        socketRef.current = socket;

        socket.onopen = () => {
          retryRef.current = 0;
          setConnected(true);
        };
        socket.onmessage = (message) => {
          try {
            const parsed = JSON.parse(String(message.data)) as { type: string; data: unknown };
            handleEvent(parsed);
          } catch {
            // رسالة غير صالحة
          }
        };
        socket.onclose = () => {
          setConnected(false);
          if (disposed.current) return;
          retryRef.current += 1;
          const delay = Math.min(1000 * 2 ** Math.min(retryRef.current, 5), 20_000);
          reconnectTimer.current = setTimeout(connect, delay);
        };
        socket.onerror = () => {
          socket.close();
        };
      } catch {
        reconnectTimer.current = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      disposed.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user, handleEvent]);

  // نبض دوري للحفاظ على الاتصال
  useEffect(() => {
    const timer = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 25_000);
    return () => clearInterval(timer);
  }, []);

  const value = useMemo(() => ({ connected, online, lastEventAt }), [connected, online, lastEventAt]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
