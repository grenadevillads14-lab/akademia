import * as THREE from 'three';
import { z } from 'zod';
import { Animator } from '../characters/animator';
import { parseAppearance } from '../characters/appearance';
import { buildHumanoid } from '../characters/build';
import type { Humanoid } from '../characters/humanoid';

/**
 * Statues of the precinct (content/world/<id>.life.json → statues): figures cast from the same MakeHuman
 * bodies, frozen in a pose and turned to stone or bronze. Greek marble was painted: skin left in the warm
 * polished stone (with a wax ganosis), drapery in pale tones with coloured borders, so the garment colours
 * of the appearance come through on the clothes. Bronze was golden-brown and shining when new.
 */
export const StatueSchema = z.object({
  id: z.string(),
  x: z.number(),
  z: z.number(),
  heading: z.number().default(0),
  material: z.enum(['marble', 'bronze']),
  /** Pedestal height (m). */
  base: z.number().default(1.1),
  /** Scale relative to life size (cult images were larger). */
  scale: z.number().default(1.08),
  pose: z.enum(['idle', 'gesture', 'pray', 'read']).default('idle'),
  /** Seconds into the pose's cycle at which it is frozen. */
  at: z.number().default(1.3),
  appearance: z.record(z.string(), z.unknown()),
});
export type StatueData = z.infer<typeof StatueSchema>;

const MARBLE = new THREE.Color('#efe7da');
const BRONZE = new THREE.Color('#b27c48');

function stoneMaterial(orig: THREE.Material, kind: 'marble' | 'bronze'): THREE.Material {
  const o = orig as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial();
  // Keep the masks (garment cut-outs) and alpha cards (hair, lashes) of the original shader.
  m.onBeforeCompile = (sh, r) => {
    o.onBeforeCompile(sh, r);
    // Painted marble: the garment colour survives as a pale wash over the stone (the borders, mixed in
    // afterwards by the cloth shader, stay strong).
    if (kind === 'marble' && o.vertexColors)
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n  diffuseColor.rgb = mix(vec3(${MARBLE.r.toFixed(3)}, ${MARBLE.g.toFixed(3)}, ${MARBLE.b.toFixed(3)}), diffuseColor.rgb, 0.3);`);
  };
  m.customProgramCacheKey = () => `${o.customProgramCacheKey?.() ?? ''}-statue-${kind}`;
  m.side = o.side;
  m.alphaTest = o.alphaTest;
  m.transparent = false;
  // Hair, brows and lashes are alpha cards: keep their (grey) texture for the cut-out and the carved strands.
  if (o.alphaTest > 0) m.map = o.map;
  if (kind === 'bronze') {
    m.color.copy(BRONZE);
    m.metalness = 0.85;
    m.roughness = 0.38;
    m.vertexColors = false;
  } else {
    // Painted drapery keeps its colours (lightened toward the stone); flesh is polished stone.
    m.vertexColors = o.vertexColors;
    m.color.copy(o.vertexColors ? new THREE.Color(1, 1, 1) : MARBLE);
    m.roughness = o.vertexColors ? 0.6 : 0.42;
    m.metalness = 0;
    // A breath of light scattered inside the stone.
    m.emissive.setRGB(0.035, 0.03, 0.024);
  }
  return m;
}

export interface Statues {
  readonly group: THREE.Group;
  /** Collision footprints (world): x, z, half-size. */
  readonly footprints: { x: number; z: number; r: number }[];
  dispose(): void;
}

export function buildStatues(list: StatueData[], ground: (x: number, z: number) => number): Statues {
  const group = new THREE.Group();
  group.name = 'statues';
  const humans: Humanoid[] = [];
  const mats: THREE.Material[] = [];
  const footprints: Statues['footprints'] = [];
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xd9cfbf, roughness: 0.7 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xc9bca6, roughness: 0.75 });
  const baseGeo = new THREE.BoxGeometry(1, 1, 1);
  baseGeo.translate(0, 0.5, 0);
  for (const s of list) {
    const a = parseAppearance(s.appearance);
    const y = ground(s.x, s.z);
    // Pedestal: a stepped plinth, a die and a moulded cap.
    const w = s.id.includes('graces') ? 2.6 : 0.95;
    const root = new THREE.Group();
    root.position.set(s.x, y, s.z);
    root.rotation.y = s.heading;
    const plinth = new THREE.Mesh(baseGeo, baseMat);
    plinth.scale.set(w + 0.35, 0.22, 1.25);
    const die = new THREE.Mesh(baseGeo, baseMat);
    die.position.y = 0.22;
    die.scale.set(w, s.base - 0.36, 0.9);
    const cap = new THREE.Mesh(baseGeo, capMat);
    cap.position.y = s.base - 0.14;
    cap.scale.set(w + 0.18, 0.14, 1.08);
    for (const m of [plinth, die, cap]) {
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
    footprints.push({ x: s.x, z: s.z, r: Math.max(w, 1.25) / 2 + 0.1 });
    // The figure(s): the Graces stand three abreast.
    const offsets = s.id.includes('graces') ? [-0.75, 0, 0.75] : [0];
    offsets.forEach((ox, i) => {
      const h = buildHumanoid(a);
      humans.push(h);
      const anim = new Animator(h, 3.1 + i * 1.7);
      anim.play(s.pose);
      // Settle into the pose, then freeze it.
      for (let k = 0; k < 40; k++) anim.update(s.at / 40 + (k === 0 ? 1 : 0), 0);
      h.object.position.set(ox, s.base, 0);
      h.object.rotation.y = i === 1 ? Math.PI : (i - 1) * 0.35;
      h.object.scale.setScalar(s.scale);
      h.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const m = stoneMaterial(mesh.material as THREE.Material, s.material);
        mats.push(m);
        mesh.material = m;
        mesh.castShadow = true;
      });
      root.add(h.object);
    });
    root.updateMatrixWorld(true);
    group.add(root);
  }
  return {
    group,
    footprints,
    dispose() {
      for (const h of humans) h.dispose();
      for (const m of mats) m.dispose();
      baseMat.dispose();
      capMat.dispose();
      baseGeo.dispose();
    },
  };
}
