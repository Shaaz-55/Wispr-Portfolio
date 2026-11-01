import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { Color, Mesh, MeshBasicMaterial, NoToneMapping, PerspectiveCamera, PMREMGenerator, PointLight, Vector3 } from 'three'
import type { Camera, Object3D } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { BloomEffect } from 'postprocessing'
import { Forgewalker } from './Forgewalker'
import type { CharacterProps } from './Forgewalker'
import { SlicedName } from './SlicedName'
import { FireTrail } from './FireTrail'
import { Sparks } from './Sparks'
import { BLADE_LENGTH, CAMERA_DISTANCE, CAMERA_FOV, CUT_NORMAL_WORLD, bladePointAt, cameraAt, cutPointAt, cutStateAt, flashAt, layoutForViewport, slashTipAt, smoothstep } from './choreography'
import type { RenderStats, ScreenBounds } from './diagnostics'
import type { SceneLayout } from './choreography'
import type { ProgressRef } from './useScrollProgress'

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

function RenderControl({ active }: { active: boolean }) {
  const setFrameloop = useThree(state => state.setFrameloop)
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    setFrameloop(active ? 'always' : 'never')
    if (active) invalidate()
  }, [active, invalidate, setFrameloop])
  return null
}

function screenPoint(point: Vector3, camera: Camera, size: { width: number; height: number }) {
  const projected = point.clone().project(camera)
  return [(projected.x + 1) * size.width / 2, (1 - projected.y) * size.height / 2]
}

// Verification inspects the actual rendered meshes and joint transforms.
function screenBounds(object: Object3D, camera: Camera, size: { width: number; height: number }, excludeBlade = false): ScreenBounds {
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
  const point = new Vector3()
  const visit = (node: Object3D) => {
    if (excludeBlade && node.name === 'blade-energy') return
    if (node instanceof Mesh) {
      const positions = node.geometry.attributes.position
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).project(camera)
        const x = (point.x + 1) * size.width / 2, y = (1 - point.y) * size.height / 2
        bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x)
        bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y)
      }
    }
    node.children.forEach(visit)
  }
  visit(object)
  return bounds
}

function frontFaceSamples(mesh: Mesh, camera: Camera, size: { width: number; height: number }) {
  const positions = mesh.geometry.attributes.position, normals = mesh.geometry.attributes.normal
  const samples: number[][] = [], a = new Vector3(), b = new Vector3(), c = new Vector3()
  for (let i = 0; i < positions.count; i += 3) {
    if (positions.getZ(i) < 0 || normals.getZ(i) < 0.999) continue
    a.fromBufferAttribute(positions, i); b.fromBufferAttribute(positions, i + 1); c.fromBufferAttribute(positions, i + 2)
    if (b.clone().sub(a).cross(c.clone().sub(a)).length() < 0.005) continue
    samples.push(screenPoint(a.add(b).add(c).divideScalar(3).applyMatrix4(mesh.matrixWorld), camera, size))
  }
  return samples
}

