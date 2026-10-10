import type { Context } from 'hono';
import type { AuthSession } from '../shared/types';
import { getEquipmentBoardSlot } from '../shared/equipmentBoardTemplates';
import { heroDefinitionBySlug } from '../shared/heroesData';
import { requireCampaignSession } from './auth';
import { parseJsonBody } from './http/json';
import { loadCharacterLoadout } from './characterLoadout';
import { resolvePlacementSlotKeys, type SlotOccupancy } from './loadoutRules';

type Env = { Bindings: { DB: D1Database; ASSETS: Fetcher } };
type Ctx = Context<Env>;
type Input = Record<string, unknown>;
type Loadout = NonNullable<Awaited<ReturnType<typeof loadCharacterLoadout>>>;

const integer = (value: unknown, min = 1, max = 1_000_000) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
};
const error = (c: Ctx, status: 400 | 404 | 409, code: string, message: string) =>
  c.json({ error: { code, message } }, status);

function occupancies(loadout: Loadout): SlotOccupancy[] {
  return loadout.equipment.flatMap(item => {
    const record = item as { instanceId: number; slotKeys: string[] };
    return record.slotKeys.map((slotKey, index) => ({
      slotKey, slotIndex: index + 1, equipmentInstanceId: record.instanceId,
    }));
  });
}

async function context(c: Ctx) {
  const session = await requireCampaignSession(c);
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  if (!playerNumber) return { response: error(c, 404, 'PLAYER_NOT_FOUND', '找不到這個玩家席位。') };
  const parsed = await parseJsonBody(c, { code: 'INVALID_JSON', message: '請提供有效的裝備資料。' });
  if (!parsed.success) return { response: parsed.response };
  const input = parsed.data as Input;
  const expectedCharacterVersion = integer(input.expectedCharacterVersion ?? input.expectedVersion);
  if (!expectedCharacterVersion) return { response: error(c, 400, 'INVALID_VERSION', 'expectedCharacterVersion 必須是正整數。') };
  const loadout = await loadCharacterLoadout(c.env.DB, session, playerNumber);
  if (!loadout) return { response: error(c, 404, 'CHARACTER_NOT_FOUND', '此席位尚未選擇角色。') };
  if (loadout.version !== expectedCharacterVersion) {
    return { response: c.json({ error: { code: 'CHARACTER_VERSION_CONFLICT', message: '角色資料已被其他玩家更新。', conflict: {
      scope: 'CHARACTER', expectedVersion: expectedCharacterVersion, currentVersion: loadout.version, latest: loadout,
    } } }, 409) };
  }
  return { session, playerNumber, input, expectedCharacterVersion, loadout };
}

async function wagonVersion(d1: D1Database, campaignId: string) {
  const row = await d1.prepare('SELECT version FROM campaign_wagons WHERE campaign_id=?').bind(campaignId).first<{ version: number }>();
  return Number(row?.version ?? 0);
}

function dualGuard() {
  return `EXISTS(SELECT 1 FROM campaign_characters WHERE id=? AND campaign_id=? AND version=?)
    AND EXISTS(SELECT 1 FROM campaign_wagons WHERE campaign_id=? AND version=?)`;
}
function characterGuard() {
  return 'EXISTS(SELECT 1 FROM campaign_characters WHERE id=? AND campaign_id=? AND version=?)';
}
function dualParams(loadout: Loadout, session: AuthSession, characterVersion: number, wagonVer: number) {
  return [loadout.characterId, session.campaignId, characterVersion, session.campaignId, wagonVer] as const;
}
function characterParams(loadout: Loadout, session: AuthSession, characterVersion: number) {
  return [loadout.characterId, session.campaignId, characterVersion] as const;
}

async function equipmentConflict(c: Ctx, session: AuthSession, playerNumber: number, expectedCharacterVersion: number, expectedWagonVersion: number) {
  const [latest, currentWagonVersion] = await Promise.all([
    loadCharacterLoadout(c.env.DB, session, playerNumber),
    wagonVersion(c.env.DB, session.campaignId),
  ]);
  return c.json({ error: { code: 'EQUIPMENT_VERSION_CONFLICT', message: '角色或馬車資料已被其他玩家更新。', conflict: {
    scope: 'CHARACTER', expectedVersion: expectedCharacterVersion,
    currentVersion: latest?.version ?? expectedCharacterVersion,
    latest, wagon: { expectedVersion: expectedWagonVersion, currentVersion: currentWagonVersion },
  } } }, 409);
}

async function wagonItem(d1: D1Database, campaignId: string, instanceId: number) {
  return d1.prepare(`
    SELECT e.id,e.item_id,e.damage_markers,e.notes,i.name,i.slug,i.slot_count,c.code AS category_code
    FROM campaign_equipment_instances e
    JOIN items i ON i.id=e.item_id JOIN item_categories c ON c.id=i.category_id
    WHERE e.id=? AND e.campaign_id=? AND e.location_type='WAGON' AND e.character_id IS NULL
  `).bind(instanceId, campaignId).first<Record<string, unknown>>();
}

async function characterItem(d1: D1Database, campaignId: string, characterId: number, instanceId: number) {
  return d1.prepare(`
    SELECT e.id,e.item_id,e.damage_markers,e.notes,i.name,i.slug,i.slot_count,c.code AS category_code
    FROM campaign_equipment_instances e
    JOIN items i ON i.id=e.item_id JOIN item_categories c ON c.id=i.category_id
    WHERE e.id=? AND e.campaign_id=? AND e.location_type='CHARACTER' AND e.character_id=?
  `).bind(instanceId, campaignId, characterId).first<Record<string, unknown>>();
}

function versionAssertion(d1: D1Database, session: AuthSession, loadout: Loadout, playerNumber: number, characterVersion: number, wagonVer?: number) {
  const condition = wagonVer == null
    ? characterGuard()
    : dualGuard();
  const params = wagonVer == null
    ? characterParams(loadout, session, characterVersion)
    : dualParams(loadout, session, characterVersion, wagonVer);
  return d1.prepare(`
    INSERT INTO character_activity_logs(
      campaign_id,actor_player_number,target_player_number,action_type,entity_type,entity_id
    )
    SELECT ?,0,?,'VERSION_ASSERTION','SYSTEM','guard'
    WHERE NOT (${condition})
  `).bind(session.campaignId, playerNumber, ...params);
}

function versionStatements(d1: D1Database, session: AuthSession, loadout: Loadout, charVersion: number, wagonVer?: number) {
  const statements = [
    d1.prepare("UPDATE campaign_characters SET version=version+1,updated_at=datetime('now') WHERE id=? AND campaign_id=? AND version=?")
      .bind(loadout.characterId, session.campaignId, charVersion),
  ];
  if (wagonVer != null) statements.push(
    d1.prepare("UPDATE campaign_wagons SET version=version+1,updated_by_player=?,updated_at=datetime('now') WHERE campaign_id=? AND version=?")
      .bind(session.playerNumber, session.campaignId, wagonVer),
  );
  return statements;
}

function logStatement(d1: D1Database, session: AuthSession, _loadout: Loadout, playerNumber: number, action: string, entityId: string, before: unknown, after: unknown, wagon = false, guardParams: readonly unknown[]) {
  if (wagon) return d1.prepare(`
    INSERT INTO wagon_activity_logs(campaign_id,player_number,action_type,entity_type,entity_id,before_json,after_json)
    SELECT ?,?,?,?,?,?,? WHERE ${dualGuard()}
  `).bind(session.campaignId, session.playerNumber, action, 'EQUIPMENT', entityId, JSON.stringify(before), JSON.stringify(after), ...guardParams);
  return d1.prepare(`
    INSERT INTO character_activity_logs(campaign_id,actor_player_number,target_player_number,action_type,entity_type,entity_id,before_json,after_json)
    SELECT ?,?,?,?,?,?,?,? WHERE ${guardParams.length === 5 ? dualGuard() : characterGuard()}
  `).bind(session.campaignId, session.playerNumber, playerNumber, action, 'EQUIPMENT', entityId, JSON.stringify(before), JSON.stringify(after), ...guardParams);
}

async function alignedRetainedAttachments(d1: D1Database, loadout: Loadout, slotKeys: string[], itemId: number) {
  const aligned = slotKeys.flatMap((slotKey, index) => {
    const slot = getEquipmentBoardSlot(slotKey);
    return slot?.category === 'HAND' ? [{ anchor: `ATTACHMENT_${slot.rowIndex}`, weaponSlotIndex: index + 1 }] : [];
  });
  const result: Array<{ attachment_instance_id: number; anchor_slot_key: string; socket_index: number; weapon_slot_index: number }> = [];
  for (const target of aligned) {
    const rows = await d1.prepare(`
      SELECT r.attachment_instance_id,r.anchor_slot_key,r.socket_index
      FROM campaign_character_retained_attachments r
      WHERE r.character_id=? AND r.anchor_slot_key=?
    `).bind(loadout.characterId, target.anchor).all<{ attachment_instance_id: number; anchor_slot_key: string; socket_index: number }>();
    for (const row of rows.results) {
      const compatible = await d1.prepare(`
        SELECT 1 FROM campaign_equipment_instances ae
        JOIN attachment_specs spec ON spec.item_id=ae.item_id
        JOIN weapon_sockets ws ON ws.weapon_item_id=? AND ws.slot_index=? AND ws.socket_index=? AND ws.connector_type_id=spec.connector_type_id
        WHERE ae.id=?
      `).bind(itemId, target.weaponSlotIndex, row.socket_index, row.attachment_instance_id).first();
      if (!compatible) return { ok: false as const, message: '此位置的留置附件與選取武器不相容。' };
      result.push({ ...row, weapon_slot_index: target.weaponSlotIndex });
    }
  }
  return { ok: true as const, rows: result };
}

