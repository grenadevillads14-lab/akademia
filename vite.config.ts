import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vitest/config';
import { Compiler } from 'inkjs/full';

/** Compile `.ink` dialogue files to ink JSON at build time (imports resolve to the compiled story object). */
function inkPlugin(): Plugin {
  return {
    name: 'akademeia-ink',
    transform(src, id) {
      if (!id.endsWith('.ink')) return null;
      const compiler = new Compiler(src);
      const story = compiler.Compile();
      if (compiler.errors.length) {
        this.error(`ink errors in ${id}:\n${compiler.errors.join('\n')}`);
      }
      for (const w of compiler.warnings) this.warn(`ink: ${w}`);
      return { code: `export default ${story.ToJson()};`, map: null };
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let commit = 'dev';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  /* no git history yet */
}

export default defineConfig({
  plugins: [inkPlugin()],
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
