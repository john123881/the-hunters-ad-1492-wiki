import type { Context } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AuthSession } from '../shared/types';
import { getDb } from './db';
import {
  campaigns,
  campaignPlayers,
  authSessions,
  authLoginAttempts,
} from './db/schema/index';

import { parseJsonBody } from './http/json';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;
const COOKIE = 'hunter_session';
const WEEK = 604800;
const enc = new TextEncoder();

function b64(bytes: Uint8Array) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function unb64(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
}
async function digest(value: string) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value))));
}
async function verifyPassword(password: string, stored: string) {
  const [algorithm, roundsText, saltText, expectedText] = stored.split('$');
  const rounds = Number(roundsText);
  if (algorithm !== 'pbkdf2_sha256' || !Number.isInteger(rounds) || rounds < 100000 || !saltText || !expectedText) return false;
  const expected = unb64(expectedText);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltText), iterations: rounds }, key, expected.length * 8,
  ));
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i += 1) difference |= actual[i] ^ expected[i];
  return difference === 0;
}
function fail(c: Ctx, status: 400 | 401 | 423, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}
function clientKey(c: Ctx) {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}
async function recordFailure(db: D1Database, campaignId: string, key: string, now: number) {
  await db.prepare(`
    INSERT INTO auth_login_attempts (campaign_id, client_key, failure_count, window_started_at, locked_until)
    VALUES (?, ?, 1, ?, NULL)
    ON CONFLICT(campaign_id, client_key) DO UPDATE SET
      failure_count = CASE WHEN ? - window_started_at > 900 THEN 1 ELSE failure_count + 1 END,
      window_started_at = CASE WHEN ? - window_started_at > 900 THEN ? ELSE window_started_at END,
      locked_until = CASE WHEN ? - window_started_at <= 900 AND failure_count + 1 >= 8 THEN ? + 900 ELSE NULL END
  `).bind(campaignId, key, now, now, now, now, now, now).run();
}
export async function readSession(c: Ctx): Promise<{ hash: string; data: AuthSession } | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const hash = await digest(token);
  const now = Math.floor(Date.now() / 1000);
  const db = getDb(c.env.DB);

  const [row] = await db
    .select({
      campaignId: authSessions.campaignId,
      playerNumber: authSessions.playerNumber,
      expiresAt: authSessions.expiresAt,
      campaignName: campaigns.campaignName,
      isActive: campaigns.isActive,
      playerAlias: campaignPlayers.playerAlias,
    })
    .from(authSessions)
    .innerJoin(campaigns, eq(campaigns.id, authSessions.campaignId))
    .innerJoin(
      campaignPlayers,
      and(
        eq(campaignPlayers.campaignId, authSessions.campaignId),
        eq(campaignPlayers.playerNumber, authSessions.playerNumber),
      ),
    )
    .where(
      and(
        eq(authSessions.tokenHash, hash),
        sql`${authSessions.expiresAt} > ${now}`,
        sql`${campaigns.deletedAt} IS NULL`,
      ),
    );

  if (!row) return null;

  const players = await db
    .select({
      playerNumber: campaignPlayers.playerNumber,
      playerAlias: campaignPlayers.playerAlias,
    })
    .from(campaignPlayers)
    .where(eq(campaignPlayers.campaignId, row.campaignId))
    .orderBy(campaignPlayers.playerNumber);

  return {
    hash,
    data: {
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      playerNumber: row.playerNumber,
      playerAlias: row.playerAlias,
      isActive: row.isActive === true,
      expiresAt: new Date(row.expiresAt * 1000).toISOString(),
      players: players.map(player => ({
        playerNumber: player.playerNumber,
        playerAlias: player.playerAlias,
      })),
    },
  };
}

