# Akademeia: notes for Claude (and humans)

Third-person 3D exploration and story game set at Plato's Academy, Athens, 367–335 BC.
**`GAME_DESIGN.md` is the master design. Read it first.** `PROGRESS.md` is the milestone log and decision record.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run check` | Typecheck + lint + unit tests (run before every commit) |
| `npm test` | Vitest unit tests (`tests/unit/**`) |
| `npm run test:e2e` | Playwright smoke tests (boots the game in headless Chromium) |
| `npm run build:artifact` | Build + write `dist/artifact.html` for the hosted claude.ai page (https://claude.ai/artifact/UHr1NTKJf2f1pbcwGsXMQx). Republish it with the asset JS files the script prints |
| `npm run screenshots` | Writes `docs/screenshots/$MILESTONE/*.png` (default `m0`), e.g. `MILESTONE=m1 npm run screenshots` |

URL parameters for debugging (the hosted page can't take query strings, so it has a **Run benchmark** button and `#bench`): `?bench[=seconds]`, `?preset=low|medium|high|ultra`, `?stress=N`, `?overlay=0`, `?settle`.
In game: **F2** free-fly camera (click to capture the mouse), **F3** or **`** stats overlay, **R** re-drop sandbox props.

## Environment caveats

- **The cloud container has no GPU.** Playwright's Chromium renders WebGL with SwiftShader (software), at roughly 5–20 fps.
  Screenshots are valid, but **fps numbers from this environment are meaningless**. Real performance comes only from the
  player running `?bench` on their own machine and pasting the JSON. Inside the container, enforce draw-call and triangle budgets instead.
- Playwright is pinned to **1.63.0** to match the browsers preinstalled at `/opt/pw-browsers`. Never run `playwright install`.
- Network: npm and GitHub are reachable. Poly Haven, Quaternius and Kenney are **blocked** by the environment's network policy
  unless the user allows them, so assets are procedural until then.
- The repository is `grenadevillads14-lab/akademia`. Push to `main` after each milestone.

## Architecture (as of M0)

```
content/          ALL game content as data (i18n tables now; dialogue/quests/puzzles/POIs later)
src/main.ts       boot: settings → renderer → physics → scene → loop
src/core/         engine-level, DOM-light, unit-tested
  events.ts       typed EventBus<GameEvents>; systems talk through it, never import each other
  loop.ts         FixedStep accumulator (sim at 60 Hz, render at display rate)
  input.ts        action bindings (remappable). InputState is pure; Input attaches it to the DOM
  settings.ts     quality presets + GPU-string heuristic for the default preset; localStorage
  i18n.ts         t(key, vars) over content/i18n/<locale>.json
src/render/       renderer creation (AgX tone mapping, sRGB, manual info reset), resize
src/physics/      Rapier world wrapper (lazy-loaded chunk)
src/debug/        stats overlay, FrameStats, free-fly camera, benchmark (?bench)
src/scenes/       sandbox.ts: the M0 graybox test scene (replaced in M1)
src/ui/           CSS (papyrus / red-figure palette)
tests/unit        Vitest. Pure logic only
tests/e2e         Playwright: smoke.spec.ts (boot, no console errors/warnings), screenshots.spec.ts
```

Frame order in `main.ts`: input edge actions → fixed-step physics → sync meshes → camera → `renderer.info.reset()` → render → overlay → benchmark → `input.endFrame()`.

`window.__akademeia` is a debug handle (`ready`, `stats()`, `setCamera()`, `bench`) used by Playwright. Don't use it from game code.

## Conventions

- TypeScript strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. No `any`.
- **Content is data.** No dialogue, quest text, item text or POIs in `src/`. Every player-facing string goes through `t()`.
- Units: metres, seconds, radians. +Y up. World origin will be the Academy gymnasium centre (from M2).
- Procedural generation is **seeded** (`mulberry32` in `scenes/sandbox.ts`, to move to `src/procgen/rng.ts` in M1) so screenshots are repeatable.
- Every three.js geometry, material and texture a module creates must be disposed by that module.
- Smoke tests fail on **console warnings** too. Fix deprecations; don't silence them (except SwiftShader GPU-stall noise).
- Historical claims: anything invented goes into `HISTORY_NOTES.md` under "Invented for the game".
- Assets: CC0 or similarly permissive only. Every file is recorded in `ASSETS.md`. Ask the user before anything paid or account-gated.

## Performance budgets (High preset, 1080p), checked in screenshots and overlay

- Draw calls ≤ 250 (shadow passes included), triangles ≤ 1.5 M visible, shader programs ≤ 40.
- Medium preset is the integrated-GPU target (60 fps). Low is the 30 fps floor.
- The truth is the `?bench` JSON from real hardware, logged in `PROGRESS.md`.

## Known issues

- The Rapier `-compat` chunk is 4.3 MB raw / 1.7 MB gzip (the WASM is base64-inlined). Planned: switch to `@dimforge/rapier3d`
  with a separately streamed `.wasm` in the M2 performance pass.
- The M0 sandbox has many non-instanced meshes (about 145 draw calls including shadows). That's fine for a test scene; real scenes use instancing.
- No gamepad yet (lands with the character controller in M1).
