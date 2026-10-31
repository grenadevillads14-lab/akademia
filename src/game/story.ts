import * as THREE from 'three';
import { z } from 'zod';
import { Frame } from '../architecture/kit';
import type { AnimState } from '../characters/animator';
import type { AppearanceInput } from '../characters/appearance';
import { t } from '../core/i18n';
import type { InputState } from '../core/input';
import { DialogueRunner, type DialogueLine } from '../dialogue/dialogue';
import { DialogueUI } from '../dialogue/ui';
import { Npc } from '../npc/npc';
import type { ThirdPersonCamera } from '../player/camera';
import type { Player } from '../player/player';
import type { GameState } from '../systems/state';
import { Hud, promptKey } from '../ui/hud';
import type { Poi } from '../world/structures';

/**
 * The story director: reads content/story/*.json and content/characters/characters.json, places NPCs
 * according to story state, fires dialogue from triggers (talk / interact / zone / auto), frames dialogue
 * shots with the camera, and keeps the HUD objective and toasts in sync with the game state.
 */
const Requires = z
  .object({
    questStep: z.string().optional(),
    flag: z.string().optional(),
    notFlag: z.string().optional(),
    questDone: z.string().optional(),
    questActive: z.string().optional(),
    /** Every one of these quests is done. */
    allQuestsDone: z.array(z.string()).optional(),
    /** "set:n": at least n items of a collectible set found. */
    collected: z.string().optional(),
  })
  .default({});
type Requires = z.infer<typeof Requires>;

const StorySchema = z.object({
  notes: z.string().optional(),
  /** Files merge in this order; later NPC placements win. */
  order: z.number().default(0),
  quests: z.record(z.string(), z.object({ titleKey: z.string(), steps: z.record(z.string(), z.object({ textKey: z.string(), marker: z.tuple([z.number(), z.number()]).optional() })) })).default({}),
  npcs: z
    .array(
      z.object({
        npc: z.string(),
        when: Requires,
        x: z.number().optional(),
        z: z.number().optional(),
        heading: z.number().optional(),
        anim: z.string().optional(),
        follow: z.number().optional(),
        patrol: z.array(z.tuple([z.number(), z.number()])).optional(),
        speed: z.number().optional(),
        ring: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
      }),
    )
    .default([]),
  triggers: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(['auto', 'zone', 'interact', 'talk']),
        /** Ink knot to play. Collect triggers may omit it. */
        dialogue: z.string().optional(),
        /** Interact with any POI of poiKind to add it to this collectible set (skips ones already found). */
        collect: z.string().optional(),
        requires: Requires,
        set: z.string().optional(),
        npc: z.string().optional(),
        poi: z.string().optional(),
        poiKind: z.string().optional(),
        circle: z.tuple([z.number(), z.number(), z.number()]).optional(),
        labelKey: z.string().optional(),
      }),
    )
    .default([]),
  extras: z.record(z.string(), z.object({ nameKey: z.string(), appearance: z.record(z.string(), z.unknown()) })).default({}),
});
type StoryData = z.infer<typeof StorySchema>;
type Trigger = StoryData['triggers'][number];

