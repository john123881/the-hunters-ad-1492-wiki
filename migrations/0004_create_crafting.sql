-- 0004_create_crafting.sql
-- 建立合成系統：合成台、合成配方與材料

PRAGMA foreign_keys = ON;

-- 合成台字典
CREATE TABLE crafting_stations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT
);

-- 合成配方（一個物品可有多個配方）
CREATE TABLE recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  output_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  output_quantity INTEGER NOT NULL DEFAULT 1 CHECK (output_quantity > 0),
  crafting_station_id INTEGER REFERENCES crafting_stations(id) ON DELETE SET NULL,
  required_station_level INTEGER CHECK (required_station_level IS NULL OR required_station_level >= 1),
  description TEXT
);

-- 配方材料
CREATE TABLE recipe_ingredients (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (recipe_id, ingredient_item_id)
);
