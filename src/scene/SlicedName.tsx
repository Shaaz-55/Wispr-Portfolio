import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, Group, MeshStandardMaterial, Plane, ShaderMaterial } from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import fontData from 'three/examples/fonts/helvetiker_bold.typeface.json'
import { CUT_NORMAL, NAME_CENTER, splitAt } from './choreography'
import type { ProgressRef } from './useScrollProgress'

const flameVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }
`
const flameFragment = /* glsl */ `
  varying vec2 vUv;
  uniform float uGlow;
  uniform float uProgress;
  void main() {
    float x=vUv.x*55.0;
    float wave=sin(x*2.4+uProgress*100.0)*0.5+sin(x*4.3-uProgress*74.0)*0.25;
    float height=0.2+0.6*pow(max(0.0,sin(x+wave)),4.0);
    float y=abs(vUv.y*2.0-1.0);
    float alpha=smoothstep(height,0.0,y)*0.45*pow(max(0.0,sin(x+wave)),6.0);
    vec3 color=mix(vec3(1.0,0.08,0.005),vec3(1.0,0.73,0.18),pow(1.0-y,6.0));
    gl_FragColor=vec4(color*2.5,alpha*uGlow*smoothstep(0.0,0.1,vUv.x)*smoothstep(1.0,0.9,vUv.x));
  }
`

export function SlicedName({ progress }: { progress: ProgressRef }) {
  const upper = useRef<Group>(null), lower = useRef<Group>(null)
  const seamFlame = useRef<ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const font = new FontLoader().parse(fontData)
    const text = new TextGeometry('SHAAZ', { font, size: 2.35, depth: 0.2, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.026, bevelSize: 0.018, bevelSegments: 2 })
    text.computeBoundingBox()
    const box = text.boundingBox!
    const scale = 9.8 / (box.max.x - box.min.x)
    text.scale(scale, scale * 1.09, 1)
    text.computeBoundingBox()
    const b = text.boundingBox!
    text.translate(-(b.max.x + b.min.x) / 2, -(b.max.y + b.min.y) / 2, -0.1)
    return text
  }, [])

  const halves = useMemo(() => [1, -1].map(sign => {
    const base = new Plane(CUT_NORMAL.clone().multiplyScalar(sign), 0)
    const bodyPlane = base.clone()
    const seamA = base.clone(), seamB = new Plane(CUT_NORMAL.clone().multiplyScalar(-sign), 0.045)
    return {
      sign, base, bodyPlane, seamA, seamB,
      body: new MeshStandardMaterial({ color: '#d2c7b1', metalness: 0.66, roughness: 0.3, emissive: '#33271b', emissiveIntensity: 0.2, clippingPlanes: [bodyPlane], clipShadows: true, side: DoubleSide }),
      edge: new MeshStandardMaterial({ color: '#fff0b7', emissive: new Color(1, 0.28, 0.012), emissiveIntensity: 0, clippingPlanes: [seamA, seamB], toneMapped: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    }
  }), [])
  const uniforms = useMemo(() => ({ uGlow: { value: 0 }, uProgress: { value: 0 } }), [])

  useEffect(() => () => {
    geometry.dispose()
    halves.forEach(half => { half.body.dispose(); half.edge.dispose() })
  }, [geometry, halves])
  useFrame(() => {
    const p = progress.current
    const split = splitAt(p)
    ;[upper.current, lower.current].forEach((group, i) => {
      if (!group) return
      const half = halves[i]
      const distance = split.distance * half.sign
      group.position.copy(NAME_CENTER).addScaledVector(CUT_NORMAL, distance)
      group.rotation.set(half.sign * split.tilt * 0.35, -half.sign * split.tilt * 0.4, -half.sign * split.tilt)
      group.updateMatrixWorld(true)
      half.bodyPlane.copy(half.base).applyMatrix4(group.matrixWorld)
      half.seamA.copy(half.base).applyMatrix4(group.matrixWorld)
      half.seamB.set(CUT_NORMAL.clone().multiplyScalar(-half.sign), 0.045).applyMatrix4(group.matrixWorld)
      half.edge.emissiveIntensity = split.glow * 3.2
      half.edge.visible = split.glow > 0.01
    })
    if (seamFlame.current) {
      seamFlame.current.uniforms.uGlow.value = split.glow * (1 - Math.min(split.distance / 2.5, 1))
      seamFlame.current.uniforms.uProgress.value = p
    }
  })
  return <group name="sliced-name">
    {halves.map((half, i) => <group key={half.sign} ref={i === 0 ? upper : lower} name={i === 0 ? 'name-upper-half' : 'name-lower-half'}>
      <mesh geometry={geometry} material={half.body} />
      <mesh geometry={geometry} material={half.edge} />
    </group>)}
    <mesh position={[NAME_CENTER.x, NAME_CENTER.y, 0.15]} rotation={[0, 0, -Math.atan2(CUT_NORMAL.x, CUT_NORMAL.y)]} renderOrder={4}>
      <planeGeometry args={[10, 0.47]} />
      <shaderMaterial ref={seamFlame} uniforms={uniforms} vertexShader={flameVertex} fragmentShader={flameFragment} transparent blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>
}
