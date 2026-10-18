# CoalBar for Linux and Windows

An additional Linux and Windows client built with React Native Web and Electron. The native Swift macOS app remains supported and unchanged; see the [main README](../README.md) for its documentation. Run the commands below from the repository root.

### **WINDOWS IS CURENTLY UN-TESTED.**

## Run

Requirements: Node.js 22.12+ and pnpm 12, plus a graphical desktop. Install dependencies, then launch:

```sh
pnpm install
pnpm start
```

Choose **Try demo** to explore the panel and all three reminders without connecting to Home Assistant. Closing Settings keeps the background app running; use **Quit** to exit. Reopening CoalBar brings back Settings, including when the tray icon is hidden.

For live use you need a reachable Home Assistant server, a long-lived access token, a smart plug entity, and two compatible automations. Create the token under your Home Assistant profile → Security. Enter the server and token, choose **Connect & find entities**, select the plug and both automations, then **Save & connect**. Leave the token blank on later saves to retain it for the same server.

### Platform requirements

- **Linux:** a graphical session with Chromium/Electron runtime libraries, a notification daemon, and Secret Service/GNOME Keyring or KWallet unlocked for secure token storage. XWayland is used when available so the popup can anchor beside the taskbar; native Wayland prohibits global window positioning. A StatusNotifier/AppIndicator tray host is needed for the tray panel; GNOME may require a tray extension. AppImage needs FUSE support (or extraction). Enable login startup only after placing/installing the packaged app at its permanent location.
- **Windows:** Windows 10 or later, desktop notifications enabled for CoalBar, and an installed build for login startup. The installer is NSIS. Windows protects the encrypted token using the current user’s credentials.
- macOS packaging is also configured, but the original Swift version offers the native Liquid Glass presentation.

Packaged Linux builds select X11 in their launcher before Electron starts when `DISPLAY` is available. An explicit `--ozone-platform=wayland` overrides this choice, but native Wayland limits popup positioning. The launcher is shared by AppImage and deb builds; startup does not require an Electron relaunch.

## Features and behavior

- Countdown from the plug’s state-change timestamp and automation duration; halfway flip reminder, actual switch-off completion reminder, and fresh-coal reminder.
- State polling every five seconds, timing configuration sync every minute, display updates every second. Requests time out after ten seconds. Data older than twenty seconds cannot trigger reminders.
- A completion alert requires a previously observed heating deadline, switch-off between five seconds before and five minutes after that deadline, and an off event less than five minutes old. Early manual shutoff does not announce a finished batch. Fresh-coal alerts catch up within two hours.
- Disabled automations suppress their associated reminders. An expired countdown never claims an energized plug is off.
- Persistent reminder deduplication across restarts; dismissible reminders in the panel.
- System notifications, launch at login, animated heater, reduced-motion and reduced-transparency options, and demo previews. Animations pause when the panel is hidden and honor system reduced-motion settings.
- Tray icon hides while unreachable and returns on reconnect. On Linux/Windows, the tray icon itself displays a live compact countdown or reminder status; full text appears in the tooltip, tray menu, and panel. Those systems reserve a square tray slot rather than macOS-style text beside the icon.

Home Assistant controls the heater. CoalBar only makes GET requests; it never calls services. Its countdown is an estimate, not Home Assistant’s internal pending-trigger timer. Keep automatic shutoff in Home Assistant. Sleep, automation reloads, restarts, and timing edits can change the relationship between that timer and the displayed estimate.

## Compatible automations

Each automation needs exactly one enabled switch-device or state trigger: **on** for heating, **off** for fresh coals, with a fixed positive `for` duration. Both must reference the same switch. Conditions, blueprints, templates, and multiple triggers/targets are rejected rather than guessed. The token must have permission to read states and automation configuration; each automation needs an accessible configuration ID.

See [examples/automations.yaml](../examples/automations.yaml). Device triggers using registry IDs are supported as in the original app: both IDs must match. The client cannot independently map an opaque registry ID to the selected entity, so verify that device selection in Home Assistant.

## Privacy and security

