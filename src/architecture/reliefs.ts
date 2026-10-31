import * as THREE from 'three';
import { mulberry32 } from '../procgen/rng';

/**
 * Carved surfaces made from canvas drawings:
 *  - inscriptions: Greek capitals cut into marble (casualty lists by tribe, epitaphs)
 *  - reliefs: silhouettes drawn as a height map, blurred, then turned into a normal map, so
 *    raking golden-hour light picks out the carving (Dexileos' rider, a farewell handshake, a youth)
 * Motifs follow docs/RESEARCH.md §1 (Dexileos stele, naiskos stelai, casualty lists by tribe).
 */
export const TRIBES = ['ΕΡΕΧΘΕΙΔΟΣ', 'ΑΙΓΕΙΔΟΣ', 'ΠΑΝΔΙΟΝΙΔΟΣ', 'ΛΕΟΝΤΙΔΟΣ', 'ΑΚΑΜΑΝΤΙΔΟΣ', 'ΟΙΝΕΙΔΟΣ', 'ΚΕΚΡΟΠΙΔΟΣ', 'ΙΠΠΟΘΩΝΤΙΔΟΣ', 'ΑΙΑΝΤΙΔΟΣ', 'ΑΝΤΙΟΧΙΔΟΣ'];

const NAMES = [
  'ΚΑΛΛΙΑΣ', 'ΔΕΞΙΛΕΩΣ', 'ΝΙΚΟΣΤΡΑΤΟΣ', 'ΑΡΙΣΤΩΝ', 'ΘΡΑΣΥΛΛΟΣ', 'ΦΙΛΩΝ', 'ΔΗΜΕΑΣ', 'ΕΥΘΥΚΡΑΤΗΣ', 'ΛΥΣΙΑΣ', 'ΜΕΝΕΚΛΗΣ',
  'ΠΟΛΥΞΕΝΟΣ', 'ΚΛΕΩΝ', 'ΑΝΤΙΦΩΝ', 'ΧΑΙΡΕΑΣ', 'ΤΙΜΟΘΕΟΣ', 'ΣΩΚΡΑΤΗΣ', 'ΗΓΗΣΙΑΣ', 'ΔΙΟΔΩΡΟΣ', 'ΑΡΧΙΠΠΟΣ', 'ΕΥΚΛΕΙΔΗΣ',
  'ΘΕΟΦΙΛΟΣ', 'ΚΤΗΣΙΑΣ', 'ΜΝΗΣΙΘΕΟΣ', 'ΠΡΩΤΑΡΧΟΣ', 'ΣΤΡΑΤΟΚΛΗΣ', 'ΦΑΝΟΔΗΜΟΣ', 'ΑΓΝΩΝ', 'ΒΙΩΝ', 'ΓΛΑΥΚΩΝ', 'ΕΡΑΣΙΣ',
  'ΙΣΧΟΜΑΧΟΣ', 'ΛΑΧΗΣ', 'ΝΙΚΙΑΣ', 'ΟΝΗΤΩΡ', 'ΠΑΜΦΙΛΟΣ', 'ΤΕΛΕΣΙΑΣ', 'ΧΑΡΜΙΔΗΣ', 'ΑΜΕΙΝΙΑΣ', 'ΔΡΑΚΟΝΤΙΔΗΣ', 'ΑΥΤΟΚΛΗΣ',
];

const W = 512;

function canvas(w = W, h = W): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

/** Turn a greyscale height canvas into a tangent-space normal map. */
function heightToNormal(src: HTMLCanvasElement, strength: number): THREE.CanvasTexture {
  const w = src.width;
  const h = src.height;
  const hd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [out, g] = canvas(w, h);
  const img = g.createImageData(w, h);
  const H = (x: number, y: number) => hd[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4]! / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** A sheet of carved Greek capitals: a casualty list with a tribe heading, or an epitaph. */
export function inscription(seed: number, kind: 'list' | 'epitaph'): { normal: THREE.CanvasTexture; ao: THREE.CanvasTexture } {
  const rng = mulberry32(seed);
  const [c, g] = canvas(W, kind === 'list' ? W * 1.4 : W * 0.5);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.font = `bold ${kind === 'list' ? 30 : 40}px "Times New Roman", serif`;
  if (kind === 'list') {
    let y = 48;
    const cols = 2;
    for (let block = 0; block < 2; block++) {
      g.font = 'bold 34px "Times New Roman", serif';
      g.fillText(TRIBES[Math.floor(rng() * TRIBES.length)]!, W / 2, y);
      y += 44;
      g.font = 'bold 26px "Times New Roman", serif';
      const n = 8 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i += cols) {
        for (let k = 0; k < cols && i + k < n; k++) g.fillText(NAMES[Math.floor(rng() * NAMES.length)]!, W * (0.28 + k * 0.44), y);
        y += 32;
      }
      y += 18;
    }
  } else {
    const name = NAMES[Math.floor(rng() * NAMES.length)]!;
    g.fillText(name, W / 2, c.height * 0.45);
    g.font = 'bold 26px "Times New Roman", serif';
    g.fillText(['ΧΑΙΡΕ', 'ΧΡΗΣΤΕ ΧΑΙΡΕ', 'ΑΘΗΝΑΙΟΣ'][Math.floor(rng() * 3)]!, W / 2, c.height * 0.8);
  }
  // Invert so letters are cut *into* the stone (dark = low).
  const [hc, hg] = canvas(c.width, c.height);
  hg.filter = 'blur(1.2px)';
  hg.drawImage(c, 0, 0);
  const ao = new THREE.CanvasTexture(c);
  ao.colorSpace = THREE.NoColorSpace;
  return { normal: heightToNormal(hc, 3.5), ao };
}

