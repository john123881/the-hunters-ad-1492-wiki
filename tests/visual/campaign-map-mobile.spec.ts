import { expect, test, type Page, type Route } from '@playwright/test';

const session = {
  campaignId: 'visual-test',
  campaignName: '手機視覺測試',
  playerNumber: 1,
  playerAlias: 'XD',
  isActive: true,
  expiresAt: '2099-01-01T00:00:00.000Z',
  players: [{ playerNumber: 1, playerAlias: 'XD' }],
};

function makeMap() {
  return {
    campaignId: 'visual-test',
    version: 7,
    currentLocationType: null as 'MAP' | 'LOCATION' | null,
    currentLocationCode: null as string | null,
    currentMapCode: null as string | null,
    roadEventNotes: '',
    townEventNotes: '',
    tiles: Array.from({ length: 20 }, (_, index) => ({
      mapCode: 'M' + String(index + 1).padStart(2, '0'),
      rowIndex: Math.floor(index / 4) + 1,
      columnIndex: index % 4 + 1,
      isRevealed: index < 4,
      face: index < 4 ? 'FRONT' : 'BACK',
      resourceNotes: '',
      notes: '',
    })),
    locations: Array.from({ length: 14 }, (_, index) => ({
      locationCode: 'L' + String(index + 1).padStart(2, '0'),
      isRevealed: index < 2,
      face: index < 2 ? 'FRONT' : 'BACK',
      resourceNotes: '',
      notes: '',
    })),
    cards: [
      {
        id: 1, cardCode: 'S005', cardType: 'STORY', status: 'PENDING',
        locationType: 'LOCATION', locationCode: 'L01', notes: '舊備註', isInTownDeck: false,
        timeToken: { tokenCode: 'A', unlockAtDay: 19 },
      },
      {
        id: 3, cardCode: 'S004', cardType: 'STORY', status: 'PENDING',
        locationType: 'LOCATION', locationCode: 'L01', notes: '', isInTownDeck: false,
        timeToken: null,
      },
      {
        id: 2, cardCode: 'F001', cardType: 'FEATURE', status: 'PENDING',
        locationType: 'LOCATION', locationCode: 'L01', notes: '', isInTownDeck: false,
        timeToken: null,
      },
    ],
    cardProgress: [],
  };
}

async function installApi(
  page: Page,
  conflictFirst = false,
  position?: { locationType: 'MAP' | 'LOCATION'; locationCode: string; mapCode: string },
) {
  let map = {
    ...makeMap(),
    currentLocationType: position?.locationType ?? null,
    currentLocationCode: position?.locationCode ?? null,
    currentMapCode: position?.mapCode ?? null,
  };
  let patchCount = 0;
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: session } }));
  await page.route('**/api/campaign/wagon/time-tokens', async route => {
    const body = route.request().postDataJSON();
    map = {
      ...map,
      cards: map.cards.map(card => card.cardCode === body.storyCardCode
        ? { ...card, timeToken: { tokenCode: body.tokenCode, unlockAtDay: 20 } }
        : card),
    };
    return route.fulfill({ status: 201, json: { data: {} } });
  });
  await page.route('**/api/campaign/map**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'GET') return route.fulfill({ json: { data: map } });
    if (request.method() === 'PATCH' && request.url().includes('/locations/')) {
      const body = request.postDataJSON();
      map = {
        ...map,
        version: map.version + 1,
        locations: map.locations.map(location => location.locationCode === body.locationCode
          ? { ...location, ...body }
          : location),
      };
      return route.fulfill({ json: { data: map } });
    }
    if (request.method() === 'POST' && request.url().endsWith('/api/campaign/map/cards')) {
      const body = request.postDataJSON();
      map = {
        ...map,
        version: map.version + 1,
        cards: map.cards.map(card => card.cardCode === body.cardCode
          ? { ...card, ...body, timeToken: body.status === 'RESOLVED' ? null : card.timeToken }
          : card),
      };
      return route.fulfill({ json: { data: map } });
    }
    if (request.method() === 'PATCH' && request.url().includes('/tiles/')) {
      patchCount += 1;
      if (conflictFirst && patchCount === 1) {
        map = { ...map, version: map.version + 1 };
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'MAP_VERSION_CONFLICT',
              message: '版本衝突',
              conflict: {
                scope: 'MAP',
                expectedVersion: map.version - 1,
                currentVersion: map.version,
                latest: map,
              },
            },
          },
        });
      }
      await new Promise(resolve => setTimeout(resolve, 180));
      const body = request.postDataJSON();
      map = {
        ...map,
        version: map.version + 1,
        tiles: map.tiles.map(tile => tile.mapCode === body.mapCode ? { ...tile, ...body } : tile),
      };
      return route.fulfill({ json: { data: map } });
    }
    return route.fulfill({ json: { data: map } });
  });
}

