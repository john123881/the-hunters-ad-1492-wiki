import type { Context } from 'hono';
import type { AuthSession } from '../shared/types';
import {
  CATEGORY_ITEM_CODES,
  EQUIPMENT_BOARD_SLOTS,
  getEquipmentBoardSlot,
  getHeroSlotTemplate,
} from '../shared/equipmentBoardTemplates';
import { requireCampaignSession } from './auth';
import { parseJsonBody } from './http/json';
import { canRestoreInitialSlotCovers, canToggleTenXpCover, getEffectiveSlotStatus, resolvePlacementSlotKeys, type SlotOccupancy } from './loadoutRules';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;

type CharacterRow = {
  id: number;
  player_number: number;
  hero_slug: string;
  version: number;
};

const integer = (value: unknown, min = 1, max = 1_000_000) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};

function error(c: Ctx, status: 400 | 404 | 409, code: string, message: string) {
  return c.json({ error: { code, message } }, status);
}

async function getCharacter(d1: D1Database, session: AuthSession, playerNumber: number) {
  return d1.prepare(
    'SELECT id,player_number,hero_slug,version FROM campaign_characters WHERE campaign_id=? AND player_number=?',
  ).bind(session.campaignId, playerNumber).first<CharacterRow>();
}

export async function loadCharacterLoadout(d1: D1Database, session: AuthSession, playerNumber: number) {
  const character = await getCharacter(d1, session, playerNumber);
  if (!character) return null;

  const [openedResult, occupiedResult, retainedResult, attachedResult, socketResult] = await Promise.all([
    d1.prepare(
      'SELECT slot_key FROM campaign_character_opened_slots WHERE character_id=? ORDER BY slot_key',
    ).bind(character.id).all<{ slot_key: string }>(),
    d1.prepare(`
      SELECT s.slot_key,s.slot_index,s.equipment_instance_id,
        e.damage_markers,e.notes,i.id AS item_id,i.code,i.slug,i.name,i.image_url,i.slot_count,
        c.code AS category_code,c.name AS category_name
      FROM campaign_character_equipment_slots s
      JOIN campaign_equipment_instances e ON e.id=s.equipment_instance_id
      JOIN items i ON i.id=e.item_id
      JOIN item_categories c ON c.id=i.category_id
      WHERE s.campaign_id=? AND s.character_id=?
      ORDER BY s.equipment_instance_id,s.slot_index
    `).bind(session.campaignId, character.id).all<Record<string, unknown>>(),
    d1.prepare(`
      SELECT r.attachment_instance_id,r.anchor_slot_key,r.socket_index,r.retained_at,
        e.damage_markers,e.notes,i.id AS item_id,i.code,i.slug,i.name,i.image_url,
        c.code AS category_code,c.name AS category_name
      FROM campaign_character_retained_attachments r
      JOIN campaign_equipment_instances e ON e.id=r.attachment_instance_id
      JOIN items i ON i.id=e.item_id
      JOIN item_categories c ON c.id=i.category_id
      WHERE r.campaign_id=? AND r.character_id=?
      ORDER BY r.anchor_slot_key,r.socket_index
    `).bind(session.campaignId, character.id).all<Record<string, unknown>>(),
    d1.prepare(`
      SELECT a.equipment_instance_id,a.attachment_instance_id,a.weapon_slot_index,a.socket_index,
        i.name,i.slug,i.image_url
      FROM campaign_equipment_attachments a
      JOIN campaign_equipment_instances e ON e.id=a.equipment_instance_id
      JOIN campaign_equipment_instances ae ON ae.id=a.attachment_instance_id
      JOIN items i ON i.id=ae.item_id
      WHERE e.campaign_id=? AND e.character_id=?
      ORDER BY a.equipment_instance_id,a.weapon_slot_index,a.socket_index
    `).bind(session.campaignId, character.id).all<Record<string, unknown>>(),
    d1.prepare(`
      SELECT e.id AS equipment_instance_id,ws.slot_index AS weapon_slot_index,
        ws.socket_index,ct.code AS connector_code,ct.name AS connector_name,
        connected.attachment_instance_id
      FROM campaign_equipment_instances e
      JOIN weapon_sockets ws ON ws.weapon_item_id=e.item_id
      JOIN connector_types ct ON ct.id=ws.connector_type_id
      LEFT JOIN campaign_equipment_attachments connected
        ON connected.equipment_instance_id=e.id
        AND connected.weapon_slot_index=ws.slot_index
        AND connected.socket_index=ws.socket_index
      WHERE e.campaign_id=? AND e.character_id=? AND e.location_type='CHARACTER'
      ORDER BY e.id,ws.slot_index,ws.socket_index
    `).bind(session.campaignId, character.id).all<Record<string, unknown>>(),
  ]);

  const openedSlotKeys = new Set(openedResult.results.map(row => row.slot_key));
  const occupancies = occupiedResult.results.map(row => ({
    slotKey: String(row.slot_key),
    slotIndex: Number(row.slot_index),
    equipmentInstanceId: Number(row.equipment_instance_id),
  }));
  const occupiedSlotKeys = new Set(occupancies.map(row => row.slotKey));
  const template = getHeroSlotTemplate(character.hero_slug);
  const equipmentById = new Map<number, Record<string, unknown>>();
  for (const row of occupiedResult.results) {
    const id = Number(row.equipment_instance_id);
    const current = equipmentById.get(id);
    if (current) {
      (current.slotKeys as string[]).push(String(row.slot_key));
      continue;
    }
    equipmentById.set(id, {
      instanceId: id,
      itemId: Number(row.item_id),
      code: row.code,
      slug: row.slug,
      name: row.name,
      imageUrl: row.image_url,
      categoryCode: row.category_code,
      categoryName: row.category_name,
      slotCount: Number(row.slot_count),
      damageMarkers: Number(row.damage_markers),
      notes: row.notes,
      slotKeys: [String(row.slot_key)],
      attachments: attachedResult.results
        .filter(attachment => Number(attachment.equipment_instance_id) === id)
        .map(attachment => ({
          instanceId: Number(attachment.attachment_instance_id),
          weaponSlotIndex: Number(attachment.weapon_slot_index),
          socketIndex: Number(attachment.socket_index),
          name: attachment.name,
          slug: attachment.slug,
          imageUrl: attachment.image_url,
        })),
      sockets: socketResult.results
        .filter(socket => Number(socket.equipment_instance_id) === id)
        .map(socket => ({
          weaponSlotIndex: Number(socket.weapon_slot_index),
          socketIndex: Number(socket.socket_index),
          connectorCode: socket.connector_code,
          connectorName: socket.connector_name,
          attachmentInstanceId: socket.attachment_instance_id == null ? null : Number(socket.attachment_instance_id),
        })),
    });
  }

  return {
    playerNumber: character.player_number,
    characterId: character.id,
    heroSlug: character.hero_slug,
    version: character.version,
    templateVersion: template?.templateVersion ?? null,
    templateVerified: template?.verified ?? false,
    slots: EQUIPMENT_BOARD_SLOTS.map(slot => ({
      ...slot,
      initialStatus: template?.initialStatusBySlotKey[slot.slotKey] ?? null,
      status: getEffectiveSlotStatus(character.hero_slug, slot.slotKey, openedSlotKeys, occupiedSlotKeys),
    })),
    openedSlotKeys: [...openedSlotKeys],
    equipment: [...equipmentById.values()],
    retainedAttachments: retainedResult.results.map(row => ({
      instanceId: Number(row.attachment_instance_id),
      itemId: Number(row.item_id),
      anchorSlotKey: row.anchor_slot_key,
      socketIndex: Number(row.socket_index),
      retainedAt: row.retained_at,
      code: row.code,
      slug: row.slug,
      name: row.name,
      imageUrl: row.image_url,
      categoryCode: row.category_code,
      categoryName: row.category_name,
      damageMarkers: Number(row.damage_markers),
      notes: row.notes,
    })),
  };
}

