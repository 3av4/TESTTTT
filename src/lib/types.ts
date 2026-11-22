/**
 * أنواع الواجهة — تطابق استجابات الـ API.
 */

export interface ApiEnvelope<T> {
  ok: boolean;
  data: T;
  error?: { code: string; message: string; details?: unknown; meta?: Record<string, unknown> };
}

export interface User {
  id: number;
  telegramId: number;
  username: string | null;
  firstName: string;
  photoUrl: string | null;
  balance: number;
  bankBalance: number;
  role: "user" | "admin";
  isBanned: boolean;
  streak: number;
  lastDaily: string | null;
  referralCode: string | null;
  referralEarnings: number;
  activeTitle: string | null;
  totalWagered: number;
  totalWon: number;
  gamesPlayed: number;
  createdAt: string;
  isAdmin?: boolean;
}

export interface DailyBracket {
  min: number;
  max: number;
  bonusPerDay: number;
  maxBonusDays: number;
  cooldownHours: number;
}

export interface DailyStatus {
  canClaim: boolean;
  nextClaimAt: string | null;
  secondsRemaining: number;
  streak: number;
  estimatedMin: number;
  estimatedMax: number;
  bracket: DailyBracket;
}

export interface DailyClaim extends DailyStatus {
  amount: number;
  base: number;
  streakBonus: number;
  multiplier: number;
  balance: number;
  transactionId: number;
}

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

export interface BankInfo {
  balance: number;
  bankBalance: number;
  capacity: number;
  interestPercent: number;
  minDeposit: number;
  pendingInterest: number;
  lastInterestAt: string | null;
  secondsToInterest: number;
  claims: number;
  history?: Array<{ amount: number; createdAt: string }>;
}

export interface TransactionItem {
  id: number;
  senderId: number | null;
  recipientId: number | null;
  amount: number;
  tax: number;
  fee: number;
  net: number;
  type: string;
  status: string;
  note: string | null;
  source: string;
  balanceAfter: number | null;
  recipientBalanceAfter: number | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  telegramId: number;
  username: string | null;
  name: string;
  activeTitle: string | null;
  balance: number;
  score?: number;
  isMe?: boolean;
}

export interface LeaderboardResult {
  scope: "global" | "group";
  chatId: number | null;
  title: string;
  entries: LeaderboardEntry[];
  me: LeaderboardEntry | null;
  updatedAt: string;
}

export interface GameLimits {
  min: number;
  max: number;
  taxPercent: number;
}

export type GameKind = "dice" | "coinflip" | "slots" | "roulette";

export interface PlayResult {
  game: GameKind;
  bet: number;
  payout: number;
  profit: number;
  tax: number;
  won: boolean;
  result: string;
  details: Record<string, unknown> & { reels?: string[]; multiplier?: number };
  balance: number;
  transactionId: number;
  user?: User | null;
}

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

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  kind: "info" | "success" | "warning" | "danger" | "gift";
  isRead: boolean;
  createdAt: string;
}

export interface ReferralInfo {
  code: string;
  link: string;
  invitedCount: number;
  pendingCount: number;
  paidCount: number;
  earnings: number;
  rewardInviter: number;
  rewardInvitee: number;
  enabled: boolean;
  invited: Array<{ id: number; name: string; status: string; reward: number; createdAt: string }>;
}

export interface Loan {
  id: number;
  principal: number;
  totalDue: number;
  paid: number;
  remaining: number;
  status: "active" | "overdue" | "paid" | "defaulted";
  createdAt: string;
  dueAt: string;
  hoursLeft: number;
  isOverdue: boolean;
}

export interface LoanInfo {
  active: Loan | null;
  history: Array<Pick<Loan, "id" | "principal" | "totalDue" | "paid" | "status" | "createdAt" | "dueAt">>;
  maxAmount: number;
  interestPercent: number;
  durationHours: number;
  totalLoans: number;
  eligible: boolean;
  reason?: string;
}

