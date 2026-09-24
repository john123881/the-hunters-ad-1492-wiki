import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const outputUrl = new URL('seeds/equipment_catalog.sql', root);

const pages = [1, 2, 3, 4, 5, 6, 7, 8];
const items = [];

for (const p of pages) {
  const pageUrl = new URL(`data/equipment_page${p}.json`, root);
  if (existsSync(pageUrl)) {
    const pageItems = JSON.parse(readFileSync(pageUrl, 'utf8'));
    items.push(...pageItems);
  }
}

const quote = value => value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const lookup = (table, code) => `(SELECT id FROM ${table} WHERE code = ${quote(code)})`;
const lookupBySlug = (table, slug) => `(SELECT id FROM ${table} WHERE slug = ${quote(slug)})`;

const recipesUrl = new URL('data/recipes.json', root);
const recipes = existsSync(recipesUrl) ? JSON.parse(readFileSync(recipesUrl, 'utf8')) : [];
const required = ['code', 'slug', 'name', 'category_code', 'slot_count', 'consumption_type', 'usage_limit_type', 'original_effect_text', 'image_url'];
const unique = key => new Set(items.map(item => item[key])).size === items.length;

if (!Array.isArray(items) || items.length === 0) throw new Error('物品列表必須是非空陣列。');
if (!unique('code') || !unique('slug')) throw new Error('物品 code 與 slug 不可重複。');

// 依官方規則書第 21 頁之強制結算順序與標準名詞定義
const effectDefinitions = {
  // 10 大戰鬥特性 (Combat Traits)
  light: ['輕武器', 'rule_modifier', '輕量敏捷武器特性，可與特定行動卡連動'],
  area: ['範圍', 'rule_modifier', '攻擊可波及目標格內所有人（包括友軍）'],
  pierce: ['穿甲', 'defense_modifier', '降低目標對應防禦值'],
  burn: ['燃燒', 'status', '目標受到持續燃燒傷害，防禦減半'],
  poison: ['中毒', 'status', '目標在其每回合開始時額外受到 1 點傷害'],
  mighty: ['破防/強擊', 'attack_modifier', '即使未造成傷害，仍永久降低目標所有防禦 1 點'],
  stun: ['眩暈', 'status', '目標下回合無法執行任何行動、反應或藉機攻擊'],
  immobilize: ['定身/束縛', 'status', '目標下回合無法移動'],
  push: ['擊退', 'rule_modifier', '強制將目標推移 1 格拉開距離'],
  reload: ['裝填', 'rule_modifier', '攻擊後需要花費裝填動作重置'],

  // 屬性修正
  strength_modifier: ['力量修正', 'attribute_modifier', '調整力量屬性或相關檢定'],
  agility_modifier: ['敏捷修正', 'attribute_modifier', '調整敏捷屬性或相關檢定'],
  wisdom_modifier: ['智慧修正', 'attribute_modifier', '調整智慧屬性或相關檢定'],
  insight_modifier: ['洞察修正', 'attribute_modifier', '調整洞察屬性或相關檢定'],
  movement_modifier: ['移動步數修正', 'attribute_modifier', '調整角色移動步數'],

  // 防禦與攻擊判定修正
  melee_defense_modifier: ['近戰防禦修正', 'defense_modifier', '提升或降低近戰防禦'],
  ranged_defense_modifier: ['遠程防禦修正', 'defense_modifier', '提升或降低遠程防禦'],
  magic_defense_modifier: ['魔法防禦修正', 'defense_modifier', '提升或降低魔法防禦'],
  hit_modifier: ['命中加成', 'attack_modifier', '攻擊檢定命中值加成'],
  range_modifier: ['射程修正', 'attack_modifier', '調整武器或攻擊的射程範圍'],
  dice_modifier: ['骰數修正', 'attack_modifier', '增加或減少擲骰顆數'],
  reroll_die: ['重擲骰子', 'reroll', '允許重擲指定數量的骰子'],
  enemy_dice_modifier: ['敵人骰數修正', 'attack_modifier', '調整敵人擲骰判定顆數'],

  // 資源與血量
  action_card_limit_modifier: ['手牌上限修正', 'resource', '調整角色行動卡持有上限'],
  heal_health: ['生命調整', 'resource', '回復或扣減指定數量的生命值'],
  offense_token_modifier: ['進攻標記修正', 'resource', '調整角色擁有的進攻標記']
};