The Electron background process owns credentials, polling, and reminder scheduling. The isolated renderer receives state over a restricted IPC bridge and never receives the saved token. Newly entered tokens are cleared from the field after saving. Renderer navigation and new windows are blocked, and its Content Security Policy forbids network connections.

Tokens are encrypted with Electron safeStorage and committed atomically with their server configuration in `connection.json` in the OS application data directory. Existing separate configuration/credential files are migrated after validation. Linux’s `basic_text` fallback is refused: unlock/install a keyring instead. Connection settings, preferences, and reminder IDs are local JSON files; no analytics or cloud backend is used. HTTP is supported for trusted local networks; HTTPS encrypts the token in transit. Redirects are refused to avoid forwarding bearer credentials. Do not commit credentials or private configuration.

## Build and verify

```sh
pnpm test                 # deterministic domain, client, and lifecycle tests
pnpm build                # production React Native Web renderer
pnpm test:desktop         # graphical Electron smoke test, disposable profile
pnpm pack                 # unpacked desktop app for the current OS
pnpm dist                 # Linux AppImage/deb or Windows NSIS installer
```

Build Windows releases on Windows and Linux releases on Linux. Installers go into `release/`; the renderer goes into `dist/desktop/`, separate from the Swift app at `dist/CoalBar.app`. Signing is not configured; use your own certificates and release process before public distribution. CI builds and uploads unsigned artifacts on both systems.

## Implementation

- `desktop/core/domain.mjs`: automation parsing, durations, readings, and reminder rules.
- `desktop/core/client.mjs`: validated HTTP endpoints, GET-only requests, redirect refusal, timeouts.
- `desktop/core/model.mjs`: polling state, timing sync, generation guards, stale-data checks, deduplication, demo.
- `desktop/main.cjs`: windows, tray, encrypted storage, notifications, autostart, and restricted IPC.
- `desktop/preload.cjs`: isolated renderer bridge.
- `desktop/renderer/`: React Native component UI, accessible desktop entity selectors, animated artwork.
- `desktop/test/`: behavioral tests and graphical smoke test.

This is a React Native Web desktop application hosted by Electron, not a native-widget React Native Windows build. The platform choice gives Linux and Windows the same interface and behavior. Swift preferences and Keychain entries are not imported automatically; reconnect once in the new app.

[MIT License](../LICENSE).

## KDE Plasma panel integration

On Plasma 6, use the bundled native panel widget for a readable icon + countdown/status label and a popup positioned by Plasma itself, including on Wayland. The Electron tray remains the fallback on other desktops.

### Package and install the widget

The widget is distributed as a ZIP archive with a `.plasmoid` extension. With `zip` installed, run these commands from the repository root:

```sh
mkdir -p release
(cd desktop/plasma/package && zip -r ../../../release/coalbar.plasmoid metadata.json contents)
kpackagetool6 --type Plasma/Applet --install release/coalbar.plasmoid
```

This creates `release/coalbar.plasmoid`, with `metadata.json` and `contents/` at the archive root. Share this file alongside the Linux app. `pnpm dist` builds the desktop installers; it does not create this separate widget archive.

To update an installed widget after rebuilding the archive:

```sh
kpackagetool6 --type Plasma/Applet --upgrade release/coalbar.plasmoid
```

For development, you can also install directly from the source directory without creating an archive:

```sh
kpackagetool6 --type Plasma/Applet --install desktop/plasma/package
# Use --upgrade instead of --install for subsequent updates.
```

Add **CoalBar** through the panel’s **Add Widgets** menu, beside the system tray. Launch the installed CoalBar desktop app or AppImage, or use `pnpm start` during development. Keep the app running in the background: the widget receives its countdown and reminders and does not connect to Home Assistant separately. The duplicate generic tray icon automatically disappears while the widget is connected. Remove the widget to restore the generic tray.

The KDE-only bridge listens on `127.0.0.1:43179`. It shares presentation state only, never Home Assistant tokens, URLs, entity lists, or configuration. Browser origins are rejected; button commands require a per-process nonce and are limited to settings, dismissal, quitting CoalBar, and demo controls. No heater-control operations are exposed. If the port is occupied, the app keeps its generic tray and reports the bridge error in Settings.
