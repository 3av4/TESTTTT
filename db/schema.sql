-- =====================================================================
--  BitPoin (BTP) — مخطط قاعدة البيانات
--  ملاحظة: كل الأرصدة والمبالغ أعداد صحيحة (BIGINT) بوحدة "الوحدة الأساسية".
--  كل عملية مالية تجري داخل Transaction وتقفل صفوف المستخدمين بـ
--  SELECT ... FOR UPDATE بترتيب ثابت للمعرّفات لمنع الـ deadlock.
-- =====================================================================

-- ------------------------------------------------------------------ المستخدمون
CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL PRIMARY KEY,
  telegram_id   BIGINT UNIQUE NOT NULL,
  username      TEXT,
  first_name    TEXT,
  photo_url     TEXT,
  balance       BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_daily    TIMESTAMPTZ,
  streak        INTEGER NOT NULL DEFAULT 0,
  is_banned     BOOLEAN NOT NULL DEFAULT false,
  role          TEXT NOT NULL DEFAULT 'user',
  referral_code TEXT UNIQUE,
  referred_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  referral_earnings BIGINT NOT NULL DEFAULT 0,
  bank_balance  BIGINT NOT NULL DEFAULT 0 CHECK (bank_balance >= 0),
  last_bank_interest TIMESTAMPTZ,
  last_rob_at  TIMESTAMPTZ,
  items         JSONB NOT NULL DEFAULT '{}'::jsonb,
  active_title  TEXT,
  total_wagered BIGINT NOT NULL DEFAULT 0,
  total_won     BIGINT NOT NULL DEFAULT 0,
  games_played  INTEGER NOT NULL DEFAULT 0,
  daily_count   INTEGER NOT NULL DEFAULT 0,
  bank_count    INTEGER NOT NULL DEFAULT 0,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_balance_idx ON users (balance DESC);
CREATE INDEX IF NOT EXISTS users_telegram_id_idx ON users (telegram_id);
CREATE INDEX IF NOT EXISTS users_referral_code_idx ON users (referral_code);

-- ترقية آمنة لقواعد بيانات قديمة (تجاهل الأخطاء)
DO $$
BEGIN
  BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS total_wagered BIGINT NOT NULL DEFAULT 0; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS total_won BIGINT NOT NULL DEFAULT 0; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS games_played INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_count INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_count INTEGER NOT NULL DEFAULT 0; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(); EXCEPTION WHEN others THEN NULL; END;
END $$;

-- ------------------------------------------------------------------ الجلسات
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip          TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- ------------------------------------------------------------------ المعاملات (دفتر الأستاذ)
CREATE TABLE IF NOT EXISTS transactions (
  id            BIGSERIAL PRIMARY KEY,
  sender_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  recipient_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  amount        BIGINT NOT NULL,
  tax           BIGINT NOT NULL DEFAULT 0,
  fee           BIGINT NOT NULL DEFAULT 0,
  net           BIGINT NOT NULL DEFAULT 0,
  type          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'completed',
  note          TEXT,
  source        TEXT NOT NULL DEFAULT 'bot',
  balance_after BIGINT,
  recipient_balance_after BIGINT,
  ref_id        BIGINT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tx_sender_idx ON transactions (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tx_recipient_idx ON transactions (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tx_type_idx ON transactions (type);
CREATE INDEX IF NOT EXISTS tx_created_idx ON transactions (created_at DESC);

-- ------------------------------------------------------------------ إعدادات النظام
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'number',
  category    TEXT NOT NULL DEFAULT 'economy',
  label       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  min_value   TEXT,
  max_value   TEXT,
  updated_by  BIGINT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ إعدادات القروبات
CREATE TABLE IF NOT EXISTS group_settings (
  chat_id        BIGINT PRIMARY KEY,
  title          TEXT,
  enabled        BOOLEAN NOT NULL DEFAULT true,
  games_enabled  BOOLEAN NOT NULL DEFAULT true,
  economy_enabled BOOLEAN NOT NULL DEFAULT true,
  welcome_enabled BOOLEAN NOT NULL DEFAULT true,
  min_bet        BIGINT,
  max_bet        BIGINT,
  daily_enabled  BOOLEAN NOT NULL DEFAULT true,
  log_transactions BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ الألعاب
CREATE TABLE IF NOT EXISTS games (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id     BIGINT,
  game        TEXT NOT NULL,
  bet         BIGINT NOT NULL,
  payout      BIGINT NOT NULL DEFAULT 0,
  tax         BIGINT NOT NULL DEFAULT 0,
  result      TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS games_user_idx ON games (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS games_chat_idx ON games (chat_id, created_at DESC);

-- ------------------------------------------------------------------ المتجر
CREATE TABLE IF NOT EXISTS shop_items (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '🎁',
  price       BIGINT NOT NULL CHECK (price >= 0),
  kind        TEXT NOT NULL DEFAULT 'title',
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  stock       INTEGER,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchases (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     BIGINT NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  price       BIGINT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchases_user_idx ON purchases (user_id, created_at DESC);

-- ------------------------------------------------------------------ أكواد الهدايا
CREATE TABLE IF NOT EXISTS redeem_codes (
  code        TEXT PRIMARY KEY,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  max_uses    INTEGER NOT NULL DEFAULT 1,
  uses        INTEGER NOT NULL DEFAULT 0,
  per_user    INTEGER NOT NULL DEFAULT 1,
  created_by  BIGINT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS code_redemptions (
  code        TEXT NOT NULL REFERENCES redeem_codes(code) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code, user_id)
);

-- ------------------------------------------------------------------ القروض
CREATE TABLE IF NOT EXISTS loans (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  principal    BIGINT NOT NULL,
  total_due    BIGINT NOT NULL,
  paid         BIGINT NOT NULL DEFAULT 0,
  reason       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at       TIMESTAMPTZ NOT NULL,
  closed_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS loans_user_idx ON loans (user_id, status);
CREATE INDEX IF NOT EXISTS loans_status_idx ON loans (status, due_at);

-- ------------------------------------------------------------------ الإشعارات
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'info',
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- ------------------------------------------------------------------ سجل التدقيق
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    BIGINT,
  actor_label TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs (actor_id);

-- ------------------------------------------------------------------ دعوات الإحالة
CREATE TABLE IF NOT EXISTS referral_claims (
  id            BIGSERIAL PRIMARY KEY,
  inviter_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id    BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  reward        BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at    TIMESTAMPTZ
);

-- ------------------------------------------------------------------ حماية Rate limit (موزّعة)
CREATE TABLE IF NOT EXISTS rate_limits (
  limit_key   TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count       INTEGER NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------ مهام مجدولة
CREATE TABLE IF NOT EXISTS jobs (
  name          TEXT PRIMARY KEY,
  last_run_at   TIMESTAMPTZ,
  last_status   TEXT,
  last_error    TEXT,
  run_count     BIGINT NOT NULL DEFAULT 0
);