for (const [index, item] of items.entries()) {
  for (const field of required) if (item[field] === undefined || item[field] === '') throw new Error(`第 ${index + 1} 筆 (${item.code || index}) 缺少 ${field}。`);
  if (!Number.isInteger(item.slot_count) || item.slot_count < 1 || item.slot_count > 4) throw new Error(`${item.code} 的 slot_count 必須是 1–4 的整數。`);
  const modeOrders = new Set((item.action_modes ?? []).map(mode => mode.display_order));
  for (const effect of item.effects ?? []) {
    if (effect.action_mode_display_order !== null && !modeOrders.has(effect.action_mode_display_order)) {
      throw new Error(`${item.code} 的效果引用不存在的行動模式 ${effect.action_mode_display_order}。`);
    }
    if (!effectDefinitions[effect.effect_definition_code]) {
      throw new Error(`${item.code} 引用了未定義的效果代碼：${effect.effect_definition_code}`);
    }
  }
}

const sql = [
  '-- 由 data/equipment_page1.json ~ page8.json 共同產生；請修改來源 JSON 再執行 npm run data:seed。',
  '-- 這是使用者整理資料；匯入本機 D1 時會取代目前所有物品與相依資料。',
  'PRAGMA foreign_keys = ON;',
  'DELETE FROM recipe_resources;', 'DELETE FROM recipe_ingredients;', 'DELETE FROM recipes;', 'DELETE FROM item_effects;', 'DELETE FROM weapon_traits;',
  'DELETE FROM weapon_sockets;', 'DELETE FROM attachment_specs;', 'DELETE FROM shield_roll_rules;', 'DELETE FROM defense_specs;',
  'DELETE FROM item_action_modes;', 'DELETE FROM weapon_specs;', 'DELETE FROM items;',
];

for (const [code, [name, group, description]] of Object.entries(effectDefinitions)) {
  sql.push(`INSERT INTO effect_definitions (code, name, effect_group, description) VALUES (${quote(code)}, ${quote(name)}, ${quote(group)}, ${quote(description)}) ON CONFLICT(code) DO UPDATE SET name = excluded.name, effect_group = excluded.effect_group, description = excluded.description;`);
}

