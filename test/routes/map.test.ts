import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getCampaignMap } from '../../server/map';

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

  it('跨戰役隔離與 Token 一致性測試：驗證 campaign_id 條件能阻擋跨戰役 Token 穿透且 cards 與 cardProgress 保持一致', async () => {
    // 建立模擬 D1，包含 4 種典型狀態的卡片：
    // 1. S001: 戰役 A 自身的 Active Token (tokenCode: 'T1', unlockAtDay: 5)
    // 2. S002: 戰役 A 的 Removed Token (狀態為 REMOVED，不應關聯出 active token)
    // 3. S003: 沒有任何 Token 的卡片
    // 4. S005: 戰役 A 的 progress id = 100，但 Token 屬於戰役 B (campaign_id = 'camp-test-2')
    //         若 JOIN 缺少 tokens.campaignId 條件，S005 會錯誤關聯到戰役 B 的 Token！

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
                    ['camp-test-1', 1, Math.floor(Date.now() / 1000) + 3600, 'Campaign A', true, 'Player A'],
                  ];
                }
                if (sqlString.includes('campaign_maps')) {
                  return [['MAP', 'M01', '', '', 1]];
                }
                if (sqlString.includes('count(*)')) {
                  return [[20]];
                }

                // Drizzle select cards (from campaign_map_card_placements)
                if (sqlString.includes('campaign_map_card_placements') && !sqlString.includes('campaign_card_catalog')) {
                  // 回傳放置卡片：S001 (Active), S002 (Removed), S003 (No Token), S005 (B戰役 Token)
                  // 欄位: id, cardCode, cardType, status, locationType, locationCode, notes, isInTownDeck, tokenCode, unlockAtDay
                  const isTokenFilteredByCampaign = sqlString.includes('campaign_card_time_tokens') &&
                    sqlString.includes('"campaign_card_time_tokens"."campaign_id" =');

                  return [
                    [1, 'S001', 'STORY', 'IN_PLAY', 'MAP', 'M01', '', false, 'A', 5],
                    [2, 'S002', 'STORY', 'IN_PLAY', 'MAP', 'M01', '', false, null, null],
                    [3, 'S003', 'STORY', 'IN_PLAY', 'MAP', 'M01', '', false, null, null],
                    [4, 'S005', 'STORY', 'IN_PLAY', 'MAP', 'M01', '', false, isTokenFilteredByCampaign ? null : 'TOKEN_FROM_CAMPAIGN_B', isTokenFilteredByCampaign ? null : 99],
                  ];
                }

                // Drizzle select cardProgress (from campaign_card_catalog)
                if (sqlString.includes('campaign_card_catalog')) {
                  // 欄位: cardCode, cardType, edition, isResolved, locationType, locationCode, tokenCode, unlockAtDay
                  const isTokenFilteredByCampaign = sqlString.includes('campaign_card_time_tokens') &&
                    sqlString.includes('"campaign_card_time_tokens"."campaign_id" =');

                  return [
                    ['S001', 'STORY', 1, 0, 'MAP', 'M01', 'A', 5],
                    ['S002', 'STORY', 1, 0, 'MAP', 'M01', null, null],
                    ['S003', 'STORY', 1, 0, 'MAP', 'M01', null, null],
                    ['S005', 'STORY', 1, 0, 'MAP', 'M01', isTokenFilteredByCampaign ? null : 'TOKEN_FROM_CAMPAIGN_B', isTokenFilteredByCampaign ? null : 99],
                  ];
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
        return stmts.map(() => ({ success: true, meta: { changes: 1 }, results: [] }));
      },
    };

    const fakeContext: any = {
      env: { DB: mockD1 },
      req: {
        raw: { headers: new Headers({ Cookie: 'hunter_session=valid-test-token' }) },
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

    const res: any = await getCampaignMap(fakeContext);
    assert.equal(res.status, 200);

    const cards: any[] = res.data.data.cards;
    const cardProgress: any[] = res.data.data.cardProgress;

    // 1. 驗證 Active Token：兩處皆有相同的 tokenCode 與 unlockAtDay
    const activePlaced = cards.find(c => c.cardCode === 'S001');
    const activeGlobal = cardProgress.find(c => c.cardCode === 'S001');
    assert.deepEqual(activePlaced?.timeToken, { tokenCode: 'A', unlockAtDay: 5 });
    assert.deepEqual(activeGlobal?.timeToken, { tokenCode: 'A', unlockAtDay: 5 });
    assert.deepEqual(
      activePlaced?.timeToken,
      activeGlobal?.timeToken,
      'S001 Active Token 在 cards 與 cardProgress 應一致'
    );

    // 2. 驗證 Removed Token：兩處皆為 null
    const removedPlaced = cards.find(c => c.cardCode === 'S002');
    const removedGlobal = cardProgress.find(c => c.cardCode === 'S002');
    assert.equal(removedPlaced?.timeToken, null);
    assert.equal(removedGlobal?.timeToken, null);

    // 3. 驗證無 Token：兩處皆為 null
    const nonePlaced = cards.find(c => c.cardCode === 'S003');
    const noneGlobal = cardProgress.find(c => c.cardCode === 'S003');
    assert.equal(nonePlaced?.timeToken, null);
    assert.equal(noneGlobal?.timeToken, null);

    // 4. 關鍵驗證：跨戰役異常資料（S005 的 progressId 關聯到 B 戰役的 Token）
    // 因為查詢條件包含 tokens.campaignId = session.campaignId，故不應被關聯！
    const alienPlaced = cards.find(c => c.cardCode === 'S005');
    const alienGlobal = cardProgress.find(c => c.cardCode === 'S005');
    assert.equal(alienPlaced?.timeToken, null, 'cards 查詢應阻擋跨戰役 Token 穿透');
    assert.equal(alienGlobal?.timeToken, null, 'cardProgress 查詢應阻擋跨戰役 Token 穿透');
    assert.deepEqual(alienPlaced?.timeToken, alienGlobal?.timeToken, '跨戰役異常資料兩處應一致為 null');
  });
});
