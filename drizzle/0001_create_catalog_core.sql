-- 0001_create_catalog_core.sql
-- 建立核心資料表：物品分類 (item_categories)、接口類型 (connector_types)、物品主檔 (items)

PRAGMA foreign_keys = ON;

-- 物品分類
CREATE TABLE item_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slot_zone TEXT,
  description TEXT
);

-- 武器附件接口類型字典
CREATE TABLE connector_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  shape_description TEXT,
  description TEXT
);

-- 物品主檔
CREATE TABLE items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id INTEGER NOT NULL REFERENCES item_categories(id) ON DELETE RESTRICT,
  slot_count INTEGER NOT NULL CHECK (slot_count BETWEEN 1 AND 4),
  consumption_type TEXT NOT NULL CHECK (consumption_type IN ('permanent', 'consumed_on_use', 'consumed_after_combat')),
  usage_limit_type TEXT NOT NULL CHECK (usage_limit_type IN ('unlimited', 'single_use', 'once_per_combat')),
  description TEXT NOT NULL DEFAULT '',
  original_effect_text TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  language_code TEXT NOT NULL DEFAULT 'zh-TW',
  edition_code TEXT,
  source_reference TEXT,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
