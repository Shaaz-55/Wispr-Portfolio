import { Component, Suspense, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Color, DirectionalLight, Fog, PointLight } from 'three'
import { BloomEffect } from 'postprocessing'
import { Forgewalker } from './Forgewalker'
import { SlicedName } from './SlicedName'
import { FireTrail } from './FireTrail'
import { Sparks } from './Sparks'
import { Embers } from './Embers'
import HeatShimmer from './HeatShimmer'
import { cameraAt, flashAt, smoothstep } from './choreography'
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

function World({ progress, mobile, frozen, onReady }: { progress: ProgressRef; mobile: boolean; frozen: boolean; onReady: () => void }) {
  const bloom = useRef<BloomEffect>(null)
  const impact = useRef<PointLight>(null)
  const rim = useRef<DirectionalLight>(null)
  const ready = useRef(false)
  useFrame(({ camera, size, gl, scene }) => {
    gl.info.reset()
    const p = progress.current
    const frame = cameraAt(p, size.width / size.height)
    const framingDistance = cameraAt(0, size.width / size.height).z
    if (scene.fog instanceof Fog) {
      scene.fog.near = framingDistance + 0.8
      scene.fog.far = framingDistance + 20.8
    }
    camera.position.set(frame.x, frame.y, frame.z)
    camera.lookAt(frame.targetX, frame.targetY, 0)
    if (bloom.current) bloom.current.intensity = 0.42 + smoothstep(0.12, 0.32, p) * 0.4 + flashAt(p) * 0.4
    if (impact.current) impact.current.intensity = flashAt(p) * 38
    if (rim.current) rim.current.intensity = 2.1 + smoothstep(0.12, 0.3, p) * 0.8
    if (!ready.current && gl.info.render.frame > 3) {
      ready.current = true
      onReady()
    }
  })
  useFrame(({ gl, camera, scene }) => {
    if (window.__portfolio) {
      window.__portfolio.render = {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        points: gl.info.render.points,
        frame: gl.info.render.frame,
        dpr: gl.getPixelRatio(),
        fog: scene.fog instanceof Fog ? [scene.fog.near, scene.fog.far] : undefined,
        camera: camera.position.toArray(),
        character: scene.getObjectByName('forgewalker-hips')?.position.toArray(),
        upperHalf: scene.getObjectByName('name-upper-half')?.position.toArray(),
        lowerHalf: scene.getObjectByName('name-lower-half')?.position.toArray(),
      }
    }
  }, 2)

  return <>
    <color attach="background" args={['#11100e']} />
    <fog attach="fog" args={['#11100e', 14, 34]} />
    <ambientLight intensity={0.8} color="#e7d6bb" />
    <hemisphereLight args={['#ead8b7', '#342010', 1.25]} />
    <directionalLight position={[-4, 6, 7]} color="#fff1cd" intensity={3.3} />
    <directionalLight position={[6, 2, 4]} color="#cbd3d3" intensity={2} />
    <directionalLight ref={rim} position={[-3, 3, -4]} color="#ff6a18" intensity={2.1} />
    <pointLight ref={impact} position={[0.65, 1, 2]} color="#ffde94" intensity={0} distance={18} />
    <pointLight position={[-4, -1, 3]} color="#f14e10" intensity={5} distance={8} />
    <group position={[0, -2.43, 0]}>
      <Grid args={[50, 50]} cellSize={1.3} cellThickness={0.55} cellColor="#30291e" sectionSize={6.5} sectionThickness={0.7} sectionColor="#403326" fadeDistance={22} fadeStrength={2.5} infiniteGrid />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-2.5, 0.015, 0.9]}>
        <planeGeometry args={[7, 4.5]} />
        <shaderMaterial transparent depthWrite={false} vertexShader="varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }" fragmentShader="varying vec2 vUv; void main(){ float a=exp(-length((vUv-.5)*vec2(4.,5.))*2.8); gl_FragColor=vec4(0.01,0.007,0.005,a*.95); }" />
      </mesh>
    </group>
    <SlicedName progress={progress} />
    <Forgewalker progress={progress} frozen={frozen} />
    <FireTrail progress={progress} />
    <Sparks progress={progress} mobile={mobile} />
    <Embers progress={progress} mobile={mobile} frozen={frozen} />
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <HeatShimmer progress={progress} frozen={frozen} />
      <Bloom ref={bloom} intensity={0.65} luminanceThreshold={0.85} luminanceSmoothing={0.4} mipmapBlur resolutionScale={mobile ? 0.4 : 0.65} />
      <Vignette eskil={false} offset={0.15} darkness={0.62} />
    </EffectComposer>
  </>
}

type SceneProps = { progress: ProgressRef; active: boolean; mobile: boolean; frozen: boolean; onReady: () => void; onError: () => void }
export default function Scene({ progress, active, mobile, frozen, onReady, onError }: SceneProps) {
  return <SceneBoundary onError={onError}>
    <Canvas
      dpr={[1, mobile ? 1.3 : 1.75]}
      camera={{ position: [0, 1.25, 13.2], fov: 39, near: 0.1, far: 60 }}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: frozen }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
        gl.info.autoReset = false
        gl.setClearColor(new Color('#11100e'))
        gl.domElement.setAttribute('aria-label', 'The Forgewalker, an armoured swordsman, cuts the name SHAAZ with a flaming blade as you scroll.')
        gl.domElement.setAttribute('role', 'img')
        gl.domElement.addEventListener('webglcontextlost', onError, { once: true })
      }}
      fallback={<div className="canvas-unavailable">The story continues below.</div>}
    >
      <RenderControl active={active} />
      <Suspense fallback={null}><World progress={progress} mobile={mobile} frozen={frozen} onReady={onReady} /></Suspense>
    </Canvas>
  </SceneBoundary>
}
