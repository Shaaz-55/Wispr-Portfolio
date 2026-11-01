import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, ExtrudeGeometry, Group, ShaderMaterial, Shape } from 'three'
import type { ProgressRef } from './useScrollProgress'
import { BLADE_BASE, BLADE_LENGTH, choreographyClock, poseAt, smoothstep } from './choreography'
import type { SceneLayout } from './choreography'

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
    float d = abs(vUv.x - 0.5);
    float n = noise(vec2(vUv.x*12.0, vUv.y*12.0-uTime*2.4));
    float hot = 1.0-smoothstep(0.015, 0.15+n*0.14, d);
    float edge = (1.0-smoothstep(0.05, 0.44, d)) * (0.3+n*0.7);
    float end = smoothstep(0.0, 0.06, vUv.y) * (1.0-smoothstep(0.93, 1.0, vUv.y));
    vec3 color = mix(vec3(0.3,0.001,0.012),vec3(1.0,0.006,0.025),hot);
    color = mix(color,vec3(1.0,0.12,0.16),pow(hot,8.0));
    gl_FragColor = vec4(color * (1.2 + uPower), (hot*0.55+edge*0.3) * end);
  }
`

function makeBlade(width: number, depth: number) {
  const shape = new Shape()
  shape.moveTo(-width / 2, 0)
  shape.lineTo(-width / 2, BLADE_LENGTH - 0.13)
  shape.lineTo(0, BLADE_LENGTH)
  shape.lineTo(width / 2, BLADE_LENGTH - 0.13)
  shape.lineTo(width / 2, 0)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

export function Blade({ progress, layout }: { progress: ProgressRef; layout: SceneLayout; frozen?: boolean }) {
  const outer = useMemo(() => makeBlade(0.14, 0.07), [])
  const inner = useMemo(() => makeBlade(0.035, 0.08), [])
  const energy = useRef<Group>(null)
  const flame = useRef<ShaderMaterial>(null)
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPower: { value: 0.4 } }), [])
  useEffect(() => () => { outer.dispose(); inner.dispose() }, [outer, inner])
  useFrame(() => {
    if (energy.current) energy.current.scale.y = poseAt(progress.current, layout).arm.bladeScale
    if (!flame.current) return
    flame.current.uniforms.uTime.value = choreographyClock(progress.current)
    flame.current.uniforms.uPower.value = 0.55 + smoothstep(0.12, 0.3, progress.current) * 1.4
  })

  return <group name="molten-blade">
    <mesh position={[0, -0.21, 0]}>
      <cylinderGeometry args={[0.07, 0.08, 0.52, 8]} />
      <meshStandardMaterial color="#241b20" roughness={0.65} metalness={0.45} />
    </mesh>
    {[0, 1, 2, 3, 4].map(i => <mesh key={i} position={[0, -0.41 + i * 0.09, 0]} rotation={[0, 0, -0.2]}>
      <torusGeometry args={[0.072, 0.018, 4, 8]} />
      <meshStandardMaterial color="#805963" metalness={0.8} roughness={0.4} />
    </mesh>)}
    <mesh position={[0, 0.13, 0]} scale={[1, 0.26, 1]}>
      <sphereGeometry args={[0.24, 12, 8]} />
      <meshStandardMaterial color="#99535e" metalness={0.85} roughness={0.26} />
    </mesh>
    <group ref={energy} position={[0, BLADE_BASE, 0]} name="blade-energy">
      <object3D name="blade-base" />
      <object3D name="blade-tip" position={[0, BLADE_LENGTH, 0]} />
      <mesh geometry={outer}>
        <meshBasicMaterial color={new Color(2.6, 0.005, 0.018)} toneMapped={false} />
      </mesh>
      <mesh name="blade-core" geometry={inner}>
        <meshBasicMaterial color={new Color(7, 1.3, 1.5)} toneMapped={false} />
      </mesh>
      <mesh position={[0, BLADE_LENGTH / 2, 0.06]}>
        <planeGeometry args={[0.7, BLADE_LENGTH + 0.05, 5, 24]} />
        <shaderMaterial ref={flame} uniforms={uniforms} vertexShader={flameVertex} fragmentShader={flameFragment} transparent blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
    <pointLight color="#ff1030" intensity={3.2} distance={4.5} position={[0, 1.5, 0.4]} />
  </group>
}
