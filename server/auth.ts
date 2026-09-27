import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AuthSession } from '../shared/types';

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
  const row = await c.env.DB.prepare(`
    SELECT s.campaign_id, s.player_number, s.expires_at, c.campaign_name, c.is_active, p.player_alias
    FROM auth_sessions s
    JOIN campaigns c ON c.id = s.campaign_id
    JOIN campaign_players p ON p.campaign_id = s.campaign_id AND p.player_number = s.player_number
    WHERE s.token_hash = ? AND s.expires_at > ? AND c.deleted_at IS NULL
  `).bind(hash, now).first<{
    campaign_id: string; player_number: number; expires_at: number;
    campaign_name: string; is_active: number; player_alias: string;
  }>();
  if (!row) return null;
  const players = await c.env.DB.prepare(
    'SELECT player_number, player_alias FROM campaign_players WHERE campaign_id = ? ORDER BY player_number',
  ).bind(row.campaign_id).all<{ player_number: number; player_alias: string }>();
  return { hash, data: {
    campaignId: row.campaign_id, campaignName: row.campaign_name,
    playerNumber: row.player_number, playerAlias: row.player_alias,
    isActive: row.is_active === 1, expiresAt: new Date(row.expires_at * 1000).toISOString(),
    players: players.results.map(player => ({ playerNumber: player.player_number, playerAlias: player.player_alias })),
  } };
}
export async function loginCampaign(c: Ctx) {
  let body: Record<string, unknown>;
  try { body = await c.req.json(); } catch { return fail(c, 400, 'INVALID_JSON', '請提供有效的登入資料。'); }
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
  const attempt = await c.env.DB.prepare('SELECT locked_until FROM auth_login_attempts WHERE campaign_id = ? AND client_key = ?')
    .bind(campaignId, key).first<{ locked_until: number | null }>();
  if (attempt?.locked_until && attempt.locked_until > now) return fail(c, 423, 'LOGIN_LOCKED', '登入嘗試過多，請稍後再試。');

  const campaign = await c.env.DB.prepare(
    'SELECT id, campaign_name, password_hash, max_players, is_active FROM campaigns WHERE id = ? AND deleted_at IS NULL',
  ).bind(campaignId).first<{
    id: string; campaign_name: string; password_hash: string; max_players: number; is_active: number;
  }>();
  if (!campaign || !(await verifyPassword(password, campaign.password_hash))) {
    await recordFailure(c.env.DB, campaignId, key, now);
    return fail(c, 401, 'INVALID_CREDENTIALS', '戰役 ID 或密碼不正確。');
  }
  if (playerNumber > campaign.max_players) {
    return fail(c, 400, 'INVALID_PLAYER_NUMBER', `此戰役僅開放 ${campaign.max_players} 個玩家席位。`);
  }

  await c.env.DB.prepare(`
    INSERT INTO campaign_players (campaign_id, player_number, player_alias) VALUES (?, ?, ?)
    ON CONFLICT(campaign_id, player_number) DO UPDATE SET
      player_alias = excluded.player_alias, updated_at = datetime('now')
  `).bind(campaignId, playerNumber, playerAlias).run();

  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digest(token);
  const expiresAt = now + WEEK;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO auth_sessions (token_hash, campaign_id, player_number, expires_at) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, campaignId, playerNumber, expiresAt),
    c.env.DB.prepare('DELETE FROM auth_login_attempts WHERE campaign_id = ? AND client_key = ?').bind(campaignId, key),
    c.env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now),
  ]);
  setCookie(c, COOKIE, token, {
    httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: WEEK,
  });
  const players = await c.env.DB.prepare(
    'SELECT player_number, player_alias FROM campaign_players WHERE campaign_id = ? ORDER BY player_number',
  ).bind(campaignId).all<{ player_number: number; player_alias: string }>();
  return c.json({ data: {
    campaignId, campaignName: campaign.campaign_name, playerNumber, playerAlias,
    isActive: campaign.is_active === 1, expiresAt: new Date(expiresAt * 1000).toISOString(),
    players: players.results.map(player => ({ playerNumber: player.player_number, playerAlias: player.player_alias })),
  } satisfies AuthSession });
}
export async function getSession(c: Ctx) {
  const session = await readSession(c);
  if (!session) { deleteCookie(c, COOKIE, { path: '/' }); return c.json({ data: null }); }
  await c.env.DB.prepare("UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE token_hash = ?")
    .bind(session.hash).run();
  return c.json({ data: session.data });
}
export async function logout(c: Ctx) {
  const token = getCookie(c, COOKIE);
  if (token) await c.env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(await digest(token)).run();
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ data: { loggedOut: true } });
}

export async function requireCampaignSession(c: Ctx): Promise<AuthSession> {
  const session = await readSession(c);
  if (!session) throw new HTTPException(401, { message: '請先登入戰役。' });
  return session.data;
}