export async function getCharacterLoadout(c: Ctx) {
  const session = await requireCampaignSession(c);
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。');
  const loadout = await loadCharacterLoadout(c.env.DB, session, playerNumber);
  if (!loadout) return error(c, 404, 'CHARACTER_NOT_FOUND', '此席位尚未選擇角色。');
  return c.json({ data: loadout });
}

export async function getCharacterEquipmentCandidates(c: Ctx) {
  const session = await requireCampaignSession(c);
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。');
  const character = await getCharacter(c.env.DB, session, playerNumber);
  if (!character) return error(c, 404, 'CHARACTER_NOT_FOUND', '此席位尚未選擇角色。');
  const template = getHeroSlotTemplate(character.hero_slug);
  if (!template?.verified) return error(c, 409, 'SLOT_TEMPLATE_INCOMPLETE', '這位英雄的裝備格配置尚未完成。');
  const slotKey = c.req.query('slotKey') ?? '';
  const slot = getEquipmentBoardSlot(slotKey);
  if (!slot) return error(c, 400, 'INVALID_SLOT', '找不到這個裝備格。');
  const codes = CATEGORY_ITEM_CODES[slot.category];
  const placeholders = codes.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`
    SELECT e.id AS instance_id,e.damage_markers,e.notes,
      i.id AS item_id,i.code,i.slug,i.name,i.image_url,i.slot_count,
      c.code AS category_code,c.name AS category_name
    FROM campaign_equipment_instances e
    JOIN items i ON i.id=e.item_id
    JOIN item_categories c ON c.id=i.category_id
    WHERE e.campaign_id=? AND e.location_type='WAGON' AND e.character_id IS NULL
      AND c.code IN (${placeholders})
    ORDER BY COALESCE(i.card_number,i.code),e.id
  `).bind(session.campaignId, ...codes).all<Record<string, unknown>>();
  return c.json({ data: {
    slotKey,
    items: result.results.map(row => ({
      instanceId: Number(row.instance_id), itemId: Number(row.item_id), code: row.code,
      slug: row.slug, name: row.name, imageUrl: row.image_url,
      categoryCode: row.category_code, categoryName: row.category_name,
      slotCount: Number(row.slot_count), damageMarkers: Number(row.damage_markers), notes: row.notes,
    })),
  } });
}

