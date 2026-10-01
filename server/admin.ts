import type { Context } from 'hono';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AdminSession } from '../shared/types';
import { buildCampaignBackup, restoreCampaignBackup } from './campaignBackup';
import { getDb, runD1Batch } from './db';
import {
  adminUsers,
  adminSessions,
  adminLoginAttempts,
  adminActivityLogs,
  campaigns,
  campaignPlayers,
  authSessions,
  campaignWagons,
  campaignMaps,
  campaignCharacters,
  wagonActivityLogs,
  mapActivityLogs,
  characterActivityLogs,
} from './db/schema/index';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;
const COOKIE = 'hunter_admin_session';
const SESSION_SECONDS = 8 * 60 * 60;
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
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltText), iterations: rounds }, key, expected.length * 8));
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < Math.min(actual.length, expected.length); i += 1) difference |= actual[i] ^ expected[i];
  return difference === 0;
}
function fail(c: Ctx, status: 400 | 401 | 404 | 409 | 423, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}
function clientKey(c: Ctx) {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}

async function readAdminSession(c: Ctx): Promise<{ hash: string; data: AdminSession } | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const hash = await digest(token);
  const now = Math.floor(Date.now() / 1000);
  const db = getDb(c.env.DB);

  const [row] = await db
    .select({
      adminUserId: adminSessions.adminUserId,
      expiresAt: adminSessions.expiresAt,
      username: adminUsers.username,
      displayName: adminUsers.displayName,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
    .where(
      and(
        eq(adminSessions.tokenHash, hash),
        sql`${adminSessions.expiresAt} > ${now}`,
        eq(adminUsers.isActive, true),
      ),
    );

  if (!row) return null;
  return {
    hash,
    data: {
      id: row.adminUserId,
      username: row.username,
      displayName: row.displayName,
      expiresAt: new Date(row.expiresAt * 1000).toISOString(),
    },
  };
}

export async function requireAdmin(c: Ctx) {
  const session = await readAdminSession(c);
  if (!session) throw new HTTPException(401, { message: '請先登入管理者帳號。' });
  return session;
}

export async function getAdminSession(c: Ctx) {
  const session = await readAdminSession(c);
  if (!session) {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ data: null });
  }
  const db = getDb(c.env.DB);
  await db
    .update(adminSessions)
    .set({ lastSeenAt: sql`(datetime('now'))` })
    .where(eq(adminSessions.tokenHash, session.hash));
  return c.json({ data: session.data });
}

