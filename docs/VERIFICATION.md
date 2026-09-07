# Verification

Results are recorded for the local release candidate. See the final update below for executed checks.

## Automated scope

- Unit tests: 50 deterministic layouts, gradient math, fixed-step equivalence at 30/60/144 fps, cup capture, lip deflection, boundary reflection, Stimp/grain effects, solver make execution, scoring, achievements, legacy save migration, invalid saves, unavailable storage, pointer ownership/cancellation.
- Browser tests: boot, guided first putt, competition rules, practice navigation, reload/resume, corrupted storage recovery, final practice replay, modal keyboard focus.
- Browser profiles: Chromium, Firefox, WebKit, mobile Chrome emulation, mobile Safari emulation.
- Production build: local dependency bundle, separate worker, relative asset base.

## Limits

Headless engines and device emulation do not replace shipping Safari/Chrome on physical phones. No human beta, live production smoke test, or centralized monitoring event has been verified. The app's simulation is tested for internal consistency, not calibrated against measured physical golf putts.

## Executed locally · 2026-09-07

- **17 unit tests passed.** The deterministic-course test covers all 50 layouts twice. Shared physics playback matches prediction exactly across simulated 30/60/144 fps scheduling.
- **66 gameplay/reliability browser checks passed** across desktop Chromium, Firefox, WebKit, Pixel 7 emulation, and iPhone 13 emulation. Four duplicate host-performance samples were intentionally skipped; performance was sampled once on Chromium.
- **10 additional production-bundle/storage checks passed** across the same five profiles. The built app and worker loaded beneath a simulated `/green-reader/` hosting prefix with no runtime CDN requests. Unavailable storage produced a visible notice with Settings closed.
- **Production build and whitespace checks passed.** Bundled JavaScript is approximately 149 kB gzip, plus the ~4 kB standalone worker, ~3.7 kB gzip CSS and ~4.4 kB gzip HTML. Source maps are additional debug artifacts.
- Desktop, portrait mobile and landscape screenshots were generated for visual inspection. The default camera was adjusted to leave room beneath the ball for dragging. The settings panel was made more opaque for readability.

The combined executed browser coverage is **76 passing checks**, with the four intentional duplicate performance skips described above. Reports from individual test invocations are written to `playwright-report/`; that directory is replaced on the next invocation. `npm run test:e2e` rebuilds first so production tests always use the current source.

Final targeted camera/mobile-layout checks: **15 passed** across all five profiles after compacting the read card. These repeat existing coverage and are not added to the unique 76-check count above.
