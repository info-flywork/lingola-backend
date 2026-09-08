-- Subscription catalog aligned with RevenueCat store products.
-- Policy (2026-09): monthly + quarterly (3-month) have NO free trial (trial_days = 0).
-- Product IDs must match App Store / Play Console / RevenueCat dashboard.

CREATE TABLE IF NOT EXISTS subscription_plans (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  rc_product_id VARCHAR(128) NOT NULL,
  period ENUM('monthly', 'quarterly', 'yearly') NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  price_usd DECIMAL(10, 2) NULL,
  trial_days INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_subscription_plans_rc_product (rc_product_id),
  KEY idx_subscription_plans_active_period (is_active, period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO subscription_plans (
  id, rc_product_id, period, display_name, price_usd, trial_days, is_active, sort_order, notes
) VALUES
  (
    'monthly',
    'lingola_premium_monthly',
    'monthly',
    'Monthly',
    6.99,
    0,
    1,
    10,
    'No free trial — charge starts immediately'
  ),
  (
    'quarterly',
    'lingola_premium_quarterly',
    'quarterly',
    '3 Months',
    NULL,
    0,
    1,
    20,
    '3-month plan — no free trial; set price_usd when App Store / Play price is final'
  ),
  (
    'yearly',
    'lingola_premium_yearly',
    'yearly',
    'Yearly',
    49.99,
    0,
    0,
    30,
    'Optional / marketing; inactive in store offerings by default; no free trial'
  )
ON DUPLICATE KEY UPDATE
  rc_product_id = VALUES(rc_product_id),
  period = VALUES(period),
  display_name = VALUES(display_name),
  price_usd = VALUES(price_usd),
  trial_days = VALUES(trial_days),
  is_active = VALUES(is_active),
  sort_order = VALUES(sort_order),
  notes = VALUES(notes),
  updated_at = CURRENT_TIMESTAMP(3);

-- Track which RC product / plan the user currently has.
ALTER TABLE users
  ADD COLUMN subscription_plan_id VARCHAR(64) NULL
    AFTER subscription_status,
  ADD COLUMN subscription_product_id VARCHAR(128) NULL
    AFTER subscription_plan_id,
  ADD COLUMN subscription_expires_at DATETIME(3) NULL
    AFTER subscription_product_id;

ALTER TABLE users
  ADD KEY idx_users_subscription_plan (subscription_plan_id),
  ADD KEY idx_users_subscription_product (subscription_product_id);
