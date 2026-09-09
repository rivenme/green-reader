# Green Reader for iPhone

The iPhone app packages the existing Three.js game using Capacitor 8.5.1 and
WKWebView. It includes the green, physics, course generator, solver worker,
styles, and audio locally. Gameplay does not load GitHub Pages or a CDN.
The flag remains decorative. The default forgiving cup accepts every crossing;
Practice also offers a realistic cup option. Rolling is silent. Optional strike
and cup feedback uses the native Capacitor Haptics plugin.

## Open and run

Requirements: a Mac, Xcode 26+, Node 22.12+, npm, and an iPhone running iOS 16+.
The project uses Swift
Package Manager, so CocoaPods is not required. The first native build needs
internet to resolve Capacitor; the installed game can then run offline.

```sh
npm ci
npm run ios:open
```

In Xcode, select the **App** scheme and an iPhone simulator, then press Run.
The command-line alternative is `npm run ios:run`. To compile without opening
Xcode or configuring signing, use `npm run ios:build`.

## Install on your iPhone

1. Connect your iPhone to this Mac, trust the Mac, and enable Developer Mode
   on the phone if Xcode requests it.
2. In Xcode Settings → Accounts, add your Apple Account.
3. Select the App target → Signing & Capabilities, enable automatic signing,
   and choose your Team. The default bundle ID is `com.rivenme.greenreader`.
4. Select your connected iPhone as the run destination and press Run.

Signing is intentionally not tied to a guessed Apple team. This repository
contains a simulator build, not a signed IPA or App Store release. TestFlight
distribution additionally needs your Apple Developer team, an App Store
Connect record, archive signing, and upload through Xcode.

## Changes and assets

- `npm run ios:sync` rebuilds with the iOS mode and copies `dist` into the app.
  Run this after changing game code; Xcode alone does not rebuild JavaScript.
- `capacitor.config.json` configures the app name, identifier, background, and
  WebView behavior. There is no remote development-server URL.
- `vite.config.js` strips the browser-only import map from the iOS build.
- Native-only CSS accounts for the notch, home indicator, and landscape edges.
- Choose **Drag the ball** for a clear lower screen, or **Aim buttons** for a
  slider and Putt button, on the home screen or in Settings. The choice is saved.
  Drag power appears beside the ball only during the gesture. After a miss, tap
  **Details** to reveal advice and replay. The camera reframes once the ball
  stops; **Reframe after each putt** in Settings can disable this.
- Settings → Touch & cup offers consistent stroke controls, a feet assist, and
  the original adaptive distance control. Practice drills are in Settings.
- The haptics plugin is included through Swift Package Manager after sync.
  Haptics require a physical iPhone; the simulator can verify the build and UI.
- Progress and settings are local to this app. Browser saves do not transfer
  automatically, and deleting the app can remove its saves.
- `swift scripts/ios-icon.swift` regenerates the original opaque 1024px icon.
- The native launch screen is `ios/App/App/Base.lproj/LaunchScreen.storyboard`.
- Generated web assets, build products, and personal Xcode settings are ignored
  by git. Commit the native project and lockfiles, then regenerate with sync.

## Verification

The simulator build and mobile Safari build checks were run during creation.
The offline build test blocks all external requests and exercises the 3D
practice green and solver. Before distributing, also play a full hole on a
physical iPhone, rotate the phone, background and resume during a putt, and
relaunch to check saved progress.

Useful commands:

```sh
npm test
npm run ios:sync
npx playwright test e2e/build.spec.js --project=mobile-safari
npm run ios:build
```

References: [Capacitor iOS workflow](https://capacitorjs.com/docs/ios) and
[Apple signing setup](https://developer.apple.com/documentation/xcode/adding-capabilities-to-your-app).
