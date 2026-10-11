import { expect, test, type Page } from '@playwright/test';

const session = {
  campaignId: 'equipment-preview-test',
  campaignName: '裝備預覽測試',
  playerNumber: 1,
  playerAlias: 'XD',
  isActive: true,
  expiresAt: '2099-01-01T00:00:00.000Z',
  players: [{ playerNumber: 1, playerAlias: 'XD' }],
};

const character = {
  id: 1,
  playerNumber: 1,
  heroSlug: 'brawler',
  customName: '',
  moralePosition: 0,
  strengthLevel: 0,
  knowledgeLevel: 0,
  perceptionLevel: 0,
  agilityLevel: 0,
  maxHealthLevel: 0,
  currentHealth: 1,
  xpTens: 0,
  xpOnes: 0,
  accumulatedXp: 0,
  isPoisoned: false,
  notes: '',
  version: 3,
};

const wagon = {
  campaignId: session.campaignId,
  campaignName: session.campaignName,
  elapsedDays: 1,
  locationCode: '',
  sharedGold: 0,
  notes: '',
  version: 4,
  upgrades: [],
  timeTokens: [],
  availableStoryCardCodes: [],
  resources: [],
  equipment: [],
};

const candidate = {
  instanceId: 28,
  itemId: 1,
  name: '測試雙手弩',
  imageUrl: '/images/items/arbalest.webp',
  categoryName: '遠程武器',
  slotCount: 2,
  damageMarkers: 1,
  notes: '需要兩個手部空格',
  previewSlotKeys: ['HAND_1', 'HAND_2'],
};

async function installApi(page: Page) {
  await page.route('**/api/auth/session', route => route.fulfill({ json: { data: session } }));
  await page.route('**/api/campaign/characters/1/equipment-candidates?*', route => route.fulfill({
    json: { data: { slotKey: 'HAND_1', items: [candidate] } },
  }));
  await page.route('**/api/campaign/characters/1/loadout', route => route.fulfill({
    json: {
      data: {
        playerNumber: 1,
        characterId: 1,
        heroSlug: 'brawler',
        version: 3,
        templateVerified: true,
        openedSlotKeys: [],
        equipment: [],
        retainedAttachments: [],
        slots: [
          {
            slotKey: 'HAND_1',
            category: 'HAND',
            laneKey: 'HAND',
            rowIndex: 1,
            boardRect: { xPercent: 2, yPercent: 5, widthPercent: 18, heightPercent: 18 },
            initialStatus: 'OPEN',
            status: 'OPEN',
          },
          {
            slotKey: 'HAND_2',
            category: 'HAND',
            laneKey: 'HAND',
            rowIndex: 2,
            boardRect: { xPercent: 2, yPercent: 24, widthPercent: 18, heightPercent: 18 },
            initialStatus: 'OPEN',
            status: 'OPEN',
          },
        ],
      },
    },
  }));
  await page.route('**/api/campaign/wagon', route => route.fulfill({ json: { data: wagon } }));
  await page.route('**/api/campaign/characters', route => route.fulfill({
    json: { data: { characters: [character] } },
  }));
}

async function openCandidatePreview(page: Page) {
  await installApi(page);
  await page.goto('/campaigns/characters/1');
  await expect(page.getByRole('heading', { name: '裝備面板' })).toBeVisible();
  await page.getByRole('button', { name: 'HAND_1，OPEN' }).click();
  const candidateButton = page.getByRole('button', { name: /測試雙手弩/ });
  await expect(candidateButton).toBeVisible();
  await candidateButton.click();
  return candidateButton;
}

test('selected equipment keeps its preview and confirm action visible on mobile', async ({ page }) => {
  await openCandidatePreview(page);

  const footer = page.locator('.equipment-drawer-footer');
  await expect(footer).toBeVisible();
  await expect(footer.getByText('測試雙手弩', { exact: true })).toBeVisible();
  await expect(footer.getByText('#28')).toBeVisible();
  await expect(footer.getByText('已毀損')).toBeVisible();
  await expect(footer.getByText('HAND_1、HAND_2')).toBeVisible();
  await expect(footer.getByRole('button', { name: '確認從馬車放置' })).toBeVisible();

  const list = page.locator('.equipment-candidate-list');
  const previewFrame = footer.locator('.equipment-preview-card-frame');
  const footerBox = await footer.boundingBox();
  const listBox = await list.boundingBox();
  const previewFrameBox = await previewFrame.boundingBox();
  expect(previewFrameBox).not.toBeNull();
  expect(previewFrameBox!.height).toBeGreaterThanOrEqual(88);
  expect(listBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(listBox!.y + 1);

  const viewport = page.viewportSize();
  expect(footerBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(viewport!.height + 1);
  await expect(page.locator('.equipment-preview-card-frame img')).toHaveClass(/ready/);
});

test('desktop mouse and keyboard focus expose the high resolution candidate preview', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const candidateButton = await openCandidatePreview(page);
  const zoom = candidateButton.locator('.equipment-candidate-hover-zoom');

  if (!await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches)) {
    await page.addStyleTag({
      content: '.equipment-candidate-list button:hover .equipment-candidate-hover-zoom, .equipment-candidate-list button:focus .equipment-candidate-hover-zoom { display: block; }',
    });
  }

  await candidateButton.hover();
  await expect(zoom).toBeVisible();
  const zoomBox = await zoom.boundingBox();
  expect(zoomBox).not.toBeNull();
  expect(zoomBox!.x).toBeGreaterThanOrEqual(0);

  await candidateButton.focus();
  await expect(candidateButton).toBeFocused();
  await expect(zoom).toBeVisible();
  await context.close();
});