async function toggleTenXpCover(c: Ctx, open: boolean) {
  const session = await requireCampaignSession(c);
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。');
  const slotKey = c.req.param('slotKey') ?? '';
  const parsed = await parseJsonBody(c, { code: 'INVALID_JSON', message: '請提供有效的版本資料。' });
  if (!parsed.success) return parsed.response;
  const expectedVersion = integer(parsed.data.expectedCharacterVersion ?? parsed.data.expectedVersion);
  if (!expectedVersion) return error(c, 400, 'INVALID_VERSION', 'expectedCharacterVersion 必須是正整數。');
  if (open && parsed.data.confirmedManualXpAdjustment !== true) {
    return error(c, 400, 'CONFIRMATION_REQUIRED', '請確認已自行處理 10 XP。');
  }
  if (!open && parsed.data.confirmed !== true) {
    return error(c, 400, 'CONFIRMATION_REQUIRED', '請確認放回 10 XP 蓋板。');
  }
  const loadout = await loadCharacterLoadout(c.env.DB, session, playerNumber);
  if (!loadout) return error(c, 404, 'CHARACTER_NOT_FOUND', '此席位尚未選擇角色。');
  if (loadout.version !== expectedVersion) {
    return c.json({ error: { code: 'CHARACTER_VERSION_CONFLICT', message: '角色資料已被其他玩家更新。', conflict: {
      scope: 'CHARACTER', expectedVersion, currentVersion: loadout.version, latest: loadout,
    } } }, 409);
  }
  const occupancies: SlotOccupancy[] = loadout.equipment.flatMap(item => {
    const record = item as { instanceId: number; slotKeys: string[] };
    return record.slotKeys.map((key, index) => ({ slotKey: key, equipmentInstanceId: record.instanceId, slotIndex: index + 1 }));
  });
  const validation = canToggleTenXpCover({ heroSlug: loadout.heroSlug, slotKey, occupancies });
  if (!validation.ok) return error(c, 409, validation.code, validation.message);
  const alreadyOpen = loadout.openedSlotKeys.includes(slotKey);
  if (alreadyOpen === open) return c.json({ data: loadout });

  const guard = 'EXISTS (SELECT 1 FROM campaign_characters WHERE id=? AND campaign_id=? AND version=?)';
  const mutation = open
    ? c.env.DB.prepare(`INSERT INTO campaign_character_opened_slots(character_id,slot_key,opened_by_player)
        SELECT ?,?,? WHERE ${guard}`).bind(
          loadout.characterId, slotKey, session.playerNumber,
          loadout.characterId, session.campaignId, expectedVersion,
        )
    : c.env.DB.prepare(`DELETE FROM campaign_character_opened_slots
        WHERE character_id=? AND slot_key=? AND ${guard}`).bind(
          loadout.characterId, slotKey,
          loadout.characterId, session.campaignId, expectedVersion,
        );
  const log = c.env.DB.prepare(`
    INSERT INTO character_activity_logs(
      campaign_id,actor_player_number,target_player_number,action_type,entity_type,entity_id,before_json,after_json
    )
    SELECT ?,?,?,?,?,?,?,? WHERE ${guard}
  `).bind(
    session.campaignId, session.playerNumber, playerNumber,
    open ? 'OPEN_CHARACTER_SLOT' : 'RESTORE_CHARACTER_SLOT_COVER',
    'CHARACTER_SLOT', slotKey,
    JSON.stringify({ status: open ? 'LOCKED_10' : 'OPEN' }),
    JSON.stringify({ status: open ? 'OPEN' : 'LOCKED_10' }),
    loadout.characterId, session.campaignId, expectedVersion,
  );
  const versionUpdate = c.env.DB.prepare(`
    UPDATE campaign_characters SET version=version+1,updated_at=datetime('now')
    WHERE id=? AND campaign_id=? AND version=?
  `).bind(loadout.characterId, session.campaignId, expectedVersion);
  const results = await c.env.DB.batch([log, mutation, versionUpdate]);
  if ((results[2]?.meta.changes ?? 0) < 1) {
    const latest = await loadCharacterLoadout(c.env.DB, session, playerNumber);
    return c.json({ error: { code: 'CHARACTER_VERSION_CONFLICT', message: '角色資料已被其他玩家更新。', conflict: {
      scope: 'CHARACTER', expectedVersion, currentVersion: latest?.version ?? expectedVersion, latest,
    } } }, 409);
  }
  return c.json({ data: await loadCharacterLoadout(c.env.DB, session, playerNumber) });
}

