import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let commit = 'dev';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  /* no git history yet */
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}+${commit}`),
  },
  // Relative base so the build runs from any folder or static host (GitHub Pages, claude.ai artifact, itch.io).
  base: './',
  server: { port: 5173, host: true },
  preview: { port: 4173 },
  build: {
    target: 'es2022',
    sourcemap: true,
    // The Rapier chunk carries its WASM inlined as base64 (4.3 MB raw / 1.7 MB gzip, see CLAUDE.md known issues).
    // Everything else should stay well under this limit.
    chunkSizeWarningLimit: 4500,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
