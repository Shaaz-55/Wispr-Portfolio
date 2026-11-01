import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BoxGeometry, CatmullRomCurve3, Group, InstancedMesh, Matrix4, MeshStandardMaterial, SphereGeometry, TubeGeometry, Vector2, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Blade } from './Blade'
import { Cloth } from './Cloth'
import { makeCharacterMaterials } from './proceduralMaterials'
import { FOREARM, LEFT_SHOULDER, poseAt, SHOULDER, UPPER_ARM } from './choreography'
import type { SceneLayout } from './choreography'
import type { ProgressRef } from './useScrollProgress'

export type CharacterProps = { progress: ProgressRef; layout: SceneLayout; frozen?: boolean }
const plateGeometry = new RoundedBoxGeometry(1, 1, 1, 3, 0.075)
const rivetGeometry = new SphereGeometry(0.021, 8, 6)
type Triple = [number, number, number]
type PlateProps = { position?: Triple; scale?: Triple; rotation?: Triple; material: MeshStandardMaterial }
function Plate(props: PlateProps) { return <mesh {...props} geometry={plateGeometry} /> }
function Rivets({ points, material }: { points: Triple[]; material: MeshStandardMaterial }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    points.forEach((point, i) => ref.current?.setMatrixAt(i, new Matrix4().makeTranslation(...point)))
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [points])
  return <instancedMesh ref={ref} args={[rivetGeometry, material, points.length]} />
}
function Thread({ points, material, radius = 0.008 }: { points: Triple[]; material: MeshStandardMaterial; radius?: number }) {
  const geometry = useMemo(() => new TubeGeometry(new CatmullRomCurve3(points.map(p => new Vector3(...p))), 28, radius, 5, false), [points, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <mesh geometry={geometry} material={material} />
}

// The rig's public input is CharacterProps. A future GLB adapter can consume
// the same poseAt() quaternions and replace this component in Scene.tsx.
export function Forgewalker({ progress, layout, frozen = false }: CharacterProps) {
  const hips = useRef<Group>(null), torso = useRef<Group>(null), head = useRef<Group>(null)
  const rs = useRef<Group>(null), re = useRef<Group>(null), rw = useRef<Group>(null)
  const ls = useRef<Group>(null), le = useRef<Group>(null), lw = useRef<Group>(null)
  const ll = useRef<Group>(null), rl = useRef<Group>(null), lk = useRef<Group>(null), rk = useRef<Group>(null)
  const resources = useMemo(makeCharacterMaterials, [])
  const hatRibs = useMemo(() => {
    const ribBox = new BoxGeometry(1, 1, 1)
    const ribs = Array.from({ length: 64 }, (_, i) => ribBox.clone().applyMatrix4(new Matrix4().makeRotationY(i / 64 * Math.PI * 2)
      .multiply(new Matrix4().makeTranslation(0.428, 0.169, 0)).multiply(new Matrix4().makeRotationZ(-0.394)).multiply(new Matrix4().makeScale(0.93, 0.008, 0.01))))
    const geometry = mergeGeometries(ribs)
    ribs.forEach(rib => rib.dispose())
    ribBox.dispose()
    return geometry
  }, [])
  const m = resources.materials
  useEffect(() => resources.dispose, [resources])
  useEffect(() => () => hatRibs.dispose(), [hatRibs])
  useFrame(() => {
    const pose = poseAt(progress.current, layout)
    if (!hips.current || !torso.current || !head.current) return
    hips.current.position.set(pose.x, pose.y, pose.z)
    hips.current.scale.setScalar(pose.scale)
    hips.current.rotation.set(0, pose.hipY, pose.hipZ)
    torso.current.rotation.set(0, pose.torsoY, pose.torsoZ)
    head.current.rotation.set(0, pose.headY, pose.headZ)
    rs.current?.quaternion.copy(pose.arm.shoulder)
    re.current?.quaternion.copy(pose.arm.elbow)
    rw.current?.quaternion.copy(pose.arm.wrist)
    ls.current?.quaternion.copy(pose.leftArm.shoulder)
    le.current?.quaternion.copy(pose.leftArm.elbow)
    lw.current?.quaternion.copy(pose.leftArm.wrist)
    if (ll.current) ll.current.rotation.z = pose.leftLeg
    if (rl.current) rl.current.rotation.z = pose.rightLeg
    if (lk.current) lk.current.rotation.z = pose.leftKnee
    if (rk.current) rk.current.rotation.z = pose.rightKnee
  })
  const armArmor = <>{[0, 1, 2].map(i => <group key={i} position={[0, -i * 0.16, 0]}>
    <mesh material={m.armor} scale={[1, 0.8, 1]}><sphereGeometry args={[0.34 - i * 0.022, 20, 12, 0, Math.PI * 2, i ? Math.PI * 0.3 : 0, Math.PI * (i ? 0.38 : 0.6)]} /></mesh>
    <mesh material={m.edge} position={[0, -0.095, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.30 - i * 0.022, 0.012, 6, 24]} /></mesh>
  </group>)}
    <mesh position={[0, -0.47, 0]} material={m.dark}><capsuleGeometry args={[0.175, 0.31, 5, 12]} /></mesh>
    <Plate position={[0, -0.52, 0.13]} scale={[0.34, 0.34, 0.25]} material={m.armor} />
  </>
  const forearm = <>
    <mesh position={[0, -0.31, 0]} material={m.leather}><capsuleGeometry args={[0.15, 0.38, 5, 12]} /></mesh>
    <Plate material={m.armor} position={[0, -0.31, 0.1]} scale={[0.33, 0.6, 0.29]} rotation={[-0.08, 0, 0]} />
    {[0, 1].map(i => <mesh key={i} position={[0, -0.09 - i * 0.43, 0]} material={m.bronze}><cylinderGeometry args={[0.185, 0.18, 0.035, 16]} /></mesh>)}
    <Rivets material={m.edge} points={[[-0.115, -0.08, 0.25], [0.115, -0.08, 0.25], [-0.1, -0.53, 0.25], [0.1, -0.53, 0.25]]} />
  </>
  const hand = <><Plate material={m.leather} scale={[0.235, 0.27, 0.24]} />
    {[0, 1, 2, 3].map(i => <Plate key={i} material={m.armor} position={[-0.077 + i * 0.051, -0.03, 0.131]} scale={[0.043, 0.18, 0.06]} />)}
  </>
  const leg = (side: number) => <>
    <mesh position={[0, -0.39, 0]} material={m.dark}><capsuleGeometry args={[0.195, 0.43, 6, 14]} /></mesh>
    <Plate material={m.leather} position={[0, -0.3, -0.05]} scale={[0.39, 0.51, 0.36]} />
    <group ref={side < 0 ? lk : rk} position={[0, -0.83, 0]}>
      <mesh material={m.dark}><sphereGeometry args={[0.21, 12, 10]} /></mesh>
      <Plate material={m.armor} position={[0, 0, 0.12]} scale={[0.38, 0.3, 0.3]} rotation={[0, 0, Math.PI / 8]} />
      <Plate material={m.edge} position={[0, 0.01, 0.275]} scale={[0.035, 0.26, 0.015]} />
      <mesh position={[0, -0.43, 0]} material={m.leather}><capsuleGeometry args={[0.135, 0.51, 5, 12]} /></mesh>
      <Plate material={m.armor} position={[0, -0.44, 0.07]} scale={[0.315, 0.7, 0.31]} rotation={[-0.04, 0, 0]} />
      <Plate material={m.edge} position={[0, -0.44, 0.226]} scale={[0.025, 0.59, 0.02]} />
      {[0, 1].map(i => <Plate key={i} material={m.bronze} position={[0, -0.2 - i * 0.45, 0.23]} scale={[0.32, 0.035, 0.035]} />)}
      <Plate material={m.leather} position={[0, -0.89, 0.16]} scale={[0.37, 0.23, 0.7]} />
      {[0, 1, 2].map(i => <Plate key={i} material={m.armor} position={[0, -0.8 - i * 0.034, 0.08 + i * 0.16]} scale={[0.345, 0.11, 0.26]} rotation={[-0.16, 0, 0]} />)}
    </group>
  </>
  return <group ref={hips} name="forgewalker-hips">
    <mesh position={[0, 0.35, 0]} material={m.dark} scale={[1, 1, 0.73]}><cylinderGeometry args={[0.35, 0.4, 0.4, 24]} /></mesh>
    <mesh material={m.leather} scale={[1, 1, 0.73]}><cylinderGeometry args={[0.43, 0.47, 0.4, 24]} /></mesh>
    <mesh position={[0, 0.14, 0]} material={m.cloth} scale={[1, 1, 0.73]}><cylinderGeometry args={[0.49, 0.49, 0.21, 24]} /></mesh>
    {[0, 1, 2].map(i => <mesh key={i} position={[0, 0.055 + i * 0.065, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.74, 1]} material={m.rope}><torusGeometry args={[0.49, 0.038, 8, 36]} /></mesh>)}
    <Thread material={m.rope} radius={0.035} points={[[-0.08, 0.16, 0.39], [-0.21, 0.04, 0.46], [-0.06, -0.04, 0.43], [0.13, 0.09, 0.44], [0, 0.16, 0.43], [-0.1, -0.39, 0.47]]} />
    {[-1, 1].map(side => <group key={side} position={[side * 0.43, -0.08, 0.04]} rotation={[0, side * -0.22, side * 0.12]}>
      {[0, 1, 2, 3].map(i => <group key={i}>
        <Plate material={m.armor} position={[0, -i * 0.21, 0.12]} scale={[0.42 + i * 0.02, 0.27, 0.38]} rotation={[i * 0.022, 0, 0]} />
        <Plate material={m.edge} position={[0, -i * 0.21 - 0.115, 0.32]} scale={[0.43 + i * 0.02, 0.025, 0.025]} />
        <Rivets material={m.bronze} points={[[-0.15, -i * 0.21, 0.322], [0.15, -i * 0.21, 0.322]]} />
      </group>)}
    </group>)}
    <group position={[-0.035, 0.05, 0.43]}><Cloth progress={progress} material={m.cloth} length={1.43} width={0.4} vertical /></group>
    <group position={[0.14, 0.02, 0.4]} rotation={[0, 0.1, 0.12]}><Cloth progress={progress} material={m.cloth} length={1.21} width={0.22} vertical phase={2} /></group>
    <group ref={ll} position={[-0.28, -0.18, 0]}>{leg(-1)}</group>
    <group ref={rl} position={[0.28, -0.18, 0]}>{leg(1)}</group>
    <group ref={torso} position={[0, 0.45, 0]} name="forgewalker-torso">
      <mesh position={[0, 0.57, 0]} material={m.dark}><capsuleGeometry args={[0.39, 0.56, 8, 20]} /></mesh>
      <mesh material={m.armor} scale={[1, 1, 0.76]}>
        <latheGeometry args={[[new Vector2(0.34, 0.02), new Vector2(0.40, 0.15), new Vector2(0.46, 0.4), new Vector2(0.51, 0.85), new Vector2(0.49, 1.12), new Vector2(0.32, 1.25)], 40]} />
      </mesh>
      {[-1, 1].map(side => <Thread key={side} material={m.bronze} radius={0.018} points={[[side * 0.45, 1.1, 0.21], [side * 0.4, 0.83, 0.31], [side * 0.32, 0.65, 0.34], [0, 0.52, 0.365]]} />)}
      {[0, 1, 2].map(i => <Plate key={i} material={m.armor} position={[0, 0.3 - i * 0.115, 0.17]} scale={[0.78 - i * 0.035, 0.17, 0.34]} />)}
      <Thread material={m.ember} radius={0.005} points={[[0.1, 1.0, 0.377], [0.02, 0.89, 0.398], [0.065, 0.80, 0.407], [-0.02, 0.65, 0.404], [-0.12, 0.59, 0.39]]} />
      <Thread material={m.ember} radius={0.004} points={[[0.035, 0.87, 0.403], [0.14, 0.81, 0.393], [0.22, 0.68, 0.36]]} />
      <Thread material={m.edge} radius={0.003} points={[[-0.29, 0.98, 0.31], [-0.2, 0.9, 0.36], [-0.18, 0.76, 0.373]]} />
      <group ref={head} position={[0, 1.52, 0]} name="forgewalker-head">
        <mesh name="character-face" position={[0, 0.02, 0]} material={m.skin} scale={[0.88, 1, 0.88]}><capsuleGeometry args={[0.26, 0.18, 8, 20]} /></mesh>
        <mesh position={[0, 0.1, -0.1]} material={m.hair} scale={[1, 1.05, 0.83]}><sphereGeometry args={[0.28, 20, 12]} /></mesh>
        <mesh material={m.hair} position={[0, -0.14, 0.09]} scale={[1, 0.85, 0.75]}><sphereGeometry args={[0.205, 18, 12]} /></mesh>
        <mesh material={m.skin} position={[0, 0.015, 0.245]} scale={[0.075, 0.145, 0.14]} rotation={[0.12, 0, 0]}><sphereGeometry args={[0.5, 16, 12]} /></mesh>
        {[-1, 1].map(side => <group key={side}>
          <Plate material={m.hair} position={[side * 0.11, 0.09, 0.216]} scale={[0.14, 0.035, 0.07]} rotation={[0, 0, side * 0.08]} />
          <mesh material={m.skin} position={[side * 0.11, -0.035, 0.215]} scale={[0.13, 0.1, 0.075]}><sphereGeometry args={[0.5, 14, 10]} /></mesh>
          <Plate material={m.armor} position={[side * 0.265, -0.08, -0.03]} scale={[0.06, 0.32, 0.28]} rotation={[0, 0, side * 0.14]} />
        </group>)}
        <group position={[0, 0.42, 0]} rotation={[0.28, 0, -0.05]}>
          <mesh material={m.straw} position={[0, 0.16, 0]}><coneGeometry args={[0.87, 0.36, 64]} /></mesh>
          <mesh material={m.hair} position={[0, -0.028, 0]}><cylinderGeometry args={[0.88, 0.87, 0.023, 64]} /></mesh>
          <mesh geometry={hatRibs} material={m.strawRib} />
          {[0.25, 0.43, 0.63, 0.83].map(r => <mesh key={r} material={m.rope} position={[0, 0.34 - r / 0.87 * 0.36, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[r, 0.006, 5, 64]} /></mesh>)}
        </group>
        <mesh position={[0, -0.27, 0.01]} material={m.cloth} rotation={[Math.PI / 2, 0, -0.15]}><torusGeometry args={[0.28, 0.095, 12, 28]} /></mesh>
        <mesh position={[0, -0.25, 0.015]} material={m.cloth}><cylinderGeometry args={[0.3, 0.28, 0.2, 24]} /></mesh>
        <group position={[0.2, -0.18, -0.12]} rotation={[0, -0.25, 0.04]}><Cloth progress={progress} material={m.cloth} length={2.12} width={0.34} /></group>
        <group position={[0.2, -0.28, -0.15]} rotation={[0, -0.1, -0.28]}><Cloth progress={progress} material={m.cloth} length={1.87} width={0.31} phase={1.7} /></group>
      </group>
      <group ref={rs} position={SHOULDER.toArray()} name="right-shoulder">
        {armArmor}
        <group ref={re} position={[0, -UPPER_ARM, 0]} name="right-elbow">
          <mesh material={m.leather}><sphereGeometry args={[0.165, 12, 10]} /></mesh>
          {forearm}
          <group ref={rw} position={[0, -FOREARM, 0]} name="right-wrist">{hand}<Blade progress={progress} layout={layout} frozen={frozen} /></group>
        </group>
      </group>
      <group ref={ls} position={LEFT_SHOULDER.toArray()} name="left-shoulder">
        {armArmor}
        <group ref={le} position={[0, -UPPER_ARM, 0]} name="left-elbow">
          <mesh material={m.leather}><sphereGeometry args={[0.165, 12, 10]} /></mesh>
          {forearm}
          <group ref={lw} position={[0, -FOREARM, 0]} name="left-wrist">{hand}</group>
        </group>
      </group>
    </group>
  </group>
}
