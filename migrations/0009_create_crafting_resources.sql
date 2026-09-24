-- 建立正式合成資源與 Wagon 工坊規格。
-- 中文名稱為非官方繁體中文整理；original_name 保留規則書正式英文。
PRAGMA foreign_keys = ON;

-- 既有 crafting_stations 保留主鍵，補足正式英文名稱、最高等級與排序。
ALTER TABLE crafting_stations ADD COLUMN original_name TEXT NOT NULL DEFAULT '';
ALTER TABLE crafting_stations ADD COLUMN max_level INTEGER NOT NULL DEFAULT 3 CHECK (max_level = 3);
ALTER TABLE crafting_stations ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crafting_stations ADD COLUMN image_url TEXT NOT NULL DEFAULT '';

UPDATE crafting_stations
SET code = 'blacksmiths_tools',
    name = '鐵匠工具',
    original_name = 'Blacksmith’s Tools',
    description = '箭頭、近戰武器與火器（arrowheads, melee weapons, firearms）',
    max_level = 3,
    sort_order = 5
WHERE code = 'blacksmith';

UPDATE crafting_stations
SET code = 'alchemists_lab',
    name = '煉金實驗室',
    original_name = 'Alchemist’s Lab',
    description = '調合物、藥草、藥水與火藥（concoctions, herbs, potions, gunpowder）',
    max_level = 3,
    sort_order = 2
WHERE code = 'alchemy_table';

UPDATE crafting_stations
SET code = 'workshop',
    name = '工藝作坊',
    original_name = 'Workshop',
    description = '衣物、陷阱、珠寶與柄桿（clothes, traps, jewelry, shafts）',
    max_level = 3,
    sort_order = 4
WHERE code = 'workbench';

INSERT OR IGNORE INTO crafting_stations
  (code, name, original_name, description, max_level, sort_order)
VALUES
  ('armorers_tools', '護甲匠工具', 'Armorer’s Tools',
   '護甲與盾牌（armor, shields）', 3, 1),
  ('bowyers_table', '製弓師工作台', 'Bowyer’s Table',
   '弓、箭與十字弓（bows, arrows, crossbows）', 3, 3);

UPDATE crafting_stations
SET image_url = '/images/workshops/' || code || '.png'
WHERE code IN (
  'armorers_tools',
  'alchemists_lab',
  'bowyers_table',
  'workshop',
  'blacksmiths_tools'
);

-- 五種 Wagon 工坊共用同一套升級費用。
CREATE TABLE wagon_upgrade_levels (
  level INTEGER PRIMARY KEY CHECK (level BETWEEN 1 AND 3),
  cost_ducats INTEGER NOT NULL CHECK (cost_ducats > 0)
);

INSERT INTO wagon_upgrade_levels (level, cost_ducats) VALUES
  (1, 2),
  (2, 3),
  (3, 5);

-- 規則書中的 18 種資源 Token。
CREATE TABLE crafting_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  category_code TEXT NOT NULL
    CHECK (category_code IN ('material', 'plant', 'trophy')),
  image_url TEXT NOT NULL DEFAULT '',
  image_alt TEXT NOT NULL DEFAULT '',
  language_code TEXT NOT NULL DEFAULT 'zh-TW',
  source_reference TEXT NOT NULL DEFAULT 'Rules Compendium: Resources',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO crafting_resources
  (code, slug, name, original_name, category_code, image_alt, sort_order)
VALUES
  ('material_yarn', 'yarn', '紗線', 'Yarn', 'material', '紗線（Yarn）材料圖示', 1),
  ('material_leather', 'leather', '皮革', 'Leather', 'material', '皮革（Leather）材料圖示', 2),
  ('material_steel', 'steel', '鋼', 'Steel', 'material', '鋼（Steel）材料圖示', 3),
  ('material_silver', 'silver', '銀', 'Silver', 'material', '銀（Silver）材料圖示', 4),
  ('material_saltpeter', 'saltpeter', '硝石', 'Saltpeter', 'material', '硝石（Saltpeter）材料圖示', 5),
  ('material_diamond', 'diamond', '鑽石', 'Diamond', 'material', '鑽石（Diamond）材料圖示', 6),

  ('plant_mushroom', 'mushroom', '蘑菇', 'Mushroom', 'plant', '蘑菇（Mushroom）材料圖示', 7),
  ('plant_fruit', 'fruit', '果實', 'Fruit', 'plant', '果實（Fruit）材料圖示', 8),
  ('plant_leaf', 'leaf', '葉片', 'Leaf', 'plant', '葉片（Leaf）材料圖示', 9),
  ('plant_root', 'root', '根', 'Root', 'plant', '根（Root）材料圖示', 10),
  ('plant_stalk', 'stalk', '莖', 'Stalk', 'plant', '莖（Stalk）材料圖示', 11),
  ('plant_flower', 'flower', '花', 'Flower', 'plant', '花（Flower）材料圖示', 12),

  ('trophy_monster_blood', 'monster-blood', '怪物之血', 'Monster Blood', 'trophy', '怪物之血（Monster Blood）材料圖示', 13),
  ('trophy_monster_bone', 'monster-bone', '怪物骨', 'Monster Bone', 'trophy', '怪物骨（Monster Bone）材料圖示', 14),
  ('trophy_monster_venom', 'monster-venom', '怪物毒液', 'Monster Venom', 'trophy', '怪物毒液（Monster Venom）材料圖示', 15),
  ('trophy_monster_fur', 'monster-fur', '怪物毛皮', 'Monster Fur', 'trophy', '怪物毛皮（Monster Fur）材料圖示', 16),
  ('trophy_monster_fat', 'monster-fat', '怪物脂肪', 'Monster Fat', 'trophy', '怪物脂肪（Monster Fat）材料圖示', 17),
  ('trophy_monster_egg', 'monster-egg', '怪物蛋', 'Monster Egg', 'trophy', '怪物蛋（Monster Egg）材料圖示', 18);

UPDATE crafting_resources
SET image_url = '/images/resources/' || slug || '.png',
    is_published = 1;

-- 已確認每件成品只有一組配方。
CREATE UNIQUE INDEX idx_recipes_unique_output ON recipes(output_item_id);

-- 一個配方可以消耗多種資源；每種資源在同一配方中只出現一次。
CREATE TABLE recipe_resources (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES crafting_resources(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, resource_id)
);

CREATE INDEX idx_recipe_resources_resource
  ON recipe_resources(resource_id);

CREATE INDEX idx_crafting_resources_category
  ON crafting_resources(category_code, sort_order);

CREATE TRIGGER crafting_resources_touch AFTER UPDATE ON crafting_resources
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE crafting_resources
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;




