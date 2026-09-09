# Verification

Results are recorded for each local release candidate. See the dated updates below for executed checks.

## Automated scope

- Unit tests: 50 deterministic layouts and pin neighborhoods, gradient math, fixed-step equivalence at 30/60/144 fps, forgiving/realistic cup capture without flag collisions, fringe recovery, Stimp/grain effects, stroke calibration and smoothing, pace/line assessments, simulated replay advice, drill scoring, native feedback bridge behavior, solver make execution, scoring, achievements, legacy save migration, invalid saves, unavailable storage, pointer ownership/cancellation.
- Browser tests: boot, guided first putt, competition rules, practice navigation, reload/resume, corrupted storage recovery, final practice replay, modal keyboard focus, saved Drag/Buttons choice, power-meter growth and retraction, automatic/manual camera framing after a miss, compact feedback, consistent stroke controls, displayed versus played distance, cancellation on rotation, three drills and saved results, same-lie replay, soft/firm route comparison, and optional realistic cups.
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

The workflow keeps the unit/build job on Linux and runs each browser profile in its own job. Each CI job uses one worker, a 60-second whole-test limit, and a three-failure stop limit so a broken environment produces a report promptly. Individual gameplay assertions retain their original limits. Reports also include raw traces and screenshots, which can survive an interrupted HTML report. This follows Playwright's [guidance on CI workers and distributing tests](https://playwright.dev/docs/ci).

