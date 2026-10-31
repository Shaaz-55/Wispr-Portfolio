import { Euler, Matrix4, Vector3 } from 'three'

export const IMPACT = 0.42
export const NAME_CENTER = new Vector3(0.65, 1.0, 0)
export const CUT_NORMAL = new Vector3(0.18, 0.984, 0).normalize()
export const BLADE_LENGTH = 3.05
export const SHOULDER = new Vector3(0.7, 1.11, 0.05)
export const UPPER_ARM = 0.76
export const FOREARM = 0.67

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

export function smoothstep(start: number, end: number, p: number) {
  const x = clamp((p - start) / (end - start))
  return x * x * (3 - 2 * x)
}

type Key = readonly [number, number]
export function track(p: number, keys: readonly Key[]) {
  if (p <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i][0]) {
      const t = smoothstep(keys[i - 1][0], keys[i][0], p)
      return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * t
    }
  }
  return keys[keys.length - 1][1]
}

export function poseAt(p: number) {
  return {
    x: track(p, [[0, -3.15], [0.12, -3.15], [0.3, -3.4], [0.48, -1.8], [0.62, -2.05], [1, -2.05]]),
    y: track(p, [[0, -0.35], [0.12, -0.35], [0.3, -0.55], [0.42, -0.22], [0.58, -0.42], [1, -0.42]]),
    z: 1.12,
    hipZ: track(p, [[0, 0.04], [0.12, 0.04], [0.3, 0.13], [0.48, -0.13], [0.65, 0.04], [1, 0.04]]),
    torsoY: track(p, [[0, 0.22], [0.12, 0.22], [0.3, -0.4], [0.45, 0.25], [0.65, 0.15], [1, 0.15]]),
    torsoZ: track(p, [[0, -0.08], [0.12, -0.08], [0.3, 0.14], [0.48, -0.19], [0.65, -0.08], [1, -0.08]]),
    headZ: track(p, [[0, 0.06], [0.12, 0.06], [0.3, -0.14], [0.48, 0.12], [1, 0.08]]),
    rightShoulder: track(p, [[0, 0.22], [0.12, 0.22], [0.3, 2.15], [0.42, 0.94], [0.55, 0.4], [0.75, 0.32], [1, 0.32]]),
    rightElbow: track(p, [[0, -0.54], [0.12, -0.54], [0.3, 0.82], [0.42, -0.32], [0.55, -0.26], [0.75, -0.4], [1, -0.4]]),
    rightWrist: track(p, [[0, -1.05], [0.12, -1.05], [0.3, -1.04], [0.42, -1.87], [0.55, -2.34], [0.75, -1.48], [1, -1.48]]),
    leftShoulder: track(p, [[0, -0.14], [0.12, -0.14], [0.3, -1.25], [0.46, -0.68], [0.65, -0.25], [1, -0.25]]),
    leftElbow: track(p, [[0, 0.2], [0.12, 0.2], [0.3, -0.6], [0.48, 0.8], [0.65, 0.3], [1, 0.3]]),
    leftWrist: track(p, [[0, 0], [0.12, 0], [0.3, -0.3], [0.48, 0.16], [0.65, 0], [1, 0]]),
    leftLeg: track(p, [[0, -0.2], [0.12, -0.2], [0.3, -0.4], [0.48, -0.5], [0.65, -0.32], [1, -0.32]]),
    rightLeg: track(p, [[0, 0.21], [0.12, 0.21], [0.3, 0.38], [0.48, 0.56], [0.65, 0.3], [1, 0.3]]),
    leftKnee: track(p, [[0, 0.05], [0.12, 0.05], [0.3, 0.28], [0.48, 0.17], [1, 0.08]]),
    rightKnee: track(p, [[0, -0.05], [0.12, -0.05], [0.3, -0.24], [0.48, -0.28], [1, -0.08]]),
  }
}

// The exact same joint chain is used by the character and by the trail sampler.
// No previous frame is needed to reconstruct a pose or any point on the blade.
export function bladePointAt(p: number, along = BLADE_LENGTH, target = new Vector3()) {
  const pose = poseAt(p)
  const matrix = new Matrix4().makeTranslation(pose.x, pose.y, pose.z)
  matrix.multiply(new Matrix4().makeRotationZ(pose.hipZ))
  matrix.multiply(new Matrix4().makeTranslation(0, 0.45, 0))
  matrix.multiply(new Matrix4().makeRotationFromEuler(new Euler(0, pose.torsoY, pose.torsoZ)))
  matrix.multiply(new Matrix4().makeTranslation(SHOULDER.x, SHOULDER.y, SHOULDER.z))
  matrix.multiply(new Matrix4().makeRotationZ(pose.rightShoulder))
  matrix.multiply(new Matrix4().makeTranslation(0, -UPPER_ARM, 0))
  matrix.multiply(new Matrix4().makeRotationZ(pose.rightElbow))
  matrix.multiply(new Matrix4().makeTranslation(0, -FOREARM, 0))
  matrix.multiply(new Matrix4().makeRotationZ(pose.rightWrist))
  return target.set(0.045 * along * along, along + 0.18, 0.035).applyMatrix4(matrix)
}

export function splitAt(p: number) {
  const cut = smoothstep(0.48, 0.74, p)
  const travel = smoothstep(0.75, 1, p)
  return { distance: cut * 0.47 + travel * 1.6, tilt: cut * 0.055 + travel * 0.1, glow: smoothstep(0.41, 0.435, p) * (1 - travel * 0.5) }
}

export function cameraAt(p: number, aspect = 1.6) {
  const push = smoothstep(0, 0.3, p)
  const through = smoothstep(0.75, 1, p)
  const framingDistance = Math.max(13.2, 12 / (2 * Math.tan(39 * Math.PI / 360) * Math.max(aspect, 0.25)))
  // 0.0125 progress is 150 ms on the 12-second choreography's virtual clock.
  const elapsed = (p - IMPACT) * 12
  const shake = elapsed >= 0 && elapsed < 0.15 ? Math.sin(elapsed * 135) * 0.105 * (1 - elapsed / 0.15) : 0
  return {
    x: through * 0.65 + shake,
    y: 1.25 - through * 0.15 + shake * 0.55,
    z: framingDistance - push * 0.75 - through * (framingDistance - 0.75 - 1.1),
    targetX: through * 0.65,
    targetY: 0.35 + through * 0.62,
  }
}

export function flashAt(p: number) {
  // One virtual frame at 60 fps. A reversible window, never a stateful event.
  return Math.max(0, 1 - Math.abs(p - IMPACT) / (1 / 120 / 12))
}

export function phaseAt(p: number) {
  if (p < 0.12) return { index: '01', label: 'THE QUIET BEFORE', title: 'Every idea starts with a spark.' }
  if (p < 0.3) return { index: '02', label: 'GATHERING FIRE', title: 'Curiosity is the catalyst.' }
  if (p < 0.55) return { index: '03', label: 'MAKE THE FIRST CUT', title: 'Make something that matters.' }
  if (p < 0.75) return { index: '04', label: 'BREAK THE EXPECTED', title: 'A different way through.' }
  return { index: '05', label: 'BEYOND THE INTRO', title: 'Now, let’s get to know each other.' }
}

export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}
