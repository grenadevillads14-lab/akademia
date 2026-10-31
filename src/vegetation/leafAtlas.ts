import * as THREE from 'three';
import { fbmTile } from '../procgen/noise';
import { mulberry32, type Rng } from '../procgen/rng';

/**
 * Painted leaf-spray atlas (2048²): each cell holds a twig with several leaves, drawn with canvas paths.
 * Leaf cards in the trees sample one cell each. Cells are [u0, v0, u1, v1] in UV space (v up).
 */
export const ATLAS_SIZE = 2048;
const CELL = 512;

export type LeafCell = 'olive' | 'plane' | 'fig' | 'pomegranate' | 'cypress' | 'myrtle' | 'laurel' | 'reed';
const ORDER: LeafCell[] = ['olive', 'plane', 'fig', 'pomegranate', 'cypress', 'myrtle', 'laurel', 'reed'];

export function atlasRect(cell: LeafCell): [number, number, number, number] {
  const i = ORDER.indexOf(cell);
  const cx = i % 4;
  const cy = Math.floor(i / 4);
  // Canvas y grows downward; flipY=true on upload makes canvas top = v 1.
  const u0 = (cx * CELL) / ATLAS_SIZE;
  const v1 = 1 - (cy * CELL) / ATLAS_SIZE;
  return [u0 + 0.002, v1 - CELL / ATLAS_SIZE + 0.002, u0 + CELL / ATLAS_SIZE - 0.002, v1 - 0.002];
}

type Ctx = CanvasRenderingContext2D;

function leafPath(g: Ctx, len: number, width: number, lobes: number, lobeDepth: number): void {
  // A leaf pointing along +x from the origin.
  g.beginPath();
  if (lobes <= 1) {
    g.moveTo(0, 0);
    g.bezierCurveTo(len * 0.3, -width, len * 0.75, -width * 0.7, len, 0);
    g.bezierCurveTo(len * 0.75, width * 0.7, len * 0.3, width, 0, 0);
  } else {
    // Palmate: lobes radiating from the base.
    const spread = Math.PI * 0.85;
    g.moveTo(0, 0);
    for (let i = 0; i < lobes; i++) {
      const a = -spread / 2 + (spread * i) / (lobes - 1);
      const l = len * (1 - Math.abs(a) * 0.35);
      const tipX = Math.cos(a) * l;
      const tipY = Math.sin(a) * l;
      const sideA = a - spread / (lobes - 1) / 2;
      const inner = len * (1 - lobeDepth);
      g.lineTo(Math.cos(sideA) * inner, Math.sin(sideA) * inner);
      g.quadraticCurveTo(Math.cos(a - 0.12) * l * 0.95, Math.sin(a - 0.12) * l * 0.95, tipX, tipY);
      g.quadraticCurveTo(Math.cos(a + 0.12) * l * 0.95, Math.sin(a + 0.12) * l * 0.95, Math.cos(a + spread / (lobes - 1) / 2) * inner, Math.sin(a + spread / (lobes - 1) / 2) * inner);
    }
    g.closePath();
  }
}

function drawLeaf(g: Ctx, x: number, y: number, angle: number, len: number, width: number, fill: string, vein: string, lobes = 1, lobeDepth = 0.4): void {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  leafPath(g, len, width, lobes, lobeDepth);
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = vein;
  g.lineWidth = Math.max(1, len * 0.012);
  g.beginPath();
  if (lobes <= 1) {
    g.moveTo(len * 0.02, 0);
    g.lineTo(len * 0.95, 0);
  } else {
    const spread = Math.PI * 0.85;
    for (let i = 0; i < lobes; i++) {
      const a = -spread / 2 + (spread * i) / (lobes - 1);
      g.moveTo(0, 0);
      g.lineTo(Math.cos(a) * len * 0.8, Math.sin(a) * len * 0.8);
    }
  }
  g.stroke();
  g.restore();
}