The first macOS matrix run passed both Safari profiles and mobile Chrome. Its traces exposed a preview-test race with the successful-putt result dialog; the test now waits for that dialog and uses its mode-selection button. The two-putt persistence scenario has a 90-second CI total budget, retaining both 20-second result assertions. [The following run](https://github.com/rivenme/green-reader/actions/runs/34356858072) passed both Chrome and both Safari profiles; Firefox remained unsuccessful.

Firefox's CI trace showed long frame-related waits while ordinary DOM reads remained responsive. Software vsync, a visible macOS window, and the Intel macOS runner did not resolve the rendering stalls. Firefox now uses `ubuntu-24.04` with a headed browser under Xvfb and Mesa's LLVMpipe software OpenGL; Chrome and Safari use `macos-26`. This follows the documented [Playwright Xvfb setup](https://playwright.dev/docs/ci) and [Mesa software-renderer selection](https://docs.mesa3d.org/envvars.html). A small host diagnostic renders an animated WebGL triangle and logs visibility, renderer, frame timing, and pixel output before the game tests. It changes no application settings and does not replace gameplay coverage.

CI records traces on the first retry, following [Playwright's guidance](https://playwright.dev/docs/trace-viewer), to avoid continuous capture overhead during normal verification. Failure screenshots and all gameplay assertions are retained. These are test-runner changes; app physics and shipped browser behavior are unchanged.

### Final CI result · 2026-09-09

[The complete release check passed](https://github.com/rivenme/green-reader/actions/runs/34367878484) for code revision `504303d`: 40 unit tests, the production build, and all **136 browser checks**, with four intentional duplicate performance skips and no flaky-test results. Chromium passed 28 checks; Firefox, WebKit, mobile Chrome, and mobile Safari each passed 27. Firefox's Linux host rendered the diagnostic triangle at 38 fps with no OpenGL errors; this is a host diagnostic, not a gameplay performance benchmark. The full Firefox gameplay suite then passed in 1.6 minutes.

The iPhone bundle and live-site checks described above contain the same gameplay implementation; subsequent changes affected only tests, CI, and documentation.

## Control clarity update · 2026-09-09

Revision `22fad11` restores a growing green strength bar and automatic framing after a stopped putt. Drag is the default input layout, with a meter beside the ball during the gesture and a hidden bottom button panel. Players can save a button-input preference from Home or Settings. Green readings and post-putt advice are compact by default.

- **40 unit tests passed**, including persistence and validation of the new input, camera, and detail preferences alongside the existing active run.
- **156 browser checks passed locally** across all five profiles with no retries. Four duplicate host-performance samples were intentionally skipped. The new cases cover visible meter growth and retraction, cancellation without a shot, saved input choice, and the rendered camera position with automatic framing enabled and disabled.
- **[The release workflow passed](https://github.com/rivenme/green-reader/actions/runs/34399991882)** for revision `22fad11`, including the unit/build job and all five browser profiles.
- **The production build and whitespace checks passed.** The main game is approximately 25.8 kB gzip; CSS is 5.1 kB gzip and HTML 6.4 kB gzip, alongside the existing Three.js and supporting chunks.
- **The iPhone bundle was synced and the Xcode simulator build succeeded** with the iOS Simulator 26.5 SDK and signing disabled.
- Desktop and phone screenshots were inspected for the growing bar, clear drag layout, button layout, and camera framing after a miss. The drag regression waits for the existing input smoothing to settle before comparing a repeated pull.

This is a controls and presentation update; existing version-2 rounds remain resumable. Physical-device feel still requires playtesting on the phone.

## Drag room and terrain preview update · 2026-09-09

Revision `deaee16` reserves enough room for a full pull and maps cramped edge gestures to the available screen space. Full stroke is now the default range. A white arrow shows the starting direction; the green path and stop ring use the same simulation as the played shot. The guide is enabled in Practice and the lesson, remains visible during the roll, and can be disabled in Practice settings.

- **42 unit tests passed.** Coverage now includes safe-edge power normalization, the one-time guide/range migration, and exact preview/playback agreement at 30/60/144 fps on uphill, downhill, cross-slope, grain, cup, and fringe scenarios.
- **181 browser checks passed locally** across all five profiles with no retries. Four duplicate host-performance samples were intentionally skipped. The new scenarios reach 100% power within portrait, landscape, and compact viewports, keep the meter off the ball, compare the actual stop against the displayed target on a sloping green, and retain an explicit guide-off preference after reopening.
- **[The release workflow passed](https://github.com/rivenme/green-reader/actions/runs/34407420485)** for revision `deaee16`, including the unit/build job and all five browser profiles.
- The sloping-green browser check compares the actual ball center with the displayed stop ring within two screen pixels and requires the final miss description to equal the preview. These checks passed in every browser profile.
- **The production build, JavaScript syntax, and whitespace checks passed.** The main game is approximately 26.8 kB gzip, CSS 5.4 kB gzip, and HTML 6.6 kB gzip, alongside the existing Three.js and supporting chunks.
- **The updated iPhone bundle was synced and the Xcode simulator build succeeded** using the iOS Simulator 26.5 SDK with signing disabled.
- Portrait, landscape, compact-screen, predicted-stop, and actual-stop screenshots were inspected. The compact meter remains beside the ball, and the landscape framing leaves room for a full pull.

Ball dynamics and cup capture are unchanged; simulation now also reports total travel for the preview readout. Existing version-2 rounds remain resumable. Automated agreement demonstrates consistency with the game's physics, not calibration against measured golf putts or physical-device preference testing.

### Published bundle check

The live audit found Pages configured to publish the repository root from `main`, and the fetched page matched raw `index.html` rather than the production build. Pages was changed to `build_type: workflow`, following the [GitHub Pages publishing API](https://docs.github.com/en/rest/pages/pages#update-information-about-a-github-pages-site), and [the release was republished successfully](https://github.com/rivenme/green-reader/actions/runs/34408546704).

The final live HTML matches the tested production HTML with SHA-256 `d10112cda383c2b950f341e966baccef6afeb4be6e0d3ed41956a0b72617cd30`. **Two live bundle checks passed**, in Chromium and mobile Safari emulation. They verify the bundled entry, full drag power within the viewport, the displayed terrain finish matching the played miss, button play, solver loading, and the pace drill, with no page or asset-loading errors.
