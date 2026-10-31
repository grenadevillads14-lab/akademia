# AKADEMEIA — Master Prompt for Claude Code

> How to use: create an empty folder, open Claude Code in it, save this file there as `GAME_DESIGN.md`, then paste the kickoff message from the bottom of this file.

---

## 0. Your role and how to work

You are the lead engineer, technical artist and game designer on **Akademeia**, a third-person 3D exploration and story game set in Athens from 367 to 335 BC. The player is a new student at Plato's Academy who arrives on the same day as the 17-year-old Aristotle, lives through their years together, and later helps Aristotle found his own school at the Lyceum.

Think "Hogwarts Legacy in ancient Greece", scaled to a realistic indie project built by one person with you. Atmosphere, a believable living world and smart puzzles matter far more than combat or graphical fidelity.

**Working rules**
- Build in the milestones in section 9, in order. Never start a milestone before the previous one runs, is playable and is committed to git.
- After each milestone: run the game, take Playwright screenshots of the key scenes, look at them, fix what's visibly wrong, update `CLAUDE.md` and `PROGRESS.md`, and commit.
- Keep a `CLAUDE.md` in the repo root with architecture notes, conventions, the commands to run and test, and known issues, so any future session can pick up instantly.
- Everything that is content (dialogue, quests, item text, puzzle definitions, map points of interest) lives in data files, not hard-coded in engine code.
- Ask me before adding any paid service or asset, any dependency that needs an account, or anything that changes the core design. Otherwise make the call yourself and note it in `PROGRESS.md`.
- Performance target: a stable 60 fps at 1080p on a mid-range laptop with integrated graphics, and 30+ fps on low settings. Measure it; don't guess.

---

## 1. Tech stack (use this unless you hit a hard blocker)

- **Language and build:** TypeScript (strict) + Vite.
- **Rendering:** Three.js (latest stable), with `three/examples/jsm` addons. WebGL2 baseline; WebGPU renderer optional behind a flag.
- **Physics and character controller:** Rapier (`@dimforge/rapier3d-compat`) with a kinematic character controller: walking, running, climbing low walls and steps, swimming in the Cephissus.
- **Post-processing:** `postprocessing` library: ACES or AgX tone mapping, bloom (subtle), SSAO/N8AO, depth-of-field in dialogue only, light volumetric fog / god rays through the plane-tree canopy.
- **Dialogue:** ink (`inkjs`) for branching dialogue, with a custom UI layer.
- **Audio:** Howler.js. Positional ambience: cicadas by day, crickets and owls at night, water in the channels, wind in the olives, distant grunts and dust from the palaestra. Music slots: separate stems for exploration, the garden, the gymnasium, dusk and night, and dialogue, crossfaded by zone and time of day. Leave clearly named slots so I can drop in my own tracks later.
- **UI:** plain HTML/CSS overlay (no heavy UI framework), styled like papyrus and red-figure pottery.
- **State:** a small typed event bus plus a save system (localStorage, with export/import of save files as JSON).
- **Testing:** Vitest for logic (quests, puzzles, save/load), Playwright for smoke tests and screenshot capture.
- **Assets (free, permissive licenses only; record every source in `ASSETS.md`):**
  - Textures and HDRIs: Poly Haven (CC0).
  - Characters: Quaternius and Kenney packs (CC0) as base meshes, re-dressed in chitons and himations. Animations from Mixamo if I download them for you (it needs an account), otherwise Quaternius animations.
  - Trees and vegetation: procedural generation in code (you write the generators), or a procedural tree library for three.js if a good MIT one exists. Bake to GLB at build time.
  - Architecture: model it procedurally in code (columns, stoas, roofs, walls) so it's accurate and lightweight. See section 4.
- If a needed asset doesn't exist for free, generate a clean stylized version procedurally and list it in `ASSETS.md` as a replacement candidate.

**Art direction:** stylized realism, painterly. Think warm Mediterranean light, slightly simplified shapes and rich color, closer to *Assassin's Creed Odyssey* lighting meets *Ghibli* softness than photorealism. Stylized holds up far better on a small budget.