export interface UserGameStats {
  played: number;
  won: number;
  wagered: number;
  winnings: number;
  biggestWin: number;
}

export interface UserDashboard {
  user: User;
  daily: DailyStatus;
  bank: BankInfo;
  rob: { available: boolean; secondsRemaining: number; nextAt: string | null };
  games: UserGameStats;
  referrals: ReferralInfo;
  loans: { active: Loan | null; eligible: boolean; reason?: string; maxAmount: number; interestPercent: number };
  unreadNotifications: number;
  inventory: { inventory: Record<string, { code: string; qty: number }>; boosts: Record<string, { uses: number; multiplier: number }> };
}

export interface PublicConfig {
  currency_name: string;
  currency_symbol: string;
  daily_min: string;
  daily_max: string;
  daily_cooldown_hours: string;
  streak_bonus_per_day: string;
  streak_bonus_max_days: string;
  transfer_tax_pct: string;
  game_tax_pct: string;
  wealth_tax_pct: string;
  wealth_tax_threshold: string;
  bet_min: string;
  bet_max: string;
  rob_success_pct: string;
  rob_cooldown_minutes: string;
  rob_min: string;
  rob_max: string;
  bank_interest_pct: string;
  bank_min_deposit: string;
  shop_enabled: string;
  referral_enabled: string;
  referral_reward_inviter: string;
  referral_reward_invitee: string;
  announcement: string;
  min_transfer: string;
  max_transfer: string;
  loan_max_amount: string;
  loan_interest_pct: string;
}

export interface PlatformStats {
  users: number;
  activeToday: number;
  totalTransactions: number;
  totalVolume: number;
  treasury: number;
  gamesPlayed: number;
  supply: number;
  dailyPayout24h: number;
}

/* ------------------------------ لوحة الأدمن ------------------------------ */

export interface AdminOverview {
  stats: {
    totalUsers: number;
    totalBalance: number;
    totalBank: number;
    totalTransactions: number;
    totalVolume: number;
    totalTax: number;
    activeToday: number;
    newToday: number;
    bannedCount: number;
    totalGames: number;
    treasury: number;
    totalLoans: number;
  };
  economy: {
    treasury: number;
    totalSupply: number;
    heldByUsers: number;
    heldInBanks: number;
    totalTransactions: number;
    dailyTransactions: number;
    volume24h: number;
    taxesCollected: number;
    taxes24h: number;
    games24h: number;
    gamesVolume24h: number;
    dailyClaims24h: number;
    dailyPayout24h: number;
    activeUsers24h: number;
    newUsers24h: number;
    avgBalance: number;
    topBalance: number;
  };
  sessions: { active: number; today: number };
  loans: { active: number; overdue: number; paid: number; outstanding: number };
  referrals: { total: number; pending: number; paid: number; totalPaidOut: number };
  backups: Array<{ file: string; bytes: number; createdAt: string }>;
  auditCount: number;
  realtime: { connections: number; authenticated: number };
  actor: { id: number; label: string; ip: string | null };
}

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

export interface AdminTransaction {
  id: number;
  senderId: number | null;
  recipientId: number | null;
  senderName: string | null;
  recipientName: string | null;
  amount: number;
  tax: number;
  fee: number;
  net: number;
  type: string;
  status: string;
  note: string | null;
  source: string;
  createdAt: string;
}

export interface AuditLogItem {
  id: number;
  actorId: number | null;
  actorLabel: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
}

export interface RedeemCodeItem {
  code: string;
  amount: number;
  maxUses: number;
  uses: number;
  perUser: number;
  expiresAt: string | null;
  createdAt: string;
  createdBy: number | null;
}

export interface GroupSettingsItem {
  chatId: number;
  title: string | null;
  enabled: boolean;
  gamesEnabled: boolean;
  economyEnabled: boolean;
  welcomeEnabled: boolean;
  dailyEnabled: boolean;
  logTransactions: boolean;
  minBet: number | null;
  maxBet: number | null;
  updatedAt: string;
}
