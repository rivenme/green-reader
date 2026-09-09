# Verification

Results are recorded for each local release candidate. See the dated updates below for executed checks.

## Automated scope

- Unit tests: 50 deterministic layouts and pin neighborhoods, gradient math, fixed-step equivalence at 30/60/144 fps, forgiving/realistic cup capture without flag collisions, fringe recovery, Stimp/grain effects, stroke calibration and smoothing, pace/line assessments, simulated replay advice, drill scoring, native feedback bridge behavior, solver make execution, scoring, achievements, legacy save migration, invalid saves, unavailable storage, pointer ownership/cancellation.
- Browser tests: boot, guided first putt, competition rules, practice navigation, reload/resume, corrupted storage recovery, final practice replay, modal keyboard focus, consistent stroke controls, displayed versus played distance, cancellation on rotation, three drills and saved results, same-lie replay, soft/firm route comparison, and optional realistic cups.
- Browser profiles: Chromium, Firefox, WebKit, mobile Chrome emulation, mobile Safari emulation.
- Production build: local dependency bundle, separate worker, relative asset base.

## Limits

Headless engines and device emulation do not replace shipping Safari/Chrome on physical phones. Native vibration strength and enjoyment of the control mappings require physical-device playtesting. No human beta or centralized monitoring event has been verified. The app's simulation is tested for internal consistency, not calibrated against measured physical golf putts. Live deployment checks, when performed, are recorded separately from local browser checks.

## Executed locally · 2026-09-07

- **17 unit tests passed.** The deterministic-course test covers all 50 layouts twice. Shared physics playback matches prediction exactly across simulated 30/60/144 fps scheduling.
- **66 gameplay/reliability browser checks passed** across desktop Chromium, Firefox, WebKit, Pixel 7 emulation, and iPhone 13 emulation. Four duplicate host-performance samples were intentionally skipped; performance was sampled once on Chromium.
- **10 additional production-bundle/storage checks passed** across the same five profiles. The built app and worker loaded beneath a simulated `/green-reader/` hosting prefix with no runtime CDN requests. Unavailable storage produced a visible notice with Settings closed.
- **Production build and whitespace checks passed.** Bundled JavaScript is approximately 149 kB gzip, plus the ~4 kB standalone worker, ~3.7 kB gzip CSS and ~4.4 kB gzip HTML. Source maps are additional debug artifacts.
- Desktop, portrait mobile and landscape screenshots were generated for visual inspection. The default camera was adjusted to leave room beneath the ball for dragging. The settings panel was made more opaque for readability.

The combined executed browser coverage is **76 passing checks**, with the four intentional duplicate performance skips described above. Reports from individual test invocations are written to `playwright-report/`; that directory is replaced on the next invocation. `npm run test:e2e` rebuilds first so production tests always use the current source.

Final targeted camera/mobile-layout checks: **15 passed** across all five profiles after compacting the read card. These repeat existing coverage and are not added to the unique 76-check count above.

## Putting feel update · 2026-09-08

- **40 unit tests passed** with `npm run check`, including all 50 pin neighborhoods at Stimp 7, 10, and 14; calibrated stroke/distance conversion; held-finger smoothing; separate pace and line feedback; optional cup rules; fringe recovery; practice targets; touch bonuses; and native feedback loading/failure handling.
- **136 browser checks passed** in the full five-profile run. Four duplicate performance samples were intentionally skipped. Coverage includes the production bundle under `/green-reader/`, startup recovery, saves, first-putt guidance, all three drills, soft/firm routes, realistic versus forgiving cups, displayed versus played distance, and cancellation on rotation.
- **15 focused browser checks passed across all five profiles after the final replay update.** Replay retains the launch strength when the player switches between distance and stroke controls or changes the range. These repeat existing coverage and are not added to the unique 136-check total.
- **Production build and whitespace checks passed.** The main game and Three.js total approximately 151 kB gzip, with separate startup, fallback, native-plugin, and worker chunks. CSS is approximately 4.7 kB gzip and HTML 6 kB gzip. Source maps are additional artifacts.
- **The final iPhone bundle was synced and the Xcode simulator build succeeded** with `npm run ios:build`, including Capacitor Haptics 8.0.2. The build used the iOS Simulator 26.5 SDK with signing disabled. Physical vibration was not tested.
- **Two live-site browser checks passed**, in Chromium and mobile Safari emulation, against [the published app](https://rivenme.github.io/green-reader/). Both loaded 3D, completed the first putt, opened the solver and pace drill, and reported no page or asset-loading errors.
- Portrait and landscape screenshots were visually inspected. Quick actions clear Settings after rotation; the ball and cup sit in the available play area; practice feedback and drill results remain readable.

The update changes the generated greens and slope response, so course version 2 starts a fresh round when opening a version-1 run. XP, cosmetics, settings, and lifetime stats are retained. Human preference testing and real-golf calibration remain outside these automated results.

### CI environment follow-up

The first [Linux CI run](https://github.com/rivenme/green-reader/actions/runs/34297125567) exceeded its 15-minute job limit after slow Chromium checks and repeated Firefox failures. It did not produce a completed browser report, so it is not a passing verification result. The local and live-site results above are independent of that run.

The workflow now keeps the unit/build job on Linux and runs each browser profile separately on standard macOS 26 runners, matching the locally verified graphics platform. Each CI job uses one worker, a 60-second whole-test limit, and a three-failure stop limit so a broken environment produces a report promptly. Individual gameplay assertions retain their original limits. Reports also include raw traces and screenshots, which can survive an interrupted HTML report. This follows Playwright's [guidance on CI workers and distributing tests](https://playwright.dev/docs/ci); macOS 26 is a [standard GitHub runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

The first macOS matrix run passed both Safari profiles and mobile Chrome. Its traces exposed a preview-test race with the successful-putt result dialog; the test now waits for that dialog and uses its mode-selection button. The two-putt persistence scenario has a 90-second CI total budget, retaining both 20-second result assertions. Firefox's trace showed long frame-related waits while ordinary DOM reads remained responsive, so CI selects its [60 Hz software vsync](https://github.com/mozilla/gecko-dev/blob/master/gfx/thebes/gfxPlatform.cpp) instead of the virtual display's hardware timing. This is a test-browser launch setting; app physics and normal browser settings are unchanged.
