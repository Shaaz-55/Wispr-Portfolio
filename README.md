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

The story occupies **400vh**: a 100vh stage is pinned for 300vh of travel. One scrubbed ScrollTrigger writes progress `p` into a ref. The complete scene can be evaluated at any progress without playing earlier frames.

| Progress | Beat |
| --- | --- |
| 0.00–0.12 | Idle stance, drifting embers, camera push |
| 0.12–0.30 | Joint-based wind-up, embers attracted to the blade, rising bloom |
| 0.30–0.55 | Slash and fire ribbon; impact at 0.42 |
| 0.55–0.75 | Clipped text halves separate and tilt; molten cut and seam sparks |
| 0.75–1.00 | Camera travels through the cut into the conversation |

`src/scene/choreography.ts` holds the pose curves, camera motion, cut plane, and timing. The blade and trail share the same shoulder → elbow → wrist transforms. The trail reconstructs a 40-position ring from progress samples, so scrolling backward cannot leave stale positions behind.

The GPU particle shader evaluates position, gravity, flicker, and fade from scroll age. It draws 2,500 impact sparks plus 420 seam sparks on desktop; mobile uses 850 plus 170. The flash occupies one frame of a 12-second virtual choreography clock; camera shake spans 150 ms on that same clock. Their duration is controlled by scroll speed, and they reverse with the rest of the scene. There are no real-time impact timers. Only idle ember drift, scarf motion, flame flicker, and heat shimmer use elapsed time.

The character, blade, scarf, particle systems, and effects are original geometry/shaders. The font geometry is bundled from Three.js. Interface fonts are self-hosted through Fontsource; no remote fonts, models, textures, or image requests are required.

## Accessibility and performance

- DPR is capped at 1.75; mobile is capped at 1.3 with fewer particles.
- The render loop pauses when the stage leaves the screen, the tab is hidden, or the chat fully covers the scene.
- Reduced motion and unavailable WebGL both show a static typographic intro followed by an unpinned chat. The conversation stays fully usable.
- Keyboard users can use the skip link, navigation, suggestion buttons, and labeled form controls. Enter sends; Shift+Enter inserts a new line; IME composition does not accidentally submit.
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

`test` checks deterministic choreography, flash/shake duration, seeded particles, profile grounding, TODO handling, progressive SSE delivery, and message validation.

`verify` launches headless Chrome and creates:

- `artifacts/p-0.00.png`, `p-0.20.png`, `p-0.42.png`, `p-0.60.png`, and `p-1.00.png`.
- `artifacts/reverse-restored.png`, compared byte-for-byte with the initial screenshot.
- Conversation, selected-work, mobile, and reduced-motion screenshots.
- `artifacts/verification.json`, with checks, renderer counts, state snapshots, and frame timing.

On macOS the script uses the installed Google Chrome. Elsewhere, install Playwright’s Chromium with `npx playwright install chromium`, or set `CHROME_PATH` to your browser executable. Set `VERIFY_URL` to check another running origin. `--production` starts the compiled Express server on port 3002, runs the full suite against it, and stops that temporary server afterward; `VERIFY_PORT` can change that port.

The verification URL adds `?verify=1` to freeze only idle loops and decorative CSS animations. Production scroll choreography is unchanged. The small `window.__portfolio` diagnostic hook exposes progress, current scene state, and render stats for browser checks.

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
  App.tsx                     Page, navigation, fallbacks, chat transition
  styles.css                  Responsive charcoal / ember / gold styling
  scene/
    Scene.tsx                 Canvas, lighting, bloom, rendering lifecycle
    Forgewalker.tsx            Procedural joint hierarchy and scarf
    Blade.tsx                 Curved blade, molten core, flame shader
    FireTrail.tsx             Reconstructable 40-sample ribbon + fbm shader
    Sparks.tsx                GPU impact and seam particles
    SlicedName.tsx             Two text meshes, opposing clipping planes
    Embers.tsx                 Ambient particles and wind-up attraction
    HeatShimmer.tsx            Localized screen-space heat distortion
    choreography.ts           Pure scroll-to-state functions
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
