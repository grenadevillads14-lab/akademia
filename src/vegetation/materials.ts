import * as THREE from 'three';
import { WIND_GLSL } from '../world/wind';
import type { WorldUniforms } from '../world/uniforms';

/**
 * Vegetation materials. Both patch MeshStandardMaterial so they keep three's lighting, shadows and fog,
 * and add: wind sway in world space (works with BatchedMesh), procedural bark per species,
 * the olive's silver-underside flip driven by gusts, leaf translucency against the sun,
 * and camera-facing impostors for distant trees.
 */

/** Vertex snippet replacing <project_vertex>: world-space wind, impostor billboarding. */
const PROJECT_WITH_WIND = /* glsl */ `
  vec4 wp = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    wp = batchingMatrix * wp;
  #endif
  #ifdef USE_INSTANCING
    wp = instanceMatrix * wp;
  #endif
  wp = modelMatrix * wp;
  #ifdef VEG_LEAVES
    if (aBill > 0.5) {
      // Rebuild the quad around the tree's pivot, facing the camera about the Y axis.
      vec4 pivot = vec4(0.0, 0.0, 0.0, 1.0);
      #ifdef USE_BATCHING
        pivot = batchingMatrix * pivot;
      #endif
      pivot = modelMatrix * pivot;
      float sc = 1.0;
      #ifdef USE_BATCHING
        sc = length(batchingMatrix[0].xyz);
      #endif
      vec3 toCam = cameraPosition - pivot.xyz; toCam.y = 0.0; toCam = normalize(toCam);
      vec3 side = normalize(vec3(toCam.z, 0.0, -toCam.x));
      wp.xyz = pivot.xyz + side * position.x * sc + vec3(0.0, position.y * sc, 0.0);
    }
  #endif
  vec2 sway = windSway(wp.xyz, aSway.x, mix(6.0, 1.2, aSway.y));
  #ifdef VEG_LEAVES
    // Leaf flutter on top of the branch sway.
    float fl = sin(uTime * 7.0 + aLeaf.y * 3.0 + wp.x) * 0.03 * (uWindStrength + uGust) * step(aBill, 0.5);
    wp.xyz += vec3(fl, fl * 0.6, -fl);
  #endif
  wp.xz += sway;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  vVegWorld = wp.xyz;
`;

function addWindUniforms(shader: THREE.WebGLProgramParametersWithUniforms, u: WorldUniforms): void {
  shader.uniforms.uTime = u.time;
  shader.uniforms.uWindDir = u.windDir;
  shader.uniforms.uWindStrength = u.windStrength;
  shader.uniforms.uGust = u.gust;
}