for (const item of items) {
  const itemId = `(SELECT id FROM items WHERE code = ${quote(item.code)})`;
  // single_use 是舊資料對消耗品的佔位值；× 與循環箭頭由 consumption_type 表達。
  // 只有獨立的使用限制（例如方框 1：每個任務一次）才標記為已核對。
  const usageVerified = item.usage_verified ?? item.usage_limit_type !== 'single_use';
  const data = {
    code: quote(item.code), slug: quote(item.slug), name: quote(item.name), original_name: quote(item.original_name ?? ''),
    category_id: lookup('item_categories', item.category_code), slot_count: item.slot_count,
    consumption_type: quote(item.consumption_type), usage_limit_type: quote(item.usage_limit_type), usage_verified: Number(usageVerified),
    description: quote(item.description ?? ''), original_effect_text: quote(item.original_effect_text), image_url: quote(item.image_url),
    image_alt: quote(`${item.name} 物品圖片`), language_code: quote('zh-TW'), edition_code: quote(item.edition_code),
    source_kind: quote('reference'), source_reference: quote(item.source_reference ?? 'Equipment Compendium'),
    source_note: quote('來源為使用者整理資料；本站僅呈現資料，不將內容宣稱為官方中文規則。'),
    is_published: Number(Boolean(item.is_published)), sort_order: item.sort_order ?? 0,
  };
  sql.push(`INSERT INTO items (${Object.keys(data).join(', ')}) VALUES (${Object.values(data).join(', ')});`);

  if (item.category_code === 'weapon') {
    sql.push(`INSERT INTO weapon_specs (item_id, notes) VALUES (${itemId}, ${quote('依整理資料建立的武器規格。')});`);
  }

  for (const trait of item.traits ?? []) {
    sql.push(`INSERT INTO weapon_traits (weapon_item_id, trait_code, numeric_value, description) VALUES (${itemId}, ${quote(trait.trait_code)}, ${trait.numeric_value === null || trait.numeric_value === undefined ? 'NULL' : trait.numeric_value}, ${quote(trait.description ?? '')});`);
  }

  if (item.category_code === 'weapon_attachment' && item.attachment_connector_type_code) {
    sql.push(`INSERT INTO attachment_specs (item_id, connector_type_id, notes) VALUES (${itemId}, ${lookup('connector_types', item.attachment_connector_type_code)}, ${quote('依整理資料建立的附件規格。')});`);
  }

  for (const socket of item.sockets ?? []) {
    sql.push(`INSERT INTO weapon_sockets (weapon_item_id, slot_index, connector_type_id) VALUES (${itemId}, ${socket.slot_index}, ${lookup('connector_types', socket.connector_type_code)});`);
  }

  for (const mode of item.action_modes ?? []) {
    const modeData = {
      item_id: itemId, action_type: quote(mode.action_type), attack_type: quote(mode.attack_type), resolution_method: quote(mode.resolution_method),
      value_source: quote(mode.value_source), attribute_code: quote(mode.attribute_code), fixed_value: quote(mode.fixed_value),
      dice_count: quote(mode.dice_count), check_modifier: mode.check_modifier ?? 0, range_type: quote(mode.range_type),
      range_min: quote(mode.range_min), range_max: quote(mode.range_max), target_attribute_code: quote(mode.target_attribute_code),
      comparison_operator: quote(mode.comparison_operator), description: quote(mode.description ?? ''), display_order: mode.display_order,
    };
    sql.push(`INSERT INTO item_action_modes (${Object.keys(modeData).join(', ')}) VALUES (${Object.values(modeData).join(', ')});`);
  }

  if (item.defense) {
    sql.push(`INSERT INTO defense_specs (item_id, melee_defense, ranged_defense, magic_defense) VALUES (${itemId}, ${item.defense.melee_defense ?? 0}, ${item.defense.ranged_defense ?? 0}, ${item.defense.magic_defense ?? 0});`);
  }

  for (const rule of item.shield_rules ?? []) {
    sql.push(`INSERT INTO shield_roll_rules (shield_item_id, attribute_code, fixed_value, dice_count) VALUES (${itemId}, ${quote(rule.attribute_code)}, ${rule.fixed_value}, ${rule.dice_count});`);
  }

  for (const effect of item.effects ?? []) {
    const actionModeId = effect.action_mode_display_order === null || effect.action_mode_display_order === undefined
      ? 'NULL'
      : `(SELECT id FROM item_action_modes WHERE item_id = ${itemId} AND display_order = ${effect.action_mode_display_order})`;
    sql.push(`INSERT INTO item_effects (item_id, effect_definition_id, action_mode_id, target_type, numeric_value, operation, trigger_timing, duration_type, is_negative, description, sort_order) VALUES (${itemId}, ${lookup('effect_definitions', effect.effect_definition_code)}, ${actionModeId}, ${quote(effect.target_type)}, ${quote(effect.numeric_value)}, ${quote(effect.operation)}, ${quote(effect.trigger_timing)}, ${quote(effect.duration_type)}, ${Number(Boolean(effect.is_negative))}, ${quote(effect.description ?? '')}, ${effect.sort_order ?? 0});`);
  }
}

let recipeInsertCount = 0;
let resourceInsertCount = 0;

for (const recipe of recipes) {
  const outputItemId = lookupBySlug('items', recipe.item_slug);
  const stationId = recipe.station_code ? lookup('crafting_stations', recipe.station_code) : 'NULL';
  const level = recipe.required_station_level ?? 'NULL';
  const desc = quote(recipe.description ?? '');

  sql.push(`INSERT INTO recipes (output_item_id, output_quantity, crafting_station_id, required_station_level, description) VALUES (${outputItemId}, 1, ${stationId}, ${level}, ${desc});`);
  recipeInsertCount++;

  const recipeId = `(SELECT id FROM recipes WHERE output_item_id = ${outputItemId})`;

  for (const [order, res] of (recipe.resources ?? []).entries()) {
    const resourceId = lookupBySlug('crafting_resources', res.slug);
    sql.push(`INSERT INTO recipe_resources (recipe_id, resource_id, quantity, sort_order) VALUES (${recipeId}, ${resourceId}, ${res.quantity}, ${order + 1});`);
    resourceInsertCount++;
  }
}

writeFileSync(outputUrl, `${sql.join('\n')}\n`);
console.log(`✅ 已驗證並產生 Page 1 ~ Page 8 全書共 ${items.length} 筆物品、${recipeInsertCount} 組配方（共 ${resourceInsertCount} 項材料連結）：${fileURLToPath(outputUrl)}`);
