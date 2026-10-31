# Assets and licenses

Every third-party file in the repository is listed here with its source and license. Only CC0 or equivalently permissive
licenses are allowed. Procedural stand-ins are listed too, marked as replacement candidates where a real asset would help.

## Third-party assets

_None yet._ (Poly Haven, Quaternius and Kenney are currently unreachable from the build environment; see PROGRESS.md.)

## Code dependencies (runtime)

| Package | License | Use |
|---|---|---|
| three | MIT | Rendering |
| @dimforge/rapier3d-compat | Apache-2.0 | Physics and character controller |

## Procedural assets (generated in code)

| Asset | Where | Replacement candidate? |
|---|---|---|
| Ground grid texture (packed earth + 1 m/10 m grid) | `src/scenes/sandbox.ts` | Removed in M1 (terrain splat textures) |
| Graybox Doric colonnade | `src/scenes/sandbox.ts` | Replaced by the procedural Doric generator in M2 |

## Audio slots (empty, for your own tracks)

`public/assets/audio/music/{exploration,garden,gymnasium,dusk,night,dialogue}/`. Drop stems in as `.ogg` (preferred) or `.mp3`.
The music system (M10) crossfades by zone and time of day.
