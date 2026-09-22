-- 0002_create_item_profiles.sql
-- 建立物品規格、行動模式、接口與防禦表

PRAGMA foreign_keys = ON;

-- 武器規格（一對一關聯 items）
CREATE TABLE weapon_specs (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  notes TEXT
);

-- 武器插槽與接口（記錄某武器在哪一格具有哪種接口）
CREATE TABLE weapon_sockets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weapon_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL CHECK (slot_index >= 1),
  socket_index INTEGER NOT NULL DEFAULT 1 CHECK (socket_index >= 1),
  connector_type_id INTEGER NOT NULL REFERENCES connector_types(id) ON DELETE RESTRICT,
  UNIQUE (weapon_item_id, slot_index, socket_index)
);

-- 武器附件規格（一對一關聯 items，指定該附件符合哪種接口）
CREATE TABLE attachment_specs (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  connector_type_id INTEGER NOT NULL REFERENCES connector_types(id) ON DELETE RESTRICT,
  notes TEXT
);

-- 物品行動模式（武器攻擊、網子、陷阱等判定）
CREATE TABLE item_action_modes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('damage', 'control', 'healing', 'defense', 'other')),
  attack_type TEXT CHECK (attack_type IN ('melee', 'physical_ranged', 'magic', 'trap')),
  resolution_method TEXT NOT NULL CHECK (resolution_method IN ('normal_attack', 'dice_check', 'automatic')),
  value_source TEXT NOT NULL CHECK (value_source IN ('character_attribute', 'fixed', 'action_card', 'none')),
  attribute_code TEXT CHECK (attribute_code IN ('strength', 'agility', 'wisdom', 'insight')),
  fixed_value INTEGER,
  dice_count INTEGER CHECK (dice_count IS NULL OR dice_count >= 0),
  check_modifier INTEGER NOT NULL DEFAULT 0,
  range_type TEXT NOT NULL CHECK (range_type IN ('fixed', 'action_card', 'none')),
  range_min INTEGER CHECK (range_min IS NULL OR range_min >= 0),
  range_max INTEGER CHECK (range_max IS NULL OR range_max >= 0),
  target_attribute_code TEXT,
  comparison_operator TEXT,
  description TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 1 CHECK (display_order >= 1),
  CHECK (range_type != 'fixed' OR (range_min IS NOT NULL AND range_max IS NOT NULL AND range_min <= range_max))
);

-- 防具與飾品固定防禦面板
CREATE TABLE defense_specs (
  item_id INTEGER PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  melee_defense INTEGER NOT NULL DEFAULT 0,
  ranged_defense INTEGER NOT NULL DEFAULT 0,
  magic_defense INTEGER NOT NULL DEFAULT 0
);

-- 盾牌檢定規則
CREATE TABLE shield_roll_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shield_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  attribute_code TEXT NOT NULL CHECK (attribute_code IN ('strength', 'agility')),
  fixed_value INTEGER NOT NULL,
  dice_count INTEGER NOT NULL CHECK (dice_count >= 0),
  UNIQUE (shield_item_id, attribute_code)
);

-- 武器特性（如裝填 reload）
CREATE TABLE weapon_traits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  weapon_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  trait_code TEXT NOT NULL,
  numeric_value INTEGER,
  description TEXT
);
