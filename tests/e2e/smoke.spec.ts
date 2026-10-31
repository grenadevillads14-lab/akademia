import { expect, test, type Page } from '@playwright/test';

/** Collect console errors and warnings (SwiftShader GPU-stall noise excluded). */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|ReadPixels|Automatic fallback to software WebGL/.test(m.text()))) {
      errors.push(`${m.type()}: ${m.text()}`);
    }
  });
  return errors;
}

async function boot(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => window.__akademeia?.ready === true, null, { timeout: 120_000 });
}

test('the Academy loads, renders and runs without console errors', async ({ page }) => {
  const errors = watchConsole(page);
  await boot(page, '/?overlay=1');
  const stats = await page.evaluate(() => window.__akademeia!.stats());
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(1000);
  await expect(page.getByTestId('debug-overlay')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the player walks forward on the road and stays on the ground', async ({ page }) => {
  await boot(page);
  const before = await page.evaluate(() => {
    const g = window.__akademeia!.game!;
    return { x: g.player.position.x, y: g.player.position.y, z: g.player.position.z };
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => {
    const g = window.__akademeia!.game!;
    const p = g.player.position;
    return { x: p.x, y: p.y, z: p.z, ground: g.world.hf.height(p.x, p.z) };
  });
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.8);
  expect(Math.abs(after.y - after.ground)).toBeLessThan(0.35);
});

test('the player swims in the Cephissus', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    const g = window.__akademeia!.game!;
    // Middle of the river near the ford.
    g.debugPlacePlayer(-470, -80, 0);
  });
  await page.waitForTimeout(1500);
  const swimming = await page.evaluate(() => window.__akademeia!.game!.player.swimming);
  expect(swimming).toBe(true);
});

test('benchmark mode produces a report at a fixed 1080p and hands control back', async ({ page }) => {
  await boot(page, '/?bench=2');
  await expect(page.getByTestId('bench-report')).toBeVisible({ timeout: 120_000 });
  const result = await page.evaluate(() => window.__akademeia!.bench);
  expect(result?.frames).toBeGreaterThan(0);
  expect(result?.canvas).toBe('1920x1080');
  expect(result?.avgWorkMs).toBeGreaterThan(0);
  const w = await page.evaluate(() => document.querySelector('canvas')!.width);
  expect(w).not.toBe(1920);
});
