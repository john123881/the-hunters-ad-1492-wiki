import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { campaigns } from './campaigns';
import { campaignCharacters } from './characters';
import { campaignEquipmentInstances } from './wagon';

export const campaignCharacterOpenedSlots = sqliteTable('campaign_character_opened_slots', {
  characterId: integer('character_id').notNull().references(() => campaignCharacters.id, { onDelete: 'cascade' }),
  slotKey: text('slot_key').notNull(),
  openedByPlayer: integer('opened_by_player').notNull(),
  openedAt: text('opened_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.characterId, table.slotKey] }),
  check('chk_character_opened_slot_key', sql`length(trim(${table.slotKey})) > 0`),
  check('chk_character_opened_by', sql`${table.openedByPlayer} BETWEEN 1 AND 4`),
]);

export const campaignCharacterEquipmentSlots = sqliteTable('campaign_character_equipment_slots', {
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  characterId: integer('character_id').notNull().references(() => campaignCharacters.id, { onDelete: 'cascade' }),
  equipmentInstanceId: integer('equipment_instance_id').notNull().references(() => campaignEquipmentInstances.id, { onDelete: 'cascade' }),
  slotKey: text('slot_key').notNull(),
  slotIndex: integer('slot_index').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  primaryKey({ columns: [table.equipmentInstanceId, table.slotKey] }),
  unique('uq_character_equipment_slot').on(table.campaignId, table.characterId, table.slotKey),
  index('idx_character_equipment_slots_character').on(table.campaignId, table.characterId),
  check('chk_character_equipment_slot_key', sql`length(trim(${table.slotKey})) > 0`),
  check('chk_character_equipment_slot_index', sql`${table.slotIndex} >= 1`),
]);

export const campaignCharacterRetainedAttachments = sqliteTable('campaign_character_retained_attachments', {
  attachmentInstanceId: integer('attachment_instance_id').primaryKey().references(() => campaignEquipmentInstances.id, { onDelete: 'cascade' }),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  characterId: integer('character_id').notNull().references(() => campaignCharacters.id, { onDelete: 'cascade' }),
  anchorSlotKey: text('anchor_slot_key').notNull(),
  socketIndex: integer('socket_index').notNull(),
  retainedAt: text('retained_at').notNull().default(sql`(datetime('now'))`),
}, (table) => [
  unique('uq_character_retained_attachment_anchor').on(table.characterId, table.anchorSlotKey, table.socketIndex),
  index('idx_character_retained_attachments_character').on(table.campaignId, table.characterId),
  check('chk_character_retained_anchor_key', sql`length(trim(${table.anchorSlotKey})) > 0`),
  check('chk_character_retained_socket_index', sql`${table.socketIndex} >= 1`),
]);

export type CampaignCharacterOpenedSlotSelect = typeof campaignCharacterOpenedSlots.$inferSelect;
export type CampaignCharacterEquipmentSlotSelect = typeof campaignCharacterEquipmentSlots.$inferSelect;
export type CampaignCharacterRetainedAttachmentSelect = typeof campaignCharacterRetainedAttachments.$inferSelect;
