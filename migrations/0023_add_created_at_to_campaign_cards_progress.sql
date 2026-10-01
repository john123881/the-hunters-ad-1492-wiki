-- 為 campaign_cards_progress 補齊 created_at 欄位
-- SQLite ALTER TABLE ADD COLUMN 限制預設值需為常數，因此先給予空字串/預設字串，並更新為 updated_at
ALTER TABLE campaign_cards_progress
  ADD COLUMN created_at TEXT NOT NULL DEFAULT '';

UPDATE campaign_cards_progress
  SET created_at = updated_at
  WHERE created_at = '';
