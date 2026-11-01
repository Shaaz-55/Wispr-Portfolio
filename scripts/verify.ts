import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import type { PortfolioDebug, RenderStats, ScreenBounds } from '../src/scene/diagnostics'

type PortfolioWindow = Window & typeof globalThis & { __portfolio: PortfolioDebug & { render: RenderStats } }
const productionMode = process.argv.includes('--production')
const captureOnly = process.argv.includes('--capture-only')
const productionPort = process.env.VERIFY_PORT || '3002'
const base = process.env.VERIFY_URL || (productionMode ? `http://127.0.0.1:${productionPort}` : 'http://127.0.0.1:5173')
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.CHROME_PATH || (existsSync(macChrome) ? macChrome : undefined)
const failures: string[] = []
const checks: string[] = []
const report: Record<string, unknown> = { url: base, screenshots: [], checks }
await mkdir('artifacts', { recursive: true })
let browser: Browser | undefined
let productionServer: ChildProcess | undefined
let currentPage: Page | undefined

async function load(page: Page, frozen = true) {
  currentPage = page
  // tsx preserves function names with this helper inside browser callbacks.
  await page.addInitScript('globalThis.__name = (target, name) => Object.defineProperty(target, "name", { value: name, configurable: true });')
  page.on('pageerror', error => failures.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && /shader|webglprogram|uncaught/i.test(message.text())) failures.push(message.text()) })
  await page.goto(`${base}/${frozen ? '?verify=1' : ''}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => (window as PortfolioWindow).__portfolio?.ready, undefined, { timeout: 60_000 })
  await page.evaluate(() => document.fonts.ready)
}
async function progress(page: Page, p: number) {
  currentPage = page
  await page.evaluate(value => (window as PortfolioWindow).__portfolio.scrollToProgress(value), p)
  await page.waitForFunction(value => Math.abs((window as PortfolioWindow).__portfolio.getState().p - value) < 0.001, p)
  await page.evaluate(() => new Promise<void>(resolve => { let frames = 0; const tick = () => { if (++frames > 8) resolve(); else requestAnimationFrame(tick) }; requestAnimationFrame(tick) }))
}
async function screenshot(page: Page, name: string) {
  const file = `artifacts/${name}.png`
  const buffer = await page.screenshot({ path: file, animations: 'disabled', scale: 'css' })
  ;(report.screenshots as string[]).push(file)
  return { hash: createHash('sha256').update(buffer).digest('hex'), buffer }
}
async function snapshot(page: Page) {
  return page.evaluate(() => ({ state: (window as PortfolioWindow).__portfolio.getState(), render: (window as PortfolioWindow).__portfolio.render }))
}
async function chatIdle(page: Page) {
  await page.waitForFunction(() => !document.querySelector('[aria-label="Stop response"]'), undefined, { timeout: 20_000 })
}
function pass(message: string) { checks.push(message); console.log(`PASS ${message}`) }

async function visibleText(page: Page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const visible: string[] = []
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!node.textContent?.trim()) continue
      let element = node.parentElement
      let hidden = false
      while (element) {
        const css = getComputedStyle(element)
        if (['SCRIPT', 'STYLE'].includes(element.tagName) || css.display === 'none' || css.visibility !== 'visible' || Number(css.opacity) === 0 || css.clip === 'rect(0px, 0px, 0px, 0px)') { hidden = true; break }
        element = element.parentElement
      }
      if (hidden) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      if (Array.from(range.getClientRects()).some(rect => rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight && rect.width > 0 && rect.height > 0)) visible.push(node.textContent.trim())
    }
    return visible
  })
}
async function heroDOM(page: Page, fallback = false) {
  assert.deepEqual(await visibleText(page), fallback ? ['Shaaz', 'Hemani'] : [], 'the hero must have no visible DOM text except the fallback name')
  assert.equal(await page.locator('h1').textContent(), 'Shaaz Hemani')
  assert.equal(await page.locator('h1').evaluate(element => getComputedStyle(element).clip), 'rect(0px, 0px, 0px, 0px)')
  const backgrounds = await page.evaluate(() => ['html', 'body', '#root', '.story-stage', ...(document.querySelector('.static-art') ? ['.static-art'] : ['.scene-canvas', 'canvas'])].map(selector => ({ selector, color: getComputedStyle(document.querySelector(selector)!).backgroundColor })))
  for (const item of backgrounds) assert.equal(item.color, 'rgb(0, 0, 0)', `${item.selector} must be black`)
}

async function pixels(page: Page, buffer: Buffer, bounds: ScreenBounds, label: string, samples: number[][] = []) {
  const result = await page.evaluate(async ({ png, bounds, samples }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${png}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, image.width, image.height)
    const pixel = (x: number, y: number) => Array.from(data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))
    const corners = [[0, 0], [image.width - 16, 0], [0, image.height - 16], [image.width - 16, image.height - 16]].map(([left, top]) => {
      let nonBlack = 0
      for (let y = top; y < top + 16; y++) for (let x = left; x < left + 16; x++) { const [r, g, b, a] = pixel(x, y); if (r || g || b || a !== 255) nonBlack++ }
      return { pixel: pixel(left, top), nonBlack }
    })
    let white = 0, ink = 0, chromatic = 0
    const bands: Array<{ top: number; bottom: number; left: number; right: number }> = []
    let band: typeof bands[number] | undefined
    for (let y = Math.max(0, Math.floor(bounds.top)); y < Math.min(image.height, Math.ceil(bounds.bottom)); y++) {
      let rowWhite = 0, left = image.width, right = 0
      for (let x = Math.max(0, Math.floor(bounds.left)); x < Math.min(image.width, Math.ceil(bounds.right)); x++) {
        const [r, g, b] = pixel(x, y)
        if (r + g + b > 40) { ink++; if (Math.max(r, g, b) - Math.min(r, g, b) > 3) chromatic++ }
        if (r === 255 && g === 255 && b === 255) { white++; rowWhite++; left = Math.min(left, x); right = Math.max(right, x) }
      }
      if (rowWhite >= 3) {
        if (!band) { band = { top: y, bottom: y, left, right }; bands.push(band) }
        band.bottom = y; band.left = Math.min(band.left, left); band.right = Math.max(band.right, right)
      } else band = undefined
    }
    const facePixels = samples.map(([x, y]) => pixel(Math.round(x), Math.round(y)))
    const pureFacePixels = facePixels.filter(([r, g, b]) => r === 255 && g === 255 && b === 255).length
    return { corners, white, ink, chromatic, bands, faceSamples: facePixels.length, pureFacePixels }
  }, { png: buffer.toString('base64'), bounds, samples })
  for (const corner of result.corners) assert.equal(corner.nonBlack, 0, `${label}: every pixel in each 16×16 corner must be #000000`)
  assert.ok(result.white > 300, `${label}: the name must contain true #FFFFFF pixels`)
  // Grey sidewalls and bevels now contribute to the overall ink area.
  // Test actual front-face triangle interiors separately from those sides.
  if (samples.length) assert.ok(result.pureFacePixels / result.faceSamples > 0.92, `${label}: front-face samples must be true #FFFFFF (${result.pureFacePixels}/${result.faceSamples})`)
  else assert.ok(result.white / result.ink > 0.8, `${label}: fallback name interiors must be pure white`)
  assert.equal(result.bands.length, 2, `${label}: the name must have exactly two lines`)
  const domLines = await page.locator('.static-name > span').evaluateAll(elements => elements.map(element => ({ left: element.getBoundingClientRect().left, fontSize: getComputedStyle(element).fontSize })))
  // CSS fonts have different side bearings for S and H. Check their line
  // boxes; the 3D geometry has zero side bearings, so compare its ink edges.
  if (domLines.length) {
    assert.equal(domLines[0].left, domLines[1].left, `${label}: both line boxes must be left aligned`)
    assert.equal(domLines[0].fontSize, domLines[1].fontSize)
  } else assert.ok(Math.abs(result.bands[0].left - result.bands[1].left) < 3, `${label}: both lines must be left aligned`)
  const heights = result.bands.map(band => band.bottom - band.top)
  assert.ok(heights[0] / heights[1] > 0.92 && heights[0] / heights[1] < 1.12, `${label}: both lines must use the same font size`)
  return result
}