export async function loginAdmin(c: Ctx) {
  let input: Record<string, unknown>;
  try { input = await c.req.json(); } catch { return fail(c, 400, 'INVALID_JSON', '請提供有效的登入資料。'); }
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || password.length < 12 || password.length > 128) {
    return fail(c, 400, 'INVALID_ADMIN_LOGIN', '帳號或密碼格式不正確。');
  }
  const now = Math.floor(Date.now() / 1000);
  const key = clientKey(c);
  const db = getDb(c.env.DB);

  const [attempt] = await db
    .select({ lockedUntil: adminLoginAttempts.lockedUntil })
    .from(adminLoginAttempts)
    .where(
      and(
        eq(adminLoginAttempts.username, username),
        eq(adminLoginAttempts.clientKey, key),
      ),
    );
  if (attempt?.lockedUntil && attempt.lockedUntil > now) return fail(c, 423, 'ADMIN_LOGIN_LOCKED', '登入嘗試過多，請稍後再試。');

  const [admin] = await db
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      displayName: adminUsers.displayName,
      passwordHash: adminUsers.passwordHash,
      isActive: adminUsers.isActive,
    })
    .from(adminUsers)
    .where(eq(adminUsers.username, username));

  if (!admin || !admin.isActive || !(await verifyPassword(password, admin.passwordHash))) {
    await db
      .insert(adminLoginAttempts)
      .values({
        username,
        clientKey: key,
        failureCount: 1,
        windowStartedAt: now,
        lockedUntil: null,
      })
      .onConflictDoUpdate({
        target: [adminLoginAttempts.username, adminLoginAttempts.clientKey],
        set: {
          failureCount: sql`CASE WHEN ${now} - ${adminLoginAttempts.windowStartedAt} > 900 THEN 1 ELSE ${adminLoginAttempts.failureCount} + 1 END`,
          windowStartedAt: sql`CASE WHEN ${now} - ${adminLoginAttempts.windowStartedAt} > 900 THEN ${now} ELSE ${adminLoginAttempts.windowStartedAt} END`,
          lockedUntil: sql`CASE WHEN ${now} - ${adminLoginAttempts.windowStartedAt} <= 900 AND ${adminLoginAttempts.failureCount} + 1 >= 6 THEN ${now} + 900 ELSE NULL END`,
        },
      });
    return fail(c, 401, 'INVALID_ADMIN_CREDENTIALS', '管理者帳號或密碼不正確。');
  }

  const token = b64(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digest(token);
  const expiresAt = now + SESSION_SECONDS;

  const insertSessionStmt = db.insert(adminSessions).values({
    tokenHash,
    adminUserId: admin.id,
    expiresAt,
  });

  const deleteAttemptStmt = db
    .delete(adminLoginAttempts)
    .where(
      and(
        eq(adminLoginAttempts.username, username),
        eq(adminLoginAttempts.clientKey, key),
      ),
    );

  const deleteExpiredSessionsStmt = db
    .delete(adminSessions)
    .where(sql`${adminSessions.expiresAt} <= ${now}`);

  const updateAdminStmt = db
    .update(adminUsers)
    .set({ lastLoginAt: sql`(datetime('now'))` })
    .where(eq(adminUsers.id, admin.id));

  const logStmt = db.insert(adminActivityLogs).values({
    adminUserId: admin.id,
    actionType: 'LOGIN',
    entityType: 'ADMIN',
    entityId: String(admin.id),
  });

  await runD1Batch(c.env.DB, [
    insertSessionStmt,
    deleteAttemptStmt,
    deleteExpiredSessionsStmt,
    updateAdminStmt,
    logStmt,
  ]);

  setCookie(c, COOKIE, token, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: SESSION_SECONDS });
  return c.json({ data: { id: admin.id, username: admin.username, displayName: admin.displayName, expiresAt: new Date(expiresAt * 1000).toISOString() } satisfies AdminSession });
}

export async function logoutAdmin(c: Ctx) {
  const token = getCookie(c, COOKIE);
  if (token) {
    const db = getDb(c.env.DB);
    const hash = await digest(token);
    await db.delete(adminSessions).where(eq(adminSessions.tokenHash, hash));
  }
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ data: { loggedOut: true } });
}

