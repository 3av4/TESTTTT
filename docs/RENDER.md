# 🚀 نشر BitPoin على Render (دليل المبتدئ)

> الهدف: بوت تلجرام + الموقع يشتغلان على رابط عام، مجاناً، بدون بطاقة بنكية.

---

## 0) قبل ما تبدأ (5 دقائق)

| # | المهمة | من وين |
|---|---|---|
| 1 | **توكن بوت جديد** ⚠️ | [@BotFather](https://t.me/BotFather) → `/revoke` → اختر بوتك |
| 2 | **معرّفك الرقمي** | [@userinfobot](https://t.me/userinfobot) → Start → الرقم |
| 3 | **حساب Render** | [render.com](https://render.com) → Sign up with GitHub |

> 🔴 **لا ترسل التوكن لأي أحد.** يُدخل مباشرة في لوحة Render.

---

## 1) إنشاء الخدمة

### الطريقة أ — Blueprint (الأسهل، ملف `render.yaml` موجود)

1. Render → **New +** → **Blueprint**
2. اختر مستودع `3av4/TESTTTT`
3. Render يقرأ `render.yaml` ويعرض الخدمة → **Apply**
4. سيسألك عن القيم السرّية (`BOT_TOKEN`, `ADMIN_IDS`, `APP_URL`) → أدخلها

### الطريقة ب — يدوياً (لو ما ظهر Blueprint)

1. Render → **New +** → **Web Service**
2. **Connect** مستودع `3av4/TESTTTT`
3. املأ الخانات:

| الخانة | القيمة |
|---|---|
| **Name** | `bitpoin` |
| **Region** | `Frankfurt (EU Central)` |
| **Branch** | الفرع الذي تريد النشر منه |
| **Runtime** | **Docker** |
| **Dockerfile Path** | `./Dockerfile` |
| **Instance Type** | **Free** |
| **Health Check Path** | `/healthz` |

> لا تضبط Build/Start Command — Dockerfile يتكفل بهما.

4. **Create Web Service**

---

## 2) متغيرات البيئة (Environment)

Render → خدمتك → **Environment** → أضف:

| المتغير | القيمة | ملاحظة |
|---|---|---|
| `BOT_TOKEN` | التوكن الجديد | 🔴 سرّي |
| `BOT_USERNAME` | `BitPoinBot` | بدون @ |
| `JWT_SECRET` | اضغط **Generate** | Render يولّده |
| `ADMIN_IDS` | رقمك من userinfobot | مثال `123456789` |
| `APP_URL` | `https://bitpoin.onrender.com` | بدّل الاسم باسم خدمتك |
| `DATABASE_URL` | *(فارغ)* | PGlite مدمجة |
| `DB_ENGINE` | `auto` | |
| `PORT` | `3000` | |
| `NODE_ENV` | `production` | |
| `DEMO_MODE` | `false` | |
| `DEMO_ALLOW_PRODUCTION` | `false` | |
| `WEBHOOK_SECRET` | اضغط **Generate** | |
| `TELEGRAM_WEBHOOK_URL` | *(اتركه فارغاً الآن)* | يُملأ في الخطوة 4 |
| `BACKUP_ENABLED` | `false` | |

> ⚠️ **لا تضع** `DB_ENGINE=pglite` مع `DATABASE_URL` غير فارغ — يتعارضان.

---

## 3) انتظر أول نشر

- Render يبني Docker image (~3–5 دقائق أول مرة).
- تابع **Logs** حتى ترى:
  ```
  [server] BitPoin يعمل على http://0.0.0.0:3000
  ```
- افتح `https://<اسم-خدمتك>.onrender.com/healthz` → يجب أن يعيد:
  ```json
  {"ok":true,"data":{"db":true,...}}
  ```

---

## 4) تسجيل الويبهوك (الخطوة الحرجة)

البوت لا يستجيب قبل هذه الخطوة.

### الطريقة أ — من لوحة Render (Shell)

Render → خدمتك → **Shell** → نفّذ:

```bash
npm run webhook:set -- --url https://<اسم-خدمتك>.onrender.com
```

النتيجة المتوقعة:
```
INFO [webhook-setup] البوت { username: 'BitPoinBot', id: ... }
INFO [webhook-setup] تم تسجيل الويبهوك { url: 'https://.../api/telegram/webhook/...' }
```

### الطريقة ب — لا يوجد Shell في الخطة المجانية

استخدم `curl` من جهازك (Terminal / CMD):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<اسم-خدمتك>.onrender.com/api/telegram/webhook/<WEBHOOK_SECRET>","secret_token":"<WEBHOOK_SECRET>"}'
```

> `<WEBHOOK_SECRET>` = القيمة التي ولّدها Render.

ثم أضف `TELEGRAM_WEBHOOK_URL` في Environment بنفس الرابط وأعد النشر.

### تحقق

```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```
يجب أن يظهر `"url": "https://..."` و `"pending_update_count": 0`.

---

## 5) اختبار

1. افتح [@BitPoinBot](https://t.me/BitPoinBot) → **Start**
2. أرسل `/menu` → يجب أن تظهر قائمة بأزرار
3. أرسل `/balance` → رصيدك 1000 BTP
4. أرسل `/daily` → راتبك
5. من الموقع: `https://<اسم-خدمتك>.onrender.com` → دخول عبر تلجرام

---

## 6) النوم المجاني (سلوك متوقع)

| الحالة | النتيجة |
|---|---|
| الخدمة نشطة | استجابة فورية |
| 15 دقيقة بلا زيارات | تنام |
| رسالة جديدة على البوت | تلجرام تصحّيها → **30–60 ثانية** أول مرة |

**نصيحة:** لا تستخدم "pingers" لكسر النوم — مخالفة لشروط Render وقد يوقفون حسابك.

**الحل الدائم:** خطة Starter بـ 7$/شهر (بدون نوم).

---

## 7) البيانات (مهم)

| الوضع | النتيجة |
|---|---|
| `DATABASE_URL` فارغ (PGlite) | ✅ يبدأ فوراً — ⚠️ يُفقد مع كل deploy |
| Neon (مجاني، 1GB، بدون بطاقة) | ✅ دائم — الترحيل بسيط |

### الترحيل إلى Neon (لاحقاً)

1. [neon.tech](https://neon.tech) → أنشئ مشروعاً → انسخ **Connection string**
2. Render → Environment → `DATABASE_URL` = الرابط (مع `?sslmode=require`)
3. أعد النشر → الترحيل والبذور تلقائية عند الإقلاع
4. لنقل البيانات الحالية: Export من الموقع → ثم إعادة إنشاء (أو `pg_dump` من Shell)

---

## 8) استكشاف الأخطاء

| العَرَض | السبب | الحل |
|---|---|---|
| البناء يفشل | ذاكرة غير كافية | أعد المحاولة — نادراً ما يحدث (البناء على منصة Render لا داخل الحاوية) |
| `502` بعد النشر | aún يقلع (>60 ث) | انتظر دقيقة، راقب Logs |
| `/healthz` يعيد `db:false` | فشل PGlite | أعد النشر — أو استخدم Neon |
| البوت لا يرد | ويبهوك غير مسجّل | كرّر الخطوة 4 |
| البوت يرد «غير مصرّح» | `WEBHOOK_SECRET` لا يطابق | أعد التسجيل بنفس السرّ |
| `Conflict: can't use getUpdates` | ويبهوك قديم + polling | نفّذ `/bot:delete` أو `deleteWebhook` |
| `TELEGRAM_WEBHOOK_URL` مضبوط لكن البوت صامت | الرابط لا يطابق `/api/telegram/webhook/<secret>` | تحقق من الرابط في `getWebhookInfo` |
