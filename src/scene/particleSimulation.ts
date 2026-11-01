import { Vector3 } from 'three'
import { CONTACT_TIME, CUT_DIRECTION, CUT_DURATION, choreographyClock, clamp, cutPointAt, seededRandom } from './choreography'
import type { SceneLayout } from './choreography'

export const DESKTOP_SPARKS = 3500
export const MOBILE_SPARKS = 1000
export type SparkData = ReturnType<typeof makeSparkData>
export function makeSparkData(layout: SceneLayout, mobile = false) {
  const random = seededRandom(72942), count = mobile ? MOBILE_SPARKS : DESKTOP_SPARKS
  const burst = mobile ? 230 : 800, embers = mobile ? 70 : 200, stream = count - burst - embers
  const origins = new Float32Array(count * 3), velocities = new Float32Array(count * 3)
  const birth = new Float32Array(count), life = new Float32Array(count), seed = new Float32Array(count), kind = new Float32Array(count), initialAge = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const ember = i >= burst + stream, droplet = !ember && random() < 0.045
    const fraction = i < burst ? 0 : ember ? random() : (i - burst + random()) / stream
    const born = CONTACT_TIME + fraction * CUT_DURATION + (ember ? 0.12 : -0.00001)
    const along = (2 * fraction - 1) * layout.cutExtent + (random() - 0.5) * layout.height * 0.01
    cutPointAt(along, layout).toArray(origins, i * 3)
    origins[i * 3 + 2] += (random() - 0.5) * layout.height * 0.022
    const normal = Math.sqrt(-2 * Math.log(Math.max(random(), 0.0001))) * Math.cos(2 * Math.PI * random())
    const speed = clamp(Math.exp(Math.log(3.4) + normal * 0.68), 1.5, 14) * layout.height * (ember ? 0.07 : droplet ? 0.5 : 1)
    const angle = (135 + (random() - 0.5) * 100) * Math.PI / 180
    velocities.set([(Math.cos(angle) + CUT_DIRECTION.x * 0.22) * speed, (Math.sin(angle) + CUT_DIRECTION.y * 0.22) * speed, (random() - 0.5) * speed * 0.055], i * 3)
    birth[i] = born
    life[i] = ember ? 1.3 + random() * 0.5 : droplet ? 1.8 : i < burst ? 0.4 + random() * 1.4 : 1.1 + random() * 0.7
    seed[i] = random()
    kind[i] = ember ? 2 : droplet ? 1 : 0
    initialAge[i] = i < burst ? 1 / 60 : 0
  }
  return { count, burst, stream, embers, origins, velocities, birth, life, seed, kind, initialAge }
}
// This closed form is mirrored in the vertex shader. No frame integration:
// reverse scrolling evaluates precisely the same positions and temperatures.
export function sparkAt(data: SparkData, i: number, p: number, height: number, target = new Vector3()) {
  const age = choreographyClock(p) - data.birth[i], alive = age >= 0 && age < data.life[i]
  const t = Math.max(0, age) + data.initialAge[i], k = data.kind[i] === 1 ? 7 : data.kind[i] === 2 ? 5 : 15
  target.fromArray(data.origins, i * 3).addScaledVector(new Vector3().fromArray(data.velocities, i * 3), (1 - Math.exp(-k * t)) / k)
  const gravity = data.kind[i] === 2 ? 0.3 : 1.8
  target.y -= 0.5 * gravity * height * t * t
  const curl = height * 0.012 * t * t * Math.exp(-2 * t), phase = data.seed[i] * 70
  target.x += Math.sin(phase + t * 9) * curl
  target.y += Math.cos(phase + t * 7) * curl
  return { alive, age, heat: clamp(1 - age / data.life[i]), position: target }
}
