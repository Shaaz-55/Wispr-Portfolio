import assert from 'node:assert/strict'
import test from 'node:test'
import { PerspectiveCamera, Vector3 } from 'three'
import { BLADE_LENGTH, CAMERA_DISTANCE, CAMERA_FOV, CONTACT_TIME, CUT_DURATION, CUT_NORMAL, IMPACT, SLASH_END, bladePointAt, cameraAt, choreographyClock, cutStateAt, flashAt, layoutAtAspect, poseAt, scrollProgressAt, seededRandom, slashTipAt, splitAt, swordTipAt } from '../src/scene/choreography'
import { makeSparkData, sparkAt } from '../src/scene/particleSimulation'

const viewports = [[1440, 900], [1280, 720], [768, 1024], [2560, 1080], [390, 844], [320, 568], [767, 600], [667, 375]]
function projection(width: number, height: number) {
  const camera = new PerspectiveCamera(CAMERA_FOV, width / height, 0.1, 60)
  camera.position.z = CAMERA_DISTANCE
  camera.updateMatrixWorld()
  return (point: Vector3) => { point.project(camera); return new Vector3((point.x + 1) * width / 2, (1 - point.y) * height / 2, 0) }
}

test('pose, cut, camera, blade, and particles are exactly reproducible on reverse traversal', () => {
  const layout = layoutAtAspect(), particles = makeSparkData(layout)
  const state = (p: number) => ({ pose: poseAt(p), blade: bladePointAt(p).toArray(), camera: cameraAt(p), split: splitAt(p), cut: cutStateAt(p), flash: flashAt(p), spark: sparkAt(particles, 1000, p, layout.height) })
  const frames = Array.from({ length: 201 }, (_, i) => i / 200)
  assert.deepEqual(frames.map(state), [...frames].reverse().map(state).reverse())
})

test('idle is held through 0.10 and the final calm stance is restored by 0.80', () => {
  assert.deepEqual(poseAt(0), poseAt(0.06))
  assert.deepEqual(poseAt(0), poseAt(0.1))
  for (const [width, height] of viewports) {
    const layout = layoutAtAspect(width / height, width < 768)
    const tip = bladePointAt(0, BLADE_LENGTH, new Vector3(), layout)
    const base = bladePointAt(0, 0, new Vector3(), layout)
    assert.ok(tip.x < base.x && tip.y < base.y, 'idle blade points down-left')
    assert.ok(swordTipAt(0.8, layout).distanceTo(swordTipAt(0, layout)) < 1e-8)
    for (const p of [0, 0.3, 0.6, 0.8, 0.82]) assert.equal(cameraAt(p, width / height).z, CAMERA_DISTANCE)
  }
})

test('the actual IK hierarchy follows the Hermite tip path without stretching arm bones', () => {
  for (const [width, height] of viewports) {
    const layout = layoutAtAspect(width / height, width < 768)
    for (let i = 0; i <= 200; i++) {
      const p = i / 200, pose = poseAt(p, layout)
      assert.ok(bladePointAt(p, BLADE_LENGTH, new Vector3(), layout).distanceTo(swordTipAt(p, layout)) < 1e-7)
      assert.ok(pose.arm.reachError < 1e-7)
      assert.ok(pose.arm.bladeScale > 0.35, 'the blade cannot collapse through its hilt')
    }
  }
})

test('no tip step exceeds 8% of viewport width across 200 progress intervals', () => {
  for (const [width, height] of viewports) {
    const layout = layoutAtAspect(width / height, width < 768), project = projection(width, height)
    let previous = project(bladePointAt(0, BLADE_LENGTH, new Vector3(), layout))
    for (let i = 1; i <= 200; i++) {
      const point = project(bladePointAt(i / 200, BLADE_LENGTH, new Vector3(), layout))
      assert.ok(point.distanceTo(previous) < width * 0.08, width + '×' + height + ', p=' + i / 200)
      previous = point
    }
  }
})

test('entry and exit have continuous tip velocity, including the contact slowdown', () => {
  for (const p of [0.1, 0.22, 0.28, IMPACT, 0.375, SLASH_END, 0.6, 0.65, 0.8]) {
    const epsilon = 1e-6
    const left = swordTipAt(p).sub(swordTipAt(p - epsilon)).divideScalar(epsilon)
    const right = swordTipAt(p + epsilon).sub(swordTipAt(p)).divideScalar(epsilon)
    assert.ok(left.distanceTo(right) < 0.12, 'C1 velocity at p=' + p)
  }
})

