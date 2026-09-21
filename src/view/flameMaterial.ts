import * as THREE from 'three';

/**
 * Procedural fire for instanced billboards. Domain-warped fbm noise rises through a wobbling
 * teardrop mask made of three overlapping tongues; colour ramps from deep red through orange
 * to a white-yellow core, with rising sparks near the tip. Additive, so black is invisible.
 * `time` must be advanced every frame with `tickFlames(seconds)`.
 *
 * opts.scale   noise frequency (bigger = finer detail)
 * opts.speed   rise speed
 * opts.width   base width of the flame as a fraction of the quad (0..1)
 * opts.glow    brightness multiplier
 */

const materials: THREE.ShaderMaterial[] = [];

export function flameMaterial(opts: { scale?: number; speed?: number; width?: number; glow?: number } = {}): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),   // fog: true needs fogColor/fogNear/fogFar present
      time: { value: 0 },
      uScale: { value: opts.scale ?? 1 },
      uSpeed: { value: opts.speed ?? 1 },
      uWidth: { value: opts.width ?? 0.9 },
      uGlow: { value: opts.glow ?? 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
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
        vec4 mvPosition = viewMatrix * m * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float time; uniform float uScale; uniform float uSpeed; uniform float uWidth; uniform float uGlow;
      varying vec2 vUv; varying float vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
      // One tongue of flame centred at cx with base half-width w; returns heat 0..1.
      float tongue(vec2 uv, float cx, float w, float n, float lift) {
        float y = clamp((uv.y - lift) / (1.0 - lift), 0.0, 1.0);
        float x = (uv.x - cx) * 2.0 + (n - 0.5) * 0.9 * y;
        float width = w * mix(1.0, 0.04, pow(y, 0.8));
        float body = 1.0 - smoothstep(width * 0.35, width, abs(x));
        return body * (1.0 - y) * step(lift, uv.y);
      }
      void main() {
        vec2 uv = vUv;
        float t = time * uSpeed + vSeed * 17.0;
        // Rising, domain-warped noise field.
        vec2 q = vec2(uv.x * 2.4 * uScale + vSeed * 3.0, (uv.y - t * 1.5) * 2.8 * uScale);
        vec2 warp = vec2(fbm(q * 1.6 + t * 0.7), fbm(q * 1.3 - t * 0.4)) - 0.5;
        float n = fbm(q + warp * 0.9);
        // Three tongues: a wide central one and two smaller side ones that lean outwards and lag.
        float side = sin(t * 2.3 + vSeed * 6.0) * 0.06;
        float heat = tongue(uv, 0.5 + side, uWidth, n, 0.0) * (0.6 + n * 0.9);
        heat = max(heat, tongue(uv, 0.5 - uWidth * 0.32 + side * 0.5, uWidth * 0.45, n, 0.05) * (0.5 + n * 0.7) * 0.85);
        heat = max(heat, tongue(uv, 0.5 + uWidth * 0.32 - side * 0.5, uWidth * 0.45, fbm(q + 3.1), 0.08) * (0.5 + n * 0.7) * 0.85);
        heat *= smoothstep(0.0, 0.08, uv.y);
        // Cavities: cooler pockets inside the body where the noise dips.
        heat *= 0.65 + 0.35 * smoothstep(0.3, 0.7, n);
        // Sparks: bright points riding up along the tip.
        float sp = smoothstep(0.975, 1.0, noise(vec2(uv.x * 28.0 + vSeed * 9.0, (uv.y - t * 2.6) * 14.0)));
        sp *= smoothstep(0.25, 0.7, uv.y) * (1.0 - uv.y) * (0.4 + n);
        vec3 col = mix(vec3(0.55, 0.03, 0.0), vec3(1.0, 0.35, 0.03), smoothstep(0.1, 0.45, heat));
        col = mix(col, vec3(1.0, 0.8, 0.25), smoothstep(0.45, 0.75, heat));
        col = mix(col, vec3(1.0, 0.98, 0.85), smoothstep(0.78, 1.0, heat));
        float alpha = smoothstep(0.08, 0.45, heat);
        col = col * alpha * 1.7 * uGlow + vec3(1.0, 0.75, 0.3) * sp * 2.0;
        gl_FragColor = vec4(col, max(alpha, sp));
        // Additive: fading towards black is fading into the fog.
        #ifdef USE_FOG
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
          gl_FragColor.rgb *= (1.0 - fogFactor);
          gl_FragColor.a *= (1.0 - fogFactor);
        #endif
      }`,
  });
  materials.push(mat);
  return mat;
}

export function tickFlames(seconds: number): void {
  for (const m of materials) m.uniforms.time.value = seconds;
}