function fullBody(render: RenderStats, width: number, height: number, label: string) {
  for (const [part, box] of Object.entries({ figure: render.screen!.character, blade: render.screen!.blade })) {
    assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height, label + ': ' + part + ' is clipped: ' + JSON.stringify(box))
  }
}
function faceClear(render: RenderStats) {
  const { face, bladeBase: a, bladeTip: b } = render.screen!
  const x = (face.left + face.right) / 2, y = (face.top + face.bottom) / 2
  const rx = (face.right - face.left) * 0.32, ry = (face.bottom - face.top) * 0.28
  for (let i = 0; i <= 64; i++) {
    const t = i / 64, px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t
    assert.ok(((px - x) / rx) ** 2 + ((py - y) / ry) ** 2 > 1, 'the blade must clear the face')
  }
}
function idleLayout(render: RenderStats, width: number, height: number, mobile: boolean) {
  assert.equal(render.background, '000000')
  assert.equal(render.clearColor, '000000')
  assert.equal(render.fog, false)
  assert.deepEqual(render.nameLines, ['Shaaz', 'Hemani'])
  assert.deepEqual(render.nameMaterial, { type: 'MeshBasicMaterial', color: 'ffffff', toneMapped: false })
  const screen = render.screen!
  assert.ok(Math.abs(screen.name.left / width - 0.08) < 0.016, 'left aligned name with an 8% margin and visible extrusion')
  fullBody(render, width, height, 'Idle')
  assert.ok(screen.bladeTip[0] < screen.bladeBase[0] && screen.bladeTip[1] > screen.bladeBase[1], 'idle blade points down-left')
  assert.equal(render.sparks.live, 0)
  if (mobile) {
    assert.ok(screen.character.top > screen.name.bottom + 8, 'the mobile figure sits below the name')
  } else {
    const x = screen.characterOrigin[0] / width
    assert.ok(x >= 0.62 && x <= 0.68, 'the figure stands at about 65% of the width')
    if (width / height > 1.3) {
      const heightRatio = (screen.character.bottom - screen.character.top) / height
      assert.ok(heightRatio >= 0.76 && heightRatio <= 0.86, 'the figure occupies about 80% of the height')
    }
  }
}
function diagonal(render: RenderStats, label: string) {
  const screen = render.screen!
  const distance = (point: number[]) => Math.abs(point[0] - screen.nameCenter[0] + point[1] - screen.nameCenter[1]) / Math.SQRT2
  assert.ok(distance(screen.bladeTip) < 0.15, label + ': rendered tip follows the 45° line')
  for (const point of screen.trail) assert.ok(distance(point) < 0.15)
  return { tipLineDistance: distance(screen.bladeTip), cut: render.cut }
}
async function sparkPixels(page: Page, buffer: Buffer, name: ScreenBounds) {
  const count = await page.evaluate(async ({ png, name }) => {
    const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode()
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0)
    const data = ctx.getImageData(0, 0, image.width, image.height).data
    let hot = 0
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width * 0.53; x++) {
      if (y >= name.top - 24 && y <= name.bottom + 24) continue
      const i = (y * image.width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2]
      if (r > 100 && g > 25 && r > g * 1.08 && g > b * 1.35) hot++
    }
    return hot
  }, { png: buffer.toString('base64'), name })
  assert.ok(count > 500, 'GPU sparks must produce visible hot streak pixels outside the name, not just a live counter: ' + count)
  return count
}

