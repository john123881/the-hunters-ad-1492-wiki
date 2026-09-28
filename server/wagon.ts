import type { Context } from 'hono';
import type { AuthSession } from '../shared/types';
import { requireCampaignSession } from './auth';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;

const STATIONS = ['armorers_tools', 'alchemists_lab', 'bowyers_table', 'workshop', 'blacksmiths_tools'];

function error(c: Ctx, status: 400 | 401 | 404 | 409, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

async function parseBody(c: Ctx) {
  try { return await c.req.json<Record<string, unknown>>(); }
  catch { return null; }
}

async function ensureWagon(db: D1Database, campaignId: string) {
  await db.prepare('INSERT OR IGNORE INTO campaign_wagons (campaign_id) VALUES (?)').bind(campaignId).run();
  await db.prepare(`
    INSERT OR IGNORE INTO campaign_wagon_upgrades (campaign_id, station_id)
    SELECT ?, id FROM crafting_stations
    WHERE code IN ('armorers_tools', 'alchemists_lab', 'bowyers_table', 'workshop', 'blacksmiths_tools')
  `).bind(campaignId).run();
}

async function loadWagon(db: D1Database, session: AuthSession) {
  await ensureWagon(db, session.campaignId);
  const wagon = await db.prepare(`
    SELECT w.elapsed_days, w.location_code, w.shared_gold, w.notes, w.version, c.campaign_name
    FROM campaign_wagons w JOIN campaigns c ON c.id = w.campaign_id
    WHERE w.campaign_id = ?
  `).bind(session.campaignId).first<{
    elapsed_days: number; location_code: string; shared_gold: number; notes: string; version: number; campaign_name: string;
  }>();
  const upgrades = await db.prepare(`
    SELECT s.code, s.name, s.original_name, s.image_url, s.sort_order, u.level
    FROM campaign_wagon_upgrades u
    JOIN crafting_stations s ON s.id = u.station_id
    WHERE u.campaign_id = ? AND s.code IN (?, ?, ?, ?, ?)
    ORDER BY s.sort_order
  `).bind(session.campaignId, ...STATIONS).all<{
    code: string; name: string; original_name: string; image_url: string; sort_order: number; level: number;
  }>();
  const tokens = await db.prepare(`
    SELECT t.id, t.token_code, t.placed_at_day, t.unlock_at_day, p.card_code
    FROM campaign_card_time_tokens t
    JOIN campaign_cards_progress p ON p.id = t.story_card_progress_id
    WHERE t.campaign_id = ? AND t.status = 'ACTIVE'
    ORDER BY t.unlock_at_day, t.token_code
  `).bind(session.campaignId).all<{
    id: number; token_code: 'A' | 'B' | 'C' | 'D';
    placed_at_day: number; unlock_at_day: number; card_code: string;
  }>();
  const availableStoryCards = await db.prepare(`
    SELECT catalog.card_code
    FROM campaign_card_catalog catalog
    LEFT JOIN campaign_card_statuses status
      ON status.campaign_id = ? AND status.card_code = catalog.card_code
    LEFT JOIN campaign_cards_progress progress
      ON progress.campaign_id = ? AND progress.card_code = catalog.card_code
    LEFT JOIN campaign_card_time_tokens token
      ON token.story_card_progress_id = progress.id AND token.status = 'ACTIVE'
    WHERE catalog.card_type = 'STORY'
      AND COALESCE(status.is_resolved, 0) = 0
      AND token.id IS NULL
    ORDER BY catalog.sort_order
  `).bind(session.campaignId, session.campaignId).all<{ card_code: string }>();
  const resources = await db.prepare(`
    SELECT r.code, r.name, r.image_url, COALESCE(wr.quantity, 0) AS quantity
    FROM crafting_resources r
    LEFT JOIN campaign_wagon_resources wr ON wr.resource_id = r.id AND wr.campaign_id = ?
    WHERE r.is_published = 1
    ORDER BY r.sort_order
  `).bind(session.campaignId).all<{ code: string; name: string; image_url: string; quantity: number }>();
  const equipment = await db.prepare(
    "SELECT e.id, e.item_id, e.damage_markers, e.notes, i.code, i.slug, i.card_number, i.name, i.image_url, c.name AS category_name, c.code AS category_code FROM campaign_equipment_instances e JOIN items i ON i.id = e.item_id JOIN item_categories c ON c.id = i.category_id WHERE e.campaign_id = ? AND e.location_type = 'WAGON' ORDER BY COALESCE(i.card_number, i.code), e.id",
  ).bind(session.campaignId).all<{
    id: number; item_id: number; damage_markers: number; notes: string;
    code: string; slug: string; card_number: string | null; name: string;
    image_url: string; category_name: string; category_code: string;
  }>();
  return {
    campaignId: session.campaignId,
    campaignName: wagon?.campaign_name ?? session.campaignName,
    elapsedDays: wagon?.elapsed_days ?? 1,
    locationCode: wagon?.location_code ?? '',
    sharedGold: wagon?.shared_gold ?? 0,
    notes: wagon?.notes ?? '',
    version: wagon?.version ?? 1,
    upgrades: upgrades.results.map(row => ({
      code: row.code, name: row.name, originalName: row.original_name,
      imageUrl: row.image_url, sortOrder: row.sort_order, level: row.level,
    })),
    timeTokens: tokens.results.map(row => ({
      id: row.id, tokenCode: row.token_code,
      placedAtDay: row.placed_at_day, unlockAtDay: row.unlock_at_day,
      storyCardCode: row.card_code,
    })),
    availableStoryCardCodes: availableStoryCards.results.map(row => row.card_code),
    resources: resources.results.map(row => ({
      code: row.code, name: row.name, imageUrl: row.image_url, quantity: row.quantity,
    })),
    equipment: equipment.results.map(row => ({
      id: row.id, itemId: row.item_id, code: row.code, slug: row.slug,
      cardNumber: row.card_number, name: row.name, imageUrl: row.image_url,
      categoryName: row.category_name, damageable: row.category_code === 'armor', damageMarkers: row.category_code === 'armor' ? Math.min(row.damage_markers, 1) : 0, notes: row.notes,
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
  const before = await c.env.DB.prepare(
    'SELECT elapsed_days, version FROM campaign_wagons WHERE campaign_id = ?',
  ).bind(session.campaignId).first<{ elapsed_days: number; version: number }>();
  const result = await c.env.DB.prepare(`
    UPDATE campaign_wagons
    SET elapsed_days = ?, version = version + 1, updated_by_player = ?, updated_at = datetime('now')
    WHERE campaign_id = ? AND version = ?
  `).bind(elapsedDays, session.playerNumber, session.campaignId, expectedVersion).run();
  if (!result.meta.changes) return error(c, 409, 'WAGON_VERSION_CONFLICT', '馬車資料已被其他玩家更新，請重新整理後再試。');
  await c.env.DB.prepare(`
    INSERT INTO wagon_activity_logs
      (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json)
    VALUES (?, ?, 'SET_ELAPSED_DAYS', 'WAGON', ?, ?, ?)
  `).bind(
    session.campaignId, session.playerNumber, session.campaignId,
    JSON.stringify({ elapsedDays: before?.elapsed_days }),
    JSON.stringify({ elapsedDays }),
  ).run();
  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function updateCampaignName(c: Ctx) {
  const session = await requireCampaignSession(c);
  const body = await parseBody(c);
  const campaignName = typeof body?.campaignName === 'string' ? body.campaignName.trim() : '';
  if (campaignName.length < 1 || campaignName.length > 60) {
    return error(c, 400, 'INVALID_CAMPAIGN_NAME', '戰役名稱需為 1 至 60 個字元。');
  }
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE campaigns SET campaign_name = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(campaignName, session.campaignId),
    c.env.DB.prepare(`
      INSERT INTO wagon_activity_logs
        (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json)
      VALUES (?, ?, 'RENAME_CAMPAIGN', 'CAMPAIGN', ?, ?, ?)
    `).bind(
      session.campaignId, session.playerNumber, session.campaignId,
      JSON.stringify({ campaignName: session.campaignName }), JSON.stringify({ campaignName }),
    ),
  ]);
  return c.json({ data: { campaignName } });
}

export async function updateWagonUpgrade(c: Ctx) {
  const session = await requireCampaignSession(c);
  const stationCode = c.req.param('stationCode') ?? '';
  const body = await parseBody(c);
  const level = Number(body?.level);
  const expectedVersion = Number(body?.expectedVersion);
  if (!STATIONS.includes(stationCode)) return error(c, 404, 'STATION_NOT_FOUND', '找不到這個工坊。');
  if (!Number.isInteger(level) || level < 0 || level > 3) return error(c, 400, 'INVALID_LEVEL', '工坊等級需為 0 至 3。');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  await ensureWagon(c.env.DB, session.campaignId);
  const before = await c.env.DB.prepare(`
    SELECT u.level FROM campaign_wagon_upgrades u
    JOIN crafting_stations s ON s.id = u.station_id
    WHERE u.campaign_id = ? AND s.code = ?
  `).bind(session.campaignId, stationCode).first<{ level: number }>();
  const claimed = await c.env.DB.prepare("UPDATE campaign_wagons SET version = version + 1, updated_by_player = ?, updated_at = datetime('now') WHERE campaign_id = ? AND version = ?")
    .bind(session.playerNumber, session.campaignId, expectedVersion).run();
  if (!claimed.meta.changes) return error(c, 409, 'WAGON_VERSION_CONFLICT', '另一位玩家剛剛更新了馬車。');
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE campaign_wagon_upgrades SET level = ?, updated_at = datetime('now')
      WHERE campaign_id = ? AND station_id = (SELECT id FROM crafting_stations WHERE code = ?)
    `).bind(level, session.campaignId, stationCode),
    c.env.DB.prepare(`
      INSERT INTO wagon_activity_logs
        (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json)
      VALUES (?, ?, 'SET_WORKSHOP_LEVEL', 'WORKSHOP', ?, ?, ?)
    `).bind(
      session.campaignId, session.playerNumber, stationCode,
      JSON.stringify({ level: before?.level ?? 0 }), JSON.stringify({ level }),
    ),
  ]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function createTimeToken(c: Ctx) {
  const session = await requireCampaignSession(c);
  const body = await parseBody(c);
  const storyCardCode = typeof body?.storyCardCode === 'string' ? body.storyCardCode.trim().toUpperCase() : '';
  const tokenCode = typeof body?.tokenCode === 'string' ? body.tokenCode.toUpperCase() : '';
  const unlockAfterDays = Number(body?.unlockAfterDays);
  if (!/^S\d{3}$/.test(storyCardCode)) return error(c, 400, 'INVALID_STORY_CARD', '請選擇有效的劇情卡編號。');
  const storyCard = await c.env.DB.prepare(`
    SELECT catalog.card_code, COALESCE(status.is_resolved, 0) AS is_resolved
    FROM campaign_card_catalog catalog
    LEFT JOIN campaign_card_statuses status
      ON status.campaign_id = ? AND status.card_code = catalog.card_code
    WHERE catalog.card_code = ? AND catalog.card_type = 'STORY'
  `).bind(session.campaignId, storyCardCode).first<{ card_code: string; is_resolved: number }>();
  if (!storyCard) return error(c, 400, 'INVALID_STORY_CARD', '這個劇情卡編號不在已知卡片清單中。');
  if (storyCard.is_resolved === 1) {
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
  await c.env.DB.prepare(`
    INSERT INTO campaign_cards_progress (campaign_id, card_code, card_type, status)
    VALUES (?, ?, 'STORY', 'LOCKED')
    ON CONFLICT(campaign_id, card_code) DO UPDATE SET status = 'LOCKED', updated_at = datetime('now')
  `).bind(session.campaignId, storyCardCode).run();
  const card = await c.env.DB.prepare(
    'SELECT id FROM campaign_cards_progress WHERE campaign_id = ? AND card_code = ?',
  ).bind(session.campaignId, storyCardCode).first<{ id: number }>();
  try {
    const inserted = await c.env.DB.prepare(`
      INSERT INTO campaign_card_time_tokens
        (campaign_id, story_card_progress_id, token_code, placed_at_day, unlock_at_day)
      VALUES (?, ?, ?, ?, ?)
    `).bind(session.campaignId, card?.id, tokenCode, wagon.elapsedDays, unlockAtDay).run();
    await c.env.DB.prepare(`
      INSERT INTO wagon_activity_logs
        (campaign_id, player_number, action_type, entity_type, entity_id, after_json)
      VALUES (?, ?, 'PLACE_TIME_TOKEN', 'TIME_TOKEN', ?, ?)
    `).bind(
      session.campaignId, session.playerNumber, String(inserted.meta.last_row_id),
      JSON.stringify({ storyCardCode, tokenCode, unlockAtDay }),
    ).run();
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
  const tokenId = Number(c.req.param('tokenId'));
  if (!Number.isInteger(tokenId) || tokenId < 1) return error(c, 404, 'TIME_TOKEN_NOT_FOUND', '找不到這枚 Time Token。');
  const token = await c.env.DB.prepare(`
    SELECT t.id, t.story_card_progress_id, t.unlock_at_day, p.card_code
    FROM campaign_card_time_tokens t
    JOIN campaign_cards_progress p ON p.id = t.story_card_progress_id
    WHERE t.id = ? AND t.campaign_id = ? AND t.status = 'ACTIVE'
  `).bind(tokenId, session.campaignId).first<{
    id: number; story_card_progress_id: number; unlock_at_day: number; card_code: string;
  }>();
  if (!token) return error(c, 404, 'TIME_TOKEN_NOT_FOUND', '找不到這枚有效的 Time Token。');
  const wagon = await loadWagon(c.env.DB, session);
  if (wagon.elapsedDays < token.unlock_at_day) return error(c, 409, 'TIME_TOKEN_NOT_DUE', '尚未到達這枚 Token 的解鎖天數。');
  await c.env.DB.batch([
    c.env.DB.prepare(`
      UPDATE campaign_card_time_tokens
      SET status = 'REMOVED', removed_at = datetime('now'), removed_by_player = ?
      WHERE id = ? AND campaign_id = ? AND status = 'ACTIVE'
    `).bind(session.playerNumber, tokenId, session.campaignId),
    c.env.DB.prepare("UPDATE campaign_cards_progress SET status = 'AVAILABLE', updated_at = datetime('now') WHERE id = ?")
      .bind(token.story_card_progress_id),
    c.env.DB.prepare(`
      INSERT INTO wagon_activity_logs
        (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json)
      VALUES (?, ?, 'REMOVE_TIME_TOKEN', 'TIME_TOKEN', ?, ?, ?)
    `).bind(
      session.campaignId, session.playerNumber, String(tokenId),
      JSON.stringify({ status: 'ACTIVE', storyCardCode: token.card_code }),
      JSON.stringify({ status: 'REMOVED', storyCardCode: token.card_code }),
    ),
  ]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}


export async function updateWagonResource(c: Ctx) {
  const session = await requireCampaignSession(c);
  const resourceCode = c.req.param('resourceCode') ?? '';
  const body = await parseBody(c);
  const quantity = Number(body?.quantity);
  const expectedVersion = Number(body?.expectedVersion);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) return error(c, 400, 'INVALID_RESOURCE_QUANTITY', '素材數量需為 0 至 999 的整數。');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  await ensureWagon(c.env.DB, session.campaignId);
  const resource = await c.env.DB.prepare('SELECT id FROM crafting_resources WHERE code = ? AND is_published = 1').bind(resourceCode).first<{ id: number }>();
  if (!resource) return error(c, 404, 'RESOURCE_NOT_FOUND', '找不到這種素材。');
  const before = await c.env.DB.prepare('SELECT quantity FROM campaign_wagon_resources WHERE campaign_id = ? AND resource_id = ?').bind(session.campaignId, resource.id).first<{ quantity: number }>();
  const claimed = await c.env.DB.prepare("UPDATE campaign_wagons SET version = version + 1, updated_by_player = ?, updated_at = datetime('now') WHERE campaign_id = ? AND version = ?")
    .bind(session.playerNumber, session.campaignId, expectedVersion).run();
  if (!claimed.meta.changes) return error(c, 409, 'WAGON_VERSION_CONFLICT', '另一位玩家剛剛更新了馬車。');
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO campaign_wagon_resources (campaign_id, resource_id, quantity) VALUES (?, ?, ?) ON CONFLICT(campaign_id, resource_id) DO UPDATE SET quantity = excluded.quantity, updated_at = datetime('now')").bind(session.campaignId, resource.id, quantity),
    c.env.DB.prepare("INSERT INTO wagon_activity_logs (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'SET_RESOURCE_QUANTITY', 'RESOURCE', ?, ?, ?)").bind(session.campaignId, session.playerNumber, resourceCode, JSON.stringify({ quantity: before?.quantity ?? 0 }), JSON.stringify({ quantity })),
  ]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function addWagonEquipment(c: Ctx) {
  const session = await requireCampaignSession(c);
  const body = await parseBody(c);
  const itemId = Number(body?.itemId);
  if (!Number.isInteger(itemId) || itemId < 1) return error(c, 400, 'INVALID_ITEM', '請選擇有效的物品。');
  const item = await c.env.DB.prepare("SELECT id, name FROM items WHERE id = ? AND is_published = 1 AND source_kind IN ('demo', 'reference', 'official')").bind(itemId).first<{ id: number; name: string }>();
  if (!item) return error(c, 404, 'ITEM_NOT_FOUND', '找不到這件已發布物品。');
  await ensureWagon(c.env.DB, session.campaignId);
  const inserted = await c.env.DB.prepare("INSERT INTO campaign_equipment_instances (campaign_id, item_id, location_type) VALUES (?, ?, 'WAGON')").bind(session.campaignId, item.id).run();
  await c.env.DB.prepare("INSERT INTO wagon_activity_logs (campaign_id, player_number, action_type, entity_type, entity_id, after_json) VALUES (?, ?, 'ADD_EQUIPMENT', 'EQUIPMENT', ?, ?)").bind(session.campaignId, session.playerNumber, String(inserted.meta.last_row_id), JSON.stringify({ itemId: item.id, name: item.name, damageMarkers: 0 })).run();
  return c.json({ data: await loadWagon(c.env.DB, session) }, 201);
}

export async function updateWagonEquipment(c: Ctx) {
  const session = await requireCampaignSession(c);
  const equipmentId = Number(c.req.param('equipmentId'));
  const body = await parseBody(c);
  const damageMarkers = Number(body?.damageMarkers);
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  if (!Number.isInteger(equipmentId) || equipmentId < 1) return error(c, 404, 'EQUIPMENT_NOT_FOUND', '找不到這件裝備。');
  if (!Number.isInteger(damageMarkers) || damageMarkers < 0 || damageMarkers > 1) return error(c, 400, 'INVALID_DAMAGE_MARKERS', '損壞狀態只能是完好或損壞。');
  if (notes.length > 200) return error(c, 400, 'INVALID_NOTES', '備註最多 200 個字元。');
  const before = await c.env.DB.prepare("SELECT e.id, e.damage_markers, e.notes, c.code AS category_code FROM campaign_equipment_instances e JOIN items i ON i.id = e.item_id JOIN item_categories c ON c.id = i.category_id WHERE e.id = ? AND e.campaign_id = ? AND e.location_type = 'WAGON'").bind(equipmentId, session.campaignId).first<{ id: number; damage_markers: number; notes: string; category_code: string }>();
  if (!before) return error(c, 404, 'EQUIPMENT_NOT_FOUND', '找不到這件馬車裝備。');
  if (before.category_code !== 'armor' && damageMarkers !== 0) return error(c, 400, 'EQUIPMENT_NOT_DAMAGEABLE', '只有鎧甲或上衣會損壞。');
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE campaign_equipment_instances SET damage_markers = ?, notes = ?, updated_at = datetime('now') WHERE id = ? AND campaign_id = ? AND location_type = 'WAGON'").bind(damageMarkers, notes, equipmentId, session.campaignId),
    c.env.DB.prepare("INSERT INTO wagon_activity_logs (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'UPDATE_EQUIPMENT', 'EQUIPMENT', ?, ?, ?)").bind(session.campaignId, session.playerNumber, String(equipmentId), JSON.stringify({ damageMarkers: before.damage_markers, notes: before.notes }), JSON.stringify({ damageMarkers, notes })),
  ]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function removeWagonEquipment(c: Ctx) {
  const session = await requireCampaignSession(c);
  const equipmentId = Number(c.req.param('equipmentId'));
  const equipment = await c.env.DB.prepare("SELECT e.id, e.damage_markers, e.notes, i.id AS item_id, i.name FROM campaign_equipment_instances e JOIN items i ON i.id = e.item_id WHERE e.id = ? AND e.campaign_id = ? AND e.location_type = 'WAGON'").bind(equipmentId, session.campaignId).first<{ id: number; item_id: number; name: string; damage_markers: number; notes: string }>();
  if (!equipment) return error(c, 404, 'EQUIPMENT_NOT_FOUND', '找不到這件馬車裝備。');
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM campaign_equipment_instances WHERE id = ? AND campaign_id = ? AND location_type = 'WAGON'").bind(equipmentId, session.campaignId),
    c.env.DB.prepare("INSERT INTO wagon_activity_logs (campaign_id, player_number, action_type, entity_type, entity_id, before_json) VALUES (?, ?, 'REMOVE_EQUIPMENT', 'EQUIPMENT', ?, ?)").bind(session.campaignId, session.playerNumber, String(equipmentId), JSON.stringify({ itemId: equipment.item_id, name: equipment.name, damageMarkers: equipment.damage_markers, notes: equipment.notes })),
  ]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}


export async function updateSharedGold(c: Ctx) {
  const session = await requireCampaignSession(c);
  const body = await parseBody(c);
  const sharedGold = Number(body?.sharedGold);
  const expectedVersion = Number(body?.expectedVersion);
  if (!Number.isInteger(sharedGold) || sharedGold < 0 || sharedGold > 99999) {
    return error(c, 400, 'INVALID_SHARED_GOLD', '團隊共用金錢需為 0 至 99999 的整數。');
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  await ensureWagon(c.env.DB, session.campaignId);
  const before = await c.env.DB.prepare('SELECT shared_gold FROM campaign_wagons WHERE campaign_id = ?').bind(session.campaignId).first<{ shared_gold: number }>();
  const claimed = await c.env.DB.prepare("UPDATE campaign_wagons SET shared_gold = ?, version = version + 1, updated_by_player = ?, updated_at = datetime('now') WHERE campaign_id = ? AND version = ?")
    .bind(sharedGold, session.playerNumber, session.campaignId, expectedVersion).run();
  if (!claimed.meta.changes) return error(c, 409, 'WAGON_VERSION_CONFLICT', '另一位玩家剛剛更新了馬車。');
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO wagon_activity_logs (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'SET_SHARED_GOLD', 'WAGON', ?, ?, ?)").bind(session.campaignId, session.playerNumber, session.campaignId, JSON.stringify({ sharedGold: before?.shared_gold ?? 0 }), JSON.stringify({ sharedGold })),
  ]);
  return c.json({ data: await loadWagon(c.env.DB, session) });
}

export async function updateWagonNotes(c: Ctx) {
  const session = await requireCampaignSession(c);
  const body = await parseBody(c);
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  const expectedVersion = Number(body?.expectedVersion);
  if (notes.length > 5000) return error(c, 400, 'INVALID_WAGON_NOTES', '馬車備註最多 5000 個字元。');
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return error(c, 400, 'INVALID_VERSION', '頁面版本不正確，請重新整理後再試。');
  await ensureWagon(c.env.DB, session.campaignId);
  const before = await c.env.DB.prepare('SELECT notes FROM campaign_wagons WHERE campaign_id = ?')
    .bind(session.campaignId).first<{ notes: string }>();
  const updated = await c.env.DB.prepare(
    "UPDATE campaign_wagons SET notes = ?, version = version + 1, updated_by_player = ?, updated_at = datetime('now') WHERE campaign_id = ? AND version = ?",
  ).bind(notes, session.playerNumber, session.campaignId, expectedVersion).run();
  if (!updated.meta.changes) return error(c, 409, 'WAGON_VERSION_CONFLICT', '另一位玩家剛剛更新了馬車。');
  await c.env.DB.prepare(
    "INSERT INTO wagon_activity_logs (campaign_id, player_number, action_type, entity_type, entity_id, before_json, after_json) VALUES (?, ?, 'UPDATE_WAGON_NOTES', 'WAGON', ?, ?, ?)",
  ).bind(
    session.campaignId, session.playerNumber, session.campaignId,
    JSON.stringify({ notes: before?.notes ?? '' }), JSON.stringify({ notes }),
  ).run();
  return c.json({ data: await loadWagon(c.env.DB, session) });
}