const storyFiles = import.meta.glob('../../content/story/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
import charactersData from '../../content/characters/characters.json';
import codexData from '../../content/codex/en.json';

const codexTitle = (kind: 'entries' | 'ideas', id: string, fallback: string): string =>
  (codexData[kind] as Record<string, { title: string } | undefined>)[id]?.title ?? t(fallback);

export function meets(state: GameState, r: Requires): boolean {
  if (r.flag && !state.flag(r.flag)) return false;
  if (r.notFlag && state.flag(r.notFlag)) return false;
  if (r.questDone && state.quest(r.questDone)?.state !== 'done') return false;
  if (r.questActive && state.quest(r.questActive)?.state !== 'active') return false;
  if (r.allQuestsDone && !r.allQuestsDone.every((q) => state.quest(q)?.state === 'done')) return false;
  if (r.collected) {
    const [set, n] = r.collected.split(':');
    if ((state.data.discovered.collectibles[set!]?.length ?? 0) < Number(n)) return false;
  }
  if (r.questStep) {
    const [q, step] = r.questStep.split(':');
    const qs = state.quest(q!);
    if (!qs || qs.state !== 'active' || qs.step !== step) return false;
  }
  return true;
}

export function loadStory(): StoryData {
  const merged: StoryData = { order: 0, quests: {}, npcs: [], triggers: [], extras: {} };
  const files = Object.values(storyFiles).map((raw) => StorySchema.parse(raw)).sort((a, b) => a.order - b.order);
  for (const d of files) {
    Object.assign(merged.quests, d.quests);
    merged.npcs.push(...d.npcs);
    merged.triggers.push(...d.triggers);
    Object.assign(merged.extras, d.extras);
  }
  return merged;
}

export class StoryDirector {
  readonly runner: DialogueRunner;
  readonly ui: DialogueUI;
  readonly hud: Hud;
  readonly npcs = new Map<string, Npc>();
  private readonly data = loadStory();
  private readonly names = new Map<string, string>();
  private readonly fired = new Set<string>();
  private placementTimer = 0;
  private activeTrigger: Trigger | null = null;
  private partner: Npc | null = null;
  private target: { kind: 'npc'; npc: Npc; trigger: Trigger } | { kind: 'poi'; poi: Poi; trigger: Trigger } | null = null;
  private lastZone: string | null = null;
  readonly group = new THREE.Group();

  constructor(
    parent: HTMLElement,
    private readonly state: GameState,
    private readonly player: Player,
    private readonly camera: ThirdPersonCamera,
    private readonly pois: Poi[],
    private readonly ground: (x: number, z: number) => number,
  ) {
    this.group.name = 'npcs';
    this.runner = new DialogueRunner(state);
    this.hud = new Hud(parent);
    this.ui = new DialogueUI(parent, this.runner, (id) => this.nameOf(id));
    const appearances = new Map<string, AppearanceInput>();
    for (const c of charactersData.characters) {
      appearances.set(c.id, c.appearance as AppearanceInput);
      this.names.set(c.id, t(c.nameKey));
    }
    for (const [id, e] of Object.entries(this.data.extras)) {
      appearances.set(id, e.appearance as AppearanceInput);
      this.names.set(id, t(e.nameKey));
    }
    // Spawn every NPC the story mentions.
    const ids = new Set(this.data.npcs.map((n) => n.npc));
    let seed = 3;
    for (const id of ids) {
      const app = appearances.get(id);
      if (!app) throw new Error(`Story places unknown character "${id}"`);
      const npc = new Npc(id, app, ground, seed++);
      this.npcs.set(id, npc);
      this.group.add(npc.object);
    }
    this.bindToasts();
    this.applyPlacements(true);
  }

  nameOf(id: string): string {
    if (id === 'player') return this.state.data.player.name;
    return this.names.get(id) ?? id;
  }

  private bindToasts(): void {
    const b = this.state.bus;
    b.on('state:xp', (e) => {
      const d = t(`discipline.${e.discipline}`);
      this.hud.toast(t('toast.xp', { amount: e.amount, discipline: d }), 'xp');
      if (e.levelUp) this.hud.toast(t('toast.levelup', { discipline: d, level: this.state.level(e.discipline) }), 'xp');
    });
    b.on('state:idea', (e) => this.hud.toast(t('toast.idea', { idea: codexTitle('ideas', e.idea, `idea.${e.idea}`) }), 'idea'));
    b.on('state:codex', (e) => this.hud.toast(t('toast.codex', { entry: codexTitle('entries', e.entry, `codex.${e.entry}`) }), 'codex'));
    b.on('state:collect', (e) => this.hud.toast(t('toast.collect', { set: t(`collect.${e.set}`), count: e.count }), 'item'));
    b.on('state:quest', (e) => {
      const q = this.data.quests[e.quest];
      if (!q) return;
      if (e.event === 'start') this.hud.toast(t('toast.quest.start', { title: t(q.titleKey) }), 'quest');
      if (e.event === 'complete') this.hud.toast(t('toast.quest.complete', { title: t(q.titleKey) }), 'quest');
    });
    b.on('state:toast', (e) => this.hud.toast(e.text));
    b.on('state:command', () => (this.placementTimer = 0));
  }

  /** Put every NPC where the latest matching placement says. */
  private applyPlacements(initial = false): void {
    const chosen = new Map<string, StoryData['npcs'][number]>();
    for (const p of this.data.npcs) if (meets(this.state, p.when)) chosen.set(p.npc, p); // later entries win
    for (const [id, npc] of this.npcs) {
      const p = chosen.get(id);
      npc.object.visible = !!p;
      if (!p) continue;
      const key = JSON.stringify(p);
      if (npc.object.userData.placement === key && !initial) continue;
      npc.object.userData.placement = key;
      const anim = (p.anim ?? 'idle') as AnimState;
      if (p.follow !== undefined) {
        npc.mode = { kind: 'follow', distance: p.follow };
      } else if (p.patrol) {
        const pts = p.patrol.map(([x, zz]) => new THREE.Vector3(x, this.ground(x, zz), zz));
        npc.place(pts[0]!.x, pts[0]!.z, 0);
        npc.mode = { kind: 'patrol', points: pts, speed: p.speed ?? 1.1, i: 1, dir: 1 };
      } else if (p.ring) {
        const [cx, cz, r, a] = p.ring;
        const f = new Frame(cx, cz, 0.6, 0);
        const [x, zz] = f.toWorld(Math.sin(a) * r, Math.cos(a) * r);
        npc.place(x, zz, Math.atan2(cx - x, cz - zz), anim);
      } else if (p.x !== undefined && p.z !== undefined) {
        // If the NPC was following, walk to the new spot instead of teleporting when close by.
        npc.place(p.x, p.z, p.heading ?? 0, anim);
      }
    }
  }

  /** True if an interaction prompt is currently being offered. */
  get hasTarget(): boolean {
    return this.target !== null;
  }

  /** Re-place NPCs and reset per-session trigger memory (after loading a save). */
  refresh(): void {
    this.fired.clear();
    for (const n of this.npcs.values()) n.object.userData.placement = undefined;
    this.applyPlacements(true);
  }

  /** Quests for the journal. */
  questList(): { id: string; title: string; step: string | null; state: string; steps: string[] }[] {
    return Object.entries(this.data.quests)
      .filter(([id]) => this.state.quest(id))
      .map(([id, q]) => {
        const st = this.state.quest(id)!;
        const step = q.steps[st.step];
        return { id, title: t(q.titleKey), step: step ? t(step.textKey) : null, state: st.state, steps: st.completed };
      });
  }

  get inDialogue(): boolean {
    return this.ui.open;
  }

  private start(trigger: Trigger, partner: Npc | null): void {
    if (!trigger.dialogue) {
      this.fired.add(trigger.id);
      if (trigger.set) this.state.runCommand(`flag ${trigger.set}`);
      return;
    }
    this.activeTrigger = trigger;
    this.partner = partner;
    this.player.controlEnabled = false;
    if (partner) {
      partner.lookTarget = this.player.position.clone().setY(this.player.position.y + 1.5);
      this.player.heading = Math.atan2(partner.position.x - this.player.position.x, partner.position.z - this.player.position.z);
    }
    this.hud.setPrompt(null);
    this.ui.begin(
      trigger.dialogue,
      (line) => this.frame(line),
      () => this.finish(),
    );
  }

  private finish(): void {
    if (this.activeTrigger?.set) this.state.runCommand(`flag ${this.activeTrigger.set}`);
    this.fired.add(this.activeTrigger?.id ?? '');
    for (const n of this.npcs.values()) n.lookTarget = null;
    this.activeTrigger = null;
    this.partner = null;
    this.player.controlEnabled = true;
    this.camera.setShot(null);
    this.placementTimer = 0;
  }

  /** Dialogue camera: over-the-shoulder on the speaker, reverse shot on the player, or a wide two-shot. */
  private frame(line: DialogueLine): void {
    const who = line.shot ?? line.speaker;
    const pHead = this.player.position.clone().setY(this.player.position.y + 1.55);
    const npc = (who && this.npcs.get(who)) || this.partner;
    if (line.speaker && this.npcs.get(line.speaker) && line.anim) this.npcs.get(line.speaker)!.animator.play(line.anim as AnimState);
    if (who === 'wide' || (!npc && who !== 'player')) {
      const mid = npc ? pHead.clone().lerp(npc.head(), 0.5) : pHead.clone();
      const fwd = new THREE.Vector3(Math.sin(this.player.heading), 0, Math.cos(this.player.heading));
      const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
      this.camera.setShot({ pos: mid.clone().addScaledVector(side, 5.5).addScaledVector(fwd, -3).add(new THREE.Vector3(0, 1.4, 0)), look: mid.clone().addScaledVector(fwd, 4), fov: 50 });
      return;
    }
    if (!npc) return;
    const nHead = npc.head();
    if (who === 'player') {
      const dir = pHead.clone().sub(nHead).setY(0).normalize();
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      this.camera.setShot({ pos: nHead.clone().addScaledVector(dir, -0.9).addScaledVector(side, 0.55).add(new THREE.Vector3(0, 0.12, 0)), look: pHead, fov: 38 });
    } else {
      const dir = nHead.clone().sub(pHead).setY(0).normalize();
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      this.camera.setShot({ pos: pHead.clone().addScaledVector(dir, -0.9).addScaledVector(side, -0.55).add(new THREE.Vector3(0, 0.12, 0)), look: nHead, fov: 38 });
    }
  }

  private triggerReady(tr: Trigger): boolean {
    if (tr.type === 'auto' || tr.type === 'zone') if (this.fired.has(tr.id) && !tr.requires.questStep) return false;
    return meets(this.state, tr.requires);
  }

  update(dt: number, input: InputState, cameraPos: THREE.Vector3, zoneName: string | null): void {
    // NPCs.
    this.placementTimer -= dt;
    if (this.placementTimer <= 0) {
      this.applyPlacements();
      this.placementTimer = 0.5;
    }
    const pv = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    for (const n of this.npcs.values()) if (n.object.visible) n.update(dt, this.player.position, pv, this.player.heading, cameraPos);

    this.ui.update(dt, input);
    this.updateObjective();
    if (zoneName && zoneName !== this.lastZone) {
      this.hud.showZone(zoneName);
      this.lastZone = zoneName;
    }
    this.hud.update(dt);
    if (this.ui.open || !this.player.controlEnabled) return;

    // Auto and zone triggers.
    const p = this.player.position;
    for (const tr of this.data.triggers) {
      if (tr.type === 'auto' && this.triggerReady(tr)) return this.start(tr, null);
      if (tr.type === 'zone' && tr.circle && Math.hypot(p.x - tr.circle[0], p.z - tr.circle[1]) < tr.circle[2] && this.triggerReady(tr)) {
        // A companion joins zone conversations.
        const companion = [...this.npcs.values()].find((n) => n.mode.kind === 'follow') ?? null;
        return this.start(tr, companion);
      }
    }

    // Interaction target: nearest talkable NPC or interactable POI in front of the player.
    this.target = null;
    let best = Infinity;
    const fwd = new THREE.Vector3(Math.sin(this.player.heading), 0, Math.cos(this.player.heading));
    const consider = (pos: THREE.Vector3, reach: number) => {
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d > reach) return -1;
      const dir = new THREE.Vector3(pos.x - p.x, 0, pos.z - p.z).normalize();
      if (d > 1.2 && dir.dot(fwd) < 0.1) return -1;
      return d - dir.dot(fwd);
    };
    for (const tr of this.data.triggers) {
      if (!meets(this.state, tr.requires)) continue;
      if (tr.type === 'talk' && tr.npc) {
        const n = this.npcs.get(tr.npc);
        if (!n || !n.object.visible) continue;
        const score = consider(n.position, 3);
        if (score >= 0 && score < best) {
          best = score;
          this.target = { kind: 'npc', npc: n, trigger: tr };
        }
      } else if (tr.type === 'interact') {
        for (const poi of this.pois) {
          if (tr.poi ? poi.id !== tr.poi : poi.kind !== tr.poiKind) continue;
          if (tr.collect && this.state.data.discovered.collectibles[tr.collect]?.includes(poi.id)) continue;
          // A trigger naming this exact POI wins over a generic one for its kind.
          const score = consider(poi.position, 3.2) - (tr.poi ? 0.05 : 0);
          if (score >= 0 && score < best) {
            best = score;
            this.target = { kind: 'poi', poi, trigger: tr };
          }
        }
      }
    }
    const key = promptKey(input.lastDevice);
    if (this.target?.kind === 'npc') this.hud.setPrompt(key, t('interact.talk', { name: this.nameOf(this.target.npc.id) }));
    else if (this.target?.kind === 'poi') this.hud.setPrompt(key, t(this.target.trigger.labelKey ?? 'interact.examine'));
    else this.hud.setPrompt(null);

    if (this.target && input.wasPressed('interact')) {
      const tg = this.target;
      if (tg.kind === 'poi' && tg.trigger.collect && !tg.trigger.dialogue) {
        this.state.runCommand(`collect ${tg.trigger.collect} ${tg.poi.id}`);
        this.target = null;
        this.hud.setPrompt(null);
        return;
      }
      this.start(tg.trigger, tg.kind === 'npc' ? tg.npc : null);
    }
  }

  private updateObjective(): void {
    for (const [id, q] of Object.entries(this.data.quests)) {
      const st = this.state.quest(id);
      if (st?.state === 'active') {
        const step = q.steps[st.step];
        this.hud.setObjective(t(q.titleKey), step ? t(step.textKey) : null);
        return;
      }
    }
    this.hud.setObjective(null, null);
  }

  /** Current objective marker (for the compass and map). */
  objectiveMarker(): [number, number] | null {
    for (const [id, q] of Object.entries(this.data.quests)) {
      const st = this.state.quest(id);
      const m = st?.state === 'active' ? q.steps[st.step]?.marker : undefined;
      if (m) return m;
    }
    return null;
  }

  dispose(): void {
    for (const n of this.npcs.values()) n.dispose();
  }
}
