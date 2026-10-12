import { expect, test } from '@playwright/test';

test('dice roller stays within the viewport and persists roll history', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('hunters-dice-history-v1'));

  await page.getByRole('button', { name: /擲骰/ }).click();
  const dialog = page.getByRole('dialog', { name: '獵人骰盤' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.dice-arena-status')).toHaveText('骰盤已就緒', { timeout: 20_000 });

  const panelWithinViewport = await page.locator('.dice-panel').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth && rect.width <= window.innerWidth;
  });
  expect(panelWithinViewport).toBe(true);

  if ((page.viewportSize()?.width ?? 0) > 760) {
    const fullScreenPanel = await page.locator('.dice-panel').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return Math.abs(rect.width - window.innerWidth) < 1 && Math.abs(rect.height - window.innerHeight) < 1;
    });
    expect(fullScreenPanel).toBe(true);

    const controls = page.locator('.dice-controls');
    await expect(controls).toHaveCSS('scrollbar-width', 'none');
    const remainsScrollable = await controls.evaluate(element => {
      element.scrollTop = element.scrollHeight;
      return element.scrollHeight > element.clientHeight && element.scrollTop > 0;
    });
    expect(remainsScrollable).toBe(true);
  }

  const addAttack = page.getByRole('button', { name: '增加一顆攻擊骰' });
  for (let index = 1; index < 8; index += 1) await addAttack.click();
  await expect(addAttack).toBeDisabled();
  await expect(page.getByRole('button', { name: '減少一顆攻擊骰' })).toBeEnabled();
  await expect(page.locator('.dice-arena-canvas')).toHaveAttribute('data-preview-count', '8');

  if ((page.viewportSize()?.width ?? 0) <= 620) {
    const rollDock = page.locator('.dice-mobile-roll-dock');
    await expect(rollDock).toBeVisible();
    await expect(rollDock).toContainText('攻擊骰');
    await expect(rollDock).toContainText('8 顆');
    const dockWithinViewport = await rollDock.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
    });
    expect(dockWithinViewport).toBe(true);
  }

  await page.getByRole('button', { name: '選擇檢定骰' }).click();
  await expect(page.locator('.dice-arena-canvas')).toHaveAttribute('data-preview-count', '1');
  await expect(page.getByText('固定一顆')).toBeVisible();
  await expect(page.getByRole('button', { name: /^投擲 1 顆(?:骰子)?$/ })).toBeVisible();

  await page.getByRole('button', { name: '選擇旅行骰' }).click();
  await expect(page.getByText('固定一顆')).toBeVisible();
  await page.getByRole('button', { name: /^投擲 1 顆(?:骰子)?$/ }).click();
  await expect(page.locator('.dice-arena-status')).toHaveText('投擲完成', { timeout: 20_000 });
  await expect(page.locator('.dice-results li')).toHaveCount(1);
  if ((page.viewportSize()?.width ?? 0) <= 620) {
    const immediateResults = page.locator('.dice-arena-results');
    await expect(immediateResults).toBeVisible();
    await expect(immediateResults.locator('li')).toHaveCount(1);
    const summaryWithinArena = await immediateResults.evaluate(element => {
      const summary = element.getBoundingClientRect();
      const arena = element.closest('.dice-arena')?.getBoundingClientRect();
      return Boolean(arena && summary.left >= arena.left && summary.right <= arena.right && summary.bottom <= arena.bottom);
    });
    expect(summaryWithinArena).toBe(true);
  }
  await expect(page.locator('.dice-results')).toContainText('旅行骰');
  await expect(page.locator('.dice-results')).not.toContainText('攻擊骰');
  await expect(page.locator('.dice-results')).not.toContainText('檢定骰');
  await expect(page.locator('.dice-history li')).toHaveCount(1);

  await page.locator('.dice-icon-button').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /擲骰/ })).toBeFocused();

  await page.getByRole('button', { name: /擲骰/ }).click();
  if ((page.viewportSize()?.width ?? 0) <= 620) {
    const historyTab = page.getByRole('button', { name: '歷史 1' });
    await expect(historyTab).toBeVisible();
    await historyTab.click();
  }
  await expect(page.locator('.dice-history li')).toHaveCount(1);
  await page.getByRole('button', { name: '清空歷史' }).click();
  await expect(page.locator('.dice-history li')).toHaveCount(0);
  await expect(page.getByText('尚無投擲紀錄。最多保留最近 20 次。')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('hunters-dice-history-v1'))).toBe('[]');
});
