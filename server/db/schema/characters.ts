import { sqliteTable, integer, text, index, unique, check, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { campaigns, campaignPlayers } from './campaigns';

export const campaignCharacters = sqliteTable('campaign_characters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  playerNumber: integer('player_number').notNull(),
  heroSlug: text('hero_slug').notNull(),
  customName: text('custom_name').notNull().default(''),
  moralePosition: integer('morale_position').notNull().default(0),
  strengthLevel: integer('strength_level').notNull().default(0),
  knowledgeLevel: integer('knowledge_level').notNull().default(0),
  perceptionLevel: integer('perception_level').notNull().default(0),
  agilityLevel: integer('agility_level').notNull().default(0),
  maxHealthLevel: integer('max_health_level').notNull().default(0),
  currentHealth: integer('current_health').notNull().default(1),
  xpTens: integer('xp_tens').notNull().default(0),
  xpOnes: integer('xp_ones').notNull().default(0),
  accumulatedXp: integer('accumulated_xp').notNull().default(0),
  isPoisoned: integer('is_poisoned', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes').notNull().default(''),
  version: integer('version').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  unique('uq_campaign_characters_player').on(table.campaignId, table.playerNumber),
  unique('uq_campaign_characters_hero').on(table.campaignId, table.heroSlug),
  foreignKey({
    columns: [table.campaignId, table.playerNumber],
    foreignColumns: [campaignPlayers.campaignId, campaignPlayers.playerNumber],
  }).onDelete('cascade'),
  check('chk_char_player_number', sql`${table.playerNumber} BETWEEN 1 AND 4`),
  check('chk_char_morale', sql`${table.moralePosition} BETWEEN -2 AND 4`),
  check('chk_char_strength', sql`${table.strengthLevel} BETWEEN 0 AND 4`),
  check('chk_char_knowledge', sql`${table.knowledgeLevel} BETWEEN 0 AND 4`),
  check('chk_char_perception', sql`${table.perceptionLevel} BETWEEN 0 AND 4`),
  check('chk_char_agility', sql`${table.agilityLevel} BETWEEN 0 AND 4`),
  check('chk_char_max_health', sql`${table.maxHealthLevel} BETWEEN 0 AND 5`),
  check('chk_char_current_health', sql`${table.currentHealth} BETWEEN 0 AND 12`),
  check('chk_char_xp_tens', sql`${table.xpTens} BETWEEN 0 AND 90 AND ${table.xpTens} % 10 = 0`),
  check('chk_char_xp_ones', sql`${table.xpOnes} BETWEEN 0 AND 9`),
  check('chk_char_accumulated_xp', sql`${table.accumulatedXp} BETWEEN 0 AND 999`),
  check('chk_char_poisoned', sql`${table.isPoisoned} IN (0, 1)`),
  check('chk_char_version', sql`${table.version} >= 1`),
]);

export const characterActivityLogs = sqliteTable('character_activity_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  actorPlayerNumber: integer('actor_player_number').notNull(),
  targetPlayerNumber: integer('target_player_number').notNull(),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_character_activity_campaign').on(table.campaignId, table.createdAt),
  check('chk_char_log_actor', sql`${table.actorPlayerNumber} BETWEEN 1 AND 4`),
  check('chk_char_log_target', sql`${table.targetPlayerNumber} BETWEEN 1 AND 4`),
]);

export type CampaignCharacterSelect = typeof campaignCharacters.$inferSelect;
export type CampaignCharacterInsert = typeof campaignCharacters.$inferInsert;
