import { check, index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { campaigns } from './campaigns';

export const campaignAudioPlaybackLogs = sqliteTable('campaign_audio_playback_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  campaignId: text('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  clientEventId: text('client_event_id').notNull(),
  code: text('code').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  playerNumber: integer('player_number').notNull(),
  playerAlias: text('player_alias').notNull(),
  playedAt: text('played_at').notNull().default(sql`(datetime('now'))`),
}, table => [
  unique('uq_campaign_audio_playback_event').on(table.campaignId, table.clientEventId),
  index('idx_campaign_audio_playback_recent').on(table.campaignId, table.id),
  check('chk_campaign_audio_category', sql`${table.category} IN ('story','character','quest','quest_win','quest_loss','w_quest','w_quest_win','w_quest_loss')`),
  check('chk_campaign_audio_player', sql`${table.playerNumber} BETWEEN 1 AND 4`),
]);
