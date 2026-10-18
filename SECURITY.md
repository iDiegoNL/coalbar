# Security

CoalBar stores the Home Assistant token in macOS Keychain. It reads Home Assistant state and automation configuration but does not call heater-control services. The token itself may have broader permissions in Home Assistant; treat it as a secret.

## Reporting a vulnerability

Do not post access tokens, private keys, personal server addresses, or sensitive logs in public issues. If this repository offers GitHub’s private **Report a vulnerability** option in the Security tab, use it. Otherwise, open an issue requesting a private reporting channel without disclosing exploit details or sensitive data.

If a Home Assistant token is accidentally exposed, revoke it in Home Assistant and issue a replacement. Removing it from a later commit does not revoke it or remove it from existing clones.

## Development

Generated app bundles, build output, local signing configuration, environment files, and common private-key formats are ignored. Review staged files before committing; ignore rules are not a substitute for reviewing changes.

Use a trusted local network for HTTP connections or configure HTTPS. Keep a consistent code-signing identity for regular use. Avoid disabling Keychain protections to suppress development approval prompts.

## React Native desktop port

The desktop port keeps Home Assistant networking and encrypted token persistence in Electron’s main process. The sandboxed renderer uses a restricted preload bridge and cannot read the saved token. Electron safeStorage must have OS-backed encryption; Linux basic_text storage is refused. Redirects are refused and requests are GET-only. Keep Electron and renderer dependencies updated, and validate packaged releases on both operating systems.