test('the blade tip follows the exact 45° line and the cut front tracks its travelled distance', () => {
  for (const [width, height] of viewports) {
    const layout = layoutAtAspect(width / height, width < 768), project = projection(width, height)
    const center = project(layout.nameCenter.clone()), entry = slashTipAt(IMPACT, layout)
    let last: Vector3 | undefined
    for (let i = 0; i <= 28; i++) {
      const p = IMPACT + (SLASH_END - IMPACT) * i / 28
      const tip = bladePointAt(p, BLADE_LENGTH, new Vector3(), layout), screen = project(tip.clone())
      assert.ok(Math.abs(screen.clone().sub(center).dot(CUT_NORMAL)) < 1e-6)
      assert.ok(Math.abs(cutStateAt(p, layout).length - entry.distanceTo(tip)) < 1e-7)
      if (last) {
        const direction = screen.clone().sub(last).normalize()
        const angle = Math.acos(Math.min(1, direction.dot(new Vector3(-1, 1, 0).normalize()))) * 180 / Math.PI
        assert.ok(angle < 2)
      }
      last = screen
    }
  }
})

test('halves only separate after exit, then hold at 4% viewport height and 2° tilt', () => {
  for (const [width, height] of viewports) {
    const layout = layoutAtAspect(width / height, width < 768)
    for (const p of [0, 0.3, 0.36, 0.42, 0.5, 0.52]) assert.equal(splitAt(p, layout).distance, 0)
    assert.ok(splitAt(0.6, layout).distance > 0)
    assert.equal(splitAt(0.68, layout).distance, layout.height * 0.04)
    assert.deepEqual(splitAt(0.7, layout).distance, splitAt(0.8, layout).distance)
    assert.equal(splitAt(0.8, layout).tilt, Math.PI / 90)
    assert.equal(cutStateAt(0).length, 0)
    assert.equal(cutStateAt(0.8).heat, 0)
  }
})

test('contact has a three-frame slowdown, a short flash, and 100ms virtual camera shake', () => {
  assert.ok(Math.abs(choreographyClock(0.375) - CONTACT_TIME - 3 / 60) < 1e-8)
  assert.equal(flashAt(IMPACT), 1)
  assert.notEqual(cameraAt(0.37).x, 0)
  assert.equal(cameraAt(0.42).x, 0)
  assert.equal(flashAt(0.42), 0)
  assert.equal(flashAt(0.3), 0)
})

test('spark budgets, emission rate, birth points, and seeded simulation match the brief', () => {
  const layout = layoutAtAspect(), data = makeSparkData(layout)
  assert.equal(data.count, 3500)
  assert.equal(data.burst, 800)
  assert.equal(data.embers, 200)
  assert.ok(Math.abs(data.stream / CUT_DURATION - 1500) < 1e-6)
  assert.equal(makeSparkData(layout, true).count, 1000)
  assert.deepEqual(data, makeSparkData(layout))
  for (let i = 0; i < data.count; i++) {
    assert.equal(sparkAt(data, i, 0, layout.height).alive, false)
    assert.ok(data.life[i] >= 0.399 && data.life[i] <= 1.801)
  }
})

test('at least 1000 real streaks remain alive inside the desktop viewport at p=0.60', () => {
  for (const [width, height] of [[1440, 900], [1280, 720], [2560, 1080]]) {
    const layout = layoutAtAspect(width / height), data = makeSparkData(layout), project = projection(width, height)
    let visible = 0
    for (let i = 0; i < data.count; i++) {
      const state = sparkAt(data, i, 0.6, layout.height)
      if (!state.alive || state.heat <= 0.03) continue
      const point = project(state.position)
      if (point.x > 0 && point.x < width && point.y > 0 && point.y < height) visible++
    }
    assert.ok(visible >= 1000, width + '×' + height + ': ' + visible)
  }
})

test('nearest physical scroll pixels reach the exact reference frames', () => {
  for (const [, height] of viewports) for (const p of [0, 0.12, 0.22, 0.3, 0.36, 0.42, 0.5, 0.6, 0.8, 1]) {
    const range = height * 3
    assert.equal(scrollProgressAt(Math.round(p * range) / range, range), p)
  }
})

test('particle random seeds are repeatable', () => {
  const a = seededRandom(72942), b = seededRandom(72942)
  assert.deepEqual(Array.from({ length: 3500 }, a), Array.from({ length: 3500 }, b))
})
