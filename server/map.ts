import type { BatchItem } from 'drizzle-orm/batch';
import type { Context } from 'hono';
import { eq, and, sql } from 'drizzle-orm';
import type { AuthSession } from '../shared/types';
import { requireCampaignSession } from './auth';
import { getDb, runD1Batch } from './db';
import {
  campaignMaps,
  campaignMapTiles,
  campaignLocationCards,
  campaignMapCardPlacements,
  campaignCardStatuses,
  campaignCardsProgress,
  campaignCardTimeTokens,
  campaignCardCatalog,
} from './db/schema/index';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;

function error(c: Ctx, status: 400 | 404 | 409, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

async function mapConflict(c: Ctx, session: AuthSession, expectedVersion: number) {
  const latest = await loadMap(c.env.DB, session);
  return c.json({
    error: {
      code: 'MAP_VERSION_CONFLICT',
      message: '地圖資料已被其他玩家更新。',
      conflict: {
        scope: 'MAP',
        expectedVersion: Number.isInteger(expectedVersion) ? expectedVersion : null,
        currentVersion: latest.version,
        latest,
      },
    },
  }, 409);
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
async function ensureMap(d1: D1Database, campaignId: string) {
  const db = getDb(d1);
  await db
    .insert(campaignMaps)
    .values({ campaignId })
    .onConflictDoNothing();

  // [原因備註 - 避開 D1_ERROR: too many SQL variables]:
  // 過去在讀取地圖時，若直接無條件執行 20 筆地圖板塊與 14 筆地點卡的多列 INSERT (values(array))，
  // Drizzle 會為每筆資料所有欄位產生 ? 參數占位符，單一語句累積上百個變數，會超過 SQLite/D1 的 SQLITE_MAX_VARIABLE_NUMBER 上限。
  // 1. 先透過輕量 COUNT 檢查是否已初始化，若已存在則直接返回（避免每次 GET API 都重複執行大型 INSERT）。
  // 2. 若真需補齊初始化，改以 5 筆為一個 chunk 分批寫入，徹底確保單一 SQL 語句變數不超標。
  const [existingTiles, existingLocations] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(campaignMapTiles).where(eq(campaignMapTiles.campaignId, campaignId)),
    db.select({ count: sql<number>`count(*)` }).from(campaignLocationCards).where(eq(campaignLocationCards.campaignId, campaignId)),
  ]);

  const tileCount = Number(existingTiles[0]?.count ?? 0);
  const locationCount = Number(existingLocations[0]?.count ?? 0);

  if (tileCount >= 20 && locationCount >= 14) {
    return;
  }

  const tileValues = Array.from({ length: 20 }, (_, index) => {
    const number = index + 1;
    return {
      campaignId,
      mapCode: `M${String(number).padStart(2, '0')}`,
      rowIndex: Math.floor(index / 4) + 1,
      columnIndex: (index % 4) + 1,
    };
  });

  const locationValues = Array.from({ length: 14 }, (_, index) => ({
    campaignId,
    locationCode: `L${String(index + 1).padStart(2, '0')}`,
  }));

  // 分塊插入（每次最多 5 筆），避免多列插入時綁定參數超過 SQLite 變數上限
  if (tileCount < 20) {
    for (let i = 0; i < tileValues.length; i += 5) {
      const chunk = tileValues.slice(i, i + 5);
      await db.insert(campaignMapTiles).values(chunk).onConflictDoNothing();
    }
  }

  if (locationCount < 14) {
    for (let i = 0; i < locationValues.length; i += 5) {
      const chunk = locationValues.slice(i, i + 5);
      await db.insert(campaignLocationCards).values(chunk).onConflictDoNothing();
    }
  }
}
async function loadMap(d1: D1Database, session: AuthSession) {
  await ensureMap(d1, session.campaignId);
  const db = getDb(d1);

  const [map] = await db
    .select({
      currentLocationType: campaignMaps.currentLocationType,
      currentLocationCode: campaignMaps.currentLocationCode,
      roadEventNotes: campaignMaps.roadEventNotes,
      townEventNotes: campaignMaps.townEventNotes,
      version: campaignMaps.version,
    })
    .from(campaignMaps)
    .where(eq(campaignMaps.campaignId, session.campaignId));

  const tiles = await db
    .select({
      mapCode: campaignMapTiles.mapCode,
      rowIndex: campaignMapTiles.rowIndex,
      columnIndex: campaignMapTiles.columnIndex,
      isRevealed: campaignMapTiles.isRevealed,
      face: campaignMapTiles.face,
      resourceNotes: campaignMapTiles.resourceNotes,
      notes: campaignMapTiles.notes,
    })
    .from(campaignMapTiles)
    .where(eq(campaignMapTiles.campaignId, session.campaignId))
    .orderBy(campaignMapTiles.rowIndex, campaignMapTiles.columnIndex);

  const locations = await db
    .select({
      locationCode: campaignLocationCards.locationCode,
      isRevealed: campaignLocationCards.isRevealed,
      face: campaignLocationCards.face,
      resourceNotes: campaignLocationCards.resourceNotes,
      notes: campaignLocationCards.notes,
    })
    .from(campaignLocationCards)
    .where(eq(campaignLocationCards.campaignId, session.campaignId))
    .orderBy(campaignLocationCards.locationCode);

  const cards = await db
    .select({
      id: campaignMapCardPlacements.id,
      cardCode: campaignMapCardPlacements.cardCode,
      cardType: campaignMapCardPlacements.cardType,
      status: sql<string>`
        CASE
          WHEN ${campaignMapCardPlacements.cardType} IN ('STORY', 'MISSION') AND COALESCE(${campaignCardStatuses.isResolved}, 0) = 1 THEN 'RESOLVED'
          ELSE ${campaignMapCardPlacements.status}
        END
      `.as('status'),
      locationType: campaignMapCardPlacements.locationType,
      locationCode: campaignMapCardPlacements.locationCode,
      notes: campaignMapCardPlacements.notes,
      isInTownDeck: campaignMapCardPlacements.isInTownDeck,
      tokenCode: campaignCardTimeTokens.tokenCode,
      unlockAtDay: campaignCardTimeTokens.unlockAtDay,
    })
    .from(campaignMapCardPlacements)
    .leftJoin(
      campaignCardStatuses,
      and(
        eq(campaignCardStatuses.campaignId, campaignMapCardPlacements.campaignId),
        eq(campaignCardStatuses.cardCode, campaignMapCardPlacements.cardCode),
      ),
    )
    .leftJoin(
      campaignCardsProgress,
      and(
        eq(campaignCardsProgress.campaignId, campaignMapCardPlacements.campaignId),
        eq(campaignCardsProgress.cardCode, campaignMapCardPlacements.cardCode),
      ),
    )
    .leftJoin(
      campaignCardTimeTokens,
      and(
        eq(campaignCardTimeTokens.storyCardProgressId, campaignCardsProgress.id),
        eq(campaignCardTimeTokens.status, 'ACTIVE'),
      ),
    )
    .where(eq(campaignMapCardPlacements.campaignId, session.campaignId))
    .orderBy(campaignMapCardPlacements.locationCode, campaignMapCardPlacements.cardCode);

  const cardProgress = await db
    .select({
      cardCode: campaignCardCatalog.cardCode,
      cardType: campaignCardCatalog.cardType,
      edition: campaignCardCatalog.edition,
      isResolved: sql<number>`COALESCE(${campaignCardStatuses.isResolved}, 0)`.as('is_resolved'),
      locationType: campaignMapCardPlacements.locationType,
      locationCode: campaignMapCardPlacements.locationCode,
      tokenCode: campaignCardTimeTokens.tokenCode,
      unlockAtDay: campaignCardTimeTokens.unlockAtDay,
    })
    .from(campaignCardCatalog)
    .leftJoin(
      campaignCardStatuses,
      and(
        eq(campaignCardStatuses.cardCode, campaignCardCatalog.cardCode),
        eq(campaignCardStatuses.campaignId, session.campaignId),
      ),
    )
    .leftJoin(
      campaignMapCardPlacements,
      and(
        eq(campaignMapCardPlacements.cardCode, campaignCardCatalog.cardCode),
        eq(campaignMapCardPlacements.campaignId, session.campaignId),
      ),
    )
    .leftJoin(
      campaignCardsProgress,
      and(
        eq(campaignCardsProgress.cardCode, campaignCardCatalog.cardCode),
        eq(campaignCardsProgress.campaignId, session.campaignId),
      ),
    )
    .leftJoin(
      campaignCardTimeTokens,
      and(
        eq(campaignCardTimeTokens.storyCardProgressId, campaignCardsProgress.id),
        eq(campaignCardTimeTokens.status, 'ACTIVE'),
      ),
    )
    .orderBy(campaignCardCatalog.sortOrder);

  return {
    campaignId: session.campaignId,
    version: map?.version ?? 1,
    currentLocationType: map?.currentLocationType ?? null,
    currentLocationCode: map?.currentLocationCode ?? null,
    currentMapCode: map?.currentLocationType === 'MAP'
      ? map.currentLocationCode
      : parentMapCodeForLocation(map?.currentLocationCode ?? null),
    roadEventNotes: map?.roadEventNotes ?? '',
    townEventNotes: map?.townEventNotes ?? '',
    tiles: tiles.map(row => ({
      mapCode: row.mapCode,
      rowIndex: row.rowIndex,
      columnIndex: row.columnIndex,
      isRevealed: row.isRevealed === true,
      face: row.face as 'FRONT' | 'BACK',
      resourceNotes: row.resourceNotes,
      notes: row.notes,
    })),
    locations: locations.map(row => ({
      locationCode: row.locationCode,
      isRevealed: row.isRevealed === true,
      face: row.face as 'FRONT' | 'BACK',
      resourceNotes: row.resourceNotes,
      notes: row.notes,
    })),
    cards: cards.map(row => ({
      id: row.id,
      cardCode: row.cardCode,
      cardType: row.cardType as 'STORY' | 'MISSION' | 'FEATURE',
      status: row.status as 'PENDING' | 'RESOLVED',
      locationType: row.locationType as 'MAP' | 'LOCATION',
      locationCode: row.locationCode,
      notes: row.notes,
      isInTownDeck: row.isInTownDeck === true,
      timeToken: row.tokenCode ? { tokenCode: row.tokenCode as 'A' | 'B' | 'C' | 'D', unlockAtDay: row.unlockAtDay } : null,
    })),
    cardProgress: cardProgress.map(row => ({
      cardCode: row.cardCode,
      cardType: row.cardType as 'STORY' | 'MISSION',
      edition: row.edition as 'CORE' | 'EXPANSION',
      isResolved: Boolean(row.isResolved),
      locationType: row.locationType as 'MAP' | 'LOCATION' | null,
      locationCode: row.locationCode,
      timeToken: row.tokenCode ? { tokenCode: row.tokenCode as 'A' | 'B' | 'C' | 'D', unlockAtDay: row.unlockAtDay } : null,
    })),
  };
}

