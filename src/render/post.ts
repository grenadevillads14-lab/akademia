import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { GraphicsSettings } from '../core/settings';

/**
 * Post-processing pipeline (all hand-written, depth-only, so it's cheap enough for integrated GPUs):
 *  1. scene → HDR target (MSAA) with a depth texture
 *  2. SSAO from depth (half resolution, normals reconstructed from depth) + depth-aware blur
 *  3. sun light shafts: radial blur of the sky around the sun (quarter resolution)
 *  4. bloom: bright pass + two blur levels
 *  5. composite: AO, analytic height fog with golden in-scattering toward the sun, shafts, bloom,
 *     colour grade (white balance, saturation, contrast, lift/gain), vignette, grain, AgX tone mapping.
 */
export interface AtmosphereParams {
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  fogColor: THREE.Color;
  /** Base fog density at y = fogBase. */
  fogDensity: number;
  fogBase: number;
  /** How fast fog thins with height (1/m). */
  heightFalloff: number;
  /** 0..1: how much of the horizon sky is hazed. */
  horizonHaze: number;
  /** Strength of light shafts (0 at night). */
  shafts: number;
  /** Colour grade. */
  warmth: number;
  saturation: number;
  contrast: number;
}

const COMMON = /* glsl */ `
  #include <packing>
  uniform sampler2D tDepth;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform mat4 projInv;
  float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
  vec3 viewPos(vec2 uv, float d) {
    vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vec4 v = projInv * clip;
    return v.xyz / v.w;
  }
`;

const VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const AO_FRAG = /* glsl */ `
  ${COMMON}
  varying vec2 vUv;
  uniform vec2 texel;
  uniform float radius;
  uniform mat4 proj;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float d = rawDepth(vUv);
    if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
    vec3 P = viewPos(vUv, d);
    // Normal from the smaller of left/right and up/down depth differences (avoids edge halos).
    vec3 pl = viewPos(vUv - vec2(texel.x, 0.0), rawDepth(vUv - vec2(texel.x, 0.0)));
    vec3 pr = viewPos(vUv + vec2(texel.x, 0.0), rawDepth(vUv + vec2(texel.x, 0.0)));
    vec3 pd = viewPos(vUv - vec2(0.0, texel.y), rawDepth(vUv - vec2(0.0, texel.y)));
    vec3 pu = viewPos(vUv + vec2(0.0, texel.y), rawDepth(vUv + vec2(0.0, texel.y)));
    vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
    vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
    vec3 cr = cross(dx, dy);
    if (dot(cr, cr) < 1e-12) { gl_FragColor = vec4(1.0); return; } // degenerate: avoid NaN speckles
    vec3 N = normalize(cr);
    float ang = hash(vUv * 731.7) * 6.2831;
    float occ = 0.0;
    const int SAMPLES = 12;
    for (int i = 0; i < SAMPLES; i++) {
      float t = (float(i) + 0.5) / float(SAMPLES);
      float a = ang + t * 6.2831 * 2.618;
      float r = radius * t;
      // Sample in view space on the tangent disc, then project.
      vec3 tang = normalize(cross(N, abs(N.y) < 0.9 ? vec3(0,1,0) : vec3(1,0,0)));
      vec3 bit = cross(N, tang);
      vec3 S = P + (tang * cos(a) + bit * sin(a)) * r + N * r * 0.25;
      vec4 c = proj * vec4(S, 1.0);
      vec2 suv = c.xy / c.w * 0.5 + 0.5;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
      float sd = rawDepth(suv);
      if (sd >= 0.99999) continue; // sky: no occluder
      vec3 Q = viewPos(suv, sd);
      vec3 v = Q - P;
      float dist = length(v);
      float o = max(0.0, dot(N, v / max(dist, 1e-4)) - 0.08) * (1.0 - smoothstep(radius * 0.5, radius * 1.6, dist));
      occ += o;
    }
    occ = 1.0 - occ / float(SAMPLES) * 1.6;
    if (isnan(occ) || isinf(occ)) occ = 1.0;
    // Fade AO out with distance (far detail is handled by fog).
    float fade = smoothstep(120.0, 40.0, -P.z);
    gl_FragColor = vec4(vec3(mix(1.0, clamp(occ, 0.0, 1.0), fade)), 1.0);
  }
`;

const BLUR_AO_FRAG = /* glsl */ `
  ${COMMON}
  varying vec2 vUv;
  uniform sampler2D tAO;
  uniform vec2 dir;
  void main() {
    float d0 = rawDepth(vUv);
    float z0 = viewPos(vUv, d0).z;
    float sum = 0.0, wsum = 0.0;
    for (int i = -4; i <= 4; i++) {
      vec2 uv = vUv + dir * float(i);
      float z = viewPos(uv, rawDepth(uv)).z;
      float w = exp(-float(i * i) / 8.0) * exp(-abs(z - z0) / (0.04 * abs(z0) + 0.05));
      sum += texture2D(tAO, uv).r * w;
      wsum += w;
    }
    gl_FragColor = vec4(vec3(sum / wsum), 1.0);
  }
`;

