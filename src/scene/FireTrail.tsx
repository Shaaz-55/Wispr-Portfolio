import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Vector3 } from 'three'
import { BLADE_LENGTH, bladePointAt, smoothstep } from './choreography'
import type { ProgressRef } from './useScrollProgress'
import type { SceneLayout } from './choreography'

const vertex = `
  attribute float aOpacity;
  varying float vOpacity;
  varying vec2 vUv;
  void main(){vOpacity=aOpacity;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`
const fragment = `
  varying float vOpacity;
  varying vec2 vUv;
  uniform float uStrength;
  void main(){
    float edge=pow(1.0-abs(vUv.y*2.0-1.0),2.0);
    float ends=smoothstep(0.0,0.1,vUv.x)*(1.0-smoothstep(0.9,1.0,vUv.x));
    gl_FragColor=vec4(4.0,0.009,0.03,edge*ends*vOpacity*uStrength);
  }
`
export function FireTrail({ progress, layout }: { progress: ProgressRef; layout: SceneLayout }) {
  const samples = 7, previous = useRef(-1)
  const geometry = useMemo(() => {
    const geo = new BufferGeometry(), uv: number[] = [], opacity: number[] = [], indices: number[] = []
    for (let i = 0; i < samples; i++) {
      uv.push(0, 0, 0, 1, 1, 0, 1, 1)
      opacity.push(...Array(4).fill(0.1 * (1 - i / samples)))
      const k = i * 4; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array(samples * 12), 3))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geo.setAttribute('aOpacity', new BufferAttribute(new Float32Array(opacity), 1))
    geo.setIndex(indices)
    return geo
  }, [])
  const uniforms = useMemo(() => ({ uStrength: { value: 0 } }), [])
  const oldLayout = useRef<SceneLayout | null>(null)
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    const p = progress.current
    if (previous.current === p && oldLayout.current === layout) return
    previous.current = p; oldLayout.current = layout
    uniforms.uStrength.value = smoothstep(0.28, 0.32, p) * (1 - smoothstep(0.5, 0.54, p))
    for (let i = 0; i < samples; i++) {
      const sample = Math.max(0.28, Math.min(0.5, p - (i + 1) * 0.0035))
      const base = bladePointAt(sample, 0, new Vector3(), layout), tip = bladePointAt(sample, BLADE_LENGTH, new Vector3(), layout)
      const normal = new Vector3(-(tip.y - base.y), tip.x - base.x, 0).normalize().multiplyScalar(layout.characterScale * (0.04 + i * 0.006))
      for (let j = 0; j < 4; j++) {
        const point = (j < 2 ? base : tip).clone().addScaledVector(normal, j % 2 ? 1 : -1)
        geometry.attributes.position.setXYZ(i * 4 + j, point.x, point.y, point.z)
      }
    }
    geometry.attributes.position.needsUpdate = true
  })
  return <mesh geometry={geometry} frustumCulled={false} renderOrder={5} name="blade-motion-smear">
    <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
  </mesh>
}