// [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在地圖預期版本相符時才寫入活動日誌
function guardedMapLog(
  db: ReturnType<typeof getDb>,
  session: AuthSession,
  expectedVersion: number,
  action: string,
  entity: string,
  id: string,
  before: unknown,
  after: unknown,
) {
  return db.run(sql`
    INSERT INTO map_activity_logs
      (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json)
    SELECT ${session.campaignId}, ${session.playerNumber}, ${action}, ${entity}, ${id}, ${JSON.stringify(before)}, ${JSON.stringify(after)}
    WHERE EXISTS (
      SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion}
    )
  `);
}

// [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在地圖預期版本相符時才寫入馬車時間標記移除日誌
function guardedWagonLog(
  db: ReturnType<typeof getDb>,
  session: AuthSession,
  expectedVersion: number,
  tokenId: number,
  cardCode: string,
  tokenCode: string,
) {
  return db.run(sql`
    INSERT INTO wagon_activity_logs
      (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json)
    SELECT ${session.campaignId}, ${session.playerNumber}, 'REMOVE_TIME_TOKEN_ON_CARD_RESOLUTION', 'TIME_TOKEN', ${String(tokenId)}, ${JSON.stringify({ status: 'ACTIVE', storyCardCode: cardCode, tokenCode })}, ${JSON.stringify({ status: 'REMOVED', storyCardCode: cardCode, reason: 'CARD_RESOLVED' })}
    WHERE EXISTS (
      SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion}
    )
  `);
}

