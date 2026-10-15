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
const tokens = {
  alpha: 'audio-alpha-token',
  beta: 'audio-beta-token',
};
const cookies = {
  alpha: 'hunter_session=' + tokens.alpha,
  beta: 'hunter_session=' + tokens.beta,
};

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
  const alphaHash = createHash('sha256').update(tokens.alpha).digest('base64url');
  const betaHash = createHash('sha256').update(tokens.beta).digest('base64url');
  await db.batch([
    db.prepare("INSERT INTO campaigns(id,campaign_name,password_hash,max_players,is_active) VALUES ('audio-alpha','Alpha','unused',4,1)"),
    db.prepare("INSERT INTO campaigns(id,campaign_name,password_hash,max_players,is_active) VALUES ('audio-beta','Beta','unused',4,1)"),
    db.prepare("INSERT INTO campaign_players(campaign_id,player_number,player_alias) VALUES ('audio-alpha',1,'甲隊獵人')"),
    db.prepare("INSERT INTO campaign_players(campaign_id,player_number,player_alias) VALUES ('audio-beta',2,'乙隊獵人')"),
    db.prepare("INSERT INTO auth_sessions(token_hash,campaign_id,player_number,expires_at) VALUES (?,'audio-alpha',1,4102444800)").bind(alphaHash),
    db.prepare("INSERT INTO auth_sessions(token_hash,campaign_id,player_number,expires_at) VALUES (?,'audio-beta',2,4102444800)").bind(betaHash),
  ]);
}

async function request(cookie: string | null, method = 'GET', payload?: Record<string, unknown>) {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (payload) headers['Content-Type'] = 'application/json';
  return app.request('/api/campaign/audio-playback', {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  }, { DB: db } as never);
}

describe('Campaign audio playback Hono → D1 integration', () => {
  before(async () => {
    miniflare = new Miniflare(convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'audio-playback-integration' },
    }));
    db = await miniflare.getD1Database('DB');
    await applyMigrations();
  });

  beforeEach(resetFixture);

  after(async () => {
    await miniflare.dispose();
  });

  it('追加成功播放並以事件 ID 去重', async () => {
    const body = { clientEventId: 'event-alpha-0001', code: 'q-1', title: '任務 Q1' };
    const first = await request(cookies.alpha, 'POST', body);
    const duplicate = await request(cookies.alpha, 'POST', body);

    assert.equal(first.status, 201);
    assert.equal(duplicate.status, 201);
    const firstPayload = await first.json() as any;
    const duplicatePayload = await duplicate.json() as any;
    assert.equal(firstPayload.data.id, duplicatePayload.data.id);
    assert.equal(firstPayload.data.code, 'Q1');
    assert.equal(firstPayload.data.category, 'quest');
    assert.equal(firstPayload.data.playerAlias, '甲隊獵人');

    const count = await db.prepare("SELECT count(*) AS count FROM campaign_audio_playback_logs WHERE campaign_id='audio-alpha'").first<{ count: number }>();
    assert.equal(Number(count?.count), 1);
  });

  it('依登入戰役隔離紀錄並拒絕未登入存取', async () => {
    await request(cookies.alpha, 'POST', { clientEventId: 'event-alpha-0002', code: '3722', title: '劇情 37.22' });
    await request(cookies.beta, 'POST', { clientEventId: 'event-beta-00001', code: 'V1', title: '任務勝利 V1' });

    const alpha = await request(cookies.alpha);
    const beta = await request(cookies.beta);
    const anonymous = await request(null);

    assert.deepEqual((await alpha.json() as any).data.map((entry: any) => entry.code), ['3722']);
    assert.deepEqual((await beta.json() as any).data.map((entry: any) => entry.code), ['V1']);
    assert.equal(anonymous.status, 401);
  });

  it('驗證輸入並只回傳最近 50 筆', async () => {
    const invalid = await request(cookies.alpha, 'POST', {
      clientEventId: 'event-invalid-1',
      code: 'not-a-code',
      title: '錯誤',
    });
    assert.equal(invalid.status, 400);

    const statements = Array.from({ length: 55 }, (_, index) => db.prepare(
      "INSERT INTO campaign_audio_playback_logs(campaign_id,client_event_id,code,category,title,player_number,player_alias) VALUES ('audio-alpha',?,'Q1','quest','任務 Q1',1,'甲隊獵人')",
    ).bind('bulk-event-' + String(index).padStart(3, '0')));
    await db.batch(statements);

    const response = await request(cookies.alpha);
    const payload = await response.json() as any;
    assert.equal(payload.data.length, 50);
    assert.ok(payload.data[0].id > payload.data[49].id);
  });
});
