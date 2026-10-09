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
const token = 'map-batch-token';
const tokenHash = createHash('sha256').update(token).digest('base64url');
const cookie = `hunter_session=${token}`;

let miniflare: Miniflare;
let db: D1Database;

async function executeSql(source: string) {
  const statements = unstable_splitSqlQuery(source).map(statement => db.prepare(statement));
  for (let index = 0; index < statements.length; index += 50) {
    await db.batch(statements.slice(index, index + 50));
  }
}

async function applyMigrations() {
  const files = (await readdir(join(projectRoot, 'migrations')))
    .filter(name => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const file of files) await executeSql(await readFile(join(projectRoot, 'migrations', file), 'utf8'));
}

async function resetFixture() {
  await db.prepare('DELETE FROM campaigns').run();
  await executeSql(`
    INSERT INTO campaigns(id,campaign_name,password_hash,max_players,is_active)
      VALUES ('map-batch','Map Batch','unused',4,1);
    INSERT INTO campaign_players(campaign_id,player_number,player_alias)
      VALUES ('map-batch',1,'Tester');
    INSERT INTO auth_sessions(token_hash,campaign_id,player_number,expires_at)
      VALUES ('${tokenHash}','map-batch',1,4102444800);
    INSERT INTO campaign_maps(campaign_id,version,current_location_type,current_location_code)
      VALUES ('map-batch',1,'MAP','M01');
  `);
}

async function request(path: string, method = 'GET', payload?: Record<string, unknown>) {
  return app.request(path, {
    method,
    headers: {
      Cookie: cookie,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  }, { DB: db } as never);
}

async function row(sql: string, ...params: unknown[]) {
  return db.prepare(sql).bind(...params).first<Record<string, unknown>>();
}

describe('Campaign map batch Hono → D1 integration', () => {
  before(async () => {
    miniflare = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'map-batch-integration' },
    }));
    db = await miniflare.getD1Database('DB');
    await applyMigrations();
  });

  beforeEach(async () => {
    await resetFixture();
    const initialized = await request('/api/campaign/map');
    assert.equal(initialized.status, 200);
    await db.prepare("UPDATE campaign_map_tiles SET notes='保留備註' WHERE campaign_id='map-batch' AND map_code='M01'").run();
  });

  after(async () => {
    await miniflare.dispose();
  });

  it('以單一版本原子批次更新地圖卡與地點卡，並保留個別備註', async () => {
    const maps = await request('/api/campaign/map/tiles/batch', 'PATCH', {
      expectedVersion: 1,
      codes: ['M01', 'M02'],
      isRevealed: true,
    });
    assert.equal(maps.status, 200);
    const mapsPayload = await maps.json() as any;
    assert.equal(mapsPayload.data.version, 2);
    assert.equal(mapsPayload.data.tiles.find((tile: any) => tile.mapCode === 'M01').isRevealed, true);
    assert.equal(mapsPayload.data.tiles.find((tile: any) => tile.mapCode === 'M02').isRevealed, true);
    assert.equal((await row("SELECT notes,face FROM campaign_map_tiles WHERE campaign_id=? AND map_code='M01'", 'map-batch'))?.notes, '保留備註');
    assert.equal((await row("SELECT face FROM campaign_map_tiles WHERE campaign_id=? AND map_code='M01'", 'map-batch'))?.face, 'FRONT');

    const locations = await request('/api/campaign/map/locations/batch', 'PATCH', {
      expectedVersion: 2,
      codes: ['L01', 'L14'],
      isRevealed: true,
    });
    assert.equal(locations.status, 200);
    const locationsPayload = await locations.json() as any;
    assert.equal(locationsPayload.data.version, 3);
    assert.equal(locationsPayload.data.locations.find((card: any) => card.locationCode === 'L01').face, 'FRONT');
    assert.equal(locationsPayload.data.locations.find((card: any) => card.locationCode === 'L14').face, 'FRONT');

    assert.equal(Number((await row("SELECT COUNT(*) AS count FROM map_activity_logs WHERE campaign_id=? AND action_type IN ('BATCH_UPDATE_MAP_TILES','BATCH_UPDATE_LOCATION_CARDS')", 'map-batch'))?.count), 2);
  });

  it('單一翻轉按鍵可讓混合狀態的選取卡各自反轉', async () => {
    await db.prepare("UPDATE campaign_location_cards SET is_revealed=1,face='FRONT' WHERE campaign_id='map-batch' AND location_code='L02'").run();
    const response = await request('/api/campaign/map/locations/batch', 'PATCH', {
      expectedVersion: 1,
      updates: [
        { code: 'L01', isRevealed: true },
        { code: 'L02', isRevealed: false },
      ],
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as any;
    assert.equal(payload.data.version, 2);
    assert.equal(payload.data.locations.find((card: any) => card.locationCode === 'L01').isRevealed, true);
    assert.equal(payload.data.locations.find((card: any) => card.locationCode === 'L02').isRevealed, false);
  });

  it('版本衝突時整批不更新', async () => {
    const response = await request('/api/campaign/map/tiles/batch', 'PATCH', {
      expectedVersion: 99,
      codes: ['M01', 'M02'],
      isRevealed: true,
    });
    assert.equal(response.status, 409);
    const payload = await response.json() as any;
    assert.equal(payload.error.code, 'MAP_VERSION_CONFLICT');
    const changed = await row("SELECT SUM(is_revealed) AS total FROM campaign_map_tiles WHERE campaign_id=? AND map_code IN ('M01','M02')", 'map-batch');
    assert.equal(Number(changed?.total), 0);
  });

  it('拒絕空清單、重複後為空以外的非法卡號', async () => {
    const empty = await request('/api/campaign/map/locations/batch', 'PATCH', {
      expectedVersion: 1,
      codes: [],
      isRevealed: false,
    });
    assert.equal(empty.status, 400);

    const invalid = await request('/api/campaign/map/tiles/batch', 'PATCH', {
      expectedVersion: 1,
      codes: ['M01', 'M99'],
      isRevealed: true,
    });
    assert.equal(invalid.status, 400);
  });
});
