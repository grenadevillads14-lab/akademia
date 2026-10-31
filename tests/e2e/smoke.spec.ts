import { expect, test } from '@playwright/test';

test('game boots, renders and shows the debug overlay without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // Warnings count too: deprecations and missing i18n keys should never ship silently.
    // GPU stall warnings are SwiftShader noise from the GPU-less test container.
    if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|ReadPixels/.test(m.text()))) {
      errors.push(`${m.type()}: ${m.text()}`);
    }
  });

  await page.goto('/');
  await page.waitForFunction(() => window.__akademeia?.ready === true, null, { timeout: 60_000 });

  const stats = await page.evaluate(() => window.__akademeia!.stats());
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(0);
  expect(stats.bodies).toBeGreaterThan(20);

  await expect(page.getByTestId('debug-overlay')).toBeVisible();
  await page.keyboard.press('F3');
  await expect(page.getByTestId('debug-overlay')).toBeHidden();

  expect(errors).toEqual([]);
});

test('instanced stress test stays at a handful of draw calls', async ({ page }) => {
  await page.goto('/?stress=20000&overlay=0');
  await page.waitForFunction(() => window.__akademeia?.ready === true, null, { timeout: 60_000 });
  const { drawCalls, triangles } = await page.evaluate(() => window.__akademeia!.stats());
  expect(triangles).toBeGreaterThan(20000 * 12);
  expect(drawCalls).toBeLessThan(250);
});

test('benchmark mode produces a report', async ({ page }) => {
  await page.goto('/?bench=2&overlay=0');
  await expect(page.getByTestId('bench-report')).toBeVisible({ timeout: 90_000 });
  const result = await page.evaluate(() => window.__akademeia!.bench);
  expect(result?.frames).toBeGreaterThan(0);
  expect(result?.gpu.length).toBeGreaterThan(0);
});
