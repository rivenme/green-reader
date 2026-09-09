# Green Reader

A 3D putting game about reading slopes and controlling pace. Start with a guided first putt, explore practice greens, or play a 50-hole competition.

## Run locally

Use Node 22.12+ (Node 24 is used in CI).

```sh
npm ci
npm run dev
```

Open the localhost address printed by Vite. This app now uses JavaScript modules and a build; opening `index.html` directly is no longer supported. Three.js is installed and bundled locally, with no runtime CDN dependency.

```sh
npm run check         # unit tests and production build
npx playwright install chromium firefox webkit
npm run test:e2e      # desktop Chromium/Firefox/WebKit + mobile Chrome/Safari emulation
npm run preview      # serve the production build after npm run build
```

## iPhone app

The native iOS project is in `ios/App/App.xcodeproj`. Run `npm run ios:open`
to rebuild the bundled game and open Xcode, or `npm run ios:run` to choose a
simulator or connected iPhone. See [iPhone setup and installation](docs/IPHONE.md).

The installed app includes the 3D engine and game assets for offline play.
Its progress is stored separately from the browser version.

## Play

- **First putt:** a short interactive lesson on a flat eight-foot green. Drag and release, or set the distance to 8 ft and press Putt.
- **Practice:** free retries, adjustable Stimp 7–14, predicted finishes, pace/line feedback, and soft/firm route comparisons. Try the pace ladder, three-foot circle, or starting-line gate in Settings → Practice drills. Drill results are saved separately; leaving a drill returns to your round.
- **Competition:** 50 reproducible two-putt challenges, Stimp 10, forgiving cup, grain enabled where present, random stroke error disabled. No retries, skipping, or predicted pace/path/line assistance. Flow dots and the contour grid remain available. A good first leave followed by a two-putt earns a touch bonus; complete all 50 for a run result.

Hole results wait for you to continue. The home screen offers **Resume** or a new mode. Starting a new mode replaces the active run while retaining lifetime progress. The lesson does not replace a saved run.

## Controls

Choose **Drag the ball** or **Aim buttons** on the home screen or in Settings.
The choice is saved. Drag is the default: the bottom control panel stays hidden,
and a small power meter appears beside the ball only while pulling back. Aim
buttons shows the slider and Putt button. Both support keyboard shortcuts.
The green read starts with distance and elevation; enable **Detailed green read**
in Settings for more information.

| Control | Action |
| --- | --- |
| Drag back from the ball, release | Aim and putt |
| Drag away from the ball | Orbit camera |
| Scroll / pinch | Zoom |
| Aim buttons + stroke/distance slider + Putt | Complete touch/keyboard alternative |
| Left / right arrows | Aim in 0.5° steps |
| Up / down arrows | Adjust strength by 1%, or assisted distance by 0.1 ft |
| Space (green focused) | Putt |
| Escape | Cancel aim / close dismissible dialog |
| R / N | Replay / skip in Practice |
| P / B | Predicted path / best line in Practice |
| S | Flow dots |
| C / V | Behind-ball / low camera |
| H | Settings panel |

Shortcuts do not override focused form controls. Dialogs contain keyboard focus and restore it when closed. System reduced-motion preferences are respected, with an additional app setting. Graphics quality can be lowered to reduce rendering cost.

**Stroke** is the default control: a fixed pull produces the same launch speed
between lies. Standard, Short/precision, and Long ranges are selected explicitly.
Standard and Short use the launch speeds for 60 ft and 10 ft on the flat Stimp-10
reference; Long uses the full launch limit. Faster greens roll farther for the
same stroke. Settings → Touch & cup also offers **Distance**, a fixed-range
flat-ground feet assist, and **Adaptive distance**, the original control that
changes sensitivity with each lie. The first lesson uses the distance assist.

The green bar grows and shrinks with control strength and points along the
starting direction. Its tip is not a predicted stopping point. In distance-assist
mode, the drag meter shows flat-ground reach in feet. Practice's optional
yellow path and Expected finish marker include actual terrain, grain, and the
selected cup rule. Unsettled simulations have no stopping marker. With random
stroke error enabled, predictions describe the intended launch before error.

Pace feedback uses a second simulation with cup capture disabled. This prevents
the forgiving cup from hiding excessive pace. Good pace is a game target: a
potential finish from 0.35 ft short to 1.5 ft beyond the cup plane, with arrival
speed at most 3.5 ft/s. A meaningful line near the cup is required before grading
pace; starting-line misses are reported separately. This band is not a universal
golf recommendation. The straight-at-cup read uses the selected speed and the
offset at the cup crossing, not the final lateral displacement.

