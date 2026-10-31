/**
 * Cimon's waterworks (design §6.5) as pure logic: a small network of channels from the Cephissus intake.
 * Sluices open or close channels; a terracotta pipe at a junction can be turned to one of two outlets.
 * Water splits equally among the open ways out of each junction. Targets need enough water, but each
 * has a capacity (too much floods it), and the reading spot under the planes must stay dry.
 * A closed dead end backs water up and floods its junction: you cannot just shut everything.
 */
export interface WaterNode {
  id: string;
  kind: 'source' | 'junction' | 'sink';
  /** Sinks: minimum and maximum share of the intake (0..1). max 0 = must stay dry. */
  need?: number;
  max?: number;
  /** World channel ids lit when water passes (for the 3D world). */
  label: string;
}

export interface WaterEdge {
  id: string;
  from: string;
  to: string;
  /** Sluice that can close this edge (absent = always open). */
  sluice?: string;
  /** Pipe choice that enables this edge: [pipeId, option]. */
  pipe?: [string, string];
  channel?: string;
}

export interface WaterNetwork {
  nodes: WaterNode[];
  edges: WaterEdge[];
  pipes: Record<string, string[]>;
}

export interface WaterSetting {
  sluices: Record<string, boolean>; // true = open
  pipes: Record<string, string>;
}

export interface FlowResult {
  arrive: Record<string, number>;
  edgeFlow: Record<string, number>;
  flooded: string[];
  ok: boolean;
  problems: { node: string; issue: 'dry' | 'short' | 'flood' | 'backup' }[];
}

function edgeOpen(e: WaterEdge, s: WaterSetting): boolean {
  if (e.sluice && !s.sluices[e.sluice]) return false;
  if (e.pipe && s.pipes[e.pipe[0]] !== e.pipe[1]) return false;
  return true;
}

export function simulate(net: WaterNetwork, s: WaterSetting): FlowResult {
  const arrive: Record<string, number> = {};
  const edgeFlow: Record<string, number> = {};
  const flooded: string[] = [];
  const problems: FlowResult['problems'] = [];
  for (const n of net.nodes) arrive[n.id] = 0;
  const source = net.nodes.find((n) => n.kind === 'source')!;
  arrive[source.id] = 1;
  // The network is a tree flowing downstream; process in topological order.
  const order: string[] = [];
  const visit = (id: string, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    for (const e of net.edges.filter((x) => x.from === id)) visit(e.to, seen);
  };
  visit(source.id, new Set());
  for (const id of order) {
    const node = net.nodes.find((n) => n.id === id)!;
    if (node.kind === 'sink') continue;
    const outs = net.edges.filter((e) => e.from === id && edgeOpen(e, s));
    const amount = arrive[id]!;
    if (amount <= 1e-9) continue;
    if (outs.length === 0) {
      flooded.push(id);
      problems.push({ node: id, issue: 'backup' });
      continue;
    }
    for (const e of outs) {
      const share = amount / outs.length;
      edgeFlow[e.id] = share;
      arrive[e.to] = (arrive[e.to] ?? 0) + share;
    }
  }
  for (const n of net.nodes) {
    if (n.kind !== 'sink') continue;
    const a = arrive[n.id] ?? 0;
    if (n.max !== undefined && a > n.max + 1e-9) {
      flooded.push(n.id);
      problems.push({ node: n.id, issue: n.max === 0 ? 'flood' : 'flood' });
    } else if (n.need !== undefined && a < n.need - 1e-9) {
      problems.push({ node: n.id, issue: a <= 1e-9 ? 'dry' : 'short' });
    }
  }
  return { arrive, edgeFlow, flooded, ok: problems.length === 0, problems };
}

/** Enumerate every setting (the network is small) — used by tests to prove the puzzle is solvable. */
export function solutions(net: WaterNetwork): WaterSetting[] {
  const sluices = [...new Set(net.edges.map((e) => e.sluice).filter((x): x is string => !!x))];
  const pipeIds = Object.keys(net.pipes);
  const out: WaterSetting[] = [];
  const total = 1 << sluices.length;
  const pipeCombos: Record<string, string>[] = [{}];
  for (const p of pipeIds) {
    const next: Record<string, string>[] = [];
    for (const c of pipeCombos) for (const opt of net.pipes[p]!) next.push({ ...c, [p]: opt });
    pipeCombos.splice(0, pipeCombos.length, ...next);
  }
  for (let m = 0; m < total; m++) {
    const sl: Record<string, boolean> = {};
    sluices.forEach((sid, i) => (sl[sid] = !!(m & (1 << i))));
    for (const pc of pipeCombos) {
      const setting = { sluices: sl, pipes: pc };
      if (simulate(net, setting).ok) out.push({ sluices: { ...sl }, pipes: { ...pc } });
    }
  }
  return out;
}
