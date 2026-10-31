import { test } from '@playwright/test';

/**
 * Milestone screenshots: `MILESTONE=m1 npm run screenshots` writes docs/screenshots/<milestone>/*.png.
 * Each shot fixes the time of day and either a free camera or the player + follow camera, so runs are comparable.
 */
const MILESTONE = process.env.MILESTONE ?? 'm1';
const ONLY = process.env.SHOT;

type Shot =
  | { name: string; time: number; season?: string; camera: { pos: [number, number, number]; target: [number, number, number] } }
  | { name: string; time: number; season?: string; player: { x: number; z: number; heading: number; yaw?: number; pitch?: number } };

const shots: Shot[] = [
  { name: '01-dipylon-start', time: 17.8, player: { x: 412, z: 470, heading: -2.4 } },
  { name: '02-road-golden-hour', time: 18.3, camera: { pos: [250, 4, 300], target: [150, 3, 190] } },
  { name: '03-grove-golden-hour', time: 18.4, camera: { pos: [40, 3, 175], target: [-60, 4, 120] } },
  { name: '04-moria-closeup', time: 17.2, camera: { pos: [-48, 2.2, 132], target: [-60, 3.5, 122] } },
  { name: '05-plane-walks', time: 16.5, camera: { pos: [-118, 2.2, 75], target: [-128, 3, 0] } },
  { name: '06-teaching-plane', time: 10.5, camera: { pos: [140, 4, -235], target: [160, 6, -262] } },
  { name: '07-cephissus', time: 9.5, camera: { pos: [-430, 5, -40], target: [-480, 0, -120] } },
  { name: '08-overview', time: 15, camera: { pos: [260, 110, 420], target: [0, 0, 0] } },
  { name: '09-night-grove', time: 22.5, camera: { pos: [40, 3, 175], target: [-60, 4, 120] } },
  { name: '10-player-grove', time: 18.1, player: { x: 30, z: 150, heading: -2.0 } },
];

for (const shot of shots) {
  if (ONLY && !shot.name.includes(ONLY)) continue;
  test(`screenshot ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(`/?overlay=0&time=${shot.time}&timescale=0${shot.season ? `&season=${shot.season}` : ''}`);
    await page.waitForFunction(() => window.__akademeia?.ready === true, null, { timeout: 120_000 });
    if ('camera' in shot) {
      await page.evaluate(([p, t]) => window.__akademeia!.game!.debugSetCamera(p, t, true), [shot.camera.pos, shot.camera.target] as const);
    } else {
      await page.evaluate((p) => window.__akademeia!.game!.debugPlacePlayer(p.x, p.z, p.heading, p.yaw, p.pitch), shot.player);
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `docs/screenshots/${MILESTONE}/${shot.name}.png` });
  });
}
