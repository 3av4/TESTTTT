/* =============================================================================
 * BitPoin (BTP) — المحرك الاقتصادي في المتصفح
 * نسخة تعمل بلا خادم (GitHub Pages). تُخزِّن الحالة في localStorage.
 * نفس المنطق المالي الموجود في server/services/ (أعداد صحيحة فقط).
 * ============================================================================= */
(function (global) {
  "use strict";

  var STORAGE_KEY = "bitpoin.state.v1";
  var CURRENCY = "BTP";

  var DEFAULTS = {
    startBalance: 1000,
    dailyMin: 100,
    dailyMax: 400,
    dailyCooldownHours: 24,
    streakBonusPerDay: 30,
    streakBonusMaxDays: 7,
    transferTaxPct: 5,
    gameTaxPct: 5,
    minTransfer: 10,
    maxTransfer: 1000000,
    betMin: 10,
    betMax: 5000,
    robSuccessPct: 40,
    robCooldownMinutes: 30,
    robMin: 50,
    robMax: 5000,
    robPenaltyPct: 20,
    bankInterestPct: 0.5,
    bankMinDeposit: 100,
    bankCapacity: 1000000,
    referralInviter: 300,
    referralInvitee: 150,
    loanMax: 5000,
    loanInterestPct: 10,
    loanDurationHours: 24,
    wealthTaxPct: 0,
    wealthTaxThreshold: 100000,
  };

  /* ----------------------------- أدوات عشوائية آمنة ----------------------------- */
  function rand(min, max) {
    if (global.crypto && global.crypto.getRandomValues) {
      var range = max - min + 1;
      var limit = Math.floor(0xffffffff / range) * range;
      var arr = new Uint32Array(1);
      var value;
      do {
        global.crypto.getRandomValues(arr);
        value = arr[0];
      } while (value >= limit);
      return min + (value % range);
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pick(list) {
    return list[rand(0, list.length - 1)];
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* --------------------------------- الحالة --------------------------------- */
  function defaultState() {
    return {
      version: 1,
      user: null,
      users: {},
      transactions: [],
      games: [],
      codes: {},
      notifications: [],
      loans: [],
      groupSettings: {},
      settings: Object.assign({}, DEFAULTS),
      seq: 1,
    };
  }

  var state = null;

  function load() {
    if (state) return state;
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1) {
          state = Object.assign(defaultState(), parsed);
          state.settings = Object.assign({}, DEFAULTS, parsed.settings || {});
          return state;
        }
      }
    } catch (error) {
      /* تجاهل — نبدأ من جديد */
    }
    state = defaultState();
    return state;
  }

  function persist() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn("تعذّر حفظ البيانات محلياً", error);
    }
  }

  function nextSeq() {
    state.seq = (state.seq || 1) + 1;
    return state.seq;
  }

  /* ------------------------------ معاملات ذرّية ------------------------------ */
  /** تعديل الرصيد بشكل ذرّي — يرفض أي رصيد سالب (كقيد CHECK في القاعدة) */
  function adjust(userId, delta) {
    var user = state.users[userId];
    if (!user) throw makeError("USER_NOT_FOUND", "المستخدم غير موجود");
    var next = user.balance + delta;
    if (!Number.isInteger(next)) throw makeError("INVALID_AMOUNT", "المبلغ يجب أن يكون عدداً صحيحاً");
    if (next < 0) throw makeError("INSUFFICIENT_FUNDS", "رصيدك غير كافٍ");
    user.balance = next;
    return next;
  }

  function writeTransaction(entry) {
    var tx = {
      id: nextSeq(),
      type: entry.type,
      senderId: entry.senderId || null,
      recipientId: entry.recipientId || null,
      amount: entry.amount,
      tax: entry.tax || 0,
      net: entry.net === undefined ? entry.amount : entry.net,
      note: entry.note || "",
      source: entry.source || "web",
      balanceAfter: entry.balanceAfter === undefined ? null : entry.balanceAfter,
      createdAt: nowIso(),
    };
    state.transactions.unshift(tx);
    if (state.transactions.length > 500) state.transactions.length = 500;
    persist();
    return tx;
  }

  function makeError(code, message) {
    var error = new Error(message);
    error.code = code;
    return error;
  }

  /* -------------------------------- المستخدم -------------------------------- */
  function createUser(profile) {
    load();
    var id = profile.id || "u_" + newId();
    var existing = state.users[id];
    if (existing) {
      existing.name = profile.name || existing.name;
      if (profile.username) existing.username = String(profile.username).replace(/^@/, "").toLowerCase();
      if (profile.isAdmin) existing.isAdmin = true;
      state.user = id;
      persist();
      return existing;
    }
    var user = {
      id: id,
      name: profile.name || "لاعب",
      username: profile.username || null,
      photo: profile.photo || null,
      balance: state.settings.startBalance,
      bankBalance: 0,
      streak: 0,
      lastDaily: null,
      lastRob: null,
      lastBankInterest: nowIso(),
      isAdmin: Boolean(profile.isAdmin),
      isBanned: false,
      activeTitle: null,
      inventory: {},
      totalWagered: 0,
      totalWon: 0,
      gamesPlayed: 0,
      referralCode: "BTP" + String(id).replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase(),
      referrals: [],
      createdAt: nowIso(),
    };
    state.users[id] = user;
    state.user = id;
    persist();
    return user;
  }

  function currentUser() {
    load();
    if (!state.user) return null;
    var user = state.users[state.user];
    if (!user) return null;
    creditBankInterest(user);
    return user;
  }

  function logout() {
    load();
    state.user = null;
    persist();
  }

  /* استعادة جلسة مستخدم موجود (بلا إنشاء جديد) */
  function login(idOrUsername) {
    load();
    var key = String(idOrUsername || "").replace(/^@/, "").trim();
    if (!key) throw makeError("INVALID_INPUT", "أدخل الاسم أو المعرّف");
    var user = state.users[key];
    if (!user) {
      var lower = key.toLowerCase();
      user = Object.values(state.users).find(function (u) {
        return (u.username && u.username.toLowerCase() === lower) || (u.name && u.name === key);
      });
    }
    if (!user) throw makeError("NOT_FOUND", "لا يوجد حساب بهذا الاسم على هذا الجهاز");
    if (user.isBanned) throw makeError("BANNED", "هذا الحساب محظور");
    state.user = user.id;
    persist();
    return user;
  }

  function listUsers() {
    load();
    return Object.values(state.users).map(function (u) {
      return { id: u.id, name: u.name, username: u.username, balance: u.balance, isAdmin: u.isAdmin };
    });
  }

  function updateProfile(patch) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    if (patch.name) user.name = String(patch.name).slice(0, 40);
    if (patch.username !== undefined) user.username = patch.username ? String(patch.username).replace(/^@/, "").slice(0, 32) : null;
    if (patch.telegramLinked !== undefined) user.telegramLinked = Boolean(patch.telegramLinked);
    if (patch.telegramUsername !== undefined) user.telegramUsername = patch.telegramUsername || null;
    persist();
    return user;
  }

  /* --------------------------------- الراتب --------------------------------- */
  function dailyStatus(user) {
    var settings = state.settings;
    if (!user.lastDaily) {
      return {
        canClaim: true,
        secondsRemaining: 0,
        nextClaimAt: null,
        streak: user.streak,
        estimatedMin: settings.dailyMin + Math.min(user.streak, settings.streakBonusMaxDays) * settings.streakBonusPerDay,
        estimatedMax: settings.dailyMax + Math.min(user.streak, settings.streakBonusMaxDays) * settings.streakBonusPerDay,
      };
    }
    var last = new Date(user.lastDaily).getTime();
    var cooldownMs = settings.dailyCooldownHours * 3600000;
    var remaining = last + cooldownMs - Date.now();
    return {
      canClaim: remaining <= 0,
      secondsRemaining: Math.max(0, Math.ceil(remaining / 1000)),
      nextClaimAt: new Date(last + cooldownMs).toISOString(),
      streak: user.streak,
      estimatedMin: settings.dailyMin + Math.min(user.streak, settings.streakBonusMaxDays) * settings.streakBonusPerDay,
      estimatedMax: settings.dailyMax + Math.min(user.streak, settings.streakBonusMaxDays) * settings.streakBonusPerDay,
    };
  }

  function claimDaily() {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var status = dailyStatus(user);
    if (!status.canClaim) {
      var error = makeError("COOLDOWN", "لم يحن موعد راتبك اليومي بعد");
      error.meta = { secondsRemaining: status.secondsRemaining, nextClaimAt: status.nextClaimAt };
      throw error;
    }
    var settings = state.settings;
    var base = rand(settings.dailyMin, settings.dailyMax);
    var streakBonus = Math.min(user.streak, settings.streakBonusMaxDays) * settings.streakBonusPerDay;
    var amount = base + streakBonus;
    var balance = adjust(user.id, amount);
    user.streak = user.streak + 1;
    user.lastDaily = nowIso();
    var tx = writeTransaction({ type: "daily", recipientId: user.id, amount: amount, net: amount, balanceAfter: balance, note: "راتب يومي — سلسلة " + user.streak });
    persist();
    return { amount: amount, base: base, streakBonus: streakBonus, streak: user.streak, balance: balance, transactionId: tx.id };
  }

  /* -------------------------------- التحويل -------------------------------- */
  function transferPreview(amount) {
    var settings = state.settings;
    amount = Math.round(Number(amount) || 0);
    var tax = Math.round((amount * settings.transferTaxPct) / 100);
    return { amount: amount, tax: tax, net: amount - tax, taxPercent: settings.transferTaxPct };
  }

  function transfer(targetName, amount) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var settings = state.settings;
    amount = Math.round(Number(amount) || 0);
    if (!Number.isInteger(amount) || amount <= 0) throw makeError("INVALID_AMOUNT", "أدخل مبلغاً صحيحاً موجباً");
    if (amount < settings.minTransfer) throw makeError("INVALID_AMOUNT", "أدنى تحويل " + settings.minTransfer + " BTP");
    if (amount > settings.maxTransfer) throw makeError("INVALID_AMOUNT", "أقصى تحويل " + settings.maxTransfer + " BTP");
    if (amount > user.balance) throw makeError("INSUFFICIENT_FUNDS", "رصيدك غير كافٍ");
    var target = findUser(targetName);
    if (!target) throw makeError("NOT_FOUND", "لم يُعثر على المستخدم المستهدف");
    if (target.id === user.id) throw makeError("INVALID_TARGET", "لا يمكنك التحويل لنفسك");
    if (target.isBanned) throw makeError("BANNED", "حساب المستلم محظور");

    var preview = transferPreview(amount);
    var senderBalance = adjust(user.id, -amount);
    var recipientBalance = adjust(target.id, preview.net);
    var tx = writeTransaction({
      type: "transfer",
      senderId: user.id,
      recipientId: target.id,
      amount: amount,
      tax: preview.tax,
      net: preview.net,
      balanceAfter: senderBalance,
      note: "تحويل إلى " + target.name,
    });
    pushNotification(target.id, "💰 وصلك تحويل", "استلمت " + preview.net + " BTP من " + user.name);
    persist();
    return {
      transactionId: tx.id,
      amount: amount,
      tax: preview.tax,
      net: preview.net,
      senderBalance: senderBalance,
      recipientBalance: recipientBalance,
      recipientName: target.name,
      taxPercent: preview.taxPercent,
    };
  }

  function findUser(query) {
    if (!query) return null;
    var clean = String(query).trim().replace(/^@/, "").toLowerCase();
    var users = Object.values(state.users);
    for (var i = 0; i < users.length; i++) {
      var user = users[i];
      if (user.id.toLowerCase() === clean) return user;
      if (user.username && user.username.toLowerCase() === clean) return user;
      if (user.name.toLowerCase() === clean) return user;
      if (user.referralCode.toLowerCase() === clean) return user;
    }
    return null;
  }

  /* --------------------------------- البنك --------------------------------- */
  function creditBankInterest(user) {
    var settings = state.settings;
    if (!user.bankBalance || user.bankBalance <= 0) return 0;
    var last = new Date(user.lastBankInterest || user.createdAt).getTime();
    var elapsedDays = Math.floor((Date.now() - last) / 86400000);
    if (elapsedDays < 1) return 0;
    var interest = Math.floor((user.bankBalance * settings.bankInterestPct * elapsedDays) / 100);
    if (interest <= 0) return 0;
    user.bankBalance += interest;
    user.lastBankInterest = nowIso();
    writeTransaction({ type: "bank_interest", recipientId: user.id, amount: interest, net: interest, balanceAfter: user.balance, note: "فائدة بنكية " + elapsedDays + " يوم" });
    pushNotification(user.id, "🏦 فائدة بنكية", "أُضيفت " + interest + " BTP إلى رصيدك البنكي");
    return interest;
  }

  function bankInfo() {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var settings = state.settings;
    var last = new Date(user.lastBankInterest || user.createdAt).getTime();
    var nextAt = last + 86400000;
    var pending = Math.floor((user.bankBalance * settings.bankInterestPct) / 100);
    return {
      balance: user.balance,
      bankBalance: user.bankBalance,
      capacity: settings.bankCapacity,
      interestPercent: settings.bankInterestPct,
      minDeposit: settings.bankMinDeposit,
      pendingInterest: pending,
      secondsToInterest: Math.max(0, Math.ceil((nextAt - Date.now()) / 1000)),
      lastInterestAt: user.lastBankInterest,
    };
  }

  function deposit(amount) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var settings = state.settings;
    amount = Math.round(Number(amount) || 0);
    if (amount < settings.bankMinDeposit) throw makeError("INVALID_AMOUNT", "أدنى إيداع " + settings.bankMinDeposit + " BTP");
    if (user.bankBalance + amount > settings.bankCapacity) throw makeError("LIMIT", "تجاوزت سعة البنك");
    if (amount > user.balance) throw makeError("INSUFFICIENT_FUNDS", "رصيدك النقدي غير كافٍ");
    adjust(user.id, -amount);
    user.bankBalance += amount;
    creditBankInterest(user);
    writeTransaction({ type: "bank_deposit", senderId: user.id, amount: amount, net: amount, balanceAfter: user.balance, note: "إيداع بنكي" });
    persist();
    return bankInfo();
  }

  function withdraw(amount) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    amount = Math.round(Number(amount) || 0);
    if (amount <= 0) throw makeError("INVALID_AMOUNT", "أدخل مبلغاً صحيحاً");
    if (amount > user.bankBalance) throw makeError("INSUFFICIENT_FUNDS", "رصيدك البنكي غير كافٍ");
    creditBankInterest(user);
    user.bankBalance -= amount;
    adjust(user.id, amount);
    writeTransaction({ type: "bank_withdraw", recipientId: user.id, amount: amount, net: amount, balanceAfter: user.balance, note: "سحب بنكي" });
    persist();
    return bankInfo();
  }

  /* --------------------------------- الألعاب --------------------------------- */
  var SLOT_SYMBOLS = ["🍒", "🍋", "🔔", "💎", "7️⃣", "⭐"];

  function gameLimits(game) {
    var settings = state.settings;
    return { min: settings.betMin, max: settings.betMax, taxPercent: settings.gameTaxPct };
  }

  function play(game, bet, choice) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var settings = state.settings;
    bet = Math.round(Number(bet) || 0);
    if (!Number.isInteger(bet) || bet <= 0) throw makeError("INVALID_AMOUNT", "أدخل رهاناً صحيحاً");
    if (bet < settings.betMin) throw makeError("INVALID_AMOUNT", "أدنى رهان " + settings.betMin + " BTP");
    if (bet > settings.betMax) throw makeError("INVALID_AMOUNT", "أقصى رهان " + settings.betMax + " BTP");
    if (bet > user.balance) throw makeError("INSUFFICIENT_FUNDS", "رصيدك غير كافٍ");

    var outcome = resolveGame(game, choice);
    adjust(user.id, -bet);
    var payout = 0;
    var tax = 0;
    if (outcome.won) {
      var gross = Math.round(bet * outcome.multiplier);
      var profit = gross - bet;
      tax = Math.round((profit * settings.gameTaxPct) / 100);
      payout = gross - tax;
      adjust(user.id, payout);
      user.totalWon += payout;
    }
    user.totalWagered += bet;
    user.gamesPlayed += 1;

    var tx = writeTransaction({
      type: outcome.won ? "game_win" : "game_bet",
      senderId: outcome.won ? null : user.id,
      recipientId: outcome.won ? user.id : null,
      amount: outcome.won ? payout : bet,
      tax: tax,
      net: outcome.won ? payout : bet,
      balanceAfter: user.balance,
      note: gameLabel(game) + " — " + outcome.result,
    });
    state.games.unshift({ id: tx.id, game: game, bet: bet, payout: payout, won: outcome.won, result: outcome.result, at: nowIso() });
    if (state.games.length > 200) state.games.length = 200;
    persist();

    return {
      game: game,
      bet: bet,
      payout: payout,
      profit: outcome.won ? payout - bet : -bet,
      tax: tax,
      won: outcome.won,
      result: outcome.result,
      details: outcome.details || {},
      balance: user.balance,
      transactionId: tx.id,
    };
  }

  function resolveGame(game, choice) {
    if (game === "dice") {
      var roll = rand(1, 6);
      var high = roll >= 4;
      var pickedHigh = choice !== "low";
      var won = pickedHigh ? high : !high;
      return { won: won, multiplier: 2, result: roll + (high ? " (عالي)" : " (منخفض)"), details: { roll: roll } };
    }
    if (game === "coinflip") {
      var face = rand(0, 1) === 0 ? "heads" : "tails";
      var picked = choice === "tails" ? "tails" : "heads";
      var win = face === picked;
      return { won: win, multiplier: 2, result: face === "heads" ? "👑 صورة" : "🦅 كتابة", details: { face: face } };
    }
    if (game === "slots") {
      var reels = [pick(SLOT_SYMBOLS), pick(SLOT_SYMBOLS), pick(SLOT_SYMBOLS)];
      var multiplier = 0;
      var label = reels.join(" | ") + " — خسارة";
      if (reels[0] === reels[1] && reels[1] === reels[2]) {
        multiplier = reels[0] === "7️⃣" ? 10 : reels[0] === "💎" ? 7 : 6;
        label = reels.join(" | ") + " — ثلاثة متطابقة";
      } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
        multiplier = 1.5;
        label = reels.join(" | ") + " — زوج";
      }
      return { won: multiplier > 0, multiplier: multiplier, result: label, details: { reels: reels } };
    }
    if (game === "roulette") {
      var number = rand(0, 36);
      var color = number === 0 ? "green" : number % 2 === 0 ? "black" : "red";
      var pickColor = choice === "red" || choice === "black" || choice === "green" ? choice : "red";
      var wonR = color === pickColor;
      var mark = color === "green" ? "🟢" : color === "red" ? "🔴" : "⚫";
      return { won: wonR, multiplier: color === "green" ? 14 : 2, result: number + " " + mark, details: { number: number, color: color } };
    }
    throw makeError("INVALID_GAME", "لعبة غير معروفة");
  }

  function gameLabel(game) {
    return { dice: "🎲 النرد", coinflip: "🪙 العملة", slots: "🎰 الماكينة", roulette: "🎡 الروليت" }[game] || game;
  }

  function gameStats(user) {
    var games = state.games.filter(function (g) {
      return g.won || g.payout === 0;
    });
    var mine = state.transactions.filter(function (t) {
      return (t.senderId === user.id || t.recipientId === user.id) && (t.type === "game_win" || t.type === "game_bet");
    });
    var wagered = mine.filter(function (t) { return t.type === "game_bet"; }).reduce(function (sum, t) { return sum + t.amount; }, 0);
    var winnings = mine.filter(function (t) { return t.type === "game_win"; }).reduce(function (sum, t) { return sum + t.amount; }, 0);
    var won = mine.filter(function (t) { return t.type === "game_win"; }).length;
    return { played: user.gamesPlayed, won: won, wagered: wagered, winnings: winnings, biggestWin: winnings, allGames: games.length };
  }

  /* -------------------------------- السرقة -------------------------------- */
  function robStatus() {
    var user = currentUser();
    if (!user || !user.lastRob) return { available: true, secondsRemaining: 0 };
    var cooldown = state.settings.robCooldownMinutes * 60000;
    var remain = new Date(user.lastRob).getTime() + cooldown - Date.now();
    return { available: remain <= 0, secondsRemaining: Math.max(0, Math.ceil(remain / 1000)) };
  }

  function rob(targetName) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var status = robStatus();
    if (!status.available) throw makeError("COOLDOWN", "انتظر " + status.secondsRemaining + " ثانية قبل المحاولة مجدداً");
    var settings = state.settings;
    var target = findUser(targetName);
    if (!target) throw makeError("NOT_FOUND", "لم يُعثر على الضحية");
    if (target.id === user.id) throw makeError("INVALID_TARGET", "لا يمكنك سرقة نفسك");
    if (target.isBanned) throw makeError("BANNED", "لا يمكن سرقة حساب محظور");

    user.lastRob = nowIso();
    var roll = rand(1, 100);
    var success = roll <= settings.robSuccessPct;
    var amount = Math.min(rand(settings.robMin, settings.robMax), Math.floor(target.balance * 0.5));

    if (success && amount > 0) {
      adjust(target.id, -amount);
      adjust(user.id, amount);
      writeTransaction({ type: "rob", senderId: target.id, recipientId: user.id, amount: amount, net: amount, balanceAfter: user.balance, note: "سرقة ناجحة" });
      pushNotification(target.id, "🥷 تعرّضت للسرقة", "سُرق منك " + amount + " BTP");
      persist();
      return { success: true, roll: roll, amount: amount, balance: user.balance, message: "نجحت السرقة! +" + amount + " BTP" };
    }
    var penalty = Math.min(Math.floor((user.balance * settings.robPenaltyPct) / 100), user.balance);
    if (penalty > 0) {
      adjust(user.id, -penalty);
      adjust(target.id, penalty);
      writeTransaction({ type: "rob_penalty", senderId: user.id, recipientId: target.id, amount: penalty, net: penalty, balanceAfter: user.balance, note: "عقوبة سرقة فاشلة" });
    }
    persist();
    return { success: false, roll: roll, amount: penalty, balance: user.balance, message: "فشلت السرقة! خسرت " + penalty + " BTP" };
  }

  /* -------------------------------- المتجر -------------------------------- */
  var SHOP_ITEMS = [
    { code: "title_whale", name: "لقب الحوت", icon: "🐋", price: 2500, kind: "title", title: "🐋 الحوت", description: "لقب هيبة يظهر بجانب اسمك في الموقع والبوت." },
    { code: "title_king", name: "لقب الملك", icon: "👑", price: 5000, kind: "title", title: "👑 الملك", description: "أفخم الألقاب — للمتصدرين فقط." },
    { code: "title_shark", name: "لقب القرش", icon: "🦈", price: 3000, kind: "title", title: "🦈 القرش", description: "لأصحاب الجرأة في الألعاب." },
    { code: "title_ghost", name: "لقب الشبح", icon: "👻", price: 1800, kind: "title", title: "👻 الشبح", description: "لا يرونك قادماً…" },
    { code: "boost_daily_x15", name: "مضاعف الراتب", icon: "⚡", price: 1200, kind: "boost", description: "راتبك القادم ×1.5." },
    { code: "shield_rob", name: "درع الحماية", icon: "🛡️", price: 800, kind: "shield", description: "يصد أول محاولة سرقة ضدك." },
    { code: "badge_verified", name: "شارة الموثّق", icon: "✅", price: 10000, kind: "badge", title: "✅ موثّق", description: "شارة توثيق دائمة بجانب اسمك." },
    { code: "badge_lucky", name: "شارة المحظوظ", icon: "🍀", price: 4000, kind: "badge", title: "🍀 محظوظ", description: "شارة تُظهر جرأتك في الحظ." },
  ];

  function shopItems() {
    var user = currentUser();
    return SHOP_ITEMS.map(function (item) {
      var owned = user && user.inventory[item.code] ? user.inventory[item.code].qty : 0;
      return Object.assign({}, item, { owned: owned, isActive: true, stock: null });
    });
  }

  function buyItem(code, quantity) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    quantity = Math.max(1, Math.round(Number(quantity) || 1));
    var item = SHOP_ITEMS.find(function (i) { return i.code === code; });
    if (!item) throw makeError("NOT_FOUND", "العنصر غير موجود");
    if (item.kind === "badge" && user.inventory[code]) throw makeError("ALREADY_OWNED", "تملك هذه الشارة بالفعل");
    var total = item.price * quantity;
    if (total > user.balance) throw makeError("INSUFFICIENT_FUNDS", "تحتاج " + total + " BTP لإتمام الشراء");
    adjust(user.id, -total);
    var entry = user.inventory[code] || { code: code, qty: 0, name: item.name, icon: item.icon };
    entry.qty += quantity;
    user.inventory[code] = entry;
    if (item.kind === "title" || item.kind === "badge") user.activeTitle = item.title;
    writeTransaction({ type: "shop_purchase", senderId: user.id, amount: total, net: total, balanceAfter: user.balance, note: "شراء " + item.name });
    persist();
    return { message: item.kind === "title" || item.kind === "badge" ? "تم تفعيل «" + item.name + "»" : "أُضيف " + item.name + " إلى حقيبتك", balance: user.balance, activeTitle: user.activeTitle };
  }

  function equipTitle(code) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var entry = user.inventory[code];
    if (!entry) throw makeError("NOT_OWNED", "لا تملك هذا العنصر");
    var item = SHOP_ITEMS.find(function (i) { return i.code === code; });
    if (!item || !item.title) throw makeError("INVALID", "هذا العنصر ليس لقباً");
    user.activeTitle = item.title;
    persist();
    return item.title;
  }

  function unequipTitle() {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    user.activeTitle = null;
    persist();
    return null;
  }

  /* -------------------------------- الإحالات -------------------------------- */
  function referralInfo() {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var paid = user.referrals.filter(function (r) { return r.paid; });
    return {
      code: user.referralCode,
      link: "https://t.me/Bitpoin_bot?start=ref_" + user.referralCode,
      invitedCount: user.referrals.length,
      pendingCount: user.referrals.length - paid.length,
      paidCount: paid.length,
      earnings: user.referralEarnings || 0,
      rewardInviter: state.settings.referralInviter,
      rewardInvitee: state.settings.referralInvitee,
      invited: user.referrals.map(function (r) {
        return { id: r.id, name: r.name, status: r.paid ? "paid" : "pending", reward: r.reward || 0, createdAt: r.at };
      }),
    };
  }

  function applyReferral(code) {
    var user = currentUser();
    if (!user || !code) return false;
    var clean = String(code).toUpperCase().replace(/^REF_/, "");
    var inviter = Object.values(state.users).find(function (u) { return u.referralCode === clean && u.id !== user.id; });
    if (!inviter) return false;
    var already = inviter.referrals.some(function (r) { return r.id === user.id; });
    if (already) return false;
    inviter.referrals.push({ id: user.id, name: user.name, paid: false, reward: 0, at: nowIso() });
    user.referredBy = inviter.id;
    persist();
    return true;
  }

  /** يُدفع للداعي والمدعو عند أول نشاط حقيقي */
  function payoutReferral() {
    var user = currentUser();
    if (!user || !user.referredBy) return null;
    var inviter = state.users[user.referredBy];
    if (!inviter) return null;
    var claim = inviter.referrals.find(function (r) { return r.id === user.id; });
    if (!claim || claim.paid) return null;
    var settings = state.settings;
    claim.paid = true;
    claim.reward = settings.referralInviter;
    inviter.referralEarnings = (inviter.referralEarnings || 0) + settings.referralInviter;
    adjust(inviter.id, settings.referralInviter);
    adjust(user.id, settings.referralInvitee);
    writeTransaction({ type: "referral", recipientId: user.id, amount: settings.referralInvitee, net: settings.referralInvitee, balanceAfter: user.balance, note: "مكافأة إحالة" });
    pushNotification(inviter.id, "🎉 مكافأة إحالة", "انضم " + user.name + " عبر رابطك — +" + settings.referralInviter + " BTP");
    persist();
    return { inviterReward: settings.referralInviter, inviteeReward: settings.referralInvitee };
  }

  /* -------------------------------- التنبيهات -------------------------------- */
  function pushNotification(userId, title, body, kind) {
    state.notifications.unshift({ id: nextSeq(), userId: userId, title: title, body: body || "", kind: kind || "info", read: false, at: nowIso() });
    if (state.notifications.length > 200) state.notifications.length = 200;
  }

  function notifications() {
    var user = currentUser();
    if (!user) return { items: [], unread: 0 };
    var mine = state.notifications.filter(function (n) { return n.userId === user.id; });
    return {
      items: mine.slice(0, 50).map(function (n) { return { id: n.id, title: n.title, body: n.body, kind: n.kind, isRead: n.read, createdAt: n.at }; }),
      unread: mine.filter(function (n) { return !n.read; }).length,
    };
  }

  function markNotificationsRead() {
    var user = currentUser();
    if (!user) return;
    state.notifications.forEach(function (n) {
      if (n.userId === user.id) n.read = true;
    });
    persist();
  }

  /* -------------------------------- المعاملات -------------------------------- */
  function transactions(filters) {
    var user = currentUser();
    if (!user) return { items: [], total: 0 };
    filters = filters || {};
    var mine = state.transactions.filter(function (tx) {
      if (tx.senderId !== user.id && tx.recipientId !== user.id) return false;
      if (filters.type && tx.type !== filters.type) return false;
      return true;
    });
    var limit = filters.limit || 30;
    var offset = filters.offset || 0;
    return { items: mine.slice(offset, offset + limit), total: mine.length };
  }

  /* --------------------------------- القروض --------------------------------- */
  function loanInfo() {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var active = state.loans.find(function (l) { return l.userId === user.id && l.status !== "paid"; });
    var settings = state.settings;
    return {
      active: active || null,
      history: state.loans.filter(function (l) { return l.userId === user.id; }).slice(0, 10),
      maxAmount: settings.loanMax,
      interestPercent: settings.loanInterestPct,
      durationHours: settings.loanDurationHours,
      eligible: !active && user.gamesPlayed >= 0,
      reason: active ? "لديك قرض نشط" : undefined,
    };
  }

  function takeLoan(amount) {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var settings = state.settings;
    amount = Math.round(Number(amount) || 0);
    if (amount < 100) throw makeError("INVALID_AMOUNT", "أدنى قرض 100 BTP");
    if (amount > settings.loanMax) throw makeError("INVALID_AMOUNT", "أقصى قرض " + settings.loanMax + " BTP");
    if (state.loans.some(function (l) { return l.userId === user.id && l.status !== "paid"; })) throw makeError("CONFLICT", "لديك قرض نشط بالفعل");
    var totalDue = Math.round(amount * (1 + settings.loanInterestPct / 100));
    var loan = { id: nextSeq(), userId: user.id, principal: amount, totalDue: totalDue, paid: 0, status: "active", createdAt: nowIso(), dueAt: new Date(Date.now() + settings.loanDurationHours * 3600000).toISOString() };
    state.loans.unshift(loan);
    adjust(user.id, amount);
    writeTransaction({ type: "loan", recipientId: user.id, amount: amount, net: amount, balanceAfter: user.balance, note: "قرض — إجمالي السداد " + totalDue });
    persist();
    return loan;
  }

  function repayLoan() {
    var user = currentUser();
    if (!user) throw makeError("UNAUTHORIZED", "يجب تسجيل الدخول");
    var loan = state.loans.find(function (l) { return l.userId === user.id && l.status !== "paid"; });
    if (!loan) throw makeError("NOT_FOUND", "لا يوجد قرض نشط");
    var remaining = loan.totalDue - loan.paid;
    if (remaining > user.balance) throw makeError("INSUFFICIENT_FUNDS", "تحتاج " + remaining + " BTP للسداد");
    adjust(user.id, -remaining);
    loan.paid = loan.totalDue;
    loan.status = "paid";
    writeTransaction({ type: "loan_repay", senderId: user.id, amount: remaining, net: remaining, balanceAfter: user.balance, note: "سداد قرض" });
    persist();
    return { message: "تم سداد القرض بالكامل", balance: user.balance };
  }

  /* -------------------------------- الترتيب -------------------------------- */
  function leaderboard(scope) {
    var users = Object.values(state.users).filter(function (u) { return !u.isBanned; });
    if (scope === "games") {
      users = users.slice().sort(function (a, b) { return (b.totalWon - b.totalWagered) - (a.totalWon - a.totalWagered); });
    } else if (scope === "referrals") {
      users = users.filter(function (u) { return u.referrals.length > 0; }).sort(function (a, b) { return b.referrals.length - a.referrals.length; });
    } else {
      users = users.slice().sort(function (a, b) { return b.balance - a.balance; });
    }
    var me = currentUser();
    return {
      scope: scope || "global",
      entries: users.slice(0, 50).map(function (u, index) {
        return {
          rank: index + 1,
          userId: u.id,
          telegramId: 0,
          username: u.username,
          name: u.name,
          activeTitle: u.activeTitle,
          balance: u.balance,
          score: scope === "referrals" ? u.referrals.length : scope === "games" ? u.totalWon - u.totalWagered : undefined,
          isMe: me ? me.id === u.id : false,
        };
      }),
      me: me ? { rank: users.findIndex(function (u) { return u.id === me.id; }) + 1, userId: me.id, name: me.name, username: me.username, balance: me.balance, activeTitle: me.activeTitle, telegramId: 0, isMe: true } : null,
      updatedAt: nowIso(),
    };
  }

  /* --------------------------------- الإحصاءات --------------------------------- */
  function stats() {
    var users = Object.values(state.users);
    return {
      users: users.length,
      activeToday: users.length,
      totalTransactions: state.transactions.length,
      totalVolume: state.transactions.reduce(function (s, t) { return s + t.amount; }, 0),
      treasury: state.transactions.reduce(function (s, t) { return s + (t.tax || 0); }, 0),
      gamesPlayed: state.games.length,
      supply: users.reduce(function (s, u) { return s + u.balance + u.bankBalance; }, 0),
      dailyPayout24h: 0,
    };
  }

  /* ---------------------------------- الأدمن ---------------------------------- */
  function adminOverview() {
    load();
    var users = Object.values(state.users);
    var me = currentUser();
    if (!me || !me.isAdmin) throw makeError("FORBIDDEN", "صلاحيات المدير مطلوبة");
    return {
      stats: {
        totalUsers: users.length,
        totalBalance: users.reduce(function (s, u) { return s + u.balance; }, 0),
        totalBank: users.reduce(function (s, u) { return s + u.bankBalance; }, 0),
        totalTransactions: state.transactions.length,
        totalVolume: state.transactions.reduce(function (s, t) { return s + t.amount; }, 0),
        totalTax: state.transactions.reduce(function (s, t) { return s + (t.tax || 0); }, 0),
        activeToday: users.length,
        newToday: users.length,
        bannedCount: users.filter(function (u) { return u.isBanned; }).length,
        totalGames: state.games.length,
        treasury: state.transactions.reduce(function (s, t) { return s + (t.tax || 0); }, 0),
        totalLoans: state.loans.filter(function (l) { return l.status !== "paid"; }).length,
      },
      economy: {
        treasury: state.transactions.reduce(function (s, t) { return s + (t.tax || 0); }, 0),
        totalSupply: users.reduce(function (s, u) { return s + u.balance + u.bankBalance; }, 0),
        heldByUsers: users.reduce(function (s, u) { return s + u.balance; }, 0),
        heldInBanks: users.reduce(function (s, u) { return s + u.bankBalance; }, 0),
        totalTransactions: state.transactions.length,
        dailyTransactions: state.transactions.length,
        volume24h: state.transactions.reduce(function (s, t) { return s + t.amount; }, 0),
        taxesCollected: state.transactions.reduce(function (s, t) { return s + (t.tax || 0); }, 0),
        taxes24h: 0,
        games24h: state.games.length,
        gamesVolume24h: state.games.reduce(function (s, g) { return s + g.bet; }, 0),
        dailyClaims24h: state.transactions.filter(function (t) { return t.type === "daily"; }).length,
        dailyPayout24h: state.transactions.filter(function (t) { return t.type === "daily"; }).reduce(function (s, t) { return s + t.amount; }, 0),
        activeUsers24h: users.length,
        newUsers24h: users.length,
        avgBalance: users.length ? Math.round(users.reduce(function (s, u) { return s + u.balance; }, 0) / users.length) : 0,
        topBalance: users.reduce(function (max, u) { return Math.max(max, u.balance); }, 0),
      },
      sessions: { active: 1, today: 1 },
      loans: { active: state.loans.filter(function (l) { return l.status === "active"; }).length, overdue: 0, paid: state.loans.filter(function (l) { return l.status === "paid"; }).length, outstanding: state.loans.reduce(function (s, l) { return s + (l.totalDue - l.paid); }, 0) },
      referrals: { total: users.reduce(function (s, u) { return s + u.referrals.length; }, 0), pending: 0, paid: 0, totalPaidOut: 0 },
      backups: [],
      auditCount: 0,
      realtime: { connections: 0, authenticated: 0 },
      actor: { id: me.id, label: me.name, ip: null },
    };
  }

  function adminUsers(query) {
    var me = currentUser();
    if (!me || !me.isAdmin) throw makeError("FORBIDDEN", "صلاحيات المدير مطلوبة");
    var users = Object.values(state.users);
    if (query) {
      var clean = String(query).toLowerCase();
      users = users.filter(function (u) {
        return u.name.toLowerCase().indexOf(clean) >= 0 || (u.username || "").toLowerCase().indexOf(clean) >= 0;
      });
    }
    return { items: users, total: users.length };
  }

  function adminAdjust(userId, amount, action) {
    var me = currentUser();
    if (!me || !me.isAdmin) throw makeError("FORBIDDEN", "صلاحيات المدير مطلوبة");
    amount = Math.round(Number(amount) || 0);
    if (amount <= 0) throw makeError("INVALID_AMOUNT", "أدخل مبلغاً صحيحاً");
    var before = state.users[userId].balance;
    adjust(userId, action === "add" ? amount : -amount);
    writeTransaction({
      type: action === "add" ? "admin_credit" : "admin_debit",
      recipientId: action === "add" ? userId : null,
      senderId: action === "add" ? null : userId,
      amount: amount,
      net: amount,
      balanceAfter: state.users[userId].balance,
      note: "إجراء إداري من " + me.name,
    });
    pushNotification(userId, action === "add" ? "💰 منحة إدارية" : "⚠️ خصم إداري", (action === "add" ? "أُضيف" : "خُصم") + " " + amount + " BTP من رصيدك");
    persist();
    return { before: before, after: state.users[userId].balance };
  }

  function adminToggleBan(userId) {
    var me = currentUser();
    if (!me || !me.isAdmin) throw makeError("FORBIDDEN", "صلاحيات المدير مطلوبة");
    var user = state.users[userId];
    if (!user) throw makeError("NOT_FOUND", "المستخدم غير موجود");
    if (user.id === me.id) throw makeError("INVALID", "لا يمكنك حظر نفسك");
    user.isBanned = !user.isBanned;
    persist();
    return user;
  }

  function adminSettings() {
    var me = currentUser();
    if (!me || !me.isAdmin) throw makeError("FORBIDDEN", "صلاحيات المدير مطلوبة");
    var labels = {
      startBalance: ["رصيد البداية", "number"],
      dailyMin: ["أدنى راتب", "number"],
      dailyMax: ["أقصى راتب", "number"],
      transferTaxPct: ["ضريبة التحويل %", "number"],
      gameTaxPct: ["ضريبة أرباح الألعاب %", "number"],
      betMin: ["أدنى رهان", "number"],
      betMax: ["أقصى رهان", "number"],
      robSuccessPct: ["نسبة نجاح السرقة %", "number"],
      bankInterestPct: ["فائدة البنك اليومية %", "number"],
      referralInviter: ["مكافأة الداعي", "number"],
      referralInvitee: ["مكافأة المدعو", "number"],
    };
    return Object.keys(labels).map(function (key) {
      return { key: key, label: labels[key][0], type: labels[key][1], value: String(state.settings[key]), category: "economy" };
    });
  }

  function adminSaveSetting(key, value) {
    var me = currentUser();
    if (!me || !me.isAdmin) throw makeError("FORBIDDEN", "صلاحيات المدير مطلوبة");
    if (!(key in DEFAULTS)) throw makeError("INVALID", "إعداد غير معروف");
    var numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) throw makeError("INVALID", "قيمة غير صالحة");
    state.settings[key] = numeric;
    persist();
    return { key: key, value: String(numeric) };
  }

  function adminTransactions(limit) {
    var me = currentUser();
    if (!me || !me.isAdmin) throw makeError("FORBIDDEN", "صلاحيات المدير مطلوبة");
    return {
      items: state.transactions.slice(0, limit || 50).map(function (t) {
        var sender = t.senderId ? state.users[t.senderId] : null;
        var recipient = t.recipientId ? state.users[t.recipientId] : null;
        return Object.assign({}, t, { senderName: sender ? sender.name : null, recipientName: recipient ? recipient.name : null, source: t.source });
      }),
      total: state.transactions.length,
    };
  }

  /* ---------------------------------- الحالة ---------------------------------- */
  function reset() {
    state = defaultState();
    persist();
    return state;
  }

  function exportState() {
    load();
    return JSON.stringify(state, null, 2);
  }

  /* -------------------------------- التصدير -------------------------------- */
  var BitPoinCore = {
    CURRENCY: CURRENCY,
    DEFAULTS: DEFAULTS,
    SHOP_ITEMS: SHOP_ITEMS,
    load: load,
    persist: persist,
    reset: reset,
    exportState: exportState,
    createUser: createUser,
    currentUser: currentUser,
    logout: logout,
    login: login,
    listUsers: listUsers,
    updateProfile: updateProfile,
    dailyStatus: dailyStatus,
    claimDaily: claimDaily,
    transferPreview: transferPreview,
    transfer: transfer,
    findUser: findUser,
    bankInfo: bankInfo,
    deposit: deposit,
    withdraw: withdraw,
    gameLimits: gameLimits,
    play: play,
    gameStats: gameStats,
    robStatus: robStatus,
    rob: rob,
    shopItems: shopItems,
    buyItem: buyItem,
    equipTitle: equipTitle,
    unequipTitle: unequipTitle,
    referralInfo: referralInfo,
    applyReferral: applyReferral,
    payoutReferral: payoutReferral,
    notifications: notifications,
    markNotificationsRead: markNotificationsRead,
    pushNotification: pushNotification,
    transactions: transactions,
    loanInfo: loanInfo,
    takeLoan: takeLoan,
    repayLoan: repayLoan,
    leaderboard: leaderboard,
    stats: stats,
    adminOverview: adminOverview,
    adminUsers: adminUsers,
    adminAdjust: adminAdjust,
    adminToggleBan: adminToggleBan,
    adminSettings: adminSettings,
    adminSaveSetting: adminSaveSetting,
    adminTransactions: adminTransactions,
    getSettings: function () { return load().settings; },
  };

  global.BitPoinCore = BitPoinCore;
})(window);
