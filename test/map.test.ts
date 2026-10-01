import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCampaignMap } from '../server/map';

describe('Campaign Map API (/api/campaign/map)', () => {
  function createMockD1() {
    const mockD1: any = {
      prepare(sqlString: string) {
        return {
          bind(...params: unknown[]) {
            return {
              async all() {
                return { results: [] };
              },
              async raw() {
                // Drizzle D1PreparedQuery.values() 需要 stmt.bind(...).raw() 回傳陣列格式的列資料
                if (sqlString.includes('auth_sessions')) {
                  return [
                    [
                      'camp-test-1', // campaign_id
                      1,             // player_number
                      Math.floor(Date.now() / 1000) + 3600, // expires_at
                      'Test Campaign', // campaign_name
                      true,          // is_active
                      'Player 1',    // player_alias
                    ],
                  ];
                }
                if (sqlString.includes('campaign_maps')) {
                  return [['MAP', 'M01', '', '', 1]];
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
        return stmts.map(() => ({
          success: true,
          meta: { changes: 1 },
          results: [],
        }));
      },
    };
    return mockD1;
  }

  it('能正確載入地圖狀態並回傳包含 tiles, locations, cards 等地圖資訊', async () => {
    const mockD1 = createMockD1();

    // 模擬 Hono context 與合法 session
    const fakeContext: any = {
      env: { DB: mockD1 },
      req: {
        raw: {
          headers: new Headers({
            Cookie: 'hunter_session=valid-test-token',
          }),
        },
        header(name: string) {
          if (name.toLowerCase() === 'cookie') return 'hunter_session=valid-test-token';
          return undefined;
        },
        param: () => '',
        query: () => '',
      },
      json(data: any, status = 200) {
        return { data, status };
      },
    };

    // 模擬 auth.readSession 查到使用者
    const originalPrepare = mockD1.prepare;
    mockD1.prepare = function (sqlString: string) {
      if (sqlString.includes('auth_sessions')) {
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [
                    {
                      campaignId: 'camp-test-1',
                      playerNumber: 1,
                      expiresAt: Math.floor(Date.now() / 1000) + 3600,
                      campaignName: 'Test Campaign',
                      isActive: true,
                      playerAlias: 'Player 1',
                    },
                  ],
                };
              },
              async raw() {
                return [
                  [
                    'camp-test-1',
                    1,
                    Math.floor(Date.now() / 1000) + 3600,
                    'Test Campaign',
                    true,
                    'Player 1',
                  ],
                ];
              },
            };
          },
        };
      }
      return originalPrepare(sqlString);
    };

    const res: any = await getCampaignMap(fakeContext);
    assert.equal(res.status, 200);
    assert.ok(res.data.data, '應包含 data 物件');
    assert.equal(res.data.data.campaignId, 'camp-test-1');
    assert.equal(res.data.data.version, 1);
    assert.ok(Array.isArray(res.data.data.tiles), 'tiles 應為陣列');
    assert.ok(Array.isArray(res.data.data.locations), 'locations 應為陣列');
    assert.ok(Array.isArray(res.data.data.cards), 'cards 應為陣列');
    assert.ok(Array.isArray(res.data.data.cardProgress), 'cardProgress 應為陣列');
  });
});
