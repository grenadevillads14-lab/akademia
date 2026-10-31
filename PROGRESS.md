# Progress log

## Milestone status

| Milestone | Status |
|---|---|
| M0 Foundation | ✅ done |
| M1 Walking in the grove | ✅ done |
| M2 Academy graybox → first art pass | ✅ done (art polish continues) |
| M3 Life (NPCs, dialogue, prologue) | ✅ done |
| M4 Systems | ✅ done |
| M5 Puzzles batch 1 + Act 1 (vertical slice complete) | ✅ done |
| Visual overhaul (user feedback: "looks like 2000") | ✅ passes 1–3 done, continuing |
| M6 Athletics | 🔨 built (races, torch race, throws, wrestling), being polished |
| M7 Act 2 + Cave | 🔨 built (puzzles, story, Cave interlude) |
| M8 Acts 3–4 | 🔨 built (debates, specimens, funeral, farewell; Lesbos stubbed) |
| M7–M10 | — |

---|---|
| M0 Foundation | ✅ done |
| M1 Walking in the grove | ⏭ next |
| M2 Academy graybox → first art pass | — |
| M3 Life (NPCs, dialogue, prologue) | — |
| M4 Systems | — |
| M5 Puzzles batch 1 (vertical slice complete) | — |
| M6–M10 | — |

---

## Visual overhaul (2026-10-31)

User feedback after trying the hosted build: "it looks like it was made in 2000". Work since then, biggest wins first:

- **Realistic people** from CC0 MakeHuman data (`scripts/build_humans.py`, `src/characters/mhuman.ts`): blended body
  targets per character, photographic skins, fitted hair/beards/brows/eyes, Greek clothes cut from MakeHuman's clothing
  helpers with per-pixel hems and woven borders, bound to the existing 20-bone rig; low-poly bodies for crowds;
  relaxed fingers baked in; hair with sheen.
- **Photographic leaves** (`scripts/build_foliage.py`, CC0 ambientCG leaf sets) composed into per-species twig sprays.
- **Material calibration:** many Poly Haven scans are shot very dark (white plaster mean albedo 0.17, roof tiles 0.05).
  Building materials are now repainted to measured real-world albedos, keeping the photo detail. Whitewash is white.
- **Weathering shader** for architecture (damp at wall bases following the terrain, rain streaks, bleaching, dust, lichen).
- **Lighting:** sun dominates sky ambient; the environment map's ground half is lit earth (warm bounce); tighter, softer
  shadows (4096 on high); lit cloud sheet with self-shadowing; impostor trees with rounded normals.
- **Sharpness:** dynamic resolution up to the full Retina pixel ratio with contrast-adaptive sharpening; Apple M1 → High.
- **Ground:** tufted curved grass with translucency, pebbles and fallen leaves around the player, farmland patchwork
  (wheat, ploughed earth, vineyards, field boundaries) and six olive orchards on the plain.

## M5: Puzzles batch 1 and Act 1 (2026-10-31)

- **Puzzles as pure, tested logic** in `src/puzzles/` with content in `content/puzzles/` and `content/debates/`:
  - *Meno's square* (`meno.ts`): a lattice in the dust; any drawn square is detected (sides may be built from collinear pieces) and
    its exact area shown. Feedback follows the slave boy's real wrong turns (side 4 → area 16, side 3 → 9), three hint levels.
  - *Cimon's waterworks* (`waterworks.ts`): equal split at every open junction, needs and flood limits per outlet, a closed dead end
    backs up. A test enumerates every setting: exactly one solution.
  - *Socratic debate* (`debate.ts`): rounds, moves that commit you to claims, contradictions cost your own consistency, arguments
    made too early are weak and can be retried. The first debate follows Plato's *Laches* (what is courage?).
  - *Moriai*: twelve lore cards with source and certainty badge; four are needed for Act 1, all twelve finish the set.
- **UI** (`src/puzzles/ui.ts`): canvas overlays on papyrus; the game halts while one is open. `PuzzleHost` (`src/game/puzzleHost.ts`)
  queues puzzles and lore cards behind dialogue, applies rewards, and drives the 3D channels from the saved waterworks setting.
- **Story engine additions:** `puzzle <id> [arg]` and `time <h> [next]` commands; `collect` interact triggers (any POI of a kind);
  `allQuestsDone` and `collected: "set:n"` requirements; story files merge in `order`; the objective marker comes from the first
  active quest that has one.
- **Act 1 "The outsider"** (`content/dialogue/act1.ink`, `content/story/act1.json`): Plato's farewell before Syracuse (night passes),
  Eudoxus sets four trials (Meno square, four moriai, Speusippus' water, the gymnasiarch's courage debate plus a run down the xystos),
  then the first lesson: Eudoxus' argument that pleasure is the good, with Plato's *Philebus* reply and Aristotle's remark on Eudoxus'
  temperance (NE X.2). A unit test plays the prologue and Act 1 start to finish through the real triggers.
- **Bug fixed:** the pause menu's `display: grid` overrode the `hidden` attribute, so since M4 the menu was drawn over the game.
  A global `[hidden] { display: none !important; }` rule fixes every overlay.

## M4: Systems (2026-10-31)

Game state with a small command language (flags, XP in four disciplines, reputation, ideas, items, quests, codex, collectibles,
herms), saves (auto + three slots, JSON export/import), pause menu (journal, codex with certainty badges, map with fog of war,
disciplines with a 28-node skill tree, settings, saves), compass with objective marker, title screen with character creation,
herm fast travel.

## M3: Life (2026-10-31)

Procedural skinned characters (one draw call each, linen cloth shading), procedural animator, NPCs with pose / walk / patrol /
follow modes, ink dialogue compiled at build time with `cmd:`/`anim:`/`shot:` tags, dialogue camera shots, story director with
placements and talk / interact / zone / auto triggers, and the prologue (Dipylon → road of graves → grove → Plato's circle).

## M2: Academy and the look pass (2026-10-31)

Kerameikos and Academy architecture from a material-keyed kit (city wall, Dipylon, Sacred Gate, Pompeion, potters' quarter, grave
terraces with stelai and reliefs, Doric stoa and gymnasium after Vitruvius, xystos, Mouseion, altars, Plato's house), Poly Haven
photographic textures and models, custom HDR post pipeline (SSAO, height fog, aerial perspective, light shafts, bloom, AgX),
image-based lighting from the sky, backdrop mountains at their true apparent heights with the Acropolis.

## M1: Walking in the grove (2026-10-31)

Analytic heightfield terrain with rivers and Cimon's channels, sky and day/night clock, wind, procedural tree species with LODs
and impostors in two BatchedMeshes, GPU grass, Rapier kinematic player (walk, run, sprint, jump, swim), third-person camera with
collision.

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
