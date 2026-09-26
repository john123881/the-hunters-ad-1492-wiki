-- 戰役馬車：時間軌、五種工坊、素材、逐件裝備、劇情卡 Time Token 與操作紀錄。
PRAGMA foreign_keys = ON;

CREATE TABLE campaign_wagons (
  campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  elapsed_days INTEGER NOT NULL DEFAULT 1 CHECK (elapsed_days >= 1),
  location_code TEXT NOT NULL DEFAULT '',
  shared_gold INTEGER NOT NULL DEFAULT 0 CHECK (shared_gold >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_player INTEGER CHECK (updated_by_player BETWEEN 1 AND 4),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE campaign_wagon_upgrades (
  campaign_id TEXT NOT NULL REFERENCES campaign_wagons(campaign_id) ON DELETE CASCADE,
  station_id INTEGER NOT NULL REFERENCES crafting_stations(id) ON DELETE RESTRICT,
  level INTEGER NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 3),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, station_id)
);

CREATE TABLE campaign_wagon_resources (
  campaign_id TEXT NOT NULL REFERENCES campaign_wagons(campaign_id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES crafting_resources(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, resource_id)
);

CREATE TABLE campaign_equipment_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaign_wagons(campaign_id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  location_type TEXT NOT NULL DEFAULT 'WAGON' CHECK (location_type IN ('WAGON', 'CHARACTER')),
  character_id INTEGER,
  damage_markers INTEGER NOT NULL DEFAULT 0 CHECK (damage_markers >= 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((location_type = 'WAGON' AND character_id IS NULL) OR (location_type = 'CHARACTER' AND character_id IS NOT NULL))
);

CREATE INDEX idx_campaign_equipment_location
  ON campaign_equipment_instances(campaign_id, location_type, character_id);

CREATE TABLE campaign_equipment_attachments (
  equipment_instance_id INTEGER NOT NULL REFERENCES campaign_equipment_instances(id) ON DELETE CASCADE,
  attachment_instance_id INTEGER NOT NULL UNIQUE REFERENCES campaign_equipment_instances(id) ON DELETE RESTRICT,
  socket_index INTEGER NOT NULL CHECK (socket_index >= 1),
  attached_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (equipment_instance_id, socket_index),
  CHECK (equipment_instance_id <> attachment_instance_id)
);

CREATE TABLE campaign_cards_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  card_code TEXT NOT NULL,
  card_type TEXT NOT NULL DEFAULT 'STORY' CHECK (card_type IN ('STORY', 'EVENT')),
  status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'AVAILABLE', 'RESOLVED')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, card_code)
);

CREATE TABLE campaign_card_time_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  story_card_progress_id INTEGER NOT NULL REFERENCES campaign_cards_progress(id) ON DELETE CASCADE,
  token_code TEXT NOT NULL CHECK (token_code IN ('A', 'B', 'C', 'D')),
  token_copy INTEGER NOT NULL CHECK (token_copy IN (1, 2)),
  placed_at_day INTEGER NOT NULL CHECK (placed_at_day >= 1),
  unlock_at_day INTEGER NOT NULL CHECK (unlock_at_day >= placed_at_day),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
  removed_at TEXT,
  removed_by_player INTEGER CHECK (removed_by_player BETWEEN 1 AND 4),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_active_time_token_copy
  ON campaign_card_time_tokens(campaign_id, token_code, token_copy)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX idx_active_story_card_token
  ON campaign_card_time_tokens(campaign_id, story_card_progress_id)
  WHERE status = 'ACTIVE';

CREATE INDEX idx_time_tokens_due
  ON campaign_card_time_tokens(campaign_id, status, unlock_at_day);

CREATE TABLE wagon_activity_logs (
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

CREATE INDEX idx_wagon_activity_campaign
  ON wagon_activity_logs(campaign_id, created_at DESC);

INSERT OR IGNORE INTO campaign_wagons (campaign_id)
SELECT id FROM campaigns WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO campaign_wagon_upgrades (campaign_id, station_id)
SELECT w.campaign_id, s.id
FROM campaign_wagons w
CROSS JOIN crafting_stations s
WHERE s.code IN ('armorers_tools', 'alchemists_lab', 'bowyers_table', 'workshop', 'blacksmiths_tools');

PRAGMA optimize;
