declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three';
  import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
  /** N8AO's post pass: screen-space ambient occlusion read from the depth buffer. */
  /** N8AO for three's own EffectComposer: renders the scene itself (in place of a RenderPass), with AO. */
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    beautyRenderTarget: import('three').WebGLRenderTarget;
    configuration: N8AOPostPass['configuration'];
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
    setSize(w: number, h: number): void;
  }
  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number; distanceFalloff: number; intensity: number; color: Color;
      halfRes: boolean; gammaCorrection: boolean; screenSpaceRadius: boolean; depthAwareUpsampling: boolean;
      aoSamples: number; denoiseSamples: number; denoiseRadius: number;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
    setSize(w: number, h: number): void;
  }
}