export const openCharacterSlot = (c: Ctx) => toggleTenXpCover(c, true);
export const restoreCharacterSlotCover = (c: Ctx) => toggleTenXpCover(c, false);

export async function restoreInitialCharacterBoard(c: Ctx) {
  const session = await requireCampaignSession(c);
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。');
  const parsed = await parseJsonBody(c, { code: 'INVALID_JSON', message: '請提供有效的版本資料。' });
  if (!parsed.success) return parsed.response;
  const expectedVersion = integer(parsed.data.expectedCharacterVersion ?? parsed.data.expectedVersion);
  if (!expectedVersion) return error(c, 400, 'INVALID_VERSION', 'expectedCharacterVersion 必須是正整數。');
  if (parsed.data.confirmed !== true) return error(c, 400, 'CONFIRMATION_REQUIRED', '請確認復原角色初始面板。');
  const loadout = await loadCharacterLoadout(c.env.DB, session, playerNumber);
  if (!loadout) return error(c, 404, 'CHARACTER_NOT_FOUND', '此席位尚未選擇角色。');
  if (loadout.version !== expectedVersion) {
    return c.json({ error: { code: 'CHARACTER_VERSION_CONFLICT', message: '角色資料已被其他玩家更新。', conflict: {
      scope: 'CHARACTER', expectedVersion, currentVersion: loadout.version, latest: loadout,
    } } }, 409);
  }
  if (!loadout.openedSlotKeys.length) return c.json({ data: loadout });
  const occupancies: SlotOccupancy[] = loadout.equipment.flatMap(item => {
    const record = item as { instanceId: number; slotKeys: string[] };
    return record.slotKeys.map((slotKey, index) => ({
      slotKey, equipmentInstanceId: record.instanceId, slotIndex: index + 1,
    }));
  });
  const validation = canRestoreInitialSlotCovers({ openedSlotKeys: loadout.openedSlotKeys, occupancies });
  if (!validation.ok) return error(c, 409, validation.code, validation.message);
  const guard = 'EXISTS (SELECT 1 FROM campaign_characters WHERE id=? AND campaign_id=? AND version=?)';
  const log = c.env.DB.prepare(`
    INSERT INTO character_activity_logs(
      campaign_id,actor_player_number,target_player_number,action_type,entity_type,entity_id,before_json,after_json
    )
    SELECT ?,?,?,?,?,?,?,? WHERE ${guard}
  `).bind(
    session.campaignId, session.playerNumber, playerNumber,
    'RESTORE_INITIAL_CHARACTER_BOARD', 'CHARACTER_LOADOUT', String(loadout.characterId),
    JSON.stringify({ openedSlotKeys: loadout.openedSlotKeys }), JSON.stringify({ openedSlotKeys: [] }),
    loadout.characterId, session.campaignId, expectedVersion,
  );
  const reset = c.env.DB.prepare(`
    DELETE FROM campaign_character_opened_slots
    WHERE character_id=? AND ${guard}
  `).bind(loadout.characterId, loadout.characterId, session.campaignId, expectedVersion);
  const versionUpdate = c.env.DB.prepare(`
    UPDATE campaign_characters SET version=version+1,updated_at=datetime('now')
    WHERE id=? AND campaign_id=? AND version=?
  `).bind(loadout.characterId, session.campaignId, expectedVersion);
  const results = await c.env.DB.batch([log, reset, versionUpdate]);
  if ((results[2]?.meta.changes ?? 0) < 1) {
    const latest = await loadCharacterLoadout(c.env.DB, session, playerNumber);
    return c.json({ error: { code: 'CHARACTER_VERSION_CONFLICT', message: '角色資料已被其他玩家更新。', conflict: {
      scope: 'CHARACTER', expectedVersion, currentVersion: latest?.version ?? expectedVersion, latest,
    } } }, 409);
  }
  return c.json({ data: await loadCharacterLoadout(c.env.DB, session, playerNumber) });
}

