import type { Context } from 'hono';
import type { AuthSession } from '../shared/types';
import { requireCampaignSession } from './auth';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;

function error(c: Ctx, status: 400 | 404 | 409, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

async function mapConflict(c:Ctx,session:AuthSession,expectedVersion:number){
  const latest=await loadMap(c.env.DB,session);
  return c.json({error:{code:'MAP_VERSION_CONFLICT',message:'地圖資料已被其他玩家更新。',conflict:{scope:'MAP',expectedVersion:Number.isInteger(expectedVersion)?expectedVersion:null,currentVersion:latest.version,latest}}},409);
}

async function body(c: Ctx) {
  try { return await c.req.json<Record<string, unknown>>(); } catch { return null; }
}
function validMapCode(code: string) {
  const value = Number(code.slice(1));
  return /^M\d{2}$/.test(code) && value >= 1 && value <= 20;
}
function validLocationCode(code: string) {
  const value = Number(code.slice(1));
  return /^L\d{2}$/.test(code) && value >= 1 && value <= 14;
}
function parentMapCodeForLocation(code: string | null) {
  const value = Number(code?.slice(1));
  if (value >= 1 && value <= 6) return 'M10';
  if (value >= 7 && value <= 9) return 'M15';
  if (value >= 10 && value <= 11) return 'M04';
  return null;
}
function cardType(code: string): 'STORY' | 'MISSION' | 'FEATURE' | null {
  if (/^S(?:0(?:0[1-9]|[1-9]\d)|10[0-2]|20[1-9]|210)$/.test(code)) return 'STORY';
  if (/^J(?:0(?:0[1-9]|1[0-6])|10[1-2])$/.test(code)) return 'MISSION';
  if (/^F0(?:0[1-9]|1[0-6])$/.test(code)) return 'FEATURE';
  return null;
}
async function ensureMap(db: D1Database, campaignId: string) {
  await db.prepare('INSERT OR IGNORE INTO campaign_maps (campaign_id) VALUES (?)').bind(campaignId).run();
  const statements = Array.from({ length: 20 }, (_, index) => {
    const number = index + 1;
    return db.prepare('INSERT OR IGNORE INTO campaign_map_tiles (campaign_id, map_code, row_index, column_index) VALUES (?, ?, ?, ?)')
      .bind(campaignId, `M${String(number).padStart(2, '0')}`, Math.floor(index / 4) + 1, (index % 4) + 1);
  });
  await db.batch(statements);
  const locationStatements = Array.from({ length: 14 }, (_, index) =>
    db.prepare('INSERT OR IGNORE INTO campaign_location_cards (campaign_id, location_code) VALUES (?, ?)')
      .bind(campaignId, `L${String(index + 1).padStart(2, '0')}`),
  );
  await db.batch(locationStatements);
}
async function loadMap(db: D1Database, session: AuthSession) {
  await ensureMap(db, session.campaignId);
  const map = await db.prepare('SELECT current_location_type, current_location_code, road_event_notes, town_event_notes, version FROM campaign_maps WHERE campaign_id = ?')
    .bind(session.campaignId).first<{ current_location_type: 'MAP' | 'LOCATION' | null; current_location_code: string | null; road_event_notes: string; town_event_notes: string; version: number }>();
  const tiles = await db.prepare(`
    SELECT map_code, row_index, column_index, is_revealed, face, resource_notes, notes
    FROM campaign_map_tiles WHERE campaign_id = ? ORDER BY row_index, column_index
  `).bind(session.campaignId).all<{
    map_code: string; row_index: number; column_index: number; is_revealed: number;
    face: 'FRONT' | 'BACK'; resource_notes: string; notes: string;
  }>();
  const locations = await db.prepare(`
    SELECT location_code, is_revealed, face, resource_notes, notes
    FROM campaign_location_cards WHERE campaign_id = ? ORDER BY location_code
  `).bind(session.campaignId).all<{
    location_code: string; is_revealed: number; face: 'FRONT' | 'BACK';
    resource_notes: string; notes: string;
  }>();
  const cards = await db.prepare(`
    SELECT p.id, p.card_code, p.card_type,
           CASE
             WHEN p.card_type IN ('STORY', 'MISSION') AND COALESCE(cs.is_resolved, 0) = 1 THEN 'RESOLVED'
             ELSE p.status
           END AS status,
           p.location_type, p.location_code, p.notes, p.is_in_town_deck,
           t.token_code, t.unlock_at_day
    FROM campaign_map_card_placements p
    LEFT JOIN campaign_card_statuses cs ON cs.campaign_id = p.campaign_id AND cs.card_code = p.card_code
    LEFT JOIN campaign_cards_progress cp ON cp.campaign_id = p.campaign_id AND cp.card_code = p.card_code
    LEFT JOIN campaign_card_time_tokens t ON t.story_card_progress_id = cp.id AND t.status = 'ACTIVE'
    WHERE p.campaign_id = ?
    ORDER BY p.location_code, p.card_code
  `).bind(session.campaignId).all<{
    id: number; card_code: string; card_type: 'STORY' | 'MISSION' | 'FEATURE';
    status: 'PENDING' | 'RESOLVED'; location_type: 'MAP' | 'LOCATION'; location_code: string;
    notes: string; is_in_town_deck: number; token_code: 'A' | 'B' | 'C' | 'D' | null; unlock_at_day: number | null;
  }>();
  const cardProgress = await db.prepare(`
    SELECT c.card_code, c.card_type, c.edition,
           COALESCE(s.is_resolved, 0) AS is_resolved,
           p.location_type, p.location_code,
           token.token_code, token.unlock_at_day
    FROM campaign_card_catalog c
    LEFT JOIN campaign_card_statuses s
      ON s.card_code = c.card_code AND s.campaign_id = ?
    LEFT JOIN campaign_map_card_placements p
      ON p.card_code = c.card_code AND p.campaign_id = ?
    LEFT JOIN campaign_cards_progress progress
      ON progress.card_code = c.card_code AND progress.campaign_id = ?
    LEFT JOIN campaign_card_time_tokens token
      ON token.story_card_progress_id = progress.id AND token.status = 'ACTIVE'
    ORDER BY c.sort_order
  `).bind(session.campaignId, session.campaignId, session.campaignId).all<{
    card_code: string; card_type: 'STORY' | 'MISSION'; edition: 'CORE' | 'EXPANSION';
    is_resolved: number; location_type: 'MAP' | 'LOCATION' | null; location_code: string | null;
    token_code: 'A' | 'B' | 'C' | 'D' | null; unlock_at_day: number | null;
  }>();
  return {
    campaignId: session.campaignId,
    version: map?.version ?? 1,
    currentLocationType: map?.current_location_type ?? null,
    currentLocationCode: map?.current_location_code ?? null,
    currentMapCode: map?.current_location_type === 'MAP'
      ? map.current_location_code
      : parentMapCodeForLocation(map?.current_location_code ?? null),
    roadEventNotes: map?.road_event_notes ?? '',
    townEventNotes: map?.town_event_notes ?? '',
    tiles: tiles.results.map(row => ({
      mapCode: row.map_code, rowIndex: row.row_index, columnIndex: row.column_index,
      isRevealed: Boolean(row.is_revealed), face: row.face,
      resourceNotes: row.resource_notes, notes: row.notes,
    })),
    locations: locations.results.map(row => ({
      locationCode: row.location_code, isRevealed: Boolean(row.is_revealed), face: row.face,
      resourceNotes: row.resource_notes, notes: row.notes,
    })),
    cards: cards.results.map(row => ({
      id: row.id, cardCode: row.card_code, cardType: row.card_type, status: row.status,
      locationType: row.location_type, locationCode: row.location_code, notes: row.notes, isInTownDeck: Boolean(row.is_in_town_deck),
      timeToken: row.token_code ? { tokenCode: row.token_code, unlockAtDay: row.unlock_at_day } : null,
    })),
    cardProgress: cardProgress.results.map(row => ({
      cardCode: row.card_code, cardType: row.card_type, edition: row.edition,
      isResolved: Boolean(row.is_resolved), locationType: row.location_type, locationCode: row.location_code,
      timeToken: row.token_code ? { tokenCode: row.token_code, unlockAtDay: row.unlock_at_day } : null,
    })),
  };
}
function guardedMapLog(
  db: D1Database,
  session: AuthSession,
  expectedVersion: number,
  action: string,
  entity: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  return db.prepare(`
    INSERT INTO map_activity_logs
      (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json)
    SELECT ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?
    )
  `).bind(
    session.campaignId, session.playerNumber, action, entity, id,
    JSON.stringify(before), JSON.stringify(after),
    session.campaignId, expectedVersion,
  );
}

function guardedWagonLog(
  db: D1Database,
  session: AuthSession,
  expectedVersion: number,
  tokenId: number,
  cardCode: string,
  tokenCode: string,
) {
  return db.prepare(`
    INSERT INTO wagon_activity_logs
      (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json)
    SELECT ?, ?, 'REMOVE_TIME_TOKEN_ON_CARD_RESOLUTION', 'TIME_TOKEN', ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?
    )
  `).bind(
    session.campaignId, session.playerNumber, String(tokenId),
    JSON.stringify({ status: 'ACTIVE', storyCardCode: cardCode, tokenCode }),
    JSON.stringify({ status: 'REMOVED', storyCardCode: cardCode, reason: 'CARD_RESOLVED' }),
    session.campaignId, expectedVersion,
  );
}

async function runMapBatch(
  c: Ctx,
  session: AuthSession,
  expectedVersion: number,
  statements: D1PreparedStatement[],
  finalMapUpdate?: D1PreparedStatement,
) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return false;
  await ensureMap(c.env.DB, session.campaignId);
  const versionUpdate = finalMapUpdate ?? c.env.DB.prepare(`
    UPDATE campaign_maps
    SET version = version + 1, updated_by_player = ?, updated_at = datetime('now')
    WHERE campaign_id = ? AND version = ?
  `).bind(session.playerNumber, session.campaignId, expectedVersion);
  const results = await c.env.DB.batch([...statements, versionUpdate]);
  return Boolean(results[results.length - 1]?.meta.changes);
}

