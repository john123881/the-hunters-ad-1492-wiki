-- 地點卡、事件人工紀錄及大劇情卡加入城鎮狀態。
PRAGMA foreign_keys = ON;

ALTER TABLE campaign_maps ADD COLUMN road_event_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE campaign_maps ADD COLUMN town_event_notes TEXT NOT NULL DEFAULT '';

CREATE TABLE campaign_location_cards (
  campaign_id TEXT NOT NULL REFERENCES campaign_maps(campaign_id) ON DELETE CASCADE,
  location_code TEXT NOT NULL,
  is_revealed INTEGER NOT NULL DEFAULT 0 CHECK (is_revealed IN (0, 1)),
  face TEXT NOT NULL DEFAULT 'BACK' CHECK (face IN ('FRONT', 'BACK')),
  resource_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, location_code)
);

ALTER TABLE campaign_map_card_placements
  ADD COLUMN is_in_town_deck INTEGER NOT NULL DEFAULT 0 CHECK (is_in_town_deck IN (0, 1));

WITH RECURSIVE location_numbers(value) AS (
  SELECT 1
  UNION ALL
  SELECT value + 1 FROM location_numbers WHERE value < 14
)
INSERT OR IGNORE INTO campaign_location_cards (campaign_id, location_code)
SELECT m.campaign_id, printf('L%02d', location_numbers.value)
FROM campaign_maps m CROSS JOIN location_numbers;

PRAGMA optimize;
