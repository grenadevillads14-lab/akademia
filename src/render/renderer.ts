import * as THREE from 'three';
import type { GraphicsSettings } from '../core/settings';

/** Read the GPU name from WebGL. Works without creating the game renderer. */
export function detectGpu(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return 'no-webgl2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name || 'unknown';
  } catch {
    return 'unknown';
  }
}

export function createRenderer(container: HTMLElement, gfx: GraphicsSettings): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: gfx.antialias,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // AgX keeps saturated golden-hour colours from clipping to yellow-white the way ACES can.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = gfx.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // We reset render stats manually at the start of each frame so multi-pass post-processing
  // (added later) is counted as one frame in the debug overlay.
  renderer.info.autoReset = false;
  applyResolution(renderer, gfx);
  renderer.domElement.id = 'game-canvas';
  container.appendChild(renderer.domElement);
  return renderer;
}

export function applyResolution(renderer: THREE.WebGLRenderer, gfx: GraphicsSettings): void {
  const ratio = Math.min(window.devicePixelRatio || 1, gfx.maxPixelRatio) * gfx.renderScale;
  renderer.setPixelRatio(ratio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}

export function onResize(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, gfx: GraphicsSettings): void {
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  applyResolution(renderer, gfx);
}