export async function equipCharacterItem(c: Ctx) {
  const state = await context(c); if ('response' in state) return state.response;
  const { session, playerNumber, input, expectedCharacterVersion, loadout } = state;
  const instanceId = integer(c.req.param('instanceId'));
  const expectedWagonVersion = integer(input.expectedWagonVersion);
  const startSlotKey = typeof input.startSlotKey === 'string' ? input.startSlotKey : '';
  if (!instanceId || !expectedWagonVersion || !startSlotKey) return error(c, 400, 'INVALID_EQUIPMENT_INPUT', '裝備、槽位或馬車版本不正確。');
  if (await wagonVersion(c.env.DB, session.campaignId) !== expectedWagonVersion) return equipmentConflict(c, session, playerNumber, expectedCharacterVersion, expectedWagonVersion);
  const item = await wagonItem(c.env.DB, session.campaignId, instanceId);
  if (!item) return error(c, 409, 'EQUIPMENT_NOT_IN_WAGON', '這件裝備已不在馬車中。');
  const placement = resolvePlacementSlotKeys({
    heroSlug: loadout.heroSlug, startSlotKey, categoryCode: String(item.category_code),
    slotCount: Number(item.slot_count), openedSlotKeys: new Set(loadout.openedSlotKeys), occupancies: occupancies(loadout),
  });
  if (!placement.ok) return error(c, 409, placement.code, placement.message);
  const retained = await alignedRetainedAttachments(c.env.DB, loadout, placement.slotKeys, Number(item.item_id));
  if (!retained.ok) return error(c, 409, 'ATTACHMENT_INCOMPATIBLE', retained.message);
  const guard = dualGuard(), params = dualParams(loadout, session, expectedCharacterVersion, expectedWagonVersion);
  const statements: D1PreparedStatement[] = [
    versionAssertion(c.env.DB, session, loadout, playerNumber, expectedCharacterVersion, expectedWagonVersion),
    logStatement(c.env.DB, session, loadout, playerNumber, 'EQUIP_CHARACTER_ITEM', String(instanceId), { location: 'WAGON' }, { slotKeys: placement.slotKeys }, false, params),
    logStatement(c.env.DB, session, loadout, playerNumber, 'EQUIP_CHARACTER_ITEM', String(instanceId), { location: 'WAGON' }, { characterId: loadout.characterId }, true, params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='CHARACTER',character_id=?,updated_at=datetime('now') WHERE id=? AND campaign_id=? AND location_type='WAGON' AND ${guard}`)
      .bind(loadout.characterId, instanceId, session.campaignId, ...params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='CHARACTER',character_id=?,updated_at=datetime('now') WHERE id IN(SELECT attachment_instance_id FROM campaign_equipment_attachments WHERE equipment_instance_id=?) AND campaign_id=? AND ${guard}`)
      .bind(loadout.characterId, instanceId, session.campaignId, ...params),
  ];
  placement.slotKeys.forEach((slotKey, index) => statements.push(
    c.env.DB.prepare(`INSERT INTO campaign_character_equipment_slots(campaign_id,character_id,equipment_instance_id,slot_key,slot_index)
      SELECT ?,?,?,?,? WHERE ${guard}`).bind(session.campaignId, loadout.characterId, instanceId, slotKey, index + 1, ...params),
  ));
  for (const row of retained.rows) {
    statements.push(
      c.env.DB.prepare(`DELETE FROM campaign_character_retained_attachments WHERE attachment_instance_id=? AND ${guard}`).bind(row.attachment_instance_id, ...params),
      c.env.DB.prepare(`INSERT INTO campaign_equipment_attachments(equipment_instance_id,attachment_instance_id,weapon_slot_index,socket_index)
        SELECT ?,?,?,? WHERE ${guard}`).bind(instanceId, row.attachment_instance_id, row.weapon_slot_index, row.socket_index, ...params),
    );
  }
  statements.push(...versionStatements(c.env.DB, session, loadout, expectedCharacterVersion, expectedWagonVersion));
  const results = await c.env.DB.batch(statements);
  if ((results.at(-2)?.meta.changes ?? 0) < 1 || (results.at(-1)?.meta.changes ?? 0) < 1) return equipmentConflict(c, session, playerNumber, expectedCharacterVersion, expectedWagonVersion);
  return c.json({ data: await loadCharacterLoadout(c.env.DB, session, playerNumber) });
}

export async function moveCharacterItem(c: Ctx) {
  const state = await context(c); if ('response' in state) return state.response;
  const { session, playerNumber, input, expectedCharacterVersion, loadout } = state;
  const instanceId = integer(c.req.param('instanceId'));
  const startSlotKey = typeof input.startSlotKey === 'string' ? input.startSlotKey : '';
  if (!instanceId || !startSlotKey) return error(c, 400, 'INVALID_EQUIPMENT_INPUT', '裝備或槽位不正確。');
  const item = await characterItem(c.env.DB, session.campaignId, loadout.characterId, instanceId);
  if (!item) return error(c, 404, 'CHARACTER_EQUIPMENT_NOT_FOUND', '角色面板上找不到這件裝備。');
  const placement = resolvePlacementSlotKeys({
    heroSlug: loadout.heroSlug, startSlotKey, categoryCode: String(item.category_code), slotCount: Number(item.slot_count),
    openedSlotKeys: new Set(loadout.openedSlotKeys), occupancies: occupancies(loadout), ignoreEquipmentInstanceId: instanceId,
  });
  if (!placement.ok) return error(c, 409, placement.code, placement.message);
  const retained = await alignedRetainedAttachments(c.env.DB, loadout, placement.slotKeys, Number(item.item_id));
  if (!retained.ok) return error(c, 409, 'ATTACHMENT_INCOMPATIBLE', retained.message);
  const current = (loadout.equipment.find(row => Number((row as { instanceId: number }).instanceId) === instanceId) as { slotKeys: string[] } | undefined)?.slotKeys ?? [];
  if (current.join('|') === placement.slotKeys.join('|')) return c.json({ data: loadout });
  const guard=characterGuard(), params=characterParams(loadout,session,expectedCharacterVersion);
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion),
    logStatement(c.env.DB,session,loadout,playerNumber,'MOVE_CHARACTER_ITEM',String(instanceId),{slotKeys:current},{slotKeys:placement.slotKeys},false,params),
    c.env.DB.prepare(`DELETE FROM campaign_character_equipment_slots WHERE equipment_instance_id=? AND ${guard}`).bind(instanceId,...params),
  ];
  placement.slotKeys.forEach((slotKey,index)=>statements.push(c.env.DB.prepare(`INSERT INTO campaign_character_equipment_slots(campaign_id,character_id,equipment_instance_id,slot_key,slot_index) SELECT ?,?,?,?,? WHERE ${guard}`).bind(session.campaignId,loadout.characterId,instanceId,slotKey,index+1,...params)));
  for (const row of retained.rows) {
    statements.push(
      c.env.DB.prepare(`DELETE FROM campaign_character_retained_attachments WHERE attachment_instance_id=? AND ${guard}`).bind(row.attachment_instance_id,...params),
      c.env.DB.prepare(`INSERT INTO campaign_equipment_attachments(equipment_instance_id,attachment_instance_id,weapon_slot_index,socket_index)
        SELECT ?,?,?,? WHERE ${guard}`).bind(instanceId,row.attachment_instance_id,row.weapon_slot_index,row.socket_index,...params),
    );
  }
  statements.push(...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion));
  const results=await c.env.DB.batch(statements);
  if((results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,0);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}

