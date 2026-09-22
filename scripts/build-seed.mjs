import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const sourceUrl = new URL('data/equipment_page1.json', root);
const outputUrl = new URL('seeds/equipment_page1.sql', root);
const items = JSON.parse(readFileSync(sourceUrl, 'utf8'));

const quote = value => value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const lookup = (table, code) => `(SELECT id FROM ${table} WHERE code = ${quote(code)})`;
const required = ['code', 'slug', 'name', 'category_code', 'slot_count', 'consumption_type', 'usage_limit_type', 'original_effect_text', 'image_url'];
const unique = key => new Set(items.map(item => item[key])).size === items.length;

if (!Array.isArray(items) || items.length === 0) throw new Error('equipment_page1.json 必須是非空陣列。');
if (!unique('code') || !unique('slug')) throw new Error('物品 code 與 slug 不可重複。');
for (const [index, item] of items.entries()) {
  for (const field of required) if (item[field] === undefined || item[field] === '') throw new Error(`第 ${index + 1} 筆缺少 ${field}。`);
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
};
const sql = [
  '-- 由 data/equipment_page1.json 產生；請修改來源 JSON 再執行 npm run data:seed。',
  '-- 這是使用者整理資料；匯入本機 D1 時會取代目前所有物品與相依資料。',
  'PRAGMA foreign_keys = ON;',
  'DELETE FROM recipe_ingredients;', 'DELETE FROM recipes;', 'DELETE FROM item_effects;', 'DELETE FROM weapon_traits;',
  'DELETE FROM weapon_sockets;', 'DELETE FROM attachment_specs;', 'DELETE FROM shield_roll_rules;', 'DELETE FROM defense_specs;',
  'DELETE FROM item_action_modes;', 'DELETE FROM weapon_specs;', 'DELETE FROM items;',
];
for (const [code, [name, group, description]] of Object.entries(effectDefinitions)) sql.push(`INSERT INTO effect_definitions (code, name, effect_group, description) VALUES (${quote(code)}, ${quote(name)}, ${quote(group)}, ${quote(description)}) ON CONFLICT(code) DO UPDATE SET name = excluded.name, effect_group = excluded.effect_group, description = excluded.description;`);

for (const item of items) {
  const itemId = `(SELECT id FROM items WHERE code = ${quote(item.code)})`;
  const data = {
    code: quote(item.code), slug: quote(item.slug), name: quote(item.name), original_name: quote(''),
    category_id: lookup('item_categories', item.category_code), slot_count: item.slot_count,
    consumption_type: quote(item.consumption_type), usage_limit_type: quote(item.usage_limit_type), usage_verified: 1,
    description: quote(item.description ?? ''), original_effect_text: quote(item.original_effect_text), image_url: quote(item.image_url),
    image_alt: quote(`${item.name} 物品示意圖`), language_code: quote('zh-TW'), edition_code: quote(item.edition_code),
    source_kind: quote('reference'), source_reference: quote(item.source_reference ?? 'data/equipment_page1.json'),
    source_note: quote('來源為 data/equipment_page1.json，由使用者預先整理；本站僅呈現資料，不將內容宣稱為官方中文規則。'),
    is_published: Number(Boolean(item.is_published)), sort_order: item.sort_order ?? 0,
  };
  sql.push(`INSERT INTO items (${Object.keys(data).join(', ')}) VALUES (${Object.values(data).join(', ')});`);
  if (item.category_code === 'weapon') sql.push(`INSERT INTO weapon_specs (item_id, notes) VALUES (${itemId}, ${quote('依整理資料建立的武器規格。')});`);
  for (const socket of item.sockets ?? []) sql.push(`INSERT INTO weapon_sockets (weapon_item_id, slot_index, connector_type_id) VALUES (${itemId}, ${socket.slot_index}, ${lookup('connector_types', socket.connector_type_code)});`);
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
    const actionModeId = effect.action_mode_display_order === null ? 'NULL' : `(SELECT id FROM item_action_modes WHERE item_id = ${itemId} AND display_order = ${effect.action_mode_display_order})`;
    sql.push(`INSERT INTO item_effects (item_id, effect_definition_id, action_mode_id, target_type, numeric_value, operation, trigger_timing, duration_type, is_negative, description, sort_order) VALUES (${itemId}, ${lookup('effect_definitions', effect.effect_definition_code)}, ${actionModeId}, ${quote(effect.target_type)}, ${quote(effect.numeric_value)}, ${quote(effect.operation)}, ${quote(effect.trigger_timing)}, ${quote(effect.duration_type)}, ${Number(Boolean(effect.is_negative))}, ${quote(effect.description ?? '')}, ${effect.sort_order ?? 0});`);
  }
}
writeFileSync(outputUrl, `${sql.join('\n')}\n`);
console.log(`已驗證並產生 ${items.length} 筆物品：${fileURLToPath(outputUrl)}`);
