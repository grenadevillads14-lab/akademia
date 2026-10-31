# Assets and licenses

Every third-party file in the repository is listed here with its source and license. Only CC0 or equivalently permissive
licenses are allowed. Procedural assets (generated in code) are listed too.

## Poly Haven (CC0 1.0): https://polyhaven.com

Fetched by `python3 -I scripts/fetch_polyhaven.py` (manifest: `content/assets/polyhaven.json`), re-encoded to WebP.
Models are simplified into two LODs by `node scripts/optimize-models.mjs` into `public/assets/ph/game/`. The raw downloads are a git-ignored cache.

### Textures (1k: albedo, OpenGL normal, AO/roughness/metalness)

| Asset | Author(s) | Used for |
|---|---|---|
| [White Sandstone Blocks 02](https://polyhaven.com/a/white_sandstone_blocks_02) | Rob Tuytel | ashlar limestone: gate towers, wall socles, altars |
| [Stacked Stone Wall](https://polyhaven.com/a/stacked_stone_wall) | Dimitrios Savva | dry-stone walls (Kepidion, field walls) |
| [Clay Plaster](https://polyhaven.com/a/clay_plaster) | Amal Kumar | mudbrick with clay render: city wall upper courses, houses |
| [White Plaster Rough 01](https://polyhaven.com/a/white_plaster_rough_01) | Rob Tuytel | whitewashed house walls |
| [Clay Roof Tiles](https://polyhaven.com/a/clay_roof_tiles) | Amal Kumar | terracotta roof tiles |
| [Marble 01](https://polyhaven.com/a/marble_01) | Rob Tuytel | Pentelic marble: stelai, herms, altar of Prometheus |
| [Sparse Grass](https://polyhaven.com/a/sparse_grass) | Amal Kumar | meadow ground |
| [Dry Ground 01](https://polyhaven.com/a/dry_ground_01) | Rob Tuytel | dry summer ground |
| [Rock Face](https://polyhaven.com/a/rock_face) | Greg Zaal, Dario Barresi | outcrops on Colonus |
| [Brown Mud](https://polyhaven.com/a/brown_mud) | Rob Tuytel | river banks |
| [Sand 01](https://polyhaven.com/a/sand_01) | Rob Tuytel | palaestra sand |
| [Rock Tile Floor](https://polyhaven.com/a/rock_tile_floor) | Charlotte Baglioni | paved floors (stoa, gymnasium porticoes) |
| [Bark Platanus](https://polyhaven.com/a/bark_platanus) | Dimitrios Savva | oriental plane bark |
| [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) | Rob Tuytel | olive and fig bark |
| [Wood Plank Wall](https://polyhaven.com/a/wood_plank_wall) | Dimitrios Savva | gate doors, workshop shutters |
| [Gravelly Sand](https://polyhaven.com/a/gravelly_sand) | Dario Barresi | footpaths and packed earth |
| [Rocky Trail](https://polyhaven.com/a/rocky_trail) | Amal Kumar | the road to the Academy and the Sacred Way (pale Attic gravel) |
| [Rough Linen](https://polyhaven.com/a/rough_linen) | colormass, Rico Cilliers | linen weave for chitons and himatia |
| [Hessian 230](https://polyhaven.com/a/hessian_230) | colormass, Rico Cilliers | coarse wool/hemp (the Cynic tribon, sacks) |

### Models

| Asset | Author(s) | Used for | LOD0 / LOD1 triangles |
|---|---|---|---|
| [Namaqualand Boulder 02](https://polyhaven.com/a/namaqualand_boulder_02) | Greg Zaal, Rico Cilliers | boulder | 6000 / 1494 |
| [Namaqualand Boulder 04](https://polyhaven.com/a/namaqualand_boulder_04) | Jenelle van Heerden | boulder | 5000 / 1200 |
| [Stone 01](https://polyhaven.com/a/stone_01) | Dario Barresi, Rico Cilliers | small stone | 2500 / 600 |
| [Shrub 02](https://polyhaven.com/a/shrub_02) | Rico Cilliers | shrub | 8995 / 2793 |
| [Shrub 04](https://polyhaven.com/a/shrub_04) | Rico Cilliers | shrub | 9000 / 2889 |
| [Wild Rooibos Bush](https://polyhaven.com/a/wild_rooibos_bush) | James Ray Cock, Jenelle van Heerden | low scrub (stands in for thyme and rosemary) | 9972 / 2851 |
| [Grass Medium 01](https://polyhaven.com/a/grass_medium_01) | Rob Tuytel, Rico Cilliers | grass tuft | 5076 / 1602 |
| [Grass Medium 02](https://polyhaven.com/a/grass_medium_02) | Rico Cilliers | grass tuft | 3997 / 1398 |
| [Marble Bust 01](https://polyhaven.com/a/marble_bust_01) | Rico Cilliers | herm head | 6000 / 1800 |

Not used (removed): `boulder_01` (does not simplify cleanly), `shrub_01` (too dense), and modern-looking vases and baskets; Greek pottery is generated in code instead.

## Code dependencies (runtime)

| Package | License | Use |
|---|---|---|
| three | MIT | Rendering |
| @dimforge/rapier3d-compat | Apache-2.0 | Physics and character controller |
| zod | MIT | Content validation |
| inkjs | MIT | Dialogue (from M3) |
| howler | MIT | Audio (from M10) |

## Procedural assets (generated in code)

| Asset | Where |
|---|---|
| Trees: olive, moria, oriental plane, cypress, fig, pomegranate, myrtle, laurel, reeds (with painted leaf atlas and impostors) | `src/vegetation/` |
| Grass blades | `src/vegetation/grass.ts` |
| Architecture: city wall, Dipylon, Sacred Gate, Pompeion, houses, kilns, grave terraces, stelai, naiskoi, lekythoi, loutrophoroi, casualty lists, herms | `src/architecture/` |
| Greek pottery: amphorae, pithoi, hydriai, kraters | `src/architecture/greek.ts` |
| Carved inscriptions and reliefs (normal maps from canvas drawings) | `src/architecture/reliefs.ts` |
| Far backdrop: mountains, Lycabettus, Acropolis and Parthenon, city roofscape | `src/world/backdrop.ts` |
| Characters (skinned, procedural animation) | `src/characters/` |
| Sky, stars, moon | `src/world/sky.ts` |

## Audio slots (empty, for your own tracks)

`public/assets/audio/music/{exploration,garden,gymnasium,dusk,night,dialogue}/`. Drop stems in as `.ogg` (preferred) or `.mp3`.
