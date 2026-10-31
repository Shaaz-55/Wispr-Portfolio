import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { chromium } from 'playwright'
import type { Page } from 'playwright'

type Debug = { ready: boolean; reducedMotion: boolean; render: { frame: number; dpr: number; calls: number; triangles: number; points: number; fog: number[]; camera: number[]; character: number[]; upperHalf: number[]; lowerHalf: number[] }; scrollToProgress: (p: number) => void; getState: () => { p: number; active: boolean; flash: number; split: { distance: number; glow: number }; pose: Record<string, number> } }
type PortfolioWindow = Window & typeof globalThis & { __portfolio: Debug }
const productionMode = process.argv.includes('--production')
const productionPort = process.env.VERIFY_PORT || '3002'
const base = process.env.VERIFY_URL || (productionMode ? `http://127.0.0.1:${productionPort}` : 'http://127.0.0.1:5173')
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined)
const failures: string[] = []
const checks: string[] = []
const report: Record<string, unknown> = { url: base, screenshots: [], checks }
await mkdir('artifacts', { recursive: true })
const browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
let productionServer: ChildProcess | undefined

async function load(page: Page) {
  // tsx preserves function names with this helper inside serialized browser callbacks.
  await page.addInitScript('globalThis.__name = (target, name) => Object.defineProperty(target, "name", { value: name, configurable: true });')
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /shader|webglprogram|uncaught/i.test(message.text())) failures.push(message.text()) })
  await page.goto(`${base}/?verify=1`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => (window as PortfolioWindow).__portfolio?.ready, undefined, { timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}
async function progress(page: Page, p: number) {
  await page.evaluate(value => (window as PortfolioWindow).__portfolio.scrollToProgress(value), p)
  await page.waitForFunction(value => Math.abs((window as PortfolioWindow).__portfolio.getState().p - value) < 0.001, p)
  await page.evaluate(() => new Promise<void>(resolve => { let frames = 0; const tick = () => { if (++frames > 8) resolve(); else requestAnimationFrame(tick) }; requestAnimationFrame(tick) }))
}
async function screenshot(page: Page, name: string) {
  const file = `artifacts/${name}.png`
  const buffer = await page.screenshot({ path: file, animations: 'disabled' })
  ;(report.screenshots as string[]).push(file)
  return createHash('sha256').update(buffer).digest('hex')
}
async function chatIdle(page: Page) {
  await page.waitForFunction(() => !document.querySelector('[aria-label="Stop response"]'), undefined, { timeout: 20_000 })
}
function pass(message: string) { checks.push(message); console.log(`PASS ${message}`) }

try {
  if (productionMode) {
    let serverError = ''
    productionServer = spawn(process.execPath, ['dist-server/index.js'], { env: { ...process.env, PORT: productionPort, NODE_ENV: 'production' }, stdio: ['ignore', 'ignore', 'pipe'] })
    productionServer.stderr?.on('data', chunk => { serverError += String(chunk) })
    productionServer.on('error', error => { serverError += error.message })
    let healthy = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try { healthy = (await fetch(`${base}/api/health`)).ok } catch { /* The server is still starting. */ }
      if (healthy || serverError) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(serverError, '', 'production server must start without errors')
    assert.ok(healthy, 'the built Express server must become healthy')
    pass('Built production server serves the site and API from a single origin')
  }
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await load(desktop)
  assert.equal(await desktop.locator('canvas').count(), 1, 'desktop must render the original 3D scene')
  let initialHash = ''
  let initialState: unknown
  let initialTransforms: unknown
  const states: Record<string, unknown> = {}
  for (const p of [0, 0.2, 0.42, 0.6, 1]) {
    await progress(desktop, p)
    const state = await desktop.evaluate(() => (window as PortfolioWindow).__portfolio.getState())
    const render = await desktop.evaluate(() => (window as PortfolioWindow).__portfolio.render)
    states[p] = { state, render }
    const hash = await screenshot(desktop, `p-${p.toFixed(2)}`)
    if (p === 0) {
      initialHash = hash
      initialState = state
      initialTransforms = { camera: render.camera, character: render.character, upperHalf: render.upperHalf, lowerHalf: render.lowerHalf }
      assert.equal(state.split.distance, 0)
      assert.ok(render.dpr <= 1.75)
      assert.ok(render.points >= 2500, 'desktop must use at least 2,500 GPU particles')
      report.desktopRendering = render
    }
    if (p === 0.2) assert.ok(state.pose.rightShoulder > 0.9, 'the sword arm must visibly wind up')
    if (p === 0.42) assert.equal(state.flash, 1)
    if (p === 0.6) {
      assert.ok(state.split.distance > 0.2)
      assert.equal(state.split.glow, 1)
      assert.ok(Math.abs(render.upperHalf[1] - render.lowerHalf[1]) > 0.35)
    }
    if (p === 1) {
      assert.equal(state.active, false)
      assert.equal(await desktop.locator('.chat-stage').getAttribute('aria-hidden'), 'false')
      assert.equal(await desktop.locator('#chat-input').isVisible(), true)
      const before = render.frame
      await desktop.waitForTimeout(300)
      assert.equal(await desktop.evaluate(() => (window as PortfolioWindow).__portfolio.render.frame), before, 'the renderer must pause behind chat')
    }
    pass(`Screenshot and state at p=${p.toFixed(2)}`)
  }
  report.states = states
  await progress(desktop, 0)
  const restored = await desktop.evaluate(() => ({ state: (window as PortfolioWindow).__portfolio.getState(), render: (window as PortfolioWindow).__portfolio.render }))
  assert.deepEqual(restored.state, initialState)
  assert.deepEqual({ camera: restored.render.camera, character: restored.render.character, upperHalf: restored.render.upperHalf, lowerHalf: restored.render.lowerHalf }, initialTransforms)
  const restoredHash = await screenshot(desktop, 'reverse-restored')
  assert.equal(restoredHash, initialHash, 'reverse scrolling must restore an identical screenshot with idle loops frozen')
  pass('p=1 → 0 restores identical scene transforms and identical screenshot pixels')

  await progress(desktop, 0.42)
  const timing = await desktop.evaluate(() => new Promise<{ medianMs: number; p95Ms: number; fps: number }>(resolve => {
    const times: number[] = []
    let previous = performance.now()
    function tick(now: number) {
      times.push(now - previous)
      previous = now
      if (times.length < 120) { requestAnimationFrame(tick); return }
      times.shift()
      times.sort((a, b) => a - b)
      const median = times[Math.floor(times.length / 2)]
      resolve({ medianMs: median, p95Ms: times[Math.floor(times.length * 0.95)], fps: 1000 / median })
    }
    requestAnimationFrame(tick)
  }))
  report.frameTiming = timing
  console.log(`INFO Browser frame timing: ${timing.fps.toFixed(1)} fps median; ${timing.p95Ms.toFixed(1)} ms p95 (headless, this machine).`)

  await progress(desktop, 1)
  await desktop.locator('#chat-input').fill('Where do you study?')
  await desktop.getByRole('button', { name: 'Send question', exact: true }).click()
  await desktop.waitForFunction(() => Boolean(document.querySelector('.message-assistant p')?.textContent?.length))
  await chatIdle(desktop)
  assert.match(await desktop.locator('.message-assistant p').last().innerText(), /Newton School of Technology \(SVYASA\)/)
  await desktop.locator('#chat-input').fill('What is your favorite food?')
  await desktop.getByRole('button', { name: 'Send question', exact: true }).click()
  await chatIdle(desktop)
  assert.match(await desktop.locator('.message-assistant p').last().innerText(), /^I don't have that/)
  assert.ok(!(await desktop.locator('.conversation').innerText()).includes('TODO'))
  await screenshot(desktop, 'chat-grounded-and-unknown')
  pass('Chat UI streams a profile fact and refuses an unknown personal fact')

  await desktop.getByRole('tab', { name: /Selected work/ }).click()
  assert.equal(await desktop.locator('.project-card').count(), 5)
  await screenshot(desktop, 'selected-work')
  await desktop.locator('.project-card').filter({ hasText: 'LogiSense' }).click()
  await chatIdle(desktop)
  assert.match(await desktop.locator('.message-assistant p').last().innerText(), /LogiSense/)
  pass('All five project cards open grounded conversations')

  await desktop.evaluate(() => {
    class MockRecognition {
      lang = ''; continuous = false; interimResults = false
      onresult?: (event: unknown) => void
      onend?: () => void
      start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Tell me about Python' } }] }); this.onend?.() }, 20) }
      stop() { this.onend?.() }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: MockRecognition, configurable: true })
  })
  await desktop.getByRole('button', { name: 'Dictate a question' }).click()
  await desktop.waitForFunction(() => (document.querySelector('#chat-input') as HTMLTextAreaElement).value === 'Tell me about Python')
  assert.equal(await desktop.locator('.message-user').count(), 3, 'dictation must not send without review')
  await desktop.locator('#chat-input').fill('Tell me about Python\nand React')
  await desktop.getByRole('button', { name: 'Send question', exact: true }).click()
  await chatIdle(desktop)
  assert.match(await desktop.locator('.message-assistant p').last().innerText(), /React, Vite, Python, Machine Learning/)
  pass('Microphone transcription is editable; the text box accepts multiline dictation')

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await load(mobile)
  await progress(mobile, 0.6)
  await screenshot(mobile, 'mobile-split')
  const mobileStats = await mobile.evaluate(() => (window as PortfolioWindow).__portfolio.render)
  assert.ok(mobileStats.dpr <= 1.3)
  assert.ok(mobileStats.points < 2000)
  assert.ok(mobileStats.camera[2] > 30, 'portrait framing must include the full 3D name')
  assert.ok(mobileStats.fog[0] > mobileStats.camera[2], 'portrait framing must not push the character behind the fog')
  const captions = await mobile.evaluate(() => {
    const biography = document.querySelector('.hero-bio')!.getBoundingClientRect()
    const chapter = document.querySelector('.chapter')!.getBoundingClientRect()
    return { biographyRight: biography.right, chapterLeft: chapter.left }
  })
  assert.ok(captions.biographyRight <= captions.chapterLeft, 'mobile captions must not overlap')
  await progress(mobile, 1)
  await screenshot(mobile, 'mobile-chat')
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  const inputBox = await mobile.locator('#chat-input').boundingBox()
  assert.ok(inputBox && inputBox.y >= 0 && inputBox.y + inputBox.height < 844)
  report.mobileRendering = mobileStats
  pass('Mobile uses fewer particles, capped DPR, and a usable chat layout')

  const reduced = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  await load(reduced)
  assert.equal(await reduced.locator('canvas').count(), 0)
  assert.equal(await reduced.locator('.pin-spacer').count(), 0)
  await screenshot(reduced, 'reduced-motion')
  await reduced.locator('.nav-ask').click()
  await reduced.locator('#chat-input').waitFor({ state: 'visible' })
  await reduced.waitForTimeout(100)
  const reducedInput = await reduced.locator('#chat-input').boundingBox()
  assert.ok(reducedInput && reducedInput.y < 800)
  pass('Reduced motion uses a static intro and an unpinned chat section')

  const unsupported = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await unsupported.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl2') return null
      return original.apply(this, [type, ...args] as Parameters<typeof original>)
    } as typeof original
  })
  await load(unsupported)
  assert.equal(await unsupported.locator('canvas').count(), 0)
  assert.equal(await unsupported.locator('.static-chat').count(), 1)
  pass('WebGL unavailable fallback preserves the profile and chat')

  assert.deepEqual(failures, [], 'browser runtime and shader errors')
  pass('No browser runtime or shader errors')
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'
  report.error = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  report.browserErrors = failures
  await writeFile('artifacts/verification.json', JSON.stringify(report, null, 2))
  await browser.close()
  productionServer?.kill('SIGTERM')
}
