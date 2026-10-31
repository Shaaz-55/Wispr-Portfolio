import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, Group, MeshStandardMaterial } from 'three'
import { Blade } from './Blade'
import { FOREARM, poseAt, SHOULDER, UPPER_ARM } from './choreography'
import type { ProgressRef } from './useScrollProgress'

function Scarf({ frozen }: { frozen: boolean }) {
  const geometry = useMemo(() => {
    const geo = new BufferGeometry()
    const vertices = new Float32Array(25 * 2 * 3)
    const indices: number[] = []
    for (let i = 0; i < 24; i++) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
    geo.setAttribute('position', new BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    return geo
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ clock }) => {
    const time = frozen ? 0 : clock.elapsedTime
    const positions = geometry.attributes.position
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      const wave = Math.sin(t * 9 - time * 2.2) * t * 0.16
      for (let side = 0; side < 2; side++) positions.setXYZ(i * 2 + side, -t * 2.12, -t * 0.18 + wave + (side - 0.5) * (0.24 - t * 0.07), 0.1 + t * 0.35 + Math.sin(t * 8 - time * 1.8) * t * 0.1)
    }
    positions.needsUpdate = true
    geometry.computeVertexNormals()
  })
  return <mesh geometry={geometry} frustumCulled={false}>
    <meshStandardMaterial color="#8c3023" roughness={0.93} side={DoubleSide} />
  </mesh>
}

type PlateProps = { position?: [number, number, number]; scale?: [number, number, number]; rotation?: [number, number, number]; material: MeshStandardMaterial }
function Plate({ position, scale, rotation, material }: PlateProps) {
  return <mesh position={position} scale={scale} rotation={rotation} material={material} castShadow>
    <boxGeometry args={[1, 1, 1]} />
  </mesh>
}

