import type { Context } from 'hono';
import { eq, and, sql, inArray, isNull } from 'drizzle-orm';
import type { AuthSession } from '../shared/types';
import { requireCampaignSession } from './auth';
import { getDb, runD1Batch } from './db';
import { executeOptimisticBatch, buildWagonGuardedLog } from './db/optimistic';
import { respondVersionConflict } from './http/conflict';
import {
  campaigns,
  campaignWagons,
  campaignWagonUpgrades,
  campaignWagonResources,
  campaignCardsProgress,
  campaignCardTimeTokens,
  campaignEquipmentInstances,
  campaignCardCatalog,
  campaignCardStatuses,
  wagonActivityLogs,
  craftingStations,
  craftingResources,
  items,
  itemCategories,
} from './db/schema/index';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;

const STATIONS = ['armorers_tools', 'alchemists_lab', 'bowyers_table', 'workshop', 'blacksmiths_tools'];

function error(c: Ctx, status: 400 | 401 | 404 | 409, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

async function wagonConflict(c: Ctx, session: AuthSession, expectedVersion: number) {
  const latest = await loadWagon(c.env.DB, session);
  return respondVersionConflict(c, {
    scope: 'WAGON',
    expectedVersion,
    currentVersion: latest.version,
    latest,
  });
}


async function parseBody(c: Ctx) {
  try { return await c.req.json<Record<string, unknown>>(); }
  catch { return null; }
}

async function ensureWagon(d1: D1Database, campaignId: string) {
  const db = getDb(d1);
  await db
    .insert(campaignWagons)
    .values({ campaignId })
    .onConflictDoNothing();

  const stations = await db
    .select({ id: craftingStations.id })
    .from(craftingStations)
    .where(inArray(craftingStations.code, STATIONS));

  if (stations.length > 0) {
    await db
      .insert(campaignWagonUpgrades)
      .values(stations.map(s => ({ campaignId, stationId: s.id })))
      .onConflictDoNothing();
  }
}

async function loadWagon(d1: D1Database, session: AuthSession) {
  await ensureWagon(d1, session.campaignId);
  const db = getDb(d1);

  const [wagon] = await db
    .select({
      elapsedDays: campaignWagons.elapsedDays,
      locationCode: campaignWagons.locationCode,
      sharedGold: campaignWagons.sharedGold,
      notes: campaignWagons.notes,
      version: campaignWagons.version,
      campaignName: campaigns.campaignName,
    })
    .from(campaignWagons)
    .innerJoin(campaigns, eq(campaigns.id, campaignWagons.campaignId))
    .where(eq(campaignWagons.campaignId, session.campaignId));

  const upgrades = await db
    .select({
      code: craftingStations.code,
      name: craftingStations.name,
      originalName: craftingStations.originalName,
      imageUrl: craftingStations.imageUrl,
      sortOrder: craftingStations.sortOrder,
      level: campaignWagonUpgrades.level,
    })
    .from(campaignWagonUpgrades)
    .innerJoin(craftingStations, eq(craftingStations.id, campaignWagonUpgrades.stationId))
    .where(
      and(
        eq(campaignWagonUpgrades.campaignId, session.campaignId),
        inArray(craftingStations.code, STATIONS),
      ),
    )
    .orderBy(craftingStations.sortOrder);

  const tokens = await db
    .select({
      id: campaignCardTimeTokens.id,
      tokenCode: campaignCardTimeTokens.tokenCode,
      placedAtDay: campaignCardTimeTokens.placedAtDay,
      unlockAtDay: campaignCardTimeTokens.unlockAtDay,
      cardCode: campaignCardsProgress.cardCode,
    })
    .from(campaignCardTimeTokens)
    .innerJoin(
      campaignCardsProgress,
      eq(campaignCardsProgress.id, campaignCardTimeTokens.storyCardProgressId),
    )
    .where(
      and(
        eq(campaignCardTimeTokens.campaignId, session.campaignId),
        eq(campaignCardTimeTokens.status, 'ACTIVE'),
      ),
    )
    .orderBy(campaignCardTimeTokens.unlockAtDay, campaignCardTimeTokens.tokenCode);

  const availableStoryCards = await db
    .select({
      cardCode: campaignCardCatalog.cardCode,
    })
    .from(campaignCardCatalog)
    .leftJoin(
      campaignCardStatuses,
      and(
        eq(campaignCardStatuses.campaignId, session.campaignId),
        eq(campaignCardStatuses.cardCode, campaignCardCatalog.cardCode),
      ),
    )
    .leftJoin(
      campaignCardsProgress,
      and(
        eq(campaignCardsProgress.campaignId, session.campaignId),
        eq(campaignCardsProgress.cardCode, campaignCardCatalog.cardCode),
      ),
    )
    .leftJoin(
      campaignCardTimeTokens,
      and(
        eq(campaignCardTimeTokens.storyCardProgressId, campaignCardsProgress.id),
        eq(campaignCardTimeTokens.status, 'ACTIVE'),
      ),
    )
    .where(
      and(
        eq(campaignCardCatalog.cardType, 'STORY'),
        sql`COALESCE(${campaignCardStatuses.isResolved}, 0) = 0`,
        isNull(campaignCardTimeTokens.id),
      ),
    )
    .orderBy(campaignCardCatalog.sortOrder);

  const resources = await db
    .select({
      code: craftingResources.code,
      name: craftingResources.name,
      imageUrl: craftingResources.imageUrl,
      quantity: sql<number>`COALESCE(${campaignWagonResources.quantity}, 0)`,
    })
    .from(craftingResources)
    .leftJoin(
      campaignWagonResources,
      and(
        eq(campaignWagonResources.resourceId, craftingResources.id),
        eq(campaignWagonResources.campaignId, session.campaignId),
      ),
    )
    .where(eq(craftingResources.isPublished, true))
    .orderBy(craftingResources.sortOrder);

  const equipment = await db
    .select({
      id: campaignEquipmentInstances.id,
      itemId: campaignEquipmentInstances.itemId,
      damageMarkers: campaignEquipmentInstances.damageMarkers,
      notes: campaignEquipmentInstances.notes,
      code: items.code,
      slug: items.slug,
      cardNumber: items.cardNumber,
      name: items.name,
      imageUrl: items.imageUrl,
      categoryName: itemCategories.name,
      categoryCode: itemCategories.code,
    })
    .from(campaignEquipmentInstances)
    .innerJoin(items, eq(items.id, campaignEquipmentInstances.itemId))
    .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
    .where(
      and(
        eq(campaignEquipmentInstances.campaignId, session.campaignId),
        eq(campaignEquipmentInstances.locationType, 'WAGON'),
      ),
    )
    .orderBy(sql`COALESCE(${items.cardNumber}, ${items.code})`, campaignEquipmentInstances.id);

  return {
    campaignId: session.campaignId,
    campaignName: wagon?.campaignName ?? session.campaignName,
    elapsedDays: wagon?.elapsedDays ?? 1,
    locationCode: wagon?.locationCode ?? '',
    sharedGold: wagon?.sharedGold ?? 0,
    notes: wagon?.notes ?? '',
    version: wagon?.version ?? 1,
    upgrades: upgrades.map(row => ({
      code: row.code,
      name: row.name,
      originalName: row.originalName,
      imageUrl: row.imageUrl,
      sortOrder: row.sortOrder,
      level: row.level,
    })),
    timeTokens: tokens.map(row => ({
      id: row.id,
      tokenCode: row.tokenCode as 'A' | 'B' | 'C' | 'D',
      placedAtDay: row.placedAtDay,
      unlockAtDay: row.unlockAtDay,
      storyCardCode: row.cardCode,
    })),
    availableStoryCardCodes: availableStoryCards.map(row => row.cardCode),
    resources: resources.map(row => ({
      code: row.code,
      name: row.name,
      imageUrl: row.imageUrl,
      quantity: row.quantity,
    })),
    equipment: equipment.map(row => ({
      id: row.id,
      itemId: row.itemId,
      code: row.code,
      slug: row.slug,
      cardNumber: row.cardNumber,
      name: row.name,
      imageUrl: row.imageUrl,
      categoryName: row.categoryName,
      damageable: row.categoryCode === 'armor',
      damageMarkers: row.categoryCode === 'armor' ? Math.min(row.damageMarkers, 1) : 0,
      notes: row.notes,
    })),
  };
}

export async function getWagon(c: Ctx) {
  const session = await requireCampaignSession(c);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function updateWagonDay(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const body = await parseBody(c);
  const elapsedDays = Number(body?.elapsedDays);
  const expectedVersion = Number(body?.expectedVersion);
  if (!Number.isInteger(elapsedDays) || elapsedDays < 1 || elapsedDays > 60) {
    return error(c, 400, 'INVALID_ELAPSED_DAYS', '累計天數需為 1 至 60 的整數。');
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  }
  await ensureWagon(c.env.DB, session.campaignId);
  const db = getDb(c.env.DB);
  const [before] = await db
    .select({ elapsedDays: campaignWagons.elapsedDays, version: campaignWagons.version })
    .from(campaignWagons)
    .where(eq(campaignWagons.campaignId, session.campaignId));

  try {
    // [原因備註]: D1 batch 衝突時不拋出例外，使用 buildWagonGuardedLog 確保只有在預期版本相符時才寫入日誌
    const logStmt = db.run(buildWagonGuardedLog({
      campaignId: session.campaignId,
      expectedVersion,
      playerNumber: session.playerNumber,
      actionType: 'SET_ELAPSED_DAYS',
      entityType: 'WAGON',
      entityId: session.campaignId,
      beforeJson: JSON.stringify({ elapsedDays: before?.elapsedDays ?? 1 }),
      afterJson: JSON.stringify({ elapsedDays }),
    }));

    const updateStmt = db
      .update(campaignWagons)
      .set({
        elapsedDays,
        version: sql`${campaignWagons.version} + 1`,
        updatedByPlayer: session.playerNumber,
        updatedAt: sql`(datetime('now'))`,
      })
      .where(
        and(
          eq(campaignWagons.campaignId, session.campaignId),
          eq(campaignWagons.version, expectedVersion),
        ),
      );

    const batchResult = await executeOptimisticBatch(c.env.DB, {
      beforeUpdate: [logStmt],
      update: updateStmt,
    });
    if (batchResult.status === 'conflict') return wagonConflict(c, session, expectedVersion);

    return c.json({ data: await loadWagon(c.env.DB, session) });
  } catch (err) {
    console.error('[updateWagonDay Error]:', err);
    throw err;
  }
}

export async function updateCampaignName(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const body = await parseBody(c);
  const campaignName = typeof body?.campaignName === 'string' ? body.campaignName.trim() : '';
  if (campaignName.length < 1 || campaignName.length > 60) {
    return error(c, 400, 'INVALID_CAMPAIGN_NAME', '戰役名稱需為 1 至 60 個字元。');
  }
  const db = getDb(c.env.DB);
  const updateStmt = db
    .update(campaigns)
    .set({
      campaignName,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(campaigns.id, session.campaignId));

  const logStmt = db.insert(wagonActivityLogs).values({
    campaignId: session.campaignId,
    playerNumber: session.playerNumber,
    actionType: 'RENAME_CAMPAIGN',
    entityType: 'CAMPAIGN',
    entityId: session.campaignId,
    beforeJson: JSON.stringify({ campaignName: session.campaignName }),
    afterJson: JSON.stringify({ campaignName }),
  });

  await runD1Batch(c.env.DB, [updateStmt, logStmt]);

  return c.json({ data: { campaignName } });
}

export async function updateWagonUpgrade(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const stationCode = c.req.param('stationCode') ?? '';
  const body = await parseBody(c);
  const level = Number(body?.level);
  const expectedVersion = Number(body?.expectedVersion);
  if (!STATIONS.includes(stationCode)) return error(c, 404, 'STATION_NOT_FOUND', '找不到這個工坊。');
  if (!Number.isInteger(level) || level < 0 || level > 3) return error(c, 400, 'INVALID_LEVEL', '工坊等級需為 0 至 3。');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  await ensureWagon(c.env.DB, session.campaignId);
  const db = getDb(c.env.DB);
  const [station] = await db
    .select({ id: craftingStations.id })
    .from(craftingStations)
    .where(eq(craftingStations.code, stationCode));
  if (!station) return error(c, 404, 'STATION_NOT_FOUND', '找不到這個工坊。');

  const [before] = await db
    .select({ level: campaignWagonUpgrades.level })
    .from(campaignWagonUpgrades)
    .where(
      and(
        eq(campaignWagonUpgrades.campaignId, session.campaignId),
        eq(campaignWagonUpgrades.stationId, station.id),
      )
    );

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才更新等級與寫入日誌
  const updateStationStmt = db.run(sql`
    UPDATE campaign_wagon_upgrades
    SET level = ${level}, updated_at = datetime('now')
    WHERE campaign_id = ${session.campaignId} AND station_id = ${station.id}
      AND EXISTS (
        SELECT 1 FROM campaign_wagons WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion}
      )
  `);

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 buildWagonGuardedLog 確保只有在預期版本相符時才寫入日誌
  const logStmt = db.run(buildWagonGuardedLog({
    campaignId: session.campaignId,
    expectedVersion,
    playerNumber: session.playerNumber,
    actionType: 'SET_WORKSHOP_LEVEL',
    entityType: 'WORKSHOP',
    entityId: stationCode,
    beforeJson: JSON.stringify({ level: before?.level ?? 0 }),
    afterJson: JSON.stringify({ level }),
  }));

  const updateWagonStmt = db
    .update(campaignWagons)
    .set({
      version: sql`${campaignWagons.version} + 1`,
      updatedByPlayer: session.playerNumber,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(
      and(
        eq(campaignWagons.campaignId, session.campaignId),
        eq(campaignWagons.version, expectedVersion),
      ),
    );

  const batchResult = await executeOptimisticBatch(c.env.DB, {
    beforeUpdate: [updateStationStmt, logStmt],
    update: updateWagonStmt,
  });
  if (batchResult.status === 'conflict') return wagonConflict(c, session, expectedVersion);

  return c.json({ data: await loadWagon(c.env.DB, session) });
}


export async function createTimeToken(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const body = await parseBody(c);
  const storyCardCode = typeof body?.storyCardCode === 'string' ? body.storyCardCode.trim().toUpperCase() : '';
  const tokenCode = typeof body?.tokenCode === 'string' ? body.tokenCode.toUpperCase() : '';
  const unlockAfterDays = Number(body?.unlockAfterDays);
  if (!/^S\d{3}$/.test(storyCardCode)) return error(c, 400, 'INVALID_STORY_CARD', '請選擇有效的劇情卡編號。');

  const db = getDb(c.env.DB);
  const [storyCard] = await db
    .select({
      cardCode: campaignCardCatalog.cardCode,
      isResolved: sql<number>`COALESCE(${campaignCardStatuses.isResolved}, 0)`,
    })
    .from(campaignCardCatalog)
    .leftJoin(
      campaignCardStatuses,
      and(
        eq(campaignCardStatuses.campaignId, session.campaignId),
        eq(campaignCardStatuses.cardCode, campaignCardCatalog.cardCode),
      ),
    )
    .where(
      and(
        eq(campaignCardCatalog.cardCode, storyCardCode),
        eq(campaignCardCatalog.cardType, 'STORY'),
      ),
    );

  if (!storyCard) return error(c, 400, 'INVALID_STORY_CARD', '這個劇情卡編號不在已知卡片清單中。');
  if (storyCard.isResolved === 1) {
    return error(c, 409, 'CARD_ALREADY_RESOLVED', storyCardCode + ' 已完成／不再使用，不能放置 Time Token。');
  }
  if (!['A', 'B', 'C', 'D'].includes(tokenCode)) {
    return error(c, 400, 'INVALID_TIME_TOKEN', '請選擇 A 至 D 的其中一枚 Time Token。');
  }
  const wagon = await loadWagon(c.env.DB, session);
  if (!Number.isInteger(unlockAfterDays) || unlockAfterDays < 1 || wagon.elapsedDays + unlockAfterDays > 60) {
    return error(c, 400, 'INVALID_UNLOCK_DELAY', '解鎖等待天數至少為 1 天，且解鎖日不可超過第 60 天。');
  }
  const unlockAtDay = wagon.elapsedDays + unlockAfterDays;
  try {
    const upsertProgressStmt = db
      .insert(campaignCardsProgress)
      .values({
        campaignId: session.campaignId,
        cardCode: storyCardCode,
        cardType: 'STORY',
        status: 'LOCKED',
      })
      .onConflictDoUpdate({
        target: [campaignCardsProgress.campaignId, campaignCardsProgress.cardCode],
        set: {
          status: 'LOCKED',
          updatedAt: sql`(datetime('now'))`,
        },
      });

    // [原因備註]: 使用 Drizzle sql + SELECT FROM campaign_cards_progress 關聯取剛寫入/既有的 progress id 放置 Time Token
    const insertTokenStmt = db.run(sql`
      INSERT INTO campaign_card_time_tokens
        (campaign_id, story_card_progress_id, token_code, placed_at_day, unlock_at_day)
      SELECT ${session.campaignId}, id, ${tokenCode}, ${wagon.elapsedDays}, ${unlockAtDay}
      FROM campaign_cards_progress
      WHERE campaign_id = ${session.campaignId} AND card_code = ${storyCardCode}
    `);

    const logStmt = db
      .insert(wagonActivityLogs)
      .values({
        campaignId: session.campaignId,
        playerNumber: session.playerNumber,
        actionType: 'PLACE_TIME_TOKEN',
        entityType: 'TIME_TOKEN',
        entityId: storyCardCode,
        afterJson: JSON.stringify({ storyCardCode, tokenCode, unlockAtDay }),
      });

    await runD1Batch(c.env.DB, [upsertProgressStmt, insertTokenStmt, logStmt]);
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    if (msg.includes('UNIQUE constraint failed') || msg.includes('idx_active')) {
      return error(c, 409, 'TIME_TOKEN_CONFLICT', '這枚 Token 或劇情卡已有有效的時間標記。');
    }
    return error(c, 400, 'TIME_TOKEN_ERROR', '放置 Token 失敗：' + msg);
  }
  return c.json({ data: await loadWagon(c.env.DB, session) }, 201);
}

export async function removeTimeToken(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const tokenId = Number(c.req.param('tokenId'));
  if (!Number.isInteger(tokenId) || tokenId < 1) return error(c, 404, 'TIME_TOKEN_NOT_FOUND', '找不到這枚 Time Token。');

  const db = getDb(c.env.DB);
  const [token] = await db
    .select({
      id: campaignCardTimeTokens.id,
      storyCardProgressId: campaignCardTimeTokens.storyCardProgressId,
      unlockAtDay: campaignCardTimeTokens.unlockAtDay,
      cardCode: campaignCardsProgress.cardCode,
    })
    .from(campaignCardTimeTokens)
    .innerJoin(
      campaignCardsProgress,
      eq(campaignCardsProgress.id, campaignCardTimeTokens.storyCardProgressId),
    )
    .where(
      and(
        eq(campaignCardTimeTokens.id, tokenId),
        eq(campaignCardTimeTokens.campaignId, session.campaignId),
        eq(campaignCardTimeTokens.status, 'ACTIVE'),
      ),
    );

  if (!token) return error(c, 404, 'TIME_TOKEN_NOT_FOUND', '找不到這枚有效的 Time Token。');
  const wagon = await loadWagon(c.env.DB, session);
  if (wagon.elapsedDays < token.unlockAtDay) return error(c, 409, 'TIME_TOKEN_NOT_DUE', '尚未到達這枚 Token 的解鎖天數。');

  const updateTokenStmt = db
    .update(campaignCardTimeTokens)
    .set({
      status: 'REMOVED',
      removedAt: sql`(datetime('now'))`,
      removedByPlayer: session.playerNumber,
    })
    .where(
      and(
        eq(campaignCardTimeTokens.id, tokenId),
        eq(campaignCardTimeTokens.campaignId, session.campaignId),
        eq(campaignCardTimeTokens.status, 'ACTIVE'),
      ),
    );

  const updateProgressStmt = db
    .update(campaignCardsProgress)
    .set({
      status: 'AVAILABLE',
      updatedAt: sql`(datetime('now'))`,
    })
    .where(eq(campaignCardsProgress.id, token.storyCardProgressId));

  const logStmt = db
    .insert(wagonActivityLogs)
    .values({
      campaignId: session.campaignId,
      playerNumber: session.playerNumber,
      actionType: 'REMOVE_TIME_TOKEN',
      entityType: 'TIME_TOKEN',
      entityId: String(tokenId),
      beforeJson: JSON.stringify({ status: 'ACTIVE', storyCardCode: token.cardCode }),
      afterJson: JSON.stringify({ status: 'REMOVED', storyCardCode: token.cardCode }),
    });

  await runD1Batch(c.env.DB, [updateTokenStmt, updateProgressStmt, logStmt]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}


export async function updateWagonResource(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const resourceCode = c.req.param('resourceCode') ?? '';
  const body = await parseBody(c);
  const quantity = Number(body?.quantity);
  const expectedVersion = Number(body?.expectedVersion);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) return error(c, 400, 'INVALID_RESOURCE_QUANTITY', '素材數量需為 0 至 999 的整數。');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  await ensureWagon(c.env.DB, session.campaignId);
  const db = getDb(c.env.DB);

  const [resource] = await db
    .select({ id: craftingResources.id })
    .from(craftingResources)
    .where(
      and(
        eq(craftingResources.code, resourceCode),
        eq(craftingResources.isPublished, true)
      )
    );
  if (!resource) return error(c, 404, 'RESOURCE_NOT_FOUND', '找不到這種素材。');

  const [before] = await db
    .select({ quantity: campaignWagonResources.quantity })
    .from(campaignWagonResources)
    .where(
      and(
        eq(campaignWagonResources.campaignId, session.campaignId),
        eq(campaignWagonResources.resourceId, resource.id)
      )
    );

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 Drizzle sql + WHERE EXISTS 確保只有在預期版本相符時才更新素材與寫入日誌
  const upsertResourceStmt = db.run(sql`
    INSERT INTO campaign_wagon_resources (campaign_id, resource_id, quantity)
    SELECT ${session.campaignId}, ${resource.id}, ${quantity}
    WHERE EXISTS (
      SELECT 1 FROM campaign_wagons WHERE campaign_id = ${session.campaignId} AND version = ${expectedVersion}
    )
    ON CONFLICT(campaign_id, resource_id) DO UPDATE SET quantity = excluded.quantity, updated_at = datetime('now')
  `);

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 buildWagonGuardedLog 確保只有在預期版本相符時才寫入日誌
  const logStmt = db.run(buildWagonGuardedLog({
    campaignId: session.campaignId,
    expectedVersion,
    playerNumber: session.playerNumber,
    actionType: 'SET_RESOURCE_QUANTITY',
    entityType: 'RESOURCE',
    entityId: resourceCode,
    beforeJson: JSON.stringify({ quantity: before?.quantity ?? 0 }),
    afterJson: JSON.stringify({ quantity }),
  }));

  const updateWagonStmt = db
    .update(campaignWagons)
    .set({
      version: sql`${campaignWagons.version} + 1`,
      updatedByPlayer: session.playerNumber,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(
      and(
        eq(campaignWagons.campaignId, session.campaignId),
        eq(campaignWagons.version, expectedVersion),
      ),
    );

  const batchResult = await executeOptimisticBatch(c.env.DB, {
    beforeUpdate: [upsertResourceStmt, logStmt],
    update: updateWagonStmt,
  });
  if (batchResult.status === 'conflict') return wagonConflict(c, session, expectedVersion);

  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function addWagonEquipment(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const body = await parseBody(c);
  const itemId = Number(body?.itemId);
  if (!Number.isInteger(itemId) || itemId < 1) return error(c, 400, 'INVALID_ITEM', '請選擇有效的物品。');

  const db = getDb(c.env.DB);
  const [item] = await db
    .select({
      id: items.id,
      name: items.name,
    })
    .from(items)
    .where(
      and(
        eq(items.id, itemId),
        eq(items.isPublished, true),
        inArray(items.sourceKind, ['demo', 'reference', 'official']),
      ),
    );

  if (!item) return error(c, 404, 'ITEM_NOT_FOUND', '找不到這件已發布物品。');
  await ensureWagon(c.env.DB, session.campaignId);

  const insertEquipStmt = db
    .insert(campaignEquipmentInstances)
    .values({
      campaignId: session.campaignId,
      itemId: item.id,
      locationType: 'WAGON',
    });

  // [原因備註]: 使用 Drizzle sql + last_insert_rowid() 取得同 batch 剛建立的裝備 instance id 寫入活動日誌
  const logStmt = db.run(sql`
    INSERT INTO wagon_activity_logs
      (campaign_id, player_number, action_type, entity_type, entity_id, after_json)
    VALUES (
      ${session.campaignId},
      ${session.playerNumber},
      'ADD_EQUIPMENT',
      'EQUIPMENT',
      CAST(last_insert_rowid() AS TEXT),
      ${JSON.stringify({ itemId: item.id, name: item.name, damageMarkers: 0 })}
    )
  `);

  await runD1Batch(c.env.DB, [insertEquipStmt, logStmt]);
  return c.json({ data: await loadWagon(c.env.DB, session) }, 201);
}

export async function updateWagonEquipment(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const equipmentId = Number(c.req.param('equipmentId'));
  const body = await parseBody(c);
  const damageMarkers = Number(body?.damageMarkers);
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!Number.isInteger(equipmentId) || equipmentId < 1) return error(c, 404, 'EQUIPMENT_NOT_FOUND', '找不到這件裝備。');
  if (!Number.isInteger(damageMarkers) || damageMarkers < 0 || damageMarkers > 1) return error(c, 400, 'INVALID_DAMAGE_MARKERS', '損壞狀態只能是完好或損壞。');
  if (notes.length > 200) return error(c, 400, 'INVALID_NOTES', '備註最多 200 個字元。');

  const db = getDb(c.env.DB);
  const [before] = await db
    .select({
      id: campaignEquipmentInstances.id,
      damageMarkers: campaignEquipmentInstances.damageMarkers,
      notes: campaignEquipmentInstances.notes,
      categoryCode: itemCategories.code,
    })
    .from(campaignEquipmentInstances)
    .innerJoin(items, eq(items.id, campaignEquipmentInstances.itemId))
    .innerJoin(itemCategories, eq(itemCategories.id, items.categoryId))
    .where(
      and(
        eq(campaignEquipmentInstances.id, equipmentId),
        eq(campaignEquipmentInstances.campaignId, session.campaignId),
        eq(campaignEquipmentInstances.locationType, 'WAGON'),
      ),
    );

  if (!before) return error(c, 404, 'EQUIPMENT_NOT_FOUND', '找不到這件馬車裝備。');
  if (before.categoryCode !== 'armor' && damageMarkers !== 0) return error(c, 400, 'EQUIPMENT_NOT_DAMAGEABLE', '只有鎧甲或上衣會損壞。');

  const updateEquipStmt = db
    .update(campaignEquipmentInstances)
    .set({
      damageMarkers,
      notes,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(
      and(
        eq(campaignEquipmentInstances.id, equipmentId),
        eq(campaignEquipmentInstances.campaignId, session.campaignId),
        eq(campaignEquipmentInstances.locationType, 'WAGON'),
      ),
    );

  const logStmt = db
    .insert(wagonActivityLogs)
    .values({
      campaignId: session.campaignId,
      playerNumber: session.playerNumber,
      actionType: 'UPDATE_EQUIPMENT',
      entityType: 'EQUIPMENT',
      entityId: String(equipmentId),
      beforeJson: JSON.stringify({ damageMarkers: before.damageMarkers, notes: before.notes }),
      afterJson: JSON.stringify({ damageMarkers, notes }),
    });

  await runD1Batch(c.env.DB, [updateEquipStmt, logStmt]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function removeWagonEquipment(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const equipmentId = Number(c.req.param('equipmentId'));

  const db = getDb(c.env.DB);
  const [equipment] = await db
    .select({
      id: campaignEquipmentInstances.id,
      damageMarkers: campaignEquipmentInstances.damageMarkers,
      notes: campaignEquipmentInstances.notes,
      itemId: items.id,
      name: items.name,
    })
    .from(campaignEquipmentInstances)
    .innerJoin(items, eq(items.id, campaignEquipmentInstances.itemId))
    .where(
      and(
        eq(campaignEquipmentInstances.id, equipmentId),
        eq(campaignEquipmentInstances.campaignId, session.campaignId),
        eq(campaignEquipmentInstances.locationType, 'WAGON'),
      ),
    );

  if (!equipment) return error(c, 404, 'EQUIPMENT_NOT_FOUND', '找不到這件馬車裝備。');

  const deleteEquipStmt = db
    .delete(campaignEquipmentInstances)
    .where(
      and(
        eq(campaignEquipmentInstances.id, equipmentId),
        eq(campaignEquipmentInstances.campaignId, session.campaignId),
        eq(campaignEquipmentInstances.locationType, 'WAGON'),
      ),
    );

  const logStmt = db
    .insert(wagonActivityLogs)
    .values({
      campaignId: session.campaignId,
      playerNumber: session.playerNumber,
      actionType: 'REMOVE_EQUIPMENT',
      entityType: 'EQUIPMENT',
      entityId: String(equipmentId),
      beforeJson: JSON.stringify({
        itemId: equipment.itemId,
        name: equipment.name,
        damageMarkers: equipment.damageMarkers,
        notes: equipment.notes,
      }),
    });

  await runD1Batch(c.env.DB, [deleteEquipStmt, logStmt]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function updateSharedGold(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const body = await parseBody(c);
  const sharedGold = Number(body?.sharedGold);
  const expectedVersion = Number(body?.expectedVersion);
  if (!Number.isInteger(sharedGold) || sharedGold < 0 || sharedGold > 99999) {
    return error(c, 400, 'INVALID_SHARED_GOLD', '團隊共用金錢需為 0 至 99999 的整數。');
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  await ensureWagon(c.env.DB, session.campaignId);
  const db = getDb(c.env.DB);

  const [before] = await db
    .select({ sharedGold: campaignWagons.sharedGold })
    .from(campaignWagons)
    .where(eq(campaignWagons.campaignId, session.campaignId));

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 buildWagonGuardedLog 確保只有在預期版本相符時才寫入日誌
  const logStmt = db.run(buildWagonGuardedLog({
    campaignId: session.campaignId,
    expectedVersion,
    playerNumber: session.playerNumber,
    actionType: 'SET_SHARED_GOLD',
    entityType: 'WAGON',
    entityId: session.campaignId,
    beforeJson: JSON.stringify({ sharedGold: before?.sharedGold ?? 0 }),
    afterJson: JSON.stringify({ sharedGold }),
  }));

  const updateStmt = db
    .update(campaignWagons)
    .set({
      sharedGold,
      version: sql`${campaignWagons.version} + 1`,
      updatedByPlayer: session.playerNumber,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(
      and(
        eq(campaignWagons.campaignId, session.campaignId),
        eq(campaignWagons.version, expectedVersion),
      ),
    );

  const batchResult = await executeOptimisticBatch(c.env.DB, {
    beforeUpdate: [logStmt],
    update: updateStmt,
  });
  if (batchResult.status === 'conflict') return wagonConflict(c, session, expectedVersion);

  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function updateWagonNotes(c: Ctx) {
  const session = await requireCampaignSession(c);
  if (!session.isActive) return error(c, 409, 'CAMPAIGN_INACTIVE', '此戰役目前已凍結。');
  const body = await parseBody(c);
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  const expectedVersion = Number(body?.expectedVersion);
  if (notes.length > 5000) return error(c, 400, 'INVALID_WAGON_NOTES', '馬車備註最多 5000 個字元。');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  await ensureWagon(c.env.DB, session.campaignId);
  const db = getDb(c.env.DB);

  const [before] = await db
    .select({ notes: campaignWagons.notes })
    .from(campaignWagons)
    .where(eq(campaignWagons.campaignId, session.campaignId));

  // [原因備註]: D1 batch 衝突時不拋出例外，使用 buildWagonGuardedLog 確保只有在預期版本相符時才寫入日誌
  const logStmt = db.run(buildWagonGuardedLog({
    campaignId: session.campaignId,
    expectedVersion,
    playerNumber: session.playerNumber,
    actionType: 'UPDATE_WAGON_NOTES',
    entityType: 'WAGON',
    entityId: session.campaignId,
    beforeJson: JSON.stringify({ notes: before?.notes ?? '' }),
    afterJson: JSON.stringify({ notes }),
  }));

  const updateStmt = db
    .update(campaignWagons)
    .set({
      notes,
      version: sql`${campaignWagons.version} + 1`,
      updatedByPlayer: session.playerNumber,
      updatedAt: sql`(datetime('now'))`,
    })
    .where(
      and(
        eq(campaignWagons.campaignId, session.campaignId),
        eq(campaignWagons.version, expectedVersion),
      ),
    );

  const batchResult = await executeOptimisticBatch(c.env.DB, {
    beforeUpdate: [logStmt],
    update: updateStmt,
  });
  if (batchResult.status === 'conflict') return wagonConflict(c, session, expectedVersion);

  return c.json({ data: await loadWagon(c.env.DB, session) });
}
