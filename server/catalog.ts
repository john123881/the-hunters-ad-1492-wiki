import type { ItemSummary, ItemDetail, ItemsResponse, CatalogResponse, ActionMode, ItemEffect, Connector, Lookup } from '../shared/types';
import type { ItemQuery } from './query';

const visible = (alias: string) => `${alias}.is_published = 1 AND ${alias}.source_kind IN ('demo', 'reference', 'official')`;
const summaryColumns = `i.id, i.code, i.slug, i.card_number AS cardNumber, i.name,
  c.code AS categoryCode, c.name AS categoryName, i.slot_count AS slotCount,
  i.consumption_type AS consumptionType,
  CASE WHEN i.usage_verified = 1 THEN i.usage_limit_type ELSE NULL END AS usageLimitType,
  i.description, i.image_url AS imageUrl, i.image_alt AS imageAlt, i.source_kind AS sourceKind`;
export async function listItems(db: D1Database, query: ItemQuery): Promise<ItemsResponse> {
  const where = [visible('i')];
  const values: (string | number)[] = [];
  const add = (sql: string, ...args: (string | number)[]) => { where.push(sql); values.push(...args); };
  if (query.q) {
    const contains = (column: string) => `instr(lower(COALESCE(${column}, '')), lower(?)) > 0`;
    add(`(${['i.name', 'i.code', 'i.card_number', 'i.original_name', 'i.description', 'i.original_effect_text'].map(contains).join(' OR ')})`,
      query.q, query.q, query.q, query.q, query.q, query.q);
  }
  for (const [key, column] of Object.entries({ category: 'c.code', slotCount: 'i.slot_count', consumption: 'i.consumption_type', usage: 'i.usage_limit_type' })) {
    const value = query[key as keyof ItemQuery];
    if (value !== undefined) add(`${column} = ?`, value);
  }
  // usage_verified only qualifies the independent usage-limit field. Consumption
  // symbols (×, rotating arrow, ∞) are verified separately and remain filterable.
  if (query.usage) add('i.usage_verified = 1');
  const modes: string[] = []; const modeValues: (string | number)[] = [];
  if (query.attackType) { modes.push('m.attack_type = ?'); modeValues.push(query.attackType); }
  if (query.attribute) { modes.push('m.attribute_code = ?'); modeValues.push(query.attribute); }
  // Range means intersection with the requested interval; card-defined ranges are not guessed.
  if (query.rangeMin !== undefined || query.rangeMax !== undefined) modes.push("m.range_type = 'fixed'");
  if (query.rangeMin !== undefined) { modes.push('m.range_max >= ?'); modeValues.push(query.rangeMin); }
  if (query.rangeMax !== undefined) { modes.push('m.range_min <= ?'); modeValues.push(query.rangeMax); }
  if (modes.length) add(`EXISTS (SELECT 1 FROM item_action_modes m WHERE m.item_id = i.id AND ${modes.join(' AND ')})`, ...modeValues);
  if (query.trait) add('EXISTS (SELECT 1 FROM weapon_traits t WHERE t.weapon_item_id = i.id AND t.trait_code = ?)', query.trait);
  if (query.connector) add(`(EXISTS (SELECT 1 FROM weapon_sockets s JOIN connector_types ct ON ct.id = s.connector_type_id WHERE s.weapon_item_id = i.id AND ct.code = ?)
    OR EXISTS (SELECT 1 FROM attachment_specs a JOIN connector_types ct ON ct.id = a.connector_type_id WHERE a.item_id = i.id AND ct.code = ?))`, query.connector, query.connector);
  const defense: string[] = []; const defenseValues: number[] = [];
  for (const [key, column] of Object.entries({ minMeleeDefense: 'melee_defense', minRangedDefense: 'ranged_defense', minMagicDefense: 'magic_defense' })) {
    const value = query[key as keyof ItemQuery];
    if (typeof value === 'number') { defense.push(`d.${column} >= ?`); defenseValues.push(value); }
  }
  if (defense.length) add(`EXISTS (SELECT 1 FROM defense_specs d WHERE d.item_id = i.id AND ${defense.join(' AND ')})`, ...defenseValues);
  const effects: string[] = []; const effectValues: (string | number)[] = [];
  if (query.effect) { effects.push('ed.code = ?'); effectValues.push(query.effect); }
  if (query.negative !== undefined) { effects.push('e.is_negative = ?'); effectValues.push(Number(query.negative)); }
  if (effects.length) add(`EXISTS (SELECT 1 FROM item_effects e JOIN effect_definitions ed ON ed.id = e.effect_definition_id WHERE e.item_id = i.id AND ${effects.join(' AND ')})`, ...effectValues);
  const from = `FROM items i JOIN item_categories c ON c.id = i.category_id WHERE ${where.join(' AND ')}`;
  const order = query.sort === 'name' ? 'i.name COLLATE NOCASE, i.id' : 'COALESCE(i.card_number, i.code) COLLATE NOCASE, i.id';
  const [count, rows] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total ${from}`).bind(...values),
    db.prepare(`SELECT ${summaryColumns} ${from} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...values, query.pageSize, (query.page - 1) * query.pageSize),
  ]);
  const total = Number((count.results[0] as { total: number }).total);
  return { data: (rows.results as unknown as ItemSummary[]), pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) } };
}

