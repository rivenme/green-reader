# Release procedure

## Review and preview

1. Open a PR with these changes. The Checks workflow runs unit tests, a production build, and five browser/device profiles.
2. Inspect the browser report. Download the preview-build artifact, extract it, and serve it with a static HTTP server. This is a review artifact, not a publicly hosted preview URL.
3. Review gameplay rules and the simulation limitations in the README and Help.
4. Use the checklist below before publishing. Do not equate emulation with physical-device testing.

## Human beta (still required)

Run five short sessions with people who have not used the app. Do not explain controls before the first attempt. Record observations without personal information in the beta worksheet below. Recruitment and outreach require the owner's action; no invitations have been sent.

| Session | Device/browser | First putt without help? | First hole completed? | Confusion / blocker | Returned for another hole? |
| --- | --- | --- | --- | --- | --- |
| 1 | Pending | | | | |
| 2 | Pending | | | | |
| 3 | Pending | | | | |
| 4 | Pending | | | | |
| 5 | Pending | | | | |

Suggested release gate: at least four of five complete the lesson unaided; no reproducible crash, blocked control, lost checkpoint, or inaccessible required action. Fix blockers and repeat the affected sessions.

## Physical-device checks (still required)

- iPhone Safari and Android Chrome: aim, drag outside canvas, second finger during aim, pinch away from ball, scroll the settings panel, background/foreground, rotation, audio interruption.
- Small phone and landscape: ball, cup and power controls remain usable; no essential action is obscured. Zoom text to 200% and test the settings and dialogs.
- Keyboard-only and VoiceOver: traverse home, lesson, controls, results and Help; verify focus recovery. The visual green remains a spatial visual game, not a fully nonvisual golf experience.
- Battery/performance: play ten minutes on a midrange phone in Balanced and Low modes. Target responsive input and a stable 30 fps minimum; log device, OS, median and p95 frame time. Desktop/headless measurements are not mobile performance evidence.

## Production monitoring (destination required)

The app currently captures recent errors locally and offers a user-controlled JSON download in Help, plus an issue link. It sends no automatic telemetry. To enable centralized monitoring, select an owner-controlled service, configure its public client destination, update the privacy disclosure, add release identification and source-map upload, and test a deliberate error in a staging build. Never put a secret API token in a Vite client variable. Do not mark this gate complete until a test event is visible in the service.

## Publish and rollback

1. Merge the reviewed PR and choose a verified commit/tag. Retain the previous production ref.
2. In GitHub repository Settings → Pages, select GitHub Actions as the build source. Configure the `github-pages` environment reviewers if desired.
3. Run **Publish GitHub Pages** with that ref. The workflow builds and tests before publishing.
4. Smoke test the live URL: load, lesson, competition, reload/resume, settings, worker guide, error report. Confirm assets load from `/green-reader/`, including the worker.
5. If the release breaks, run the same workflow with the previous verified ref. Avoid reverting user data. Old schemas may not resume new runs, so warn in release notes when changing course/save versions.

No production publish or repository settings change has been performed by the local implementation work.
