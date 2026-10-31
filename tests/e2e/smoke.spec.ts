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

/** Wait until the game has rendered `n` more frames (software GL can take seconds per frame). */
async function frames(page: Page, n: number) {
  const start = await page.evaluate(() => window.__akademeia!.game!.frames);
  await page.waitForFunction((s) => window.__akademeia!.game!.frames >= s, start + n, { timeout: 180_000 });
}

/** Press a key so that exactly one frame sees it. */
async function tap(page: Page, key: string) {
  await page.keyboard.press(key);
  await frames(page, 2);
}

async function boot(page: Page, url = '/') {
  await page.goto(url);
  await page.waitForFunction(() => window.__akademeia?.ready === true, null, { timeout: 120_000 });
}

test('the Academy loads, renders and runs without console errors', async ({ page }) => {
  const errors = watchConsole(page);
  await boot(page, '/?title=0&overlay=1');
  const stats = await page.evaluate(() => window.__akademeia!.stats());
  expect(stats.drawCalls).toBeGreaterThan(0);
  expect(stats.triangles).toBeGreaterThan(1000);
  await expect(page.getByTestId('debug-overlay')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the player walks forward on the road and stays on the ground', async ({ page }) => {
  await boot(page, '/?title=0&story=0');
  const before = await page.evaluate(() => {
    const g = window.__akademeia!.game!;
    return { x: g.player.position.x, y: g.player.position.y, z: g.player.position.z };
  });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    (b) => {
      const p = window.__akademeia!.game!.player.position;
      return Math.hypot(p.x - b.x, p.z - b.z) > 1;
    },
    before,
    { timeout: 180_000 },
  );
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
  await boot(page, '/?title=0&story=0');
  await page.evaluate(() => {
    const g = window.__akademeia!.game!;
    // Middle of the river near the ford.
    g.debugPlacePlayer(-470, -80, 0);
  });
  await frames(page, 6);
  const swimming = await page.evaluate(() => window.__akademeia!.game!.player.swimming);
  expect(swimming).toBe(true);
});

test('benchmark mode produces a report at a fixed 1080p and hands control back', async ({ page }) => {
  await boot(page, '/?title=0&bench=2');
  await expect(page.getByTestId('bench-report')).toBeVisible({ timeout: 120_000 });
  const result = await page.evaluate(() => window.__akademeia!.bench);
  expect(result?.frames).toBeGreaterThan(0);
  expect(result?.canvas).toBe('1920x1080');
  expect(result?.avgWorkMs).toBeGreaterThan(0);
  const w = await page.evaluate(() => document.querySelector('canvas')!.width);
  expect(w).not.toBe(1920);
});

test('the prologue opens, and talking to Aristotle advances the quest', async ({ page }) => {
  await boot(page, '/?title=0');
  const dialogue = page.getByTestId('dialogue');
  await expect(dialogue).toBeVisible({ timeout: 30_000 });
  await expect(dialogue).toContainText('Dipylon');
  // Close the arrival narration (first Enter completes the typewriter, the next advances).
  for (let i = 0; i < 6 && (await dialogue.isVisible()); i++) await tap(page, 'Enter');
  await expect(dialogue).toBeHidden();
  await expect(page.locator('.hud-prompt')).toContainText('Aristotle', { timeout: 20_000 });
  await tap(page, 'KeyF');
  await expect(dialogue).toContainText('Aristotle', { timeout: 60_000 });
  // Skip the typewriter, pick the first choice whenever one is offered, run to the end.
  for (let i = 0; i < 20 && (await dialogue.isVisible()); i++) {
    if (await page.locator('.dialogue-choice').count()) await tap(page, 'Digit1');
    else await tap(page, 'Enter');
  }
  const step = await page.evaluate(() => window.__akademeia!.game!.state.quest('prologue')?.step);
  expect(step).toBe('walk_road');
  await expect(page.locator('.hud-objective')).toContainText('Walk the road');
});

test('the Meno puzzle opens over a halted game, solves by drawing, and pays out', async ({ page }) => {
  const errors = watchConsole(page);
  await boot(page, '/?title=0&story=0&timescale=0');
  await expect(page.getByTestId('menu')).toBeHidden();
  await page.evaluate(() => window.__akademeia!.game!.state.runCommand('puzzle meno'));
  const canvas = page.locator('.meno-canvas');
  await expect(canvas).toBeVisible({ timeout: 180_000 });
  const box = (await canvas.boundingBox())!;
  const pt = (i: number, j: number): [number, number] => {
    const pad = (50 / 440) * box.width;
    const step = (box.width - 2 * pad) / 4;
    return [box.x + pad + i * step, box.y + box.height - pad - j * step];
  };
  const corners: [number, number][] = [[2, 0], [4, 2], [2, 4], [0, 2], [2, 0]];
  for (let k = 0; k < 4; k++) {
    await page.mouse.click(...pt(...corners[k]!));
    await page.mouse.click(...pt(...corners[k + 1]!));
  }
  await page.locator('.puzzle-actions').getByText('Done').click();
  await expect(page.getByTestId('puzzle')).toHaveCount(0);
  expect(await page.evaluate(() => window.__akademeia!.game!.state.flag('meno_solved'))).toBe(true);
  expect(await page.evaluate(() => window.__akademeia!.game!.state.hasIdea('incommensurable'))).toBe(true);
  expect(errors).toEqual([]);
});
