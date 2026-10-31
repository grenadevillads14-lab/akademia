import { test } from '@playwright/test';

/**
 * Milestone screenshots: `npm run screenshots` writes docs/screenshots/<milestone>/*.png.
 * Shots are taken from fixed camera positions so they are comparable between runs.
 */
const MILESTONE = process.env.MILESTONE ?? 'm0';

const shots: { name: string; url: string; pos: [number, number, number]; target: [number, number, number] }[] = [
  { name: 'colonnade', url: '/?settle', pos: [16, 4, 6], target: [0, 3.5, -18] },
  { name: 'overview', url: '/?settle', pos: [30, 18, 26], target: [0, 1, -8] },
  { name: 'stress-20k', url: '/?settle&stress=20000', pos: [60, 30, 60], target: [0, 0, 0] },
];

for (const shot of shots) {
  test(`screenshot ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(shot.url);
    await page.waitForFunction(() => window.__akademeia?.ready === true, null, { timeout: 60_000 });
    await page.evaluate(([p, t]) => window.__akademeia!.setCamera(p, t), [shot.pos, shot.target] as const);
    await page.waitForTimeout(1500); // let the overlay refresh with stats for this view
    await page.screenshot({ path: `docs/screenshots/${MILESTONE}/${shot.name}.png` });
  });
}
