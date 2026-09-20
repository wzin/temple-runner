import * as THREE from 'three';

/**
 * Procedural flame for instanced billboards: scrolling fbm noise shaped by a teardrop
 * mask, colour ramp from white-yellow core to deep red edges, additive. `time` must be
 * advanced every frame with `tickFlames(seconds)`.
 */

const materials: THREE.ShaderMaterial[] = [];

export function flameMaterial(opts: { scale?: number; speed?: number } = {}): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, uScale: { value: opts.scale ?? 1 }, uSpeed: { value: opts.speed ?? 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        #ifdef USE_INSTANCING
          mat4 m = modelMatrix * instanceMatrix;
          vSeed = fract(instanceMatrix[3][0] * 0.371 + instanceMatrix[3][2] * 0.173);
        #else
          mat4 m = modelMatrix;
          vSeed = 0.0;
        #endif
        gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform float uScale; uniform float uSpeed;
      varying vec2 vUv; varying float vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main() {
        vec2 uv = vUv;
        float t = time * uSpeed + vSeed * 17.0;
        // Rising, wobbling noise field.
        vec2 q = vec2(uv.x * 2.2 * uScale, (uv.y - t * 1.6) * 2.6 * uScale);
        float n = fbm(q + vec2(fbm(q * 1.7 + t) * 0.6, 0.0));
        // Teardrop mask: wide at the base, thin at the tip, wobbling sideways with the noise.
        float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.7 * uv.y;
        float width = mix(0.9, 0.05, pow(uv.y, 0.9));
        float body = 1.0 - smoothstep(width * 0.4, width, abs(x));
        float heat = body * (1.0 - uv.y) * (0.55 + n * 0.9);
        heat *= smoothstep(0.0, 0.12, uv.y) ;
        vec3 col = mix(vec3(0.6, 0.05, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.15, 0.55, heat));
        col = mix(col, vec3(1.0, 0.95, 0.7), smoothstep(0.65, 1.0, heat));
        float alpha = smoothstep(0.12, 0.5, heat);
        gl_FragColor = vec4(col * alpha * 1.6, alpha);
      }`,
  });
  materials.push(mat);
  return mat;
}

export function tickFlames(seconds: number): void {
  for (const m of materials) m.uniforms.time.value = seconds;
}
