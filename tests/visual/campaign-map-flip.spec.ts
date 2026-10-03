import { expect, test, type Page } from '@playwright/test';

const session = {
  campaignId: 'flip-visual-test',
  campaignName: '翻牌視覺測試',
  playerNumber: 1,
  playerAlias: 'XD',
  isActive: true,
  expiresAt: '2099-01-01T00:00:00.000Z',
  players: [{ playerNumber: 1, playerAlias: 'XD' }],
};

function makeMap() {
  return {
    campaignId: session.campaignId,
    version: 1,
    currentLocationType: null,
    currentLocationCode: null,
    currentMapCode: null,
    roadEventNotes: '',
    townEventNotes: '',
    tiles: Array.from({ length: 20 }, (_, index) => ({
      mapCode: 'M' + String(index + 1).padStart(2, '0'),
      rowIndex: Math.floor(index / 4) + 1,
      columnIndex: index % 4 + 1,
      isRevealed: false,
      face: 'BACK',
      resourceNotes: '',
      notes: '',
    })),
    locations: Array.from({ length: 14 }, (_, index) => ({
      locationCode: 'L' + String(index + 1).padStart(2, '0'),
      isRevealed: false,
      face: 'BACK',
      resourceNotes: '',
      notes: '',
    })),
    cards: [],
    cardProgress: [],
  };
}

async function installApi(page: Page) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: session } }));
  await page.route('**/api/campaign/map', route => route.fulfill({ json: { data: makeMap() } }));
}

function mapCard(page: Page, mapCode: string) {
  return page.locator('.map-card-placeholder').filter({
    has: page.locator(`img[alt^="${mapCode}"]`),
  });
}

test('waits for the front image before changing the revealed state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installApi(page);

  let releaseImage!: () => void;
  const imageGate = new Promise<void>(resolve => {
    releaseImage = resolve;
  });
  let markRequested!: () => void;
  const imageRequested = new Promise<void>(resolve => {
    markRequested = resolve;
  });

  await page.route('**/images/campaign/maps/M07-front.webp*', async route => {
    markRequested();
    await imageGate;
    await route.continue();
  });

  await page.goto('/campaigns/map');
  const card = mapCard(page, 'M07');
  await card.click();

  await imageRequested;

  const toggle = page.locator('.map-editor-drawer .reveal-toggle');
  await toggle.click();

  await expect(toggle).toContainText('圖片載入中…');
  await expect(toggle).not.toContainText('正面 · 已揭示');
  await expect(card.locator('img')).toHaveAttribute('alt', 'M07 背面');
  await expect(card.locator('.map-tile-state')).toHaveText('未揭示');

  releaseImage();

  await expect(toggle).toContainText('正面 · 已揭示');
  await expect(card.locator('img')).toHaveAttribute('alt', 'M07 正面');
  await expect(card.locator('.map-tile-state')).toHaveText('已揭示');
});

test('keeps the back side when the front image fails to load', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installApi(page);
  await page.route('**/images/campaign/maps/M07-front.webp*', route => route.abort('failed'));

  await page.goto('/campaigns/map');
  const card = mapCard(page, 'M07');
  await card.click();

  const toggle = page.locator('.map-editor-drawer .reveal-toggle');
  await toggle.click();

  await expect(page.getByText('地圖圖片載入失敗，請檢查網路後重試。')).toBeVisible();
  await expect(toggle).toContainText('背面 · 未揭示');
  await expect(card.locator('img')).toHaveAttribute('alt', 'M07 背面');
  await expect(card.locator('.map-tile-state')).toHaveText('未揭示');
});