---

## 2. Setting and historical anchors

Use these as the factual spine. Where you invent, keep it plausible and flag invented history in a `HISTORY_NOTES.md` file, separating "documented", "tradition or legend" and "invented for the game".

- **367 BC:** Aristotle, 17, from Stagira, arrives at the Academy. Plato is about 60. That year Plato is away in Syracuse for a while, and Eudoxus of Cnidus (mathematician and astronomer) is often said to have led the school in his absence.
- **People who can appear at the Academy in this period:** Plato; Speusippus (his nephew and later successor); Xenocrates; Eudoxus of Cnidus; Heraclides of Pontus; Philip of Opus; Axiothea of Phlius and Lasthenia of Mantinea (women students, said to have attended dressed as men); Dion of Syracuse (visiting). Diogenes the Cynic is in Athens and mocks Plato (the plucked chicken: "behold, Plato's man"). Use him as a wandering trickster NPC.
- **Doctrine to dramatize:** the Theory of Forms, the Allegory of the Cave, the Divided Line, the Meno's slave-boy geometry lesson (doubling the square), the Platonic solids (Timaeus), and the Third Man argument (Aristotle's objection to the Forms).
- **347 BC:** Plato dies. Speusippus becomes head. Aristotle leaves Athens: first Assos (with Hermias), then Lesbos with Theophrastus (biology, marine life in the lagoon of Pyrrha), then Macedon to tutor the young Alexander (from 343).
- **335 BC:** Aristotle returns and founds his school at the **Lyceum**, a public gymnasium sacred to Apollo Lykeios east of the city, near the Ilissos river and below Mount Lycabettus. As a foreigner (metic) he couldn't own land, so he taught in the existing gymnasium and its covered walk (the peripatos), building up a library and collections of specimens. In the game, "founding his own gymnasium" means helping him establish the school there: recruiting students, building the library, filling the collections, and setting up the walk. Keep that accurate.
- **The "Let no one ignorant of geometry enter" inscription** is a late legend (no contemporary source). It can appear as a rumor that students joke about. Don't present it as fact.
- **Real ritual to include:** the torch race that began at the altar of Prometheus inside the Academy and ran to the city.

---

## 3. The world map

One continuous open world (with streaming by zone), compressed in scale. Roughly 1.5 × 1.5 km of playable space plus a far backdrop. Real geography, compressed.

### Zones (with landmark, mood and gameplay role)

1. **The Dipylon Gate and Kerameikos** (starting zone)
   - The double gate in the city wall, the potters' quarter, and the broad road to the Academy (the Demosion Sema) lined with grave stelai, monuments and cypresses for the honored war dead.
   - Mood: solemn, monumental. Gameplay: tutorial walk with Aristotle, first dialogue, read stelai for lore.
2. **The outer sacred grove: the Moriai**
   - A public park, much lusher than rocky central Athens because of the marshy Cephissus basin.
   - **The twelve sacred olives**, state-protected and said to descend from Athena's olive on the Acropolis. Massive, deeply split, hollow trunks with rough silver-gray bark; low twisted branches touching the dirt; moss on the north side. Leaves glossy dark green on top and silver underneath: the vertex shader must flip the leaf color as wind passes so the whole grove shimmers silver in gusts.
   - Floor: packed dirt paths. Seasonal: bruised fallen black olives in late autumn; wild anise, poppies and chamomile in spring.
   - Gameplay: collectible "Find all 12 Moriai" (each has a small myth or law fragment), foraging, NPC students reading under trees.
3. **The plane-tree walks and Cimon's waterways**
   - Towering oriental plane trees (Platanus orientalis) line the main walking paths (peripatoi). Smooth trunks shedding jigsaw-like flakes of cream, khaki and gray bark. Huge hand-shaped leaves lock into a shady ceiling; the area is visibly darker and cooler (lighting and fog shift).
   - Stone-lined irrigation ditches and terracotta pipes fed by the Cephissus; tall reeds, ivy climbing the trunks, beds of myrtle and laurel.
   - Gameplay: the waterworks puzzle chain (section 6); walking-dialogue mechanic (debate while walking the peripatos).
