import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, DoubleSide, Group, MeshBasicMaterial, MeshStandardMaterial, Plane, Vector2, Vector3 } from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import fontData from 'three/examples/fonts/helvetiker_bold.typeface.json'
import { CAMERA_DISTANCE, CONTACT_TIME, CUT_DEPTH, CUT_DURATION, CUT_NORMAL_WORLD, NAME_LINE_HEIGHT, NAME_WIDTH, choreographyClock, cutStateAt, flashAt, slashTipAt, splitAt } from './choreography'
import type { SceneLayout } from './choreography'
import type { ProgressRef } from './useScrollProgress'

const DEPTH = 0.25, KERF = 0.009
const declarations = `
  varying vec3 vSliceLocal;
  uniform float uFront;
  uniform float uExtent;
  uniform float uCut;
  uniform float uClock;
  uniform float uContact;
  uniform vec3 uContactPoint;
  float cutAlong(vec3 p){return -(p.x+p.y)*0.70710678118;}
  float cutDistance(vec3 p){return (p.x-p.y)*0.70710678118;}
`
const capVertex = `
  varying vec3 vSliceLocal;
  void main(){vSliceLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`
const capFragment = declarations + `
  void main(){
    float along=cutAlong(vSliceLocal);
    if(uCut<0.5||along>uFront) discard;
    float born=${CONTACT_TIME}+(along+uExtent)/(2.0*uExtent)*${CUT_DURATION};
    float age=max(0.0,uClock-born), heat=clamp(1.0-age/1.2,0.0,1.0);
    float noise=0.88+0.12*sin(along*153.0+uClock*22.0)*sin(vSliceLocal.z*110.0-along*47.0);
    float edge=exp(-abs(vSliceLocal.z)*45.0);
    vec3 molten=mix(vec3(0.9,0.007,0.001),vec3(3.8,0.63,0.04),edge);
    molten=mix(molten,vec3(5.0,3.5,1.0),pow(edge,6.0)*heat);
    gl_FragColor=vec4(mix(vec3(0.09,0.002,0.001),molten,heat)*noise,1.0);
  }
`

