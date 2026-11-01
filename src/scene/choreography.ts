import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

export const IMPACT = 0.36
export const SLASH_START = IMPACT
export const SLASH_END = 0.5
export const SLASH_SETTLE = 0.8
export const CAMERA_DISTANCE = 14
export const CAMERA_FOV = 39
export const BLADE_LENGTH = 3.05
export const BLADE_BASE = 0.18
export const SHOULDER = new Vector3(-0.62, 1.11, 0.05)
export const LEFT_SHOULDER = new Vector3(0.62, 1.11, 0.05)
export const UPPER_ARM = 0.8
export const FOREARM = 0.76
export const NAME_WIDTH = 4.717
export const NAME_LINE_HEIGHT = 1.16
export const NAME_HEIGHT = 2.226
// +y points down in screen space and up in the Three.js world.
export const CUT_NORMAL = new Vector3(1, 1, 0).normalize()
export const CUT_NORMAL_WORLD = new Vector3(1, -1, 0).normalize()
export const CUT_DIRECTION = new Vector3(-1, -1, 0).normalize()
export const CUT_DEPTH = 0.18
export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v))
export function smoothstep(start: number, end: number, p: number) {
  const x = clamp((p - start) / (end - start))
  return x * x * (3 - 2 * x)
}
type Key = readonly [number, number]
export function track(p: number, keys: readonly Key[]) {
  if (p <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) if (p <= keys[i][0]) {
    const t = smoothstep(keys[i - 1][0], keys[i][0], p)
    return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * t
  }
  return keys.at(-1)![1]
}

// Monotone Hermite clock: three virtual frames of slowdown at contact.
// Effects and cloth share this clock; nothing accumulates wall-clock age.
const clockKeys: Key[] = [[0, 0], [0.1, 0.6], [0.28, 1.68], [0.36, 2.16], [0.375, 2.21], [0.5, 3.8266666667], [0.6, 3.95], [0.8, 5.2], [1, 6.4]]
function monotone(p: number, keys: Key[]) {
  const secant = (i: number) => (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0])
  const slope = (i: number) => {
    if (i === 0) return secant(0)
    if (i === keys.length - 1) return secant(i - 1)
    const a = secant(i - 1), b = secant(i)
    return a * b <= 0 ? 0 : 2 * a * b / (a + b)
  }
  for (let i = 0; i < keys.length - 1; i++) if (p <= keys[i + 1][0]) {
    const h = keys[i + 1][0] - keys[i][0], t = clamp((p - keys[i][0]) / h)
    return (2 * t ** 3 - 3 * t * t + 1) * keys[i][1] + (t ** 3 - 2 * t * t + t) * h * slope(i)
      + (-2 * t ** 3 + 3 * t * t) * keys[i + 1][1] + (t ** 3 - t * t) * h * slope(i + 1)
  }
  return keys.at(-1)![1]
}
export const choreographyClock = (p: number) => monotone(clamp(p), clockKeys)
export const CONTACT_TIME = choreographyClock(IMPACT)
export const CUT_DURATION = choreographyClock(SLASH_END) - CONTACT_TIME
export const cutProgressAt = (p: number) => clamp((choreographyClock(p) - CONTACT_TIME) / CUT_DURATION)

