/**
 * ثوابت البوت: قوائم الأوامر، لوحات المفاتيح، الثيمات.
 */
export const ADMIN_COMMANDS = [
  "addcoins",
  "removecoins",
  "ban",
  "unban",
  "broadcast",
  "setfee",
  "stats",
  "award",
  "createcode",
  "setgroup",
  "setoption",
  "admin",
  "sync",
  "resetdaily",
];

/** أوامر إدارية مسموح بها داخل القروبات (الباقي في الخاص فقط) */
export const GROUP_ADMIN_COMMANDS = ["setgroup", "stats", "help", "settings"];

export const PUBLIC_COMMANDS = [
  { command: "start", description: "بدء استخدام BitPoin" },
  { command: "help", description: "قائمة الأوامر" },
  { command: "balance", description: "عرض رصيدك" },
  { command: "daily", description: "الراتب اليومي" },
  { command: "profile", description: "ملفك وإحصائياتك" },
  { command: "send", description: "تحويل: /send @user 100 أو بالرد" },
  { command: "top", description: "المتصدرون" },
  { command: "history", description: "آخر عملياتك" },
  { command: "dice", description: "لعبة النرد" },
  { command: "coinflip", description: "لعبة العملة" },
  { command: "slots", description: "ماكينة الحظ" },
  { command: "roulette", description: "الروليت" },
  { command: "rob", description: "سرقة (بالرد أو @user)" },
  { command: "bank", description: "البنك والفائدة" },
  { command: "shop", description: "المتجر" },
  { command: "buy", description: "شراء عنصر: /buy code" },
  { command: "gift", description: "إهداء عملات" },
  { command: "redeem", description: "استرداد كود هدية" },
  { command: "referral", description: "رابط الإحالة" },
  { command: "loan", description: "القروض" },
  { command: "settings", description: "إعدادات القروب" },
];

export const ADMIN_COMMAND_LIST = [
  { command: "addcoins", description: "منح: /addcoins @user 100 [سبب]" },
  { command: "removecoins", description: "خصم: /removecoins @user 100 [سبب]" },
  { command: "ban", description: "حظر مستخدم" },
  { command: "unban", description: "فك حظر مستخدم" },
  { command: "broadcast", description: "بث رسالة لكل المستخدمين" },
  { command: "setfee", description: "تعديل الضرائب" },
  { command: "stats", description: "إحصائيات النظام" },
  { command: "createcode", description: "إنشاء كود هدية" },
  { command: "setoption", description: "تعديل إعداد نظام" },
  { command: "setgroup", description: "إعدادات القروب" },
  { command: "admin", description: "دليل أوامر الإدارة" },
];

export const mainMenu = () => ({
  inline_keyboard: [
    [
      { text: "💰 الرصيد", callback_data: "balance:show" },
      { text: "🎁 راتبي اليومي", callback_data: "daily:claim" },
    ],
    [
      { text: "🏦 البنك", callback_data: "bank:view" },
      { text: "🛒 المتجر", callback_data: "shop:list" },
    ],
    [
      { text: "🎲 الألعاب", callback_data: "games:menu" },
      { text: "🏆 المتصدرون", callback_data: "top:global" },
    ],
    [
      { text: "🔗 الإحالة", callback_data: "ref:view" },
      { text: "📊 ملفي", callback_data: "profile:show" },
    ],
    [{ text: "🌐 الموقع", url: "https://t.me" }],
  ],
});

export const backToMenu = () => ({
  inline_keyboard: [[{ text: "⬅️ القائمة الرئيسية", callback_data: "menu:main" }]],
});

export const gamesMenu = () => ({
  inline_keyboard: [
    [
      { text: "🎲 نرد", callback_data: "game:dice" },
      { text: "🪙 عملة", callback_data: "game:coinflip" },
    ],
    [
      { text: "🎰 ماكينة", callback_data: "game:slots" },
      { text: "🎡 روليت", callback_data: "game:roulette" },
    ],
    [{ text: "⬅️ رجوع", callback_data: "menu:main" }],
  ],
});
