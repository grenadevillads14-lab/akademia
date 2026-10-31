# Progress log

## Milestone status

| Milestone | Status |
|---|---|
| M0 Foundation | ✅ done |
| M1 Walking in the grove | ⏭ next |
| M2 Academy graybox → first art pass | — |
| M3 Life (NPCs, dialogue, prologue) | — |
| M4 Systems | — |
| M5 Puzzles batch 1 (vertical slice complete) | — |
| M6–M10 | — |

---

## M0: Foundation (2026-10-31)

**Delivered**
- Vite 8 + TypeScript 6 (strict) + three.js r187 + Rapier 0.21 (compat). ESLint (flat config, typescript-eslint), Vitest, Playwright.
- Core: typed event bus, fixed-timestep loop, remappable action input, settings with quality presets, i18n (`t()`).
- Debug: stats overlay (fps, frame ms, 1% low, draw calls, triangles, geometries, textures, shaders, physics bodies, preset, GPU),
  free-fly camera (F2), `?stress=N` instancing test, **in-game benchmark (`?bench`)** with a copyable JSON report.
- Sandbox scene: a graybox Doric colonnade, falling terracotta/marble props on Rapier, sun shadows, and haze.
- Tests: 36 unit tests and 3 e2e smoke tests (boot with no console errors or warnings, an instancing draw-call budget, the benchmark report).
- Screenshots: `docs/screenshots/m0/`.

**Measured (container, SwiftShader software rendering, so not representative)**
- Sandbox: about 145 draw calls, about 13 k triangles.
- 20,000 instanced stones: +1.44 M triangles for only 2 extra draw calls (1 colour pass + 1 shadow pass), so instancing works as intended.

**Decisions made (per the "make the call and note it" rule)**
- **Characters for the vertical slice: stylized low-poly**, in Quaternius proportions, with clothing (chiton/himation) as separate
  skinned meshes on one shared skeleton. No cloth simulation. Faces are readable at dialogue distance through shape and hair/beard silhouettes,
  not detail. Rationale: it matches the "Ghibli softness" art direction, holds up on integrated GPUs, and keeps
  animation retargeting to a single rig. Higher-fidelity characters are an M10 polish item, if ever needed.
- **Language: English only.** All strings remain keyed (`content/i18n/en.json`) so another locale can be added later without code changes.
- **Tone mapping: AgX** rather than ACES. It holds saturated golden-hour oranges better and doesn't shift them toward yellow.
- **Default preset from the GPU string**: integrated GPUs → Medium, discrete → High, software → Low. The player can override.
- **Hardware unknown**: the user doesn't know their laptop's CPU/GPU. The benchmark report prints the GPU name, so running
  `?bench` once answers that question and gives a baseline.
- Rapier is loaded as a lazy chunk so the loading screen paints immediately.

**Real-hardware benchmark #1 (user's laptop, 2026-10-31)**

| Field | Value |
|---|---|
| GPU | Apple M1 (ANGLE Metal), Claude desktop app (Chromium 152), DPR 2 |
| Preset | medium (auto-picked) |
| Result | 60 fps avg, 56 fps 1% low, p99 17.7 ms, worst 18.8 ms; about 124 draw calls, 8.8 k triangles |
| Caveat | Run in a 579×855 side panel (about 25% of 1080p pixels) and capped by the 60 Hz display, so it shows the sandbox is smooth but not the spare capacity |

Follow-up (done): the benchmark now renders at a **fixed 1920×1080** internal resolution and records **CPU+GPU work time per frame**
(`gl.finish`), with `estUncappedFps`, so future runs are comparable and show spare capacity above the vsync cap.
**Target machine is now known: Apple M1.** Medium preset is the 60 fps target. Re-benchmark at the end of M1 and M2.

**Open items for the user**
- ~~Run the benchmark once~~ ✅ done (Apple M1).
- Optional: allow `polyhaven.com`, `dl.polyhaven.org`, `quaternius.com` and `kenney.nl` in the environment's network settings so real CC0 textures and models can be fetched.
  Until then everything is procedural.

**Next (M1)**: heightmap terrain with splat textures, physical sky and day/night, a procedural olive and a plane tree with wind,
a Rapier kinematic character controller with a third-person camera and gamepad, and graybox paths.