export async function getAdminCampaigns(c: Ctx) {
  await requireAdmin(c);
  const now = Math.floor(Date.now() / 1000);
  const db = getDb(c.env.DB);

  const rows = await db
    .select({
      id: campaigns.id,
      campaignName: campaigns.campaignName,
      isActive: campaigns.isActive,
      maxPlayers: campaigns.maxPlayers,
      createdAt: campaigns.createdAt,
      updatedAt: campaigns.updatedAt,
      playerCount: sql<number>`(SELECT COUNT(*) FROM campaign_players p WHERE p.campaign_id = ${campaigns.id})`.as('player_count'),
      characterCount: sql<number>`(SELECT COUNT(*) FROM campaign_characters ch WHERE ch.campaign_id = ${campaigns.id})`.as('character_count'),
      activeSessionCount: sql<number>`(SELECT COUNT(*) FROM auth_sessions s WHERE s.campaign_id = ${campaigns.id} AND s.expires_at > ${now})`.as('active_session_count'),
      wagonVersion: sql<number>`COALESCE(${campaignWagons.version}, 0)`.as('wagon_version'),
      mapVersion: sql<number>`COALESCE(${campaignMaps.version}, 0)`.as('map_version'),
    })
    .from(campaigns)
    .leftJoin(campaignWagons, eq(campaignWagons.campaignId, campaigns.id))
    .leftJoin(campaignMaps, eq(campaignMaps.campaignId, campaigns.id))
    .where(sql`${campaigns.deletedAt} IS NULL`)
    .orderBy(desc(campaigns.updatedAt), campaigns.id);

  const playerRows = await db
    .select({
      campaignId: campaignPlayers.campaignId,
      playerNumber: campaignPlayers.playerNumber,
      playerAlias: campaignPlayers.playerAlias,
      heroSlug: campaignCharacters.heroSlug,
      customName: campaignCharacters.customName,
    })
    .from(campaignPlayers)
    .leftJoin(
      campaignCharacters,
      and(
        eq(campaignCharacters.campaignId, campaignPlayers.campaignId),
        eq(campaignCharacters.playerNumber, campaignPlayers.playerNumber),
      ),
    )
    .orderBy(campaignPlayers.campaignId, campaignPlayers.playerNumber);

  const campaignList = rows.map(row => ({
    id: row.id,
    name: row.campaignName,
    isActive: row.isActive === true,
    maxPlayers: row.maxPlayers,
    playerCount: Number(row.playerCount ?? 0),
    characterCount: Number(row.characterCount ?? 0),
    activeSessionCount: Number(row.activeSessionCount ?? 0),
    wagonVersion: Number(row.wagonVersion ?? 0),
    mapVersion: Number(row.mapVersion ?? 0),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    players: playerRows
      .filter(player => player.campaignId === row.id)
      .map(player => ({
        playerNumber: player.playerNumber,
        playerAlias: player.playerAlias,
        heroSlug: player.heroSlug,
        customName: player.customName,
      })),
  }));

  return c.json({
    data: {
      summary: {
        campaignCount: campaignList.length,
        activeCampaignCount: campaignList.filter(item => item.isActive).length,
        playerCount: campaignList.reduce((sum, item) => sum + item.playerCount, 0),
        characterCount: campaignList.reduce((sum, item) => sum + item.characterCount, 0),
        activeSessionCount: campaignList.reduce((sum, item) => sum + item.activeSessionCount, 0),
      },
      campaigns: campaignList,
    },
  });
}

async function hashPassword(password: string) {
  const rounds = 310000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, 256));
  return `pbkdf2_sha256$${rounds}$${b64(salt)}$${b64(hash)}`;
}

async function parseBody(c: Ctx) {
  try { return await c.req.json<Record<string, unknown>>(); } catch { return null; }
}

export async function createAdminCampaign(c: Ctx) {
  const admin = await requireAdmin(c);
  const input = await parseBody(c);
  if (!input) return fail(c, 400, 'INVALID_JSON', '請提供有效的戰役資料。');
  const id = typeof input.id === 'string' ? input.id.trim().toLowerCase() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const maxPlayers = Number(input.maxPlayers);
  if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(id)) return fail(c, 400, 'INVALID_CAMPAIGN_ID', '戰役 ID 需為 3 至 40 字元的小寫英文、數字或連字號。');
  if (name.length < 1 || name.length > 60) return fail(c, 400, 'INVALID_CAMPAIGN_NAME', '戰役名稱需為 1 至 60 個字元。');
  if (password.length < 8 || password.length > 128) return fail(c, 400, 'INVALID_CAMPAIGN_PASSWORD', '戰役密碼至少需要 8 個字元。');
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 4) return fail(c, 400, 'INVALID_MAX_PLAYERS', '玩家上限需為 1 至 4。');

  const db = getDb(c.env.DB);
  const [exists] = await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.id, id));
  if (exists) return fail(c, 409, 'CAMPAIGN_ID_EXISTS', '這個戰役 ID 已經存在。');

  const passwordHash = await hashPassword(password);

  const insertCampaignStmt = db.insert(campaigns).values({
    id,
    campaignName: name,
    passwordHash,
    maxPlayers,
  });

  const insertWagonStmt = db.insert(campaignWagons).values({
    campaignId: id,
  });

  const insertMapStmt = db.insert(campaignMaps).values({
    campaignId: id,
  });

  const logStmt = db.insert(adminActivityLogs).values({
    adminUserId: admin.data.id,
    actionType: 'CREATE_CAMPAIGN',
    entityType: 'CAMPAIGN',
    entityId: id,
    afterJson: JSON.stringify({ name, maxPlayers }),
  });

  await runD1Batch(c.env.DB, [
    insertCampaignStmt,
    insertWagonStmt,
    insertMapStmt,
    logStmt,
  ]);

  return getAdminCampaigns(c);
}

