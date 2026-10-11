import { expect, test, type Page } from '@playwright/test';
import type { CampaignWagon } from '../../shared/types';

const session = {
  campaignId: 'wagon-mutation-test',
  campaignName: '馬車共用更新測試',
  playerNumber: 1,
  playerAlias: 'XD',
  isActive: true,
  expiresAt: '2099-01-01T00:00:00.000Z',
  players: [{ playerNumber: 1, playerAlias: 'XD' }],
};

function makeWagon(): CampaignWagon {
  return {
    campaignId: session.campaignId,
    campaignName: session.campaignName,
    elapsedDays: 16,
    locationCode: '',
    sharedGold: 19,
    notes: '',
    version: 7,
    upgrades: [],
    timeTokens: [],
    availableStoryCardCodes: [],
    resources: [],
    equipment: [],
  };
}

async function installApi(page: Page) {
  let wagon = makeWagon();
  let goldPatchCount = 0;
  const goldRequests: Array<{ sharedGold: number; expectedVersion: number }> = [];

  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: session } }));
  await page.route('**/api/campaign/map', route => route.fulfill({
    json: {
      data: {
        campaignId: session.campaignId,
        version: 1,
        currentLocationType: null,
        currentLocationCode: null,
        currentMapCode: null,
        roadEventNotes: '',
        townEventNotes: '',
        tiles: [],
        locations: [],
        cards: [],
        cardProgress: [],
      },
    },
  }));
  await page.route('**/api/campaign/wagon/gold', route => {
    goldPatchCount += 1;
    const body = route.request().postDataJSON() as { sharedGold: number; expectedVersion: number };
    goldRequests.push(body);

    if (goldPatchCount === 1) {
      wagon = { ...wagon, sharedGold: 18, version: 8 };
      return route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'WAGON_VERSION_CONFLICT',
            message: '馬車資料已被其他玩家更新。',
            conflict: {
              scope: 'WAGON',
              expectedVersion: 7,
              currentVersion: 8,
              latest: wagon,
            },
          },
        },
      });
    }

    wagon = { ...wagon, sharedGold: body.sharedGold, version: 9 };
    return route.fulfill({ json: { data: wagon } });
  });
  await page.route('**/api/campaign/wagon', route => route.fulfill({ json: { data: wagon } }));

  return { goldRequests };
}

test('wagon gold adopts the latest version and reapplies the pending change', async ({ page }) => {
  const api = await installApi(page);
  await page.goto('/campaigns/wagon');

  await expect(page.getByText('馬車全景總覽')).toBeVisible();
  await page.getByRole('button', { name: '共用金錢增加 1' }).click();
  await expect(page.getByText('馬車資料已被其他玩家更新')).toBeVisible();

  await page.getByRole('button', { name: '保留我的修改並重新套用' }).click();

  await expect(page.getByText('團隊共用金錢已更新為 20')).toBeVisible();
  await expect(page.locator('.shared-gold strong')).toHaveText('20');
  expect(api.goldRequests).toEqual([
    { sharedGold: 20, expectedVersion: 7 },
    { sharedGold: 20, expectedVersion: 8 },
  ]);
});