const SHAFT_FRAG = /* glsl */ `
  ${COMMON}
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform vec2 sunUv;
  uniform float sunVisible;
  void main() {
    vec2 delta = (vUv - sunUv) / 48.0;
    vec2 uv = vUv;
    float illum = 0.0;
    float decay = 1.0;
    for (int i = 0; i < 48; i++) {
      uv -= delta;
      float sky = step(0.99999, rawDepth(uv));
      vec3 c = texture2D(tColor, uv).rgb;
      illum += sky * smoothstep(0.6, 2.5, dot(c, vec3(0.333))) * decay;
      decay *= 0.965;
    }
    gl_FragColor = vec4(vec3(illum / 48.0 * sunVisible), 1.0);
  }
`;

const BRIGHT_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform float threshold;
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(threshold, threshold * 2.0, l), 1.0);
  }
`;

const BLUR_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform vec2 dir;
  void main() {
    vec3 s = texture2D(tColor, vUv).rgb * 0.227;
    s += (texture2D(tColor, vUv + dir * 1.385).rgb + texture2D(tColor, vUv - dir * 1.385).rgb) * 0.316;
    s += (texture2D(tColor, vUv + dir * 3.231).rgb + texture2D(tColor, vUv - dir * 3.231).rgb) * 0.070;
    gl_FragColor = vec4(s, 1.0);
  }
`;

