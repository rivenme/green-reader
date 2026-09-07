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

## Play

- **First putt:** a short interactive lesson on a flat eight-foot green. Drag and release, or use the aim/power controls and Putt.
- **Practice:** free retries, skipping, adjustable Stimp 7–14, predicted paths, and an optional best-line search. Change physics settings between putts.
- **Competition:** 50 reproducible layouts, Stimp 10, grain enabled, random stroke error disabled. No retries, skipping, predicted paths, or best-line guides. Flow dots and the contour grid remain available. Each completed hole banks local XP and points; complete all 50 for a run result.

Hole results wait for you to continue. The home screen offers **Resume** or a new mode. Starting a new mode replaces the active run while retaining lifetime progress. The lesson does not replace a saved run.

## Controls

| Control | Action |
| --- | --- |
| Drag back from the ball, release | Aim and putt |
| Drag away from the ball | Orbit camera |
| Scroll / pinch | Zoom |
| Aim buttons + power slider + Putt | Complete touch/keyboard alternative |
| Left / right arrows | Aim in 0.5° steps |
| Up / down arrows | Adjust power by 1% |
| Space (green focused) | Putt |
| Escape | Cancel aim / close dismissible dialog |
| R / N | Replay / skip in Practice |
| P / B | Predicted path / best line in Practice |
| S | Flow dots |
| C / V | Behind-ball / low camera |
| H | Settings panel |

Shortcuts do not override focused form controls. Dialogs contain keyboard focus and restore it when closed. System reduced-motion preferences are respected, with an additional app setting. Graphics quality can be lowered to reduce rendering cost.

## Saves and privacy

XP, cosmetics, make stats, settings, and one active run are stored in the browser under `green-reader-v1`. Existing `gr3d-career` and `gr3d-stats` data are migrated on read. Saves have schema validation; invalid run data is discarded while valid career/settings data can recover. Storage failures show a notice. Clearing browser site data removes progress. Saves are local, editable, and are not a secure leaderboard.

Shots are checkpointed at launch, stop, completion, and page hide. Refreshing a rolling shot resumes its deterministic simulation. Career awards and the completed-hole state are written together to avoid awarding the same result again on resume.

No analytics or error data is transmitted automatically. Help includes a feedback link and a downloadable diagnostic report containing browser details and recent error messages. Players decide whether to share it. Automatic production monitoring still requires an external reporting destination; see [release checklist](docs/RELEASE.md).

## Simulation limits

This is a stylized game, not a validated golf-training instrument. Elevation is visually exaggerated 2.8×, gravity is tuned for readable break, the ball/cup are enlarged, and capture/lip-out behavior is simplified. Stimp influences resistance, but the skid and settling model means distances are not a calibration of a physical Stimpmeter. Stats compare against an illustrative fixed reference table, not verified current PGA Tour measurements.

Actual play, path prediction, reach checks, and the worker-based best-line solver use the same fixed 1/120-second roll step. Optional Practice stroke error changes the launch once; guides assume the intended launch. Green routes are makeable in the model; amber routes are the closest found within a bounded search, not proof that a direct make is impossible.

## Code map

| Module | Responsibility |
| --- | --- |
| `src/main.js` | Boot and recoverable startup error UI |
| `src/game.js` | Game flow and integration |
| `src/physics.js`, `src/terrain.js` | Shared roll simulation and elevation/gradient |
| `src/course.js` | Seeded terrain, pin, and ball placement |
| `src/solver.js`, `src/solver.worker.js` | Bounded ideal-shot search off the UI thread |
| `src/scoring.js`, `src/storage.js` | Progression and validated persistence |
| `src/input.js`, `src/ui.js` | Pointer ownership, dialogs, announcements |
| `src/rendering.js`, `src/audio.js` | Scene setup and synthesized sound |
| `src/diagnostics.js` | Local error capture and user-exported reports |

The course format has a version. Bump it when changing generated layouts or competition physics so incompatible runs are not silently resumed.

## Release

CI runs unit tests, builds, and browser checks, then uploads a reviewable `preview-build` artifact and browser report. The manually triggered Pages workflow publishes a chosen ref only after checks pass; choosing an older verified ref is the rollback path. Relative asset URLs support the existing `/green-reader/` GitHub Pages path.

See [release and beta checklist](docs/RELEASE.md) and [verification results](docs/VERIFICATION.md). The repository includes the release tooling; publishing, live monitoring, and a human beta are separate release gates.