try {
  if (productionMode) {
    let serverError = ''
    productionServer = spawn(process.execPath, ['dist-server/index.js'], { env: { ...process.env, PORT: productionPort, NODE_ENV: 'production', GEMINI_API_KEY: '' }, stdio: ['ignore', 'ignore', 'pipe'] })
    productionServer.stderr?.on('data', chunk => { serverError += String(chunk) })
    productionServer.on('error', error => { serverError += error.message })
    let healthy = false
    for (let attempt = 0; attempt < 50; attempt++) {
      try { healthy = (await fetch(base + '/api/health')).ok } catch { /* Starting. */ }
      if (healthy || serverError) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(serverError, '')
    assert.ok(healthy)
    pass('Built production server serves the site and API from one origin')
  }
  browser = await chromium.launch({ executablePath, headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] })
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const captures = []
  for (const [page, width, height, isMobile] of [[desktop, 1280, 720, false], [mobile, 390, 844, true]] as const) {
    await load(page)
    let initialHash = '', initialState: unknown
    let entryTip: number[] | undefined, exitTip: number[] | undefined
    const cutFrames: Array<{ fraction: number; tip: number[] }> = []
    for (const p of [0, 0.12, 0.22, 0.3, 0.36, 0.42, 0.5, 0.6, 0.8]) {
      await progress(page, p)
      const { state, render } = await snapshot(page)
      const capture = await screenshot(page, 'reference-' + width + '-p-' + p.toFixed(2))
      captures.push({ width, height, p, state, render })
      if (captureOnly) continue
      await heroDOM(page); fullBody(render, width, height, 'p=' + p); faceClear(render)
      if (p === 0) {
        initialHash = capture.hash; initialState = state
        idleLayout(render, width, height, isMobile)
        report[isMobile ? 'mobilePixels' : 'desktopPixels'] = await pixels(page, capture.buffer, render.screen!.name, isMobile ? 'Mobile' : 'Desktop', render.screen!.frontFaceSamples)
        assert.ok(render.dpr <= (isMobile ? 1.3 : 1.75))
        assert.equal(render.sparks.count, isMobile ? 1000 : 3500)
        assert.equal(await page.locator('.pin-spacer').count(), 1)
        assert.equal(await page.locator('#story').evaluate(element => element.getBoundingClientRect().height / innerHeight), 4)
      }
      if (p >= 0.36 && p <= 0.5) {
        diagonal(render, width + ' p=' + p)
        cutFrames.push({ fraction: render.cut.progress, tip: render.screen!.bladeTip })
        if (p === 0.36) { entryTip = render.screen!.bladeTip; assert.equal(state.flash, 1); assert.ok(render.sparks.live >= (isMobile ? 230 : 800)) }
        if (p === 0.5) exitTip = render.screen!.bladeTip
      }
      if (p <= 0.5) assert.equal(state.split.distance, 0)
      if (p === 0.6) {
        assert.ok(state.split.distance > 0)
        assert.ok(state.split.glow > 0.5)
        assert.ok(render.upperHalf![0] < render.lowerHalf![0] && render.upperHalf![1] > render.lowerHalf![1])
        assert.equal(render.sparks.primitive, 'GPU streak quads')
        if (!isMobile) {
          assert.ok(render.sparks.visible >= 1000, 'at least 1000 visible streaks at p=0.60')
          report.sparkPixels = await sparkPixels(page, capture.buffer, render.screen!.name)
        }
      }
    }
    if (!captureOnly) {
      const length = Math.hypot(exitTip![0] - entryTip![0], exitTip![1] - entryTip![1])
      for (const frame of cutFrames) assert.ok(Math.abs(Math.hypot(frame.tip[0] - entryTip![0], frame.tip[1] - entryTip![1]) / length - frame.fraction) < 0.002, 'slit length tracks tip travel')
      await progress(page, 1)
      assert.equal((await snapshot(page)).state.active, false)
      const frame = (await snapshot(page)).render.frame
      await page.waitForTimeout(150)
      assert.equal((await snapshot(page)).render.frame, frame, 'renderer pauses behind chat')
      await progress(page, 0)
      assert.deepEqual((await snapshot(page)).state, initialState)
      assert.equal((await screenshot(page, 'reverse-' + width)).hash, initialHash, 'rewind restores exact pixels, heals the cut and removes all sparks')
      pass(width + 'px: all nine reference frames, pure pixels, cut, sparks, face clearance, framing and exact rewind')
    }
  }
  report.captures = captures
  const sequence = await Promise.all(captures.filter(capture => capture.width === 1280).map(async capture => ({ p: capture.p, png: (await readFile('artifacts/reference-1280-p-' + capture.p.toFixed(2) + '.png')).toString('base64') })))
  const sheet = await desktop.evaluate(async frames => {
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1170
    const context = canvas.getContext('2d')!
    context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height)
    context.font = '16px sans-serif'; context.fillStyle = '#ddd'
    for (const [index, frame] of frames.entries()) {
      const image = new Image(); image.src = 'data:image/png;base64,' + frame.png; await image.decode()
      const x = index % 3 * 640, y = Math.floor(index / 3) * 390
      context.drawImage(image, x, y + 30, 640, 360)
      context.fillText('p = ' + frame.p.toFixed(2), x + 16, y + 22)
    }
    return canvas.toDataURL('image/png').split(',')[1]
  }, sequence)
  await writeFile('artifacts/reference-sequence.png', Buffer.from(sheet, 'base64'))
  ;(report.screenshots as string[]).push('artifacts/reference-sequence.png')
  await mobile.close()
  if (!captureOnly) {
    const live = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
    await live.addInitScript('window.__audioContexts = 0; const OriginalAudioContext = window.AudioContext; window.AudioContext = new Proxy(OriginalAudioContext, { construct(target, args) { window.__audioContexts++; return Reflect.construct(target, args); } });')
    await load(live, false)
    await progress(live, 0)
    const initial = await screenshot(live, 'live-initial')
    assert.equal(await live.evaluate('window.__audioContexts'), 0, 'audio stays locked before a gesture')
    await live.mouse.click(12, 12)
    await live.waitForFunction('window.__audioContexts === 1')
    await progress(live, 0.31)
    const heldProgress = (await snapshot(live)).state.p
    const held = await screenshot(live, 'live-scrub-held')
    await live.waitForTimeout(220)
    assert.equal((await snapshot(live)).state.p, heldProgress, 'motion is controlled entirely by scrub progress')
    assert.equal((await screenshot(live, 'live-scrub-still-held')).hash, held.hash)
    for (const p of [0.42, 0.6, 0.8, 1, 0]) await progress(live, p)
    assert.equal((await screenshot(live, 'live-reverse-restored')).hash, initial.hash)
    await live.close()
    pass('Live scene holds without timers, reverses pixel for pixel, and unlocks synthesis only after a gesture')

    const responsive = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    await load(responsive)
    const responsiveStates = []
    for (const [width, height] of [[1440, 900], [768, 1024], [1024, 768], [2560, 1080], [320, 568], [767, 600], [667, 375]]) {
      await progress(responsive, 0)
      await responsive.setViewportSize({ width, height })
      await responsive.waitForFunction(() => { const viewport = (window as PortfolioWindow).__portfolio.render.viewport; return viewport[0] === innerWidth && viewport[1] === innerHeight })
      await progress(responsive, 0)
      const idle = await snapshot(responsive)
      idleLayout(idle.render, width, height, width < 768)
      await heroDOM(responsive)
      await screenshot(responsive, 'layout-' + width + 'x' + height)
      for (const p of [0.36, 0.42, 0.6, 0.8]) {
        await progress(responsive, p)
        const sample = await snapshot(responsive)
        fullBody(sample.render, width, height, width + '×' + height + ' p=' + p)
        faceClear(sample.render)
        if (p <= 0.5) diagonal(sample.render, width + 'px')
      }
      responsiveStates.push({ width, height, idle })
    }
    report.responsive = responsiveStates
    await responsive.close()
    pass('Resizing, portrait, desktop, ultrawide, narrow mobile and landscape preserve framing')

    await desktop.bringToFront()
    await progress(desktop, 0.42)
    await desktop.waitForFunction(() => (window as PortfolioWindow).__portfolio.getState().active)
    report.frameTiming = await desktop.evaluate(() => new Promise(resolve => {
      const frames: number[] = []; let previous = performance.now()
      const tick = (now: number) => {
        frames.push(now - previous); previous = now
        if (frames.length < 61) { requestAnimationFrame(tick); return }
        frames.shift(); frames.sort((a, b) => a - b)
        resolve({ medianMs: frames[30], p95Ms: frames[57], fps: 1000 / frames[30] })
      }
      requestAnimationFrame(tick)
    }))
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
  pass('Five project cards render, and selecting a project opens a grounded conversation')

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

  const reduced = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' })
  await load(reduced)
  assert.equal(await reduced.locator('canvas').count(), 0)
  assert.equal(await reduced.locator('.pin-spacer').count(), 0)
  await heroDOM(reduced, true)
  const reducedBox = await reduced.locator('.static-name').boundingBox()
  assert.ok(reducedBox)
  report.reducedPixels = await pixels(reduced, (await screenshot(reduced, 'reduced-motion')).buffer, { left: reducedBox.x, top: reducedBox.y, right: reducedBox.x + reducedBox.width, bottom: reducedBox.y + reducedBox.height }, 'Reduced motion')
  const skipBox = await reduced.locator('.skip-link').boundingBox()
  assert.ok(skipBox && skipBox.y + skipBox.height <= 0, 'skip link stays offscreen until keyboard focus')
  await reduced.keyboard.press('Tab')
  assert.equal(await reduced.locator('.skip-link').evaluate(element => element === document.activeElement), true)
  const focusedBox = await reduced.locator('.skip-link').boundingBox()
  assert.ok(focusedBox && focusedBox.y >= 0)
  await screenshot(reduced, 'keyboard-skip-link')
  await reduced.keyboard.press('Enter')
  assert.equal(await reduced.locator('#chat-input').evaluate(element => element === document.activeElement), true)
  const reducedInput = await reduced.locator('#chat-input').boundingBox()
  assert.ok(reducedInput && reducedInput.y >= 0 && reducedInput.y < 800)
  pass('Reduced motion shows only the white two-line name; the focus-only skip link reaches the unpinned chat')

  await progress(desktop, 0)
  await desktop.locator('.skip-link').focus()
  await desktop.keyboard.press('Enter')
  await desktop.waitForFunction(() => document.activeElement?.id === 'chat-input')
  assert.equal((await snapshot(desktop)).state.p, 1)
  await desktop.locator('.skip-link').focus()
  await desktop.keyboard.press('Enter')
  assert.equal(await desktop.locator('#chat-input').evaluate(element => element === document.activeElement), true)
  pass('Keyboard skip also reaches and focuses chat through the pinned story')

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
  await heroDOM(unsupported, true)
  const unsupportedBox = await unsupported.locator('.static-name').boundingBox()
  assert.ok(unsupportedBox)
  report.noWebGLPixels = await pixels(unsupported, (await screenshot(unsupported, 'no-webgl')).buffer, { left: unsupportedBox.x, top: unsupportedBox.y, right: unsupportedBox.x + unsupportedBox.width, bottom: unsupportedBox.y + unsupportedBox.height }, 'No WebGL')
  pass('No-WebGL fallback has a black background, white two-line name, and no other hero text')


    assert.deepEqual(failures, [], 'browser runtime and shader errors')
    pass('No browser runtime or shader errors')
    report.result = 'passed'
  } else {
    assert.deepEqual(failures, [], 'browser runtime and shader errors')
    report.result = 'captured for visual review'
  }
} catch (error) {
  report.result = 'failed'
  report.error = error instanceof Error ? error.message : String(error)
  if (currentPage && !currentPage.isClosed()) {
    await screenshot(currentPage, 'verification-failure').catch(() => {})
    report.failureState = await snapshot(currentPage).catch(() => null)
  }
  throw error
} finally {
  report.browserErrors = failures
  await writeFile(captureOnly ? 'artifacts/reference-preview.json' : 'artifacts/verification.json', JSON.stringify(report, null, 2))
  await browser?.close()
  productionServer?.kill('SIGTERM')
}
