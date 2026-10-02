import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import app from '../../server/index';

describe('Campaign Mutation Routes Conflict & Freeze Unit Tests', () => {
  function createMockD1(options: {
    wagonVersion?: number;
    mapVersion?: number;
    characterVersion?: number;
    isActive?: boolean;
    failUpdate?: boolean;
  } = {}) {
    const {
      wagonVersion = 3,
      mapVersion = 5,
      characterVersion = 2,
      isActive = true,
      failUpdate = false,
    } = options;

    const executedBatch: any[] = [];

    const mockD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            return {
              async all() {
                return { results: [] };
              },
              async raw() {
                if (sqlString.includes('auth_sessions')) {
                  return [
                    [
                      'camp-test-1', // campaign_id
                      1,             // player_number
                      Math.floor(Date.now() / 1000) + 3600, // expires_at
                      'Test Campaign', // campaign_name
                      isActive,      // is_active
                      'Player 1',    // player_alias
                    ],
                  ];
                }
                if (sqlString.includes('campaign_wagons')) {
                  return [
                    [
                      10,            // elapsedDays
                      'M01',         // locationCode
                      50,            // sharedGold
                      '',            // notes
                      wagonVersion,  // version
                      'Test Campaign', // campaignName
                    ],
                  ];
                }
                if (sqlString.includes('campaign_maps')) {
                  return [['MAP', 'M01', '', '', mapVersion]];
                }
                if (sqlString.includes('campaign_characters')) {
                  // 如果是 select()（全欄位），第 2 欄為 campaignId
                  // 1: id, 2: campaignId, 3: playerNumber, 4: heroSlug, 5: customName,
                  // 6: morale, 7: strength, 8: knowledge, 9: perception, 10: agility,
                  // 11: maxHealth, 12: currentHealth, 13: xpTens, 14: xpOnes, 15: isPoisoned, 16: notes, 17: version
                  return [
                    [
                      1, // id
                      'camp-test-1', // campaign_id
                      1, // player_number
                      'huntress', // hero_slug
                      'Hunter 1', // custom_name
                      0, 1, 1, 1, 1, 5, 10, 0, 0, 0, '', characterVersion,
                    ],
                  ];
                }
                if (sqlString.includes('count(*)')) {
                  return [[20]];
                }
                return [];
              },
              async run() {
                return { meta: { changes: 1 }, success: true };
              },
            };
          },
        };
      },
      async batch(stmts: any[]) {
        executedBatch.push(...stmts);
        return stmts.map((_, idx) => ({
          success: true,
          meta: { changes: failUpdate ? 0 : 1 },
          results: [],
        }));
      },
    };
    return { mockD1, executedBatch };
  }

  it('全域凍結中介層：戰役凍結 (isActive = false) 時，任何寫入 route 都會被擋下回傳 409 CAMPAIGN_INACTIVE', async () => {
    const { mockD1, executedBatch } = createMockD1({ isActive: false });

    // 嘗試更新馬車天數
    const wagonRes = await app.request('/api/campaign/wagon/day', {
      method: 'PATCH',
      headers: {
        'Cookie': 'hunter_session=test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ elapsedDays: 15, expectedVersion: 3 }),
    }, { DB: mockD1 } as any);

    assert.equal(wagonRes.status, 409);
    const wagonData: any = await wagonRes.json();
    assert.equal(wagonData.error.code, 'CAMPAIGN_INACTIVE');
    assert.equal(executedBatch.length, 0, '凍結時絕不執行任何 D1 batch 寫入');

    // 嘗試更新地圖迷霧
    const mapRes = await app.request('/api/campaign/map/tiles/M01', {
      method: 'PATCH',
      headers: {
        'Cookie': 'hunter_session=test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRevealed: true, expectedVersion: 5 }),
    }, { DB: mockD1 } as any);

    assert.equal(mapRes.status, 409);
    const mapData: any = await mapRes.json();
    assert.equal(mapData.error.code, 'CAMPAIGN_INACTIVE');
    assert.equal(executedBatch.length, 0, '凍結時地圖更新亦絕不執行 D1 batch');
  });

  it('馬車更新遭遇版本衝突時，回傳 409 WAGON_VERSION_CONFLICT 與標準 conflict payload', async () => {
    const { mockD1 } = createMockD1({ wagonVersion: 4, failUpdate: true });

    const res = await app.request('/api/campaign/wagon/day', {
      method: 'PATCH',
      headers: {
        'Cookie': 'hunter_session=test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ elapsedDays: 15, expectedVersion: 3 }), // 傳入舊版本 3 (當前是 4)
    }, { DB: mockD1 } as any);

    assert.equal(res.status, 409);
    const data: any = await res.json();
    assert.equal(data.error.code, 'WAGON_VERSION_CONFLICT');
    assert.equal(data.error.conflict.scope, 'WAGON');
    assert.equal(data.error.conflict.expectedVersion, 3);
    assert.equal(data.error.conflict.currentVersion, 4);
    assert.ok(data.error.conflict.latest, '必須包含 latest 最新馬車資料');
  });

  it('地圖迷霧更新遭遇版本衝突時，回傳 409 MAP_VERSION_CONFLICT 與標準 conflict payload', async () => {
    const { mockD1 } = createMockD1({ mapVersion: 8, failUpdate: true });

    const res = await app.request('/api/campaign/map/tiles/M01', {
      method: 'PATCH',
      headers: {
        'Cookie': 'hunter_session=test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRevealed: true, expectedVersion: 7 }),
    }, { DB: mockD1 } as any);

    assert.equal(res.status, 409);
    const data: any = await res.json();
    assert.equal(data.error.code, 'MAP_VERSION_CONFLICT');
    assert.equal(data.error.conflict.scope, 'MAP');
    assert.equal(data.error.conflict.expectedVersion, 7);
    assert.equal(data.error.conflict.currentVersion, 8);
    assert.ok(data.error.conflict.latest, '必須包含 latest 最新地圖資料');
  });

  it('角色更新遭遇版本衝突時，回傳 409 CHARACTER_VERSION_CONFLICT 與標準 conflict payload', async () => {
    const { mockD1 } = createMockD1({ characterVersion: 3, failUpdate: true });

    const res = await app.request('/api/campaign/characters/1', {
      method: 'PUT',
      headers: {
        'Cookie': 'hunter_session=test-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        heroSlug: 'huntress',
        customName: 'Hunter 1',
        moralePosition: 0,
        strengthLevel: 1,
        knowledgeLevel: 1,
        perceptionLevel: 1,
        agilityLevel: 1,
        maxHealthLevel: 5,
        currentHealth: 10,
        xpTens: 0,
        xpOnes: 0,
        isPoisoned: false,
        notes: '',
        expectedVersion: 2, // 傳入舊版本 2 (當前是 3)
      }),
    }, { DB: mockD1 } as any);

    assert.equal(res.status, 409);
    const data: any = await res.json();
    assert.equal(data.error.code, 'CHARACTER_VERSION_CONFLICT');
    assert.equal(data.error.conflict.scope, 'CHARACTER');
    assert.equal(data.error.conflict.expectedVersion, 2);
    assert.equal(data.error.conflict.currentVersion, 3);
    assert.ok(Array.isArray(data.error.conflict.latest), 'Character conflict latest 必須為角色陣列');
  });
});