export async function loginCampaign(c: Ctx) {
  const parsed = await parseJsonBody<Record<string, unknown>>(c, {
    code: 'INVALID_JSON',
    message: '請提供有效的登入資料。',
  });
  if (!parsed.success) return parsed.response;
  const body = parsed.data;
  const campaignId = typeof body.campaignId === 'string' ? body.campaignId.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const playerNumber = Number(body.playerNumber);
  const playerAlias = typeof body.playerAlias === 'string' ? body.playerAlias.trim() : '';
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(campaignId)) return fail(c, 400, 'INVALID_CAMPAIGN_ID', '戰役 ID 格式不正確。');
  if (password.length < 8 || password.length > 128) return fail(c, 400, 'INVALID_PASSWORD', '戰役密碼格式不正確。');
  if (!Number.isInteger(playerNumber) || playerNumber < 1 || playerNumber > 4) return fail(c, 400, 'INVALID_PLAYER_NUMBER', '請選擇有效的玩家席位。');
  if (playerAlias.length < 1 || playerAlias.length > 30) return fail(c, 400, 'INVALID_PLAYER_ALIAS', '暱稱需為 1 至 30 個字元。');

  const now = Math.floor(Date.now() / 1000);
  const key = clientKey(c);
  const db = getDb(c.env.DB);

  const [attempt] = await db
    .select({ lockedUntil: authLoginAttempts.lockedUntil })
    .from(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.campaignId, campaignId),
        eq(authLoginAttempts.clientKey, key),
      ),
    );
  if (attempt?.lockedUntil && attempt.lockedUntil > now) return fail(c, 423, 'LOGIN_LOCKED', '登入嘗試過多，請稍後再試。');

  const [campaign] = await db
    .select({
      id: campaigns.id,
      campaignName: campaigns.campaignName,
      passwordHash: campaigns.passwordHash,
      maxPlayers: campaigns.maxPlayers,
      isActive: campaigns.isActive,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, campaignId),
        sql`${campaigns.deletedAt} IS NULL`,
      ),
    );

  if (!campaign || !(await verifyPassword(password, campaign.passwordHash))) {
    await recordFailure(c.env.DB, campaignId, key, now);
    return fail(c, 401, 'INVALID_CREDENTIALS', '戰役 ID 或密碼不正確。');
  }
  if (playerNumber > campaign.maxPlayers) {
    return fail(c, 400, 'INVALID_PLAYER_NUMBER', `此戰役僅開放 ${campaign.maxPlayers} 個玩家席位。`);
  }

  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digest(token);
  const expiresAt = now + WEEK;

  const d1 = c.env.DB;
  await d1.batch([
    d1.prepare(`
      INSERT INTO campaign_players (campaign_id, player_number, player_alias)
      VALUES (?, ?, ?)
      ON CONFLICT(campaign_id, player_number) DO UPDATE SET player_alias = excluded.player_alias, updated_at = datetime('now')
    `).bind(campaignId, playerNumber, playerAlias),
    d1.prepare(`
      INSERT INTO auth_sessions (token_hash, campaign_id, player_number, expires_at)
      VALUES (?, ?, ?, ?)
    `).bind(tokenHash, campaignId, playerNumber, expiresAt),
    d1.prepare(`
      DELETE FROM auth_login_attempts WHERE campaign_id = ? AND client_key = ?
    `).bind(campaignId, key),
    d1.prepare(`
      DELETE FROM auth_sessions WHERE expires_at <= ?
    `).bind(now),
  ]);

  setCookie(c, COOKIE, token, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: WEEK,
  });

  const players = await db
    .select({
      playerNumber: campaignPlayers.playerNumber,
      playerAlias: campaignPlayers.playerAlias,
    })
    .from(campaignPlayers)
    .where(eq(campaignPlayers.campaignId, campaignId))
    .orderBy(campaignPlayers.playerNumber);

  return c.json({ data: {
    campaignId, campaignName: campaign.campaignName, playerNumber, playerAlias,
    isActive: campaign.isActive === true, expiresAt: new Date(expiresAt * 1000).toISOString(),
    players: players.map(player => ({ playerNumber: player.playerNumber, playerAlias: player.playerAlias })),
  } satisfies AuthSession });
}

export async function getSession(c: Ctx) {
  const session = await readSession(c);
  if (!session) { deleteCookie(c, COOKIE, { path: '/' }); return c.json({ data: null }); }
  const db = getDb(c.env.DB);
  await db
    .update(authSessions)
    .set({ lastSeenAt: sql`(datetime('now'))` })
    .where(eq(authSessions.tokenHash, session.hash));
  return c.json({ data: session.data });
}

export async function logout(c: Ctx) {
  const token = getCookie(c, COOKIE);
  if (token) {
    const db = getDb(c.env.DB);
    const hash = await digest(token);
    await db.delete(authSessions).where(eq(authSessions.tokenHash, hash));
  }
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ data: { loggedOut: true } });
}

export async function requireCampaignSession(c: Ctx): Promise<AuthSession> {
  const session = await readSession(c);
  if (!session) throw new HTTPException(401, { message: '請先登入戰役。' });
  return session.data;
}