export async function getCompatibleCharacterEquipmentCandidates(c: Ctx) {
  const session = await requireCampaignSession(c);
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。');
  const loadout = await loadCharacterLoadout(c.env.DB, session, playerNumber);
  if (!loadout) return error(c, 404, 'CHARACTER_NOT_FOUND', '此席位尚未選擇角色。');
  const template = getHeroSlotTemplate(loadout.heroSlug);
  if (!template?.verified) return error(c, 409, 'SLOT_TEMPLATE_INCOMPLETE', '這位英雄的裝備格配置尚未完成。');
  const slotKey = c.req.query('slotKey') ?? '';
  const slot = getEquipmentBoardSlot(slotKey);
  if (!slot) return error(c, 400, 'INVALID_SLOT', '找不到這個裝備格。');
  const codes = CATEGORY_ITEM_CODES[slot.category];
  const placeholders = codes.map(() => '?').join(',');
  const query = [
    'SELECT e.id AS instance_id,e.damage_markers,e.notes,i.id AS item_id,i.code,i.slug,i.name,i.image_url,i.slot_count,',
    'c.code AS category_code,c.name AS category_name FROM campaign_equipment_instances e',
    'JOIN items i ON i.id=e.item_id JOIN item_categories c ON c.id=i.category_id',
    "WHERE e.campaign_id=? AND e.location_type='WAGON' AND e.character_id IS NULL",
    'AND c.code IN (' + placeholders + ') ORDER BY COALESCE(i.card_number,i.code),e.id',
  ].join(' ');
  const result = await c.env.DB.prepare(query).bind(session.campaignId, ...codes).all<Record<string, unknown>>();
  const replaceInstanceIdRaw = c.req.query('replaceInstanceId');
  const replaceInstanceId = replaceInstanceIdRaw ? integer(replaceInstanceIdRaw) : null;
  if (replaceInstanceIdRaw && (
    !replaceInstanceId ||
    !loadout.equipment.some(item => Number((item as { instanceId: number }).instanceId) === replaceInstanceId)
  )) {
    return error(c, 400, 'INVALID_REPLACEMENT', '找不到要更換的角色裝備。');
  }
  const occupied: SlotOccupancy[] = loadout.equipment.flatMap(item => {
    const record = item as { instanceId: number; slotKeys: string[] };
    if (record.instanceId === replaceInstanceId) return [];
    return record.slotKeys.map((key, index) => ({ slotKey: key, equipmentInstanceId: record.instanceId, slotIndex: index + 1 }));
  });
  const items: Array<Record<string, unknown>> = [];
  for (const row of result.results) {
    const placement = resolvePlacementSlotKeys({
      heroSlug: loadout.heroSlug, startSlotKey: slotKey, categoryCode: String(row.category_code),
      slotCount: Number(row.slot_count), openedSlotKeys: new Set(loadout.openedSlotKeys), occupancies: occupied,
    });
    if (!placement.ok) continue;
    let compatible = true;
    for (let index = 0; index < placement.slotKeys.length && compatible; index += 1) {
      const placedSlot = getEquipmentBoardSlot(placement.slotKeys[index]);
      if (placedSlot?.category !== 'HAND') continue;
      const anchor = 'ATTACHMENT_' + placedSlot.rowIndex;
      const retained = loadout.retainedAttachments.filter(entry => String((entry as { anchorSlotKey: string }).anchorSlotKey) === anchor);
      for (const attachment of retained) {
        const match = await c.env.DB.prepare([
          'SELECT 1 FROM campaign_equipment_instances attachment',
          'JOIN attachment_specs spec ON spec.item_id=attachment.item_id',
          'JOIN weapon_sockets socket ON socket.weapon_item_id=? AND socket.slot_index=?',
          'AND socket.socket_index=? AND socket.connector_type_id=spec.connector_type_id',
          'WHERE attachment.id=? AND attachment.campaign_id=? AND attachment.character_id=?',
        ].join(' ')).bind(
          Number(row.item_id), index + 1, Number((attachment as { socketIndex: number }).socketIndex),
          Number((attachment as { instanceId: number }).instanceId), session.campaignId, loadout.characterId,
        ).first();
        if (!match) { compatible = false; break; }
      }
    }
    if (!compatible) continue;
    items.push({
      instanceId: Number(row.instance_id), itemId: Number(row.item_id), code: row.code, slug: row.slug,
      name: row.name, imageUrl: row.image_url, categoryCode: row.category_code, categoryName: row.category_name,
      slotCount: Number(row.slot_count), damageMarkers: Number(row.damage_markers), notes: row.notes,
      previewSlotKeys: placement.slotKeys,
    });
  }
  return c.json({ data: { slotKey, items } });
}