const COMPOSITE_FRAG = /* glsl */ `
  ${COMMON}
  varying vec2 vUv;
  uniform sampler2D tColor;
  uniform sampler2D tAO;
  uniform sampler2D tShafts;
  uniform sampler2D tBloomA;
  uniform sampler2D tBloomB;
  uniform mat4 camWorld;
  uniform vec3 camPos;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float fogBase;
  uniform float heightFalloff;
  uniform float horizonHaze;
  uniform float aoStrength;
  uniform float shaftStrength;
  uniform float bloomStrength;
  uniform float warmth;
  uniform float saturation;
  uniform float contrast;
  uniform float time;
  uniform float useAO;
  uniform float debugMode;
  // (tonemapping_pars and colorspace_pars are prepended by three for ShaderMaterial.)
  float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb;
    if (debugMode > 0.5) { gl_FragColor = vec4(c, 1.0); 
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return; }
    float d = rawDepth(vUv);
    bool sky = d >= 0.99999;
    vec3 vp = viewPos(vUv, sky ? 0.9999 : d);
    vec3 rayDir = normalize((camWorld * vec4(vp, 0.0)).xyz);
    float dist = sky ? 1e5 : length(vp);

    if (!sky && useAO > 0.5) c *= mix(1.0, clamp(texture2D(tAO, vUv).r, 0.0, 1.0), aoStrength);

    // Analytic exponential height fog, integrated along the view ray.
    float sunAmt = pow(max(dot(rayDir, sunDir), 0.0), 6.0);
    vec3 inscatter = mix(fogColor, fogColor * 0.6 + sunColor * 0.55, sunAmt);
    if (sky) {
      float h = exp(-max(rayDir.y, 0.0) * 9.0) * horizonHaze;
      c = mix(c, inscatter * 1.05, h);
    } else {
      float b = heightFalloff;
      float camH = max(camPos.y - fogBase, 0.0);
      float ry = rayDir.y;
      float fog = fogDensity * exp(-b * camH) * dist * (abs(ry * dist * b) > 1e-3 ? (1.0 - exp(-b * ry * dist)) / (b * ry * dist) : 1.0);
      float f = 1.0 - exp(-fog);
      c = mix(c, inscatter, clamp(f, 0.0, 1.0));
      // Aerial perspective for the far hills: cooler and paler with distance, regardless of height.
      vec3 farHaze = mix(fogColor * vec3(0.86, 0.94, 1.12), inscatter, sunAmt * 0.6);
      c = mix(c, farHaze, smoothstep(900.0, 6500.0, dist) * 0.72);
    }

    // Sun shafts and bloom.
    c += texture2D(tShafts, vUv).rgb * sunColor * shaftStrength;
    c += (texture2D(tBloomA, vUv).rgb * 0.6 + texture2D(tBloomB, vUv).rgb * 0.8) * bloomStrength;

    // Grade (in linear HDR, before tone mapping): white balance, saturation, contrast around mid grey.
    c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.9), warmth);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = max(mix(vec3(l), c, saturation), 0.0);
    c = pow(c / 0.18, vec3(contrast)) * 0.18;

    // Vignette and a little grain.
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.55;
    c = max(c + (hash(vUv * 1013.0) - 0.5) * 0.006 * (0.3 + l), 0.0);
    if (any(isnan(c))) c = texture2D(tColor, vUv).rgb;

    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function rt(w: number, h: number, opts: THREE.RenderTargetOptions = {}): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false, ...opts });
}

export class PostPipeline {
  private scene: THREE.WebGLRenderTarget;
  private ao!: THREE.WebGLRenderTarget;
  private aoBlur!: THREE.WebGLRenderTarget;
  private shafts!: THREE.WebGLRenderTarget;
  private bright!: THREE.WebGLRenderTarget;
  private blurA!: THREE.WebGLRenderTarget;
  private blurA2!: THREE.WebGLRenderTarget;
  private blurB!: THREE.WebGLRenderTarget;
  private blurC!: THREE.WebGLRenderTarget;
  private readonly quad = new FullScreenQuad();
  private readonly mats: Record<string, THREE.ShaderMaterial> = {};
  private w = 1;
  private h = 1;
  enabled = true;
  readonly params: AtmosphereParams = {
    sunDir: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(1, 0.9, 0.7),
    fogColor: new THREE.Color(0.8, 0.82, 0.85),
    fogDensity: 0.0016,
    fogBase: 0,
    heightFalloff: 0.035,
    horizonHaze: 0.55,
    shafts: 0.5,
    warmth: 0.35,
    saturation: 1.08,
    contrast: 1.06,
  };

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly gfx: GraphicsSettings,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.scene = this.makeSceneTarget(size.x, size.y);
    const shared = () => ({ tDepth: { value: this.scene.depthTexture }, cameraNear: { value: 0.1 }, cameraFar: { value: 1000 }, projInv: { value: new THREE.Matrix4() } });
    const make = (frag: string, uniforms: Record<string, THREE.IUniform>, toneMapped = false) =>
      new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { ...shared(), ...uniforms }, depthTest: false, depthWrite: false, toneMapped });
    this.mats.ao = make(AO_FRAG, { texel: { value: new THREE.Vector2() }, radius: { value: 1.2 }, proj: { value: new THREE.Matrix4() } });
    this.mats.aoBlur = make(BLUR_AO_FRAG, { tAO: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mats.shafts = make(SHAFT_FRAG, { tColor: { value: null }, sunUv: { value: new THREE.Vector2() }, sunVisible: { value: 0 } });
    this.mats.bright = make(BRIGHT_FRAG, { tColor: { value: null }, threshold: { value: 1.4 } });
    this.mats.blur = make(BLUR_FRAG, { tColor: { value: null }, dir: { value: new THREE.Vector2() } });
    this.mats.composite = make(
      COMPOSITE_FRAG,
      {
        tColor: { value: null },
        tAO: { value: null },
        tShafts: { value: null },
        tBloomA: { value: null },
        tBloomB: { value: null },
        camWorld: { value: new THREE.Matrix4() },
        camPos: { value: new THREE.Vector3() },
        sunDir: { value: new THREE.Vector3() },
        sunColor: { value: new THREE.Color() },
        fogColor: { value: new THREE.Color() },
        fogDensity: { value: 0 },
        fogBase: { value: 0 },
        heightFalloff: { value: 0.03 },
        horizonHaze: { value: 0.5 },
        aoStrength: { value: 0.85 },
        shaftStrength: { value: 0.5 },
        bloomStrength: { value: 0.12 },
        warmth: { value: 0.3 },
        saturation: { value: 1.05 },
        contrast: { value: 1.05 },
        time: { value: 0 },
        useAO: { value: 1 },
        debugMode: { value: Number(new URLSearchParams(location.search).get('postdebug') ?? 0) },
      },
      true,
    );
    this.setSize(size.x, size.y);
  }

  private makeSceneTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: this.gfx.antialias && new URLSearchParams(location.search).get("msaa") !== "0" ? 4 : 0,
      depthBuffer: true,
      depthTexture: depth,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  setSize(w: number, h: number): void {
    if (w === this.w && h === this.h && this.ao) return;
    this.w = w;
    this.h = h;
    this.scene.setSize(w, h);
    for (const t of [this.ao, this.aoBlur, this.shafts, this.bright, this.blurA, this.blurA2, this.blurB, this.blurC]) t?.dispose();
    const hw = Math.ceil(w / 2);
    const hh = Math.ceil(h / 2);
    this.ao = rt(hw, hh, { type: THREE.UnsignedByteType });
    this.aoBlur = rt(hw, hh, { type: THREE.UnsignedByteType });
    this.shafts = rt(Math.ceil(w / 4), Math.ceil(h / 4));
    this.bright = rt(hw, hh);
    this.blurA = rt(Math.ceil(w / 4), Math.ceil(h / 4));
    this.blurA2 = rt(Math.ceil(w / 4), Math.ceil(h / 4));
    this.blurB = rt(Math.ceil(w / 8), Math.ceil(h / 8));
    this.blurC = rt(Math.ceil(w / 8), Math.ceil(h / 8));
    for (const m of Object.values(this.mats)) if (m.uniforms.tDepth) m.uniforms.tDepth.value = this.scene.depthTexture;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, time: number): void {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    this.setSize(size.x, size.y);
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    r.setRenderTarget(this.scene);
    r.render(scene, camera);

    const p = this.params;
    for (const m of Object.values(this.mats)) {
      if (!m.uniforms.cameraNear) continue;
      m.uniforms.cameraNear.value = camera.near;
      m.uniforms.cameraFar!.value = camera.far;
      m.uniforms.projInv!.value.copy(camera.projectionMatrixInverse);
    }
    const g = this.gfx.post;

    // AO.
    if (g.ao) {
      const ao = this.mats.ao!;
      ao.uniforms.texel!.value.set(1 / this.ao.width, 1 / this.ao.height);
      ao.uniforms.proj!.value.copy(camera.projectionMatrix);
      this.pass(ao, this.ao);
      const b = this.mats.aoBlur!;
      b.uniforms.tAO!.value = this.ao.texture;
      b.uniforms.dir!.value.set(1 / this.ao.width, 0);
      this.pass(b, this.aoBlur);
      b.uniforms.tAO!.value = this.aoBlur.texture;
      b.uniforms.dir!.value.set(0, 1 / this.ao.height);
      this.pass(b, this.ao);
    }

    // Light shafts: only if the sun is in front of the camera.
    const sunWorld = camera.position.clone().addScaledVector(p.sunDir, 1000);
    const sunClip = sunWorld.project(camera);
    const camFwd = camera.getWorldDirection(new THREE.Vector3());
    const facing = THREE.MathUtils.smoothstep(camFwd.dot(p.sunDir), 0.0, 0.5);
    const shaftsOn = g.godRays && p.shafts > 0.01 && facing > 0;
    if (shaftsOn) {
      const s = this.mats.shafts!;
      s.uniforms.tColor!.value = this.scene.texture;
      s.uniforms.sunUv!.value.set(sunClip.x * 0.5 + 0.5, sunClip.y * 0.5 + 0.5);
      s.uniforms.sunVisible!.value = facing;
      this.pass(s, this.shafts);
    }

    // Bloom.
    if (g.bloom) {
      const br = this.mats.bright!;
      br.uniforms.tColor!.value = this.scene.texture;
      this.pass(br, this.bright);
      const bl = this.mats.blur!;
      const blur = (src: THREE.WebGLRenderTarget, tmp: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget) => {
        bl.uniforms.tColor!.value = src.texture;
        bl.uniforms.dir!.value.set(1 / tmp.width, 0);
        this.pass(bl, tmp);
        bl.uniforms.tColor!.value = tmp.texture;
        bl.uniforms.dir!.value.set(0, 1 / tmp.height);
        this.pass(bl, dst);
      };
      blur(this.bright, this.blurA2, this.blurA);
      blur(this.blurA, this.blurB, this.blurC);
    }

    const c = this.mats.composite!;
    const u = c.uniforms;
    u.tColor!.value = this.scene.texture;
    u.tAO!.value = this.ao.texture;
    u.useAO!.value = g.ao ? 1 : 0;
    u.tShafts!.value = this.shafts.texture;
    u.shaftStrength!.value = shaftsOn ? p.shafts : 0;
    u.tBloomA!.value = this.blurA.texture;
    u.tBloomB!.value = this.blurC.texture;
    u.bloomStrength!.value = g.bloom ? 0.12 : 0;
    u.camWorld!.value.copy(camera.matrixWorld);
    u.camPos!.value.copy(camera.position);
    u.sunDir!.value.copy(p.sunDir);
    u.sunColor!.value.copy(p.sunColor);
    u.fogColor!.value.copy(p.fogColor);
    u.fogDensity!.value = p.fogDensity;
    u.fogBase!.value = p.fogBase;
    u.heightFalloff!.value = p.heightFalloff;
    u.horizonHaze!.value = p.horizonHaze;
    u.warmth!.value = p.warmth;
    u.saturation!.value = p.saturation;
    u.contrast!.value = p.contrast;
    u.time!.value = time % 100;
    this.pass(c, null);
  }

  dispose(): void {
    for (const t of [this.scene, this.ao, this.aoBlur, this.shafts, this.bright, this.blurA, this.blurA2, this.blurB, this.blurC]) t.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.quad.dispose();
  }
}