export async function updateAdminCampaignStatus(c: Ctx) {
  const admin = await requireAdmin(c);
  const id = c.req.param('campaignId') ?? '';
  if (!id) return fail(c, 400, 'INVALID_CAMPAIGN_ID', '缺少戰役 ID。');
  const input = await parseBody(c);
  if (!input || typeof input.isActive !== 'boolean') return fail(c, 400, 'INVALID_CAMPAIGN_STATUS', '請提供有效的戰役狀態。');

  const db = getDb(c.env.DB);
  const [before] = await db
    .select({
      campaignName: campaigns.campaignName,
      isActive: campaigns.isActive,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, id),
        sql`${campaigns.deletedAt} IS NULL`,
      ),
    );
  if (!before) return fail(c, 404, 'CAMPAIGN_NOT_FOUND', '找不到這個戰役。');

  const updateStmt = db
    .update(campaigns)
    .set({
      isActive: input.isActive,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(campaigns.id, id));

  const logStmt = db.insert(adminActivityLogs).values({
    adminUserId: admin.data.id,
    actionType: 'SET_CAMPAIGN_STATUS',
    entityType: 'CAMPAIGN',
    entityId: id,
    beforeJson: JSON.stringify({ isActive: before.isActive === true }),
    afterJson: JSON.stringify({ isActive: input.isActive }),
  });

  await runD1Batch(c.env.DB, [updateStmt, logStmt]);

  return getAdminCampaigns(c);
}

export async function revokeAdminCampaignSessions(c: Ctx) {
  const admin = await requireAdmin(c);
  const id = c.req.param('campaignId') ?? '';
  if (!id) return fail(c, 400, 'INVALID_CAMPAIGN_ID', '缺少戰役 ID。');

  const db = getDb(c.env.DB);
  const [campaign] = await db
    .select({ campaignName: campaigns.campaignName })
    .from(campaigns)
    .where(and(eq(campaigns.id, id), sql`${campaigns.deletedAt} IS NULL`));
  if (!campaign) return fail(c, 404, 'CAMPAIGN_NOT_FOUND', '找不到這個戰役。');

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(authSessions)
    .where(eq(authSessions.campaignId, id));
  const sessionCount = Number(countResult?.count ?? 0);

  const deleteSessionsStmt = db
    .delete(authSessions)
    .where(eq(authSessions.campaignId, id));

  const logStmt = db.insert(adminActivityLogs).values({
    adminUserId: admin.data.id,
    actionType: 'REVOKE_CAMPAIGN_SESSIONS',
    entityType: 'CAMPAIGN',
    entityId: id,
    beforeJson: JSON.stringify({ sessionCount }),
    afterJson: JSON.stringify({ sessionCount: 0 }),
  });

  await runD1Batch(c.env.DB, [deleteSessionsStmt, logStmt]);

  return getAdminCampaigns(c);
}