export async function getCompatibleCharacterCatalogCandidates(c: Ctx) {
  const session = await requireCampaignSession(c);
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。');
  const loadout = await loadCharacterLoadout(c.env.DB, session, playerNumber);
  if (!loadout) return error(c, 404, 'CHARACTER_NOT_FOUND', '此席位尚未選擇角色。');
  const template = getHeroSlotTemplate(loadout.heroSlug);
  if (!template?.verified) return error(c, 409, 'SLOT_TEMPLATE_INCOMPLETE', '這位英雄的裝備格配置尚未完成。');

  const slotKey = c.req.query('slotKey') ?? '';
  const slot = getEquipmentBoardSlot(slotKey);
  if (!slot) return error(c, 400, 'INVALID_SLOT', '找不到這個裝備格。');
  const codes = CATEGORY_ITEM_CODES[slot.category];
  const placeholders = codes.map(() => '?').join(',');
  const result = await c.env.DB.prepare(`
    SELECT i.id AS item_id,i.code,i.slug,i.name,i.image_url,i.slot_count,
      c.code AS category_code,c.name AS category_name
    FROM items i
    JOIN item_categories c ON c.id=i.category_id
    WHERE i.is_published=1 AND i.source_kind IN ('demo','reference','official')
      AND c.code IN (${placeholders})
    ORDER BY COALESCE(i.card_number,i.code),i.id
  `).bind(...codes).all<Record<string, unknown>>();

  const replaceInstanceIdRaw = c.req.query('replaceInstanceId');
  const replaceInstanceId = replaceInstanceIdRaw ? integer(replaceInstanceIdRaw) : null;
  if (replaceInstanceIdRaw && (
    !replaceInstanceId ||
    !loadout.equipment.some(item => Number((item as { instanceId: number }).instanceId) === replaceInstanceId)
  )) return error(c, 400, 'INVALID_REPLACEMENT', '找不到要更換的角色裝備。');
  const occupied: SlotOccupancy[] = loadout.equipment.flatMap(item => {
    const record = item as { instanceId: number; slotKeys: string[] };
    if (record.instanceId === replaceInstanceId) return [];
    return record.slotKeys.map((key, index) => ({
      slotKey: key, equipmentInstanceId: record.instanceId, slotIndex: index + 1,
    }));
  });
  const items: Array<Record<string, unknown>> = [];
  for (const row of result.results) {
    const placement = resolvePlacementSlotKeys({
      heroSlug: loadout.heroSlug,
      startSlotKey: slotKey,
      categoryCode: String(row.category_code),
      slotCount: Number(row.slot_count),
      openedSlotKeys: new Set(loadout.openedSlotKeys),
      occupancies: occupied,
    });
    if (!placement.ok) continue;

    let compatible = true;
    for (let index = 0; index < placement.slotKeys.length && compatible; index += 1) {
      const placedSlot = getEquipmentBoardSlot(placement.slotKeys[index]);
      if (placedSlot?.category !== 'HAND') continue;
      const anchor = 'ATTACHMENT_' + placedSlot.rowIndex;
      const retained = loadout.retainedAttachments.filter(entry =>
        String((entry as { anchorSlotKey: string }).anchorSlotKey) === anchor
      );
      for (const attachment of retained) {
        const match = await c.env.DB.prepare(`
          SELECT 1 FROM campaign_equipment_instances attachment
          JOIN attachment_specs spec ON spec.item_id=attachment.item_id
          JOIN weapon_sockets socket ON socket.weapon_item_id=? AND socket.slot_index=?
            AND socket.socket_index=? AND socket.connector_type_id=spec.connector_type_id
          WHERE attachment.id=? AND attachment.campaign_id=? AND attachment.character_id=?
        `).bind(
          Number(row.item_id), index + 1, Number((attachment as { socketIndex: number }).socketIndex),
          Number((attachment as { instanceId: number }).instanceId), session.campaignId, loadout.characterId,
        ).first();
        if (!match) { compatible = false; break; }
      }
    }
    if (!compatible) continue;
    items.push({
      itemId: Number(row.item_id), code: row.code, slug: row.slug, name: row.name,
      imageUrl: row.image_url, categoryCode: row.category_code, categoryName: row.category_name,
      slotCount: Number(row.slot_count), previewSlotKeys: placement.slotKeys,
    });
  }
  return c.json({ data: { slotKey, items } });
}
