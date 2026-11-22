# 🚀 نشر BitPoin على Render — دليل مبني على أخطاء حقيقية

> هذا الدليل مصحّح بعد تجربة فعلية على Render. كل خطوة هنا يوجد سبب لحدوثها.

---

## ⚠️ اقرأ هذا أولاً: 5 مصائد في Render

| # | المصيدة | ما يحدث | الحل |
|---|---|---|---|
| 1 | **Build Command يدوي** `npm install && npm run build` | يعمل، لكنه يخالف Dockerfile ويعرّضك لاختلاف البيئة | استخدم **Docker** — لا تكتب أي أمر بناء |
| 2 | **Start Command** `npm run start` | ❌ **يفشل** — `npm run start` = `NODE_ENV=production tsx server.ts` وهذا صيغة bash لا تعمل كـ start command على Render (يرسله لـ `/bin/sh` بلا tsx في PATH أحياناً) | Dockerfile فيه `CMD ["npx","tsx","server.ts"]` |
| 3 | **خطة Free بلا Shell** | ❌ لا يوجد Shell في Free → `npm run webhook:set` **لا يمكن تنفيذه** | استخدم `npm run render:setup` من جهازك |
| 4 | **`JWT_SECRET` غير مضبوط** | ❌ الخادم يرفض الإقلاع: `JWT_SECRET مطلوب` | اضغط **Generate** في Render |
| 5 | **`PORT` بلا قيمة** (كما في ملفك المصدَّر) | ❌ الحاوية لا تعرف المنفذ | Dockerfile يضبط `PORT=3000` تلقائياً |

**ملاحظة على ملفك المصدَّر:** `runtime: node` + `buildCommand` + `startCommand` = إعداد يدوي. المشروع مبني لـ **Docker**. الفرق ليس شكلياً: الـ Dockerfile يضمّ `tini` و`postgresql-client` ويضبط `PORT` و`CMD` الصحيح.

---

## الخطوة 0 — احذف الخدمة القديمة

Render → خدمتك → **Settings** → أسفل الصفحة → **Delete Web Service**

> لازم، لأن Render يرفض وجود خدمة يدوية بنفس اسم خدمة Blueprint.

---

## الخطوة 1 — المتطلبات (5 دقائق)

