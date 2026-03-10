ALTER TABLE merit_recommendations
  ADD COLUMN IF NOT EXISTS performance_rating INTEGER,
  ADD COLUMN IF NOT EXISTS bonus_target_percent NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS bonus_payout_percent NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS bonus_payout_amount NUMERIC(16,2);

ALTER TABLE merit_recommendations
  DROP CONSTRAINT IF EXISTS merit_recommendations_performance_rating_check;

ALTER TABLE merit_recommendations
  ADD CONSTRAINT merit_recommendations_performance_rating_check
  CHECK (performance_rating IS NULL OR performance_rating IN (1, 2, 3));