export function Forgewalker({ progress, frozen = false }: { progress: ProgressRef; frozen?: boolean }) {
  const hips = useRef<Group>(null)
  const torso = useRef<Group>(null)
  const head = useRef<Group>(null)
  const rs = useRef<Group>(null), re = useRef<Group>(null), rw = useRef<Group>(null)
  const ls = useRef<Group>(null), le = useRef<Group>(null), lw = useRef<Group>(null)
  const ll = useRef<Group>(null), rl = useRef<Group>(null)
  const lk = useRef<Group>(null), rk = useRef<Group>(null)
  const materials = useMemo(() => ({
    armor: new MeshStandardMaterial({ color: '#30312f', metalness: 0.8, roughness: 0.34 }),
    dark: new MeshStandardMaterial({ color: '#151715', metalness: 0.55, roughness: 0.55 }),
    bronze: new MeshStandardMaterial({ color: '#ab7f45', metalness: 0.8, roughness: 0.35 }),
    seam: new MeshStandardMaterial({ color: '#ffb14a', emissive: '#ff7418', emissiveIntensity: 2.5, toneMapped: false }),
    cloth: new MeshStandardMaterial({ color: '#692820', roughness: 0.9 }),
  }), [])
  useEffect(() => () => Object.values(materials).forEach(material => material.dispose()), [materials])

  useFrame(() => {
    const p = poseAt(progress.current)
    if (!hips.current || !torso.current || !head.current) return
    hips.current.position.set(p.x, p.y, p.z)
    hips.current.rotation.z = p.hipZ
    torso.current.rotation.set(0, p.torsoY, p.torsoZ)
    head.current.rotation.z = p.headZ
    if (rs.current) rs.current.rotation.z = p.rightShoulder
    if (re.current) re.current.rotation.z = p.rightElbow
    if (rw.current) rw.current.rotation.z = p.rightWrist
    if (ls.current) ls.current.rotation.z = p.leftShoulder
    if (le.current) le.current.rotation.z = p.leftElbow
    if (lw.current) lw.current.rotation.z = p.leftWrist
    if (ll.current) ll.current.rotation.z = p.leftLeg
    if (rl.current) rl.current.rotation.z = p.rightLeg
    if (lk.current) lk.current.rotation.z = p.leftKnee
    if (rk.current) rk.current.rotation.z = p.rightKnee
  })

  const forearm = (right: boolean) => <>
    <mesh position={[0, -0.27, 0]} material={materials.dark}><capsuleGeometry args={[0.16, 0.32, 3, 8]} /></mesh>
    <Plate material={materials.armor} position={[0, -0.29, 0.08]} scale={[0.36, 0.52, 0.29]} rotation={[0.08, 0, right ? -0.06 : 0.06]} />
    <Plate material={materials.bronze} position={[0, -0.48, 0.1]} scale={[0.38, 0.05, 0.33]} />
    <Plate material={materials.seam} position={[0, -0.28, 0.233]} scale={[0.025, 0.4, 0.018]} />
  </>

  const leg = (side: number) => <>
    <mesh position={[0, -0.37, 0]} material={materials.dark}><capsuleGeometry args={[0.18, 0.42, 4, 8]} /></mesh>
    <Plate material={materials.armor} position={[0, -0.34, 0.09]} scale={[0.4, 0.61, 0.35]} rotation={[0.08, 0, side * 0.06]} />
    <Plate material={materials.bronze} position={[0, -0.1, 0.27]} scale={[0.36, 0.05, 0.025]} />
    <group ref={side < 0 ? lk : rk} position={[0, -0.77, 0]}>
      <mesh material={materials.bronze}><sphereGeometry args={[0.22, 8, 6]} /></mesh>
      <Plate material={materials.armor} position={[0, -0.42, 0.03]} scale={[0.33, 0.68, 0.36]} rotation={[-0.05, 0, 0]} />
      <Plate material={materials.seam} position={[0, -0.41, 0.22]} scale={[0.024, 0.51, 0.018]} />
      <Plate material={materials.dark} position={[0, -0.81, 0.15]} scale={[0.4, 0.22, 0.68]} />
      <Plate material={materials.bronze} position={[0, -0.77, 0.42]} scale={[0.41, 0.06, 0.09]} />
    </group>
  </>

  return <group ref={hips} name="forgewalker-hips">
    <Plate material={materials.dark} scale={[0.85, 0.45, 0.52]} />
    <Plate material={materials.bronze} position={[0, 0.22, 0.08]} scale={[0.94, 0.13, 0.61]} />
    <Plate material={materials.seam} position={[0, 0.23, 0.395]} scale={[0.15, 0.095, 0.025]} />
    {[-1, 1].map(side => <group key={side} position={[side * 0.5, 0, 0]} rotation={[0, 0, side * 0.18]}>
      {[0, 1, 2].map(i => <Plate key={i} material={materials.armor} position={[0, -i * 0.23, 0.17]} scale={[0.36 + i * 0.03, 0.31, 0.42]} rotation={[i * 0.03, 0, 0]} />)}
      <Plate material={materials.bronze} position={[0, -0.55, 0.39]} scale={[0.42, 0.04, 0.025]} />
    </group>)}
    <group ref={ll} position={[-0.28, -0.18, 0]}>{leg(-1)}</group>
    <group ref={rl} position={[0.28, -0.18, 0]}>{leg(1)}</group>
    <group ref={torso} position={[0, 0.45, 0]} name="forgewalker-torso">
      <mesh position={[0, 0.55, 0]} material={materials.dark}><capsuleGeometry args={[0.42, 0.58, 4, 8]} /></mesh>
      {[-1, 1].map(side => <group key={side}>
        <Plate material={materials.armor} position={[side * 0.255, 0.83, 0.17]} scale={[0.5, 0.62, 0.48]} rotation={[0.06, side * 0.18, side * 0.07]} />
        <Plate material={materials.bronze} position={[side * 0.25, 1.1, 0.41]} scale={[0.43, 0.045, 0.045]} rotation={[0, 0, side * 0.1]} />
        <Plate material={materials.seam} position={[side * 0.053, 0.78, 0.437]} scale={[0.025, 0.59, 0.02]} rotation={[0, 0, side * 0.12]} />
      </group>)}
      {[0, 1, 2].map(i => <Plate key={i} material={materials.armor} position={[0, 0.37 - i * 0.14, 0.23]} scale={[0.77 - i * 0.035, 0.17, 0.36]} />)}
      <Plate material={materials.bronze} position={[0, 0.56, 0.48]} scale={[0.18, 0.18, 0.065]} rotation={[0, 0, Math.PI / 4]} />
      <group ref={head} position={[0, 1.55, 0]} name="forgewalker-head">
        <mesh position={[0, 0.07, 0]} material={materials.dark}><capsuleGeometry args={[0.29, 0.23, 4, 12]} /></mesh>
        <Plate material={materials.armor} position={[0, 0.01, 0.245]} scale={[0.48, 0.3, 0.16]} rotation={[0.15, 0, 0]} />
        <Plate material={materials.seam} position={[0, 0.12, 0.337]} scale={[0.39, 0.024, 0.018]} />
        <Plate material={materials.bronze} position={[0, -0.08, 0.333]} scale={[0.045, 0.19, 0.025]} />
        <mesh position={[0, 0.52, 0]} material={materials.armor} rotation={[0, Math.PI / 12, 0.05]}><coneGeometry args={[1.0, 0.43, 32]} /></mesh>
        <mesh position={[0, 0.304, 0]} material={materials.bronze} rotation={[0, 0, 0.05]}><cylinderGeometry args={[1.005, 1.02, 0.028, 32]} /></mesh>
        <mesh position={[0, 0.278, 0]} material={materials.dark} rotation={[0, 0, 0.05]}><coneGeometry args={[0.99, 0.16, 32]} /></mesh>
        {Array.from({ length: 12 }, (_, i) => <group key={i} rotation={[0, (i / 12) * Math.PI * 2, 0.05]}>
          <Plate material={materials.bronze} position={[0.46, 0.52, 0]} scale={[1.03, 0.013, 0.013]} rotation={[0, 0, -0.406]} />
        </group>)}
        <mesh position={[0, -0.26, 0.015]} material={materials.cloth}><cylinderGeometry args={[0.34, 0.3, 0.22, 10]} /></mesh>
        <group position={[-0.25, -0.22, -0.08]}><Scarf frozen={frozen} /></group>
      </group>
      <group ref={rs} position={[SHOULDER.x, SHOULDER.y, SHOULDER.z]} name="right-shoulder">
        <mesh material={materials.bronze}><sphereGeometry args={[0.25, 10, 8]} /></mesh>
        <Plate material={materials.armor} position={[0.02, 0.02, 0.05]} scale={[0.6, 0.31, 0.59]} rotation={[0, 0, -0.12]} />
        <Plate material={materials.bronze} position={[0.12, -0.1, 0.35]} scale={[0.45, 0.035, 0.03]} />
        <mesh position={[0, -0.41, 0]} material={materials.armor}><capsuleGeometry args={[0.18, 0.34, 3, 8]} /></mesh>
        <group ref={re} position={[0, -UPPER_ARM, 0]} name="right-elbow">
          <mesh material={materials.bronze}><sphereGeometry args={[0.18, 8, 6]} /></mesh>
          {forearm(true)}
          <group ref={rw} position={[0, -FOREARM, 0]} name="right-wrist">
            <Plate material={materials.dark} scale={[0.23, 0.25, 0.24]} />
            <Blade progress={progress} frozen={frozen} />
          </group>
        </group>
      </group>
      <group ref={ls} position={[-0.7, 1.11, 0.05]} name="left-shoulder">
        <mesh material={materials.bronze}><sphereGeometry args={[0.25, 10, 8]} /></mesh>
        <Plate material={materials.armor} position={[-0.03, 0.03, 0.04]} scale={[0.62, 0.33, 0.61]} rotation={[0, 0, 0.16]} />
        <mesh position={[0, -0.42, 0]} material={materials.armor}><capsuleGeometry args={[0.18, 0.35, 3, 8]} /></mesh>
        <group ref={le} position={[0, -UPPER_ARM, 0]} name="left-elbow">
          <mesh material={materials.bronze}><sphereGeometry args={[0.18, 8, 6]} /></mesh>
          {forearm(false)}
          <group ref={lw} position={[0, -FOREARM, 0]} name="left-wrist">
            <Plate material={materials.dark} scale={[0.24, 0.28, 0.25]} />
          </group>
        </group>
      </group>
    </group>
  </group>
}