export function SlicedName({ progress, layout }: { progress: ProgressRef; layout: SceneLayout }) {
  const upper = useRef<Group>(null), lower = useRef<Group>(null)
  const resources = useMemo(() => {
    const font = new FontLoader().parse(fontData)
    const lines = ['Shaaz', 'Hemani'].map((line, i) => {
      const text = new TextGeometry(line, { font, size: 1, depth: DEPTH, curveSegments: 14, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3 })
      text.translate(-NAME_WIDTH / 2, 0.053 - i * NAME_LINE_HEIGHT, -DEPTH)
      return text
    })
    const geometry = mergeGeometries(lines)
    geometry.clearGroups()
    let start = 0
    for (const line of lines) {
      for (const group of line.groups) geometry.addGroup(start + group.start, group.count, group.materialIndex)
      start += line.attributes.position.count
    }
    // Batch all letter faces and all sidewalls into two material groups.
    // Keeping each glyph's groups would submit dozens of identical draws.
    const groups = [...geometry.groups], indices: number[] = []
    geometry.clearGroups()
    for (const material of [0, 1]) {
      const first = indices.length
      for (const group of groups) if (group.materialIndex === material) for (let i = group.start; i < group.start + group.count; i++) indices.push(i)
      geometry.addGroup(first, indices.length - first, material)
    }
    geometry.setIndex(indices)
    // Keep the front face square to the camera. A subtle shear of the
    // extrusion exposes grey sidewalls without tinting the white face.
    const positions = geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const z = Math.min(0, positions.getZ(i))
      positions.setX(i, positions.getX(i) + z * 0.32)
      positions.setY(i, positions.getY(i) + z * 0.18)
    }
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.userData.lines = ['Shaaz', 'Hemani']
    lines.forEach(line => line.dispose())

    // Intersect the actual glyph outlines (including counters) with the
    // cut. Each inside interval becomes a closed, emissive cut surface.
    const vertices: number[] = []
    for (const [lineIndex, line] of ['Shaaz', 'Hemani'].entries()) for (const shape of font.generateShapes(line, 1)) {
      const intersections: number[] = []
      for (const contour of [shape, ...shape.holes]) {
        const points = contour.getPoints(20).map(p => new Vector2(p.x - NAME_WIDTH / 2, p.y + 0.053 - lineIndex * NAME_LINE_HEIGHT))
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length], da = a.x - a.y, db = b.x - b.y
          if ((da < 0) === (db < 0)) continue
          const t = da / (da - db), x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t
          intersections.push(-(x + y) / Math.SQRT2)
        }
      }
      intersections.sort((a, b) => a - b)
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const a = intersections[i], b = intersections[i + 1]
        const point = (along: number, z: number) => [-along / Math.SQRT2, -along / Math.SQRT2, z]
        const v = [point(a, 0.012), point(b, 0.012), point(a, -DEPTH), point(b, -DEPTH)]
        for (const j of [0, 1, 2, 2, 1, 3]) vertices.push(...v[j])
      }
    }
    const caps = new BufferGeometry()
    caps.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
    caps.computeVertexNormals()
    return { geometry, caps }
  }, [])
  const halves = useMemo(() => [-1, 1].map(sign => {
    const base = new Plane(CUT_NORMAL_WORLD.clone().multiplyScalar(sign), 0), plane = base.clone()
    const uniforms = {
      uFront: { value: -100 }, uExtent: { value: 1 }, uCut: { value: 0 },
      uClock: { value: 0 }, uContact: { value: 0 }, uContactPoint: { value: new Vector3() },
    }
    const face = new MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false, clippingPlanes: [plane], side: DoubleSide })
    const sides = new MeshStandardMaterial({ color: '#777d81', metalness: 0.24, roughness: 0.57, clippingPlanes: [plane], side: DoubleSide })
    for (const material of [face, sides]) {
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = 'varying vec3 vSliceLocal;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSliceLocal=position;')
        shader.fragmentShader = declarations + shader.fragmentShader
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
          #include <clipping_planes_fragment>
          float along=cutAlong(vSliceLocal), distanceToCut=abs(cutDistance(vSliceLocal));
          if(uCut>0.5&&along<uFront&&distanceToCut<${KERF}) discard;
        `).replace('#include <opaque_fragment>', `
          float born=${CONTACT_TIME}+(along+uExtent)/(2.0*uExtent)*${CUT_DURATION};
          float heat=clamp(1.0-max(0.0,uClock-born)/1.2,0.0,1.0);
          float rim=exp(-pow((distanceToCut-${KERF})/0.013,2.0))*step(along,uFront)*uCut;
          outgoingLight=mix(outgoingLight,mix(vec3(0.12,0.003,0.001),vec3(4.0,0.55,0.035),heat),rim*0.95);
          outgoingLight+=uContact*vec3(1.0,0.2,0.015)*exp(-length(vSliceLocal.xy-uContactPoint.xy)*3.5);
          #include <opaque_fragment>
        `)
      }
      material.customProgramCacheKey = () => 'progressive-name-cut-v2'
    }
    return { sign, base, plane, face, sides, uniforms }
  }), [])
  useEffect(() => () => {
    resources.geometry.dispose(); resources.caps.dispose()
    halves.forEach(half => { half.face.dispose(); half.sides.dispose() })
  }, [resources, halves])
  useFrame(() => {
    const p = progress.current, split = splitAt(p, layout), cut = cutStateAt(p, layout)
    const perspective = (CAMERA_DISTANCE - CUT_DEPTH) / CAMERA_DISTANCE
    ;[upper.current, lower.current].forEach((group, i) => {
      if (!group) return
      const half = halves[i]
      group.position.copy(layout.nameCenter).addScaledVector(CUT_NORMAL_WORLD, split.distance * half.sign)
      group.scale.setScalar(layout.nameScale)
      group.rotation.set(0, 0, -half.sign * split.tilt)
      group.updateMatrixWorld(true)
      half.plane.copy(half.base).applyMatrix4(group.matrixWorld)
      half.uniforms.uCut.value = p >= 0.36 ? 1 : 0
      half.uniforms.uFront.value = cut.front / (layout.nameScale * perspective)
      half.uniforms.uExtent.value = layout.cutExtent / (layout.nameScale * perspective)
      half.uniforms.uClock.value = choreographyClock(p)
      half.uniforms.uContact.value = flashAt(p) * 0.8 + (p > 0.36 && p < 0.5 ? 0.2 : 0)
      half.uniforms.uContactPoint.value.copy(slashTipAt(p, layout)).sub(layout.nameCenter).divideScalar(layout.nameScale)
    })
  })
  return <group name="sliced-name">
    {halves.map((half, i) => <group key={half.sign} ref={i === 0 ? upper : lower} name={i === 0 ? 'name-upper-half' : 'name-lower-half'}>
      <mesh name={i === 0 ? 'name-white-text' : undefined} geometry={resources.geometry} material={[half.face, half.sides]} scale={[1, 1, layout.mobile ? 0.4 : 1]} />
      <mesh name="molten-cut-cap" geometry={resources.caps} position={CUT_NORMAL_WORLD.clone().multiplyScalar(half.sign * KERF).toArray()} scale={[1, 1, layout.mobile ? 0.4 : 1]}>
        <shaderMaterial uniforms={half.uniforms} vertexShader={capVertex} fragmentShader={capFragment} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>)}
  </group>
}