| # | المهمة | المصدر |
|---|---|---|
| 1 | **توكن بوت جديد** | [@BotFather](https://t.me/BotFather) → `/revoke` → اختر بوتك |
| 2 | **معرّفك** `8764194314` ✅ (جاهز من رسالتك) | — |
| 3 | حساب Render | [render.com](https://render.com) — Sign up with GitHub |

> 🔴 **لا ترسل التوكن لأي أحد ولا تضعه في Git.** يدخل في لوحة Render فقط.

---

## الخطوة 2 — النشر بنقرة (Blueprint)

1. Render → **New +** → **Blueprint**
2. اختر `3av4/TESTTTT`
3. **Branch:** `arena/e971f73e-testttt`
4. Render يقرأ `render.yaml` → **Apply**

سيسألك عن 3 قيم فقط:

| المتغير | القيمة |
|---|---|
| `BOT_TOKEN` | التوكن من الخطوة 1 🔴 |
| `ADMIN_IDS` | `8764194314` |
| `APP_URL` | `https://bitpoin.onrender.com` (أو اسم خدمتك) |

`JWT_SECRET` و`WEBHOOK_SECRET` يولّدهما Render تلقائياً (`generateValue: true`).
`PORT` و`NODE_ENV` و`DATABASE_URL` كلها مضبوطة في `render.yaml` و`Dockerfile`.

---

## الخطوة 3 — انتظر البناء

Render → **Logs**. ابحث عن:

```
[server] BitPoin يعمل على http://0.0.0.0:3000
```

ثم افتح `https://<خدمتك>.onrender.com/healthz`:

```json
{"ok":true,"data":{"db":true,"uptime":12,"env":"production",...}}
```

> إذا ظهر `db:false` → أعد النشر. إذا لم يقلع أصلاً → اقرأ Logs:
> `JWT_SECRET مطلوب` يعني انسَ `Generate` على المتغير.

---

## الخطوة 4 — الويبهوك (الحرجة)

**لا يوجد Shell في الخطة المجانية.** نفّذ من **جهازك** (Terminal على Mac/Linux، أو CMD/PowerShell على Windows مع Node.js مثبتاً):

```bash
BOT_TOKEN=<التوكن> PUBLIC_URL=https://<خدمتك>.onrender.com npx tsx scripts/render-setup.ts
```

أو باستخدام السكربت الجاهز (بعد `git clone` + `npm install`):

```bash
npm run render:setup -- --token <التوكن> --url https://<خدمتك>.onrender.com
```

**ما يفعله السكربت:**

1. يتحقق من التوكن عبر `getMe` ويطبع اسم البوت
2. يسجّل الويبهوك على تلجرام
3. يتحقق بـ `getWebhookInfo` أن الرابط مطابق
4. **يطبع القيم** التي تنسخها إلى Render

المخرجات المتوقعة:

```
✔ البوت: @BitPoinBot (id: 123456789)
✔ تم تسجيل الويبهوك
✔ تحقق: getWebhookInfo → مطابق

القيم التي تنسخها إلى Render → Environment:
TELEGRAM_WEBHOOK_URL = https://bitpoin.onrender.com
WEBHOOK_SECRET       = a1b2c3...
APP_URL              = https://bitpoin.onrender.com
```

**انسخها إلى Render → Environment → Save Changes.**

> ⚠️ **مهم:** `TELEGRAM_WEBHOOK_URL` يجب أن يكون **أصل الرابط فقط** (بدون `/api/...`).
> الكود يبني المسار الكامل بنفسه: `${APP_URL}/api/telegram/webhook/${WEBHOOK_SECRET}`.

---

## الخطوة 5 — اختبار

1. [@BitPoinBot](https://t.me/BitPoinBot) → **Start**
2. `/menu` → قائمة بأزرار
3. `/balance` → 1000 BTP
4. `/daily` → الراتب
5. `/admin` → يجب أن يعمل (رقمك في `ADMIN_IDS`)

**الموقع:** `https://<خدمتك>.onrender.com` → دخول عبر تلجرام.

---

## الخطوة 6 — ما يجب أن تتوقعه

| الشي | الواقع | ملاحظة |
|---|---|---|
| 💤 النوم | 15 دقيقة خمول → نوم | تلجرام تصحّيها عند رسالة: **30–60 ثانية** |
| 💾 البيانات | PGlite على قرص مؤقت | **تُفقد** عند كل deploy أو spin-down |
| 💰 الساعات | 750 ساعة/شهر | النائم لا يُحسب — آمن |
| ⚡ الذاكرة | 82MB من 512MB | مُقاس فعلياً ✅ |
| 🔧 Shell | ❌ غير متاح | استخدم السكربت من جهازك (خطوة 4) |

### الاستمرارية (مهم)

Render Free يمحي القرص عند:
- كل `git push`
- كل spin-down (نوم)
- أي restart

**لحل دائم:** Neon مجاني — 1GB، بدون بطاقة، بلا انتهاء صلاحية.

1. [neon.tech](https://neon.tech) → New Project
2. انسخ **Connection string** (يبدأ بـ `postgresql://`)
3. Render → Environment → `DATABASE_URL` = الرابط + `?sslmode=require`
4. **احذف** `DB_ENGINE` أو اتركه `auto` (لا تضعه `pglite` — يتعارض)
5. أعد النشر → الترحيل والبذور تلقائية

---

## استكشاف الأخطاء

| العَرَض | السبب | الحل |
|---|---|---|
| `JWT_SECRET مطلوب` | المتغير فارغ | Environment → Generate |
| `Exited with status 1` فوراً | `npm run start` بدل Docker | استخدم Dockerfile (خطوة 2) |
| `Port scan timeout` | PORT غير مضبوط | Dockerfile يضبطه — تأكد أنك على `runtime: docker` |
| `502` بعد النشر | aún يقلع | انتظر دقيقة، راقب Logs |
| `/healthz` → `db:false` | PGlite فشل | أعد النشر، أو استخدم Neon |
| البوت صامت | ويبهوك غير مسجّل | أعد الخطوة 4 |
| البوت يرد `401` | `WEBHOOK_SECRET` لا يطابق | أعد الخطوة 4 بالقيمة الصحيحة |
| `Conflict: can't use getUpdates` | نسخة قديمة بنفس التوكن | أوقفها، أو `deleteWebhook` |
| Blueprint يرفض الاسم | خدمة يدوية موجودة | احذفها (خطوة 0) |
| `npm run start` يفشل | صيغة POSIX في Windows | استخدم Docker — لا تشغّل محلياً هكذا |
