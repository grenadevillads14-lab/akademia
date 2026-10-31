import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/**
 * Image-based lighting from our own procedural sky: every few seconds (or when the sun moves enough),
 * the sky is rendered into a PMREM environment map so stone, plaster and leaves get correct ambient
 * light and soft reflections for the time of day. The sun disc is hidden in the capture
 * (the directional light already carries the sun).
 */
export class SkyEnvironment {
  private readonly pmrem: THREE.PMREMGenerator;
  private readonly envScene = new THREE.Scene();
  private readonly sky: Sky;
  private current: THREE.WebGLRenderTarget | null = null;
  private lastSun = new THREE.Vector3(0, -2, 0);
  private timer = 0;
  private readonly ground: THREE.Mesh;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly source: THREE.Mesh,
    private readonly target: THREE.Scene,
  ) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sky = new Sky();
    this.sky.scale.setScalar(1000);
    this.envScene.add(this.sky);
    // A warm ground hemisphere so the lower half of the environment isn't black.
    this.ground = new THREE.Mesh(new THREE.SphereGeometry(900, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6b5a44, side: THREE.BackSide }));
    this.envScene.add(this.ground);
  }

  update(dt: number, sunDir: THREE.Vector3, groundTint: THREE.Color): void {
    this.timer -= dt;
    const moved = sunDir.distanceTo(this.lastSun) > 0.02;
    if (this.current && (this.timer > 0 || !moved)) return;
    this.timer = 3;
    this.lastSun.copy(sunDir);
    const src = (this.source.material as THREE.ShaderMaterial).uniforms;
    const dst = (this.sky.material as THREE.ShaderMaterial).uniforms;
    for (const k of Object.keys(src)) {
      const v = src[k]!.value;
      if (v && typeof v === 'object' && 'copy' in v) (dst[k]!.value as { copy(x: unknown): void }).copy(v);
      else dst[k]!.value = v;
    }
    dst.showSunDisc!.value = 0;
    (this.ground.material as THREE.MeshBasicMaterial).color.copy(groundTint);
    const prevTone = this.renderer.toneMapping;
    this.renderer.toneMapping = THREE.NoToneMapping;
    const next = this.pmrem.fromScene(this.envScene, 0.02, 0.1, 2000, { size: 128 });
    this.renderer.toneMapping = prevTone;
    this.target.environment = next.texture;
    this.current?.dispose();
    this.current = next;
  }

  dispose(): void {
    this.current?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
  }
}
