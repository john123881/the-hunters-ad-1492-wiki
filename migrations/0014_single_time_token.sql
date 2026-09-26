-- A–D 各只有一枚實體 Time Token，移除 token_copy。
PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_active_time_token_copy;
DROP INDEX IF EXISTS idx_active_story_card_token;
DROP INDEX IF EXISTS idx_time_tokens_due;

CREATE TABLE campaign_card_time_tokens_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  story_card_progress_id INTEGER NOT NULL REFERENCES campaign_cards_progress(id) ON DELETE CASCADE,
  token_code TEXT NOT NULL CHECK (token_code IN ('A', 'B', 'C', 'D')),
  placed_at_day INTEGER NOT NULL CHECK (placed_at_day >= 1),
  unlock_at_day INTEGER NOT NULL CHECK (unlock_at_day >= placed_at_day),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
  removed_at TEXT,
  removed_by_player INTEGER CHECK (removed_by_player BETWEEN 1 AND 4),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO campaign_card_time_tokens_new
  (id, campaign_id, story_card_progress_id, token_code, placed_at_day, unlock_at_day, status, removed_at, removed_by_player, created_at)
SELECT t.id, t.campaign_id, t.story_card_progress_id, t.token_code,
       t.placed_at_day, t.unlock_at_day, t.status, t.removed_at, t.removed_by_player, t.created_at
FROM campaign_card_time_tokens t
WHERE t.status = 'REMOVED'
   OR t.id = (
     SELECT MIN(active.id)
     FROM campaign_card_time_tokens active
     WHERE active.campaign_id = t.campaign_id
       AND active.token_code = t.token_code
       AND active.status = 'ACTIVE'
   );

DROP TABLE campaign_card_time_tokens;
ALTER TABLE campaign_card_time_tokens_new RENAME TO campaign_card_time_tokens;

CREATE UNIQUE INDEX idx_active_time_token_code
  ON campaign_card_time_tokens(campaign_id, token_code)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX idx_active_story_card_token
  ON campaign_card_time_tokens(campaign_id, story_card_progress_id)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_time_tokens_due
  ON campaign_card_time_tokens(campaign_id, status, unlock_at_day);

PRAGMA foreign_keys = ON;
PRAGMA optimize;