function World({ progress, mobile, frozen, onReady, CharacterModel }: { progress: ProgressRef; mobile: boolean; frozen: boolean; onReady: () => void; CharacterModel: ComponentType<CharacterProps> }) {
  const { viewport, size, gl, scene } = useThree()
  useEffect(() => {
    const generator = new PMREMGenerator(gl), room = new RoomEnvironment()
    const environment = generator.fromScene(room, 0.04)
    scene.environment = environment.texture
    scene.environmentIntensity = 0.55
    room.dispose(); generator.dispose()
    return () => { scene.environment = null; environment.dispose() }
  }, [gl, scene])
  const layout = useMemo(() => {
    const reference = new PerspectiveCamera(CAMERA_FOV, size.width / size.height)
    reference.position.set(0, 0, CAMERA_DISTANCE)
    return layoutForViewport(viewport.getCurrentViewport(reference, new Vector3(), size), mobile)
  }, [viewport, size, mobile])
  const bloom = useRef<BloomEffect>(null)
  const impact = useRef<PointLight>(null)
  const ready = useRef(false)
  const diagnostics = useRef<{ p: number; layout: SceneLayout; screen: RenderStats['screen'] } | null>(null)
  useFrame(({ camera, gl }) => {
    gl.info.reset()
    const p = progress.current
    const frame = cameraAt(p, size.width / size.height, mobile)
    camera.position.set(frame.x, frame.y, frame.z)
    camera.lookAt(frame.targetX, frame.targetY, 0)
    camera.updateMatrixWorld()
    if (bloom.current) bloom.current.intensity = 0.36 + smoothstep(0.28, 0.36, p) * 0.13 + flashAt(p) * 0.4
    if (impact.current) {
      impact.current.position.copy(slashTipAt(p, layout)).z += 0.4
      impact.current.intensity = flashAt(p) * 30 + (p >= 0.36 && p <= 0.5 ? 5 : 0)
    }
    if (!ready.current && gl.info.render.frame > 3) {
      ready.current = true
      onReady()
    }
  }, -1)
  useFrame(({ gl, camera, scene }) => {
    if (!window.__portfolio) return
    const character = scene.getObjectByName('forgewalker-hips')!
    const name = scene.getObjectByName('name-white-text') as Mesh
    const material = (name.material as MeshBasicMaterial[])[0]
    const sparks = scene.getObjectByName('gpu-spark-streaks') as Mesh
    if (frozen && (diagnostics.current?.p !== progress.current || diagnostics.current?.layout !== layout)) {
      diagnostics.current = { p: progress.current, layout, screen: {
        name: screenBounds(name, camera, size),
        frontFaceSamples: frontFaceSamples(name, camera, size),
        character: screenBounds(character, camera, size, true),
        face: screenBounds(scene.getObjectByName('character-face')!, camera, size),
        blade: screenBounds(scene.getObjectByName('blade-core')!, camera, size),
        nameCenter: screenPoint(layout.nameCenter, camera, size),
        characterOrigin: screenPoint(character.getWorldPosition(new Vector3()), camera, size),
        bladeBase: screenPoint(scene.getObjectByName('blade-base')!.getWorldPosition(new Vector3()), camera, size),
        bladeTip: screenPoint(scene.getObjectByName('blade-tip')!.getWorldPosition(new Vector3()), camera, size),
        cutStart: screenPoint(cutPointAt(-layout.cutExtent, layout), camera, size),
        cutEnd: screenPoint(cutPointAt(layout.cutExtent, layout), camera, size),
        cutNormal: CUT_NORMAL_WORLD.toArray(),
        trail: Array.from({ length: 7 }, (_, i) => screenPoint(bladePointAt(Math.max(0.36, Math.min(0.5, progress.current - i * 0.0035)), BLADE_LENGTH, new Vector3(), layout), camera, size)),
        sparkOrigins: Array.from({ length: 12 }, (_, i) => screenPoint(new Vector3().fromArray(sparks.userData.data.origins, i * 3), camera, size)),
      } }
    }
    window.__portfolio.render = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      points: gl.info.render.points,
      frame: gl.info.render.frame,
      dpr: gl.getPixelRatio(),
      viewport: [size.width, size.height],
      camera: camera.position.toArray(),
      character: character.position.toArray(),
      upperHalf: scene.getObjectByName('name-upper-half')?.position.toArray(),
      lowerHalf: scene.getObjectByName('name-lower-half')?.position.toArray(),
      background: (scene.background as Color).getHexString(),
      clearColor: gl.getClearColor(new Color()).getHexString(),
      fog: Boolean(scene.fog),
      nameLines: name.geometry.userData.lines,
      nameMaterial: { type: material.type, color: material.color.getHexString(), toneMapped: material.toneMapped },
      cut: cutStateAt(progress.current, layout),
      sparks: { count: sparks.userData.count, live: sparks.userData.live, visible: sparks.userData.visible, primitive: sparks.userData.primitive },
      screen: diagnostics.current?.screen,
    }
  }, 2)

  return <>
    <color attach="background" args={['#000000']} />
    <ambientLight intensity={0.25} color="#ffffff" />
    <hemisphereLight args={['#dce7fb', '#11100f', 0.55]} />
    <directionalLight position={[-4, 6, 7]} color="#e7efff" intensity={3.2} />
    <directionalLight position={[5, 4, -3]} color="#ffffff" intensity={5} />
    <directionalLight position={[-5, 2, -2]} color="#c6d8ed" intensity={2.1} />
    <pointLight ref={impact} color="#ff901d" intensity={0} distance={12} />
    <SlicedName progress={progress} layout={layout} />
    <CharacterModel progress={progress} layout={layout} frozen={frozen} />
    <FireTrail progress={progress} layout={layout} />
    <Sparks progress={progress} layout={layout} mobile={mobile} />
    <EffectComposer multisampling={mobile ? 2 : 4} enableNormalPass={false}>
      <Bloom ref={bloom} intensity={0.4} luminanceThreshold={1.05} luminanceSmoothing={0.05} mipmapBlur radius={0.45} levels={5} resolutionScale={mobile ? 0.5 : 0.75} />
    </EffectComposer>
  </>
}

type SceneProps = { progress: ProgressRef; active: boolean; mobile: boolean; frozen: boolean; onReady: () => void; onError: () => void; characterModel?: ComponentType<CharacterProps> }
export default function Scene({ progress, active, mobile, frozen, onReady, onError, characterModel = Forgewalker }: SceneProps) {
  return <SceneBoundary onError={onError}>
    <Canvas
      dpr={[1, mobile ? 1.3 : 1.75]}
      camera={{ position: [0, 0, CAMERA_DISTANCE], fov: CAMERA_FOV, near: 0.1, far: 60 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: frozen, toneMapping: NoToneMapping }}
      onCreated={({ gl, scene }) => {
        gl.localClippingEnabled = true
        gl.info.autoReset = false
        gl.setClearColor(new Color('#000000'), 1)
        gl.toneMapping = NoToneMapping
        scene.background = new Color('#000000')
        scene.fog = null
        gl.domElement.addEventListener('webglcontextlost', onError, { once: true })
      }}
      fallback={null}
    >
      <RenderControl active={active} />
      <Suspense fallback={null}><World progress={progress} mobile={mobile} frozen={frozen} onReady={onReady} CharacterModel={characterModel} /></Suspense>
    </Canvas>
  </SceneBoundary>
}
