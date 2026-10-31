import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, ShaderMaterial } from 'three'
import { CUT_NORMAL, IMPACT, seededRandom } from './choreography'
import type { ProgressRef } from './useScrollProgress'

const vertex = /* glsl */ `
  attribute vec3 aVelocity;
  attribute float aSeed;
  attribute float aLife;
  attribute float aSeam;
  uniform float uProgress;
  uniform float uDpr;
  varying float vAlpha;
  varying float vHeat;
  void main() {
    float impactAge=(uProgress-0.42)*9.0;
    float born=0.435+aSeed*0.31;
    float seamAge=(uProgress-born)*9.0;
    float age=mix(impactAge,seamAge,aSeam);
    float alive=step(0.0,age)*(1.0-step(aLife,age));
    vec3 p=position+aVelocity*max(age,0.0);
    p.y-=2.6*age*age;
    float fade=pow(max(0.0,1.0-age/aLife),1.6);
    vAlpha=alive*fade*(0.62+0.38*sin(age*48.0+aSeed*120.0));
    vHeat=fade;
    vec4 mv=modelViewMatrix*vec4(p,1.0);
    gl_Position=projectionMatrix*mv;
    gl_PointSize=clamp((2.0+aSeed*3.2)*uDpr*(11.0/-mv.z),1.0,11.0)*alive;
  }
`
const fragment = /* glsl */ `
  varying float vAlpha;
  varying float vHeat;
  void main() {
    vec2 uv=gl_PointCoord-0.5;
    float radius=length(uv);
    if(radius>0.5 || vAlpha<0.01) discard;
    vec3 color=mix(vec3(0.9,0.12,0.015),vec3(1.0,0.82,0.32),vHeat);
    float core=exp(-radius*radius*25.0);
    gl_FragColor=vec4(color*(1.4+core*1.8),(1.0-smoothstep(0.1,0.5,radius))*vAlpha);
  }
`

export function Sparks({ progress, mobile = false }: { progress: ProgressRef; mobile?: boolean }) {
  const shader = useRef<ShaderMaterial>(null)
  const burstCount = mobile ? 850 : 2500
  const seamCount = mobile ? 170 : 420
  const geometry = useMemo(() => {
    const random = seededRandom(72942)
    const count = burstCount + seamCount
    const positions = new Float32Array(count * 3), velocity = new Float32Array(count * 3)
    const seed = new Float32Array(count), life = new Float32Array(count), seam = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const isSeam = i >= burstCount
      const along = (random() - 0.5) * (isSeam ? 8.8 : 3.2)
      const angle = random() * Math.PI * 2
      const speed = 1.2 + Math.pow(random(), 0.5) * (isSeam ? 1.7 : 10.5)
      positions.set([0.65 + along, 1 - along * (CUT_NORMAL.x / CUT_NORMAL.y) + (random() - 0.5) * 0.22, 0.55 + random() * 0.15], i * 3)
      velocity.set([Math.cos(angle) * speed, Math.sin(angle) * speed * 0.7 + (isSeam ? 1.8 : 1.0), (random() - 0.35) * speed * 0.65], i * 3)
      seed[i] = random()
      life[i] = isSeam ? 0.32 + random() * 0.6 : 0.65 + random() * 1.2
      seam[i] = isSeam ? 1 : 0
      if (!isSeam) {
        // At the impact frame a small initial burst is already visible around the contact.
        positions[i * 3] += velocity[i * 3] * 0.07
        positions[i * 3 + 1] += velocity[i * 3 + 1] * 0.07
      }
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('aVelocity', new BufferAttribute(velocity, 3))
    geo.setAttribute('aSeed', new BufferAttribute(seed, 1))
    geo.setAttribute('aLife', new BufferAttribute(life, 1))
    geo.setAttribute('aSeam', new BufferAttribute(seam, 1))
    return geo
  }, [burstCount, seamCount])
  const uniforms = useMemo(() => ({ uProgress: { value: IMPACT - 1 }, uDpr: { value: 1 } }), [])
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(({ gl }) => {
    if (!shader.current) return
    shader.current.uniforms.uProgress.value = progress.current
    shader.current.uniforms.uDpr.value = gl.getPixelRatio()
  })
  return <points geometry={geometry} frustumCulled={false} renderOrder={6} name={`gpu-sparks-${burstCount}`}>
    <shaderMaterial ref={shader} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
  </points>
}
