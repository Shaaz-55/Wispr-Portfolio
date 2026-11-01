import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three'
import { choreographyClock } from './choreography'
import { makeSparkData, sparkAt } from './particleSimulation'
import type { ProgressRef } from './useScrollProgress'
import type { SceneLayout } from './choreography'

const vertex = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec3 aVelocity;
  attribute float aBirth;
  attribute float aLife;
  attribute float aSeed;
  attribute float aKind;
  attribute float aInitialAge;
  uniform float uClock;
  uniform float uHeight;
  uniform vec2 uResolution;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vHeat;
  varying float vKind;
  vec3 particle(float age) {
    float t=max(0.0,age+aInitialAge);
    float k=aKind<0.5?15.0:(aKind<1.5?7.0:5.0);
    float gravity=aKind>1.5?0.3:1.8;
    vec3 p=aOrigin+aVelocity*(1.0-exp(-k*t))/k;
    p.y-=0.5*gravity*uHeight*t*t;
    float curl=uHeight*0.012*t*t*exp(-2.0*t);
    p.xy+=vec2(sin(aSeed*70.0+t*9.0),cos(aSeed*70.0+t*7.0))*curl;
    return p;
  }
  void main() {
    float age=uClock-aBirth;
    float alive=step(0.0,age)*(1.0-step(aLife,age));
    vec4 head=projectionMatrix*modelViewMatrix*vec4(particle(age),1.0);
    vec4 tail=projectionMatrix*modelViewMatrix*vec4(particle(age-(aKind>0.5&&aKind<1.5?0.024:0.011)),1.0);
    vec2 delta=(head.xy/head.w-tail.xy/tail.w)*uResolution*0.5;
    vec2 direction=length(delta)>0.00001?normalize(delta):normalize(vec2(aVelocity.x,aVelocity.y));
    float lengthPx=clamp(length(delta),aKind>1.5?2.0:5.0,aKind<0.5?34.0:46.0);
    float widthPx=max(1.0,(1.0+aSeed*0.8)*uResolution.y/1080.0)*(aKind>0.5&&aKind<1.5?1.5:1.0);
    vec2 offset=direction*position.x*lengthPx+vec2(-direction.y,direction.x)*position.y*widthPx;
    head.xy+=offset*2.0/uResolution*head.w;
    gl_Position=head;
    vUv=uv;
    vHeat=clamp(1.0-age/aLife,0.0,1.0);
    vAlpha=alive*pow(vHeat,0.65)*(0.78+0.22*sin(age*58.0+aSeed*153.0));
    vKind=aKind;
  }
`
const fragment = /* glsl */ `
  varying vec2 vUv;
  varying float vAlpha;
  varying float vHeat;
  varying float vKind;
  void main() {
    if(vAlpha<0.015) discard;
    float edge=pow(max(0.0,1.0-abs(vUv.y*2.0-1.0)),0.7);
    float ends=smoothstep(0.0,0.18,vUv.x)*(1.0-smoothstep(0.82,1.0,vUv.x));
    vec3 hot=vec3(1.0,0.945,0.72), orange=vec3(1.0,0.36,0.025), red=vec3(0.76,0.025,0.0);
    vec3 color=vHeat>0.55?mix(orange,hot,(vHeat-0.55)/0.45):mix(red,orange,vHeat/0.55);
    gl_FragColor=vec4(color*(vKind>1.5?1.6:5.8),vAlpha*edge*ends);
  }
`

export function Sparks({ progress, layout, mobile = false }: { progress: ProgressRef; layout: SceneLayout; mobile?: boolean }) {
  const mesh = useRef<Mesh>(null), shader = useRef<ShaderMaterial>(null), previous = useRef(-1)
  const data = useMemo(() => makeSparkData(layout, mobile), [layout, mobile])
  const geometry = useMemo(() => {
    const geo = new BufferGeometry(), positions: number[] = [], uv: number[] = [], indices: number[] = []
    for (let i = 0; i < data.count; i++) {
      positions.push(-.5, -.5, 0, .5, -.5, 0, -.5, .5, 0, .5, .5, 0)
      uv.push(0, 0, 1, 0, 0, 1, 1, 1)
      const k = i * 4; indices.push(k, k + 1, k + 2, k + 2, k + 1, k + 3)
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geo.setIndex(indices)
    const repeat = (values: Float32Array, itemSize: number) => {
      const result = new Float32Array(values.length * 4)
      for (let i = 0; i < data.count; i++) for (let corner = 0; corner < 4; corner++) for (let j = 0; j < itemSize; j++) result[(i * 4 + corner) * itemSize + j] = values[i * itemSize + j]
      return new BufferAttribute(result, itemSize)
    }
    geo.setAttribute('aOrigin', repeat(data.origins, 3))
    geo.setAttribute('aVelocity', repeat(data.velocities, 3))
    geo.setAttribute('aBirth', repeat(data.birth, 1))
    geo.setAttribute('aLife', repeat(data.life, 1))
    geo.setAttribute('aSeed', repeat(data.seed, 1))
    geo.setAttribute('aKind', repeat(data.kind, 1))
    geo.setAttribute('aInitialAge', repeat(data.initialAge, 1))
    return geo
  }, [data])
  const uniforms = useMemo(() => ({ uClock: { value: 0 }, uHeight: { value: layout.height }, uResolution: { value: new Vector2() } }), [layout])
  const position = useMemo(() => new Vector3(), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ size, camera }) => {
    uniforms.uClock.value = choreographyClock(progress.current)
    uniforms.uResolution.value.set(size.width, size.height)
    if (shader.current) {
      shader.current.uniforms.uClock.value = uniforms.uClock.value
      shader.current.uniforms.uHeight.value = layout.height
      shader.current.uniforms.uResolution.value.set(size.width, size.height)
    }
    if (!mesh.current || previous.current === progress.current && mesh.current.userData.data === data) return
    previous.current = progress.current
    let live = 0, visible = 0
    for (let i = 0; i < data.count; i++) {
      const state = sparkAt(data, i, progress.current, layout.height, position)
      if (!state.alive) continue
      live++
      position.project(camera)
      if (state.heat > 0.03 && Math.abs(position.x) < 1 && Math.abs(position.y) < 1 && position.z > -1 && position.z < 1) visible++
    }
    mesh.current.visible = live > 0
    mesh.current.userData = { data, count: data.count, live, visible, primitive: 'GPU streak quads' }
  })
  return <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={6} name="gpu-spark-streaks">
    <shaderMaterial ref={shader} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
  </mesh>
}
