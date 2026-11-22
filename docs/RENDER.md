# 🚀 نشر BitPoin على Render — خطوة واحدة

> بعد التصحيحات، لم يعد هناك أي أمر يدوي. البوت يسجّل ويبهوكه بنفسه عند الإقلاع.

---

## ✅ ما تم تصحيحه (مشاكل حقيقية اكتُشفت بالاختبار)

| # | الخطأ | الأثر | الإصلاح |
|---|---|---|---|
| 1 | **`Dockerfile` لا ينسخ `server.ts`** | 🔴 **فشل فوري** — الحاوية تُقلع ثم `Cannot find module server.ts` | أُضيف سطر COPY |
| 2 | `startCommand: npm run start` | ❌ صيغة POSIX لا تعمل كأمر بدء | Docker + `CMD` الصحيح |
| 3 | `PORT` فارغ | ❌ الحاوية لا تعرف المنفذ | `PORT=3000` في Dockerfile |
| 4 | لا `JWT_SECRET` | ❌ رفض الإقلاع | `generateValue: true` |
| 5 | ويبهوك يدوي | ❌ لا Shell في Free → بوت صامت | **تسجيل تلقائي عند الإقلاع** |
| 6 | `APP_URL` يسقط إلى localhost | ❌ روابط خاطئة | دعم `RENDER_EXTERNAL_URL` |

**تم التحقق فعلياً:** الحاوية تعمل من مجلد نظيف مطابق للـ Dockerfile → `/healthz` = `db:true`، الصفحة الرئيسية 200.

---

## الخطوة الوحيدة

### 1. احذف الخدمة القديمة

Render → خدمتك → **Settings** → أسفل → **Delete Web Service**

### 2. توكن جديد

[@BotFather](https://t.me/BotFather) → `/revoke` → اختر بوتك → انسخ التوكن

> 🔴 القديم مكشوف في مستودعك العام.

### 3. Blueprint

Render → **New +** → **Blueprint** → `3av4/TESTTTT` → الفرع `arena/e971f73e-testttt`

يقرأ `render.yaml` تلقائياً. **سيسألك قيمة واحدة فقط:**

| المتغير | القيمة |
|---|---|
| `BOT_TOKEN` | التوكن من الخطوة 2 🔴 |

> `ADMIN_IDS` مضبوط مسبقاً على `8764194314` (Abdnoor).
> `JWT_SECRET` و `WEBHOOK_SECRET` يولّدهما Render.
> `APP_URL` يأتي من `RENDER_EXTERNAL_URL` تلقائياً.

### 4. خلاص ✅

انتظر البناء. لا خطوة ويبهوك، لا Shell، لا شيء يدوي.

---

## كيف يعمل الويبهوك التلقائي؟

عند كل إقلاع، `server/bot/autoWebhook.ts`:

1. يقرأ `APP_URL` (أو `RENDER_EXTERNAL_URL`)
2. يتحقق أنه `https://` عام (يرفض localhost)
3. يسأل تلجرام: هل الويبهوك مطابق؟
   - مطابق → لا يفعل شيئاً
   - غير مطابق → يسجّل الجديد
4. أي فشل (شبكة، توكن) → **لا يمنع الإقلاع**، يسجّل تحذيراً

**السرّ ثابت**: `WEBHOOK_SECRET` مشتق من `JWT_SECRET`، فلا يتغير مع النوم/الإيقاظ.

تحقق من السجل بعد النشر:

```
[auto-webhook] ✔ تم تسجيل الويبهوك تلقائياً  ← نجاح
[auto-webhook] الويبهوك مسجّل مسبقاً ومطابق ← إقلاع لاحق
```

---

## اختبر

| # | الاختبار | المتوقع |
|---|---|---|
| 1 | `https://<خدمتك>.onrender.com/healthz` | `{"ok":true,"data":{"db":true,...}}` |
| 2 | الصفحة الرئيسية | تفتح |
| 3 | [@BitPoinBot](https://t.me/BitPoinBot) → `/start` | يرد |
| 4 | `/menu` | قائمة أزرار |
| 5 | `/daily` | راتب |
| 6 | موقع → دخول | عبر تلجرام |

---

## المتغيرات (للرجوع)

| المتغير | المصدر | ملاحظة |
|---|---|---|
| `BOT_TOKEN` | أنت | 🔴 سري |
| `ADMIN_IDS` | مضبوط | `8764194314` |
| `JWT_SECRET` | Render | مولّد |
| `WEBHOOK_SECRET` | مشتق | من `JWT_SECRET` |
| `APP_URL` | تلقائي | من `RENDER_EXTERNAL_URL` |
| `DATABASE_URL` | فارغ | PGlite مؤقتة |
| `PORT` | Dockerfile | 3000 |
| `NODE_ENV` | render.yaml | production |
| `DEMO_MODE` | render.yaml | false |

---

## توقّعات المحطة المجانية

| الشي | الواقع |
|---|---|
| 💤 النوم | 15 دقيقة خمول → تنام |
| ⏱️ الإيقاظ | تلجرام تصحّيها، 30–60 ثانية |
| 💾 البيانات | **تُفقد** عند كل deploy أو spin-down |
| 💰 التكلفة | 0$ بدون بطاقة |
| ⚡ الذاكرة | 82MB من 512MB ✅ |
| 🔧 Shell | ❌ غير متاح (لذلك التسجيل تلقائي) |

### بيانات دائمة — Neon

1. [neon.tech](https://neon.tech) → New Project (مجاني، بدون بطاقة)
2. انسخ Connection String
3. Render → Environment → `DATABASE_URL` = الرابط + `?sslmode=require`
4. أعد النشر

---

## استكشاف الأخطاء

| العَرَض | السبب | الحل |
|---|---|---|
| `Cannot find module server.ts` | Dockerfile قديم | تأكد أن الفرع يحتوي commit `server.ts` |
| `JWT_SECRET مطلوب` | المتغير فارغ | احذف الخدمة وأعد Blueprint |
| `Port scan timeout` | runtime ليس docker | يجب `runtime: docker` |
| `/healthz` → `db:false` | PGlite فشل | أعد النشر |
| البوت صامت | الويبهوك فشل | اقرأ `[auto-webhook]` في Logs |
| `network_error` في الويبهوك | Render لا يصل لتلجرام | نادر — أعد النشر |
| البوت يرد `401` | سرّ غير مطابق | أعد النشر (السرّ مشتق فيتجدّد) |
| Blueprint يرفض الاسم | خدمة قديمة موجودة | احذفها (خطوة 1) |
