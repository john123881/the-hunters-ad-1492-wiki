import { sqliteTable, text, integer, unique, primaryKey, check, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { campaigns } from './campaigns';

export const campaignMaps = sqliteTable('campaign_maps', {
  campaignId: text('campaign_id').primaryKey().references(() => campaigns.id, { onDelete: 'cascade' }),
  currentLocationType: text('current_location_type'),
  currentLocationCode: text('current_location_code'),
  roadEventNotes: text('road_event_notes').notNull().default(''),
  townEventNotes: text('town_event_notes').notNull().default(''),
  version: integer('version').notNull().default(1),
  updatedByPlayer: integer('updated_by_player'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  check('chk_map_version', sql`${table.version} >= 1`),
  check('chk_map_updated_by_player', sql`${table.updatedByPlayer} IS NULL OR ${table.updatedByPlayer} BETWEEN 1 AND 4`),
  check('chk_map_current_location_type', sql`${table.currentLocationType} IS NULL OR ${table.currentLocationType} IN ('MAP', 'LOCATION')`),
  check('chk_map_location_pair', sql`(${table.currentLocationType} IS NULL AND ${table.currentLocationCode} IS NULL) OR (${table.currentLocationType} IS NOT NULL AND ${table.currentLocationCode} IS NOT NULL)`),
]);

export const campaignMapTiles = sqliteTable('campaign_map_tiles', {
  campaignId: text('campaign_id').notNull().references(() => campaignMaps.campaignId, { onDelete: 'cascade' }),
  mapCode: text('map_code').notNull(),
  rowIndex: integer('row_index').notNull(),
  columnIndex: integer('column_index').notNull(),
  isRevealed: integer('is_revealed', { mode: 'boolean' }).notNull().default(false),
  face: text('face').notNull().default('BACK'),
  resourceNotes: text('resource_notes').notNull().default(''),
  notes: text('notes').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.campaignId, table.mapCode] }),
  unique('uq_campaign_map_tiles_pos').on(table.campaignId, table.rowIndex, table.columnIndex),
  check('chk_tile_row', sql`${table.rowIndex} BETWEEN 1 AND 5`),
  check('chk_tile_col', sql`${table.columnIndex} BETWEEN 1 AND 4`),
  check('chk_tile_revealed', sql`${table.isRevealed} IN (0, 1)`),
  check('chk_tile_face', sql`${table.face} IN ('FRONT', 'BACK')`),
]);

export const campaignLocationCards = sqliteTable('campaign_location_cards', {
  campaignId: text('campaign_id').notNull().references(() => campaignMaps.campaignId, { onDelete: 'cascade' }),
  locationCode: text('location_code').notNull(),
  isRevealed: integer('is_revealed', { mode: 'boolean' }).notNull().default(false),
  face: text('face').notNull().default('BACK'),
  resourceNotes: text('resource_notes').notNull().default(''),
  notes: text('notes').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.campaignId, table.locationCode] }),
  check('chk_location_revealed', sql`${table.isRevealed} IN (0, 1)`),
  check('chk_location_face', sql`${table.face} IN ('FRONT', 'BACK')`),
]);

export const campaignMapCardPlacements = sqliteTable('campaign_map_card_placements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull().references(() => campaignMaps.campaignId, { onDelete: 'cascade' }),
  cardCode: text('card_code').notNull(),
  cardType: text('card_type').notNull(),
  status: text('status').notNull().default('PENDING'),
  locationType: text('location_type').notNull(),
  locationCode: text('location_code').notNull(),
  notes: text('notes').notNull().default(''),
  isInTownDeck: integer('is_in_town_deck', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  unique('uq_campaign_map_card_placements').on(table.campaignId, table.cardCode),
  check('chk_card_placement_type', sql`${table.cardType} IN ('STORY', 'MISSION', 'FEATURE')`),
  check('chk_card_placement_status', sql`${table.status} IN ('PENDING', 'RESOLVED')`),
  check('chk_card_placement_location_type', sql`${table.locationType} IN ('MAP', 'LOCATION')`),
  index('idx_campaign_map_cards_location').on(table.campaignId, table.locationType, table.locationCode),
]);

export const campaignCardCatalog = sqliteTable('campaign_card_catalog', {
  cardCode: text('card_code').primaryKey(),
  cardType: text('card_type').notNull(),
  edition: text('edition').notNull(),
  sortOrder: integer('sort_order').notNull(),
}, (table) => [
  unique('uq_card_catalog_sort').on(table.sortOrder),
  check('chk_catalog_type', sql`${table.cardType} IN ('STORY', 'MISSION')`),
  check('chk_catalog_edition', sql`${table.edition} IN ('CORE', 'EXPANSION')`),
]);

export const campaignCardStatuses = sqliteTable('campaign_card_statuses', {
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  cardCode: text('card_code').notNull().references(() => campaignCardCatalog.cardCode),
  isResolved: integer('is_resolved', { mode: 'boolean' }).notNull().default(false),
  resolvedAt: text('resolved_at'),
  updatedByPlayer: integer('updated_by_player'),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.campaignId, table.cardCode] }),
  check('chk_card_status_resolved', sql`${table.isResolved} IN (0, 1)`),
  check('chk_card_status_updated_by', sql`${table.updatedByPlayer} IS NULL OR ${table.updatedByPlayer} BETWEEN 1 AND 4`),
  check('chk_card_status_pair', sql`(${table.isResolved} = 0 AND ${table.resolvedAt} IS NULL) OR (${table.isResolved} = 1 AND ${table.resolvedAt} IS NOT NULL)`),
  index('idx_campaign_card_statuses_resolved').on(table.campaignId, table.isResolved, table.cardCode),
]);

export const mapActivityLogs = sqliteTable('map_activity_logs', {
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
  check('chk_map_log_player', sql`${table.playerNumber} BETWEEN 1 AND 4`),
  index('idx_map_activity_campaign').on(table.campaignId, table.createdAt),
]);
