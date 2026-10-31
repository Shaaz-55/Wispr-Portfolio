import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, ShaderMaterial, Vector3 } from 'three'
import { bladePointAt, clamp, smoothstep } from './choreography'
import type { ProgressRef } from './useScrollProgress'

const SAMPLES = 40
const vertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const fragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uProgress;
  uniform float uStrength;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
  }
  float fbm(vec2 p) {
    float value=0.0, amplitude=0.5;
    for(int i=0;i<4;i++) { value+=noise(p)*amplitude; p=p*2.03+vec2(5.7,1.9); amplitude*=0.5; }
    return value;
  }
  void main() {
    float n=fbm(vec2(vUv.x*14.0-uProgress*16.0,vUv.y*4.0));
    float center=1.0-abs(vUv.y*2.0-1.0);
    float fire=smoothstep(0.05,0.75,center+n*0.45);
    float hot=pow(center,5.0);
    vec3 color=mix(vec3(0.35,0.007,0.002),vec3(1.0,0.19,0.008),fire);
    color=mix(color,vec3(1.0,0.7,0.11),center*center);
    color=mix(color,vec3(1.0,0.98,0.77),hot);
    float tail=smoothstep(0.0,0.35,vUv.x);
    gl_FragColor=vec4(color*(1.6+hot*2.0),fire*tail*uStrength*smoothstep(0.0,0.16,center));
  }
`

export function FireTrail({ progress }: { progress: ProgressRef }) {
  const shader = useRef<ShaderMaterial>(null)
  const ring = useMemo(() => new Float32Array(SAMPLES * 3), [])
  const geometry = useMemo(() => {
    const geo = new BufferGeometry()
    const uv = new Float32Array(SAMPLES * 4)
    const indices: number[] = []
    for (let i = 0; i < SAMPLES; i++) {
      uv.set([i / (SAMPLES - 1), 0, i / (SAMPLES - 1), 1], i * 4)
      if (i < SAMPLES - 1) { const k = i * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) }
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(SAMPLES * 6), 3))
    geo.setAttribute('uv', new BufferAttribute(uv, 2))
    geo.setIndex(indices)
    return geo
  }, [])
  const uniforms = useMemo(() => ({ uProgress: { value: 0 }, uStrength: { value: 0 } }), [])
  const point = useMemo(() => new Vector3(), [])
  const previousP = useRef(-1)
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    const p = progress.current
    if (previousP.current === p || !shader.current) return
    previousP.current = p
    shader.current.uniforms.uProgress.value = p
    shader.current.uniforms.uStrength.value = smoothstep(0.285, 0.34, p) * (1 - smoothstep(0.5, 0.575, p))
    // Rebuild a ring from the scroll interval, so history never depends on scroll direction.
    const cursor = Math.floor(p * 400) % SAMPLES
    for (let i = 0; i < SAMPLES; i++) {
      const sample = clamp(p - 0.085 * (1 - i / (SAMPLES - 1)), 0.28, 0.57)
      bladePointAt(sample, 3.05, point)
      point.toArray(ring, ((cursor + i) % SAMPLES) * 3)
    }
    const positions = geometry.attributes.position
    for (let i = 0; i < SAMPLES; i++) {
      const offset = ((cursor + i) % SAMPLES) * 3
      const next = ((cursor + Math.min(i + 1, SAMPLES - 1)) % SAMPLES) * 3
      const prev = ((cursor + Math.max(i - 1, 0)) % SAMPLES) * 3
      const dx = ring[next] - ring[prev], dy = ring[next + 1] - ring[prev + 1]
      const length = Math.hypot(dx, dy) || 1
      const width = (0.045 + Math.sin(i / (SAMPLES - 1) * Math.PI) * 0.2) * smoothstep(0.28, 0.4, p)
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1
        positions.setXYZ(i * 2 + side, ring[offset] - dy / length * width * sign, ring[offset + 1] + dx / length * width * sign, ring[offset + 2] + 0.06)
      }
    }
    positions.needsUpdate = true
  })
  return <mesh geometry={geometry} frustumCulled={false} renderOrder={5} name="scroll-sampled-fire-ribbon">
    <shaderMaterial ref={shader} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
  </mesh>
}