export async function resetAdminCampaignPassword(c: Ctx) {
  const admin = await requireAdmin(c);
  const id = c.req.param('campaignId') ?? '';
  if (!id) return fail(c, 400, 'INVALID_CAMPAIGN_ID', '缺少戰役 ID。');
  const input = await parseBody(c);
  const password = typeof input?.password === 'string' ? input.password : '';
  const revokeSessions = input?.revokeSessions !== false;
  if (password.length < 8 || password.length > 128) return fail(c, 400, 'INVALID_CAMPAIGN_PASSWORD', '戰役密碼需為 8 至 128 個字元。');

  const db = getDb(c.env.DB);
  const [campaign] = await db
    .select({ campaignName: campaigns.campaignName })
    .from(campaigns)
    .where(and(eq(campaigns.id, id), sql`${campaigns.deletedAt} IS NULL`));
  if (!campaign) return fail(c, 404, 'CAMPAIGN_NOT_FOUND', '找不到這個戰役。');

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(authSessions)
    .where(eq(authSessions.campaignId, id));
  const sessionCount = Number(countResult?.count ?? 0);
  const passwordHash = await hashPassword(password);
  const revokedCount = revokeSessions ? sessionCount : 0;

  const updatePasswordStmt = db
    .update(campaigns)
    .set({
      passwordHash,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(campaigns.id, id));

  const logStmt = db.insert(adminActivityLogs).values({
    adminUserId: admin.data.id,
    actionType: 'RESET_CAMPAIGN_PASSWORD',
    entityType: 'CAMPAIGN',
    entityId: id,
    beforeJson: JSON.stringify({ password: 'REDACTED' }),
    afterJson: JSON.stringify({ password: 'REDACTED', revokedSessionCount: revokedCount }),
  });

  if (revokeSessions) {
    const deleteSessionsStmt = db.delete(authSessions).where(eq(authSessions.campaignId, id));
    await runD1Batch(c.env.DB, [updatePasswordStmt, deleteSessionsStmt, logStmt]);
  } else {
    await runD1Batch(c.env.DB, [updatePasswordStmt, logStmt]);
  }

  return c.json({ data: { campaignId: id, revokedSessionCount: revokedCount } });
}

export async function getAdminActivityLogs(c: Ctx) {
  await requireAdmin(c);
  const requested = Number(c.req.query('limit') ?? 50);
  const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 100) : 50;
  const categoryInput = (c.req.query('category') ?? 'CAMPAIGN').toUpperCase();
  const category = ['CAMPAIGN', 'WAGON', 'MAP', 'CHARACTER'].includes(categoryInput) ? categoryInput : 'CAMPAIGN';
  const campaignId = c.req.query('campaignId')?.trim() || null;

  const db = getDb(c.env.DB);

  if (campaignId) {
    const [campaign] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), sql`${campaigns.deletedAt} IS NULL`));
    if (!campaign) return fail(c, 404, 'CAMPAIGN_NOT_FOUND', '找不到這個戰役。');
  }

  type LogResult = {
    id: number;
    actionType: string;
    entityType: string;
    entityId: string | null;
    beforeJson: string | null;
    afterJson: string | null;
    createdAt: string;
    campaignId: string | null;
    campaignName: string | null;
    actorLabel: string;
    actorDetail: string;
  };

  let logs: LogResult[] = [];

  if (category === 'CAMPAIGN') {
    const rows = await db
      .select({
        id: adminActivityLogs.id,
        actionType: adminActivityLogs.actionType,
        entityType: adminActivityLogs.entityType,
        entityId: adminActivityLogs.entityId,
        beforeJson: adminActivityLogs.beforeJson,
        afterJson: adminActivityLogs.afterJson,
        createdAt: adminActivityLogs.createdAt,
        campaignId: sql<string | null>`CASE WHEN ${adminActivityLogs.entityType} = 'CAMPAIGN' THEN ${adminActivityLogs.entityId} ELSE NULL END`,
        campaignName: sql<string | null>`CASE WHEN ${adminActivityLogs.entityType} = 'CAMPAIGN' THEN COALESCE(${campaigns.campaignName}, ${adminActivityLogs.entityId}) ELSE NULL END`,
        actorLabel: adminUsers.displayName,
        actorDetail: adminUsers.username,
      })
      .from(adminActivityLogs)
      .innerJoin(adminUsers, eq(adminUsers.id, adminActivityLogs.adminUserId))
      .leftJoin(campaigns, eq(campaigns.id, adminActivityLogs.entityId))
      .where(campaignId ? and(eq(adminActivityLogs.entityType, 'CAMPAIGN'), eq(adminActivityLogs.entityId, campaignId)) : undefined)
      .orderBy(desc(adminActivityLogs.id))
      .limit(limit);

    logs = rows.map(r => ({
      ...r,
      actorLabel: r.actorLabel ?? '未知',
    }));
  } else if (category === 'WAGON') {
    const rows = await db
      .select({
        id: wagonActivityLogs.id,
        actionType: wagonActivityLogs.actionType,
        entityType: wagonActivityLogs.entityType,
        entityId: wagonActivityLogs.entityId,
        beforeJson: wagonActivityLogs.beforeJson,
        afterJson: wagonActivityLogs.afterJson,
        createdAt: wagonActivityLogs.createdAt,
        campaignId: wagonActivityLogs.campaignId,
        campaignName: campaigns.campaignName,
        actorLabel: campaignPlayers.playerAlias,
        actorDetail: sql<string>`'玩家 ' || ${wagonActivityLogs.playerNumber}`,
      })
      .from(wagonActivityLogs)
      .innerJoin(campaigns, eq(campaigns.id, wagonActivityLogs.campaignId))
      .leftJoin(
        campaignPlayers,
        and(
          eq(campaignPlayers.campaignId, wagonActivityLogs.campaignId),
          eq(campaignPlayers.playerNumber, wagonActivityLogs.playerNumber),
        ),
      )
      .where(campaignId ? eq(wagonActivityLogs.campaignId, campaignId) : undefined)
      .orderBy(desc(wagonActivityLogs.id))
      .limit(limit);

    logs = rows.map(r => ({
      ...r,
      actorLabel: r.actorLabel ?? '未知',
    }));
  } else if (category === 'MAP') {
    const rows = await db
      .select({
        id: mapActivityLogs.id,
        actionType: mapActivityLogs.actionType,
        entityType: mapActivityLogs.entityType,
        entityId: mapActivityLogs.entityId,
        beforeJson: mapActivityLogs.beforeJson,
        afterJson: mapActivityLogs.afterJson,
        createdAt: mapActivityLogs.createdAt,
        campaignId: mapActivityLogs.campaignId,
        campaignName: campaigns.campaignName,
        actorLabel: campaignPlayers.playerAlias,
        actorDetail: sql<string>`'玩家 ' || ${mapActivityLogs.playerNumber}`,
      })
      .from(mapActivityLogs)
      .innerJoin(campaigns, eq(campaigns.id, mapActivityLogs.campaignId))
      .leftJoin(
        campaignPlayers,
        and(
          eq(campaignPlayers.campaignId, mapActivityLogs.campaignId),
          eq(campaignPlayers.playerNumber, mapActivityLogs.playerNumber),
        ),
      )
      .where(campaignId ? eq(mapActivityLogs.campaignId, campaignId) : undefined)
      .orderBy(desc(mapActivityLogs.id))
      .limit(limit);

    logs = rows.map(r => ({
      ...r,
      actorLabel: r.actorLabel ?? '未知',
    }));
  } else {
    const rows = await db
      .select({
        id: characterActivityLogs.id,
        actionType: characterActivityLogs.actionType,
        entityType: characterActivityLogs.entityType,
        entityId: characterActivityLogs.entityId,
        beforeJson: characterActivityLogs.beforeJson,
        afterJson: characterActivityLogs.afterJson,
        createdAt: characterActivityLogs.createdAt,
        campaignId: characterActivityLogs.campaignId,
        campaignName: campaigns.campaignName,
        actorLabel: campaignPlayers.playerAlias,
        actorDetail: sql<string>`'玩家 ' || ${characterActivityLogs.actorPlayerNumber} || ' → 席位 ' || ${characterActivityLogs.targetPlayerNumber}`,
      })
      .from(characterActivityLogs)
      .innerJoin(campaigns, eq(campaigns.id, characterActivityLogs.campaignId))
      .leftJoin(
        campaignPlayers,
        and(
          eq(campaignPlayers.campaignId, characterActivityLogs.campaignId),
          eq(campaignPlayers.playerNumber, characterActivityLogs.actorPlayerNumber),
        ),
      )
      .where(campaignId ? eq(characterActivityLogs.campaignId, campaignId) : undefined)
      .orderBy(desc(characterActivityLogs.id))
      .limit(limit);

    logs = rows.map(r => ({
      ...r,
      actorLabel: r.actorLabel ?? '未知',
    }));
  }

  const parse = (value: string | null) => {
    if (!value) return null;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { raw: value };
    }
  };

  return c.json({
    data: {
      category,
      campaignId,
      logs: logs.map(row => ({
        id: row.id,
        category,
        actionType: row.actionType,
        entityType: row.entityType,
        entityId: row.entityId,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        actorLabel: row.actorLabel,
        actorDetail: row.actorDetail,
        before: parse(row.beforeJson),
        after: parse(row.afterJson),
        createdAt: row.createdAt,
      })),
    },
  });
}

