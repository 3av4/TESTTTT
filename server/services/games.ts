/**
 * الألعاب والمراهنات: نرد، عملة، ماكينة، روليت.
 * كل رهان داخل Transaction واحدة: خصم الرهان → احتساب النتيجة → صرف المكسب → ضريبة أرباح → سجل.
 * النتائج تُحدَّد بـ crypto.randomInt (عشوائية آمنة).
 */
import crypto from "node:crypto";
import { query, queryOne, withTransaction } from "../db.js";
import { errors } from "../errors.js";
import { logger } from "../logger.js";
import { MAX_SAFE_AMOUNT, percentOf, randomInt, toBigNumber } from "../utils.js";
import { getNumber } from "./settings.js";
import { adjustBalance, lockUser, writeTransaction } from "./ledger.js";
import { events } from "./events.js";
import { addToTreasuryTx } from "./settings.js";

export type GameKind = "dice" | "coinflip" | "slots" | "roulette";

export interface GameLimits {
  min: number;
  max: number;
  taxPercent: number;
}

export interface PlayResult {
  game: GameKind;
  bet: number;
  payout: number;
  profit: number;
  tax: number;
  won: boolean;
  result: string;
  details: Record<string, unknown>;
  balance: number;
  transactionId: number;
}

const GAME_LABELS: Record<GameKind, string> = {
  dice: "النرد",
  coinflip: "العملة",
  slots: "الماكينة",
  roulette: "الروليت",
};

export function gameLabel(game: GameKind): string {
  return GAME_LABELS[game];
}

/** حدود الرهان: إعدادات اللعبة الخاصة إن وجدت وإلا العامة */
export async function getLimits(game: GameKind): Promise<GameLimits> {
  const specificKeys = {
    dice: ["dice_min", "dice_max"],
    coinflip: ["coinflip_min", "coinflip_max"],
    slots: ["slots_min", "slots_max"],
    roulette: ["roulette_min", "roulette_max"],
  } as const;
  const [generalMin, generalMax, gameMin, gameMax, taxPercent] = await Promise.all([
    getNumber("bet_min"),
    getNumber("bet_max"),
    getNumber(specificKeys[game][0]),
    getNumber(specificKeys[game][1]),
    getNumber("game_tax_pct"),
  ]);
  const min = Math.round(gameMin || generalMin);
  const max = Math.round(gameMax || generalMax);
  return { min: Math.max(1, min), max: Math.max(min, max), taxPercent };
}

export async function getAllLimits(): Promise<Record<GameKind, GameLimits>> {
  const [dice, coinflip, slots, roulette] = await Promise.all([
    getLimits("dice"),
    getLimits("coinflip"),
    getLimits("slots"),
    getLimits("roulette"),
  ]);
  return { dice, coinflip, slots, roulette };
}

function secureMessage(game: GameKind): string {
  return crypto.randomUUID().slice(0, 8);
}

// ---------------------------------------------------------------- منطق كل لعبة

interface DiceOutcome {
  won: boolean;
  result: string;
  multiplier: number;
  details: Record<string, unknown>;
}

/** نرد: يختار المستخدم "عالٍ" (4-6) أو "منخفض" (1-3) */
export function rollDice(choice: "high" | "low"): DiceOutcome {
  const roll = randomInt(1, 6);
  const isHigh = roll >= 4;
  const won = (choice === "high" && isHigh) || (choice === "low" && !isHigh);
  return {
    won,
    result: `${roll} ${roll >= 4 ? "(عالي)" : "(منخفض)"}`,
    multiplier: 2,
    details: { roll, choice },
  };
}

/** عملة: وجهان */
export function flipCoin(choice: "heads" | "tails"): DiceOutcome {
  const face = randomInt(0, 1) === 0 ? "heads" : "tails";
  const won = face === choice;
  return {
    won,
    result: face === "heads" ? "👑 صورة" : "🦅 كتابة",
    multiplier: 2,
    details: { face, choice },
  };
}