After a miss, a compact finish summary appears. Tap **Details** for a replay
from the same lie with the previous path and a simulated adjustment expressed
in the active control's units. Soft/firm
route comparison illustrates alternative makes, not the selected shot's path.
Replay preserves the launch strength when switching control units or ranges.
Drills have no random stroke error; the pace target allows the ball to roll
through so the actual stopping point determines success.

Dragging retains a six-pixel dead zone and time-based smoothing. The range stays
fixed during a gesture; camera zoom does not scale touch strength. Release uses
the last aiming sample without a new lift-off coordinate. A held pull settles
to the finger's position, and rotation cancels an unfinished stroke. The camera
stays steady during the stroke and roll, then smoothly frames the ball and cup
for the next putt. Disable **Reframe after each putt** for manual framing. Camera
transitions respect reduced motion and stop when the player starts orbiting.
Optional native iPhone haptics occur only on impact and success; rolling is silent.

## Saves and privacy

XP, cosmetics, make stats, drill stats, settings, and one active run are stored in the browser under `green-reader-v1`. Existing `gr3d-career` and `gr3d-stats` data are migrated on read. Saves have schema validation; invalid run data is discarded while valid career/settings data can recover. Course version 2 starts a fresh round after upgrading the old terrain/physics and retains XP, cosmetics, and settings. Storage failures show a notice. Clearing browser site data removes progress. Saves are local, editable, and are not a secure leaderboard.

Shots are checkpointed at launch, stop, completion, and page hide. Refreshing a rolling shot resumes its deterministic simulation. Career awards and the completed-hole state are written together to avoid awarding the same result again on resume.

No analytics or error data is transmitted automatically. Help includes a feedback link and a downloadable diagnostic report containing browser details and recent error messages. Players decide whether to share it. Automatic production monitoring still requires an external reporting destination; see [release checklist](docs/RELEASE.md).

## Simulation limits

This is a stylized game, not a validated golf-training instrument. Elevation is visually exaggerated 1.8×; effective rolling acceleration is approximately 5/7 of gravity. The ball and cup are enlarged. The default cup accepts all crossings; optional realistic capture considers speed and entry offset with no flag collision or rim bounce. The visible fringe adds resistance, and the outer edge stops the ball for a penalty-free next stroke. Pins are screened for stopping behavior in their neighborhood at the fastest supported green speed. Stimp influences resistance, but the skid and settling model means distances are not a calibration of a physical Stimpmeter. Stats compare against an illustrative fixed reference table, not verified current PGA Tour measurements.

Actual play, path prediction, reach checks, and the worker-based best-line solver use the same fixed 1/120-second roll step. Optional Practice stroke error changes the launch once; guides assume the intended launch. Green routes are makeable in the model; amber routes are the closest found within a bounded search, not proof that a direct make is impossible.

## Code map

| Module | Responsibility |
| --- | --- |
| `src/main.js` | Boot and recoverable startup error UI |
| `src/game.js` | Game flow and integration |
| `src/physics.js`, `src/terrain.js` | Shared roll simulation and elevation/gradient |
| `src/aiming.js`, `src/feedback.js` | Stroke/distance calibration, pace/line assessment, replay advice |
| `src/drills.js`, `src/haptics.js` | Repeatable practice targets, scoring, optional native touch feedback |
| `src/course.js` | Seeded terrain, pin, and ball placement |
| `src/solver.js`, `src/solver.worker.js` | Bounded ideal-shot search off the UI thread |
| `src/scoring.js`, `src/storage.js` | Progression and validated persistence |
| `src/input.js`, `src/ui.js` | Pointer ownership, dialogs, announcements |
| `src/rendering.js`, `src/audio.js` | Scene setup and synthesized sound |
| `src/diagnostics.js` | Local error capture and user-exported reports |

The course format has a version. Bump it when changing generated layouts or competition physics so incompatible runs are not silently resumed.

## Release

CI runs unit tests and the build on Linux, then runs each of the five browser profiles in its own job with one worker. Chrome and Safari use macOS 26; Firefox uses Ubuntu 24.04 with an Xvfb display and Mesa software OpenGL. A Firefox host diagnostic records rendering support and frame timing before gameplay tests. CI uploads a reviewable `preview-build` artifact and separate browser reports, including failure screenshots and traces from retries. The manually triggered Pages workflow publishes a chosen ref after its unit/build checks pass; choosing an older verified ref is the rollback path. Relative asset URLs support the existing `/green-reader/` GitHub Pages path.

See [release and beta checklist](docs/RELEASE.md) and [verification results](docs/VERIFICATION.md). The repository includes the release tooling; publishing, live monitoring, and a human beta are separate release gates.