export function layoutForViewport(viewport: { width: number; height: number }, mobile: boolean) {
  const { width, height } = viewport
  const nameWidth = mobile ? Math.min(width * 0.84, height * 0.54) : Math.min(width * 0.43, height * 0.78)
  const nameScale = nameWidth / NAME_WIDTH, nameHeight = NAME_HEIGHT * nameScale
  const nameCenter = new Vector3(-width * 0.42 + nameWidth / 2, mobile ? height * 0.4 - nameHeight / 2 : height * 0.04, 0)
  const characterScale = mobile ? Math.min(width * 0.185, height * 0.092) : Math.min(height * 0.174, width * 0.14)
  const characterOrigin = new Vector3(mobile ? nameCenter.x : width * 0.155, mobile ? -height * 0.22 : -height * 0.055, -characterScale * 0.3)
  return { width, height, mobile, nameWidth, nameHeight, nameScale, nameCenter, characterScale, characterOrigin, cutExtent: nameHeight / Math.SQRT2 + characterScale * 0.07 }
}
export type SceneLayout = ReturnType<typeof layoutForViewport>
export function layoutAtAspect(aspect = 1.6, mobile = false) {
  const height = 2 * CAMERA_DISTANCE * Math.tan(CAMERA_FOV * Math.PI / 360)
  return layoutForViewport({ width: height * aspect, height }, mobile)
}
export function scrollProgressAt(value: number, scrollPixels: number) {
  const p = clamp(value), pixels = Math.max(1, scrollPixels)
  for (const key of [0, 0.12, 0.22, 0.3, IMPACT, 0.42, 0.5, 0.6, 0.8, 1]) if (Math.round(p * pixels) === Math.round(key * pixels)) return key
  return p
}
export function cutCenterAt(layout: SceneLayout, target = new Vector3()) {
  return target.copy(layout.nameCenter).multiplyScalar((CAMERA_DISTANCE - CUT_DEPTH) / CAMERA_DISTANCE).setZ(CUT_DEPTH)
}
export function cutPointAt(along: number, layout: SceneLayout, target = new Vector3()) {
  return cutCenterAt(layout, target).addScaledVector(CUT_DIRECTION, along)
}
export function slashTipAt(p: number, layout: SceneLayout, target = new Vector3()) {
  return cutPointAt((cutProgressAt(p) * 2 - 1) * layout.cutExtent, layout, target)
}
export function cutStateAt(p: number, layout = layoutAtAspect()) {
  const progress = cutProgressAt(p)
  return { progress, front: (2 * progress - 1) * layout.cutExtent, length: progress * layout.cutExtent * 2, heat: clamp(1 - (choreographyClock(p) - choreographyClock(SLASH_END)) / 1.2), complete: p >= SLASH_END }
}

function torsoMatrix(pose: { x: number; y: number; z: number; scale: number; hipY: number; hipZ: number; torsoY: number; torsoZ: number }) {
  return new Matrix4().makeTranslation(pose.x, pose.y, pose.z)
    .multiply(new Matrix4().makeScale(pose.scale, pose.scale, pose.scale))
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(0, pose.hipY, pose.hipZ)))
    .multiply(new Matrix4().makeTranslation(0, 0.45, 0))
    .multiply(new Matrix4().makeRotationFromEuler(new Euler(0, pose.torsoY, pose.torsoZ)))
}
function hermite(a: Vector3, b: Vector3, va: Vector3, vb: Vector3, t: number, duration: number) {
  return a.clone().multiplyScalar(2 * t ** 3 - 3 * t * t + 1)
    .addScaledVector(va, (t ** 3 - 2 * t * t + t) * duration)
    .addScaledVector(b, -2 * t ** 3 + 3 * t * t)
    .addScaledVector(vb, (t ** 3 - t * t) * duration)
}

// C1 Hermite tip path with an exactly straight contact segment and matching
// tangents at entry/exit. Rotation comes from IK, not a second tip animation.
export function swordTipAt(p: number, layout = layoutAtAspect()) {
  const s = layout.characterScale, origin = layout.characterOrigin
  const idle = origin.clone().add(new Vector3(-2.05, -1.55, 0.55).multiplyScalar(s))
  if (p <= 0.1 || p >= 0.8) return idle
  const raised = new Vector3(origin.x - s * 0.95, Math.min(layout.height * 0.46, origin.y + s * 4.1), 0.3)
  const behind = new Vector3(Math.min(layout.width * 0.46, origin.x + s * (layout.mobile ? 1.3 : 2.45)), origin.y + s * (layout.mobile ? 3.45 : 1.96), -s * 0.7)
  const finish = origin.clone().add(new Vector3(layout.mobile ? -0.55 : -2.3, -1.4, 0.55).multiplyScalar(s))
  const keys = [0, 0.1, 0.22, 0.28, IMPACT, SLASH_END, 0.65, 0.8, 1]
  const followThrough = layout.mobile ? slashTipAt(SLASH_END, layout).lerp(finish, 0.5) : finish
  const points = [idle, idle, raised, behind, slashTipAt(IMPACT, layout), slashTipAt(SLASH_END, layout), followThrough, idle, idle]
  const times = keys.map(choreographyClock)
  const velocity = points.map((_, i) => i === 0 || i === points.length - 1 ? new Vector3() : points[i + 1].clone().sub(points[i - 1]).divideScalar(times[i + 1] - times[i - 1]))
  velocity[0].set(0, 0, 0); velocity[1].set(0, 0, 0); velocity[7].set(0, 0, 0); velocity[8].set(0, 0, 0)
  const cutVelocity = CUT_DIRECTION.clone().multiplyScalar(layout.cutExtent * 2 / CUT_DURATION)
  velocity[4].copy(cutVelocity); velocity[5].copy(cutVelocity)
  const clock = choreographyClock(p)
  for (let i = 0; i < keys.length - 1; i++) if (p <= keys[i + 1]) return hermite(points[i], points[i + 1], velocity[i], velocity[i + 1], clamp((clock - times[i]) / (times[i + 1] - times[i])), times[i + 1] - times[i])
  return idle
}