/** ماكينة الحظ: 3 بكرات */
export function spinSlots(): DiceOutcome & { symbols: string[] } {
  const symbols = ["🍒", "🍋", "🔔", "💎", "7️⃣", "⭐"];
  const reels = [symbols[crypto.randomInt(symbols.length)], symbols[crypto.randomInt(symbols.length)], symbols[crypto.randomInt(symbols.length)]];
  let multiplier = 0;
  let label = "خسارة";

  const [a, b, c] = reels;
  if (a === b && b === c) {
    if (a === "7️⃣") multiplier = 10;
    else if (a === "💎") multiplier = 7;
    else if (a === "⭐") multiplier = 6;
    else multiplier = 4;
    label = `ثلاثة ${a}`;
  } else if (a === b || b === c || a === c) {
    multiplier = 1.5;
    label = "زوج";
  }

  return {
    won: multiplier > 0,
    result: `${reels.join(" | ")} — ${label}`,
    multiplier,
    details: { reels, label },
    symbols: reels,
  };
}

export type RouletteColor = "red" | "black" | "green";

/** روليت: أحمر/أسود/أخضر (صفر) */
export function spinRoulette(choice: RouletteColor): DiceOutcome & { color: RouletteColor; number: number } {
  const number = randomInt(0, 36);
  const color: RouletteColor = number === 0 ? "green" : number % 2 === 0 ? "black" : "red";
  const won = color === choice;
  const multiplier = won ? (choice === "green" ? 14 : 2) : 0;
  return {
    won,
    result: `${number} ${color === "green" ? "🟢" : color === "red" ? "🔴" : "⚫"}`,
    multiplier,
    details: { number, color, choice },
    color,
    number,
  };
}

export interface PlayOptions {
  userId: number | string;
  game: GameKind;
  bet: number;
  choice?: string;
  chatId?: number | null;
  source?: "web" | "bot";
  groupLimits?: { min: number | null; max: number | null } | null;
}

/**
 * تنفيذ لعبة واحدة. الرهان يُخصم كاملاً، والمكسب الصافي يُصرف ويُخفَّض بضريبة أرباح.
 */
