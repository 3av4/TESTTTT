"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { AuthProvider } from "@/lib/auth";
import { RealtimeProvider } from "@/lib/realtime";
import { ToastProvider } from "@/lib/toast";
import { ConfigProvider } from "@/lib/config";
import { fetcher } from "@/lib/api";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        shouldRetryOnError: true,
        errorRetryCount: 3,
        dedupingInterval: 4000,
      }}
    >
      <ConfigProvider>
        <ToastProvider>
          <AuthProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
          </AuthProvider>
        </ToastProvider>
      </ConfigProvider>
    </SWRConfig>
  );
}