export async function deleteAdminActivityLogs(c: Ctx) {
  await requireAdmin(c);
  const input = await parseBody(c);
  const category = typeof input?.category === 'string' ? input.category.toUpperCase() : '';
  const rawIds = Array.isArray(input?.ids) ? input.ids : [];
  const ids = [...new Set(rawIds.map(Number).filter(id => Number.isInteger(id) && id > 0))];

  if (!['CAMPAIGN', 'WAGON', 'MAP', 'CHARACTER'].includes(category)) {
    return fail(c, 400, 'INVALID_ACTIVITY_CATEGORY', '請提供有效的紀錄分類。');
  }
  if (ids.length < 1 || ids.length > 100) {
    return fail(c, 400, 'INVALID_ACTIVITY_IDS', '請選擇 1 至 100 筆操作紀錄。');
  }

  const db = getDb(c.env.DB);
  let deletedCount = 0;

  if (category === 'CAMPAIGN') {
    const res = await db.delete(adminActivityLogs).where(inArray(adminActivityLogs.id, ids));
    deletedCount = res.meta.changes ?? 0;
  } else if (category === 'WAGON') {
    const res = await db.delete(wagonActivityLogs).where(inArray(wagonActivityLogs.id, ids));
    deletedCount = res.meta.changes ?? 0;
  } else if (category === 'MAP') {
    const res = await db.delete(mapActivityLogs).where(inArray(mapActivityLogs.id, ids));
    deletedCount = res.meta.changes ?? 0;
  } else if (category === 'CHARACTER') {
    const res = await db.delete(characterActivityLogs).where(inArray(characterActivityLogs.id, ids));
    deletedCount = res.meta.changes ?? 0;
  }

  return c.json({ data: { category, deletedCount, deletedIds: ids } });
}


