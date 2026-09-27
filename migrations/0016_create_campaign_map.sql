-- 戰役地圖：核心 M01-M20、獵人位置、卡片放置及操作紀錄。
PRAGMA foreign_keys = ON;

CREATE TABLE campaign_maps (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  current_location_type TEXT CHECK (current_location_type IN ('MAP', 'LOCATION')),
  current_location_code TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_player INTEGER CHECK (updated_by_player BETWEEN 1 AND 4),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (current_location_type IS NULL AND current_location_code IS NULL)
    OR (current_location_type IS NOT NULL AND current_location_code IS NOT NULL)
  )
);

CREATE TABLE campaign_map_tiles (
  campaign_id TEXT NOT NULL REFERENCES campaign_maps(campaign_id) ON DELETE CASCADE,
  map_code TEXT NOT NULL,
  row_index INTEGER NOT NULL CHECK (row_index BETWEEN 1 AND 4),
  column_index INTEGER NOT NULL CHECK (column_index BETWEEN 1 AND 5),
  is_revealed INTEGER NOT NULL DEFAULT 0 CHECK (is_revealed IN (0, 1)),
  face TEXT NOT NULL DEFAULT 'BACK' CHECK (face IN ('FRONT', 'BACK')),
  resource_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, map_code),
  UNIQUE (campaign_id, row_index, column_index)
);

CREATE TABLE campaign_map_card_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaign_maps(campaign_id) ON DELETE CASCADE,
  card_code TEXT NOT NULL,
  card_type TEXT NOT NULL CHECK (card_type IN ('STORY', 'MISSION', 'FEATURE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED')),
  location_type TEXT NOT NULL CHECK (location_type IN ('MAP', 'LOCATION')),
  location_code TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, card_code)
);

CREATE INDEX idx_campaign_map_cards_location
  ON campaign_map_card_placements(campaign_id, location_type, location_code);

CREATE TABLE map_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  player_number INTEGER NOT NULL CHECK (player_number BETWEEN 1 AND 4),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_map_activity_campaign
  ON map_activity_logs(campaign_id, created_at DESC);

INSERT OR IGNORE INTO campaign_maps (campaign_id)
SELECT id FROM campaigns WHERE deleted_at IS NULL;

WITH RECURSIVE numbers(value) AS (
  SELECT 1
  UNION ALL
  SELECT value + 1 FROM numbers WHERE value < 20
)
INSERT OR IGNORE INTO campaign_map_tiles (campaign_id, map_code, row_index, column_index)
SELECT m.campaign_id,
       printf('M%02d', numbers.value),
       CAST((numbers.value - 1) / 5 AS INTEGER) + 1,
       ((numbers.value - 1) % 5) + 1
FROM campaign_maps m CROSS JOIN numbers;

PRAGMA optimize;
