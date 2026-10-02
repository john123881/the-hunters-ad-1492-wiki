import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExpectedVersion,
  buildConflictPayload,
  respondVersionConflict,
  CONFLICT_MESSAGES,
} from '../../server/http/conflict';
import type { CampaignWagon, CampaignMap, CampaignCharacter } from '../../shared/types';

describe('Shared Conflict Responder (/server/http/conflict.ts)', () => {
  describe('parseExpectedVersion', () => {
    it('有效整數（>= 0）應原樣回傳', () => {
      assert.equal(parseExpectedVersion(0), 0);
      assert.equal(parseExpectedVersion(1), 1);
      assert.equal(parseExpectedVersion(42), 42);
      assert.equal(parseExpectedVersion('5'), 5);
      assert.equal(parseExpectedVersion('0'), 0);
    });

    it('無效值（負數、浮點數、非數字、null、undefined、boolean、空字串、空白字串、陣列）應回傳 null', () => {
      assert.equal(parseExpectedVersion(-1), null);
      assert.equal(parseExpectedVersion(-999), null);
      assert.equal(parseExpectedVersion(3.14), null);
      assert.equal(parseExpectedVersion('abc'), null);
      assert.equal(parseExpectedVersion(null), null);
      assert.equal(parseExpectedVersion(undefined), null);
      assert.equal(parseExpectedVersion(NaN), null);
      assert.equal(parseExpectedVersion(true), null);
      assert.equal(parseExpectedVersion(false), null);
      assert.equal(parseExpectedVersion(''), null);
      assert.equal(parseExpectedVersion('   '), null);
      assert.equal(parseExpectedVersion([]), null);
      assert.equal(parseExpectedVersion([1]), null);
      assert.equal(parseExpectedVersion({}), null);
    });
  });

  describe('buildConflictPayload & respondVersionConflict', () => {
    it('能針對 WAGON 正確組裝 409 conflict payload', () => {
      const mockWagon: CampaignWagon = {
        campaignId: 'camp-123',
        campaignName: 'Test Campaign',
        elapsedDays: 10,
        locationCode: 'M01',
        sharedGold: 50,
        notes: '',
        version: 5,
        upgrades: [],
        timeTokens: [],
        availableStoryCardCodes: [],
        resources: [],
        equipment: [],
      };

      const payload = buildConflictPayload({
        scope: 'WAGON',
        expectedVersion: 4,
        currentVersion: 5,
        latest: mockWagon,
      });

      assert.deepEqual(payload, {
        error: {
          code: 'WAGON_VERSION_CONFLICT',
          message: '馬車資料已被其他玩家更新。',
          conflict: {
            scope: 'WAGON',
            expectedVersion: 4,
            currentVersion: 5,
            latest: mockWagon,
          },
        },
      });

      // 測試 respondVersionConflict 送出 status 409
      let sentStatus = 0;
      let sentJson: any = null;
      const fakeContext: any = {
        json(data: any, status: number) {
          sentStatus = status;
          sentJson = data;
          return { data, status };
        },
      };

      respondVersionConflict(fakeContext, {
        scope: 'WAGON',
        expectedVersion: 4,
        currentVersion: 5,
        latest: mockWagon,
      });

      assert.equal(sentStatus, 409);
      assert.deepEqual(sentJson, payload);
    });

    it('能針對 MAP 正確組裝 409 conflict payload 並處理 expectedVersion 為 null 的情況', () => {
      const mockMap: CampaignMap = {
        campaignId: 'camp-123',
        version: 8,
        currentLocationType: 'MAP',
        currentLocationCode: 'M01',
        currentMapCode: 'M01',
        roadEventNotes: '',
        townEventNotes: '',
        tiles: [],
        locations: [],
        cards: [],
        cardProgress: [],
      };

      const payload = buildConflictPayload({
        scope: 'MAP',
        expectedVersion: null,
        currentVersion: 8,
        latest: mockMap,
      });

      assert.deepEqual(payload, {
        error: {
          code: 'MAP_VERSION_CONFLICT',
          message: '地圖資料已被其他玩家更新。',
          conflict: {
            scope: 'MAP',
            expectedVersion: null,
            currentVersion: 8,
            latest: mockMap,
          },
        },
      });
    });

    it('能針對 CHARACTER 正確組裝 409 conflict payload', () => {
      const mockCharacters: CampaignCharacter[] = [
        {
          id: 1,
          playerNumber: 1,
          heroSlug: 'tracker',
          customName: 'Hunter One',
          moralePosition: 0,
          strengthLevel: 1,
          knowledgeLevel: 1,
          perceptionLevel: 1,
          agilityLevel: 1,
          maxHealthLevel: 10,
          currentHealth: 10,
          xpTens: 0,
          xpOnes: 0,
          isPoisoned: false,
          notes: '',
          version: 3,
        },
      ];

      const payload = buildConflictPayload({
        scope: 'CHARACTER',
        expectedVersion: 2,
        currentVersion: 3,
        latest: mockCharacters,
      });

      assert.deepEqual(payload, {
        error: {
          code: 'CHARACTER_VERSION_CONFLICT',
          message: '角色資料已被其他玩家更新。',
          conflict: {
            scope: 'CHARACTER',
            expectedVersion: 2,
            currentVersion: 3,
            latest: mockCharacters,
          },
        },
      });
    });
  });
});
