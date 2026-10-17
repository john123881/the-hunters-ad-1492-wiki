import { expect, test } from '@playwright/test';

function silentWav(durationSeconds = 0.25, sampleRate = 8000): Buffer {
  const sampleCount = Math.floor(durationSeconds * sampleRate);
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test('global audio player works responsively and survives navigation', async ({ page }) => {
  test.setTimeout(20_000);
  await page.route('**/audio/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      mediaBaseUrl: '/test-audio/',
      entryCount: 1,
      entries: {
        Q1: {
          code: 'Q1',
          category: 'quest',
          title: '任務 Q1',
          path: 'Q1.wav',
        },
      },
    }),
  }));
  await page.route('**/test-audio/Q1.wav', route => route.fulfill({
    contentType: 'audio/wav',
    body: silentWav(),
  }));

  await page.goto('/');
  await page.getByRole('button', { name: '語音播放', exact: true }).click();

  const drawer = page.getByRole('region', { name: '語音播放器' });
  const bar = page.getByRole('region', { name: '語音播放控制' });
  await expect(drawer).toBeVisible();
  await expect(bar).toBeVisible();
  await expect(page.getByLabel('語音代碼')).toBeFocused();

  const fitsViewport = await drawer.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
  });
  expect(fitsViewport).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByLabel('語音代碼').fill(' q-1 ');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(bar).toContainText('任務 Q1');
  await expect(page.getByRole('button', { name: /暫停語音|播放語音/ }).first()).toBeVisible();

  await drawer.getByRole('button', { name: '收合語音播放器' }).click();
  await expect(drawer).toBeHidden();
  await expect(bar).toBeVisible();

  await page.getByRole('link', { name: '物品圖鑑' }).click();
  await expect(page).toHaveURL(/\/items/);
  await expect(bar).toContainText('任務 Q1');

  await page.getByRole('button', { name: '展開語音播放器' }).first().click();
  await expect(drawer).toBeVisible();
  await page.getByLabel('語音代碼').fill('unknown');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(drawer).toContainText('語音代碼格式不正確');
});

test('logged-in players share successful playback history', async ({ page }) => {
  const history: Array<Record<string, unknown>> = [];
  await page.route('**/api/auth/session', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: {
      campaignId: 'audio-test', campaignName: 'Audio Test', playerNumber: 1,
      playerAlias: '測試獵人', isActive: true, expiresAt: '2099-01-01T00:00:00.000Z',
      players: [{ playerNumber: 1, playerAlias: '測試獵人' }],
    } }),
  }));
  await page.route('**/api/campaign/audio-playback', async route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { code: string; title: string };
      const entry = {
        id: history.length + 1,
        code: body.code,
        category: 'quest',
        title: body.title,
        playerNumber: 1,
        playerAlias: '測試獵人',
        playedAt: '2026-10-14 12:00:00',
      };
      history.unshift(entry);
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ data: entry }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: history }) });
  });
  await page.route('**/audio/manifest.json', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      mediaBaseUrl: '/test-audio/',
      entryCount: 1,
      entries: { Q1: { code: 'Q1', category: 'quest', title: '任務 Q1', path: 'Q1.wav' } },
    }),
  }));
  await page.route('**/test-audio/Q1.wav', route => route.fulfill({
    contentType: 'audio/wav',
    body: silentWav(1),
  }));

  await page.goto('/');
  await page.getByRole('button', { name: '語音播放', exact: true }).click();
  const drawer = page.getByRole('region', { name: '語音播放器' });
  await expect(drawer.getByRole('heading', { name: '共用播放紀錄' })).toBeVisible();
  await page.getByLabel('語音代碼').fill('Q1');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await expect(drawer.getByRole('button', { name: '播放 Q1 任務 Q1' })).toBeVisible();
  await expect(drawer).toContainText('測試獵人 · 玩家 1');
});
