import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_splitSqlQuery } from 'wrangler';
import app from '../../server/index';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const token = 'phase-e-token';
const tokenHash = createHash('sha256').update(token).digest('base64url');
const cookie = `hunter_session=${token}`;

let miniflare: Miniflare;
let db: D1Database;

async function executeSql(sql: string) {
  const statements = unstable_splitSqlQuery(sql).map(statement => db.prepare(statement));
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

async function applyMigrations() {
  const directory = join(projectRoot, 'migrations');
  const files = (await readdir(directory))
    .filter(name => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const file of files) {
    await executeSql(await readFile(join(directory, file), 'utf8'));
  }
}

async function seedCatalog() {
  await executeSql(`
    INSERT INTO items (
      id,code,slug,name,category_id,slot_count,consumption_type,usage_limit_type,
      description,original_effect_text,image_url,is_published,sort_order,
      original_name,usage_verified,image_alt,source_kind,source_note
    ) VALUES
      (1,'phase_weapon_2','phase-weapon-2','測試雙格武器',(SELECT id FROM item_categories WHERE code='weapon'),2,'permanent','unlimited','','Test weapon','/images/items/phase-weapon-2.webp',1,1,'Phase Weapon 2',1,'測試雙格武器','reference','Phase E fixture'),
      (2,'phase_weapon_1','phase-weapon-1','測試單格武器',(SELECT id FROM item_categories WHERE code='weapon'),1,'permanent','unlimited','','Test weapon','/images/items/phase-weapon-1.webp',1,2,'Phase Weapon 1',1,'測試單格武器','reference','Phase E fixture'),
      (3,'phase_attachment','phase-attachment','測試近戰附件',(SELECT id FROM item_categories WHERE code='weapon_attachment'),1,'permanent','unlimited','','Test attachment','/images/items/phase-attachment.webp',1,3,'Phase Attachment',1,'測試近戰附件','reference','Phase E fixture'),
      (4,'phase_armor','phase-armor','測試護甲',(SELECT id FROM item_categories WHERE code='armor'),1,'permanent','unlimited','','Test armor','/images/items/phase-armor.webp',1,4,'Phase Armor',1,'測試護甲','reference','Phase E fixture');
    INSERT INTO weapon_specs(item_id,notes) VALUES (1,'Phase E'),(2,'Phase E');
    INSERT INTO weapon_sockets(weapon_item_id,slot_index,socket_index,connector_type_id)
      VALUES
      (1,1,1,(SELECT id FROM connector_types WHERE code='melee')),
      (1,2,1,(SELECT id FROM connector_types WHERE code='rune')),
      (2,1,1,(SELECT id FROM connector_types WHERE code='melee'));
    INSERT INTO attachment_specs(item_id,connector_type_id,notes)
      VALUES (3,(SELECT id FROM connector_types WHERE code='melee'),'Phase E');
  `);
}

async function resetCampaignFixture() {
  await db.prepare('DELETE FROM campaigns').run();
  await executeSql(`
    INSERT INTO campaigns(id,campaign_name,password_hash,max_players,is_active)
      VALUES ('phase-e','Phase E','unused',4,1);
    INSERT INTO campaign_players(campaign_id,player_number,player_alias)
      VALUES ('phase-e',1,'Tester');
    INSERT INTO auth_sessions(token_hash,campaign_id,player_number,expires_at)
      VALUES ('${tokenHash}','phase-e',1,4102444800);
    INSERT INTO campaign_wagons(campaign_id,version,notes)
      VALUES ('phase-e',1,'');
    INSERT INTO campaign_characters(
      id,campaign_id,player_number,hero_slug,custom_name,morale_position,
      strength_level,knowledge_level,perception_level,agility_level,
      max_health_level,current_health,xp_tens,xp_ones,is_poisoned,notes,version
    ) VALUES (1,'phase-e',1,'brawler','Tester',0,0,0,0,0,0,1,0,0,0,'',1);
    INSERT INTO campaign_equipment_instances(id,campaign_id,item_id,location_type,character_id)
      VALUES
      (101,'phase-e',1,'WAGON',NULL),
      (102,'phase-e',2,'WAGON',NULL),
      (103,'phase-e',3,'WAGON',NULL),
      (104,'phase-e',4,'WAGON',NULL),
      (105,'phase-e',2,'WAGON',NULL);
  `);
}

async function request(path: string, method = 'GET', body?: Record<string, unknown>) {
  return app.request(path, {
    method,
    headers: {
      Cookie: cookie,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }, { DB: db } as never);
}

async function scalar(sql: string, ...params: unknown[]) {
  const row = await db.prepare(sql).bind(...params).first<Record<string, unknown>>();
  return row ? Object.values(row)[0] : null;
}

describe('Character Equipment Board Hono → D1 integration', () => {
  before(async () => {
    miniflare = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'phase-e-loadout' },
    }));
    db = await miniflare.getD1Database('DB');
    await applyMigrations();
    await seedCatalog();
  });

  beforeEach(async () => {
    await resetCampaignFixture();
  });

  after(async () => {
    await miniflare.dispose();
  });

  it('圖鑑、詳情、馬車、裝備面板與附件候選皆回傳 WebP 路徑', async () => {
    const catalog = await app.request('/api/items?q=phase', {}, { DB: db } as never);
    assert.equal(catalog.status, 200);
    const catalogPayload = await catalog.json() as any;
    assert.ok(catalogPayload.data.length >= 4);

    const detail = await app.request('/api/items/phase-weapon-2', {}, { DB: db } as never);
    assert.equal(detail.status, 200);

    const wagon = await request('/api/campaign/wagon');
    assert.equal(wagon.status, 200);

    const equipped = await request('/api/campaign/characters/1/equipment/101', 'PUT', {
      expectedCharacterVersion: 1, expectedWagonVersion: 1, startSlotKey: 'HAND_1',
    });
    assert.equal(equipped.status, 200);

    const responses = [
      catalogPayload,
      await detail.json(),
      await wagon.json(),
      await equipped.json(),
      await (await request('/api/campaign/characters/1/loadout')).json(),
      await (await request('/api/campaign/characters/1/equipment-candidates?slotKey=HAND_3')).json(),
      await (await request('/api/campaign/characters/1/equipment-catalog-candidates?slotKey=HAND_3')).json(),
      await (await request('/api/campaign/characters/1/equipment/101/attachment-candidates')).json(),
      await (await request('/api/campaign/characters/1/equipment/101/attachment-catalog-candidates')).json(),
    ];
    const imageUrls: string[] = [];
    const visit = (value: unknown) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'imageUrl' && typeof child === 'string' && child.startsWith('/images/items/')) imageUrls.push(child);
        else visit(child);
      }
    };
    responses.forEach(visit);
    assert.ok(imageUrls.length >= 10);
    assert.ok(imageUrls.every(url => url.endsWith('.webp')), imageUrls.join(', '));
  });

  it('從馬車放置裝備後同步更新角色、馬車、占格與日誌；過期版本不產生額外寫入', async () => {
    const response = await request('/api/campaign/characters/1/equipment/101', 'PUT', {
      expectedCharacterVersion: 1,
      expectedWagonVersion: 1,
      startSlotKey: 'HAND_1',
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.equal(payload.data.version, 2);
    assert.deepEqual(payload.data.equipment[0].slotKeys, ['HAND_1', 'HAND_2']);
    assert.equal(await scalar('SELECT version FROM campaign_wagons WHERE campaign_id=?', 'phase-e'), 2);
    assert.equal(await scalar('SELECT location_type FROM campaign_equipment_instances WHERE id=101'), 'CHARACTER');
    assert.equal(await scalar('SELECT COUNT(*) FROM campaign_character_equipment_slots WHERE equipment_instance_id=101'), 2);

    const logsBefore = Number(await scalar('SELECT COUNT(*) FROM character_activity_logs'));
    const stale = await request('/api/campaign/characters/1/equipment/102', 'PUT', {
      expectedCharacterVersion: 1,
      expectedWagonVersion: 1,
      startSlotKey: 'HAND_3',
    });
    assert.equal(stale.status, 409);
    const conflict = await stale.json() as any;
    assert.equal(conflict.error.code, 'CHARACTER_VERSION_CONFLICT');
    assert.equal(await scalar('SELECT location_type FROM campaign_equipment_instances WHERE id=102'), 'WAGON');
    assert.equal(Number(await scalar('SELECT COUNT(*) FROM character_activity_logs')), logsBefore);
  });

  it('可從物品列表建立裝備，全部移除後實體、占格與附件關聯均被清除', async () => {
    const created = await request('/api/campaign/characters/1/equipment-from-catalog', 'POST', {
      expectedCharacterVersion: 1,
      itemId: 4,
      startSlotKey: 'ARMOR_1',
    });
    assert.equal(created.status, 201);
    const createdPayload = await created.json() as any;
    assert.equal(createdPayload.data.version, 2);
    assert.equal(createdPayload.data.equipment[0].name, '測試護甲');
    const createdId = createdPayload.data.equipment[0].instanceId;

    const removed = await request('/api/campaign/characters/1/equipment/remove-all', 'POST', {
      expectedCharacterVersion: 2,
      confirmed: true,
    });
    assert.equal(removed.status, 200);
    const removedPayload = await removed.json() as any;
    assert.deepEqual(removedPayload.data.equipment, []);
    assert.equal(await scalar('SELECT COUNT(*) FROM campaign_equipment_instances WHERE id=?', createdId), 0);
    assert.equal(await scalar('SELECT COUNT(*) FROM campaign_character_equipment_slots WHERE character_id=1'), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM character_activity_logs WHERE action_type='REMOVE_ALL_CHARACTER_ITEMS'"), 1);
  });

  it('附件從馬車安裝後，主武器移回馬車時附件會留在原面板位置', async () => {
    const equipped = await request('/api/campaign/characters/1/equipment/101', 'PUT', {
      expectedCharacterVersion: 1,
      expectedWagonVersion: 1,
      startSlotKey: 'HAND_1',
    });
    assert.equal(equipped.status, 200);

    const attached = await request('/api/campaign/characters/1/equipment/101/attachments', 'POST', {
      expectedCharacterVersion: 2,
      expectedWagonVersion: 2,
      attachmentInstanceId: 103,
      weaponSlotIndex: 1,
      socketIndex: 1,
    });
    assert.equal(attached.status, 200);
    const attachedPayload = await attached.json() as any;
    assert.equal(attachedPayload.data.equipment[0].attachments[0].instanceId, 103);

    const unequipped = await request('/api/campaign/characters/1/equipment/101/unequip', 'POST', {
      expectedCharacterVersion: 3,
      expectedWagonVersion: 3,
    });
    assert.equal(unequipped.status, 200);
    const payload = await unequipped.json() as any;
    assert.deepEqual(payload.data.equipment, []);
    assert.equal(payload.data.retainedAttachments[0].instanceId, 103);
    assert.equal(payload.data.retainedAttachments[0].anchorSlotKey, 'ATTACHMENT_1');
    assert.equal(await scalar('SELECT location_type FROM campaign_equipment_instances WHERE id=101'), 'WAGON');
    assert.equal(await scalar('SELECT location_type FROM campaign_equipment_instances WHERE id=103'), 'CHARACTER');
  });

  it('可開啟 10 XP 格並以單次操作復原角色初始面板', async () => {
    const opened = await request('/api/campaign/characters/1/slots/HAND_4/open', 'POST', {
      expectedCharacterVersion: 1,
      confirmedManualXpAdjustment: true,
    });
    assert.equal(opened.status, 200);
    const openedPayload = await opened.json() as any;
    assert.deepEqual(openedPayload.data.openedSlotKeys, ['HAND_4']);

    const restored = await request('/api/campaign/characters/1/loadout/restore-initial', 'POST', {
      expectedCharacterVersion: 2,
      confirmed: true,
    });
    assert.equal(restored.status, 200);
    const restoredPayload = await restored.json() as any;
    assert.deepEqual(restoredPayload.data.openedSlotKeys, []);
    assert.equal(restoredPayload.data.version, 3);
    assert.equal(await scalar('SELECT COUNT(*) FROM campaign_character_opened_slots WHERE character_id=1'), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM character_activity_logs WHERE action_type='RESTORE_INITIAL_CHARACTER_BOARD'"), 1);
  });

  it('手部排序、一般移動與縮短替換會在同一批次維持連續占格', async () => {
    assert.equal((await request('/api/campaign/characters/1/equipment/101', 'PUT', {
      expectedCharacterVersion: 1, expectedWagonVersion: 1, startSlotKey: 'HAND_1',
    })).status, 200);
    assert.equal((await request('/api/campaign/characters/1/equipment/102', 'PUT', {
      expectedCharacterVersion: 2, expectedWagonVersion: 2, startSlotKey: 'HAND_3',
    })).status, 200);

    const reordered = await request('/api/campaign/characters/1/loadout/hand-order', 'PUT', {
      expectedCharacterVersion: 3,
      orderedInstanceIds: [102, 101],
    });
    assert.equal(reordered.status, 200);
    const reorderedPayload = await reordered.json() as any;
    assert.deepEqual(reorderedPayload.data.equipment.find((item: any) => item.instanceId === 102).slotKeys, ['HAND_1']);
    assert.deepEqual(reorderedPayload.data.equipment.find((item: any) => item.instanceId === 101).slotKeys, ['HAND_2', 'HAND_3']);

    const armor = await request('/api/campaign/characters/1/equipment-from-catalog', 'POST', {
      expectedCharacterVersion: 4, itemId: 4, startSlotKey: 'ARMOR_1',
    });
    assert.equal(armor.status, 201);
    const armorPayload = await armor.json() as any;
    const armorId = armorPayload.data.equipment.find((item: any) => item.itemId === 4).instanceId;
    const moved = await request('/api/campaign/characters/1/equipment/' + armorId + '/position', 'PATCH', {
      expectedCharacterVersion: 5, startSlotKey: 'ARMOR_2',
    });
    assert.equal(moved.status, 200);
    const movedPayload = await moved.json() as any;
    assert.deepEqual(movedPayload.data.equipment.find((item: any) => item.instanceId === armorId).slotKeys, ['ARMOR_2']);

    const replaced = await request('/api/campaign/characters/1/equipment/101/replace', 'POST', {
      expectedCharacterVersion: 6,
      expectedWagonVersion: 3,
      newInstanceId: 105,
      startSlotKey: 'HAND_2',
    });
    assert.equal(replaced.status, 200);
    const payload = await replaced.json() as any;
    assert.deepEqual(payload.data.equipment.find((item: any) => item.instanceId === 102).slotKeys, ['HAND_1']);
    assert.deepEqual(payload.data.equipment.find((item: any) => item.instanceId === 105).slotKeys, ['HAND_2']);
    assert.equal(await scalar('SELECT COUNT(*) FROM campaign_character_equipment_slots WHERE slot_key=?', 'HAND_3'), 0);
    assert.equal(await scalar('SELECT location_type FROM campaign_equipment_instances WHERE id=101'), 'WAGON');
    assert.equal(await scalar('SELECT location_type FROM campaign_equipment_instances WHERE id=105'), 'CHARACTER');
  });

  it('可從物品列表建立相容附件，並永久移除該獨立實體', async () => {
    assert.equal((await request('/api/campaign/characters/1/equipment/101', 'PUT', {
      expectedCharacterVersion: 1, expectedWagonVersion: 1, startSlotKey: 'HAND_1',
    })).status, 200);

    const attached = await request('/api/campaign/characters/1/equipment/101/attachments-from-catalog', 'POST', {
      expectedCharacterVersion: 2,
      itemId: 3,
      weaponSlotIndex: 1,
      socketIndex: 1,
    });
    assert.equal(attached.status, 201);
    const attachedPayload = await attached.json() as any;
    const attachmentId = attachedPayload.data.equipment[0].attachments[0].instanceId;
    assert.equal(await scalar('SELECT location_type FROM campaign_equipment_instances WHERE id=?', attachmentId), 'CHARACTER');
    assert.equal(await scalar('SELECT attachment_instance_id FROM campaign_equipment_attachments WHERE equipment_instance_id=101'), attachmentId);

    const removed = await request('/api/campaign/characters/1/equipment/101/attachments/' + attachmentId + '/remove', 'POST', {
      expectedCharacterVersion: 3,
      confirmed: true,
    });
    assert.equal(removed.status, 200);
    assert.equal(await scalar('SELECT COUNT(*) FROM campaign_equipment_instances WHERE id=?', attachmentId), 0);
    assert.equal(await scalar('SELECT COUNT(*) FROM campaign_equipment_attachments WHERE equipment_instance_id=101'), 0);
  });

  it('換角會把主裝備與附件一律移回馬車並清空角色面板狀態', async () => {
    assert.equal((await request('/api/campaign/characters/1/equipment/101', 'PUT', {
      expectedCharacterVersion: 1,
      expectedWagonVersion: 1,
      startSlotKey: 'HAND_1',
    })).status, 200);
    assert.equal((await request('/api/campaign/characters/1/equipment/101/attachments', 'POST', {
      expectedCharacterVersion: 2,
      expectedWagonVersion: 2,
      attachmentInstanceId: 103,
      weaponSlotIndex: 1,
      socketIndex: 1,
    })).status, 200);

    const switched = await request('/api/campaign/characters/1/switch-hero', 'POST', {
      expectedCharacterVersion: 3,
      expectedWagonVersion: 3,
      heroSlug: 'medic',
      confirmed: true,
    });
    assert.equal(switched.status, 200);
    const payload = await switched.json() as any;
    assert.equal(payload.data.heroSlug, 'medic');
    assert.deepEqual(payload.data.equipment, []);
    assert.deepEqual(payload.data.retainedAttachments, []);
    assert.deepEqual(payload.data.openedSlotKeys, []);
    assert.equal(await scalar("SELECT COUNT(*) FROM campaign_equipment_instances WHERE campaign_id='phase-e' AND location_type='CHARACTER'"), 0);
    assert.equal(await scalar("SELECT COUNT(*) FROM campaign_equipment_instances WHERE campaign_id='phase-e' AND location_type='WAGON'"), 5);
  });
});
