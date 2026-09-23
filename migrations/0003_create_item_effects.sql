-- 0003_create_item_effects.sql
-- 建立效果字典與物品效果表

PRAGMA foreign_keys = ON;

-- 效果字典
CREATE TABLE effect_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  effect_group TEXT NOT NULL CHECK (effect_group IN (
    'attribute_modifier', 'defense_modifier', 'attack_modifier',
    'status', 'reroll', 'resource', 'rule_modifier', 'other'
  )),
  description TEXT
);

-- 物品效果關聯
CREATE TABLE item_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  effect_definition_id INTEGER NOT NULL REFERENCES effect_definitions(id) ON DELETE RESTRICT,
  action_mode_id INTEGER REFERENCES item_action_modes(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL DEFAULT 'self' CHECK (target_type IN ('self', 'weapon', 'attack', 'ally', 'enemy', 'area')),
  numeric_value INTEGER,
  operation TEXT NOT NULL DEFAULT 'apply' CHECK (operation IN ('add', 'subtract', 'set', 'apply', 'reroll')),
  trigger_timing TEXT NOT NULL DEFAULT 'passive',
  duration_type TEXT NOT NULL DEFAULT 'permanent',
  is_negative INTEGER NOT NULL DEFAULT 0 CHECK (is_negative IN (0, 1)),
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  params_json TEXT
);
