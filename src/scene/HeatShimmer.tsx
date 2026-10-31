import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BlendFunction, Effect } from 'postprocessing'
import { Uniform, Vector2, Vector3 } from 'three'
import { bladePointAt, smoothstep } from './choreography'
import type { ProgressRef } from './useScrollProgress'

const fragment = /* glsl */ `
  uniform vec2 uStart;
  uniform vec2 uEnd;
  uniform float uTime;
  uniform float uStrength;
  uniform float uAspect;
  void mainUv(inout vec2 uv) {
    vec2 scale=vec2(uAspect,1.0);
    vec2 a=uStart*scale, b=uEnd*scale, p=uv*scale;
    vec2 ab=b-a;
    float t=clamp(dot(p-a,ab)/max(dot(ab,ab),0.00001),0.0,1.0);
    float d=length(p-(a+ab*t));
    float heat=smoothstep(0.055,0.004,d)*sin(t*3.1415926)*uStrength;
    vec2 ripple=vec2(sin(p.y*150.0-uTime*3.0),cos(p.x*120.0+uTime*2.0));
    uv+=ripple*heat*0.0018;
  }
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    outputColor=inputColor;
  }
`

export default function HeatShimmer({ progress, frozen }: { progress: ProgressRef; frozen: boolean }) {
  const effect = useMemo(() => new Effect('BladeHeatShimmer', fragment, {
    blendFunction: BlendFunction.NORMAL,
    uniforms: new Map<string, Uniform>([
      ['uStart', new Uniform(new Vector2())], ['uEnd', new Uniform(new Vector2())],
      ['uTime', new Uniform(0)], ['uStrength', new Uniform(0)], ['uAspect', new Uniform(1)],
    ]),
  }), [])
  const start = useMemo(() => new Vector3(), [])
  const end = useMemo(() => new Vector3(), [])
  useEffect(() => () => effect.dispose(), [effect])
  useFrame(({ camera, clock, size }) => {
    bladePointAt(progress.current, 0.3, start).project(camera)
    bladePointAt(progress.current, 3.05, end).project(camera)
    effect.uniforms.get('uStart')!.value.set(start.x * 0.5 + 0.5, start.y * 0.5 + 0.5)
    effect.uniforms.get('uEnd')!.value.set(end.x * 0.5 + 0.5, end.y * 0.5 + 0.5)
    effect.uniforms.get('uTime')!.value = frozen ? 0 : clock.elapsedTime
    effect.uniforms.get('uStrength')!.value = 0.4 + smoothstep(0.12, 0.3, progress.current) * 0.6
    effect.uniforms.get('uAspect')!.value = size.width / size.height
  })
  return <primitive object={effect} dispose={null} />
}
