# 🪙 BitPoin (BTP)

عملة رقمية مجتمعية متكاملة: **موقع ويب** و**بوت تلجرام** يعملان على نفس الخادم، وبنفس قاعدة البيانات، وبنفس طبقة الخدمات (Service Layer) — أي عملية في أحدهما تظهر فوراً في الآخر (WebSocket لحظي في الموقع + إشعارات في البوت).

---

## ✨ المزايا

| المجال | التفاصيل |
|---|---|
| الحساب | تسجيل دخول عبر **Telegram Login Widget** (تحقق من التوقيع HMAC-SHA256) + ربط آمن بالبوت. حساب واحد في الموقع والبوت. |
| الراتب اليومي | `/daily` أو زر في الموقع — مكافأة عشوائية 100–400 BTP كل 24 ساعة، عداد تنازلي، وسلسلة أيام (Streak) بمكافأة إضافية. محمي من السباق بقفل صف في PostgreSQL داخل استعلام `UPDATE ... WHERE` ذرّي. |
| التحويل | `/send @user amount` أو بالرد على رسالة، وتحويلات من الموقع — مع ضريبة قابلة للتعديل (5% افتراضياً) تذهب لخزينة النظام. |
| الألعاب | `/dice` `/coinflip` `/slots` `/roulette` بحدود رهان دنيا وعليا وضريبة على الأرباح. |
| السرقة | `/rob` بنسبة نجاح، فاصل زمني، وعقوبة عند الفشل تُعاد للضحية. |
| البنك | `/bank deposit/withdraw/balance` مع فائدة يومية صغيرة تُصرف تلقائياً كل 24 ساعة. |
| المتجر | `/shop` و`/buy` — ألقاب، شارات، دروع، مضاعفات. |
| الهدايا | `/gift @user amount` و`/redeem CODE` بنظام أكواد متعددة الاستخدامات وكود لكل مستخدم. |
| الإحالات | `/referral` — رابط إحالة `t.me/Bot?start=ref_XXXX` مع مكافأة للداعي والمدعو. |
| القروض | قروض صغيرة بفائدة وتاريخ استحقاق وعقوبات تأخير. |
| القروبات | يعمل البوت في أي قروب مع إعدادات مستقلة لكل قروب (`/settings`)، وتوب داخل القروب. |
| الأدمن | `/addcoins` `/removecoins` `/ban` `/unban` `/broadcast` `/setfee` `/stats` + أدوات إضافية، ولوحة تحكم كاملة في الموقع مع سجل تدقيق. |
| الأمان | JWT في كوكي HttpOnly، Rate limiting موزَّع، Transactions ذرّية، تحقق Zod من كل مدخل، سجل تدقيق، نسخ احتياطي تلقائي. |
| الواجهة | React/Next.js + Tailwind، عربية RTL، وضع داكن، متجاوبة مع الجوال، تحديث الرصيد لحظياً عبر WebSocket. |

---

## 🧱 البنية

```
.
├── server.ts                  # نقطة الانطلاق: Express + Next + WebSocket + بوت تلجرام
├── db/
│   ├── schema.sql             # مخطط قاعدة البيانات
│   └── seed.sql               # الإعدادات والأدوات الافتراضية
├── server/
│   ├── config.ts              # قراءة والتحقق من .env
│   ├── db.ts                  # Pool + Transaction + migrations
│   ├── pglite.ts              # قاعدة PGlite مدمجة (تطوير بدون PostgreSQL)
│   ├── realtime.ts            # WebSocket + Pub/Sub
│   ├── logger.ts              # تسجيل منظّم
│   ├── backup.ts              # نسخ احتياطي تلقائي
│   ├── jobs.ts                # مهام مجدولة (بنك/ضريبة ثروة/قروض)
│   ├── middleware/            # المصادقة، Rate limit، الأخطاء، الأدمن
│   ├── routes/                # REST API (auth, user, transfer, games, shop ...)
│   ├── services/              # ⭐ طبقة الخدمات المشتركة بين الموقع والبوت
│   └── bot/                   # واجهة تلجرام (grammY) — تستدعي نفس الخدمات
├── src/                       # Next.js App Router + مكوّنات الواجهة
└── scripts/                   # الترحيل، النسخ الاحتياطي، الويبهوك، بيانات تجريبية
```

**المفتاح:** لا يوجد أي منطق مالي داخل الراوتات أو أوامر البوت — كل شيء يمرّ عبر `server/services/*`، وهي التي تكتب في قاعدة البيانات وتطلق الأحداث اللحظية وإشعارات تلجرام.