export async function getCatalog(db: D1Database): Promise<CatalogResponse> {
  const [counts, categories, connectors, effects, traits] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(i.source_kind = 'demo'), 0) AS demoCount FROM items i WHERE ${visible('i')}`),
    db.prepare(`SELECT c.code, c.name, COUNT(i.id) AS count FROM item_categories c JOIN items i ON i.category_id = c.id AND ${visible('i')} GROUP BY c.id ORDER BY c.id`),
    db.prepare('SELECT code, name FROM connector_types ORDER BY id'),
    db.prepare('SELECT code, name FROM effect_definitions ORDER BY id'),
    db.prepare(`SELECT DISTINCT t.trait_code AS code, CASE WHEN t.trait_code = 'reload' THEN '裝填' ELSE t.trait_code END AS name FROM weapon_traits t JOIN items i ON i.id = t.weapon_item_id WHERE ${visible('i')} ORDER BY code`),
  ]);
  return { data: { ...(counts.results[0] as { total: number; demoCount: number }),
    categories: categories.results as unknown as CatalogResponse['data']['categories'],
    connectors: connectors.results as unknown as Lookup[], effects: effects.results as unknown as Lookup[],
    traits: traits.results as unknown as Lookup[],
  } };
}

export async function getItem(db: D1Database, slug: string): Promise<ItemDetail | null> {
  const row = await db.prepare(`SELECT ${summaryColumns}, i.original_name AS originalName, i.original_effect_text AS originalEffectText,
    i.source_reference AS sourceReference, i.source_note AS sourceNote,
    i.language_code AS languageCode, i.edition_code AS editionCode, c.slot_zone AS slotZone
    FROM items i JOIN item_categories c ON c.id = i.category_id WHERE i.slug = ? AND ${visible('i')}`)
    .bind(slug).first<ItemDetail>();
  if (!row) return null;
  const id = row.id;
  const [modes, defense, shield, traits, sockets, attachment, effects] = await db.batch([
    db.prepare(`SELECT id, action_type AS actionType, attack_type AS attackType, resolution_method AS resolutionMethod,
      value_source AS valueSource, attribute_code AS attributeCode, fixed_value AS fixedValue, dice_count AS diceCount,
      check_modifier AS checkModifier, range_type AS rangeType, range_min AS rangeMin, range_max AS rangeMax,
      target_attribute_code AS targetAttributeCode, comparison_operator AS comparisonOperator, description, display_order AS displayOrder
      FROM item_action_modes WHERE item_id = ? ORDER BY display_order, id`).bind(id),
    db.prepare('SELECT melee_defense AS meleeDefense, ranged_defense AS rangedDefense, magic_defense AS magicDefense FROM defense_specs WHERE item_id = ?').bind(id),
    db.prepare('SELECT attribute_code AS attributeCode, fixed_value AS fixedValue, dice_count AS diceCount FROM shield_roll_rules WHERE shield_item_id = ? ORDER BY id').bind(id),
    db.prepare('SELECT trait_code AS code, numeric_value AS numericValue, description FROM weapon_traits WHERE weapon_item_id = ? ORDER BY id').bind(id),
    db.prepare(`SELECT s.slot_index AS slotIndex, s.socket_index AS socketIndex, ct.code, ct.name, ct.shape_description AS shapeDescription
      FROM weapon_sockets s JOIN connector_types ct ON ct.id = s.connector_type_id WHERE s.weapon_item_id = ? ORDER BY s.slot_index, s.socket_index`).bind(id),
    db.prepare(`SELECT ct.code, ct.name, ct.shape_description AS shapeDescription FROM attachment_specs a
      JOIN connector_types ct ON ct.id = a.connector_type_id WHERE a.item_id = ?`).bind(id),
    db.prepare(`SELECT e.id, ed.code, ed.name, e.action_mode_id AS actionModeId, e.target_type AS targetType,
      e.numeric_value AS numericValue, e.operation, e.trigger_timing AS triggerTiming, e.duration_type AS durationType,
      e.is_negative AS isNegative, e.description FROM item_effects e JOIN effect_definitions ed ON ed.id = e.effect_definition_id
      WHERE e.item_id = ? ORDER BY e.sort_order, e.id`).bind(id),
  ]);
  return { ...row,
    actionModes: modes.results as unknown as ActionMode[],
    defense: (defense.results[0] ?? null) as ItemDetail['defense'],
    shieldRules: shield.results as unknown as ItemDetail['shieldRules'],
    traits: traits.results as unknown as ItemDetail['traits'], sockets: sockets.results as unknown as ItemDetail['sockets'],
    attachment: (attachment.results[0] ?? null) as Connector | null,
    effects: (effects.results as unknown as ItemEffect[]).map(effect => ({ ...effect, isNegative: Boolean(effect.isNegative) })),

  };
}