export async function exportAdminCampaignBackup(c:Ctx){
  await requireAdmin(c);
  const campaignId=c.req.param('campaignId')??'';
  const backup=await buildCampaignBackup(c.env.DB,campaignId);
  if(!backup)return fail(c,404,'CAMPAIGN_NOT_FOUND','找不到這個戰役。');
  const stamp=new Date().toISOString().slice(0,10);
  c.header('Content-Type','application/json; charset=utf-8');
  c.header('Content-Disposition',`attachment; filename="${campaignId}-backup-${stamp}.json"`);
  return c.body(JSON.stringify(backup,null,2));
}

export async function importAdminCampaignBackup(c:Ctx){
  const admin=await requireAdmin(c);
  let input:unknown;
  try{input=await c.req.json();}catch{return fail(c,400,'INVALID_BACKUP_JSON','備份檔不是有效的 JSON。');}
  const routeCampaignId=c.req.param('campaignId')??'';
  const fileCampaignId=typeof input==='object'&&input!==null&&'campaignId' in input&&typeof input.campaignId==='string'?input.campaignId:'';
  const campaignId=routeCampaignId||fileCampaignId;
  if(!campaignId)return fail(c,400,'INVALID_CAMPAIGN_BACKUP','備份檔缺少戰役 ID。');
  try{
    const data=await restoreCampaignBackup(c.env.DB,campaignId,input,admin.data);
    return c.json({data});
  }catch(reason){
    const message=reason instanceof Error?reason.message:'無法還原戰役備份。';
    if(message.includes('備份'))return fail(c,400,'INVALID_CAMPAIGN_BACKUP',message);
    throw reason;
  }
}