---

## ⚡ التشغيل بنقرة واحدة

```bash
./start.sh              # إنتاج (يتطلب build مسبق، ينشئه تلقائياً إن لم يوجد)
./start.sh --build      # إعادة البناء ثم التشغيل
./start.sh --dev        # وضع التطوير مع HMR
./start.sh --keepalive  # مع إعادة تشغيل تلقائي عند الانهيار
```

السكربت يثبّت التبعيات إن لزم، ينشئ `.env` من القالب، يوقف أي نسخة قديمة،
ويشغّل الموقع والبوت على منفذ واحد.

---

## 🚀 التشغيل السريع (يدوياً)

```bash
# 1) الاعتماديات
npm install

# 2) الإعدادات
cp .env.example .env
# عدّل: BOT_TOKEN, JWT_SECRET, ADMIN_IDS, APP_URL ...
# اترك DATABASE_URL فارغاً إن أردت قاعدة PGlite المدمجة (للتطوير)

# 3) قاعدة البيانات (مخطط + بيانات افتراضية)
npm run db:migrate

# 4) تشغيل التطوير (الموقع + البوت + WebSocket على منفذ واحد)
npm run dev
```

افتح `http://localhost:3000`.

### الإنتاج

```bash
npm run build
npm start            # أو استخدم pm2 / systemd (انظر deploy/)
```

### PostgreSQL (موصى به للإنتاج)

```bash
createdb bitpoin
export DATABASE_URL="postgres://user:pass@localhost:5432/bitpoin"
npm run db:migrate
```

> بدون `DATABASE_URL` يستخدم التطبيق **PGlite** (PostgreSQL مبني بـ WASM) ويُشغّل خادم PostgreSQL محلياً على منفذ 5432 تلقائياً — مناسب للتجربة والتطوير. البيانات تُحفظ في `db/pglite-data/`.

---

## 🤖 ربط البوت وتلجرام

