#!/usr/bin/env bash
# =============================================================================
# تشغيل BitPoin بنقرة واحدة (الموقع + البوت + قاعدة البيانات)
#
#   ./start.sh              # وضع الإنتاج (سريع، يتطلب build مسبق)
#   ./start.sh --build      # بناء ثم تشغيل
#   ./start.sh --dev        # وضع التطوير (HMR)
#   ./start.sh --keepalive  # مع إعادة تشغيل تلقائي عند الانهيار
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

MODE="prod"
BUILD=0
KEEPALIVE=0

for arg in "$@"; do
  case "$arg" in
    --build) BUILD=1 ;;
    --dev) MODE="dev" ;;
    --keepalive) KEEPALIVE=1 ;;
    *) echo "خيار غير معروف: $arg"; exit 1 ;;
  esac
done

echo "════════════════════════════════════════════════════"
echo "  BitPoin (BTP) — تشغيل المنصة"
echo "════════════════════════════════════════════════════"

# 1) التبعيات
if [ ! -d node_modules ]; then
  echo "→ تثبيت التبعيات…"
  npm ci
fi

# 2) ملف البيئة
if [ ! -f .env ]; then
  echo "→ إنشاء .env من القالب…"
  cp .env.example .env
  echo "⚠️  عدّل BOT_TOKEN و JWT_SECRET في .env ثم أعد التشغيل"
fi

# 3) التأكد من عدم وجود نسخة قديمة
if command -v pkill >/dev/null 2>&1; then
  pkill -f "tsx server.ts" 2>/dev/null || true
  sleep 1
fi

# 4) البناء
if [ "$MODE" = "prod" ] && { [ "$BUILD" = "1" ] || [ ! -f .next/BUILD_ID ]; }; then
  echo "→ بناء الإنتاج…"
  npm run build
fi

# 5) التشغيل
export NODE_ENV=$([ "$MODE" = "prod" ] && echo production || echo development)
export PORT="${PORT:-3000}"

echo ""
echo "→ البدء على المنفذ $PORT (وضع $MODE)…"
echo "  الصفحات: /  /login  /dashboard  /games  /shop  /status"
echo ""

if [ "$KEEPALIVE" = "1" ]; then
  exec npx tsx scripts/keepalive.ts
else
  exec npx tsx server.ts
fi
