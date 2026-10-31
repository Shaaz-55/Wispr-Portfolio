import assert from 'node:assert/strict'
import test from 'node:test'
import { bladePointAt, cameraAt, flashAt, poseAt, seededRandom, splitAt } from '../src/scene/choreography'

test('every scene state is exactly reproducible after forward and reverse traversal', () => {
  const frames = Array.from({ length: 201 }, (_, i) => i / 200)
  const snapshot = (p: number) => ({ pose: poseAt(p), blade: bladePointAt(p).toArray(), camera: cameraAt(p), split: splitAt(p), flash: flashAt(p) })
  const forward = frames.map(snapshot)
  const backward = [...frames].reverse().map(snapshot).reverse()
  assert.deepEqual(backward, forward)
})

test('the name is whole before contact and separates on both sides afterward', () => {
  assert.equal(splitAt(0).distance, 0)
  assert.equal(splitAt(0.3).distance, 0)
  assert.ok(splitAt(0.6).distance > 0.2)
  assert.equal(splitAt(0.6).glow, 1)
  assert.ok(splitAt(1).distance > 2)
  assert.ok(cameraAt(1).z < 1.2)
})

test('the complete joint hierarchy holds its idle pose until the wind-up', () => {
  assert.deepEqual(poseAt(0.06), poseAt(0))
  assert.deepEqual(poseAt(0.12), poseAt(0))
  assert.notEqual(poseAt(0.2).leftWrist, poseAt(0).leftWrist)
  assert.ok(cameraAt(0.1).z < cameraAt(0).z)
})

test('portrait framing fits the full name width and still pushes through the gap', () => {
  const aspect = 390 / 844
  const horizontalWidth = 2 * cameraAt(0.6, aspect).z * Math.tan(39 * Math.PI / 360) * aspect
  assert.ok(horizontalWidth > 11)
  assert.ok(cameraAt(1, aspect).z < 1.2)
})

test('impact flash and camera shake are bounded to their virtual durations', () => {
  assert.equal(flashAt(0.42), 1)
  assert.equal(flashAt(0.42 + 1 / 60 / 12), 0)
  assert.equal(flashAt(0.41), 0)
  assert.notEqual(cameraAt(0.424).x, 0)
  assert.equal(cameraAt(0.42 + 0.151 / 12).x, 0)
  assert.equal(cameraAt(0.419).x, 0)
})

test('particles use repeatable seeds', () => {
  const a = seededRandom(72942), b = seededRandom(72942)
  assert.deepEqual(Array.from({ length: 3000 }, a), Array.from({ length: 3000 }, b))
})