1. أنشئ بوتاً عبر [@BotFather](https://t.me/BotFather) وضع التوكن في `BOT_TOKEN`.
2. اضبط اسم البوت في `BOT_USERNAME` (بدون @).
3. فعّل **Login Widget**: في BotFather → `/setdomain` → ضع دومين موقعك. يظهر زر «تسجيل الدخول عبر تلجرام» في `/login`.
4. للويبهوك (الإنتاج):

```bash
# يتطلب APP_URL عاماً بـ https
npm run bot:setup -- --url https://example.com --secret <WEBHOOK_SECRET>
```

- بدون `TELEGRAM_WEBHOOK_URL`: يعمل البوت بـ **long polling** (تطوير فقط).
- معه: يعمل بـ **Webhook** على نفس السيرفر عبر `POST /api/telegram/webhook/<secret>`.

### ⚠️ البوت لا يستجيب؟ ابدأ من هنا

تلجرام يحتاج **اتصالاً صادراً مباشراً** إلى `api.telegram.org` من الخادم الذي يشغّل المشروع.
كثير من بيئات المعاينة السحابية المعزولة (sandbox) تحجب هذا النطاق — فيعمل الموقع كاملاً
بينما يظل البوت صامتاً، وتظهر في السجلات:

```
[bot] تعذّر الوصول إلى api.telegram.org — البوت لن يستقبل تحديثات حتى يُسمح بالشبكة
```

**افحص الحالة بنفسك** من الموقع: لوحة الإدارة → تبويب «النظام» → بطاقة **تشخيص البوت** →
«فحص الآن». أو من الطرفية:

```bash
curl -s https://api.telegram.org/bot<BOT_TOKEN>/getMe
# نجاح = {"ok":true,"result":{...}}
# فشل   = خطأ شبكة / انتهاء مهلة  → الشبكة محجوبة
```

كما يمكن فحص كل شيء من نقطة واحدة محمية:

```
GET /api/telegram/selftest     (يتطلب جلسة أدمن)
```

| السبب | الحل |
|---|---|
| نطاق تلجرام محجوب من بيئة المعاينة | شغّل المشروع على VPS/سيرفر بوصول إنترنت كامل (Docker أو pm2 — انظر `deploy/`) |
| `BOT_TOKEN` خطأ أو منتهي | أعد توليده من @BotFather وحدّث `.env` |
| ويبهوك قديم مسجّل يمنع polling | `npm run bot:delete` ثم أعد التشغيل |
| خادم بلا HTTPS عام | استخدم polling (اترك `TELEGRAM_WEBHOOK_URL` فارغاً) |

**لا حاجة لتعديل أي كود** — نقل المشروع إلى سيرفر عادي يكفي ليعمل البوت تلقائياً.

### تشغيل البوت منفصلاً (عندما يحجب الموقع تلجرام)

إذا كان الموقع مستضافاً في بيئة معزولة تحجب `api.telegram.org`، شغّل **البوت وحده**
على أي جهاز أو VPS بوصول عادي، بشرط أن يشترك في **نفس قاعدة PostgreSQL**:

```bash
DATABASE_URL="postgres://user:pass@host:5432/bitpoin" \
BOT_TOKEN="..." \
npx tsx scripts/bot-only.ts
```

> هذا السكربت لا يشغّل موقعاً ولا يفتح منفذاً — فقط يستقبل تحديثات تلجرام ويحدّث
> قاعدة البيانات المشتركة، فتظهر العمليات فوراً في الموقع عبر WebSocket.

### 🩺 صفحة حالة النظام

افتح `/status` لترى في ثوانٍ: الموقع، قاعدة البيانات، WebSocket، والبوت — مع **سبب
التوقف والحل** إن وُجد. الرابط متاح أيضاً في تذييل الموقع.

### اختبار البوت بدون تلجرام

```bash
npm run bot:simulate
```

محاكي كامل يحقن تحديثات وهمية في **نفس نسخة grammY** المستخدمة في الإنتاج ويعترض
شبكة Bot API، ثم يتحقق من 28 سلوكاً: `/start` `/balance` `/daily` (مع منع التكرار)
`/help` `/profile` `/dice` `/coinflip` `/slots` `/roulette` `/bank` `/bank deposit`
`/top` `/history` `/referral` `/shop` `/send` `/redeem`، أزرار القوائم، الإشعارات،
وسلامة الأرصدة. النتيجة الحالية: **28/28**.

---

## ⚙️ الإعدادات (بدون تعديل الكود)

كل الإعدادات الاقتصادية في جدول `system_settings` وتُعدَّل من **لوحة الأدمن → الإعدادات** أو بأمر `/setoption` (أدمن). أهم المفاتيح:

| المفتاح | الافتراضي | الوصف |
|---|---|---|
| `daily_min` / `daily_max` | 100 / 400 | نطاق مكافأة الراتب |
| `streak_bonus_per_day` | 30 | مكافأة إضافية لكل يوم استمرارية |
| `transfer_tax_pct` | 5 | ضريبة التحويل |
| `game_tax_pct` | 5 | ضريبة أرباح الألعاب |
| `wealth_tax_pct` / `wealth_tax_threshold` | 0 / 100000 | ضريبة الثروة (0 = معطلة) |
| `rob_success_pct` / `rob_cooldown_minutes` | 40 / 30 | إعدادات السرقة |
| `bank_interest_pct` | 0.5 | فائدة البنك اليومية |
| `referral_reward_inviter` / `referral_reward_invitee` | 300 / 150 | مكافآت الإحالة |

---

## 📡 واجهة REST (مختصر)

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/api/auth/config` | إعدادات الدخول (اسم البوت، هل الدخول التجريبي مفعّل) |
| POST | `/api/auth/telegram` | تسجيل دخول عبر Telegram Login Widget |
| POST | `/api/auth/admin-login` | دخول الأدمن بكلمة مرور (بديل احتياطي) |
| POST | `/api/auth/demo-login` | دخول تجريبي سريع — **يعمل فقط عند `DEMO_MODE=true` وبعيداً عن الإنتاج** |
| GET | `/api/auth/me` | بيانات الجلسة الحالية |
| POST | `/api/auth/logout` | خروج |
| GET | `/api/config` | إعدادات عامة للواجهة |
| GET | `/api/user/me` | الملف + الرصيد + حالة الراتب + البنك |
| GET / POST | `/api/user/daily` | حالة الراتب / المطالبة به |
| POST | `/api/user/transfer/preview` · `/api/user/transfer` | معاينة الضريبة · تنفيذ التحويل |
| GET | `/api/user/bank` · POST `/api/user/deposit` · `/api/user/withdraw` | البنك |
| GET | `/api/user/transactions` · `/api/user/notifications` · POST `/api/user/notifications/read` | السجل والإشعارات |
| GET | `/api/user/referral` · `/api/user/loans` · `/api/user/stats` | الإحالات والقروض والإحصاءات |
| GET | `/api/leaderboard?scope=global\|games\|referrals` | المتصدرون |
| GET | `/api/games` · `/api/games/top` · POST `/api/games/play` · GET `/api/games/stats` | الألعاب |
| GET | `/api/shop` · POST `/api/shop/buy` · `/api/shop/equip` · `/api/shop/unequip` | المتجر |
| POST | `/api/coins/rob` · `/api/coins/loans` · `/api/coins/loans/repay` · `/api/coins/gift` | السرقة والقروض والهدايا |
| POST | `/api/promo/redeem` | استرداد كود هدية |
| GET | `/api/stats` | إحصاءات المنصة العامة |
| GET / POST | `/api/admin/overview` · `users` · `settings` · `transactions` · `codes` · `shop` · `audit` · `groups` · `backups` · `broadcast` · `notify` · `credit` · `debit` · `ban` · `unban` · `role` · `backup` · `top-earners` | لوحة الأدمن (محمية بصلاحية admin) |
| GET | `/api/telegram/status` · POST `/api/telegram/webhook/:secret` | البوت والويبهوك |
| GET | `/healthz` | فحص الصحة (قاعدة البيانات + WebSocket) |
| WS | `/ws` | بث لحظي (تحديث الرصيد والإشعارات) |

الأخطاء موحّدة: `{ "ok": false, "error": { "code", "message", "details" } }` — وأخطاء التحقق `422 VALIDATION_ERROR`.

---

## 🔐 الأمان

- **Telegram Login**: التحقق `HMAC_SHA256(data_check_string, SHA256(BOT_TOKEN))` + صلاحية `auth_date` (24 ساعة) + منع تكرار `hash` عبر جدول الجلسات.
- **الجلسات**: JWT موقّع، مخزَّن في كوكي `HttpOnly` + `SameSite=Lax`، ومرتبط بمعرّف جلسة قابل للإبطال في قاعدة البيانات.
- **العمليات المالية**: كلها داخل `BEGIN ... COMMIT` مع `SELECT ... FOR UPDATE` بترتيب ثابت للمعرّفات، وأرصدة `BIGINT` صحيحة فقط (لا أعداد عائمة).
- **Rate limiting**: نافذة منزلقة مخزّنة في PostgreSQL لكل مسار وكل مستخدم + حماية من التكرار.
- **سجل تدقيق**: كل إجراء إداري يُسجَّل في `audit_logs` مع الفاعل والهدف والتفاصيل وIP.
- **نسخ احتياطي**: تلقائي كل 6 ساعات (قابل للتعديل) `pg_dump` لقاعدة PostgreSQL، ولقطة PGlite في وضع التطوير.

---

## 🧪 بيانات تجريبية

```bash
npm run smoke             # اختبار دخاني كامل (راتب، تحويل+ضريبة، لعبة، بنك، كود، إحالة، سرقة)
npm run typecheck         # فحص الأنواع
npm run build             # بناء الإنتاج
```

### الدخول التجريبي السريع (بدون تلجرام)

مع `DEMO_MODE=true` (افتراضي في التطوير فقط) يظهر في صفحة `/login` زرّان:

| الزر | الحساب الناتج |
|---|---|
| دخول لاعب تجريبي | مستخدم عادي برصيد البداية |
| دخول مدير تجريبي | حساب admin بكامل الصلاحيات |

> في `NODE_ENV=production` يُعطَّل المسار تلقائياً حتى لو كان `DEMO_MODE=true` — لا يمكن استخدامه على سيرفر حقيقي.

## 📦 أوامر البوت

`/start` `/help` `/balance` `/daily` `/profile` `/send` `/top` `/history` `/dice` `/coinflip` `/slots` `/roulette` `/rob` `/shop` `/buy` `/bank` `/gift` `/redeem` `/referral` `/loan` `/settings` `/admin`

> أوامر الأدمن: `/addcoins` `/removecoins` `/ban` `/unban` `/broadcast` `/setfee` `/stats` `/award` `/createcode` `/setgroup` `/setoption`

---

## 🐳 النشر

ملفات جاهزة في `deploy/`:

```bash
# Docker
cp .env.example .env            # عدّل القيم
docker compose up -d --build     # يشغّل الموقع + PostgreSQL

# pm2 على سيرفر عادي
npm ci && npm run build
pm2 start deploy/ecosystem.config.cjs
pm2 save
```

- الويبهوك يحتاج دومين HTTPS عام: `npm run bot:setup -- --url https://example.com`
- فعّل `BACKUP_ENABLED=true` واضبط `BACKUP_DIR` على قرص دائم.
- `ADMIN_PASSWORD` في `.env` هو الكلمة الاحتياطية لدخول الإدارة — بدّله قبل أي نشر.

---

## 📄 الترخيص

MIT — استخدمه وطوّره بحرية.