async function runMapBatch(
  c: Ctx,
  session: AuthSession,
  expectedVersion: number,
  statements: BatchItem<'sqlite'>[],
  finalMapUpdate?: BatchItem<'sqlite'>,
) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return false;
  await ensureMap(c.env.DB, session.campaignId);
  const db = getDb(c.env.DB);
  const versionUpdate = finalMapUpdate ?? db
    .update(campaignMaps)
    .set({
      version: sql`${campaignMaps.version} + 1`,
      updatedByPlayer: session.playerNumber,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(
      and(
        eq(campaignMaps.campaignId, session.campaignId),
        eq(campaignMaps.version, expectedVersion),
      ),
    );

  const results = await runD1Batch(c.env.DB, [...statements, versionUpdate]);
  return Boolean(results[results.length - 1]?.meta.changes);
}

export async function getCampaignMap(c: Ctx) {
  const session = await requireCampaignSession(c);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function updateMapTile(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
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
  const db = getDb(c.env.DB);
  const [before] = await db
    .select({
      isRevealed: campaignMapTiles.isRevealed,
      face: campaignMapTiles.face,
      resourceNotes: campaignMapTiles.resourceNotes,
      notes: campaignMapTiles.notes,
    })
    .from(campaignMapTiles)
    .where(and(eq(campaignMapTiles.campaignId, session.campaignId), eq(campaignMapTiles.mapCode, mapCode)));

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才更新地圖板塊
  const updateTileStmt = db.run(sql`
    UPDATE campaign_map_tiles
    SET is_revealed = ${isRevealed ? 1 : 0}, face = ${face}, resource_notes = ${resourceNotes}, notes = ${notes}, updated_at = datetime('now')
    WHERE campaign_id = ${session.campaignId} AND map_code = ${mapCode}
      AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
  `);

  const updated = await runMapBatch(c, session, expectedVersion, [
    updateTileStmt,
    guardedMapLog(db, session, expectedVersion, 'UPDATE_MAP_TILE', 'MAP_TILE', mapCode, before, { isRevealed, face, resourceNotes, notes }),
  ]);
  if (!updated) return mapConflict(c, session, expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function updateMapPosition(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
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
  const db = getDb(c.env.DB);
  const [before] = await db
    .select({
      currentLocationType: campaignMaps.currentLocationType,
      currentLocationCode: campaignMaps.currentLocationCode,
    })
    .from(campaignMaps)
    .where(eq(campaignMaps.campaignId, session.campaignId));

  const finalUpdate = db
    .update(campaignMaps)
    .set({
      currentLocationType: locationType,
      currentLocationCode: locationCode,
      version: sql`${campaignMaps.version} + 1`,
      updatedByPlayer: session.playerNumber,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(
      and(
        eq(campaignMaps.campaignId, session.campaignId),
        eq(campaignMaps.version, expectedVersion),
      ),
    );

  const updated = await runMapBatch(c, session, expectedVersion, [
    guardedMapLog(db, session, expectedVersion, 'SET_HUNTER_LOCATION', 'MAP', session.campaignId, before, { locationType, locationCode }),
  ], finalUpdate);
  if (!updated) return mapConflict(c, session, expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function upsertMapCard(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
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

  const db = getDb(c.env.DB);
  let trackedCard: { cardCode: string } | null = null;
  if (type === 'STORY' || type === 'MISSION') {
    const [found] = await db
      .select({ cardCode: campaignCardCatalog.cardCode })
      .from(campaignCardCatalog)
      .where(and(eq(campaignCardCatalog.cardCode, cardCode), eq(campaignCardCatalog.cardType, type)));
    trackedCard = found ?? null;
    if (!trackedCard) {
      return error(c, 400, 'INVALID_CARD_CODE', '這個 S／J 卡號不在已知卡片清單中。');
    }
  }

  if (trackedCard) {
    const [progress] = await db
      .select({ isResolved: campaignCardStatuses.isResolved })
      .from(campaignCardStatuses)
      .where(and(eq(campaignCardStatuses.campaignId, session.campaignId), eq(campaignCardStatuses.cardCode, cardCode)));
    if (progress?.isResolved === true) {
      return error(c, 409, 'CARD_ALREADY_RESOLVED', cardCode + ' 已完成／不再使用；如需修正紀錄，請先在卡片清單中將它更正為未完成。');
    }
  }

  const [before] = await db
    .select()
    .from(campaignMapCardPlacements)
    .where(and(eq(campaignMapCardPlacements.campaignId, session.campaignId), eq(campaignMapCardPlacements.cardCode, cardCode)));

  let activeToken: { id: number; tokenCode: string } | null = null;
  if (trackedCard && requestedStatus === 'RESOLVED') {
    const [token] = await db
      .select({
        id: campaignCardTimeTokens.id,
        tokenCode: campaignCardTimeTokens.tokenCode,
      })
      .from(campaignCardTimeTokens)
      .innerJoin(campaignCardsProgress, eq(campaignCardsProgress.id, campaignCardTimeTokens.storyCardProgressId))
      .where(
        and(
          eq(campaignCardTimeTokens.campaignId, session.campaignId),
          eq(campaignCardsProgress.cardCode, cardCode),
          eq(campaignCardTimeTokens.status, 'ACTIVE'),
        ),
      );
    activeToken = token ?? null;
  }
  const statements: BatchItem<'sqlite'>[] = [];

  if (trackedCard && requestedStatus === 'RESOLVED') {
    // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才更新卡片完成狀態
    statements.push(db.run(sql`
      INSERT INTO campaign_card_statuses
        (campaign_id, card_code, is_resolved, resolved_at, updated_by_player)
      SELECT ${session.campaignId}, ${cardCode}, 1, datetime('now'), ${session.playerNumber}
      WHERE EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
      ON CONFLICT(campaign_id, card_code) DO UPDATE SET
        is_resolved = 1, resolved_at = COALESCE(campaign_card_statuses.resolved_at, datetime('now')),
        updated_by_player = excluded.updated_by_player, updated_at = datetime('now')
    `));
    if (activeToken) {
      // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才更新 Token 與進度
      statements.push(
        guardedWagonLog(db, session, expectedVersion, activeToken.id, cardCode, activeToken.tokenCode),
        db.run(sql`
          UPDATE campaign_card_time_tokens
          SET status = 'REMOVED', removed_at = datetime('now'), removed_by_player = ${session.playerNumber}
          WHERE id = ${activeToken.id} AND campaign_id = ${session.campaignId} AND status = 'ACTIVE'
            AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
        `),
        db.run(sql`
          UPDATE campaign_cards_progress SET status = 'RESOLVED', updated_at = datetime('now')
          WHERE campaign_id = ${session.campaignId} AND card_code = ${cardCode}
            AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
        `),
      );
    }
  }

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才寫入卡片放置與日誌
  statements.push(
    db.run(sql`
      INSERT INTO campaign_map_card_placements
        (campaign_id, card_code, card_type, status, location_type, location_code, notes, is_in_town_deck)
      SELECT ${session.campaignId}, ${cardCode}, ${type}, ${requestedStatus}, ${locationType}, ${locationCode}, ${notes}, ${isInTownDeck ? 1 : 0}
      WHERE EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
      ON CONFLICT(campaign_id, card_code) DO UPDATE SET
        card_type = excluded.card_type, status = excluded.status,
        location_type = excluded.location_type, location_code = excluded.location_code,
        notes = excluded.notes, is_in_town_deck = excluded.is_in_town_deck, updated_at = datetime('now')
    `),
    guardedMapLog(
      db, session, expectedVersion, before ? 'MOVE_OR_UPDATE_CARD' : 'PLACE_CARD',
      'MAP_CARD', cardCode, before,
      { cardCode, type, status: requestedStatus, locationType, locationCode, notes, isInTownDeck, removedTimeToken: Boolean(activeToken) },
    ),
  );
  const updated = await runMapBatch(c, session, expectedVersion, statements);
  if (!updated) return mapConflict(c, session, expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) }, before ? 200 : 201);
}

export async function updateCampaignCardProgress(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const cardCode = (c.req.param('cardCode') ?? '').trim().toUpperCase();
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const isResolved = input?.isResolved;
  const type = cardType(cardCode);
  if ((type !== 'STORY' && type !== 'MISSION') || typeof isResolved !== 'boolean') {
    return error(c, 400, 'INVALID_CARD_PROGRESS', '請選擇有效的 S／J 卡片與完成狀態。');
  }
  const db = getDb(c.env.DB);
  const [catalogCard] = await db
    .select({ cardCode: campaignCardCatalog.cardCode })
    .from(campaignCardCatalog)
    .where(and(eq(campaignCardCatalog.cardCode, cardCode), eq(campaignCardCatalog.cardType, type)));
  if (!catalogCard) return error(c, 404, 'CARD_NOT_FOUND', '這個 S／J 卡號不在已知卡片清單中。');

  const [before] = await db
    .select({
      isResolved: campaignCardStatuses.isResolved,
      resolvedAt: campaignCardStatuses.resolvedAt,
    })
    .from(campaignCardStatuses)
    .where(and(eq(campaignCardStatuses.campaignId, session.campaignId), eq(campaignCardStatuses.cardCode, cardCode)));
  if (Boolean(before?.isResolved) === isResolved) return c.json({ data: await loadMap(c.env.DB, session) });

  let activeToken: { id: number; tokenCode: string } | null = null;
  if (isResolved) {
    const [token] = await db
      .select({
        id: campaignCardTimeTokens.id,
        tokenCode: campaignCardTimeTokens.tokenCode,
      })
      .from(campaignCardTimeTokens)
      .innerJoin(campaignCardsProgress, eq(campaignCardsProgress.id, campaignCardTimeTokens.storyCardProgressId))
      .where(
        and(
          eq(campaignCardTimeTokens.campaignId, session.campaignId),
          eq(campaignCardsProgress.cardCode, cardCode),
          eq(campaignCardTimeTokens.status, 'ACTIVE'),
        ),
      );
    activeToken = token ?? null;
  }
  // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才更新卡片狀態與放置卡狀態
  const statements: BatchItem<'sqlite'>[] = [
    db.run(sql`
      INSERT INTO campaign_card_statuses
        (campaign_id, card_code, is_resolved, resolved_at, updated_by_player)
      SELECT ${session.campaignId}, ${cardCode}, ${isResolved ? 1 : 0}, CASE WHEN ${isResolved ? 1 : 0} = 1 THEN datetime('now') ELSE NULL END, ${session.playerNumber}
      WHERE EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
      ON CONFLICT(campaign_id, card_code) DO UPDATE SET
        is_resolved = excluded.is_resolved, resolved_at = excluded.resolved_at,
        updated_by_player = excluded.updated_by_player, updated_at = datetime('now')
    `),
    db.run(sql`
      UPDATE campaign_map_card_placements
      SET status = ${isResolved ? 'RESOLVED' : 'PENDING'}, updated_at = datetime('now')
      WHERE campaign_id = ${session.campaignId} AND card_code = ${cardCode}
        AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
    `),
  ];
  if (activeToken) {
    // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才移除時間標記並更新進度
    statements.push(
      guardedWagonLog(db, session, expectedVersion, activeToken.id, cardCode, activeToken.tokenCode),
      db.run(sql`
        UPDATE campaign_card_time_tokens
        SET status = 'REMOVED', removed_at = datetime('now'), removed_by_player = ${session.playerNumber}
        WHERE id = ${activeToken.id} AND campaign_id = ${session.campaignId} AND status = 'ACTIVE'
          AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
      `),
      db.run(sql`
        UPDATE campaign_cards_progress SET status = 'RESOLVED', updated_at = datetime('now')
        WHERE campaign_id = ${session.campaignId} AND card_code = ${cardCode}
          AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
      `),
    );
  }
  statements.push(guardedMapLog(
    db, session, expectedVersion, isResolved ? 'RESOLVE_CARD' : 'REOPEN_CARD',
    'CAMPAIGN_CARD', cardCode, before ?? { is_resolved: 0, resolved_at: null },
    { isResolved, removedTimeToken: Boolean(activeToken) },
  ));
  const updated = await runMapBatch(c, session, expectedVersion, statements);
  if (!updated) return mapConflict(c, session, expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function removeMapCard(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const id = Number(c.req.param('placementId'));
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const db = getDb(c.env.DB);
  const [before] = await db
    .select()
    .from(campaignMapCardPlacements)
    .where(and(eq(campaignMapCardPlacements.id, id), eq(campaignMapCardPlacements.campaignId, session.campaignId)));
  if (!before) return error(c, 404, 'MAP_CARD_NOT_FOUND', '找不到這筆卡片紀錄。');

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才刪除放置卡
  const deleteStmt = db.run(sql`
    DELETE FROM campaign_map_card_placements
    WHERE id = ${id} AND campaign_id = ${session.campaignId}
      AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
  `);

  const updated = await runMapBatch(c, session, expectedVersion, [
    deleteStmt,
    guardedMapLog(db, session, expectedVersion, 'REMOVE_CARD', 'MAP_CARD', String(id), before, null),
  ]);
  if (!updated) return mapConflict(c, session, expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function updateLocationCard(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
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
  const db = getDb(c.env.DB);
  const [before] = await db
    .select({
      isRevealed: campaignLocationCards.isRevealed,
      face: campaignLocationCards.face,
      resourceNotes: campaignLocationCards.resourceNotes,
      notes: campaignLocationCards.notes,
    })
    .from(campaignLocationCards)
    .where(and(eq(campaignLocationCards.campaignId, session.campaignId), eq(campaignLocationCards.locationCode, locationCode)));

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才更新地點卡
  const updateLocationStmt = db.run(sql`
    UPDATE campaign_location_cards
    SET is_revealed = ${isRevealed ? 1 : 0}, face = ${face}, resource_notes = ${resourceNotes}, notes = ${notes}, updated_at = datetime('now')
    WHERE campaign_id = ${session.campaignId} AND location_code = ${locationCode}
      AND EXISTS (SELECT 1 FROM campaign_maps WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion})
  `);

  const updated = await runMapBatch(c, session, expectedVersion, [
    updateLocationStmt,
    guardedMapLog(db, session, expectedVersion, 'UPDATE_LOCATION_CARD', 'LOCATION_CARD', locationCode, before, { isRevealed, face, resourceNotes, notes }),
  ]);
  if (!updated) return mapConflict(c, session, expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}

export async function updateMapEventNotes(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const input = await body(c);
  const expectedVersion = Number(input?.expectedVersion);
  const roadEventNotes = typeof input?.roadEventNotes === 'string' ? input.roadEventNotes.trim() : '';
  const townEventNotes = typeof input?.townEventNotes === 'string' ? input.townEventNotes.trim() : '';
  if (roadEventNotes.length > 4000 || townEventNotes.length > 4000) {
    return error(c, 400, 'EVENT_NOTES_TOO_LONG', '事件紀錄不可超過 4000 字。');
  }
  const db = getDb(c.env.DB);
  const [before] = await db
    .select({
      roadEventNotes: campaignMaps.roadEventNotes,
      townEventNotes: campaignMaps.townEventNotes,
    })
    .from(campaignMaps)
    .where(eq(campaignMaps.campaignId, session.campaignId));

  const finalUpdate = db
    .update(campaignMaps)
    .set({
      roadEventNotes,
      townEventNotes,
      version: sql`${campaignMaps.version} + 1`,
      updatedByPlayer: session.playerNumber,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(
      and(
        eq(campaignMaps.campaignId, session.campaignId),
        eq(campaignMaps.version, expectedVersion),
      ),
    );

  const updated = await runMapBatch(c, session, expectedVersion, [
    guardedMapLog(db, session, expectedVersion, 'UPDATE_EVENT_NOTES', 'MAP', session.campaignId, before, { roadEventNotes, townEventNotes }),
  ], finalUpdate);
  if (!updated) return mapConflict(c, session, expectedVersion);
  return c.json({ data: await loadMap(c.env.DB, session) });
}
