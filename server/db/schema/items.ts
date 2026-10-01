import { sqliteTable, text, integer, primaryKey, check, index, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { craftingStations, craftingResources } from './wagon';

export const itemCategories = sqliteTable('item_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  slotZone: text('slot_zone'),
  description: text('description'),
});

export const connectorTypes = sqliteTable('connector_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  shapeDescription: text('shape_description'),
  description: text('description'),
});

export const items = sqliteTable('items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  originalName: text('original_name').notNull().default(''),
  cardNumber: text('card_number'),
  categoryId: integer('category_id').notNull().references(() => itemCategories.id),
  slotCount: integer('slot_count').notNull(),
  consumptionType: text('consumption_type').notNull(),
  usageLimitType: text('usage_limit_type').notNull(),
  description: text('description').notNull().default(''),
  originalEffectText: text('original_effect_text').notNull().default(''),
  imageUrl: text('image_url').notNull().default(''),
  imageAlt: text('image_alt').notNull().default(''),
  languageCode: text('language_code').notNull().default('zh-TW'),
  editionCode: text('edition_code'),
  sourceReference: text('source_reference'),
  sourceKind: text('source_kind').notNull().default('unverified'),
  sourceNote: text('source_note').notNull().default(''),
  usageVerified: integer('usage_verified', { mode: 'boolean' }).notNull().default(false),
  isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  check('chk_item_slot_count', sql`${table.slotCount} BETWEEN 1 AND 4`),
  check('chk_item_consumption_type', sql`${table.consumptionType} IN ('permanent', 'consumed_on_use', 'consumed_after_combat')`),
  check('chk_item_usage_limit_type', sql`${table.usageLimitType} IN ('unlimited', 'single_use', 'once_per_combat')`),
  check('chk_item_is_published', sql`${table.isPublished} IN (0, 1)`),
  index('idx_items_category').on(table.categoryId),
  index('idx_items_slot_count').on(table.slotCount),
  index('idx_items_published').on(table.isPublished),
  index('idx_items_sort_order').on(table.sortOrder),
]);

export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  outputItemId: integer('output_item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  outputQuantity: integer('output_quantity').notNull().default(1),
  craftingStationId: integer('crafting_station_id').references(() => craftingStations.id, { onDelete: 'set null' }),
  requiredStationLevel: integer('required_station_level'),
  description: text('description'),
}, (table) => [
  index('idx_recipes_output').on(table.outputItemId),
  index('idx_recipes_station').on(table.craftingStationId),
]);

export const recipeResources = sqliteTable('recipe_resources', {
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  resourceId: integer('resource_id').notNull().references(() => craftingResources.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.recipeId, table.resourceId] }),
]);

export const recipeStationRequirements = sqliteTable('recipe_station_requirements', {
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  craftingStationId: integer('crafting_station_id').notNull().references(() => craftingStations.id, { onDelete: 'restrict' }),
  requiredLevel: integer('required_level').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.recipeId, table.craftingStationId] }),
]);

export const weaponSockets = sqliteTable('weapon_sockets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weaponItemId: integer('weapon_item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  slotIndex: integer('slot_index').notNull(),
  socketIndex: integer('socket_index').notNull().default(1),
  connectorTypeId: integer('connector_type_id').notNull().references(() => connectorTypes.id, { onDelete: 'restrict' }),
}, (table) => [
  unique('uq_weapon_sockets_slot').on(table.weaponItemId, table.slotIndex, table.socketIndex),
  check('chk_weapon_slot_index', sql`${table.slotIndex} >= 1`),
  check('chk_weapon_socket_index', sql`${table.socketIndex} >= 1`),
  index('idx_weapon_sockets_item').on(table.weaponItemId),
  index('idx_weapon_sockets_connector').on(table.connectorTypeId),
]);

