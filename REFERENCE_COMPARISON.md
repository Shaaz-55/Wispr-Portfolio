# Hero reference comparison

The seven supplied JPGs are visual references only; they are not shipped as site assets. Captures use the same 1280×720 framing as the reference images. Mobile captures use 390×844.

[View all nine captured poses together](artifacts/reference-sequence.png).

| Reference | Site capture | Comparison |
| --- | --- | --- |
| 01 — idle | [p=0](artifacts/reference-1280-p-0.00.png) | Black background, large white extruded name, low red blade, armoured figure with straw hat and trailing red cloth. The figure is positioned at about 65% width as requested, farther left than in the reference. |
| 02 — raised blade | [p=0.22](artifacts/reference-1280-p-0.22.png) | Vertical wind-up to the left of the face. The full blade fits in the frame; the reference crops its upper end. |
| 03 — body turn | [p=0.30](artifacts/reference-1280-p-0.30.png) | Hips lead the torso, the blade moves behind the shoulder and the scarf follows the turn. The procedural rig has simpler anatomy and less realistic cloth than the reference. |
| 04 — arrival | [p=0.36](artifacts/reference-1280-p-0.36.png) | The tip enters at the upper-right end of the diagonal cut, rather than the reference's horizontal entrance between the two words. |
| 05 — contact | [p=0.36](artifacts/reference-1280-p-0.36.png), [p=0.42](artifacts/reference-1280-p-0.42.png) | White-orange contact burst, local warm light, bright streaks and a slit that follows the tip. The short contact slowdown is encoded in the reversible virtual clock. |
| 06 — peak sparks | [p=0.50](artifacts/reference-1280-p-0.50.png), [p=0.60](artifacts/reference-1280-p-0.60.png) | Thousands of GPU streaks with falling, cooling particles across the left side. The diagonal contact path concentrates more of the late spray toward the lower-left than the horizontal reference. |
| 07 — follow-through | [p=0.60](artifacts/reference-1280-p-0.60.png), [p=0.80](artifacts/reference-1280-p-0.80.png) | Blade lowers, the halves separate and hold, and the hot seam cools while the last embers fall. The original reference does not show two detached diagonal text pieces. |

The model is an original procedural interpretation, not a photorealistic match: the face, plate silhouettes, surface wear and cloth have less detail than the video frames. No reference character, watermark or external model is included. The requested diagonal slice and separately moving text halves intentionally differ from the horizontal video effect.

The full build/test/browser results are produced by `npm run build`, `npm test` and `npm run verify -- --production`. `artifacts/verification.json` records measured framing, true black/white pixels, the tip/cut relationship, live and visible streak counts, actual streak pixels, exact rewind, chat, audio unlock and fallback checks. A capture-only preview is not a passing acceptance report.

## Recorded validation

- Production build and all 16 unit/API tests pass. All 12 browser acceptance groups pass, with no runtime or shader errors.
- The desktop figure occupies 82.6% of viewport height, with its origin at 64.9% of viewport width.
- At p=0.60, 2,227 desktop sparks are alive and 1,126 are inside the camera. The screenshot contains 4,846 hot streak pixels outside the name region.
- All nine poses were captured on desktop and mobile. Both restore the initial screenshot exactly after rewinding, including on the normal site.
- Seven additional viewport sizes pass the framing checks. Chat streaming, selected projects, dictation, keyboard skip, reduced motion and no-WebGL fallbacks pass.
- The final headless timing sample measured about **30 fps** (33.3 ms median, 33.4 ms p95). This run does not establish the 60 fps target on a physical midrange laptop. Text batching and simpler hat ribs reduce draw submissions and geometry; target-device profiling remains necessary for that performance claim.
