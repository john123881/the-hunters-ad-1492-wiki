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

test('attachment catalog thumbnails stay inside their rows and each row remains selectable', async ({ page }) => {
  await installApi(page);

  await page.route('**/api/campaign/characters/1/loadout', route => route.fulfill({
    json: {
      data: {
        playerNumber: 1,
        characterId: 1,
        heroSlug: 'brawler',
        version: 3,
        templateVerified: true,
        openedSlotKeys: [],
        retainedAttachments: [],
        equipment: [{
          instanceId: 40,
          itemId: 40,
          name: '測試手槍',
          imageUrl: '/images/items/petronel.webp',
          categoryCode: 'weapon',
          slotCount: 1,
          damageMarkers: 0,
          notes: '',
          slotKeys: ['HAND_1'],
          attachments: [],
          sockets: [{
            weaponSlotIndex: 1,
            socketIndex: 1,
            connectorCode: 'barrel',
            connectorName: '槍械接口',
            attachmentInstanceId: null,
          }],
        }],
        slots: [
          {
            slotKey: 'HAND_1',
            category: 'HAND',
            laneKey: 'HAND',
            rowIndex: 1,
            boardRect: { xPercent: 2, yPercent: 5, widthPercent: 18, heightPercent: 18 },
            initialStatus: 'OPEN',
            status: 'OCCUPIED',
          },
          {
            slotKey: 'ATTACHMENT_1',
            category: 'ATTACHMENT',
            laneKey: 'ATTACHMENT',
            rowIndex: 1,
            boardRect: { xPercent: 20, yPercent: 5, widthPercent: 14, heightPercent: 18 },
            initialStatus: 'OPEN',
            status: 'OPEN',
          },
        ],
      },
    },
  }));
  await page.route('**/api/campaign/characters/1/equipment/40/attachment-candidates?*', route => route.fulfill({
    json: {
      data: {
        weaponInstanceId: 40,
        weaponSlotIndex: 1,
        socketIndex: 1,
        connector: { code: 'barrel', name: '槍械接口' },
        items: [],
      },
    },
  }));
  await page.route('**/api/campaign/characters/1/equipment/40/attachment-catalog-candidates?*', route => route.fulfill({
    json: {
      data: {
        weaponInstanceId: 40,
        weaponSlotIndex: 1,
        socketIndex: 1,
        items: [
          { itemId: 101, name: '加長槍管', imageUrl: '/images/items/elongated-barrel.webp', connectorCode: 'barrel', connectorName: '槍械接口' },
          { itemId: 102, name: '改良火藥', imageUrl: '/images/items/improved-gunpowder.webp', connectorCode: 'barrel', connectorName: '槍械接口' },
          { itemId: 103, name: '銀彈', imageUrl: '/images/items/silver-balls.webp', connectorCode: 'barrel', connectorName: '槍械接口' },
        ],
      },
    },
  }));

  await page.goto('/campaigns/characters/1');
  await page.getByRole('button', { name: /測試手槍 #40/ }).click();
  await page.getByRole('button', { name: '選擇附件' }).click();
  await page.getByRole('tab', { name: '附件列表' }).click();

  const rows = page.locator('.equipment-candidate-list > button');
  await expect(rows).toHaveCount(3);
  const firstThumb = rows.nth(0).locator('.equipment-candidate-thumb-wrap');
  await expect(firstThumb).toBeVisible();

  const firstBox = await rows.nth(0).boundingBox();
  const secondBox = await rows.nth(1).boundingBox();
  const thumbBox = await firstThumb.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(thumbBox).not.toBeNull();
  expect(thumbBox!.width).toBeLessThanOrEqual(74);
  expect(thumbBox!.height).toBeLessThanOrEqual(74);
  expect(firstBox!.y + firstBox!.height).toBeLessThanOrEqual(secondBox!.y);

  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveClass(/active/);
  const attachmentFooter = page.locator('.equipment-drawer-footer');
  await expect(attachmentFooter).toBeVisible();
  await expect(attachmentFooter.getByText('改良火藥', { exact: true })).toBeVisible();
  await expect(attachmentFooter.getByText('槍械接口', { exact: true })).toBeVisible();
  await expect(attachmentFooter.locator('.equipment-preview-card-frame img')).toHaveClass(/ready/);
  await expect(attachmentFooter.getByRole('button', { name: '確認建立並安裝' })).toBeVisible();
});
