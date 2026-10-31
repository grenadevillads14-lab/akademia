import * as THREE from 'three';

/**
 * Weathering for architecture, added to the shared building materials: rising damp and splash grime at the
 * foot of walls (following the real ground height), faint vertical rain streaks, large-scale sun-bleached
 * versus dirty variation, dust on paving, lichen and soot on roof tiles. All procedural in world space, so
 * merged meshes and repeated textures stop looking like copies of each other.
 */
export type WeatherKind = 'wall' | 'floor' | 'roof' | 'none';

/** Linear mean albedo of each photo texture (measured; many Poly Haven scans are shot dark). */
export const TEX_MEAN: Record<string, [number, number, number]> = {
  white_plaster_rough_01: [0.207, 0.171, 0.1],
  white_sandstone_blocks_02: [0.462, 0.385, 0.293],
  stacked_stone_wall: [0.119, 0.062, 0.031],
  clay_roof_tiles: [0.114, 0.038, 0.013],
  marble_01: [0.44, 0.34, 0.194],
  wood_plank_wall: [0.056, 0.033, 0.026],
  clay_plaster: [0.168, 0.103, 0.045],
};

/** Repaint a texture to a real-world mean albedo: detail from the photo's luminance, colour mostly from the target. */
export interface Calibration {
  albedo: [number, number, number];
  texMean: [number, number, number];
}

/** Terrain height texture and its world rectangle (set once the terrain exists). */
export const weatherUniforms = {
  uGroundH: { value: null as THREE.Texture | null },
  uGroundRect: { value: new THREE.Vector4(0, 0, 1, 1) },
};

const NOISE = /* glsl */ `
  float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
  float wfbm(vec2 p){ return wn(p) * 0.55 + wn(p * 2.1 + 3.7) * 0.3 + wn(p * 4.3 + 7.1) * 0.15; }
`;

export function applyWeathering(mat: THREE.MeshStandardMaterial, kind: WeatherKind, calib?: Calibration): void {
  if (mat.userData.weathered) return;
  mat.userData.weathered = kind;
  const prev = mat.onBeforeCompile;
  mat.customProgramCacheKey = () => `weather-${kind}-${calib ? 'cal' : ''}`;
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.uniforms.uGroundH = weatherUniforms.uGroundH;
    shader.uniforms.uAlbedo = { value: new THREE.Vector3(...(calib?.albedo ?? [1, 1, 1])) };
    shader.uniforms.uTexMean = { value: new THREE.Vector3(...(calib?.texMean ?? [1, 1, 1])) };
    shader.uniforms.uGroundRect = weatherUniforms.uGroundRect;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWxW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWxW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const body =
      kind === 'wall'
        ? `
        float gh = texture2D(uGroundH, (vWxW.xz - uGroundRect.xy) / uGroundRect.zw).r;
        float above = vWxW.y - gh;
        float along = vWxW.x * 0.83 + vWxW.z * 1.31;
        // Sun-bleached versus dirty, over metres.
        diffuseColor.rgb *= mix(0.86, 1.07, wfbm(vec2(along * 0.12, vWxW.y * 0.09)));
        // Rising damp and rain splash: a ragged dark band at the foot of the wall.
        float edge = 0.25 + wfbm(vec2(along * 1.3, 0.0)) * 0.55;
        float damp = 1.0 - smoothstep(edge * 0.5, edge + 0.25, above);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.62, 0.58, 0.5), damp * 0.8);
        // Rain streaks running down from ledges: stretched vertical noise.
        float streak = smoothstep(0.58, 0.9, wn(vec2(along * 2.3, vWxW.y * 0.18))) * smoothstep(0.3, 1.5, above);
        diffuseColor.rgb *= 1.0 - streak * 0.16;
        // A little green-grey staining low on shaded walls.
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.86, 0.76), damp * smoothstep(0.55, 0.8, wn(vWxW.xz * 0.9 + vWxW.y)) * 0.5);`
        : kind === 'none'
          ? ''
          : kind === 'floor'
          ? `
        float dust = smoothstep(0.35, 0.8, wfbm(vWxW.xz * 0.35));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.53, 0.4) * dot(diffuseColor.rgb, vec3(0.45)), dust * 0.45);
        diffuseColor.rgb *= mix(0.88, 1.06, wfbm(vWxW.xz * 0.08));`
          : `
        float lichen = smoothstep(0.62, 0.85, wfbm(vWxW.xz * 0.7 + vWxW.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.52, 0.4) * dot(diffuseColor.rgb, vec3(0.5)) * 1.6, lichen * 0.4);
        diffuseColor.rgb *= mix(0.78, 1.08, wfbm(vWxW.xz * 0.15));`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWxW;\nuniform sampler2D uGroundH;\nuniform vec4 uGroundRect;\nuniform vec3 uAlbedo;\nuniform vec3 uTexMean;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        ${
          calib
            ? `{
          // Albedo calibration (see Calibration): keep the photo's detail, not its exposure.
          vec3 lumW = vec3(0.2126, 0.7152, 0.0722);
          float rel = dot(diffuseColor.rgb, lumW) / max(dot(uTexMean, lumW), 1e-3);
          vec3 neutral = uAlbedo * rel;
          vec3 scaled = diffuseColor.rgb * (uAlbedo / max(uTexMean, vec3(1e-3)));
          diffuseColor.rgb = min(mix(neutral, scaled, 0.3), vec3(0.95));
        }`
            : ''
        }
        ${body}`,
      );
  };
  mat.needsUpdate = true;
}
