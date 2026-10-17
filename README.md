<p align="center">
  <img src="Artwork/AppIcon-preview.png" width="160" alt="CoalBar: glowing coals on a heater">
</p>

<h1 align="center">CoalBar</h1>
<p align="center">Your coals, at a glance. A native macOS menu bar companion for Home Assistant.</p>

CoalBar follows your smart plug and Home Assistant automations to show heating progress, remind you to flip your coals, and let you know when it’s time for another batch.

## Features

- **Menu bar countdown** based on your heater’s switch-on time and automation duration.
- **Halfway reminder** to flip the coals, with a Mac notification and a dismissible reminder in the panel.
- **Heating-complete reminder** after the plug actually switches off near the expected deadline.
- **Fresh-coal reminder** using the off-duration in your second automation.
- **Automatic timing sync** from Home Assistant every minute—no duplicate duration settings.
- **Native glass panel** with an animated coal heater, Liquid Glass on macOS 26, and a material fallback on older systems.
- **Home-network behavior:** the menu bar item disappears when the configured server is unreachable and quietly retries.
- Keychain token storage, optional launch at login, and a demo mode that does not operate your heater.
- Reduce Motion and Reduce Transparency support. Animations pause while the panel is closed.

## Requirements

- macOS 14 or later.
- **Xcode 26 or later**, with its command-line tools selected, to build the Liquid Glass UI and Icon Composer asset. Command Line Tools alone are not sufficient for icon compilation.
- A reachable Home Assistant instance, a smart plug exposed as a switch, and two compatible automations.
- A Home Assistant long-lived access token with permission to read states and automation configurations.

There are no third-party Swift package dependencies. The repository contains source and artwork, not a notarized installer or prebuilt release.

## Build and run

```sh
git clone git@github.com:iDiegoNL/coalbar.git
cd coalbar
./scripts/build-app.sh
open dist/CoalBar.app
```

Quit CoalBar before rebuilding its app bundle. For regular use, copy `dist/CoalBar.app` into Applications, launch that copy, and then enable **Open at login**.

### Signing

By default, the build uses ad-hoc signing for local development. macOS may ask again for Keychain or Local Network access after the app changes.

For a stable identity across updates, use your own code-signing certificate:

```sh
security find-identity -v -p codesigning
cp scripts/signing.local.sh.example scripts/signing.local.sh
```

Edit the ignored local file to select your certificate, or pass `COALBAR_SIGNING_IDENTITY` as an environment variable. Signing with a development certificate does not notarize the app for public distribution. Switching signing identities may require a new approval for the existing Keychain item.

## Connect Home Assistant

1. Open CoalBar Settings and enter your server URL, for example `http://homeassistant.local:8123/`.
2. Create a long-lived access token in your Home Assistant profile’s **Security** section and paste it into the secure token field.
3. Click **Connect & find entities**.
4. Select your smart plug, the heating auto-off automation, and the fresh-coal reminder automation.
5. Click **Save & connect**. CoalBar shows the durations it reads from those automations.
6. Enable notifications when prompted. The enable button disappears once permission is granted.

The app uses one configured endpoint. HTTPS endpoints work too, but there is no automatic tunnel fallback. If you want the app to function only at home, configure a local address. Interactive proxy login redirects are not supported.

### Compatible automations

Each selected automation must have:

- One enabled switch-device or state trigger for **on** (heating) or **off** (fresh coals).
- A fixed `for` duration.
- No additional conditions or blueprint configuration.
- An automation ID and configuration accessible through Home Assistant’s automation configuration API.

Both automations must reference the same switch. Home Assistant must handle switching the heater off; CoalBar only reads state and sends Mac notifications.

See [example automations](examples/automations.yaml) for a 13-minute heating cycle and a reminder after one hour off. Replace the example switch with your own entity. Your existing device-trigger automations can also work; you do not need separate timer helpers.

Templates, multiple triggers, conditional automations, and inaccessible configurations produce an error instead of a guessed duration. Arbitrary scripts and automation actions are not interpreted.

## Timing and behavior

The countdown is calculated from the plug’s state-change timestamp and the automation’s configured duration; it is **not Home Assistant’s internal pending-trigger timer**. Automation reloads, Home Assistant restarts, and edits during a cycle can cause the two to differ. Keep heater control and automatic shutoff in Home Assistant.

- States are polled every five seconds; the display updates every second.
- Configuration is refreshed every minute.
- An expired countdown does not claim the heater is off while the plug remains on.
- Heating-complete alerts require a previously observed deadline and a recent switch-off near that deadline. Early manual shutoff does not announce a finished batch.
- Disabled automations suppress their associated countdown/reminder. Notifications depend on macOS permissions and Focus settings.
- The app does not run while the Mac sleeps. On reconnect, it can catch recently completed heating within five minutes and a fresh-coal reminder within two hours.
- Network requests time out after ten seconds. Hiding the item may take roughly fifteen seconds; snapshots older than twenty seconds are not used for notifications.
- Reopen the app to access Settings while its menu bar item is hidden.

## Privacy

- The access token is stored in **macOS Keychain**, not in source files or application preferences.
- Server URLs, entity selections, and reminder deduplication state are stored locally in application preferences.
- Requests go to your configured Home Assistant server. CoalBar has no analytics or cloud backend.
- Local HTTP is supported, but does not encrypt the token in transit; use it only on a trusted network or configure HTTPS.
- The client refuses HTTP redirects so it does not forward the token to a redirected destination.

Do not commit your token, signing files, Home Assistant configuration, or logs containing personal details. See [SECURITY.md](SECURITY.md).

## Troubleshooting

**“The Internet connection appears to be offline,” but Home Assistant is reachable:** check **System Settings → Privacy & Security → Local Network → CoalBar**. Development rebuilds signed ad hoc can leave stale permissions; toggling the app’s access off and on may help. Use a consistent signing identity for subsequent builds.

**Keychain asks again after rebuilding:** approve the app you built using your Mac login password. A stable signing certificate avoids changing the app’s identity with every binary revision.

**Automations are listed but their timings cannot be read:** check token permissions and whether the automations have IDs and are stored in Home Assistant’s editable automations file.

## Development

```sh
swift test
./scripts/build-app.sh
```

The artwork includes an editable [Apple Icon Composer project](Artwork/AppIcon.icon) and SVG layers. The build compiles both the modern asset catalog and an `.icns` fallback.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development notes.

## License

[MIT](LICENSE).
