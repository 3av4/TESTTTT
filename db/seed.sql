-- =====================================================================
--  BitPoin (BTP) — البيانات الافتراضية (Seed)
--  تُنفَّذ بعد schema.sql، وتستطيع تشغيلها أكثر من مرة: القيم الموجودة
--  لا تُستبدل (ON CONFLICT DO NOTHING) حتى لا يمحو الأدمن تعديلاته.
--  الأعمدة: key, value, type, category, label, description, min_value, max_value
-- =====================================================================

-- ------------------------------------------------------------------ إعدادات الاقتصاد
INSERT INTO system_settings (key, value, type, category, label, description, min_value, max_value) VALUES
  ('currency_name',        'BitPoin', 'string',  'economy',  'اسم العملة', 'الاسم الظاهر في كل الواجهات', NULL, NULL),
  ('currency_symbol',      'BTP',     'string',  'economy',  'رمز العملة', 'الرمز المختصر', NULL, NULL),
  ('start_balance',        '1000',    'number',  'economy',  'رصيد الترحيب', 'يُمنح للحساب الجديد عند أول تفعيل', '0', '1000000'),

  ('daily_min',            '100',     'number',  'daily',    'أدنى مكافأة يومية', 'الحد الأدنى للمكافأة العشوائية', '1', '100000'),
  ('daily_max',            '400',     'number',  'daily',    'أعلى مكافأة يومية', 'الحد الأعلى للمكافأة العشوائية', '1', '100000'),
  ('daily_cooldown_hours', '24',      'number',  'daily',    'فاصل الراتب اليومي (ساعة)', 'الحد الأدنى للفترة بين مكافأتين', '1', '168'),
  ('streak_bonus_per_day', '30',      'number',  'daily',    'مكافأة الاستمرارية/يوم', 'تُضاف لكل يوم متتالٍ (حتى الحد)', '0', '10000'),
  ('streak_bonus_max_days','7',       'number',  'daily',    'سقف أيام الاستمرارية', 'بعدها يثبت مضاعف المكافأة', '1', '365'),

  ('transfer_tax_pct',     '5',       'number',  'tax',      'ضريبة التحويل %', 'تُخصم من المبلغ المحوَّل وتذهب لخزينة النظام', '0', '50'),
  ('game_tax_pct',         '5',       'number',  'tax',      'ضريبة أرباح الألعاب %', 'تُخصم من صافي ربح اللاعب فقط', '0', '50'),
  ('wealth_tax_pct',       '0',       'number',  'tax',      'ضريبة الثروة %', '0 = معطلة. تُخصم من الرصيد الذي يتجاوز الحد', '0', '25'),
  ('wealth_tax_threshold', '100000',  'number',  'tax',      'حد ضريبة الثروة', 'الرصيد الذي فوقه تُطبَّق ضريبة الثروة', '0', NULL),
  ('wealth_tax_interval_hours', '24', 'number',  'tax',      'تكرار ضريبة الثروة (ساعة)', 'الفاصل بين احتساب ضريبة الثروة', '1', '720'),

  ('treasury_balance',     '0',       'number',  'economy',  'رصيد خزينة النظام', 'لا تعدّله يدوياً — يُحدَّث تلقائياً', NULL, NULL),

  ('shop_enabled',         'true',    'boolean', 'shop',     'تفعيل المتجر', 'إخفاء/إظهار المتجر في الموقع والبوت', NULL, NULL),
  ('referral_enabled',     'true',    'boolean', 'referral', 'تفعيل الإحالات', 'تفعيل نظام دعوة الأصدقاء', NULL, NULL),
  ('referral_reward_inviter','300',   'number',  'referral', 'مكافأة الداعي', 'تُصرف عندما يفعّل المدعو حسابه', '0', NULL),
  ('referral_reward_invitee','150',   'number',  'referral', 'مكافأة المدعو', 'تُصرف للمستخدم الجديد عبر رابط إحالة', '0', NULL),

  ('min_transfer',         '10',      'number',  'limits',   'أدنى تحويل', 'أصغر مبلغ يمكن تحويله', '1', NULL),
  ('max_transfer',         '1000000', 'number',  'limits',   'أعلى تحويل', 'أكبر مبلغ يمكن تحويله في عملية واحدة', '1', NULL),
  ('bot_enabled',          'true',    'boolean', 'system',   'تفعيل البوت', 'إيقاف مؤقت لكل أوامر البوت', NULL, NULL),
  ('announcement',         '',        'string',  'system',   'إعلان عام', 'نص يظهر أعلى الموقع (فارغ = لا إعلان)', NULL, NULL),
  ('treasury_address',     'BTP-TREASURY', 'string', 'system', 'عنوان الخزينة', 'الاسم الرمزي لخزينة النظام', NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------ إعدادات الألعاب والسرقة والقروض
INSERT INTO system_settings (key, value, type, category, label, description, min_value, max_value) VALUES
  ('bet_min',            '10',   'number', 'games', 'أدنى رهان', 'الحد الأدنى لأي لعبة', '1', NULL),
  ('bet_max',            '5000', 'number', 'games', 'أعلى رهان', 'الحد الأعلى لأي لعبة', '1', NULL),
  ('dice_min',           '10',   'number', 'games', 'أدنى رهان نرد', '', '1', NULL),
  ('dice_max',           '5000', 'number', 'games', 'أعلى رهان نرد', '', '1', NULL),
  ('coinflip_min',       '10',   'number', 'games', 'أدنى رهان عملة', '', '1', NULL),
  ('coinflip_max',       '5000', 'number', 'games', 'أعلى رهان عملة', '', '1', NULL),
  ('slots_min',          '10',   'number', 'games', 'أدنى رهان ماكينة', '', '1', NULL),
  ('slots_max',          '5000', 'number', 'games', 'أعلى رهان ماكينة', '', '1', NULL),
  ('roulette_min',       '10',   'number', 'games', 'أدنى رهان روليت', '', '1', NULL),
  ('roulette_max',       '5000', 'number', 'games', 'أعلى رهان روليت', '', '1', NULL),

  ('rob_min',            '50',   'number', 'rob',  'أدنى مبلغ سرقة', '', '1', NULL),
  ('rob_max',            '5000', 'number', 'rob',  'أعلى مبلغ سرقة', '', '1', NULL),
  ('rob_success_pct',    '40',   'number', 'rob',  'نسبة نجاح السرقة %', 'احتمال نجاح /rob', '1', '90'),
  ('rob_cooldown_minutes','30',  'number', 'rob',  'فاصل السرقة (دقيقة)', '', '0', '1440'),
  ('rob_penalty_pct',    '20',   'number', 'rob',  'عقوبة الفشل %', 'نسبة من المبلغ المسروق تُخصم من السارق', '0', '100'),
  ('rob_victim_share_pct','50',  'number', 'rob',  'نصيب الضحية من العقوبة %', 'يُضاف لرصيد الضحية من عقوبة السارق', '0', '100'),

  ('bank_interest_pct',  '0.5',  'number', 'bank', 'فائدة البنك اليومية %', 'تُحتسب مرة كل 24 ساعة على رصيد البنك', '0', '5'),
  ('bank_min_deposit',   '100',  'number', 'bank', 'أدنى إيداع بنكي', '', '1', NULL),
  ('bank_capacity',      '1000000', 'number', 'bank', 'سعة البنك القصوى', '', '1', NULL),

  ('loan_interest_pct',  '10',   'number', 'loans', 'فائدة القرض %', 'تُضاف إلى المبلغ المستحق', '0', '100'),
  ('loan_max_amount',    '5000', 'number', 'loans', 'أعلى قرض', '', '1', NULL),
  ('loan_duration_hours','24',   'number', 'loans', 'مدة القرض (ساعة)', 'بعدها يُعدّ متعثراً', '1', '720'),
  ('loan_overdue_penalty','20',  'number', 'loans', 'رهان التعثر اليومي %', 'يُخصم في كل يوم تأخير', '0', '100')
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------ أدوات المتجر / الألقاب
INSERT INTO shop_items (code, name, description, icon, price, kind, payload) VALUES
  ('title_whale',    'الحوت',                'لقب يظهر بجانب اسمك في المجموعات', '🐋', 2500, 'title', '{"title":"🐋 الحوت"}'),
  ('title_king',     'ملك BTP',              'لقب ملكي فاخر',                  '👑', 5000, 'title', '{"title":"👑 ملك BTP"}'),
  ('title_lucky',    'المحظوظ',              'لقب للحظ السعيد',                 '🍀', 1500, 'title', '{"title":"🍀 المحظوظ"}'),
  ('title_shark',    'القرش',                'لقب للمراهن الجريء',              '🦈', 2000, 'title', '{"title":"🦈 القرش"}'),
  ('title_ghost',    'الشبح',                'لقب غامض',                        '👻', 1200, 'title', '{"title":"👻 الشبح"}'),
  ('boost_daily_x15','مضاعف الراتب',         'مضاعفة الراتب اليومي القادم ×1.5', '⚡', 800,  'boost', '{"multiplier":1.5,"uses":1}'),
  ('shield_rob',     'درع الحماية',          'حماية من السرقة لمدة 3 أيام',      '🛡️', 1000, 'shield','{"hours":72}'),
  ('badge_verified', 'شارة موثّق',           'شارة توثيق تظهر في ملفك',          '✅', 10000,'badge', '{}')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------------ سجل المهام المجدولة
INSERT INTO jobs (name) VALUES
  ('bank_interest'), ('wealth_tax'), ('loan_overdue'), ('daily_backup')
ON CONFLICT (name) DO NOTHING;
