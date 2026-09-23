-- 0006_seed_catalog_lookups.sql
-- 匯入固定字典與列舉資料（使用 INSERT OR IGNORE 確保可重複執行）

-- 1. 物品分類 (item_categories)
INSERT OR IGNORE INTO item_categories (code, name, slot_zone, description) VALUES
  ('weapon', '武器', '武器／盾牌區', '各類近戰、遠程與魔法武器'),
  ('shield', '盾牌', '武器／盾牌區', '防禦盾牌'),
  ('weapon_attachment', '武器附件', '武器附件區', '安裝於武器插槽的配件或符文'),
  ('helmet', '頭盔', '頭盔區', '頭部防具'),
  ('armor', '上衣／護甲', '衣服區', '胸部護甲或防具'),
  ('accessory', '飾品', '飾品區', '戒指、護身符與項鍊等'),
  ('utility', '一般道具', '道具區', '繩索、網子、火把等輔助道具'),
  ('consumable', '消耗道具', '道具區', '藥水、藥草、油脂等消耗品'),
  ('trap', '陷阱', '道具區', '設置型捕獸夾或機關'),
  ('grenade', '投擲物／炸彈', '道具區', '投擲爆炸物或燃燒彈'),
  ('material', '合成材料', NULL, '用於鍛造與合成的素材');

-- 2. 接口類型 (connector_types)
INSERT OR IGNORE INTO connector_types (code, name, shape_description, description) VALUES
  ('melee', '近戰接口', '小半圓', '接受近戰刀刃附件或研磨油脂等'),
  ('rune', '符文接口', '半橢圓', '接受各類魔法與元素符文'),
  ('bow', '弓類接口', '單三角鋸齒', '接受弓弦或箭矢強化附件'),
  ('firearm', '槍械接口', '雙三角鋸齒', '接受槍械專用配件或火藥強化');

-- 3. 效果字典 (effect_definitions)
INSERT OR IGNORE INTO effect_definitions (code, name, effect_group, description) VALUES
  ('burning', '燃燒', 'status', '目標受到持續燃燒傷害'),
  ('controlled', '控制／束縛', 'status', '目標行動受到限制'),
  ('strength_modifier', '力量修正', 'attribute_modifier', '調整力量屬性或相關檢定'),
  ('agility_modifier', '敏捷修正', 'attribute_modifier', '調整敏捷屬性或相關檢定'),
  ('wisdom_modifier', '智慧修正', 'attribute_modifier', '調整智慧屬性或相關檢定'),
  ('insight_modifier', '洞察修正', 'attribute_modifier', '調整洞察屬性或相關檢定'),
  ('melee_defense_modifier', '近戰防禦修正', 'defense_modifier', '提升或降低近戰防禦'),
  ('ranged_defense_modifier', '遠程防禦修正', 'defense_modifier', '提升或降低遠程防禦'),
  ('magic_defense_modifier', '魔法防禦修正', 'defense_modifier', '提升或降低魔法防禦'),
  ('hit_modifier', '命中加成', 'attack_modifier', '攻擊檢定命中值加成'),
  ('dice_modifier', '骰數修正', 'attack_modifier', '增加或減少擲骰顆數'),
  ('action_card_limit_modifier', '手牌上限修正', 'resource', '調整角色行動卡持有上限'),
  ('heal_health', '恢復生命', 'resource', '回復指定數量的生命值'),
  ('reroll_die', '重擲骰子', 'reroll', '允許重擲指定數量的骰子');

-- 4. 合成台字典 (crafting_stations)
INSERT OR IGNORE INTO crafting_stations (code, name, description) VALUES
  ('blacksmith', '鐵匠鋪', '用於鍛造武器、護甲與金屬附件'),
  ('alchemy_table', '煉金台', '用於調配藥水、藥劑與毒素'),
  ('workbench', '工作台', '用於製作一般道具、陷阱與皮革裝備');