4. **The gymnasium and its precincts**
   - A square peristyle courtyard with Doric colonnades. Center packed with fine sand for wrestling (the palaestra), covered stoas around it where Plato teaches in bad weather (voice reverb on stone).
   - Changing rooms, oil and strigils, a bathing area, a running track (dromos) in the grove.
   - **The Mouseion:** a small stone altar to the Muses under a cluster of tall dark cypresses, ringed by marble herms (square pillars topped with carved heads of gods and sages).
   - **The altar of Prometheus:** start of the torch race.
   - Gameplay: athletics minigames, the Muses quest, the torch race festival.
5. **Plato's private garden: the Kepidion**
   - Bought by Plato next to the public grounds; separated by a low dry-stone wall covered in creeping thyme and wild rosemary.
   - Deliberately tended: neat rows of fig trees (broad fragrant leaves, heavy dark fruit), clusters of pomegranate trees with bright red flowers, a small house and scroll room.
   - **The teaching circle:** a ring of stone benches under a huge ancient plane tree. Plato draws geometric proofs in the dirt with a stick. The inner sanctum, away from the noise of the athletes.
   - Gameplay: main-story lessons, geometry drawn in the dirt as interactive puzzles, the hub where you return between chapters.
6. **The Cephissus river and the hill of Colonus**
   - River with reeds, fords, frogs, herons. The hill of Colonus (Sophocles' birthplace, with a grove sacred to Poseidon and the Eumenides) as a viewpoint over the plain to the Acropolis.
   - Gameplay: swimming, hidden caves, a night-time sky viewpoint for Eudoxus' astronomy quests.
7. **The city backdrop**
   - The Acropolis with the Parthenon, the Long Walls, Mount Lycabettus, Hymettus and Aigaleo, the Saronic gulf glinting far away. High-quality far LOD and impostors; reachable later as a separate area (optional milestone).
8. **The Lyceum (Act 5, unlocked late)**
   - East of the city by the Ilissos, below Lycabettus. A gymnasium of Apollo Lykeios with a covered walk. Starts run-down; the player rebuilds it with Aristotle (section 7).

### World systems
- **Day/night cycle** (about 24 real minutes per day) with physically based sky, sun and moon, stars, and sun color shifting from cool dawn to amber golden hour to violet dusk. Lamps, braziers and the altar fires light at dusk.
- **Seasons** tied to story chapters: spring (flowers), summer (dry grass, cicadas, figs), autumn (fallen olives, ripe split pomegranates), winter (rain, teaching moves to the stoa).
- **Weather:** clear, Attic wind (drives the olive silver shimmer), occasional rain.
- **NPC schedules:** students walk to lessons in the morning, train at the palaestra at midday, sit in the shade in the heat, eat together in the evening, sleep at night. Plato's daily routine is readable and learnable.
- **Fast travel** via the herms (once discovered).
- **Map and journal UI:** a hand-drawn map that fills in as you explore (fog of war), with the journal written as wax-tablet notes.

---

## 4. Art and 3D detail spec

### Vegetation (procedural, instanced, with LOD and wind)
- **Olive (Olea europaea):** short, wide, gnarled. Trunks split into 2–4 twisting stems, hollowed with age. Small narrow leaves in dense clumps; two-tone material (dark glossy top, silver underside) with wind-driven flipping. Sacred Moriai at 2–3× normal size.
- **Oriental plane (Platanus orientalis):** tall, broad, high canopy. Smooth trunk with camouflage-like bark patches (cream, khaki, olive-gray). Large five-lobed leaves. Dappled light on the ground beneath (light cookies or projected shadow texture).
- **Cypress:** tall, narrow, dark flame-shaped, slight sway.
- **Fig:** low spreading tree, very large lobed leaves, dark purple fruit.
- **Pomegranate:** small bushy tree, glossy small leaves, red-orange flowers, round fruit later in the season.
- **Ground cover:** reeds, myrtle, laurel, creeping thyme, rosemary, wild anise, poppies, chamomile, dry grass; GPU-instanced grass that bends around the player.
- Every tree type: 3 LOD levels plus a billboard impostor, all wind-animated in the vertex shader, with consistent gust direction from a global wind system.

### Architecture (procedural modeling in code)
- **Doric order done right:** fluted columns (20 flutes), entasis (slight bulge), echinus and abacus capitals, triglyphs and metopes on the frieze, terracotta roof tiles with antefixes. Limestone for the gymnasium, Pentelic marble only for special pieces (herms, altar).
- **Dry-stone walls** generated from irregular stones, with thyme and rosemary growing on top.
- **Grave stelai** on the Kerameikos road with relief panels (procedural shapes plus decals) and inscriptions in Greek letters.
- **Houses:** whitewashed mudbrick on stone foundations, timber beams, flat or tiled roofs, courtyards.
- **Props:** amphorae, kraters, oil lamps, strigils and oil flasks, wax tablets and styluses, papyrus scrolls in cubbies, wooden benches, braziers, an armillary sphere for Eudoxus.

### Characters
- Clothing: chiton (tunic), himation (wrapped cloak, draped over one shoulder), sandals; travelers in a petasos hat and chlamys cloak. Athletes train nude in reality; for the game, use loincloths or keep athletes at a respectful distance and cut away.
- Face and hair: beards for adult men (short trimmed for Plato's generation's fashion, philosophers often fuller); Aristotle young, beardless, and later noted for dressing smartly (rings, short hair). Diogenes ragged with his staff and lamp.
- The player: customizable at the start (name, appearance, home city among Athens, Thebes, Syracuse, Miletus), shaping some dialogue.
- Animation set: idle, walk, run, sit on bench, sit on ground, gesture while debating, write on tablet, draw in dirt with stick, wrestle (simplified), throw discus, carry torch, swim, climb.

### Lighting and atmosphere
- Golden hour is the hero shot: long warm light through the plane canopy with god rays, dust motes and pollen particles.
- Altar flame and brazier particles with flickering point lights at night; fireflies in summer nights in the garden.
- Water: stylized shader with flow direction in the channels, foam at small weirs, reflections of the canopy.

---

## 5. Core gameplay loop

Explore → listen and talk → solve → train → earn → unlock new places, people and ideas.

### The four disciplines (progression)
1. **Logos** (reasoning and dialectic): unlocks new dialogue options and the ability to challenge NPCs.
2. **Mathēsis** (mathematics and astronomy): unlocks geometry puzzles and star-reading tools.
3. **Gymnastikē** (the body): stamina, sprint, climbing, swimming, athletic event performance.
4. **Mousikē** (music, poetry, memory): unlocks the Muses' quests, lyre minigame, memory-palace mechanic for recalling clues.

XP comes from quests, puzzles, debates and training. Each discipline has a small skill tree with 6–8 nodes that change how you play, not just stats.

### Rewards and collectibles
- **Scrolls:** 30+ collectible texts (short paraphrases written for the game, not long copyrighted translations) that unlock codex entries.
- **The twelve Moriai:** each gives a myth, law or historical fragment, and finding all twelve unlocks a hidden olive-grove ritual at dawn.
- **Herms:** each discovered herm becomes a fast-travel point plus a lore card on the god or sage carved on it.
- **Cosmetics:** himation colors and patterns, sandals, a stylus, a lyre, earned from quests and athletics.
- **Reputation:** with Plato, Aristotle, Speusippus, Eudoxus and others. Unlocks personal side quests and alters endings.
- **Ideas journal:** concepts you've understood (Forms, the Cave, the Divided Line, the four causes, etc.). New dialogue options require having understood certain ideas.

---

## 6. Puzzles and mechanics (designed, not decorative)

Every puzzle must teach the real idea it represents. Explain the solution in the codex afterwards.

1. **The slave boy's square (Meno):** in the dirt, with a stick, double the area of a square. Wrong first instinct (double the side) is visibly wrong; the solution is the square on the diagonal. Interactive line drawing on a grid.
2. **The Platonic solids (Timaeus):** assemble the five regular solids from triangles, squares and pentagons at the Mouseion; each is linked to an element (fire, earth, air, water, the cosmos). Then prove there can only be five by trying to build a sixth and failing.
3. **The Delian problem:** the plague oracle that asked Athenians to double the altar of Apollo. Discover why doubling each edge gives eight times the volume. Optional: a mechanical approximation puzzle with sliding rulers.
4. **Eudoxus' spheres:** at night on Colonus, align nested rotating spheres on an armillary device to reproduce a planet's looping (retrograde) path against the stars.
5. **Cimon's waterworks:** open and close sluices and redirect terracotta pipes so water reaches the dry plane trees, the fig orchard and the palaestra baths, without flooding the reading spot. A flow puzzle using the real channel network.
6. **The Allegory of the Cave:** a dreamlike interlude level. You start chained, seeing shadows; find the fire, the objects casting them, climb out, eyes adjusting (bloom and exposure as a mechanic), see the sun. Free yourself, then decide whether to go back down to free the others.
7. **The Divided Line:** a sorting puzzle placing objects, images, mathematical objects and Forms on the four segments.
8. **Socratic debate system:** dialogues as duels of argument. You make claims, NPCs press with questions; you win by exposing contradictions in their definitions (what is courage, justice, beauty) while not contradicting yourself. Tracks a "consistency" meter. Used for main quests and side quests (e.g., debating Diogenes in the grove, a sophist visiting from the city).
9. **Memory palace (Mousikē):** memorize a speech by placing its parts at locations in the garden, then walk the route to recall it.
10. **Mapping the grove:** a surveying task with a gnomon and measuring rope to compute heights of trees from their shadows (similar triangles).

### Athletics (gymnasium)
- Footrace on the dromos, timed.
- Wrestling (pale): simple, readable stance-and-timing system, no gore. Win by three falls.
- Discus and javelin: aim, power and release timing with wind.
- **The torch race (Promethia):** relay from the altar of Prometheus to the city gate at dusk, keeping the flame alive; route through the grove and down the Kerameikos road.

---

## 7. Story structure (5 acts plus prologue)

### Prologue: The road to the Academy (367 BC, spring)
Arrive at the Dipylon Gate. Meet Aristotle, also new, sharp and a little arrogant. Walk the Kerameikos road together (tutorial: movement, talking, reading stelai). Enter the grove. First glimpse of Plato in the teaching circle.

### Act 1: The outsider
Plato is leaving for Syracuse. Eudoxus runs the school. To be accepted into the inner circle you must prove yourself: the slave boy's square, finding the Moriai, helping Speusippus with a task, training in the palaestra. Ends with your first lesson in the teaching circle.

### Act 2: The life of the school
Seasons pass. Plato returns. Platonic solids, Eudoxus' astronomy, the waterworks, the torch race festival, rivalries and friendships with fellow students (including Axiothea, in secret). Diogenes keeps showing up to mock everyone. Ends with the Allegory of the Cave interlude.

### Act 3: The student who disagrees
Years pass (time-skip; Aristotle becomes the brightest mind of the school and earns the nickname "the reader"). He starts questioning the Forms; the Third Man argument; tension with Plato and Speusippus. The player is pulled between them, and choices affect reputation and the ending. Aristotle begins collecting and classifying plants and animals in the grove: optional biology side quests (catalogue species around the river).

### Act 4: The death of Plato (347 BC)
Plato dies; a funeral scene in the garden. Speusippus inherits the school. Aristotle leaves Athens. Player chooses: stay at the Academy, or go with Aristotle (a short Lesbos coastal interlude studying marine life in the lagoon, or skip). This sets which epilogue variant you get.

### Act 5: The Lyceum (335 BC)
Aristotle returns from Macedon and asks you to help him start his own school at the Lyceum gymnasium. Base-building and management layer:
- Clear and restore the run-down gymnasium and its covered walk.
- Build the library: acquire scrolls through quests.
- Build the collections: specimens of plants and animals from across the map, plus tools for observation.
- Recruit students and teachers (Theophrastus first).
- Set the curriculum (logic, ethics, politics, biology, poetics).
- Hold the first peripatetic lecture walking under the trees.
The Lyceum grows visibly as you progress. Final scene: walking the peripatos with Aristotle at golden hour, with the Academy still in the distance across the city.

### Endings
3–4 epilogue variants based on reputation and choices (stayed loyal to the Academy, joined the Lyceum, reconciled the two, or left philosophy for the city's politics).

---

## 8. UI, feel and accessibility

- Minimal HUD: compass with points of interest, contextual interaction prompt, a small discipline XP toast. Hide all HUD in a photo mode.
- Menus styled like papyrus and red-figure pottery; Greek-inspired display font plus a highly readable body font.
- Controls: keyboard and mouse plus gamepad. Remappable. Third-person camera with collision handling and a dialogue camera that frames speakers with shallow depth of field.
- Accessibility: subtitles with speaker names, text size, colorblind-safe puzzle colors, hold-vs-toggle options, reduced motion option, puzzle hint system with three levels.
- Language: English first; structure all strings for localization (Danish second).
- Settings: graphics quality presets, render scale, shadows, vegetation density, post-processing toggles.

---

## 9. Milestones (build strictly in this order)

Each milestone must be runnable (`npm run dev`), playable for what it covers, tested, screenshotted and committed.

1. **M0 — Foundation:** repo, Vite + TS + Three.js + Rapier, `CLAUDE.md`, lint and tests, a debug overlay (fps, draw calls, triangle count), a free-fly debug camera.
2. **M1 — Walking in the grove:** terrain with heightmap and splat textures, sky and day/night, one procedural olive and one plane tree with wind, third-person character controller with camera. Graybox paths.
3. **M2 — The Academy, graybox to first art pass:** all Academy zones blocked out at final scale (Kerameikos road, Moriai grove, plane walks with channels, gymnasium, Mouseion, Kepidion with teaching circle, river), then the procedural architecture and vegetation set dressing. Performance pass with instancing and LOD.
4. **M3 — Life:** NPC system with schedules, basic animations, ink dialogue system and UI, the prologue playable end to end.
5. **M4 — Systems:** quests, journal, map with fog of war, inventory and collectibles, disciplines and XP, save/load.
6. **M5 — Puzzles batch 1:** the slave boy's square, finding the Moriai, the waterworks, the debate system with one full debate. Act 1 playable start to finish.
7. **M6 — Athletics:** footrace, wrestling, discus, torch race.
8. **M7 — Act 2 and the Cave interlude.**
9. **M8 — Acts 3 and 4.**
10. **M9 — The Lyceum and Act 5:** the building and management layer.
11. **M10 — Polish:** audio pass, lighting pass, VFX, UI polish, accessibility, performance and loading times, endings.

The **vertical slice** is M0 to M5: the Academy fully explorable with the prologue and Act 1. Treat that as the first real goal and make it feel finished before moving on.

---

## 10. Quality bar

- The first time the player walks from the Kerameikos road into the grove at golden hour, with olives shimmering silver in the wind and the plane-tree ceiling closing overhead, should make them stop and look. Prioritize that moment.
- Every place should tell you what it's for without UI: the sand of the palaestra, the worn ring of benches, the wax tablets on the bench, the scroll cubbies.
- NPCs should feel like people with routines and opinions, not quest dispensers.
- Puzzles must be solvable by thinking, never by trial-and-error spam.
- Historical honesty: when the game invents, `HISTORY_NOTES.md` says so.

---

## Kickoff message (paste this into Claude Code)

```
Read GAME_DESIGN.md fully. It's the master design for a 3D game called Akademeia.

Before writing code:
1. Summarize your understanding in 10 bullet points.
2. List any technical risks you see in the stack and how you'd handle them.
3. Propose the folder structure and the CLAUDE.md you'll create.
4. List the questions you genuinely need me to answer (max 5).

Then wait for my go-ahead and start with milestone M0.
```