test('mobile map editor keeps controls visible and locks the background', async ({ page }) => {
  await installApi(page);
  await page.goto('/campaigns/map');
  await page.locator('.map-card-placeholder').filter({ has: page.locator('img[alt^="M19"]') }).click();

  const drawer = page.locator('.map-editor-drawer');
  const saveBar = page.locator('.map-editor-save-bar');
  await expect(drawer).toBeVisible();
  await expect(saveBar).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('position', 'fixed');

  const drawerBox = await drawer.boundingBox();
  const viewport = page.viewportSize();
  expect(drawerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(drawerBox!.width).toBeGreaterThanOrEqual(viewport!.width - 2);
  if (viewport!.height <= 600) {
    expect(drawerBox!.y).toBeLessThanOrEqual(1);
    expect(drawerBox!.height).toBeGreaterThanOrEqual(viewport!.height - 2);
  }

  await drawer.locator('textarea').first().fill('藥草 2');
  await saveBar.getByRole('button', { name: '儲存卡片紀錄' }).click();
  await expect(saveBar.getByRole('button', { name: '儲存中…' })).toBeVisible();
  await expect(saveBar.getByRole('button', { name: '已儲存' })).toBeVisible();
  const toastBox = await page.locator('.map-toast').boundingBox();
  const saveBarBox = await saveBar.boundingBox();
  expect(toastBox).not.toBeNull();
  expect(saveBarBox).not.toBeNull();
  expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(saveBarBox!.y);
  await expect(drawer).toHaveScreenshot('map-editor.png', { animations: 'disabled', maxDiffPixelRatio: 0.01 });
});

test('version conflict explains the problem and supports retry', async ({ page }) => {
  await installApi(page, true);
  await page.goto('/campaigns/map');
  await page.locator('.map-card-placeholder').first().click();
  await page.locator('.map-editor-drawer textarea').first().fill('線索 1');
  await page.locator('.map-editor-save-bar').getByRole('button', { name: '儲存卡片紀錄' }).click();
  await expect(page.getByText('地圖資料已被其他玩家更新')).toBeVisible();
  await page.getByRole('button', { name: '保留我的修改並重新套用' }).click();
  await expect(page.locator('.map-editor-save-bar').getByRole('button', { name: '已儲存' })).toBeVisible();
});


test('location cards expose the same placed-card controls as map cards', async ({ page }) => {
  await installApi(page);
  await page.goto('/campaigns/map');

  const records = page.locator('.location-card-records');
  const story = records.locator('article').filter({ hasText: 'S005' });
  const feature = records.locator('article').filter({ hasText: 'F001' });

  await expect(story.getByText('劇情卡')).toBeVisible();
  await expect(story.getByText('A · 第 19 天')).toBeVisible();
  await expect(story.getByRole('combobox', { name: '移動 S005' })).toHaveValue('LOCATION:L01');
  await expect(story.getByRole('button', { name: '移除 S005' })).toBeVisible();
  await expect(story.getByText('舊備註')).toBeVisible();
  await expect(feature.getByRole('button', { name: '未加入城鎮' })).toBeVisible();

  await story.getByRole('button', { name: '修改備註' }).click();
  const note = story.getByLabel('卡片備註');
  await note.fill('新的劇情分支');
  await story.getByRole('button', { name: '儲存備註' }).click();
  await expect(story.getByText('新的劇情分支')).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await story.getByRole('button', { name: '標記完成' }).click();
  await expect(story.getByRole('button', { name: '已完成' })).toBeVisible();
  await expect(story.getByText('A · 第 19 天')).toHaveCount(0);

  const untimedStory = records.locator('article').filter({ hasText: 'S004' });
  await untimedStory.getByRole('button', { name: '放置 Token' }).click();
  await expect(untimedStory.getByLabel('Time Token')).toHaveValue('A');
  await untimedStory.getByRole('button', { name: '確認放置' }).click();
  await expect(untimedStory.getByText('A · 第 20 天')).toBeVisible();

  const flip = page.getByRole('button', { name: /翻轉並儲存/ });
  await expect(flip).toContainText('目前：正面');
  await flip.click();
  await expect(flip).toContainText('目前：覆蓋面');
});


test('a location position also marks its parent map card', async ({ page }) => {
  await installApi(page, false, { locationType: 'LOCATION', locationCode: 'L08', mapCode: 'M15' });
  await page.goto('/campaigns/map');

  const parentMap = page.locator('.map-card-placeholder').filter({ has: page.locator('img[alt^="M15"]') });
  const location = page.locator('.location-card-button').filter({ hasText: 'L08' });
  await expect(parentMap.locator('.hunter-marker')).toBeVisible();
  await expect(parentMap.locator('.hunter-marker')).toHaveAttribute('title', '獵人目前位於 L08');
  await expect(location.locator('svg')).toBeVisible();
});