function reachableGrip(shoulder: Vector3, desired: Vector3, tip: Vector3, scale: number) {
  const axis = tip.clone().sub(shoulder), distance = Math.max(0.001, axis.length()), reach = clamp(desired.distanceTo(shoulder), 1.25 * scale, 1.5 * scale)
  axis.divideScalar(distance)
  const blade = clamp(clamp(desired.distanceTo(tip), 1.7 * scale, 3.5 * scale), Math.abs(distance - reach) + 0.01, distance + reach - 0.01)
  const along = (reach * reach + distance * distance - blade * blade) / (2 * distance)
  const pole = desired.clone().sub(shoulder)
  pole.addScaledVector(axis, -pole.dot(axis))
  if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1).addScaledVector(axis, -axis.z)
  return shoulder.clone().addScaledVector(axis, along).addScaledVector(pole.normalize(), Math.sqrt(Math.max(0, reach * reach - along * along)))
}

function solveSwordArm(shoulder: Vector3, wristTarget: Vector3, tip: Vector3, parent: Quaternion, scale: number, side = -1, edgeBlend = 0) {
  const a = UPPER_ARM * scale, b = FOREARM * scale
  const axis = wristTarget.clone().sub(shoulder)
  const distance = clamp(axis.length(), Math.abs(a - b) + 0.0001, (a + b) * 0.999)
  axis.normalize()
  const wrist = shoulder.clone().addScaledVector(axis, distance)
  const along = (a * a - b * b + distance * distance) / (2 * distance)
  const pole = new Vector3(side * 0.5, -1, 0.45)
  const bend = pole.clone().addScaledVector(axis, -pole.dot(axis)).normalize()
  const elbow = shoulder.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)))
  const upper = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), elbow.clone().sub(shoulder).normalize())
  const lower = new Quaternion().setFromUnitVectors(new Vector3(0, -1, 0), wrist.clone().sub(elbow).normalize())
  const blade = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), tip.clone().sub(wrist).normalize())
  // Slerp the blade's roll to present its edge during the cut, preserving aim.
  blade.slerp(blade.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI * 0.35)), edgeBlend)
  return { shoulder: parent.clone().invert().multiply(upper), elbow: upper.clone().invert().multiply(lower), wrist: lower.clone().invert().multiply(blade), bladeScale: (wrist.distanceTo(tip) / scale - BLADE_BASE) / BLADE_LENGTH, reachError: wrist.distanceTo(wristTarget) }
}

