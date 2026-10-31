// Builds the game and writes dist/artifact.html: a claude.ai-artifact-friendly page
// (no <html>/<head>/<body> wrapper, CSS inlined, module script referenced relatively).
// Usage: node scripts/build-artifact.mjs   → prints the asset files to publish alongside it.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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

const assets = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
console.info(JSON.stringify(Object.fromEntries(assets.map((f) => [`assets/${f}`, `dist/assets/${f}`])), null, 2));