function twig(g: Ctx, rng: Rng, color: string, width: number): { x: number; y: number; a: number }[] {
  // A curving twig across the cell from bottom-centre; returns attachment points.
  const pts: { x: number; y: number; a: number }[] = [];
  let x = CELL * 0.5;
  let y = CELL * 0.97;
  let a = -Math.PI / 2 + (rng() - 0.5) * 0.3;
  g.strokeStyle = color;
  g.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const nx = x + Math.cos(a) * CELL * 0.07;
    const ny = y + Math.sin(a) * CELL * 0.07;
    g.lineWidth = width * (1 - i / 14);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(nx, ny);
    g.stroke();
    x = nx;
    y = ny;
    a += (rng() - 0.5) * 0.35;
    pts.push({ x, y, a });
  }
  return pts;
}

const painters: Record<LeafCell, (g: Ctx, rng: Rng) => void> = {
  // Olive: narrow lanceolate leaves, dark grey-green. (The silver underside is done in the shader.)
  olive(g, rng) {
    for (let s = 0; s < 3; s++) {
      g.save();
      g.translate((s - 1) * 120, s === 1 ? 0 : 40);
      g.rotate((s - 1) * 0.35);
      const pts = twig(g, rng, '#5b5144', 7);
      for (const [i, p] of pts.entries()) {
        if (i < 2) continue;
        for (const side of [-1, 1]) {
          const tone = 80 + Math.floor(rng() * 30);
          drawLeaf(g, p.x, p.y, p.a + side * (0.6 + rng() * 0.4), 70 + rng() * 30, 9 + rng() * 3, `rgb(${tone - 10},${tone + 18},${tone - 22})`, 'rgba(190,200,170,0.5)');
        }
      }
      g.restore();
    }
  },
  // Oriental plane: big palmate, deeply 5-lobed leaves.
  plane(g, rng) {
    const pts = twig(g, rng, '#6d5a40', 9);
    for (const [i, p] of pts.entries()) {
      if (i % 3 !== 1) continue;
      const tone = 90 + Math.floor(rng() * 40);
      drawLeaf(g, p.x, p.y, p.a + (rng() - 0.5) * 2.2, 150 + rng() * 40, 0, `rgb(${tone - 30},${tone + 30},${tone - 50})`, 'rgba(200,220,150,0.6)', 5, 0.55);
    }
    drawLeaf(g, CELL * 0.5, CELL * 0.18, -Math.PI / 2, 170, 0, 'rgb(84,140,58)', 'rgba(200,220,150,0.6)', 5, 0.55);
  },
  // Fig: large rough 3–5-lobed leaves and a few dark purple figs.
  fig(g, rng) {
    const pts = twig(g, rng, '#7d7466', 10);
    for (const [i, p] of pts.entries()) {
      if (i % 3 !== 2) continue;
      const tone = 80 + Math.floor(rng() * 30);
      drawLeaf(g, p.x, p.y, p.a + (rng() - 0.5) * 2.4, 170 + rng() * 30, 0, `rgb(${tone - 25},${tone + 25},${tone - 40})`, 'rgba(210,220,160,0.55)', 3 + Math.round(rng() * 2) * 1, 0.45);
    }
    for (let k = 0; k < 4; k++) {
      const p = pts[3 + k * 2]!;
      g.fillStyle = '#4a2440';
      g.beginPath();
      g.ellipse(p.x + 14, p.y + 10, 14, 17, 0.3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(160,110,150,0.6)';
      g.beginPath();
      g.ellipse(p.x + 9, p.y + 5, 4, 6, 0.3, 0, Math.PI * 2);
      g.fill();
    }
  },
  // Pomegranate: small glossy oblong leaves and red-orange trumpet flowers.
  pomegranate(g, rng) {
    for (let s = 0; s < 3; s++) {
      g.save();
      g.translate((s - 1) * 110, 20);
      g.rotate((s - 1) * 0.4);
      const pts = twig(g, rng, '#6a4a3a', 5);
      for (const [i, p] of pts.entries()) {
        for (const side of [-1, 1]) {
          drawLeaf(g, p.x, p.y, p.a + side * (0.7 + rng() * 0.5), 42 + rng() * 14, 9, `rgb(${50 + rng() * 20},${110 + rng() * 30},${40})`, 'rgba(220,240,180,0.6)');
        }
        if (i % 4 === 3) {
          g.fillStyle = '#e0401c';
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - 12, p.y - 26);
          g.lineTo(p.x + 12, p.y - 26);
          g.closePath();
          g.fill();
          g.fillStyle = '#ff7a2e';
          g.beginPath();
          g.arc(p.x, p.y - 26, 10, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }
  },
  // Cypress: dense opaque scale foliage (used on the solid crown mesh, not cards).
  cypress(g) {
    // putImageData ignores the canvas transform, so paint into a scratch canvas and draw that.
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = CELL;
    const sg = scratch.getContext('2d')!;
    const img = sg.createImageData(CELL, CELL);
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const n = fbmTile(x / CELL, y / CELL, 16, 4, 91) * 0.5 + 0.5;
        const sprig = fbmTile(x / CELL, (y / CELL) * 0.5, 40, 2, 92) * 0.5 + 0.5;
        const i = (y * CELL + x) * 4;
        const v = 0.55 + 0.6 * n * (0.6 + 0.4 * sprig);
        img.data[i] = 34 * v;
        img.data[i + 1] = 62 * v;
        img.data[i + 2] = 36 * v;
        img.data[i + 3] = 255;
      }
    }
    sg.putImageData(img, 0, 0);
    g.drawImage(scratch, 0, 0);
  },
  // Myrtle: tiny dense ovate leaves and white starry flowers.
  myrtle(g, rng) {
    for (let s = 0; s < 4; s++) {
      g.save();
      g.translate((s - 1.5) * 90, 10);
      g.rotate((s - 1.5) * 0.3);
      const pts = twig(g, rng, '#5a4a38', 4);
      for (const [i, p] of pts.entries()) {
        for (const side of [-1, 1]) drawLeaf(g, p.x, p.y, p.a + side * 0.9, 30 + rng() * 8, 9, `rgb(46,${90 + rng() * 25},44)`, 'rgba(200,230,170,0.4)');
        if (i % 5 === 4) {
          g.fillStyle = '#f6f2e6';
          g.beginPath();
          g.arc(p.x + 8, p.y, 7, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.restore();
    }
  },
  // Laurel (bay): leathery elliptic leaves.
  laurel(g, rng) {
    for (let s = 0; s < 2; s++) {
      g.save();
      g.translate((s - 0.5) * 150, 0);
      const pts = twig(g, rng, '#5d5040', 6);
      for (const p of pts) {
        for (const side of [-1, 1]) drawLeaf(g, p.x, p.y, p.a + side * (0.55 + rng() * 0.3), 80 + rng() * 20, 18, `rgb(${50 + rng() * 15},${92 + rng() * 20},${44})`, 'rgba(210,230,170,0.5)');
      }
      g.restore();
    }
  },
  // Reeds: tall thin blades with a few plumes.
  reed(g, rng) {
    for (let k = 0; k < 22; k++) {
      const x = 30 + rng() * (CELL - 60);
      const h = CELL * (0.6 + rng() * 0.38);
      const bend = (rng() - 0.5) * 60;
      g.strokeStyle = `rgb(${110 + rng() * 40},${130 + rng() * 30},${70})`;
      g.lineWidth = 4 + rng() * 3;
      g.beginPath();
      g.moveTo(x, CELL);
      g.quadraticCurveTo(x + bend * 0.3, CELL - h * 0.5, x + bend, CELL - h);
      g.stroke();
      if (rng() > 0.6) {
        g.fillStyle = 'rgba(160,130,100,0.95)';
        g.beginPath();
        g.ellipse(x + bend, CELL - h, 7, 26, bend * 0.004, 0, Math.PI * 2);
        g.fill();
      }
    }
  },
};

export function createLeafAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  const g = canvas.getContext('2d')!;
  g.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  ORDER.forEach((cell, i) => {
    g.save();
    g.translate((i % 4) * CELL, Math.floor(i / 4) * CELL);
    g.beginPath();
    g.rect(0, 0, CELL, CELL);
    g.clip();
    painters[cell](g, mulberry32(1000 + i));
    g.restore();
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
