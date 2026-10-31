import moriai from '../../content/collectibles/moriai.json';
import specimens from '../../content/collectibles/specimens.json';
import text from '../../content/puzzles/text.json';
import waterData from '../../content/puzzles/waterworks.json';
import { t } from '../core/i18n';
import type { DebateDef } from '../puzzles/debate';
import act2 from '../../content/puzzles/act2.json';
import { openDebate, openLoreCard, openMeno, openWaterworks } from '../puzzles/ui';
import { openDelian, openDividedLine, openSolids, openSpheres } from '../puzzles/ui2';
import { simulate, type WaterNetwork, type WaterSetting } from '../puzzles/waterworks';
import type { GameState } from '../systems/state';
import type { WaterSystem } from '../world/water';

const debates = import.meta.glob('../../content/debates/*.json', { eager: true, import: 'default' }) as Record<string, DebateDef>;
const debateById = new Map(Object.values(debates).map((d) => [d.id, d]));

/**
 * Opens puzzles and lore cards one at a time when the story asks (`puzzle <id>` command, collectibles),
 * pauses the game while they are open, and applies their rewards. Also keeps Cimon's channels in the 3D
 * world in step with the waterworks setting saved in flags (`ww.<sluice>`, `ww.pipe.<id>`).
 */
export class PuzzleHost {
  private readonly queue: (() => Promise<void>)[] = [];
  open = false;

  constructor(
    private readonly state: GameState,
    private readonly water: WaterSystem,
    private readonly nameOf: (id: string) => string,
    /** True while something else (dialogue) must finish first. */
    private readonly busy: () => boolean,
  ) {
    const bus = state.bus;
    bus.on('state:puzzle', (e) => this.enqueue(() => this.run(e.id, e.arg)));
    const sets: Record<string, { items: Record<string, { title: string; certainty: string; source: string; text: string }>; complete: string[] }> = { moriai, specimens };
    bus.on('state:collect', (e) => {
      const set = sets[e.set];
      if (!set) return;
      const item = set.items[e.id];
      if (item) this.enqueue(() => openLoreCard(item.title, item.text, item.source, item.certainty, t(`certainty.${item.certainty}`)));
      if (e.count === Object.keys(set.items).length) this.enqueue(async () => this.runAll(set.complete));
    });
    this.applyWater();
  }

  /** Current waterworks setting (from flags, else the puzzle's starting state). */
  waterSetting(): WaterSetting {
    const s: WaterSetting = JSON.parse(JSON.stringify(waterData.start)) as WaterSetting;
    for (const k of Object.keys(s.sluices)) {
      const f = this.state.flag(`ww.${k}`);
      if (typeof f === 'boolean') s.sluices[k] = f;
    }
    for (const k of Object.keys(s.pipes)) {
      const f = this.state.flag(`ww.pipe.${k}`);
      if (typeof f === 'string') s.pipes[k] = f;
    }
    return s;
  }

  /** Light the world's channels that carry water in the current setting. */
  applyWater(): void {
    const net = waterData as unknown as WaterNetwork;
    const r = simulate(net, this.waterSetting());
    for (const e of net.edges) if (e.channel) this.water.setChannelFlow(e.channel, (r.edgeFlow[e.id] ?? 0) > 0);
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue.push(job);
  }

  private runAll(cmds: readonly string[]): void {
    for (const c of cmds) this.state.runCommand(c);
  }

  private async run(id: string, arg?: string): Promise<void> {
    if (id === 'meno') {
      if (await openMeno()) this.runAll(text.meno.onSolve);
    } else if (id === 'waterworks') {
      const s = await openWaterworks();
      if (s) {
        for (const [k, v] of Object.entries(s.sluices)) this.state.runCommand(`flag ww.${k} ${v}`);
        for (const [k, v] of Object.entries(s.pipes)) this.state.runCommand(`flag ww.pipe.${k} ${v}`);
        this.applyWater();
        this.runAll(waterData.onSolve);
      }
    } else if (id === 'debate') {
      const def = debateById.get(arg ?? '');
      if (!def) throw new Error(`Unknown debate "${arg}"`);
      const has = (req: { idea?: string; skill?: string }) =>
        (!req.idea || this.state.hasIdea(req.idea)) && (!req.skill || this.state.data.skills.includes(req.skill));
      const bonus = this.state.data.skills.includes('definition') ? 1 : 0;
      const outcome = await openDebate(def, this.nameOf, has, bonus);
      if (outcome === 'won') this.runAll(def.onWin);
      else if (outcome === 'lost') this.runAll(def.onLose);
      if (outcome !== 'left') this.state.runCommand(`flag debate.${def.id} ${outcome}`);
    } else if (id === 'solids') {
      if (await openSolids()) this.runAll(act2.solids.onSolve);
    } else if (id === 'spheres') {
      if (await openSpheres()) this.runAll(act2.spheres.onSolve);
    } else if (id === 'delian') {
      if (await openDelian()) this.runAll(act2.delian.onSolve);
    } else if (id === 'divided_line') {
      if (await openDividedLine()) this.runAll(act2.dividedLine.onSolve);
    } else throw new Error(`Unknown puzzle "${id}"`);
  }

  /** Call every frame: starts the next queued puzzle when nothing else is on screen. */
  update(): void {
    if (this.open || this.busy() || this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.open = true;
    void job().finally(() => {
      this.open = false;
    });
  }
}
