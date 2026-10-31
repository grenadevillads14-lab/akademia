# Akademeia: notes for Claude (and humans)

Third-person 3D exploration and story game set at Plato's Academy, Athens, 367–335 BC.
**`GAME_DESIGN.md` is the master design. Read it first.** `PROGRESS.md` is the milestone log and decision record.
**`docs/RESEARCH.md`** is the sourced historical dossier everything is built from. `HISTORY_NOTES.md` separates documented, tradition and invented.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run check` | Typecheck + lint + unit tests (run before every commit) |
| `npm test` | Vitest unit tests (`tests/unit/**`) |
| `npm run test:e2e` | Playwright smoke tests (boots the game in headless Chromium) |
| `npm run screenshots` | `MILESTONE=x PRESET=medium npm run screenshots` writes `docs/screenshots/x/*.png` |
| `npm run build:artifact` | Build + `dist/artifact.html` for the hosted page (https://claude.ai/artifact/UHr1NTKJf2f1pbcwGsXMQx). Republish with the asset files it prints |
| `python3 -I scripts/fetch_polyhaven.py` | Download the Poly Haven assets in `content/assets/polyhaven.json` (WebP-encoded) |
| `node scripts/optimize-models.mjs` | Simplify fetched models into `public/assets/ph/game/<id>/lod{0,1}.gltf` |

URL parameters: `?bench[=s]` (also the **Run benchmark** button, `#bench`), `?preset=low|medium|high|ultra`, `?time=18.3`, `?season=summer`,
`?timescale=0`, `?at=x,z`, `?overlay=1`. Post-processing debug: `?post=0`, `?ao=0`, `?bloom=0`, `?shafts=0`, `?msaa=0`, `?postdebug=1` (raw scene colour).
In game: **F2** free camera, **F3** stats, **F4** respawn, **F6** +2 hours. Click to capture the mouse.

## Environment caveats

- **No GPU in the cloud container.** Chromium renders WebGL with SwiftShader: a frame takes 0.5–3 s at medium preset. Screenshots are valid,
  but fps numbers are meaningless here. Real performance comes from the user's `?bench` JSON (**Apple M1**, see PROGRESS.md).
- SwiftShader auto-selects the **low** preset (no post). Use `?preset=medium` or `high` for look screenshots.
- **Rendering screenshots while editing files:** the dev server hot-reloads open pages and breaks long renders. Build a snapshot
  (`npx vite build --outDir <scratch>/dist`) and serve it with `npx vite preview --outDir <scratch>/dist --port 5200`.
- Playwright is pinned to **1.63.0** (matches `/opt/pw-browsers`). Never run `playwright install`.
- Network: npm, GitHub (anonymous git) and Poly Haven are reachable. Many other hosts are blocked.

## Architecture

```
content/                       ALL game content as data (validated with zod at load)
  world/academy.json           layout: bounds, terrain noise, hills, rivers, Cimon's channels, paths, flats, zones, backdrop, spawn
  world/academy.vegetation.json planting plan (points, along, rows, ring, scatter, riverbank)
  world/academy.structures.json city wall, gates, districts, grave road, Academy buildings, enclosures, herms, props, rocks
  assets/polyhaven.json        Poly Haven asset manifest (CC0)
  i18n/en.json                 every player-facing string
src/
  main.ts                      boot → Game
  game/game.ts                 owns the loop: input → fixed-step sim → world → camera → post → UI
  core/                        events, loop, input (+gamepad), settings/presets, i18n
  procgen/                     seeded rng, noise (incl. tileable), 2D polyline geometry
  world/                       heightfield (analytic terrain + surfaces + water), terrain mesh, sky/clock/wind,
                               water ribbons, vegetation plan, structures, backdrop, world assembly
  vegetation/                  tree generator, species, leaf atlas, BatchedMesh forest with LODs + impostors, GPU grass
  architecture/                kit (Builder/Frame, metre UVs, per-material merge), greek (walls, gates, houses, graves, pottery),
                               doric (fluted columns, entablature, stoa), academy (gymnasium, shrine, altars, enclosures…), reliefs
  render/                      renderer, material library (Poly Haven), model library (glTF LODs, instancing),
                               post pipeline (SSAO, height fog, aerial perspective, shafts, bloom, grade), sky environment (IBL)
  characters/                  appearance schema, procedural skinned humanoid (one draw call, linen cloth), procedural animator
  player/                      Rapier kinematic controller (walk/run/sprint/jump/swim), third-person camera with collision
  npc/crowd.ts                 ambient crowd (walkers, groups) until the schedule system (M3)
  debug/                       overlay, frame stats, free camera, benchmark
tests/unit                     Vitest (pure logic: world data, plans, kit maths, noise, sun, input, settings…)
tests/e2e                      Playwright smoke + screenshot specs
scripts/                       asset fetch/optimise, artifact build
```

Conventions that matter:
- **World frame:** metres, +Y up, **north = −Z, east = +X**. Origin = gymnasium centre. `Frame(x, z, rot, y)`: local +Z = forward, same rotation as three's `rotation.y`.
- **The Dipylon's** local +Z points out of the city toward the Academy (rot −2.336). The city wall passes through the inner gate.
- All terrain queries go through `Heightfield` (`height`, `surface`, `water`, `grassDensity`), never the mesh.
- Architecture: build with `Builder` and material keys (`ashlar`, `mudbrick`, `whitewash`, `roof`, `marble`, `paving`, `wood`, `dark`, `terracotta`, `paint`…);
  one merged mesh per material per group. Add collision boxes for anything the player can bump into.
- Vegetation is one `BatchedMesh` for wood + one for leaves (LOD switching per instance). Bark uses Poly Haven textures.
- Post pipeline replaces `scene.fog` (set to null) with its own height fog. Low preset has no post and uses `FogExp2`.
- Terrain shader samples inside a loop: always use `textureGrad` with precomputed gradients there (implicit derivatives caused sparkles).
- Content is data; every player-facing string goes through `t()`. Procedural generation is seeded and deterministic.
- Smoke tests fail on console warnings. Fix deprecations; don't silence them.
- Assets: CC0 only; every file is recorded in `ASSETS.md` (generated from the Poly Haven manifest).

## Performance budgets (High preset, 1080p)

- Draw calls ≤ 250 (shadows included), triangles ≤ 1.5 M visible, shader programs ≤ 45.
- Target machine: **Apple M1** (ANGLE Metal, 60 Hz, DPR 2). Medium preset = 60 fps target. Compare `avgWorkMs` / `estUncappedFps` from `?bench`.

## Known issues

- The Rapier `-compat` chunk is 1.7 MB gzipped (WASM inlined).
- Characters are stylized procedural figures (decision in PROGRESS.md). Realistic humans would need MakeHuman/Mixamo assets from the user.
- `pickDefaultPreset` sends SwiftShader to Low; screenshots must request a preset explicitly.