type Motif = 'rider' | 'farewell' | 'youth' | 'anthemion';

/** Low relief for a stele panel: returns a normal map (and an AO-ish map darkening the background). */
export function relief(motif: Motif, seed = 1): { normal: THREE.CanvasTexture; ao: THREE.CanvasTexture } {
  const rng = mulberry32(seed);
  const [c, g] = canvas(W, W);
  g.fillStyle = '#202020'; // background plane is low
  g.fillRect(0, 0, W, W);
  g.fillStyle = '#e0e0e0';
  const body = (x: number, y: number, w: number, h: number) => {
    g.beginPath();
    g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    g.fill();
  };
  const limb = (x0: number, y0: number, x1: number, y1: number, r: number) => {
    g.lineWidth = r;
    g.lineCap = 'round';
    g.strokeStyle = '#e0e0e0';
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  const standing = (x: number, s: number, armUp = 0) => {
    body(x, 120 * s + 40, 26 * s, 30 * s); // head
    body(x, 240 * s + 40, 50 * s, 105 * s); // draped body
    g.beginPath(); // himation hem, flared
    g.moveTo(x - 55 * s, 300 * s + 40);
    g.quadraticCurveTo(x, 470 * s + 40, x + 55 * s, 300 * s + 40);
    g.fill();
    limb(x + 30 * s, 190 * s + 40, x + 80 * s, (230 - armUp) * s + 40, 22 * s);
  };
  switch (motif) {
    case 'rider': {
      // Dexileos: a horseman charging, a fallen enemy below.
      body(270, 300, 120, 55); // horse body
      limb(170, 290, 120, 200, 40); // neck
      body(110, 185, 34, 22); // head
      limb(200, 330, 150, 420, 22); // forelegs raised
      limb(220, 330, 190, 430, 20);
      limb(340, 335, 380, 450, 22); // hind legs
      limb(320, 335, 330, 455, 20);
      limb(380, 290, 440, 330, 14); // tail
      body(280, 215, 30, 55); // rider torso
      body(270, 150, 22, 25); // head
      limb(260, 200, 170, 160, 14); // spear arm
      limb(170, 160, 120, 420, 6); // spear
      body(160, 455, 90, 30); // fallen warrior
      body(90, 430, 24, 24);
      break;
    }
    case 'farewell': {
      // Seated woman clasping hands with a standing figure (dexiosis).
      g.fillRect(80, 330, 120, 18); // chair seat
      limb(90, 345, 90, 460, 10);
      limb(190, 345, 190, 460, 10);
      body(140, 160, 26, 30);
      body(140, 270, 55, 85);
      body(170, 380, 70, 30); // lap
      limb(215, 390, 215, 470, 18);
      standing(370, 0.92, 40);
      limb(180, 250, 290, 250, 18); // clasped hands
      break;
    }
    case 'youth': {
      standing(256, 1.0, 10);
      body(140, 420, 40, 40); // a dog or servant boy
      break;
    }
    case 'anthemion': {
      // Palmette crown: radiating leaves over two volutes.
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.15 + (0.7 * i) / 8);
        g.save();
        g.translate(256, 360);
        g.rotate(-a);
        g.beginPath();
        g.ellipse(120, 0, 120, 26 + rng() * 4, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      for (const sx of [-1, 1]) {
        g.lineWidth = 22;
        g.strokeStyle = '#e0e0e0';
        g.beginPath();
        g.arc(256 + sx * 90, 420, 50, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
  }
  const [hc, hg] = canvas();
  hg.filter = 'blur(6px)';
  hg.drawImage(c, 0, 0);
  hg.filter = 'none';
  const ao = new THREE.CanvasTexture(hc);
  ao.colorSpace = THREE.NoColorSpace;
  return { normal: heightToNormal(hc, 6), ao };
}
