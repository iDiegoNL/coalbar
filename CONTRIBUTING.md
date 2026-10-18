# Contributing to CoalBar

Use macOS with Xcode 26 or later. The app is a Swift Package with no external package dependencies.

1. Create a branch for your change.
2. Run `swift test` for behavior changes and `./scripts/build-app.sh` to verify packaging.
3. Inspect UI changes in both live and demo modes. Respect Reduce Motion and Reduce Transparency.
4. Describe what changed and how you verified it in your pull request.

Keep Home Assistant in charge of heater control. Demo mode must not call services or alter Home Assistant state. Do not include tokens, private URLs, personal entity IDs, signing identities, certificates, or screenshots of credentials in commits or issue reports.

Use `scripts/signing.local.sh` for a local signing identity; this file is ignored by Git. Never add private keys to the repository.

Source layout:

- `Sources/CoalBar/App.swift`: application lifecycle, menu bar item, and panel positioning.
- `Sources/CoalBar/CoalPanel.swift`: panel UI and animation.
- `Sources/CoalBar/Views.swift`: settings.
- `Sources/CoalBar/Model.swift`: connection lifecycle, notifications, and demo state.
- `Sources/CoalBar/Connection.swift`: Home Assistant requests and Keychain storage.
- `Sources/CoalBar/Domain.swift` and `AutomationTiming.swift`: state and timing calculations.
- `Tests/CoalBarTests`: behavioral tests.
- `Artwork`: vector artwork and Icon Composer project.

## Linux and Windows client

The additional client lives in `desktop/`; see [its setup guide](docs/DESKTOP.md). Use Node.js 22.12+ and pnpm 12. Run `pnpm test`, `pnpm build`, and `pnpm test:desktop` in a graphical session. Build releases on their target operating systems with `pnpm dist`. Test tray behavior, notifications, secure storage, and login startup on each target. KDE's optional panel integration lives in `desktop/plasma/`.

Keep platform additions independent of the Swift app and its packaging. The same read-only Home Assistant and credential-handling rules apply to both clients.