export async function updateCharacterItemDamage(c: Ctx) {
  const state=await context(c); if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  const instanceId=integer(c.req.param('instanceId')); const damageMarkers=integer(input.damageMarkers,0,1);
  if(!instanceId||damageMarkers==null)return error(c,400,'INVALID_DAMAGE','毀損標記必須是 0 或 1。');
  const item=await characterItem(c.env.DB,session.campaignId,loadout.characterId,instanceId);
  if(!item)return error(c,404,'CHARACTER_EQUIPMENT_NOT_FOUND','角色面板上找不到這件裝備。');
  const guard=characterGuard(),params=characterParams(loadout,session,expectedCharacterVersion);
  const statements=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion),
    logStatement(c.env.DB,session,loadout,playerNumber,'UPDATE_CHARACTER_ITEM_DAMAGE',String(instanceId),{damageMarkers:item.damage_markers},{damageMarkers},false,params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances SET damage_markers=?,updated_at=datetime('now') WHERE id=? AND character_id=? AND ${guard}`).bind(damageMarkers,instanceId,loadout.characterId,...params),
    ...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion),
  ];
  const results=await c.env.DB.batch(statements);
  if((results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,0);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}

async function connectedAttachments(d1: D1Database, instanceId: number) {
  const result = await d1.prepare(`
    SELECT a.attachment_instance_id,a.weapon_slot_index,a.socket_index,i.name,i.id AS item_id
    FROM campaign_equipment_attachments a
    JOIN campaign_equipment_instances e ON e.id=a.attachment_instance_id
    JOIN items i ON i.id=e.item_id
    WHERE a.equipment_instance_id=?
    ORDER BY a.weapon_slot_index,a.socket_index
  `).bind(instanceId).all<{ attachment_instance_id:number; weapon_slot_index:number; socket_index:number; name:string; item_id:number }>();
  return result.results;
}

function retainedAnchor(loadout: Loadout, instanceId: number, weaponSlotIndex: number) {
  const item = loadout.equipment.find(row => Number((row as {instanceId:number}).instanceId) === instanceId) as {slotKeys:string[]} | undefined;
  const occupiedSlot = item?.slotKeys[weaponSlotIndex - 1];
  const slot = occupiedSlot ? getEquipmentBoardSlot(occupiedSlot) : null;
  return slot?.category === 'HAND' ? `ATTACHMENT_${slot.rowIndex}` : null;
}

async function planHandCompaction(
  d1: D1Database,
  loadout: Loadout,
  removedInstanceId: number,
  newlyRetained: Array<{ row: { attachment_instance_id: number; socket_index: number }; anchor: string | null }>,
) {
  const handItems = loadout.equipment
    .filter(row => Number((row as { instanceId: number }).instanceId) !== removedInstanceId)
    .filter(row => (row as { slotKeys: string[] }).slotKeys.some(key => key.startsWith('HAND_')))
    .sort((a, b) => Number((a as { slotKeys: string[] }).slotKeys[0].split('_')[1]) - Number((b as { slotKeys: string[] }).slotKeys[0].split('_')[1])) as
    Array<Record<string, unknown> & { instanceId: number; itemId: number; slotKeys: string[]; slotCount: number; categoryCode: string }>;
  const fixed = occupancies(loadout).filter(row =>
    row.equipmentInstanceId !== removedInstanceId && !handItems.some(item => item.instanceId === row.equipmentInstanceId)
  );
  const placements = new Map<number, string[]>();
  const reconnect: Array<{ attachmentInstanceId: number; equipmentInstanceId: number; weaponSlotIndex: number; socketIndex: number }> = [];
  let nextRow = 1;
  for (const item of handItems) {
    const attempt = resolvePlacementSlotKeys({
      heroSlug: loadout.heroSlug, startSlotKey: `HAND_${nextRow}`,
      categoryCode: item.categoryCode, slotCount: item.slotCount,
      openedSlotKeys: new Set(loadout.openedSlotKeys), occupancies: fixed,
    });
    let slotKeys = attempt.ok ? attempt.slotKeys : item.slotKeys;
    let compatible = true;
    for (let index = 0; index < slotKeys.length && compatible; index += 1) {
      const rowIndex = Number(slotKeys[index].split('_')[1]);
      const anchor = `ATTACHMENT_${rowIndex}`;
      const dbRows = await d1.prepare(`SELECT attachment_instance_id,socket_index FROM campaign_character_retained_attachments
        WHERE character_id=? AND anchor_slot_key=?`).bind(loadout.characterId, anchor)
        .all<{attachment_instance_id:number;socket_index:number}>();
      const extras = newlyRetained.filter(entry => entry.anchor === anchor).map(entry => entry.row);
      for (const attachment of [...dbRows.results, ...extras]) {
        const match = await d1.prepare(`SELECT 1 FROM campaign_equipment_instances ae
          JOIN attachment_specs spec ON spec.item_id=ae.item_id
          JOIN weapon_sockets ws ON ws.weapon_item_id=? AND ws.slot_index=? AND ws.socket_index=?
            AND ws.connector_type_id=spec.connector_type_id WHERE ae.id=?`)
          .bind(item.itemId,index+1,attachment.socket_index,attachment.attachment_instance_id).first();
        if (!match) { compatible = false; break; }
        reconnect.push({attachmentInstanceId:attachment.attachment_instance_id,equipmentInstanceId:item.instanceId,weaponSlotIndex:index+1,socketIndex:attachment.socket_index});
      }
    }
    if (!compatible) {
      slotKeys = item.slotKeys;
      reconnect.splice(0, reconnect.length, ...reconnect.filter(row => row.equipmentInstanceId !== item.instanceId));
    }
    placements.set(item.instanceId, slotKeys);
    slotKeys.forEach((slotKey,index)=>fixed.push({slotKey,equipmentInstanceId:item.instanceId,slotIndex:index+1}));
    nextRow = Math.max(...slotKeys.map(key => Number(key.split('_')[1]))) + 1;
  }
  return { placements, reconnect };
}

export async function planHandCompactionAfterReplacement(
  d1: D1Database,
  loadout: Loadout,
  replacedInstanceId: number,
  newSlotKeys: string[],
  newlyRetained: Array<{ row: { attachment_instance_id: number; socket_index: number }; anchor: string | null }>,
) {
  const replaced = loadout.equipment.find(row => Number((row as {instanceId:number}).instanceId) === replacedInstanceId) as
    ({slotKeys:string[]} & Record<string,unknown>) | undefined;
  if (!replaced?.slotKeys[0]?.startsWith('HAND_') || !newSlotKeys[0]?.startsWith('HAND_')) {
    return { placements:new Map<number,string[]>(), reconnect:[] as Array<{attachmentInstanceId:number;equipmentInstanceId:number;weaponSlotIndex:number;socketIndex:number}> };
  }
  const replacedStart = Number(replaced.slotKeys[0].split('_')[1]);
  const following = loadout.equipment
    .filter(row => Number((row as {instanceId:number}).instanceId) !== replacedInstanceId)
    .filter(row => {
      const first=(row as {slotKeys:string[]}).slotKeys[0];
      return first?.startsWith('HAND_') && Number(first.split('_')[1]) > replacedStart;
    })
    .sort((a,b)=>Number((a as {slotKeys:string[]}).slotKeys[0].split('_')[1])-Number((b as {slotKeys:string[]}).slotKeys[0].split('_')[1])) as
    Array<Record<string,unknown>&{instanceId:number;itemId:number;slotKeys:string[];slotCount:number;categoryCode:string}>;
  const followingIds=new Set(following.map(item=>item.instanceId));
  const fixed=occupancies(loadout).filter(row=>row.equipmentInstanceId!==replacedInstanceId&&!followingIds.has(row.equipmentInstanceId));
  newSlotKeys.forEach((slotKey,index)=>fixed.push({slotKey,equipmentInstanceId:-1,slotIndex:index+1}));
  const placements=new Map<number,string[]>();
  const reconnect:Array<{attachmentInstanceId:number;equipmentInstanceId:number;weaponSlotIndex:number;socketIndex:number}>=[];
  let nextRow=Math.max(...newSlotKeys.map(key=>Number(key.split('_')[1])))+1;
  for(const item of following){
    const attempt=resolvePlacementSlotKeys({
      heroSlug:loadout.heroSlug,startSlotKey:`HAND_${nextRow}`,categoryCode:item.categoryCode,slotCount:item.slotCount,
      openedSlotKeys:new Set(loadout.openedSlotKeys),occupancies:fixed,
    });
    let slotKeys=attempt.ok?attempt.slotKeys:item.slotKeys;
    let compatible=true;
    const itemReconnect:typeof reconnect=[];
    for(let index=0;index<slotKeys.length&&compatible;index+=1){
      const anchor=`ATTACHMENT_${Number(slotKeys[index].split('_')[1])}`;
      const dbRows=await d1.prepare(`SELECT attachment_instance_id,socket_index FROM campaign_character_retained_attachments
        WHERE character_id=? AND anchor_slot_key=?`).bind(loadout.characterId,anchor)
        .all<{attachment_instance_id:number;socket_index:number}>();
      const extras=newlyRetained.filter(entry=>entry.anchor===anchor).map(entry=>entry.row);
      for(const attachment of [...dbRows.results,...extras]){
        const match=await d1.prepare(`SELECT 1 FROM campaign_equipment_instances ae
          JOIN attachment_specs spec ON spec.item_id=ae.item_id
          JOIN weapon_sockets ws ON ws.weapon_item_id=? AND ws.slot_index=? AND ws.socket_index=?
            AND ws.connector_type_id=spec.connector_type_id WHERE ae.id=?`)
          .bind(item.itemId,index+1,attachment.socket_index,attachment.attachment_instance_id).first();
        if(!match){compatible=false;break;}
        itemReconnect.push({attachmentInstanceId:attachment.attachment_instance_id,equipmentInstanceId:item.instanceId,weaponSlotIndex:index+1,socketIndex:attachment.socket_index});
      }
    }
    if(!compatible)slotKeys=item.slotKeys;else reconnect.push(...itemReconnect);
    placements.set(item.instanceId,slotKeys);
    slotKeys.forEach((slotKey,index)=>fixed.push({slotKey,equipmentInstanceId:item.instanceId,slotIndex:index+1}));
    nextRow=Math.max(...slotKeys.map(key=>Number(key.split('_')[1])))+1;
  }
  return {placements,reconnect};
}

function appendHandCompactionStatements(
  statements: D1PreparedStatement[], d1: D1Database, loadout: Loadout,
  plan: Awaited<ReturnType<typeof planHandCompaction>>, campaignId: string, guard: string, params: readonly unknown[],
) {
  const ids=[...plan.placements.keys()];
  if(!ids.length)return;
  for(const id of ids)statements.push(d1.prepare(`DELETE FROM campaign_character_equipment_slots WHERE equipment_instance_id=? AND ${guard}`).bind(id,...params));
  for(const [id,slotKeys] of plan.placements)slotKeys.forEach((slotKey,index)=>statements.push(
    d1.prepare(`INSERT INTO campaign_character_equipment_slots(campaign_id,character_id,equipment_instance_id,slot_key,slot_index)
      SELECT ?,?,?,?,? WHERE ${guard}`).bind(campaignId,loadout.characterId,id,slotKey,index+1,...params)
  ));
  for(const row of plan.reconnect)statements.push(
    d1.prepare(`DELETE FROM campaign_character_retained_attachments WHERE attachment_instance_id=? AND ${guard}`).bind(row.attachmentInstanceId,...params),
    d1.prepare(`INSERT OR IGNORE INTO campaign_equipment_attachments(equipment_instance_id,attachment_instance_id,weapon_slot_index,socket_index)
      SELECT ?,?,?,? WHERE ${guard}`).bind(row.equipmentInstanceId,row.attachmentInstanceId,row.weaponSlotIndex,row.socketIndex,...params),
  );
}

async function leaveCharacter(c: Ctx, permanent: boolean) {
  const state=await context(c); if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  if(permanent && input.confirmed!==true)return error(c,400,'CONFIRMATION_REQUIRED','請確認永久移除這件物品。');
  const instanceId=integer(c.req.param('instanceId'));
  if(!instanceId)return error(c,400,'INVALID_EQUIPMENT_INPUT','裝備編號不正確。');
  const item=await characterItem(c.env.DB,session.campaignId,loadout.characterId,instanceId);
  if(!item)return error(c,404,'CHARACTER_EQUIPMENT_NOT_FOUND','角色面板上找不到這件裝備。');
  const attached=await connectedAttachments(c.env.DB,instanceId);
  const anchors=attached.map(row=>({row,anchor:retainedAnchor(loadout,instanceId,row.weapon_slot_index)}));
  if(anchors.some(entry=>!entry.anchor))return error(c,409,'ATTACHMENT_ANCHOR_INVALID','無法判斷附件在面板上的保留位置。');
  const compaction=await planHandCompaction(c.env.DB,loadout,instanceId,anchors);
  if(permanent){
    const guard=characterGuard(),params=characterParams(loadout,session,expectedCharacterVersion);
    const before={...item,instanceId,slotKeys:(loadout.equipment.find(row=>Number((row as {instanceId:number}).instanceId)===instanceId) as {slotKeys:string[]} | undefined)?.slotKeys??[],attachments:attached};
    const statements:D1PreparedStatement[]=[
      versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion),
      logStatement(c.env.DB,session,loadout,playerNumber,'REMOVE_CHARACTER_ITEM',String(instanceId),before,null,false,params),
    ];
    for(const {row,anchor} of anchors)statements.push(
      c.env.DB.prepare(`INSERT INTO campaign_character_retained_attachments(attachment_instance_id,campaign_id,character_id,anchor_slot_key,socket_index)
        SELECT ?,?,?,?,? WHERE ${guard}`).bind(row.attachment_instance_id,session.campaignId,loadout.characterId,anchor,row.socket_index,...params),
    );
    statements.push(
      c.env.DB.prepare(`DELETE FROM campaign_equipment_attachments WHERE equipment_instance_id=? AND ${guard}`).bind(instanceId,...params),
      c.env.DB.prepare(`DELETE FROM campaign_equipment_instances WHERE id=? AND campaign_id=? AND character_id=? AND ${guard}`).bind(instanceId,session.campaignId,loadout.characterId,...params),
    );
    appendHandCompactionStatements(statements,c.env.DB,loadout,compaction,session.campaignId,guard,params);
    statements.push(
      ...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion),
    );
    const results=await c.env.DB.batch(statements);
    if((results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,0);
    return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
  }
  const expectedWagonVersion=integer(input.expectedWagonVersion);
  if(!expectedWagonVersion)return error(c,400,'INVALID_VERSION','expectedWagonVersion 必須是正整數。');
  if(await wagonVersion(c.env.DB,session.campaignId)!==expectedWagonVersion)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion);
  const guard=dualGuard(),params=dualParams(loadout,session,expectedCharacterVersion,expectedWagonVersion);
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion,expectedWagonVersion),
    logStatement(c.env.DB,session,loadout,playerNumber,'UNEQUIP_CHARACTER_ITEM',String(instanceId),{characterId:loadout.characterId},{location:'WAGON'},false,params),
    logStatement(c.env.DB,session,loadout,playerNumber,'UNEQUIP_CHARACTER_ITEM',String(instanceId),{characterId:loadout.characterId},{location:'WAGON'},true,params),
  ];
  for(const {row,anchor} of anchors)statements.push(
    c.env.DB.prepare(`INSERT INTO campaign_character_retained_attachments(attachment_instance_id,campaign_id,character_id,anchor_slot_key,socket_index)
      SELECT ?,?,?,?,? WHERE ${guard}`).bind(row.attachment_instance_id,session.campaignId,loadout.characterId,anchor,row.socket_index,...params),
  );
  statements.push(
    c.env.DB.prepare(`DELETE FROM campaign_equipment_attachments WHERE equipment_instance_id=? AND ${guard}`).bind(instanceId,...params),
    c.env.DB.prepare(`DELETE FROM campaign_character_equipment_slots WHERE equipment_instance_id=? AND ${guard}`).bind(instanceId,...params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='WAGON',character_id=NULL,updated_at=datetime('now') WHERE id=? AND campaign_id=? AND character_id=? AND ${guard}`).bind(instanceId,session.campaignId,loadout.characterId,...params),
  );
  appendHandCompactionStatements(statements,c.env.DB,loadout,compaction,session.campaignId,guard,params);
  statements.push(...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion,expectedWagonVersion));
  const results=await c.env.DB.batch(statements);
  if((results.at(-2)?.meta.changes??0)<1||(results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}

export const returnCharacterItemToWagon=(c:Ctx)=>leaveCharacter(c,false);
export const removeCharacterItem=(c:Ctx)=>leaveCharacter(c,true);

async function retainedAttachment(c:Ctx,moveToWagon:boolean){
  const state=await context(c);if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  const instanceId=integer(c.req.param('instanceId'));
  if(!instanceId)return error(c,400,'INVALID_EQUIPMENT_INPUT','附件編號不正確。');
  if(!moveToWagon&&input.confirmed!==true)return error(c,400,'CONFIRMATION_REQUIRED','請確認永久移除這個附件。');
  const retained=loadout.retainedAttachments.find(row=>Number((row as {instanceId:number}).instanceId)===instanceId);
  if(!retained)return error(c,404,'RETAINED_ATTACHMENT_NOT_FOUND','角色面板上找不到這個留置附件。');
  const expectedWagonVersion=moveToWagon?integer(input.expectedWagonVersion):null;
  if(moveToWagon&&!expectedWagonVersion)return error(c,400,'INVALID_VERSION','expectedWagonVersion 必須是正整數。');
  if(moveToWagon&&await wagonVersion(c.env.DB,session.campaignId)!==expectedWagonVersion)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion!);
  const params=moveToWagon?dualParams(loadout,session,expectedCharacterVersion,expectedWagonVersion!):characterParams(loadout,session,expectedCharacterVersion);
  const guard=moveToWagon?dualGuard():characterGuard();
  const action=moveToWagon?'RETURN_CHARACTER_ATTACHMENT_TO_WAGON':'REMOVE_CHARACTER_ATTACHMENT';
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion,expectedWagonVersion??undefined),
    logStatement(c.env.DB,session,loadout,playerNumber,action,String(instanceId),retained,moveToWagon?{location:'WAGON'}:null,false,params),
  ];
  if(moveToWagon)statements.push(logStatement(c.env.DB,session,loadout,playerNumber,action,String(instanceId),retained,{location:'WAGON'},true,params));
  statements.push(
    c.env.DB.prepare(`DELETE FROM campaign_character_retained_attachments WHERE attachment_instance_id=? AND ${guard}`).bind(instanceId,...params),
    moveToWagon
      ? c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='WAGON',character_id=NULL,updated_at=datetime('now') WHERE id=? AND character_id=? AND ${guard}`).bind(instanceId,loadout.characterId,...params)
      : c.env.DB.prepare(`DELETE FROM campaign_equipment_instances WHERE id=? AND character_id=? AND ${guard}`).bind(instanceId,loadout.characterId,...params),
    ...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion,expectedWagonVersion??undefined),
  );
  const results=await c.env.DB.batch(statements);
  const charIndex=expectedWagonVersion!=null?-2:-1;
  if((results.at(charIndex)?.meta.changes??0)<1||(expectedWagonVersion!=null&&(results.at(-1)?.meta.changes??0)<1))return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion??0);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}
export const removeRetainedAttachment=(c:Ctx)=>retainedAttachment(c,false);
export const returnRetainedAttachmentToWagon=(c:Ctx)=>retainedAttachment(c,true);

async function installedAttachment(c:Ctx,moveToWagon:boolean){
  const state=await context(c);if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  const weaponInstanceId=integer(c.req.param('instanceId'));
  const attachmentInstanceId=integer(c.req.param('attachmentId'));
  if(!weaponInstanceId||!attachmentInstanceId)return error(c,400,'INVALID_ATTACHMENT_INPUT','武器或附件編號不正確。');
  if(!moveToWagon&&input.confirmed!==true)return error(c,400,'CONFIRMATION_REQUIRED','請確認永久移除這個附件。');
  const attachment=await c.env.DB.prepare(`
    SELECT relation.weapon_slot_index,relation.socket_index,attachment.item_id,
      attachment.damage_markers,attachment.notes,item.name,item.slug
    FROM campaign_equipment_attachments relation
    JOIN campaign_equipment_instances weapon ON weapon.id=relation.equipment_instance_id
    JOIN campaign_equipment_instances attachment ON attachment.id=relation.attachment_instance_id
    JOIN items item ON item.id=attachment.item_id
    WHERE relation.equipment_instance_id=? AND relation.attachment_instance_id=?
      AND weapon.campaign_id=? AND weapon.character_id=? AND weapon.location_type='CHARACTER'
      AND attachment.campaign_id=? AND attachment.character_id=? AND attachment.location_type='CHARACTER'
  `).bind(
    weaponInstanceId,attachmentInstanceId,session.campaignId,loadout.characterId,
    session.campaignId,loadout.characterId,
  ).first<Record<string,unknown>>();
  if(!attachment)return error(c,404,'INSTALLED_ATTACHMENT_NOT_FOUND','這個附件已不在指定武器上。');
  const expectedWagonVersion=moveToWagon?integer(input.expectedWagonVersion):null;
  if(moveToWagon&&!expectedWagonVersion)return error(c,400,'INVALID_VERSION','expectedWagonVersion 必須是正整數。');
  if(moveToWagon&&await wagonVersion(c.env.DB,session.campaignId)!==expectedWagonVersion){
    return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion!);
  }
  const params=moveToWagon
    ? dualParams(loadout,session,expectedCharacterVersion,expectedWagonVersion!)
    : characterParams(loadout,session,expectedCharacterVersion);
  const guard=moveToWagon?dualGuard():characterGuard();
  const action=moveToWagon?'RETURN_INSTALLED_ATTACHMENT_TO_WAGON':'REMOVE_INSTALLED_ATTACHMENT';
  const before={...attachment,weaponInstanceId,attachmentInstanceId};
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion,expectedWagonVersion??undefined),
    logStatement(c.env.DB,session,loadout,playerNumber,action,String(attachmentInstanceId),before,moveToWagon?{location:'WAGON'}:null,false,params),
  ];
  if(moveToWagon)statements.push(
    logStatement(c.env.DB,session,loadout,playerNumber,action,String(attachmentInstanceId),before,{location:'WAGON'},true,params),
  );
  statements.push(
    c.env.DB.prepare(`DELETE FROM campaign_equipment_attachments
      WHERE equipment_instance_id=? AND attachment_instance_id=? AND ${guard}`)
      .bind(weaponInstanceId,attachmentInstanceId,...params),
    moveToWagon
      ? c.env.DB.prepare(`UPDATE campaign_equipment_instances
          SET location_type='WAGON',character_id=NULL,updated_at=datetime('now')
          WHERE id=? AND campaign_id=? AND character_id=? AND ${guard}`)
          .bind(attachmentInstanceId,session.campaignId,loadout.characterId,...params)
      : c.env.DB.prepare(`DELETE FROM campaign_equipment_instances
          WHERE id=? AND campaign_id=? AND character_id=? AND ${guard}`)
          .bind(attachmentInstanceId,session.campaignId,loadout.characterId,...params),
    ...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion,expectedWagonVersion??undefined),
  );
  const results=await c.env.DB.batch(statements);
  const charIndex=expectedWagonVersion!=null?-2:-1;
  if((results.at(charIndex)?.meta.changes??0)<1||
    (expectedWagonVersion!=null&&(results.at(-1)?.meta.changes??0)<1)){
    return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion??0);
  }
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}
export const removeInstalledAttachment=(c:Ctx)=>installedAttachment(c,false);
export const returnInstalledAttachmentToWagon=(c:Ctx)=>installedAttachment(c,true);

export async function removeAllCharacterItems(c:Ctx){
  const state=await context(c);if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  if(input.confirmed!==true)return error(c,400,'CONFIRMATION_REQUIRED','請確認永久移除全部裝備。');
  const snapshots=[...loadout.equipment,...loadout.retainedAttachments];
  if(snapshots.length===0)return c.json({data:loadout});
  const guard=characterGuard(),params=characterParams(loadout,session,expectedCharacterVersion);
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion),
    logStatement(c.env.DB,session,loadout,playerNumber,'REMOVE_ALL_CHARACTER_ITEMS',String(loadout.characterId),snapshots,[],false,params),
    c.env.DB.prepare(`DELETE FROM campaign_equipment_instances WHERE campaign_id=? AND character_id=? AND location_type='CHARACTER' AND ${guard}`).bind(session.campaignId,loadout.characterId,...params),
    ...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion),
  ];
  const results=await c.env.DB.batch(statements);
  if((results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,0);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}

export async function getAttachmentCandidates(c:Ctx){
  const session=await requireCampaignSession(c);
  const playerNumber=integer(c.req.param('playerNumber'),1,4);
  const weaponInstanceId=integer(c.req.param('instanceId')??c.req.param('weaponInstanceId'));
  const weaponSlotIndex=integer(c.req.query('weaponSlotIndex'));
  const socketIndex=integer(c.req.query('socketIndex'));
  if(!playerNumber||!weaponInstanceId||!weaponSlotIndex||!socketIndex)return error(c,400,'INVALID_ATTACHMENT_TARGET','附件目標不正確。');
  const loadout=await loadCharacterLoadout(c.env.DB,session,playerNumber);
  if(!loadout)return error(c,404,'CHARACTER_NOT_FOUND','此席位尚未選擇角色。');
  const socket=await c.env.DB.prepare(`
    SELECT ws.connector_type_id,ct.code,ct.name
    FROM campaign_equipment_instances e JOIN weapon_sockets ws ON ws.weapon_item_id=e.item_id
    JOIN connector_types ct ON ct.id=ws.connector_type_id
    WHERE e.id=? AND e.campaign_id=? AND e.character_id=? AND ws.slot_index=? AND ws.socket_index=?
  `).bind(weaponInstanceId,session.campaignId,loadout.characterId,weaponSlotIndex,socketIndex).first<Record<string,unknown>>();
  if(!socket)return error(c,404,'WEAPON_SOCKET_NOT_FOUND','找不到這個武器附件孔位。');
  const result=await c.env.DB.prepare(`
    SELECT e.id AS instance_id,e.notes,e.damage_markers,i.id AS item_id,i.name,i.slug,i.image_url,
      ct.code AS connector_code,ct.name AS connector_name
    FROM campaign_equipment_instances e JOIN items i ON i.id=e.item_id
    JOIN attachment_specs spec ON spec.item_id=i.id JOIN connector_types ct ON ct.id=spec.connector_type_id
    LEFT JOIN campaign_equipment_attachments used ON used.attachment_instance_id=e.id
    WHERE e.campaign_id=? AND e.location_type='WAGON' AND e.character_id IS NULL
      AND used.attachment_instance_id IS NULL AND spec.connector_type_id=?
    ORDER BY COALESCE(i.card_number,i.code),e.id
  `).bind(session.campaignId,Number(socket.connector_type_id)).all<Record<string,unknown>>();
  return c.json({data:{weaponInstanceId,weaponSlotIndex,socketIndex,connector:{code:socket.code,name:socket.name},items:result.results.map(row=>({
    instanceId:Number(row.instance_id),itemId:Number(row.item_id),name:row.name,slug:row.slug,imageUrl:row.image_url,
    notes:row.notes,damageMarkers:Number(row.damage_markers),connectorCode:row.connector_code,connectorName:row.connector_name,
  }))}});
}

export async function installCharacterAttachment(c:Ctx){
  const state=await context(c);if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  const weaponInstanceId=integer(c.req.param('instanceId')??c.req.param('weaponInstanceId'));
  const attachmentInstanceId=integer(input.attachmentInstanceId);
  const weaponSlotIndex=integer(input.weaponSlotIndex);const socketIndex=integer(input.socketIndex);
  const expectedWagonVersion=integer(input.expectedWagonVersion);
  if(!weaponInstanceId||!attachmentInstanceId||!weaponSlotIndex||!socketIndex||!expectedWagonVersion)return error(c,400,'INVALID_ATTACHMENT_INPUT','附件、孔位或版本不正確。');
  if(await wagonVersion(c.env.DB,session.campaignId)!==expectedWagonVersion)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion);
  const compatible=await c.env.DB.prepare(`
    SELECT 1 FROM campaign_equipment_instances w
    JOIN weapon_sockets ws ON ws.weapon_item_id=w.item_id AND ws.slot_index=? AND ws.socket_index=?
    JOIN campaign_equipment_instances a ON a.id=? AND a.campaign_id=w.campaign_id AND a.location_type='WAGON' AND a.character_id IS NULL
    JOIN attachment_specs spec ON spec.item_id=a.item_id AND spec.connector_type_id=ws.connector_type_id
    LEFT JOIN campaign_equipment_attachments used ON used.attachment_instance_id=a.id
    WHERE w.id=? AND w.campaign_id=? AND w.character_id=? AND w.location_type='CHARACTER' AND used.attachment_instance_id IS NULL
  `).bind(weaponSlotIndex,socketIndex,attachmentInstanceId,weaponInstanceId,session.campaignId,loadout.characterId).first();
  if(!compatible)return error(c,409,'ATTACHMENT_INCOMPATIBLE','附件已被使用或與此武器孔位不相容。');
  const params=dualParams(loadout,session,expectedCharacterVersion,expectedWagonVersion),guard=dualGuard();
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion,expectedWagonVersion),
    logStatement(c.env.DB,session,loadout,playerNumber,'EQUIP_CHARACTER_ATTACHMENT',String(attachmentInstanceId),{location:'WAGON'},{weaponInstanceId,weaponSlotIndex,socketIndex},false,params),
    logStatement(c.env.DB,session,loadout,playerNumber,'EQUIP_CHARACTER_ATTACHMENT',String(attachmentInstanceId),{location:'WAGON'},{characterId:loadout.characterId},true,params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='CHARACTER',character_id=?,updated_at=datetime('now') WHERE id=? AND campaign_id=? AND location_type='WAGON' AND ${guard}`).bind(loadout.characterId,attachmentInstanceId,session.campaignId,...params),
    c.env.DB.prepare(`INSERT INTO campaign_equipment_attachments(equipment_instance_id,attachment_instance_id,weapon_slot_index,socket_index) SELECT ?,?,?,? WHERE ${guard}`).bind(weaponInstanceId,attachmentInstanceId,weaponSlotIndex,socketIndex,...params),
    ...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion,expectedWagonVersion),
  ];
  const results=await c.env.DB.batch(statements);
  if((results.at(-2)?.meta.changes??0)<1||(results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}

export async function replaceCharacterItem(c:Ctx){
  const state=await context(c);if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  const currentInstanceId=integer(c.req.param('instanceId')??c.req.param('currentInstanceId'));
  const newInstanceId=integer(input.newInstanceId);const expectedWagonVersion=integer(input.expectedWagonVersion);
  const startSlotKey=typeof input.startSlotKey==='string'?input.startSlotKey:'';
  if(!currentInstanceId||!newInstanceId||!expectedWagonVersion||!startSlotKey)return error(c,400,'INVALID_REPLACEMENT','更換裝備資料不完整。');
  if(await wagonVersion(c.env.DB,session.campaignId)!==expectedWagonVersion)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion);
  const [currentItem,newItem]=await Promise.all([
    characterItem(c.env.DB,session.campaignId,loadout.characterId,currentInstanceId),
    wagonItem(c.env.DB,session.campaignId,newInstanceId),
  ]);
  if(!currentItem)return error(c,404,'CHARACTER_EQUIPMENT_NOT_FOUND','角色面板上找不到要更換的裝備。');
  if(!newItem)return error(c,409,'EQUIPMENT_NOT_IN_WAGON','新裝備已不在馬車中。');
  const placement=resolvePlacementSlotKeys({
    heroSlug:loadout.heroSlug,startSlotKey,categoryCode:String(newItem.category_code),slotCount:Number(newItem.slot_count),
    openedSlotKeys:new Set(loadout.openedSlotKeys),occupancies:occupancies(loadout),ignoreEquipmentInstanceId:currentInstanceId,
  });
  if(!placement.ok)return error(c,409,placement.code,placement.message);
  const retained=await alignedRetainedAttachments(c.env.DB,loadout,placement.slotKeys,Number(newItem.item_id));
  if(!retained.ok)return error(c,409,'ATTACHMENT_INCOMPATIBLE',retained.message);
  const oldAttached=await connectedAttachments(c.env.DB,currentInstanceId);
  const anchors=oldAttached.map(row=>({row,anchor:retainedAnchor(loadout,currentInstanceId,row.weapon_slot_index)}));
  if(anchors.some(entry=>!entry.anchor))return error(c,409,'ATTACHMENT_ANCHOR_INVALID','無法判斷舊附件的保留位置。');
  const compaction=await planHandCompactionAfterReplacement(c.env.DB,loadout,currentInstanceId,placement.slotKeys,anchors);
  const params=dualParams(loadout,session,expectedCharacterVersion,expectedWagonVersion),guard=dualGuard();
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion,expectedWagonVersion),
    logStatement(c.env.DB,session,loadout,playerNumber,'REPLACE_CHARACTER_ITEM',String(currentInstanceId),{currentInstanceId,currentItem},{newInstanceId,newItem,slotKeys:placement.slotKeys},false,params),
    logStatement(c.env.DB,session,loadout,playerNumber,'REPLACE_CHARACTER_ITEM',String(currentInstanceId),{toWagon:currentInstanceId},{fromWagon:newInstanceId},true,params),
  ];
  for(const {row,anchor} of anchors)statements.push(c.env.DB.prepare(`INSERT INTO campaign_character_retained_attachments(attachment_instance_id,campaign_id,character_id,anchor_slot_key,socket_index) SELECT ?,?,?,?,? WHERE ${guard}`).bind(row.attachment_instance_id,session.campaignId,loadout.characterId,anchor,row.socket_index,...params));
  statements.push(
    c.env.DB.prepare(`DELETE FROM campaign_equipment_attachments WHERE equipment_instance_id=? AND ${guard}`).bind(currentInstanceId,...params),
    c.env.DB.prepare(`DELETE FROM campaign_character_equipment_slots WHERE equipment_instance_id=? AND ${guard}`).bind(currentInstanceId,...params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='WAGON',character_id=NULL,updated_at=datetime('now') WHERE id=? AND character_id=? AND ${guard}`).bind(currentInstanceId,loadout.characterId,...params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='CHARACTER',character_id=?,updated_at=datetime('now') WHERE id=? AND campaign_id=? AND location_type='WAGON' AND ${guard}`).bind(loadout.characterId,newInstanceId,session.campaignId,...params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='CHARACTER',character_id=?,updated_at=datetime('now') WHERE id IN(SELECT attachment_instance_id FROM campaign_equipment_attachments WHERE equipment_instance_id=?) AND campaign_id=? AND ${guard}`).bind(loadout.characterId,newInstanceId,session.campaignId,...params),
  );
  placement.slotKeys.forEach((slotKey,index)=>statements.push(c.env.DB.prepare(`INSERT INTO campaign_character_equipment_slots(campaign_id,character_id,equipment_instance_id,slot_key,slot_index) SELECT ?,?,?,?,? WHERE ${guard}`).bind(session.campaignId,loadout.characterId,newInstanceId,slotKey,index+1,...params)));
  for(const row of retained.rows)statements.push(
    c.env.DB.prepare(`DELETE FROM campaign_character_retained_attachments WHERE attachment_instance_id=? AND ${guard}`).bind(row.attachment_instance_id,...params),
    c.env.DB.prepare(`INSERT INTO campaign_equipment_attachments(equipment_instance_id,attachment_instance_id,weapon_slot_index,socket_index)
      SELECT ?,?,?,? WHERE ${guard}`).bind(newInstanceId,row.attachment_instance_id,row.weapon_slot_index,row.socket_index,...params),
  );
  appendHandCompactionStatements(statements,c.env.DB,loadout,compaction,session.campaignId,guard,params);
  statements.push(...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion,expectedWagonVersion));
  const results=await c.env.DB.batch(statements);
  if((results.at(-2)?.meta.changes??0)<1||(results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,expectedWagonVersion);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}

export async function reorderHandItems(c:Ctx){
  const state=await context(c);if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  const ids=Array.isArray(input.orderedInstanceIds)?input.orderedInstanceIds.map(value=>integer(value)):[];
  if(ids.some(value=>value==null)||new Set(ids).size!==ids.length)return error(c,400,'INVALID_HAND_ORDER','手部裝備順序含有無效或重複編號。');
  const handItems=(loadout.equipment.filter(row=>{
    const item=row as {slotKeys:string[]};
    return item.slotKeys.some(slotKey=>getEquipmentBoardSlot(slotKey)?.category==='HAND');
  }) as Array<Record<string,unknown>&{instanceId:number;slotKeys:string[];slotCount:number;categoryCode:string}>)
    .sort((a,b)=>{
      const aSlot=Math.min(...a.slotKeys.filter(k=>k.startsWith('HAND_')).map(k=>Number(k.split('_')[1])));
      const bSlot=Math.min(...b.slotKeys.filter(k=>k.startsWith('HAND_')).map(k=>Number(k.split('_')[1])));
      return aSlot-bSlot;
    });
  const currentIds=handItems.map(item=>Number(item.instanceId));
  if(ids.length!==currentIds.length||ids.some(id=>!currentIds.includes(id!)))return error(c,400,'INVALID_HAND_ORDER','必須完整提供目前所有手部主裝備。');
  if(ids.map(Number).join('|')===currentIds.join('|'))return c.json({data:loadout});
  const otherOccupancies=occupancies(loadout).filter(row=>!currentIds.includes(row.equipmentInstanceId));
  const nextOccupancies=[...otherOccupancies];const placements=new Map<number,string[]>();
  const retainedConnections:Array<{attachment_instance_id:number;equipmentInstanceId:number;weapon_slot_index:number;socket_index:number}>=[];let nextRow=1;
  for(const rawId of ids){
    const id=Number(rawId);const item=handItems.find(entry=>Number(entry.instanceId)===id)!;
    const placement=resolvePlacementSlotKeys({heroSlug:loadout.heroSlug,startSlotKey:`HAND_${nextRow}`,categoryCode:String(item.categoryCode),slotCount:Number(item.slotCount),openedSlotKeys:new Set(loadout.openedSlotKeys),occupancies:nextOccupancies});
    if(!placement.ok)return error(c,409,placement.code,placement.message);
    const retained=await alignedRetainedAttachments(c.env.DB,loadout,placement.slotKeys,Number(item.itemId));
    if(!retained.ok)return error(c,409,'ATTACHMENT_INCOMPATIBLE',retained.message);
    retainedConnections.push(...retained.rows.map(row=>({...row,equipmentInstanceId:id})));
    placements.set(id,placement.slotKeys);
    placement.slotKeys.forEach((slotKey,index)=>nextOccupancies.push({slotKey,equipmentInstanceId:id,slotIndex:index+1}));
    nextRow+=Number(item.slotCount);
  }
  const params=characterParams(loadout,session,expectedCharacterVersion),guard=characterGuard();
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion),
    logStatement(c.env.DB,session,loadout,playerNumber,'REORDER_HAND_ITEMS',String(loadout.characterId),{orderedInstanceIds:currentIds},{orderedInstanceIds:ids},false,params),
  ];
  for(const id of currentIds)statements.push(c.env.DB.prepare(`DELETE FROM campaign_character_equipment_slots WHERE equipment_instance_id=? AND ${guard}`).bind(id,...params));
  for(const [id,slotKeys] of placements)slotKeys.forEach((slotKey,index)=>statements.push(c.env.DB.prepare(`INSERT INTO campaign_character_equipment_slots(campaign_id,character_id,equipment_instance_id,slot_key,slot_index) SELECT ?,?,?,?,? WHERE ${guard}`).bind(session.campaignId,loadout.characterId,id,slotKey,index+1,...params)));
  for(const row of retainedConnections)statements.push(
    c.env.DB.prepare(`DELETE FROM campaign_character_retained_attachments WHERE attachment_instance_id=? AND ${guard}`).bind(row.attachment_instance_id,...params),
    c.env.DB.prepare(`INSERT INTO campaign_equipment_attachments(equipment_instance_id,attachment_instance_id,weapon_slot_index,socket_index)
      SELECT ?,?,?,? WHERE ${guard}`).bind(row.equipmentInstanceId,row.attachment_instance_id,row.weapon_slot_index,row.socket_index,...params),
  );
  statements.push(...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion));
  const results=await c.env.DB.batch(statements);
  if((results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,0);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)});
}


export async function switchCharacterHero(c: Ctx) {
  const state = await context(c);
  if ('response' in state) return state.response;
  const { session, playerNumber, input, expectedCharacterVersion, loadout } = state;
  const heroSlug = typeof input.heroSlug === 'string' ? input.heroSlug : '';
  const expectedWagonVersion = integer(input.expectedWagonVersion);
  if (!heroDefinitionBySlug[heroSlug]) {
    return error(c, 400, 'INVALID_HERO', '請選擇有效的獵人。');
  }
  if (!expectedWagonVersion) {
    return error(c, 400, 'INVALID_VERSION', 'expectedWagonVersion 必須是正整數。');
  }
  if (input.confirmed !== true) {
    return error(c, 400, 'CONFIRMATION_REQUIRED', '請確認換角；目前角色面板上的裝備與附件會全部移入馬車。');
  }
  if (heroSlug === loadout.heroSlug) return c.json({ data: loadout });
  if (await wagonVersion(c.env.DB, session.campaignId) !== expectedWagonVersion) {
    return equipmentConflict(c, session, playerNumber, expectedCharacterVersion, expectedWagonVersion);
  }
  const used = await c.env.DB.prepare(
    'SELECT player_number FROM campaign_characters WHERE campaign_id=? AND hero_slug=? AND id<>?',
  ).bind(session.campaignId, heroSlug, loadout.characterId).first<{ player_number: number }>();
  if (used) return error(c, 409, 'HERO_ALREADY_SELECTED', '這位獵人已由同戰役的其他玩家選擇。');

  const before = {
    heroSlug: loadout.heroSlug,
    equipment: loadout.equipment,
    retainedAttachments: loadout.retainedAttachments,
    openedSlotKeys: loadout.openedSlotKeys,
  };
  const params = dualParams(loadout, session, expectedCharacterVersion, expectedWagonVersion);
  const guard = dualGuard();
  const statements: D1PreparedStatement[] = [
    versionAssertion(c.env.DB, session, loadout, playerNumber, expectedCharacterVersion, expectedWagonVersion),
    logStatement(c.env.DB, session, loadout, playerNumber, 'SWITCH_CHARACTER_HERO', String(loadout.characterId), before, {
      heroSlug,
      equipment: [],
      retainedAttachments: [],
      openedSlotKeys: [],
    }, false, params),
    logStatement(c.env.DB, session, loadout, playerNumber, 'RESET_CHARACTER_LOADOUT', String(loadout.characterId), {
      heroSlug: loadout.heroSlug,
      equipmentInstanceIds: [
        ...loadout.equipment.map(row => Number((row as { instanceId: number }).instanceId)),
        ...loadout.retainedAttachments.map(row => Number((row as { instanceId: number }).instanceId)),
      ],
    }, { location: 'WAGON' }, true, params),
    c.env.DB.prepare(`DELETE FROM campaign_equipment_attachments
      WHERE (
        equipment_instance_id IN (SELECT id FROM campaign_equipment_instances WHERE campaign_id=? AND character_id=?)
        OR attachment_instance_id IN (SELECT id FROM campaign_equipment_instances WHERE campaign_id=? AND character_id=?)
      ) AND ${guard}`).bind(
        session.campaignId, loadout.characterId,
        session.campaignId, loadout.characterId,
        ...params,
      ),
    c.env.DB.prepare(`DELETE FROM campaign_character_equipment_slots WHERE character_id=? AND campaign_id=? AND ${guard}`)
      .bind(loadout.characterId, session.campaignId, ...params),
    c.env.DB.prepare(`DELETE FROM campaign_character_retained_attachments WHERE character_id=? AND campaign_id=? AND ${guard}`)
      .bind(loadout.characterId, session.campaignId, ...params),
    c.env.DB.prepare(`DELETE FROM campaign_character_opened_slots WHERE character_id=? AND ${guard}`)
      .bind(loadout.characterId, ...params),
    c.env.DB.prepare(`UPDATE campaign_equipment_instances
      SET location_type='WAGON',character_id=NULL,updated_at=datetime('now')
      WHERE campaign_id=? AND character_id=? AND location_type='CHARACTER' AND ${guard}`)
      .bind(session.campaignId, loadout.characterId, ...params),
    c.env.DB.prepare(`UPDATE campaign_characters
      SET hero_slug=?,updated_at=datetime('now')
      WHERE id=? AND campaign_id=? AND version=? AND ${guard}`)
      .bind(heroSlug, loadout.characterId, session.campaignId, expectedCharacterVersion, ...params),
    ...versionStatements(c.env.DB, session, loadout, expectedCharacterVersion, expectedWagonVersion),
  ];

  try {
    const results = await c.env.DB.batch(statements);
    if ((results.at(-2)?.meta.changes ?? 0) < 1 || (results.at(-1)?.meta.changes ?? 0) < 1) {
      return equipmentConflict(c, session, playerNumber, expectedCharacterVersion, expectedWagonVersion);
    }
  } catch (cause) {
    if (String(cause).includes('UNIQUE constraint failed')) {
      return error(c, 409, 'HERO_ALREADY_SELECTED', '這位獵人已由同戰役的其他玩家選擇。');
    }
    if (String(cause).includes('chk_char_log_actor')) {
      return equipmentConflict(c, session, playerNumber, expectedCharacterVersion, expectedWagonVersion);
    }
    throw cause;
  }
  return c.json({ data: await loadCharacterLoadout(c.env.DB, session, playerNumber) });
}


export async function createAndEquipCatalogItem(c: Ctx) {
  const state = await context(c); if ('response' in state) return state.response;
  const { session, playerNumber, input, expectedCharacterVersion, loadout } = state;
  const itemId = integer(input.itemId);
  const startSlotKey = typeof input.startSlotKey === 'string' ? input.startSlotKey : '';
  const replaceInstanceId = integer(input.replaceInstanceId);
  const expectedWagonVersion = replaceInstanceId ? integer(input.expectedWagonVersion) : null;
  if (!itemId || !startSlotKey || (replaceInstanceId && !expectedWagonVersion)) {
    return error(c, 400, 'INVALID_CATALOG_EQUIPMENT', '物品、槽位或馬車版本不正確。');
  }
  if (expectedWagonVersion && await wagonVersion(c.env.DB, session.campaignId) !== expectedWagonVersion) {
    return equipmentConflict(c, session, playerNumber, expectedCharacterVersion, expectedWagonVersion);
  }
  const [item, replacedItem] = await Promise.all([
    c.env.DB.prepare(`
      SELECT i.id,i.name,i.slot_count,c.code AS category_code
      FROM items i JOIN item_categories c ON c.id=i.category_id
      WHERE i.id=? AND i.is_published=1 AND i.source_kind IN ('demo','reference','official')
    `).bind(itemId).first<Record<string, unknown>>(),
    replaceInstanceId
      ? characterItem(c.env.DB, session.campaignId, loadout.characterId, replaceInstanceId)
      : Promise.resolve(null),
  ]);
  if (!item) return error(c, 404, 'ITEM_NOT_FOUND', '找不到這件已發布物品。');
  if (replaceInstanceId && !replacedItem) return error(c, 404, 'CHARACTER_EQUIPMENT_NOT_FOUND', '角色面板上找不到要更換的裝備。');

  const placement = resolvePlacementSlotKeys({
    heroSlug: loadout.heroSlug, startSlotKey, categoryCode: String(item.category_code),
    slotCount: Number(item.slot_count), openedSlotKeys: new Set(loadout.openedSlotKeys),
    occupancies: occupancies(loadout), ignoreEquipmentInstanceId: replaceInstanceId ?? undefined,
  });
  if (!placement.ok) return error(c, 409, placement.code, placement.message);
  const retained = await alignedRetainedAttachments(c.env.DB, loadout, placement.slotKeys, itemId);
  if (!retained.ok) return error(c, 409, 'ATTACHMENT_INCOMPATIBLE', retained.message);
  const oldAttached = replaceInstanceId ? await connectedAttachments(c.env.DB, replaceInstanceId) : [];
  const anchors = oldAttached.map(row => ({ row, anchor: retainedAnchor(loadout, replaceInstanceId!, row.weapon_slot_index) }));
  if (anchors.some(entry => !entry.anchor)) return error(c, 409, 'ATTACHMENT_ANCHOR_INVALID', '無法判斷舊附件的保留位置。');
  const compaction = replaceInstanceId
    ? await planHandCompactionAfterReplacement(c.env.DB, loadout, replaceInstanceId, placement.slotKeys, anchors)
    : null;

  const guard = expectedWagonVersion ? dualGuard() : characterGuard();
  const params = expectedWagonVersion
    ? dualParams(loadout, session, expectedCharacterVersion, expectedWagonVersion)
    : characterParams(loadout, session, expectedCharacterVersion);
  const newestInstanceId = '(SELECT MAX(id) FROM campaign_equipment_instances)';
  const action = replaceInstanceId ? 'CREATE_AND_REPLACE_CATALOG_ITEM' : 'CREATE_AND_EQUIP_CATALOG_ITEM';
  const statements: D1PreparedStatement[] = [
    versionAssertion(c.env.DB, session, loadout, playerNumber, expectedCharacterVersion, expectedWagonVersion ?? undefined),
    c.env.DB.prepare(`
      INSERT INTO campaign_equipment_instances(id,campaign_id,item_id,location_type,character_id)
      SELECT next_id,?,?,'CHARACTER',?
      FROM (SELECT COALESCE(MAX(id),0)+1 AS next_id FROM campaign_equipment_instances)
      WHERE ${guard}
    `).bind(session.campaignId, itemId, loadout.characterId, ...params),
    logStatement(c.env.DB, session, loadout, playerNumber, action, String(itemId),
      replaceInstanceId ? { replacedInstanceId: replaceInstanceId } : null,
      { itemId, name: item.name, slotKeys: placement.slotKeys, source: 'CATALOG' }, false, params),
  ];
  if (replaceInstanceId) {
    statements.push(logStatement(c.env.DB, session, loadout, playerNumber, action, String(replaceInstanceId),
      { toWagon: replaceInstanceId }, { createdItemId: itemId }, true, params));
    for (const { row, anchor } of anchors) statements.push(
      c.env.DB.prepare(`INSERT INTO campaign_character_retained_attachments(attachment_instance_id,campaign_id,character_id,anchor_slot_key,socket_index)
        SELECT ?,?,?,?,? WHERE ${guard}`).bind(row.attachment_instance_id, session.campaignId, loadout.characterId, anchor, row.socket_index, ...params),
    );
    statements.push(
      c.env.DB.prepare(`DELETE FROM campaign_equipment_attachments WHERE equipment_instance_id=? AND ${guard}`).bind(replaceInstanceId, ...params),
      c.env.DB.prepare(`DELETE FROM campaign_character_equipment_slots WHERE equipment_instance_id=? AND ${guard}`).bind(replaceInstanceId, ...params),
      c.env.DB.prepare(`UPDATE campaign_equipment_instances SET location_type='WAGON',character_id=NULL,updated_at=datetime('now')
        WHERE id=? AND character_id=? AND ${guard}`).bind(replaceInstanceId, loadout.characterId, ...params),
    );
  }
  placement.slotKeys.forEach((slotKey, index) => statements.push(
    c.env.DB.prepare(`INSERT INTO campaign_character_equipment_slots(campaign_id,character_id,equipment_instance_id,slot_key,slot_index)
      SELECT ?,?,${newestInstanceId},?,? WHERE ${guard}`)
      .bind(session.campaignId, loadout.characterId, slotKey, index + 1, ...params),
  ));
  for (const row of retained.rows) statements.push(
    c.env.DB.prepare(`DELETE FROM campaign_character_retained_attachments WHERE attachment_instance_id=? AND ${guard}`).bind(row.attachment_instance_id, ...params),
    c.env.DB.prepare(`INSERT INTO campaign_equipment_attachments(equipment_instance_id,attachment_instance_id,weapon_slot_index,socket_index)
      SELECT ${newestInstanceId},?,?,? WHERE ${guard}`).bind(row.attachment_instance_id, row.weapon_slot_index, row.socket_index, ...params),
  );
  if (compaction) appendHandCompactionStatements(statements,c.env.DB,loadout,compaction,session.campaignId,guard,params);
  statements.push(...versionStatements(c.env.DB, session, loadout, expectedCharacterVersion, expectedWagonVersion ?? undefined));
  const results = await c.env.DB.batch(statements);
  const versionCount = expectedWagonVersion ? 2 : 1;
  if (results.slice(-versionCount).some(result => (result.meta.changes ?? 0) < 1)) {
    return equipmentConflict(c, session, playerNumber, expectedCharacterVersion, expectedWagonVersion ?? 0);
  }
  return c.json({ data: await loadCharacterLoadout(c.env.DB, session, playerNumber) }, 201);
}

export async function getAttachmentCatalogCandidates(c: Ctx) {
  const session = await requireCampaignSession(c);
  const playerNumber = integer(c.req.param('playerNumber'), 1, 4);
  const weaponInstanceId = integer(c.req.param('instanceId'));
  const weaponSlotIndex = integer(c.req.query('weaponSlotIndex'));
  const socketIndex = integer(c.req.query('socketIndex'));
  if (!playerNumber || !weaponInstanceId || !weaponSlotIndex || !socketIndex) {
    return error(c, 400, 'INVALID_ATTACHMENT_INPUT', '武器或孔位不正確。');
  }
  const loadout = await loadCharacterLoadout(c.env.DB, session, playerNumber);
  if (!loadout) return error(c, 404, 'CHARACTER_NOT_FOUND', '此席位尚未選擇角色。');
  const weapon = loadout.equipment.find(row => Number((row as { instanceId: number }).instanceId) === weaponInstanceId) as
    ({ itemId: number } & Record<string, unknown>) | undefined;
  if (!weapon) return error(c, 404, 'CHARACTER_EQUIPMENT_NOT_FOUND', '角色面板上找不到這件武器。');
  const result = await c.env.DB.prepare(`
    SELECT i.id AS item_id,i.name,i.image_url,ct.code AS connector_code,ct.name AS connector_name
    FROM weapon_sockets ws
    JOIN attachment_specs spec ON spec.connector_type_id=ws.connector_type_id
    JOIN items i ON i.id=spec.item_id AND i.is_published=1 AND i.source_kind IN ('demo','reference','official')
    JOIN connector_types ct ON ct.id=spec.connector_type_id
    LEFT JOIN campaign_equipment_attachments used ON used.equipment_instance_id=? AND used.weapon_slot_index=? AND used.socket_index=?
    WHERE ws.weapon_item_id=? AND ws.slot_index=? AND ws.socket_index=? AND used.attachment_instance_id IS NULL
    ORDER BY COALESCE(i.card_number,i.code),i.id
  `).bind(weaponInstanceId,weaponSlotIndex,socketIndex,weapon.itemId,weaponSlotIndex,socketIndex).all<Record<string,unknown>>();
  return c.json({data:{weaponInstanceId,weaponSlotIndex,socketIndex,items:result.results.map(row=>({
    itemId:Number(row.item_id),name:row.name,imageUrl:row.image_url,
    connectorCode:row.connector_code,connectorName:row.connector_name,
  }))}});
}

export async function createAndInstallCatalogAttachment(c: Ctx) {
  const state=await context(c); if('response'in state)return state.response;
  const {session,playerNumber,input,expectedCharacterVersion,loadout}=state;
  const weaponInstanceId=integer(c.req.param('instanceId'));
  const itemId=integer(input.itemId); const weaponSlotIndex=integer(input.weaponSlotIndex); const socketIndex=integer(input.socketIndex);
  if(!weaponInstanceId||!itemId||!weaponSlotIndex||!socketIndex)return error(c,400,'INVALID_ATTACHMENT_INPUT','附件、武器或孔位不正確。');
  const match=await c.env.DB.prepare(`
    SELECT i.name FROM campaign_equipment_instances weapon
    JOIN weapon_sockets ws ON ws.weapon_item_id=weapon.item_id AND ws.slot_index=? AND ws.socket_index=?
    JOIN attachment_specs spec ON spec.item_id=? AND spec.connector_type_id=ws.connector_type_id
    JOIN items i ON i.id=spec.item_id AND i.is_published=1 AND i.source_kind IN ('demo','reference','official')
    LEFT JOIN campaign_equipment_attachments used ON used.equipment_instance_id=weapon.id AND used.weapon_slot_index=? AND used.socket_index=?
    WHERE weapon.id=? AND weapon.campaign_id=? AND weapon.character_id=? AND weapon.location_type='CHARACTER'
      AND used.attachment_instance_id IS NULL
  `).bind(weaponSlotIndex,socketIndex,itemId,weaponSlotIndex,socketIndex,weaponInstanceId,session.campaignId,loadout.characterId).first<{name:string}>();
  if(!match)return error(c,409,'ATTACHMENT_INCOMPATIBLE','附件與武器孔位不相容，或孔位已被占用。');
  const guard=characterGuard(),params=characterParams(loadout,session,expectedCharacterVersion);
  const newest='(SELECT MAX(id) FROM campaign_equipment_instances)';
  const statements:D1PreparedStatement[]=[
    versionAssertion(c.env.DB,session,loadout,playerNumber,expectedCharacterVersion),
    c.env.DB.prepare(`INSERT INTO campaign_equipment_instances(id,campaign_id,item_id,location_type,character_id)
      SELECT next_id,?,?,'CHARACTER',? FROM(SELECT COALESCE(MAX(id),0)+1 next_id FROM campaign_equipment_instances) WHERE ${guard}`)
      .bind(session.campaignId,itemId,loadout.characterId,...params),
    logStatement(c.env.DB,session,loadout,playerNumber,'CREATE_AND_EQUIP_CHARACTER_ATTACHMENT',String(itemId),null,
      {itemId,name:match.name,weaponInstanceId,weaponSlotIndex,socketIndex,source:'CATALOG'},false,params),
    c.env.DB.prepare(`INSERT INTO campaign_equipment_attachments(equipment_instance_id,attachment_instance_id,weapon_slot_index,socket_index)
      SELECT ?,${newest},?,? WHERE ${guard}`).bind(weaponInstanceId,weaponSlotIndex,socketIndex,...params),
    ...versionStatements(c.env.DB,session,loadout,expectedCharacterVersion),
  ];
  const results=await c.env.DB.batch(statements);
  if((results.at(-1)?.meta.changes??0)<1)return equipmentConflict(c,session,playerNumber,expectedCharacterVersion,0);
  return c.json({data:await loadCharacterLoadout(c.env.DB,session,playerNumber)},201);
}
