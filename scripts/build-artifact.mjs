// Builds the game and writes dist/artifact.html: a claude.ai-artifact-friendly page
// (no <html>/<head>/<body> wrapper, CSS inlined, module script referenced relatively).
// Usage: node scripts/build-artifact.mjs   → prints the asset files to publish alongside it.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx vite build --sourcemap false', { stdio: 'inherit' });

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const script = html.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/)?.[1];
const cssHref = html.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/)?.[1];
if (!script || !cssHref) throw new Error('Could not find entry script or stylesheet in dist/index.html');
const css = readFileSync(join(dist, cssHref), 'utf8');
const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1]?.replace(/<script[\s\S]*?<\/script>/g, '').trim() ?? '';

const page = `<title>Akademeia</title>
<meta name="theme-color" content="#2a1d14">
<style>
${css}
</style>
${body}
<script type="module" src="${script}"></script>
`;
writeFileSync(join(dist, 'artifact.html'), page);

// Artifacts serve JSON but not raw .bin buffers: inline each model's buffer into its .gltf as a data URI.
const gameDir = join(dist, 'assets', 'ph', 'game');
for (const id of readdirSync(gameDir)) {
  for (const f of readdirSync(join(gameDir, id))) {
    if (!f.endsWith('.gltf')) continue;
    const path = join(gameDir, id, f);
    const gltf = JSON.parse(readFileSync(path, 'utf8'));
    for (const b of gltf.buffers ?? []) {
      if (!b.uri || b.uri.startsWith('data:')) continue;
      const bin = join(gameDir, id, b.uri);
      b.uri = `data:application/octet-stream;base64,${readFileSync(bin).toString('base64')}`;
      rmSync(bin);
    }
    writeFileSync(path, JSON.stringify(gltf));
  }
}
// The raw Poly Haven cache and empty music folders are not used by the game.
rmSync(join(dist, 'assets', 'ph', 'models'), { recursive: true, force: true });
rmSync(join(dist, 'assets', 'audio'), { recursive: true, force: true });

const assets = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
console.info(JSON.stringify(Object.fromEntries(assets.map((f) => [`assets/${f}`, `dist/assets/${f}`])), null, 2));
