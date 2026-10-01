-- Align stored character tracker values with the values used by the character panel UI.
-- Morale is stored as its displayed value (-2 through 4), and XP tens supports 0 through 90.
PRAGMA foreign_keys = OFF;

ALTER TABLE campaign_characters RENAME TO campaign_characters_legacy;

CREATE TABLE campaign_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  player_number INTEGER NOT NULL CHECK (player_number BETWEEN 1 AND 4),
  hero_slug TEXT NOT NULL,
  custom_name TEXT NOT NULL DEFAULT '',
  morale_position INTEGER NOT NULL DEFAULT 0 CHECK (morale_position BETWEEN -2 AND 4),
  strength_level INTEGER NOT NULL DEFAULT 0 CHECK (strength_level BETWEEN 0 AND 4),
  knowledge_level INTEGER NOT NULL DEFAULT 0 CHECK (knowledge_level BETWEEN 0 AND 4),
  perception_level INTEGER NOT NULL DEFAULT 0 CHECK (perception_level BETWEEN 0 AND 4),
  agility_level INTEGER NOT NULL DEFAULT 0 CHECK (agility_level BETWEEN 0 AND 4),
  max_health_level INTEGER NOT NULL DEFAULT 0 CHECK (max_health_level BETWEEN 0 AND 5),
  current_health INTEGER NOT NULL DEFAULT 1 CHECK (current_health BETWEEN 0 AND 12),
  xp_tens INTEGER NOT NULL DEFAULT 0 CHECK (xp_tens BETWEEN 0 AND 90 AND xp_tens % 10 = 0),
  xp_ones INTEGER NOT NULL DEFAULT 0 CHECK (xp_ones BETWEEN 0 AND 9),
  is_poisoned INTEGER NOT NULL DEFAULT 0 CHECK (is_poisoned IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, player_number),
  UNIQUE (campaign_id, hero_slug),
  FOREIGN KEY (campaign_id, player_number)
    REFERENCES campaign_players(campaign_id, player_number) ON DELETE CASCADE
);

INSERT INTO campaign_characters (
  id, campaign_id, player_number, hero_slug, custom_name,
  morale_position, strength_level, knowledge_level, perception_level, agility_level,
  max_health_level, current_health, xp_tens, xp_ones, is_poisoned,
  notes, version, created_at, updated_at
)
SELECT
  id, campaign_id, player_number, hero_slug, custom_name,
  morale_position, strength_level, knowledge_level, perception_level, agility_level,
  max_health_level, current_health, xp_tens, xp_ones, is_poisoned,
  notes, version, created_at, updated_at
FROM campaign_characters_legacy;

DROP TABLE campaign_characters_legacy;

PRAGMA foreign_keys = ON;
PRAGMA optimize;
