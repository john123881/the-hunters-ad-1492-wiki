import { sqliteTable, text, integer, primaryKey, check, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const adminUsers = sqliteTable('admin_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  lastLoginAt: text('last_login_at'),
}, (table) => [
  check('chk_admin_user_active', sql`${table.isActive} IN (0, 1)`),
]);

export const adminSessions = sqliteTable('admin_sessions', {
  tokenHash: text('token_hash').primaryKey(),
  adminUserId: integer('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  lastSeenAt: text('last_seen_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_admin_sessions_user').on(table.adminUserId),
  index('idx_admin_sessions_expiry').on(table.expiresAt),
]);

export const adminLoginAttempts = sqliteTable('admin_login_attempts', {
  username: text('username').notNull(),
  clientKey: text('client_key').notNull(),
  failureCount: integer('failure_count').notNull().default(0),
  windowStartedAt: integer('window_started_at').notNull(),
  lockedUntil: integer('locked_until'),
}, (table) => [
  primaryKey({ columns: [table.username, table.clientKey] }),
]);

export const adminActivityLogs = sqliteTable('admin_activity_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  adminUserId: integer('admin_user_id').notNull().references(() => adminUsers.id),
  actionType: text('action_type').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  beforeJson: text('before_json'),
  afterJson: text('after_json'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  index('idx_admin_activity_created').on(table.createdAt),
]);
