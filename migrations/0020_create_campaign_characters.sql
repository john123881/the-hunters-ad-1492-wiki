CREATE TABLE campaign_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  player_number INTEGER NOT NULL CHECK (player_number BETWEEN 1 AND 4),
  hero_slug TEXT NOT NULL,
  custom_name TEXT NOT NULL DEFAULT '',
  morale_position INTEGER NOT NULL DEFAULT 0 CHECK (morale_position BETWEEN 0 AND 6),
  strength_level INTEGER NOT NULL DEFAULT 0 CHECK (strength_level BETWEEN 0 AND 4),
  knowledge_level INTEGER NOT NULL DEFAULT 0 CHECK (knowledge_level BETWEEN 0 AND 4),
  perception_level INTEGER NOT NULL DEFAULT 0 CHECK (perception_level BETWEEN 0 AND 4),
  agility_level INTEGER NOT NULL DEFAULT 0 CHECK (agility_level BETWEEN 0 AND 4),
  max_health_level INTEGER NOT NULL DEFAULT 0 CHECK (max_health_level BETWEEN 0 AND 5),
  current_health INTEGER NOT NULL DEFAULT 1 CHECK (current_health BETWEEN 0 AND 12),
  xp_tens INTEGER NOT NULL DEFAULT 0 CHECK (xp_tens BETWEEN 0 AND 60 AND xp_tens % 10 = 0),
  xp_ones INTEGER NOT NULL DEFAULT 0 CHECK (xp_ones BETWEEN 0 AND 9),
  is_poisoned INTEGER NOT NULL DEFAULT 0 CHECK (is_poisoned IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, player_number),
  UNIQUE (campaign_id, hero_slug),
  FOREIGN KEY (campaign_id, player_number) REFERENCES campaign_players(campaign_id, player_number) ON DELETE CASCADE
);

CREATE TABLE character_activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  actor_player_number INTEGER NOT NULL CHECK (actor_player_number BETWEEN 1 AND 4),
  target_player_number INTEGER NOT NULL CHECK (target_player_number BETWEEN 1 AND 4),
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_character_activity_campaign ON character_activity_logs(campaign_id, created_at DESC);
PRAGMA optimize;