export function createWoodMaterial(u: WorldUniforms, bark?: THREE.DataArrayTexture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, color: 0xffffff });
  if (bark) mat.defines = { PHOTO_BARK: '' };
  mat.onBeforeCompile = (shader) => {
    addWindUniforms(shader, u);
    if (bark) shader.uniforms.uBark = { value: bark };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         ${WIND_GLSL}
         attribute vec2 aSway;
         attribute float aBark;
         varying float vBark;
         varying vec2 vBarkUv;
         varying vec3 vVegWorld;`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n vBark = aBark; vBarkUv = uv;`)
      .replace('#include <project_vertex>', PROJECT_WITH_WIND);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying float vBark;
         varying vec2 vBarkUv;
         varying vec3 vVegWorld;
         #ifdef PHOTO_BARK
           uniform mediump sampler2DArray uBark;
         #endif
         float barkH = 0.5;
         vec3 barkBump(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
           vec3 vSigmaX = dFdx(surfPos); vec3 vSigmaY = dFdy(surfPos); vec3 vN = surfNorm;
           vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX);
           float fDet = dot(vSigmaX, R1) * faceDir;
           vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
           return normalize(abs(fDet) * surfNorm - vGrad);
         }
         float vh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
         float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
           return mix(mix(vh(i),vh(i+vec2(1,0)),f.x), mix(vh(i+vec2(0,1)),vh(i+vec2(1,1)),f.x), f.y); }
         vec3 barkColor(float id, vec2 uv, vec3 wp) {
           vec2 p = vec2(uv.x * 6.0, uv.y * 2.0);
           if (id < 0.5) {
             // Olive: silver-grey, deeply fissured, darker in the grooves, a hint of moss low on the trunk.
             float fiss = vn(vec2(uv.x * 14.0, uv.y * 1.2)) ;
             vec3 c = mix(vec3(0.33,0.31,0.28), vec3(0.58,0.56,0.52), vn(p * 2.0));
             c *= mix(0.45, 1.0, smoothstep(0.2, 0.55, fiss));
             float moss = smoothstep(1.2, 0.0, wp.y) * smoothstep(0.55, 0.8, vn(p * 3.0));
             return mix(c, vec3(0.30,0.36,0.18), moss * 0.6);
           } else if (id < 1.5) {
             // Oriental plane: smooth bark shedding in jigsaw patches of cream, khaki and olive-grey.
             float n1 = vn(p * 1.3 + 3.1);
             float n2 = vn(p * 2.7 + 7.7);
             vec3 cream = vec3(0.86,0.82,0.68), khaki = vec3(0.62,0.58,0.42), olive = vec3(0.45,0.46,0.38);
             vec3 c = mix(cream, khaki, step(0.5, n1));
             c = mix(c, olive, step(0.62, n2));
             return c * (0.9 + 0.1 * vn(p * 10.0));
           } else if (id < 2.5) {
             return mix(vec3(0.36,0.26,0.20), vec3(0.48,0.36,0.27), vn(vec2(uv.x*20.0, uv.y*0.8)));
           } else if (id < 3.5) {
             // Fig: smooth pale grey.
             return mix(vec3(0.55,0.54,0.50), vec3(0.66,0.65,0.61), vn(p * 3.0));
           } else if (id < 4.5) {
             return mix(vec3(0.38,0.30,0.25), vec3(0.50,0.40,0.32), vn(p * 4.0));
           }
           return mix(vec3(0.34,0.28,0.22), vec3(0.44,0.36,0.28), vn(p * 4.0));
         }`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 bc = barkColor(vBark, vBarkUv, vVegWorld);
         #ifdef PHOTO_BARK
           // Photographic bark (Poly Haven): olive/fig/pomegranate use the grey layer, planes the platanus layer.
           if (vBark < 1.5 || (vBark > 2.5 && vBark < 4.5)) {
             float layer = (vBark > 0.5 && vBark < 1.5) ? 1.0 : 0.0;
             vec3 photo = texture(uBark, vec3(vBarkUv * vec2(2.0, 0.7), layer)).rgb;
             // Relief from a blurrier mip so it doesn't alias into speckle.
             barkH = dot(texture(uBark, vec3(vBarkUv * vec2(2.0, 0.7), layer), 2.5).rgb, vec3(0.333));
             if (layer < 0.5) photo = mix(vec3(dot(photo, vec3(0.33))), photo, 0.35) * (vBark > 2.5 ? vec3(1.25, 1.24, 1.2) : vec3(1.05, 1.03, 1.0));
             bc = mix(bc, photo, 0.85);
           }
         #endif
         diffuseColor.rgb *= bc;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
         #ifdef PHOTO_BARK
           // Relief from the bark photo: fissures read as grooves in low sun.
           float barkFade = 1.0 - smoothstep(6.0, 22.0, length(vViewPosition));
           normal = barkBump(-vViewPosition, normal, vec2(dFdx(barkH), dFdy(barkH)) * 0.7 * barkFade, faceDirection);
         #endif`,
      );
  };
  return mat;
}

