import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry } from 'three'
import type { MeshStandardMaterial } from 'three'
import { choreographyClock, seededRandom } from './choreography'
import type { ProgressRef } from './useScrollProgress'

export function Cloth({ progress, material, length = 2.3, width = 0.32, vertical = false, phase = 0 }: { progress: ProgressRef; material: MeshStandardMaterial; length?: number; width?: number; vertical?: boolean; phase?: number }) {
  const rows = 40, columns = 9
  const fray = useMemo(() => { const r = seededRandom(812 + phase * 100); return Array.from({ length: columns + 1 }, () => 0.78 + r() * 0.22) }, [phase])
  const geometry = useMemo(() => {
    const geo = new BufferGeometry(), indices: number[] = [], uv: number[] = []
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
      uv.push(i / rows, j / columns)
      if (i < rows && j < columns) { const a = i * (columns + 1) + j; indices.push(a, a + 1, a + columns + 1, a + 1, a + columns + 2, a + columns + 1) }
    }
    geo.setAttribute('position', new BufferAttribute(new Float32Array((rows + 1) * (columns + 1) * 3), 3))
    geo.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
    geo.setIndex(indices)
    return geo
  }, [])
  const previous = useRef(-1)
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    if (previous.current === progress.current) return
    previous.current = progress.current
    const clock = choreographyClock(progress.current), position = geometry.attributes.position
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= columns; j++) {
      const t = i / rows, u = j / columns - 0.5, run = t * length * (1 - Math.max(0, (t - 0.76) / 0.24) * (1 - fray[j]))
      const flutter = Math.sin(t * 9 - clock * 4.2 + phase) * t * t * 0.16 + Math.sin(t * 21 - clock * 6.2 + phase) * t * 0.025
      const fold = Math.sin(u * 11 + t * 4 + phase) * 0.012
      position.setXYZ(i * (columns + 1) + j,
        vertical ? u * width + flutter * 0.24 : run,
        vertical ? -run : u * width * (1 - 0.2 * t) + flutter - t * 0.09,
        vertical ? fold + t * 0.08 + flutter * 0.38 : 0.12 + t * 0.25 + fold + flutter * 0.5)
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
  })
  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}