export function poseAt(p: number, layout = layoutAtAspect()) {
  const s = layout.characterScale
  const windup = smoothstep(0.1, 0.28, p), recovery = smoothstep(0.5, 0.8, p)
  const lunge = smoothstep(0.28, 0.4, p) * (1 - smoothstep(0.6, 0.8, p))
  const base = {
    x: layout.characterOrigin.x - lunge * (layout.mobile ? s * 0.1 : layout.width * 0.092),
    y: layout.characterOrigin.y - lunge * s * 0.06,
    z: layout.characterOrigin.z, scale: s,
    hipY: track(p + 0.012, [[0, -0.1], [0.12, -0.1], [0.28, 0.45], [0.5, -0.38], [0.8, -0.1]]),
    hipZ: track(p, [[0, 0], [0.1, 0], [0.28, -0.015], [0.5, 0.045], [0.8, 0]]),
    torsoY: track(p, [[0, -0.3], [0.12, -0.3], [0.28, 0.42], [0.5, -0.65], [0.8, -0.3]]),
    torsoZ: track(p - 0.006, [[0, 0], [0.1, 0], [0.28, -0.025], [0.5, 0.12], [0.8, 0]]),
    headY: track(p, [[0, -0.25], [0.1, -0.25], [0.28, -0.6], [0.5, 0.12], [0.8, -0.25]]),
    headZ: track(p, [[0, -0.015], [0.1, -0.015], [0.28, 0.02], [0.5, 0.05], [0.8, -0.015]]),
    leftLeg: track(p, [[0, -0.12], [0.28, -0.12], [0.42, -0.36], [0.6, -0.36], [0.8, -0.12]]),
    rightLeg: track(p, [[0, 0.13], [0.28, 0.13], [0.42, 0.35], [0.6, 0.35], [0.8, 0.13]]),
    leftKnee: track(p, [[0, 0.025], [0.1, 0.025], [0.3, 0.1], [0.5, 0.17], [0.8, 0.025]]),
    rightKnee: track(p, [[0, -0.03], [0.1, -0.03], [0.3, -0.12], [0.5, -0.1], [0.8, -0.03]]),
  }
  const matrix = torsoMatrix(base)
  const parent = new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(matrix))
  const shoulder = SHOULDER.clone().applyMatrix4(matrix)
  const raised = smoothstep(0.1, 0.22, p) * (1 - smoothstep(0.28, 0.5, p))
  const wrist = shoulder.clone().add(new Vector3(-0.12, -1.39, 0.2).multiplyScalar(s))
  const highGrip = new Vector3(base.x - s * 0.8, base.y + s * 0.96, s * 0.23)
  wrist.lerp(highGrip, raised)
  const contactGrip = cutPointAt(-layout.cutExtent * 1.68, layout)
  const reach = smoothstep(0.28, IMPACT, p) * (1 - smoothstep(0.5, 0.65, p))
  contactGrip.addScaledVector(CUT_DIRECTION, cutProgressAt(p) * s * 0.6)
  wrist.lerp(contactGrip, reach)
  const tip = swordTipAt(p, layout)
  wrist.copy(reachableGrip(shoulder, wrist, tip, s))
  wrist.y = Math.min(wrist.y, layout.height * 0.36)
  const arm = solveSwordArm(shoulder, wrist, tip, parent, s, -1, smoothstep(0.28, 0.4, p) * (1 - recovery))
  const secondary = LEFT_SHOULDER.clone().applyMatrix4(matrix)
  const otherWrist = secondary.clone().add(new Vector3(0.09, -1.36, 0.22).multiplyScalar(s))
  otherWrist.lerp(wrist.clone().add(new Vector3(0.1, -0.2, 0).multiplyScalar(s)), raised * (1 - smoothstep(0.3, 0.42, p)))
  const leftArm = solveSwordArm(secondary, otherWrist, otherWrist.clone().add(new Vector3(0, -s, 0)), parent, s, 1)
  return { ...base, arm, leftArm, windup, slash: cutProgressAt(p), recovery }
}
export function bladePointAt(p: number, along = BLADE_LENGTH, target = new Vector3(), layout = layoutAtAspect()) {
  const pose = poseAt(p, layout)
  const matrix = torsoMatrix(pose)
    .multiply(new Matrix4().makeTranslation(SHOULDER.x, SHOULDER.y, SHOULDER.z))
    .multiply(new Matrix4().makeRotationFromQuaternion(pose.arm.shoulder))
    .multiply(new Matrix4().makeTranslation(0, -UPPER_ARM, 0))
    .multiply(new Matrix4().makeRotationFromQuaternion(pose.arm.elbow))
    .multiply(new Matrix4().makeTranslation(0, -FOREARM, 0))
    .multiply(new Matrix4().makeRotationFromQuaternion(pose.arm.wrist))
  return target.set(0, BLADE_BASE + along * pose.arm.bladeScale, 0).applyMatrix4(matrix)
}
export function splitAt(p: number, layout = layoutAtAspect()) {
  const cut = smoothstep(0.52, 0.68, p), travel = smoothstep(0.82, 1, p)
  return { distance: (cut * 0.04 + travel * 0.2) * layout.height, tilt: cut * Math.PI / 90, glow: p < IMPACT ? 0 : Math.max(0.08, cutStateAt(p, layout).heat), travel }
}
export function cameraAt(p: number, aspect = 1.6, mobile = false) {
  const through = smoothstep(0.82, 1, p), center = layoutAtAspect(aspect, mobile).nameCenter
  const age = choreographyClock(p) - CONTACT_TIME
  const shake = age > 0 && age < 0.1 ? Math.sin(age * 170) * 0.06 * (1 - age / 0.1) : 0
  const x = through * center.x + shake, y = through * center.y + shake * 0.5
  return { x, y, z: CAMERA_DISTANCE - through * (CAMERA_DISTANCE - 1.1), targetX: x, targetY: y }
}
export function flashAt(p: number) {
  const age = choreographyClock(p) - CONTACT_TIME
  return age >= 0 && age < 0.1 ? (1 - age / 0.1) ** 2 : 0
}
export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => { state = (1664525 * state + 1013904223) >>> 0; return state / 4294967296 }
}
