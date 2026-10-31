import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial, Vector3 } from 'three'
import { bladePointAt, seededRandom, smoothstep } from './choreography'
import type { ProgressRef } from './useScrollProgress'

const vertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uGather;
  uniform vec3 uBlade;
  uniform float uDpr;
  varying float vAlpha;
  void main() {
    vec3 p=position;
    p.y=mod(p.y+uTime*(0.14+aSeed*0.3)+6.0,10.0)-4.0;
    p.x+=sin(uTime*0.4+aSeed*40.0)*0.18;
    p=mix(p,uBlade+(p-uBlade)*0.13,uGather*(0.3+aSeed*0.6));
    vec4 mv=modelViewMatrix*vec4(p,1.0);
    gl_Position=projectionMatrix*mv;
    gl_PointSize=(1.0+aSeed*2.9)*uDpr*min(1.5,12.0/-mv.z);
    vAlpha=(0.5+0.5*sin(aSeed*100.0+uTime*1.3))*smoothstep(-4.0,-2.0,p.y)*smoothstep(6.0,3.0,p.y);
  }
`
const fragment = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d=length(gl_PointCoord-0.5);
    if(d>0.5) discard;
    gl_FragColor=vec4(vec3(1.0,0.35,0.07)*1.7,(1.0-smoothstep(0.05,0.5,d))*vAlpha);
  }
`

export function Embers({ progress, mobile = false, frozen = false }: { progress: ProgressRef; mobile?: boolean; frozen?: boolean }) {
  const material = useRef<ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const random = seededRandom(1938)
    const count = mobile ? 95 : 260
    const positions = new Float32Array(count * 3), seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions.set([(random() - 0.5) * 18, random() * 10 - 4, (random() - 0.5) * 9], i * 3)
      seeds[i] = random()
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 1))
    return geo
  }, [mobile])
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGather: { value: 0 }, uBlade: { value: new Vector3() }, uDpr: { value: 1 } }), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ clock, gl }) => {
    if (!material.current) return
    const u = material.current.uniforms
    u.uTime.value = frozen ? 0 : clock.elapsedTime
    u.uGather.value = smoothstep(0.12, 0.3, progress.current) * (1 - smoothstep(0.3, 0.45, progress.current))
    bladePointAt(progress.current, 2, u.uBlade.value)
    u.uDpr.value = gl.getPixelRatio()
  })
  return <points geometry={geometry} frustumCulled={false}>
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
  </points>
}
