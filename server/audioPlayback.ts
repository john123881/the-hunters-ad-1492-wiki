import type { Context } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { classifyAudioCode } from '../shared/audio';
import type { AudioPlaybackLog } from '../shared/audio';
import { requireCampaignSession } from './auth';
import { getDb } from './db';
import { campaignAudioPlaybackLogs } from './db/schema';
import { parseJsonBody } from './http/json';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;

function responseRow(row: typeof campaignAudioPlaybackLogs.$inferSelect): AudioPlaybackLog {
  return {
    id: row.id,
    code: row.code,
    category: row.category as AudioPlaybackLog['category'],
    title: row.title,
    playerNumber: row.playerNumber,
    playerAlias: row.playerAlias,
    playedAt: row.playedAt,
  };
}

export async function getAudioPlaybackHistory(c: Ctx) {
  const session = await requireCampaignSession(c);
  const rows = await getDb(c.env.DB)
    .select()
    .from(campaignAudioPlaybackLogs)
    .where(eq(campaignAudioPlaybackLogs.campaignId, session.campaignId))
    .orderBy(desc(campaignAudioPlaybackLogs.id))
    .limit(50);

  return c.json({ data: rows.map(responseRow) });
}

export async function createAudioPlaybackLog(c: Ctx) {
  const session = await requireCampaignSession(c);
  const parsed = await parseJsonBody<Record<string, unknown>>(c, {
    code: 'INVALID_AUDIO_PLAYBACK_LOG',
    message: '請提供有效的語音播放紀錄。',
  });
  if (!parsed.success) return parsed.response;

  const clientEventId = typeof parsed.data.clientEventId === 'string' ? parsed.data.clientEventId.trim() : '';
  const inputCode = typeof parsed.data.code === 'string' ? parsed.data.code : '';
  const title = typeof parsed.data.title === 'string' ? parsed.data.title.trim() : '';
  const parsedCode = classifyAudioCode(inputCode);

  if (!/^[A-Za-z0-9-]{8,64}$/.test(clientEventId)) {
    return c.json({ error: { code: 'INVALID_AUDIO_EVENT_ID', message: '語音播放事件識別碼格式不正確。' } }, 400);
  }
  if (!parsedCode) {
    return c.json({ error: { code: 'INVALID_AUDIO_CODE', message: '語音代碼格式不正確。' } }, 400);
  }
  if (!title || title.length > 160) {
    return c.json({ error: { code: 'INVALID_AUDIO_TITLE', message: '語音標題格式不正確。' } }, 400);
  }

  const db = getDb(c.env.DB);
  await db.insert(campaignAudioPlaybackLogs).values({
    campaignId: session.campaignId,
    clientEventId,
    code: parsedCode.code,
    category: parsedCode.category,
    title,
    playerNumber: session.playerNumber,
    playerAlias: session.playerAlias,
  }).onConflictDoNothing({
    target: [campaignAudioPlaybackLogs.campaignId, campaignAudioPlaybackLogs.clientEventId],
  });

  const [row] = await db
    .select()
    .from(campaignAudioPlaybackLogs)
    .where(and(
      eq(campaignAudioPlaybackLogs.campaignId, session.campaignId),
      eq(campaignAudioPlaybackLogs.clientEventId, clientEventId),
    ))
    .limit(1);

  if (!row) throw new Error('Audio playback log insert failed');
  return c.json({ data: responseRow(row) }, 201);
}
