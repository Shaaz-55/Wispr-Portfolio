# Shaaz — Forged by curiosity

A scroll-driven portfolio with an original procedural swordsman, a flaming blade, a sliced 3D name, and a profile-grounded conversation. Built with Vite, React, TypeScript, Three.js, React Three Fiber, Drei, postprocessing, GSAP ScrollTrigger, and Express.

## Run locally

Use Node.js 22.12 or newer.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to the Express server at port 3001. Both processes run together; Ctrl+C stops them. Keep `PORT=3001` for local development, or update the proxy in `vite.config.ts` if you change it.

Chat works immediately without an API key. In that mode, the server streams deterministic answers assembled from the profile and the interface says “Answers from my real profile.”

To enable Gemini, set these values in `.env` and restart the server:

```dotenv
GEMINI_API_KEY=your_server_side_key
GEMINI_MODEL=gemini-2.5-flash
PORT=3001
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). The key stays in Express; do not prefix it with `VITE_`. `.env` is ignored by Git. Gemini answers stream through the server. If the provider is unavailable before generating text, the server falls back to a profile answer and updates the interface’s source label. An interrupted response shows a retry control.

## Edit the profile

**`data/profile.json` is the source of truth.** It includes education, location, skills, freelance work, five projects, personal stories, and contact links.

1. Edit the existing JSON fields. Keep the property names and JSON syntax intact.
2. Replace `TODO:` values only with real, shareable details. Leaving a TODO is fine: it is treated as unknown and is excluded from provider context.
3. Write `stories.mistakes`, `stories.risksTaken`, and `stories.ownership` in the first person. Include the situation, your own action, and a verified outcome.
4. Add each project’s actual scope, contribution, technologies, status, and results to its `details` or `status` field. General skills are never treated as proof that a project used a particular tool.
5. Replace contact TODOs with public links or an email you want visitors to have. Empty strings also count as unknown.

For example:

```json
{
  "stories": {
    "mistakes": "TODO: Add your real story here.",
    "risksTaken": "TODO: Add your real story here.",
    "ownership": "TODO: Add your real story here."
  },
  "contact": {
    "email": "TODO: Add a public email.",
    "github": "TODO: Add a public GitHub URL.",
    "linkedin": "TODO: Add a public LinkedIn URL.",
    "resume": "TODO: Add a public resume URL."
  }
}
```

The API reads the file on each request. Vite picks up edits to the project cards during development. **Rebuild and redeploy after profile changes in production**, because the browser’s project list is compiled into the frontend.

The grounding prompt is in `server/index.ts`. The deterministic fact selector is in `server/profile.ts`. Unknown questions are answered with “I don't have that information in my profile yet.” Missing stories, project details, and contacts use the same wording with a specific subject. If you add a new category of profile facts or rename projects, update the selector’s intents/aliases and tests as well.

## Scene and scroll behavior

The story occupies **400vh**: a 100vh stage is pinned for 300vh of travel. One ScrollTrigger supplies progress. Every visual state—including cloth, flame noise, the cut, spark physics and cooling—is a pure function of that progress. Stopping scroll holds the frame; reversing scroll reconstructs it exactly.

| Progress | Beat |
| --- | --- |
| 0.00–0.10 | Low, down-left red blade; two-line white name; figure about 80% of desktop height at x≈65% |
| 0.10–0.28 | Blade rises above the head, then coils behind the shoulder |
| 0.28–0.36 | Hips lead the body turn and planted lunge; blade approaches the upper-right cut entrance |
| 0.36–0.50 | One straight 45° tip path; slit opens behind the moving tip; contact burst and continuous streak emission |
| 0.50–0.65 | Follow-through and falling sparks; the halves begin separating after 0.52 |
| 0.65–0.80 | Calm lowered stance; each half holds 4% of viewport height from the cut, with 2° tilt |
| 0.82–1.00 | Camera travels through the seam into the existing chat |

`src/scene/choreography.ts` contains the C1 Hermite tip spline, monotone virtual clock, two-bone IK, blade-roll quaternion slerp and responsive layout. The contact clock slows for three virtual frames; the camera shake lasts 100 ms of virtual time. Tests project 200 progress intervals and require every tip step to be below 8% of viewport width. The actual rig and the motion-smear ghosts reconstruct the same shoulder → elbow → wrist hierarchy.

The name has a true-white unlit front face, bevelled grey sidewalls and visible extrusion. Two opposite clipping planes use screen-space normal `(1, 1, 0)` (world-space `(1, -1, 0)`). The kerf is discarded only behind the cut front. Cut caps are built from intersections with the real glyph contours, including holes. Their emissive edges cool from white/orange to dark red over 1.2 seconds of virtual age. The orange contact light illuminates the sides, with a local warm highlight on the white face during contact.

Sparks use one GPU draw of **3,500 stretched quads on desktop or 1,000 on mobile**, never point sprites. Desktop emission consists of 800 contact sparks, 2,500 sparks at roughly 1,500/sec during cutting, and 200 secondary embers. A few sparks become heavier droplets. Seeded births and log-normal speeds, a 100° spray cone with blade momentum, exponential drag, gravity, a small curl term, temperature and flicker are evaluated from the virtual clock. The first burst samples one exposure interval so it reads as streaks on the contact frame. The debug report counts both living particles and those inside the camera; a separate screenshot check verifies that streak pixels really render.

The original procedural figure has layered rounded armour, metallic noise bump, ember cracks, a ribbed straw hat, rope belt, articulated hands and greaves, and frayed cloth with vertex waves. Its shading uses a locally generated studio reflection environment, white/cool rim lighting and blade/contact lights. The background remains pure black, with no environment image, fog, ground, ambient specks or decorative text.

Below 768px, the name stacks above the figure and the approach/recovery path adapts to the taller composition. Portrait desktop layouts scale the model to fit. Reduced motion and unavailable WebGL show only the static white name on black, followed by the unpinned chat. A focus-only skip link remains available.

There are no downloaded models, images, textures, sounds or font requests. Character textures and reflection lighting are generated in code; the geometry font is bundled with Three.js and interface fonts are self-hosted.

### Optional synthesized sound

`useHeroAudio.ts` waits for a click/tap/key before creating an AudioContext. It synthesizes a detuned low hum, a filtered whoosh, a metallic shing, noise sizzle and bass impact. It fades out when the scene is inactive or the document is hidden. Verification/reduced-motion modes stay silent. Use `?sound=0` to opt out, or remove the single `useHeroAudio(...)` call in `App.tsx` to remove the feature. Audio one-shots fire on forward crossings; visual reversal never depends on audio timing.

### Swapping in a model later

`Scene` accepts an optional `characterModel` React component with the exported `CharacterProps` contract. A future local GLB adapter can use `useGLTF`, apply the `poseAt(p, layout)` joint quaternions to named bones and replace `Forgewalker` without changing scroll, text or effects. Keep the diagnostic node names (`forgewalker-hips`, `character-face`, `blade-base`, `blade-tip`, `blade-core`) if using the existing browser checks. No unused GLB is fetched.

## Accessibility and performance

- DPR is capped at 1.75; mobile is capped at 1.3 with fewer particles.
- The render loop pauses when the stage leaves the screen, the tab is hidden, or the chat fully covers the scene.
- Reduced motion and unavailable WebGL both show a static typographic intro followed by an unpinned chat. The conversation stays fully usable.
- Keyboard users can use the focus-only skip link, chat tabs, suggestion buttons, and labeled form controls. Enter sends; Shift+Enter inserts a new line; IME composition does not accidentally submit.
- The mic uses the browser’s Web Speech API on a user click. A final transcript goes into the editable text box and is never auto-submitted. Unsupported browsers can use OS keyboard dictation. Microphone support and permission vary by browser; HTTPS or localhost is required.
- Responses are rendered as plain text. Requests are limited in size and frequency, and provider calls are canceled on disconnect.

The target is 60 fps on a midrange laptop. The verification report records frame timing on the machine running the check; it is not a guarantee for every GPU or browser. Geometry is deliberately lightweight and the name, character, shaders, and fonts are loaded locally.

## Build and verify

```sh
npm run build
npm test
# Keep npm run dev running in another terminal:
npm run verify
# Or verify the compiled Express + Vite deployment together:
npm run verify -- --production
```

`build` type-checks both client and server, compiles the Vite frontend to `dist/`, and bundles the Express entry point to `dist-server/index.js`.

The tests cover deterministic reversal, the 45° cut front, C1 path continuity, the 8% maximum tip step, IK reach, separation/cooling, contact timing, particle budgets and visible particles, plus the existing profile and streaming API tests.

`verify` launches Chrome and writes:

- Desktop and mobile screenshots at p = 0, 0.12, 0.22, 0.30, 0.36, 0.42, 0.50, 0.60 and 0.80, named `artifacts/reference-{1280|390}-p-{progress}.png`.
- `artifacts/reference-sequence.png`, a labelled sheet containing all nine desktop poses.
- Exact initial/rewound image comparisons, including the normal site without verification mode.
- Responsive, conversation, selected-work, keyboard and fallback screenshots.
- `artifacts/verification.json` with pixel checks, actual projected meshes, the cut front, live/visible spark counts and frame timing.

The browser suite checks that the scene holds when scrolling stops, sound is locked before a gesture, the background is black, front-face pixels are white, the face stays clear, the full figure/blade fit, the slit follows the tip, and 1,000+ desktop streaks are visible at p=0.60. A pixel check also catches missing GPU draws that particle counters alone cannot detect.

On macOS it uses installed Google Chrome. Elsewhere, install Playwright Chromium or set `CHROME_PATH`. `VERIFY_URL` selects an existing server. `--production` starts the compiled Express server in deterministic profile mode on port 3002 and stops it afterward; `VERIFY_PORT` changes that port. `--capture-only` exports the nine poses for visual review and reports “captured,” never a verification pass.

`?verify=1` enables expensive mesh diagnostics and disables synthesized sound. It does not substitute a different animation. `window.__portfolio` exposes scene progress, actual render statistics and `render.sparks.live` / `render.sparks.visible`.

See [REFERENCE_COMPARISON.md](REFERENCE_COMPARISON.md) for the reference-frame mapping and remaining visual differences.

To manually inspect a streamed answer:

```sh
curl -N http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Where do you study?"}]}'
```

The SSE events are `meta`, `token`, `done`, and `error`. `/api/health` reports the active provider mode. The automated checks work without a real provider key; a live Gemini smoke test requires your own configured key.

## Deploy

Use a Node-capable host such as Render, Railway, Fly.io, or your own server. A static-only host cannot run `POST /api/chat`.

```sh
npm ci --include=dev
npm run build
npm start
```

Express serves both the compiled site and `/api` on `PORT` (default 3001), so production uses a single origin. Run commands from the project root and retain **`dist/`, `dist-server/`, `data/profile.json`, `package.json`, and production dependencies**. Do not deploy only `dist/` if you want chat to work.

For Render:

1. Push this project to your repository and create a **Web Service**, with this directory as the root directory.
2. Choose Node, use `npm ci --include=dev && npm run build` as the build command, and `npm start` as the start command.
3. Set `NODE_ENV=production` and `TRUST_PROXY=1`. Let Render provide `PORT`.
4. Optionally set `GEMINI_API_KEY` and `GEMINI_MODEL` in the host’s secret environment settings.
5. Deploy, then check `/api/health` and a streamed conversation. Enable HTTPS for microphone support.

For a reverse proxy, turn off response buffering and compression for `/api/chat`, pass through the streaming connection, and allow at least 40 seconds before timing it out. Express sends `X-Accel-Buffering: no` and `Cache-Control: no-cache, no-transform`. Set `TRUST_PROXY=1` only when the app is behind one trusted proxy so the per-IP request limit uses the visitor’s address.

## Files

```text
src/
  App.tsx                     Minimal hero, accessible skip link, fallbacks, chat transition
  styles.css                  Black hero and fallbacks; responsive chat styling
  scene/
    Scene.tsx                 Canvas, lighting, bloom, rendering lifecycle
    Forgewalker.tsx            Original layered armour, straw hat and joint hierarchy
    Blade.tsx                 Straight red energy blade, bright core, crimson flame
    FireTrail.tsx             Low-alpha blade motion-smear ghosts
    Sparks.tsx                Batched GPU spark streak quads
    particleSimulation.ts     Seeded emission and closed-form physics
    proceduralMaterials.ts    Locally generated armour/cloth textures
    Cloth.tsx                 Frayed progress-driven vertex waves
    useHeroAudio.ts           Optional gesture-unlocked Web Audio synthesis
    SlicedName.tsx             White bevelled text, moving slit and molten cut caps
    choreography.ts           Responsive layout, IK, pure scroll-to-state functions
    diagnostics.ts            Shared browser-verification types
    useScrollProgress.ts      The single pinned ScrollTrigger
  chat/
    ChatPanel.tsx             Streaming conversation and selected work
    MicButton.tsx             Web Speech API and dictation fallback
server/
  index.ts                    Express, persona prompt, Gemini, SSE
  profile.ts                  Verified fact selection and TODO filtering
data/profile.json             Editable facts about Shaaz
.env.example                  Server-only configuration template
scripts/verify.ts             End-to-end browser acceptance checks
tests/                        Choreography and streaming API tests
```
