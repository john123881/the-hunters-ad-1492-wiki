import { sqliteTable, text, integer, unique, primaryKey, check, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { campaigns } from './campaigns';
import { items } from './items';
import { campaignCharacters } from './characters';

export const craftingStations = sqliteTable('crafting_stations', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  originalName: text('original_name').notNull().default(''),
  description: text('description'),
  maxLevel: integer('max_level').notNull().default(3),
  sortOrder: integer('sort_order').notNull().default(0),
  imageUrl: text('image_url').notNull().default(''),
});

export const craftingResources = sqliteTable('crafting_resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  originalName: text('original_name').notNull(),
  categoryCode: text('category_code').notNull(),
  imageUrl: text('image_url').notNull().default(''),
  imageAlt: text('image_alt').notNull().default(''),
  languageCode: text('language_code').notNull().default('zh-TW'),
  sourceReference: text('source_reference').notNull().default('Rules Compendium: Resources'),
  sortOrder: integer('sort_order').notNull().default(0),
  isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const campaignWagons = sqliteTable('campaign_wagons', {
  campaignId: text('campaign_id').primaryKey().references(() => campaigns.id, { onDelete: 'cascade' }),
  elapsedDays: integer('elapsed_days').notNull().default(1),
  locationCode: text('location_code').notNull().default(''),
  sharedGold: integer('shared_gold').notNull().default(0),
  version: integer('version').notNull().default(1),
  updatedByPlayer: integer('updated_by_player'),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  check('chk_wagon_elapsed_days', sql`${table.elapsedDays} >= 1`),
  check('chk_wagon_shared_gold', sql`${table.sharedGold} >= 0`),
  check('chk_wagon_version', sql`${table.version} >= 1`),
  check('chk_wagon_updated_by_player', sql`${table.updatedByPlayer} IS NULL OR ${table.updatedByPlayer} BETWEEN 1 AND 4`),
]);

export const campaignWagonUpgrades = sqliteTable('campaign_wagon_upgrades', {
  campaignId: text('campaign_id').notNull().references(() => campaignWagons.campaignId, { onDelete: 'cascade' }),
  stationId: integer('station_id').notNull().references(() => craftingStations.id),
  level: integer('level').notNull().default(0),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.campaignId, table.stationId] }),
  check('chk_upgrade_level', sql`${table.level} BETWEEN 0 AND 3`),
]);

export const campaignWagonResources = sqliteTable('campaign_wagon_resources', {
  campaignId: text('campaign_id').notNull().references(() => campaignWagons.campaignId, { onDelete: 'cascade' }),
  resourceId: integer('resource_id').notNull().references(() => craftingResources.id),
  quantity: integer('quantity').notNull().default(0),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.campaignId, table.resourceId] }),
  check('chk_resource_quantity', sql`${table.quantity} >= 0`),
]);

export const campaignCardsProgress = sqliteTable('campaign_cards_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  cardCode: text('card_code').notNull(),
  cardType: text('card_type').notNull().default('STORY'),
  status: text('status').notNull().default('LOCKED'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  unique('uq_campaign_cards_progress').on(table.campaignId, table.cardCode),
  check('chk_card_progress_type', sql`${table.cardType} IN ('STORY', 'EVENT')`),
  check('chk_card_progress_status', sql`${table.status} IN ('LOCKED', 'AVAILABLE', 'RESOLVED')`),
]);

export const campaignCardTimeTokens = sqliteTable('campaign_card_time_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  storyCardProgressId: integer('story_card_progress_id').notNull().references(() => campaignCardsProgress.id, { onDelete: 'cascade' }),
  tokenCode: text('token_code').notNull(),
  placedAtDay: integer('placed_at_day').notNull(),
  unlockAtDay: integer('unlock_at_day').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  removedAt: text('removed_at'),
  removedByPlayer: integer('removed_by_player'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  check('chk_token_code', sql`${table.tokenCode} IN ('A', 'B', 'C', 'D')`),
  check('chk_token_placed_at', sql`${table.placedAtDay} >= 1`),
  check('chk_token_unlock_at', sql`${table.unlockAtDay} >= ${table.placedAtDay}`),
  check('chk_token_status', sql`${table.status} IN ('ACTIVE', 'REMOVED')`),
  check('chk_token_removed_by', sql`${table.removedByPlayer} IS NULL OR ${table.removedByPlayer} BETWEEN 1 AND 4`),
  uniqueIndex('idx_active_time_token_code').on(table.campaignId, table.tokenCode).where(sql`status = 'ACTIVE'`),
  uniqueIndex('idx_active_story_card_token').on(table.campaignId, table.storyCardProgressId).where(sql`status = 'ACTIVE'`),
  index('idx_time_tokens_due').on(table.campaignId, table.status, table.unlockAtDay),
]);

export const campaignEquipmentInstances = sqliteTable('campaign_equipment_instances', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull().references(() => campaignWagons.campaignId, { onDelete: 'cascade' }),
  itemId: integer('item_id').notNull().references(() => items.id),
  locationType: text('location_type').notNull().default('WAGON'),
  characterId: integer('character_id').references(() => campaignCharacters.id, { onDelete: 'cascade' }),
  damageMarkers: integer('damage_markers').notNull().default(0),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  check('chk_equip_location_type', sql`${table.locationType} IN ('WAGON', 'CHARACTER')`),
  check('chk_equip_damage', sql`${table.damageMarkers} >= 0`),
  check('chk_equip_char_link', sql`(${table.locationType} = 'WAGON' AND ${table.characterId} IS NULL) OR (${table.locationType} = 'CHARACTER' AND ${table.characterId} IS NOT NULL)`),
  index('idx_campaign_equipment_location').on(table.campaignId, table.locationType, table.characterId),
]);

export const campaignEquipmentAttachments = sqliteTable('campaign_equipment_attachments', {
  equipmentInstanceId: integer('equipment_instance_id').notNull().references(() => campaignEquipmentInstances.id, { onDelete: 'cascade' }),
  attachmentInstanceId: integer('attachment_instance_id').notNull().unique().references(() => campaignEquipmentInstances.id, { onDelete: 'restrict' }),
  weaponSlotIndex: integer('weapon_slot_index').notNull().default(1),
  socketIndex: integer('socket_index').notNull(),
  attachedAt: text('attached_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.equipmentInstanceId, table.weaponSlotIndex, table.socketIndex] }),
  check('chk_equipment_attachment_weapon_slot_index', sql`${table.weaponSlotIndex} >= 1`),
  check('chk_equipment_attachment_socket_index', sql`${table.socketIndex} >= 1`),
  check('chk_equipment_attachment_distinct_instances', sql`${table.equipmentInstanceId} <> ${table.attachmentInstanceId}`),
]);

export const wagonActivityLogs = sqliteTable('wagon_activity_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  playerNumber: integer('player_number').notNull(),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  check('chk_wagon_log_player', sql`${table.playerNumber} BETWEEN 1 AND 4`),
  index('idx_wagon_activity_campaign').on(table.campaignId, table.createdAt),
]);
