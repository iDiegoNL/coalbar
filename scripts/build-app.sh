#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
export CLANG_MODULE_CACHE_PATH="$PWD/.build/clang-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="$PWD/.build/module-cache"
swift build -c release --disable-sandbox
APP="$PWD/dist/CoalBar.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
xcrun actool "$PWD/Artwork/AppIcon.icon" \
  --compile "$APP/Contents/Resources" \
  --output-format human-readable-text --notices --warnings --errors \
  --output-partial-info-plist "$PWD/.build/icon-info.plist" \
  --app-icon AppIcon --include-all-app-icons --enable-on-demand-resources NO \
  --development-region en --target-device mac --minimum-deployment-target 14.0 --platform macosx
cp .build/release/CoalBar "$APP/Contents/MacOS/CoalBar"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>CoalBar</string>
<key>CFBundleIdentifier</key><string>local.coalbar.mac</string>
<key>CFBundleName</key><string>CoalBar</string>
<key>CFBundleDisplayName</key><string>CoalBar</string>
<key>CFBundleIconName</key><string>AppIcon</string>
<key>CFBundleIconFile</key><string>AppIcon.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.1.0</string>
<key>CFBundleVersion</key><string>1</string>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>LSUIElement</key><true/>
<key>NSLocalNetworkUsageDescription</key><string>CoalBar reads your Home Assistant heater and timer on your home network.</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/><key>NSAllowsArbitraryLoads</key><true/></dict>
</dict></plist>
PLIST
# Keep the same certificate-based identity across rebuilds. Ad-hoc signatures
# identify each binary by its hash and trigger new Keychain/privacy approvals.
if [[ -z "${COALBAR_SIGNING_IDENTITY:-}" && -f "$PWD/scripts/signing.local.sh" ]]; then
  source "$PWD/scripts/signing.local.sh"
fi
COALBAR_SIGNING_IDENTITY="${COALBAR_SIGNING_IDENTITY:--}"
if [[ "$COALBAR_SIGNING_IDENTITY" == "-" ]]; then
  printf 'Using ad-hoc signing. Keychain and local-network approval may recur after updates.\n' >&2
fi
codesign --force --sign "$COALBAR_SIGNING_IDENTITY" "$APP"
codesign --verify --strict "$APP"
printf 'Built %s\n' "$APP"
