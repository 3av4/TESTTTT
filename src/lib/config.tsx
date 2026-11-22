"use client";

/**
 * مزوّد الإعدادات العامة القادمة من /api/config (ضرائب، حدود، شعار...) —
 * تُستخدم في نماذج العرض والتلميحات قبل إرسال الطلب.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import useSWR from "swr";
import { fetcher } from "./api";
import type { PublicConfig } from "./types";

const EMPTY: PublicConfig = {
  currency_name: "BitPoin",
  currency_symbol: "BTP",
  daily_min: "100",
  daily_max: "400",
  daily_cooldown_hours: "24",
  streak_bonus_per_day: "30",
  streak_bonus_max_days: "7",
  transfer_tax_pct: "5",
  game_tax_pct: "5",
  wealth_tax_pct: "0",
  wealth_tax_threshold: "100000",
  bet_min: "10",
  bet_max: "5000",
  rob_success_pct: "40",
  rob_cooldown_minutes: "30",
  rob_min: "50",
  rob_max: "5000",
  bank_interest_pct: "0.5",
  bank_min_deposit: "100",
  shop_enabled: "true",
  referral_enabled: "true",
  referral_reward_inviter: "300",
  referral_reward_invitee: "150",
  announcement: "",
  min_transfer: "10",
  max_transfer: "1000000",
  loan_max_amount: "5000",
  loan_interest_pct: "10",
};

interface ConfigContextValue {
  config: PublicConfig;
  num: (key: keyof PublicConfig) => number;
  bool: (key: keyof PublicConfig) => boolean;
  symbol: string;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({ children, initial }: { children: ReactNode; initial?: Partial<PublicConfig> }) {
  const { data } = useSWR<PublicConfig>("/config", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 300_000,
    fallbackData: initial ? { ...EMPTY, ...initial } : undefined,
  });

  const value = useMemo<ConfigContextValue>(() => {
    const config = { ...EMPTY, ...(data ?? {}) };
    return {
      config,
      num: (key) => {
        const parsed = Number.parseFloat(String(config[key]));
        return Number.isFinite(parsed) ? parsed : 0;
      },
      bool: (key) => ["true", "1", "yes", "on"].includes(String(config[key]).toLowerCase()),
      symbol: config.currency_symbol || "BTP",
    };
  }, [data]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) throw new Error("useConfig must be used inside ConfigProvider");
  return context;
}