export const attachmentSpecs = sqliteTable('attachment_specs', {
  itemId: integer('item_id').primaryKey().references(() => items.id, { onDelete: 'cascade' }),
  connectorTypeId: integer('connector_type_id').notNull().references(() => connectorTypes.id, { onDelete: 'restrict' }),
  notes: text('notes'),
});

export const itemActionModes = sqliteTable('item_action_modes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  actionType: text('action_type').notNull(),
  attackType: text('attack_type'),
  resolutionMethod: text('resolution_method').notNull(),
  valueSource: text('value_source').notNull(),
  attributeCode: text('attribute_code'),
  fixedValue: integer('fixed_value'),
  diceCount: integer('dice_count'),
  checkModifier: integer('check_modifier').notNull().default(0),
  rangeType: text('range_type').notNull(),
  rangeMin: integer('range_min'),
  rangeMax: integer('range_max'),
  targetAttributeCode: text('target_attribute_code'),
  comparisonOperator: text('comparison_operator'),
  description: text('description').notNull().default(''),
  displayOrder: integer('display_order').notNull().default(1),
}, (table) => [
  check('chk_action_mode_type', sql`${table.actionType} IN ('damage', 'control', 'healing', 'defense', 'other')`),
  check('chk_action_attack_type', sql`${table.attackType} IS NULL OR ${table.attackType} IN ('melee', 'physical_ranged', 'magic', 'trap')`),
  check('chk_action_resolution', sql`${table.resolutionMethod} IN ('normal_attack', 'dice_check', 'automatic')`),
  check('chk_action_value_source', sql`${table.valueSource} IN ('character_attribute', 'fixed', 'action_card', 'none')`),
  check('chk_action_attribute_code', sql`${table.attributeCode} IS NULL OR ${table.attributeCode} IN ('strength', 'agility', 'wisdom', 'insight')`),
  check('chk_action_range_type', sql`${table.rangeType} IN ('fixed', 'action_card', 'none')`),
  check('chk_action_display_order', sql`${table.displayOrder} >= 1`),
  index('idx_action_modes_item').on(table.itemId),
  index('idx_action_modes_type').on(table.actionType, table.attackType),
  index('idx_action_modes_attr').on(table.attributeCode),
]);

export const defenseSpecs = sqliteTable('defense_specs', {
  itemId: integer('item_id').primaryKey().references(() => items.id, { onDelete: 'cascade' }),
  meleeDefense: integer('melee_defense').notNull().default(0),
  rangedDefense: integer('ranged_defense').notNull().default(0),
  magicDefense: integer('magic_defense').notNull().default(0),
});

export const shieldRollRules = sqliteTable('shield_roll_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  shieldItemId: integer('shield_item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  attributeCode: text('attribute_code').notNull(),
  fixedValue: integer('fixed_value').notNull(),
  diceCount: integer('dice_count').notNull(),
});

export const weaponTraits = sqliteTable('weapon_traits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weaponItemId: integer('weapon_item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  traitCode: text('trait_code').notNull(),
  numericValue: integer('numeric_value'),
  description: text('description'),
});

export const effectDefinitions = sqliteTable('effect_definitions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  effectGroup: text('effect_group').notNull(),
  description: text('description'),
});

export const itemEffects = sqliteTable('item_effects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
  effectDefinitionId: integer('effect_definition_id').notNull().references(() => effectDefinitions.id, { onDelete: 'restrict' }),
  actionModeId: integer('action_mode_id').references(() => itemActionModes.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull().default('self'),
  numericValue: integer('numeric_value'),
  operation: text('operation').notNull().default('apply'),
  triggerTiming: text('trigger_timing').notNull().default('passive'),
  durationType: text('duration_type').notNull().default('permanent'),
  isNegative: integer('is_negative', { mode: 'boolean' }).notNull().default(false),
  description: text('description').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  paramsJson: text('params_json'),
}, (table) => [
  index('idx_item_effects_item').on(table.itemId),
  index('idx_item_effects_definition').on(table.effectDefinitionId),
  index('idx_item_effects_action_mode').on(table.actionModeId),
]);
