import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, ExtrudeGeometry, ShaderMaterial, Shape } from 'three'
import type { ProgressRef } from './useScrollProgress'
import { smoothstep } from './choreography'

const flameVertex = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.x += sin(p.y * 8.0 - uTime * 5.0) * 0.025 * uv.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const flameFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uPower;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);
  }
  void main() {
    float curve = (vUv.y * vUv.y) * 0.32;
    float d = abs(vUv.x - 0.36 - curve);
    float n = noise(vec2(vUv.x*12.0, vUv.y*12.0-uTime*2.4));
    float hot = smoothstep(0.2 + n*0.14, 0.015, d);
    float edge = smoothstep(0.44, 0.05, d) * (0.3+n*0.7);
    float end = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.87, vUv.y);
    vec3 color = mix(vec3(0.75,0.035,0.003),vec3(1.0,0.33,0.025),hot);
    color = mix(color,vec3(1.0,0.84,0.37),pow(hot,4.0));
    gl_FragColor = vec4(color * (1.2 + uPower), (hot*0.5+edge*0.22) * end);
  }
`

function makeBlade(inset = 0) {
  const shape = new Shape()
  shape.moveTo(-0.075 + inset, 0.22)
  shape.quadraticCurveTo(-0.02 + inset, 1.7, 0.26 + inset, 2.8)
  shape.lineTo(0.48, 3.23)
  shape.quadraticCurveTo(0.43 - inset, 1.72, 0.12 - inset, 0.22)
  shape.closePath()
  return new ExtrudeGeometry(shape, { depth: inset ? 0.042 : 0.07, bevelEnabled: !inset, bevelSegments: 2, steps: 1, bevelSize: 0.014, bevelThickness: 0.015, curveSegments: 24 })
}

export function Blade({ progress, frozen = false }: { progress: ProgressRef; frozen?: boolean }) {
  const outer = useMemo(() => makeBlade(), [])
  const inner = useMemo(() => makeBlade(0.047), [])
  const flame = useRef<ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPower: { value: 0.4 } }), [])
  useEffect(() => () => { outer.dispose(); inner.dispose() }, [outer, inner])
  useFrame(({ clock }) => {
    if (!flame.current) return
    flame.current.uniforms.uTime.value = frozen ? 0 : clock.elapsedTime
    flame.current.uniforms.uPower.value = 0.55 + smoothstep(0.12, 0.3, progress.current) * 1.4
  })

  return <group name="molten-blade">
    <mesh position={[0, -0.21, 0]}>
      <cylinderGeometry args={[0.07, 0.08, 0.52, 8]} />
      <meshStandardMaterial color="#241b17" roughness={0.65} metalness={0.45} />
    </mesh>
    {[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[0, -0.41 + i * 0.09, 0]} rotation={[0, 0, -0.2]}>
      <torusGeometry args={[0.072, 0.018, 4, 8]} />
      <meshStandardMaterial color="#aa7750" metalness={0.8} roughness={0.4} />
    </mesh>)}
    <mesh position={[0, 0.13, 0]} scale={[1, 0.26, 1]}>
      <sphereGeometry args={[0.24, 12, 8]} />
      <meshStandardMaterial color="#bb8640" metalness={0.85} roughness={0.26} />
    </mesh>
    <mesh geometry={outer}>
      <meshStandardMaterial color="#ffbd5b" emissive="#fc660d" emissiveIntensity={0.55} metalness={0.8} roughness={0.22} />
    </mesh>
    <mesh geometry={inner} position={[0, 0, 0.058]}>
      <meshStandardMaterial color="#fff0af" emissive={new Color(1, 0.62, 0.12)} emissiveIntensity={2.15} toneMapped={false} />
    </mesh>
    <mesh position={[0.16, 1.73, 0.1]}>
      <planeGeometry args={[0.95, 3.42, 5, 24]} />
      <shaderMaterial ref={flame} uniforms={uniforms} vertexShader={flameVertex} fragmentShader={flameFragment} transparent blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
    </mesh>
    <pointLight color="#ff7c23" intensity={3.2} distance={4.5} position={[0.2, 1.5, 0.4]} />
  </group>
}
