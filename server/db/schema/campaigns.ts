import { sqliteTable, text, integer, primaryKey, check, index, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(),
  campaignName: text('campaign_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  maxPlayers: integer('max_players').notNull().default(4),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  deletedAt: text('deleted_at'),
}, (table) => [
  check('chk_campaign_max_players', sql`${table.maxPlayers} BETWEEN 1 AND 4`),
  check('chk_campaign_is_active', sql`${table.isActive} IN (0, 1)`),
]);

export const campaignPlayers = sqliteTable('campaign_players', {
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  playerNumber: integer('player_number').notNull(),
  playerAlias: text('player_alias').notNull(),
  isReady: integer('is_ready', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.campaignId, table.playerNumber] }),
  check('chk_player_number', sql`${table.playerNumber} BETWEEN 1 AND 4`),
  check('chk_player_ready', sql`${table.isReady} IN (0, 1)`),
]);

export const authSessions = sqliteTable('auth_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  campaignId: text('campaign_id').notNull(),
  playerNumber: integer('player_number').notNull(),
  expiresAt: integer('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  lastSeenAt: text('last_seen_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  foreignKey({
    columns: [table.campaignId, table.playerNumber],
    foreignColumns: [campaignPlayers.campaignId, campaignPlayers.playerNumber],
  }).onDelete('cascade'),
  index('idx_auth_sessions_player').on(table.campaignId, table.playerNumber),
  index('idx_auth_sessions_expiry').on(table.expiresAt),
]);

export const authLoginAttempts = sqliteTable('auth_login_attempts', {
  campaignId: text('campaign_id').notNull(),
  clientKey: text('client_key').notNull(),
  failureCount: integer('failure_count').notNull().default(0),
  windowStartedAt: integer('window_started_at').notNull(),
  lockedUntil: integer('locked_until'),
}, (table) => [
  primaryKey({ columns: [table.campaignId, table.clientKey] }),
]);