export async function getCampaignMap(c: Ctx) {
  const session = await requireCampaignSession(c);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function updateMapTile(c: Ctx) {
  const session = await requireCampaignSession(c);
  const mapCode = (c.req.param('mapCode') ?? '').toUpperCase();
  if (!validMapCode(mapCode)) return error(c, 404, 'MAP_TILE_NOT_FOUND', '找不到這張核心地圖卡。');
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const isRevealed = input?.isRevealed;
  const face = isRevealed === true ? 'FRONT' : 'BACK';
  const resourceNotes = typeof input?.resourceNotes === 'string' ? input.resourceNotes.trim() : '';
  const notes = typeof input?.notes === 'string' ? input.notes.trim() : '';
  if (typeof isRevealed !== 'boolean') return error(c, 400, 'INVALID_MAP_TILE', '地圖卡狀態不正確。');
  if (resourceNotes.length > 1000 || notes.length > 2000) {
    return error(c, 400, 'MAP_NOTES_TOO_LONG', '資源紀錄或備註內容過長。');
  }
  const before = await c.env.DB.prepare('SELECT is_revealed, face, resource_notes, notes FROM campaign_map_tiles WHERE campaign_id = ? AND map_code = ?')
    .bind(session.campaignId, mapCode).first();
  const updated = await runMapBatch(c, session, expectedVersion, [
    c.env.DB.prepare(`
      UPDATE campaign_map_tiles
      SET is_revealed = ?, face = ?, resource_notes = ?, notes = ?, updated_at = datetime('now')
      WHERE campaign_id = ? AND map_code = ?
        AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
    `).bind(isRevealed ? 1 : 0, face, resourceNotes, notes, session.campaignId, mapCode, session.campaignId, expectedVersion),
    guardedMapLog(c.env.DB, session, expectedVersion, 'UPDATE_MAP_TILE', 'MAP_TILE', mapCode, before, { isRevealed, face, resourceNotes, notes }),
  ]);
  if (!updated) return mapConflict(c,session,expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function updateMapPosition(c: Ctx) {
  const session = await requireCampaignSession(c);
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const locationType = input?.locationType === null ? null : String(input?.locationType ?? '');
  const locationCode = input?.locationCode === null ? null : String(input?.locationCode ?? '').trim().toUpperCase();
  if (locationType !== null && locationType !== 'MAP' && locationType !== 'LOCATION') {
    return error(c, 400, 'INVALID_LOCATION', '目前位置類型不正確。');
  }
  if ((locationType === 'MAP' && (!locationCode || !validMapCode(locationCode)))
      || (locationType === 'LOCATION' && (!locationCode || !validLocationCode(locationCode)))) {
    return error(c, 400, 'INVALID_LOCATION', '目前位置編號不正確。');
  }
  const before = await c.env.DB.prepare('SELECT current_location_type, current_location_code FROM campaign_maps WHERE campaign_id = ?')
    .bind(session.campaignId).first();
  const finalUpdate = c.env.DB.prepare(`
    UPDATE campaign_maps
    SET current_location_type = ?, current_location_code = ?,
        version = version + 1, updated_by_player = ?, updated_at = datetime('now')
    WHERE campaign_id = ? AND version = ?
  `).bind(locationType, locationCode, session.playerNumber, session.campaignId, expectedVersion);
  const updated = await runMapBatch(c, session, expectedVersion, [
    guardedMapLog(c.env.DB, session, expectedVersion, 'SET_HUNTER_LOCATION', 'MAP', session.campaignId, before, { locationType, locationCode }),
  ], finalUpdate);
  if (!updated) return mapConflict(c,session,expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function upsertMapCard(c: Ctx) {
  const session = await requireCampaignSession(c);
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const cardCode = typeof input?.cardCode === 'string' ? input.cardCode.trim().toUpperCase() : '';
  const type = cardType(cardCode);
  const locationCode = typeof input?.locationCode === 'string' ? input.locationCode.trim().toUpperCase() : '';
  const locationType = input?.locationType === 'LOCATION' ? 'LOCATION' : 'MAP';
  const isInTownDeck = type === 'FEATURE' && input?.isInTownDeck === true;
  const requestedStatus = input?.status === 'RESOLVED' ? 'RESOLVED' : 'PENDING';
  const notes = typeof input?.notes === 'string' ? input.notes.trim() : '';
  if (!type) return error(c, 400, 'INVALID_CARD_CODE', '卡片編號需為有效的 S、J 或 F 編號。');
  if ((locationType === 'MAP' && !validMapCode(locationCode)) || (locationType === 'LOCATION' && !validLocationCode(locationCode))) {
    return error(c, 400, 'INVALID_LOCATION', '請選擇有效的地圖卡或地點卡。');
  }
  if (notes.length > 500) return error(c, 400, 'CARD_NOTES_TOO_LONG', '卡片備註不可超過 500 字。');

  const trackedCard = type === 'STORY' || type === 'MISSION'
    ? await c.env.DB.prepare('SELECT card_code FROM campaign_card_catalog WHERE card_code = ? AND card_type = ?')
      .bind(cardCode, type).first<{ card_code: string }>()
    : null;
  if ((type === 'STORY' || type === 'MISSION') && !trackedCard) {
    return error(c, 400, 'INVALID_CARD_CODE', '這個 S／J 卡號不在已知卡片清單中。');
  }
  const progress = trackedCard
    ? await c.env.DB.prepare('SELECT is_resolved FROM campaign_card_statuses WHERE campaign_id = ? AND card_code = ?')
      .bind(session.campaignId, cardCode).first<{ is_resolved: number }>()
    : null;
  if (progress?.is_resolved === 1) {
    return error(c, 409, 'CARD_ALREADY_RESOLVED', cardCode + ' 已完成／不再使用；如需修正紀錄，請先在卡片清單中將它更正為未完成。');
  }

  const before = await c.env.DB.prepare('SELECT * FROM campaign_map_card_placements WHERE campaign_id = ? AND card_code = ?')
    .bind(session.campaignId, cardCode).first();
  const activeToken = trackedCard && requestedStatus === 'RESOLVED'
    ? await c.env.DB.prepare(`
      SELECT token.id, token.token_code
      FROM campaign_card_time_tokens token
      JOIN campaign_cards_progress card ON card.id = token.story_card_progress_id
      WHERE token.campaign_id = ? AND card.card_code = ? AND token.status = 'ACTIVE'
    `).bind(session.campaignId, cardCode).first<{ id: number; token_code: string }>()
    : null;
  const statements: D1PreparedStatement[] = [];

  if (trackedCard && requestedStatus === 'RESOLVED') {
    statements.push(c.env.DB.prepare(`
      INSERT INTO campaign_card_statuses
        (campaign_id, card_code, is_resolved, resolved_at, updated_by_player)
      SELECT ?, ?, 1, datetime('now'), ?
      WHERE EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
      ON CONFLICT(campaign_id, card_code) DO UPDATE SET
        is_resolved = 1, resolved_at = COALESCE(campaign_card_statuses.resolved_at, datetime('now')),
        updated_by_player = excluded.updated_by_player, updated_at = datetime('now')
    `).bind(session.campaignId, cardCode, session.playerNumber, session.campaignId, expectedVersion));
    if (activeToken) {
      statements.push(
        guardedWagonLog(c.env.DB, session, expectedVersion, activeToken.id, cardCode, activeToken.token_code),
        c.env.DB.prepare(`
          UPDATE campaign_card_time_tokens
          SET status = 'REMOVED', removed_at = datetime('now'), removed_by_player = ?
          WHERE id = ? AND campaign_id = ? AND status = 'ACTIVE'
            AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
        `).bind(session.playerNumber, activeToken.id, session.campaignId, session.campaignId, expectedVersion),
        c.env.DB.prepare(`
          UPDATE campaign_cards_progress SET status = 'RESOLVED', updated_at = datetime('now')
          WHERE campaign_id = ? AND card_code = ?
            AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
        `).bind(session.campaignId, cardCode, session.campaignId, expectedVersion),
      );
    }
  }

  statements.push(
    c.env.DB.prepare(`
      INSERT INTO campaign_map_card_placements
        (campaign_id, card_code, card_type, status, location_type, location_code, notes, is_in_town_deck)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
      ON CONFLICT(campaign_id, card_code) DO UPDATE SET
        card_type = excluded.card_type, status = excluded.status,
        location_type = excluded.location_type, location_code = excluded.location_code,
        notes = excluded.notes, is_in_town_deck = excluded.is_in_town_deck, updated_at = datetime('now')
    `).bind(session.campaignId, cardCode, type, requestedStatus, locationType, locationCode, notes, isInTownDeck ? 1 : 0, session.campaignId, expectedVersion),
    guardedMapLog(
      c.env.DB, session, expectedVersion, before ? 'MOVE_OR_UPDATE_CARD' : 'PLACE_CARD',
      'MAP_CARD', cardCode, before,
      { cardCode, type, status: requestedStatus, locationType, locationCode, notes, isInTownDeck, removedTimeToken: Boolean(activeToken) },
    ),
  );
  const updated = await runMapBatch(c, session, expectedVersion, statements);
  if (!updated) return mapConflict(c,session,expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) }, before ? 200 : 201);
}

export async function updateCampaignCardProgress(c: Ctx) {
  const session = await requireCampaignSession(c);
  const cardCode = (c.req.param('cardCode') ?? '').trim().toUpperCase();
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const isResolved = input?.isResolved;
  const type = cardType(cardCode);
  if ((type !== 'STORY' && type !== 'MISSION') || typeof isResolved !== 'boolean') {
    return error(c, 400, 'INVALID_CARD_PROGRESS', '請選擇有效的 S／J 卡片與完成狀態。');
  }
  const catalogCard = await c.env.DB.prepare(
    'SELECT card_code FROM campaign_card_catalog WHERE card_code = ? AND card_type = ?',
  ).bind(cardCode, type).first<{ card_code: string }>();
  if (!catalogCard) return error(c, 404, 'CARD_NOT_FOUND', '這個 S／J 卡號不在已知卡片清單中。');

  const before = await c.env.DB.prepare(
    'SELECT is_resolved, resolved_at FROM campaign_card_statuses WHERE campaign_id = ? AND card_code = ?',
  ).bind(session.campaignId, cardCode).first<{ is_resolved: number; resolved_at: string | null }>();
  if (Boolean(before?.is_resolved) === isResolved) return c.json({ data: await loadMap(c.env.DB, session) });

  const activeToken = isResolved
    ? await c.env.DB.prepare(`
      SELECT token.id, token.token_code
      FROM campaign_card_time_tokens token
      JOIN campaign_cards_progress card ON card.id = token.story_card_progress_id
      WHERE token.campaign_id = ? AND card.card_code = ? AND token.status = 'ACTIVE'
    `).bind(session.campaignId, cardCode).first<{ id: number; token_code: string }>()
    : null;
  const statements: D1PreparedStatement[] = [
    c.env.DB.prepare(`
      INSERT INTO campaign_card_statuses
        (campaign_id, card_code, is_resolved, resolved_at, updated_by_player)
      SELECT ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END, ?
      WHERE EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
      ON CONFLICT(campaign_id, card_code) DO UPDATE SET
        is_resolved = excluded.is_resolved, resolved_at = excluded.resolved_at,
        updated_by_player = excluded.updated_by_player, updated_at = datetime('now')
    `).bind(session.campaignId, cardCode, isResolved ? 1 : 0, isResolved ? 1 : 0, session.playerNumber, session.campaignId, expectedVersion),
    c.env.DB.prepare(`
      UPDATE campaign_map_card_placements
      SET status = ?, updated_at = datetime('now')
      WHERE campaign_id = ? AND card_code = ?
        AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
    `).bind(isResolved ? 'RESOLVED' : 'PENDING', session.campaignId, cardCode, session.campaignId, expectedVersion),
  ];
  if (activeToken) {
    statements.push(
      guardedWagonLog(c.env.DB, session, expectedVersion, activeToken.id, cardCode, activeToken.token_code),
      c.env.DB.prepare(`
        UPDATE campaign_card_time_tokens
        SET status = 'REMOVED', removed_at = datetime('now'), removed_by_player = ?
        WHERE id = ? AND campaign_id = ? AND status = 'ACTIVE'
          AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
      `).bind(session.playerNumber, activeToken.id, session.campaignId, session.campaignId, expectedVersion),
      c.env.DB.prepare(`
        UPDATE campaign_cards_progress SET status = 'RESOLVED', updated_at = datetime('now')
        WHERE campaign_id = ? AND card_code = ?
          AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
      `).bind(session.campaignId, cardCode, session.campaignId, expectedVersion),
    );
  }
  statements.push(guardedMapLog(
    c.env.DB, session, expectedVersion, isResolved ? 'RESOLVE_CARD' : 'REOPEN_CARD',
    'CAMPAIGN_CARD', cardCode, before ?? { is_resolved: 0, resolved_at: null },
    { isResolved, removedTimeToken: Boolean(activeToken) },
  ));
  const updated = await runMapBatch(c, session, expectedVersion, statements);
  if (!updated) return mapConflict(c,session,expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function removeMapCard(c: Ctx) {
  const session = await requireCampaignSession(c);
  const id = Number(c.req.param('placementId'));
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const before = await c.env.DB.prepare('SELECT * FROM campaign_map_card_placements WHERE id = ? AND campaign_id = ?')
    .bind(id, session.campaignId).first();
  if (!before) return error(c, 404, 'MAP_CARD_NOT_FOUND', '找不到這筆卡片紀錄。');
  const updated = await runMapBatch(c, session, expectedVersion, [
    c.env.DB.prepare(`
      DELETE FROM campaign_map_card_placements
      WHERE id = ? AND campaign_id = ?
        AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
    `).bind(id, session.campaignId, session.campaignId, expectedVersion),
    guardedMapLog(c.env.DB, session, expectedVersion, 'REMOVE_CARD', 'MAP_CARD', String(id), before, null),
  ]);
  if (!updated) return mapConflict(c,session,expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function updateLocationCard(c: Ctx) {
  const session = await requireCampaignSession(c);
  const locationCode = (c.req.param('locationCode') ?? '').toUpperCase();
  if (!validLocationCode(locationCode)) return error(c, 404, 'LOCATION_CARD_NOT_FOUND', '找不到這張地點卡。');
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const isRevealed = input?.isRevealed;
  const face = isRevealed === true ? 'FRONT' : 'BACK';
  const resourceNotes = typeof input?.resourceNotes === 'string' ? input.resourceNotes.trim() : '';
  const notes = typeof input?.notes === 'string' ? input.notes.trim() : '';
  if (typeof isRevealed !== 'boolean') return error(c, 400, 'INVALID_LOCATION_CARD', '地點卡狀態不正確。');
  if (resourceNotes.length > 1000 || notes.length > 2000) return error(c, 400, 'LOCATION_NOTES_TOO_LONG', '資源紀錄或備註內容過長。');
  const before = await c.env.DB.prepare('SELECT is_revealed, face, resource_notes, notes FROM campaign_location_cards WHERE campaign_id = ? AND location_code = ?')
    .bind(session.campaignId, locationCode).first();
  const updated = await runMapBatch(c, session, expectedVersion, [
    c.env.DB.prepare(`
      UPDATE campaign_location_cards
      SET is_revealed = ?, face = ?, resource_notes = ?, notes = ?, updated_at = datetime('now')
      WHERE campaign_id = ? AND location_code = ?
        AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ? AND version = ?)
    `).bind(isRevealed ? 1 : 0, face, resourceNotes, notes, session.campaignId, locationCode, session.campaignId, expectedVersion),
    guardedMapLog(c.env.DB, session, expectedVersion, 'UPDATE_LOCATION_CARD', 'LOCATION_CARD', locationCode, before, { isRevealed, face, resourceNotes, notes }),
  ]);
  if (!updated) return mapConflict(c,session,expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function updateMapEventNotes(c: Ctx) {
  const session = await requireCampaignSession(c);
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const roadEventNotes = typeof input?.roadEventNotes === 'string' ? input.roadEventNotes.trim() : '';
  const townEventNotes = typeof input?.townEventNotes === 'string' ? input.townEventNotes.trim() : '';
  if (roadEventNotes.length > 4000 || townEventNotes.length > 4000) {
    return error(c, 400, 'EVENT_NOTES_TOO_LONG', '事件紀錄不可超過 4000 字。');
  }
  const before = await c.env.DB.prepare('SELECT road_event_notes, town_event_notes FROM campaign_maps WHERE campaign_id = ?')
    .bind(session.campaignId).first();
  const finalUpdate = c.env.DB.prepare(`
    UPDATE campaign_maps
    SET road_event_notes = ?, town_event_notes = ?,
        version = version + 1, updated_by_player = ?, updated_at = datetime('now')
    WHERE campaign_id = ? AND version = ?
  `).bind(roadEventNotes, townEventNotes, session.playerNumber, session.campaignId, expectedVersion);
  const updated = await runMapBatch(c, session, expectedVersion, [
    guardedMapLog(c.env.DB, session, expectedVersion, 'UPDATE_EVENT_NOTES', 'MAP', session.campaignId, before, { roadEventNotes, townEventNotes }),
  ], finalUpdate);
  if (!updated) return mapConflict(c,session,expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}
