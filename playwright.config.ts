import { defineConfig } from '@playwright/test';

// Headless Chromium in CI/cloud containers has no GPU: WebGL runs on SwiftShader (software).
// Screenshots are valid; frame rates measured there are NOT. Use the in-game benchmark (?bench) on real hardware.
const PORT = 5199;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 300_000, // software WebGL with realistic characters is slow; tests wait on frames
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    { name: 'smoke', testMatch: /smoke\.spec\.ts/ },
    { name: 'screenshots', testMatch: /screenshots\.spec\.ts/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
