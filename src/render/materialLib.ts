import * as THREE from 'three';

/**
 * Library of PBR materials built from the Poly Haven (CC0) texture sets in public/assets/ph/textures.
 * Every set has diff (sRGB albedo), nor (OpenGL normal) and arm (R = AO, G = roughness, B = metalness).
 *
 * Geometry built by the architecture kit carries UVs in metres, so `metres` is the real-world size
 * one texture tile should cover. That keeps texel density consistent across all buildings.
 */
export type TexId =
  | 'white_sandstone_blocks_02'
  | 'large_sandstone_blocks'
  | 'stacked_stone_wall'
  | 'clay_plaster'
  | 'white_plaster_rough_01'
  | 'clay_roof_tiles'
  | 'marble_01'
  | 'gravel_road'
  | 'stony_dirt_path'
  | 'sparse_grass'
  | 'dry_ground_01'
  | 'rock_face'
  | 'brown_mud'
  | 'sand_01'
  | 'rock_tile_floor'
  | 'bark_platanus'
  | 'bark_brown_02'
  | 'wood_plank_wall';

export interface TextureSet {
  diff: THREE.Texture;
  nor: THREE.Texture;
  arm: THREE.Texture;
}

const BASE = `${import.meta.env.BASE_URL}assets/ph/textures/`;

export class MaterialLib {
  private readonly loader = new THREE.TextureLoader();
  private readonly sets = new Map<TexId, Promise<TextureSet>>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly anisotropy: number;

  constructor(renderer: THREE.WebGLRenderer) {
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  private loadTex(url: string, srgb: boolean): Promise<THREE.Texture> {
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (t) => {
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = this.anisotropy;
          t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          resolve(t);
        },
        undefined,
        () => reject(new Error(`Could not load texture ${url}`)),
      );
    });
  }

  set(id: TexId): Promise<TextureSet> {
    let p = this.sets.get(id);
    if (!p) {
      p = Promise.all([this.loadTex(`${BASE}${id}/diff.webp`, true), this.loadTex(`${BASE}${id}/nor.webp`, false), this.loadTex(`${BASE}${id}/arm.webp`, false)]).then(
        ([diff, nor, arm]) => ({ diff, nor, arm }),
      );
      this.sets.set(id, p);
    }
    return p;
  }

  /** Preload many sets in parallel (call during the loading screen). */
  async preload(ids: TexId[]): Promise<void> {
    await Promise.all(ids.map((id) => this.set(id)));
  }

  /**
   * A material for a texture set at a given tile size. Same arguments return the same material,
   * so buildings share materials and batch well.
   */
  async material(id: TexId, opts: { metres: number; tint?: number; normalScale?: number; roughness?: number; side?: THREE.Side } = { metres: 2 }): Promise<THREE.MeshStandardMaterial> {
    const key = `${id}|${opts.metres}|${opts.tint ?? 0xffffff}|${opts.normalScale ?? 1}|${opts.roughness ?? 1}|${opts.side ?? THREE.FrontSide}`;
    const cached = this.materials.get(key);
    if (cached) return cached;
    const s = await this.set(id);
    const rep = 1 / opts.metres;
    const clone = (t: THREE.Texture) => {
      const c = t.clone();
      c.repeat.set(rep, rep);
      c.needsUpdate = true;
      return c;
    };
    const m = new THREE.MeshStandardMaterial({
      map: clone(s.diff),
      normalMap: clone(s.nor),
      normalScale: new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1),
      aoMap: clone(s.arm),
      aoMapIntensity: 1,
      roughnessMap: clone(s.arm),
      roughness: opts.roughness ?? 1,
      metalness: 0,
      color: new THREE.Color(opts.tint ?? 0xffffff),
      side: opts.side ?? THREE.FrontSide,
    });
    m.name = key;
    this.materials.set(key, m);
    return m;
  }

  dispose(): void {
    for (const m of this.materials.values()) {
      m.map?.dispose();
      m.normalMap?.dispose();
      m.aoMap?.dispose();
      m.roughnessMap?.dispose();
      m.dispose();
    }
    void Promise.all(this.sets.values()).then((sets) => sets.forEach((s) => [s.diff, s.nor, s.arm].forEach((t) => t.dispose())));
  }
}

/** Load images into a texture array (for terrain layers and bark), resized to `size`. */
export async function loadTextureArray(urls: string[], size: number, srgb: boolean): Promise<THREE.DataArrayTexture> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = new Uint8Array(size * size * 4 * urls.length);
  const images = await Promise.all(
    urls.map(
      (u) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error(`Could not load ${u}`));
          img.src = u;
        }),
    ),
  );
  images.forEach((img, i) => {
    g.clearRect(0, 0, size, size);
    g.drawImage(img, 0, 0, size, size);
    data.set(g.getImageData(0, 0, size, size).data, i * size * size * 4);
  });
  const tex = new THREE.DataArrayTexture(data, size, size, urls.length);
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // Canvas rows are top-down; flip so v=0 is the bottom, matching normal textures.
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

export const phTextureUrl = (id: TexId, map: 'diff' | 'nor' | 'arm') => `${BASE}${id}/${map}.webp`;
