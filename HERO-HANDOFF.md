# Hero handoff (2026-11-15)

**Next task:** finish and visually test one realistic foreground burn patch from the opening view and the closest pass.
**Keep:** the live Three.js scene, the existing scroll path and hills, and the realistic trees and flames. **No** full-screen video and **no** static hero images in the hero.

## Saved (uncommitted, nothing committed)
- `frontend/index.html`: the hero is `.valley-journey > section.fire-valley > canvas#valleyCanvas`. It loads `fire-valley.css?v=forest6` and `fire-valley.js?v=forest12`. The old `punjab.jpg` `<img>` is removed.
- `frontend/assets/fire-valley.js` (untracked, 474 lines) contains these functions: `terrain` (l.40, procedural shader colour plus the `burn` attribute), `pine` (l.129, includes `scorched` and `snag` kinds), `forest` (l.176), `billboards` (l.264), `combustion` (l.274, rim and interior flames, embers, 2 PointLights) and `start` (l.412).
- Burn patches are `[x,z,rx,rz]` ellipses in `patches`. The closest one to the opening camera is `[-22,34,14,16]`. The camera path starts at `[0,24,68]` and progress is mapped to `.012 + p*.89`.
- Untracked assets: `frontend/assets/forest/` (21 textures), `valley-forest-floor.jpg` and `valley-pine.png`.

## Verified by reading code only
- The hero markup has no `<video>` and no `<img>`. Reduced motion and the pause button (`#valleyMotion`) are handled.
- Nothing outside `vendor/` references `forest/`, `valley-forest-floor`, `valley-pine` or `TextureLoader`. These assets are unused.

## Foreground burn patch: verified in browser (2026-11-15)
- Checked the local preview at http://localhost:8765 in an 800×600 window.
- The foreground patch is `[-22,34,14,16]`. On load (scroll 0) it is the burn ring at bottom-left. The closest pass where it is still in frame is scrollY ≈ 67 (progress ≈ 0.05). It is partly visible at scrollY 94 and gone after that.
- Both views were screenshotted after the changes below. The console shows no shader or JS errors.
- The hills, the scroll path, the camera and the other patches are unchanged.
- What changed in `fire-valley.js`. All of it applies only to this patch.
  - Terrain shader: a `hero` mask is the ellipse around (-22,34) with radii 14,16, eased from 1.25 to 1.6. The ground goes from a scorched brown band outside the front, to a black char line at the front, to an ash/char interior with streaks and flakes.
  - Terrain glow: a broken, moving front line plus an ember bed just behind it. Thin, sparse crack glow sits only in a narrow band behind the front, and slow smoulder spots sit inside. A first pass glowed across the whole interior and read as lava. It was cut back.
  - `combustion()`, patch `k===0`: 2.2× as many rim points. Flames come as clustered tongues whose height follows `surge`, plus low creeping flames and some inner flames. Hero flames are tagged with phase +100 (`step(100.,settings.z)` in the shader).
  - Flame shader: hero flames pulse at several frequencies, lean and sway more, and narrow more at the top. They rise faster and break up earlier. Base fade is shorter and the core near the base is hotter, so they touch the ground.
  - Smoke: every 4th rim point is a hero smoke source with 9 puffs, tagged with phase +10 (`step(10.,settings.x)`). The puffs are darker, have a fire-lit orange underside, fade in faster, have higher alpha, and drift and swirl more.

## Performance and motion check: verified in browser (2026-11-15, no code changes)
- **Method**
  - Used Chrome 156 at http://127.0.0.1:8765/. Viewport was 697×772 CSS px at DPR 2, and the canvas backing was 852×965 because of the 1.25 pixel-ratio cap.
  - An in-page script recorded every `requestAnimationFrame` interval. A `PerformanceObserver('long-animation-frame')` caught main-thread stalls.
  - Scroll was scripted with `scrollTo` once per frame. The run went through five phases:
    1. opening view at rest, 5 s
    2. scroll 0 to 140, 4 s
    3. hold at scrollY 67, 3 s
    4. reverse scroll 67 to 0, 3 s
    5. settle at the top, 2 s
  - This is not a DevTools Performance trace, which the pane does not expose.
  - An earlier run gave about 1 fps and is invalid. The pane was hidden, so Chrome throttled rAF to 1 Hz.
- **Results.** Two runs agreed within 3 fps.

  | Phase | fps | p50 / p95 / max (ms) |
  |---|---|---|
  | opening | 38–39 | 32 / 34 / 49 |
  | scroll down through 67 | 37–40 | 18–33 / 34 / 50 |
  | hold at 67 | 35–39 | 33 / 34–50 / 82 |
  | scroll back up | 37 | 33 / 34 / 34 |

- **What the results mean**
  - Frame times sit at 16.7 or 33.3 ms. The scene misses the 60 Hz vsync on most frames, so it is GPU/fill-bound, not main-thread-bound. A `setTimeout` probe showed a maximum main-thread delay of 19 ms.
  - The scene makes about 28–30 WebGL draw calls per frame.
- **Stutters**
  - There is no visible hitching on the reverse scroll.
  - Near scrollY 67 in run 1, three long animation frames took 55, 82 and 77 ms. Their `blockingDuration` was 0, so the cause was render or GPU work, not script. Run 2 had no frames over 50 ms.
  - Overall the hero runs at about 38 fps, not 60, at this size. Low-end GPUs and real phones were not tried.
- **Phone width (375×812 emulated)**
  - There is no horizontal overflow (`scrollWidth` 375). The canvas fills the viewport, with a 468×1015 backing.
  - The headline, nav, CTA arrow, "Skip to archive" and "Pause motion" all fit. The page ran at about 54 fps.
  - Problem: "Pause motion" is 84×25 px, below the 44 px touch target.
- **Pause motion (`#valleyMotion`)**
  - Clicking it changes the label to "Play motion" and sets `aria-pressed="true"`. Draw calls go from about 1,100 per second to 0.
  - Clicking it again restores the label and the draw calls.
  - Problem: while paused, scrolling to 67 or 140 issues 0 draws. The 3D view stays frozen at its paused position while the copy scrolls over it.
- **Reduced motion**
  - Emulated by overriding `matchMedia` in a same-origin iframe before the scene script ran. The pane cannot set the media feature itself.
  - The hero starts paused, with the label "Play motion" and `aria-pressed="true"`. It draws one still frame (screenshotted) and then 0 draws, including on scroll.
  - "Play motion" starts the animation.
  - The camera freeze on scroll described under Pause motion also applies here.

## Unverified
- Real phones, low-end GPUs, and the OS-level reduced-motion setting were not tried. Reduced motion was only emulated via `matchMedia`.
- I could not syntax-check `fire-valley.js` with `node` because it is blocked. Browser compile and runtime are clean.

## Unfinished
- The other burn patches still use the old look. To use the new one elsewhere, extend the `hero` mask and the `k===0` branch.