export function createLeafMaterial(u: WorldUniforms, leafAtlas: THREE.Texture, impostorAtlas: THREE.Texture, sunDir: THREE.Vector3): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    roughness: 0.75,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.45,
    map: leafAtlas, // declares vMapUv / USE_MAP; we sample ourselves below
  });
  mat.defines = { VEG_LEAVES: '' };
  const sunDirU = { value: sunDir };
  mat.onBeforeCompile = (shader) => {
    addWindUniforms(shader, u);
    shader.uniforms.uImpostors = { value: impostorAtlas };
    shader.uniforms.uSunDirV = sunDirU;
    shader.uniforms.uNight = u.night;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         ${WIND_GLSL}
         attribute vec2 aSway;
         attribute vec2 aLeaf;
         attribute float aBill;
         varying vec2 vLeaf;
         varying float vBill;
         varying float vFlip;
         varying vec3 vVegWorld;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLeaf = aLeaf; vBill = aBill;`,
      )
      .replace('#include <project_vertex>', PROJECT_WITH_WIND + `
         // Olive silver flip: a gust rolling through turns leaves to show their pale undersides.
         float roll = sin(dot(wp.xz, uWindDir) * 0.09 - uTime * 2.2 + aLeaf.y) * 0.5 + 0.5;
         vFlip = clamp(uGust * 1.6 * smoothstep(0.35, 0.95, roll) + uWindStrength * 0.15 * roll, 0.0, 1.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform sampler2D uImpostors;
         uniform vec3 uSunDirV;
         uniform float uNight;
         varying vec2 vLeaf;
         varying float vBill;
         varying float vFlip;
         varying vec3 vVegWorld;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec4 leafTex = vBill > 0.5 ? texture2D(uImpostors, vMapUv) : texture2D(map, vMapUv);
         vec3 lc = leafTex.rgb;
         if (vLeaf.x > -0.5 && vLeaf.x < 0.5) {
           // Olive: dark glossy green on top; the underside (back face or flipped by wind) is silver-grey.
           // (Cards show both faces, so a back face is not necessarily an underside: keep the silver subtle.)
           float under = gl_FrontFacing ? vFlip : max(0.3, vFlip);
           vec3 silver = vec3(dot(lc, vec3(0.3,0.5,0.2))) * vec3(1.35, 1.42, 1.32) + vec3(0.06, 0.07, 0.06);
           lc = mix(lc, silver, under * 0.8);
         } else if (vLeaf.x > 0.5 && vLeaf.x < 1.5) {
           lc *= gl_FrontFacing ? vec3(1.0) : vec3(1.08, 1.12, 0.9);
         }
         diffuseColor *= vec4(lc, leafTex.a);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         // Cheap translucency: leaves glow yellow-green when the sun is behind them.
         vec3 vdir = normalize(vVegWorld - cameraPosition);
         float back = pow(max(dot(vdir, normalize(uSunDirV)), 0.0), 6.0) * (1.0 - uNight) * step(vBill, 0.5);
         totalEmissiveRadiance += diffuseColor.rgb * vec3(0.9, 1.0, 0.45) * back * 0.9;`,
      );
  };
  return mat;
}

/** Shadow-casting depth material that sways with the leaves and cuts out the card alpha. */
export function createLeafDepthMaterial(u: WorldUniforms, leafAtlas: THREE.Texture): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafAtlas, alphaTest: 0.45, side: THREE.DoubleSide });
  mat.defines = { VEG_LEAVES: '' };
  mat.onBeforeCompile = (shader) => {
    addWindUniforms(shader, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         ${WIND_GLSL}
         attribute vec2 aSway;
         attribute vec2 aLeaf;
         attribute float aBill;
         varying vec3 vVegWorld;`,
      )
      .replace('#include <project_vertex>', PROJECT_WITH_WIND);
  };
  return mat;
}

export function createWoodDepthMaterial(u: WorldUniforms): THREE.MeshDepthMaterial {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    addWindUniforms(shader, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         ${WIND_GLSL}
         attribute vec2 aSway;
         varying vec3 vVegWorld;`,
      )
      .replace('#include <project_vertex>', PROJECT_WITH_WIND);
  };
  return mat;
}
