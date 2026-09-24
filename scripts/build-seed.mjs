import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const page1Url = new URL('data/equipment_page1.json', root);
const page2Url = new URL('data/equipment_page2.json', root);
const outputUrl = new URL('seeds/equipment_catalog.sql', root);

const page1Items = JSON.parse(readFileSync(page1Url, 'utf8'));
const page2Items = JSON.parse(readFileSync(page2Url, 'utf8'));
const items = [...page1Items, ...page2Items];

const quote = value => value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const lookup = (table, code) => `(SELECT id FROM ${table} WHERE code = ${quote(code)})`;
const required = ['code', 'slug', 'name', 'category_code', 'slot_count', 'consumption_type', 'usage_limit_type', 'original_effect_text', 'image_url'];
const unique = key => new Set(items.map(item => item[key])).size === items.length;

if (!Array.isArray(items) || items.length === 0) throw new Error('物品列表必須是非空陣列。');
if (!unique('code') || !unique('slug')) throw new Error('物品 code 與 slug 不可重複。');

for (const [index, item] of items.entries()) {
  for (const field of required) if (item[field] === undefined || item[field] === '') throw new Error(`第 ${index + 1} 筆 (${item.code || index}) 缺少 ${field}。`);
  if (!Number.isInteger(item.slot_count) || item.slot_count < 1 || item.slot_count > 4) throw new Error(`${item.code} 的 slot_count 必須是 1–4 的整數。`);
  const modeOrders = new Set((item.action_modes ?? []).map(mode => mode.display_order));
  for (const effect of item.effects ?? []) if (effect.action_mode_display_order !== null && !modeOrders.has(effect.action_mode_display_order)) throw new Error(`${item.code} 的效果引用不存在的行動模式 ${effect.action_mode_display_order}。`);
  if (item.image_url.startsWith('/') && !existsSync(new URL(`public${item.image_url}`, root))) throw new Error(`${item.code} 找不到圖片：${item.image_url}`);
}

const effectDefinitions = {
  area_attack: ['範圍攻擊', 'rule_modifier', '攻擊可影響一個區域內的目標'],
  armor_break: ['破防', 'attack_modifier', '攻擊具備破壞防禦的特性'],
  armor_piercing: ['穿甲', 'defense_modifier', '攻擊降低目標的防禦值'],
  light_weapon: ['輕武器', 'rule_modifier', '此物品具有輕武器特性'],
  burning: ['燃燒', 'status', '目標受到持續燃燒傷害'],
  controlled: ['控制／束縛', 'status', '目標行動受到限制'],
  poisoned: ['中毒', 'status', '目標受到中毒狀態影響'],
  strength_modifier: ['力量修正', 'attribute_modifier', '調整力量屬性或相關檢定'],
  agility_modifier: ['敏捷修正', 'attribute_modifier', '調整敏捷屬性或相關檢定'],
  wisdom_modifier: ['智慧修正', 'attribute_modifier', '調整智慧屬性或相關檢定'],
  insight_modifier: ['洞察修正', 'attribute_modifier', '調整洞察屬性或相關檢定'],
  melee_defense_modifier: ['近戰防禦修正', 'defense_modifier', '提升或降低近戰防禦'],
  ranged_defense_modifier: ['遠程防禦修正', 'defense_modifier', '提升或降低遠程防禦'],
  magic_defense_modifier: ['魔法防禦修正', 'defense_modifier', '提升或降低魔法防禦'],
  hit_modifier: ['命中加成', 'attack_modifier', '攻擊檢定命中值加成'],
  dice_modifier: ['骰數修正', 'attack_modifier', '增加或減少擲骰顆數'],
  reroll_die: ['重擲骰子', 'reroll', '允許重擲指定數量的骰子'],
  offense_token_modifier: ['進攻標記修正', 'resource', '調整角色擁有的進攻標記（Offense token）'],
  enemy_dice_modifier: ['敵人骰數修正', 'attack_modifier', '調整敵人擲骰判定顆數']
};

const sql = [
  '-- 由 data/equipment_page1.json 與 data/equipment_page2.json 共同產生；請修改來源 JSON 再執行 npm run data:seed。',
  '-- 這是使用者整理資料；匯入本機 D1 時會取代目前所有物品與相依資料。',
  'PRAGMA foreign_keys = ON;',
  'DELETE FROM recipe_ingredients;', 'DELETE FROM recipes;', 'DELETE FROM item_effects;', 'DELETE FROM weapon_traits;',
  'DELETE FROM weapon_sockets;', 'DELETE FROM attachment_specs;', 'DELETE FROM shield_roll_rules;', 'DELETE FROM defense_specs;',
  'DELETE FROM item_action_modes;', 'DELETE FROM weapon_specs;', 'DELETE FROM items;',
];

for (const [code, [name, group, description]] of Object.entries(effectDefinitions)) {
  sql.push(`INSERT INTO effect_definitions (code, name, effect_group, description) VALUES (${quote(code)}, ${quote(name)}, ${quote(group)}, ${quote(description)}) ON CONFLICT(code) DO UPDATE SET name = excluded.name, effect_group = excluded.effect_group, description = excluded.description;`);
}

for (const item of items) {
  const itemId = `(SELECT id FROM items WHERE code = ${quote(item.code)})`;
  const data = {
    code: quote(item.code), slug: quote(item.slug), name: quote(item.name), original_name: quote(''),
    category_id: lookup('item_categories', item.category_code), slot_count: item.slot_count,
    consumption_type: quote(item.consumption_type), usage_limit_type: quote(item.usage_limit_type), usage_verified: 1,
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

  for (const effect of item.effects ?? []) {
    const actionModeId = effect.action_mode_display_order === null || effect.action_mode_display_order === undefined
      ? 'NULL'
      : `(SELECT id FROM item_action_modes WHERE item_id = ${itemId} AND display_order = ${effect.action_mode_display_order})`;
    sql.push(`INSERT INTO item_effects (item_id, effect_definition_id, action_mode_id, target_type, numeric_value, operation, trigger_timing, duration_type, is_negative, description, sort_order) VALUES (${itemId}, ${lookup('effect_definitions', effect.effect_definition_code)}, ${actionModeId}, ${quote(effect.target_type)}, ${quote(effect.numeric_value)}, ${quote(effect.operation)}, ${quote(effect.trigger_timing)}, ${quote(effect.duration_type)}, ${Number(Boolean(effect.is_negative))}, ${quote(effect.description ?? '')}, ${effect.sort_order ?? 0});`);
  }
}

writeFileSync(outputUrl, `${sql.join('\n')}\n`);
console.log(`✅ 已驗證並產生 Page 1 + Page 2 共 ${items.length} 筆物品：${fileURLToPath(outputUrl)}`);