export async function play(options: PlayOptions): Promise<PlayResult> {
  const { game } = options;
  const bet = Math.round(Number(options.bet));
  if (!Number.isInteger(bet) || bet <= 0) throw errors.badRequest("الرهان يجب أن يكون عدداً صحيحاً موجباً");
  if (bet > MAX_SAFE_AMOUNT) throw errors.badRequest("الرهان كبير جداً");

  const limits = await getLimits(game);
  const min = options.groupLimits?.min ?? limits.min;
  const max = options.groupLimits?.max ?? limits.max;
  if (bet < min) throw errors.badRequest(`أدنى رهان هو ${min} BTP`);
  if (bet > max) throw errors.badRequest(`أعلى رهان هو ${max} BTP`);

  // تحديد النتيجة قبل فتح المعاملة (بدون اتصال بقاعدة البيانات)
  let outcome: DiceOutcome & { symbols?: string[]; color?: RouletteColor; number?: number };
  switch (game) {
    case "dice":
      outcome = rollDice(options.choice === "low" ? "low" : "high");
      break;
    case "coinflip":
      outcome = flipCoin(options.choice === "tails" ? "tails" : "heads");
      break;
    case "slots":
      outcome = spinSlots();
      break;
    case "roulette": {
      const choice = options.choice === "red" || options.choice === "green" ? options.choice : "black";
      outcome = spinRoulette(choice);
      break;
    }
    default:
      throw errors.badRequest("لعبة غير معروفة");
  }

  const executable = await withTransaction(async (client) => {
    const user = await lockUser(client, options.userId);
    if (user.balance < bet) throw errors.insufficientFunds("رصيدك لا يكفي لهذا الرهان");

    const balanceAfterBet = await adjustBalance(client, user.id, -bet);
    const grossPayout = Math.round(bet * outcome.multiplier);
    const grossProfit = grossPayout - bet;
    const tax = grossProfit > 0 ? percentOf(grossProfit, limits.taxPercent) : 0;
    const netPayout = grossPayout - tax;
    let balance = balanceAfterBet;
    if (netPayout > 0) {
      balance = await adjustBalance(client, user.id, netPayout);
    }

    await client.query(
      `UPDATE users SET total_wagered = total_wagered + $1, total_won = total_won + $2, games_played = games_played + 1,
              last_seen_at = now()
       WHERE id = $3`,
      [bet, Math.max(0, netPayout - bet), user.id],
    );

    const txId = await writeTransaction(client, {
      senderId: netPayout > bet ? null : user.id,
      recipientId: netPayout > 0 ? user.id : null,
      amount: bet,
      tax,
      net: netPayout,
      type: outcome.won ? "game_win" : "game_bet",
      note: `${GAME_LABELS[game]}: ${outcome.result}`,
      source: options.source ?? "web",
      balanceAfter: balance,
      metadata: { game, bet, multiplier: outcome.multiplier, result: outcome.result, chatId: options.chatId ?? null },
    });

    await client.query(
      `INSERT INTO games (user_id, chat_id, game, bet, payout, tax, result, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user.id, options.chatId ?? null, game, bet, netPayout, tax, outcome.result, JSON.stringify({ ...outcome.details, multiplier: outcome.multiplier })],
    );

    if (tax > 0) await addToTreasuryTx(client, tax);

    return {
      balance,
      txId,
      netPayout,
      tax,
      won: outcome.won,
    };
  });

  const result: PlayResult = {
    game,
    bet,
    payout: executable.netPayout,
    profit: executable.netPayout - bet,
    tax: executable.tax,
    won: executable.won,
    result: outcome.result,
    details: { ...outcome.details, multiplier: outcome.multiplier, nonce: secureMessage(game) },
    balance: executable.balance,
    transactionId: executable.txId,
  };

  events.emitEvent("balance", {
    userId: Number(options.userId),
    balance: result.balance,
    change: result.payout - bet,
    reason: result.won ? "game_win" : "game_bet",
  });
  events.emitEvent("game", {
    userId: Number(options.userId),
    game,
    bet,
    payout: result.payout,
    result: result.result,
    balance: result.balance,
  });
  events.emitEvent("transaction", {
    userId: Number(options.userId),
    transactionId: result.transactionId,
    senderId: bet > 0 ? Number(options.userId) : null,
    recipientId: Number(options.userId),
    amount: bet,
    tax: result.tax,
    net: result.payout,
    type: result.won ? "game_win" : "game_bet",
    direction: result.won ? "in" : "out",
    note: `${GAME_LABELS[game]}: ${result.result}`,
  });

  logger.debug("لعب", { game, userId: options.userId, bet, won: result.won, payout: result.payout });
  return result;
}

/** إحصائيات ألعاب مستخدم */
export async function getUserGameStats(userId: number | string): Promise<{
  played: number;
  won: number;
  wagered: number;
  winnings: number;
  biggestWin: number;
}> {
  const row = await queryOne<Record<string, string | null>>(
    `SELECT count(*) AS played,
            count(*) FILTER (WHERE payout > bet) AS won,
            COALESCE(sum(bet), 0) AS wagered,
            COALESCE(sum(payout), 0) AS winnings,
            COALESCE(max(payout), 0) AS biggest_win
     FROM games WHERE user_id = $1`,
    [userId],
  );
  return {
    played: toBigNumber(row?.played),
    won: toBigNumber(row?.won),
    wagered: toBigNumber(row?.wagered),
    winnings: toBigNumber(row?.winnings),
    biggestWin: toBigNumber(row?.biggest_win),
  };
}

/** أكثر اللاعبين ربحاً */
export async function getTopGamblers(limit = 10): Promise<Array<{ userId: number; username: string | null; name: string; netProfit: number }>> {
  const rows = await query<{ user_id: string; username: string | null; first_name: string | null; net: string }>(
    `SELECT g.user_id, u.username, u.first_name, sum(g.payout - g.bet) AS net
     FROM games g JOIN users u ON u.id = g.user_id
     GROUP BY g.user_id, u.username, u.first_name
     ORDER BY net DESC LIMIT $1`,
    [Math.min(limit, 50)],
  );
  return rows.map((row) => ({
    userId: toBigNumber(row.user_id),
    username: row.username,
    name: row.first_name ?? "لاعب",
    netProfit: toBigNumber(row.net),
  }));
}
