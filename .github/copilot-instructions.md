# RedAlert – Copilot Onboarding Instructions

RedAlert is a Windows/macOS/Linux **system tray application** that polls the Pikud HaOref (Israeli Home Front Command) API for real-time missile/rocket alerts. It is a long-running Node.js process with no framework — pure ESM modules bundled via esbuild into a native executable via `@yao-pkg/pkg`.

---

## Module & Build System

- The project uses **ESM** (`"type": "module"` in `package.json`). All source files use `import`/`export`.
- esbuild bundles the source to a single **CJS** file (`dist/bundle.cjs`) for `@yao-pkg/pkg` compatibility.
- `systray2` is a native module and must always remain **externalized** from the esbuild bundle. It is loaded at runtime via `require()` in `tray.js`, not `import`.
- `scripts/esm-shim.js` provides the `import.meta.url` polyfill for the CJS bundle.

## `appDir` Resolution Pattern

Any module that reads or writes files to disk **must** resolve the real app directory using:

```js
const appDir = process.pkg
  ? dirname(process.execPath)
  : join(dirname(fileURLToPath(import.meta.url)), '..');
```

Never use `__dirname` or `process.cwd()` directly — they point to the virtual pkg snapshot filesystem in production builds.

## Platform Abstraction

Always use `src/platform.js` for platform detection. Never write `process.platform === 'win32'` inline:

```js
import { isWindows, isMac, isLinux, getAppDataDir, getChromePath } from './platform.js';
```

Platform-specific paths (app data, logs, Chrome) are resolved by helpers in `platform.js`.

## Logging

All logging must go through the shared logger — never use bare `console.log` in `src/`:

```js
import { log } from './logger.js';
log.info('...');
log.warn('...');
log.error('...');
```

(`console.error` is acceptable inside `catch` blocks in `alertPoller.js` for immediate poll-error visibility, but prefer `log`.)

## API & Alert Handling

- The Pikud HaOref API (`oref.org.il/WarningMessages/alert/alerts.json`) is **geo-blocked** to Israeli IPs. Do not expect real responses in dev.
- An **empty response body** means "no active alerts" — not an error.
- Validate alert structure before acting (see `isValidAlert()` in `alertPoller.js`).
- Deduplicate alerts by `alert.id` (stored in `this.lastAlertId`).
- Area matching is **bidirectional substring**: `area.includes(configured) || configured.includes(area)`.
- The official "all clear" message title is the Hebrew string `'האירוע הסתיים'`.
- A **10-minute safety timer** (`SAFETY_DURATION_MS = 10 * 60 * 1000`) must expire before the alert is cleared, unless the official all-clear arrives first.

## Config & Security

- Config is stored in `config.json` next to the binary (resolved via `appDir`).
- Only keys in `ALLOWED_KEYS` in `configManager.js` may be updated via the API — never spread untrusted objects into the config directly.
- The config server (`configServer.js`) enforces: CSRF tokens (required on all mutating requests), rate limiting, input validation, and security headers (`X-Content-Type-Options`, `X-Frame-Options`, etc.).
- When adding new config fields, add them to `DEFAULT_CONFIG` and `ALLOWED_KEYS`, and add validation in `validateConfig()`.

## Architecture at a Glance

| File | Responsibility |
|---|---|
| `src/main.js` | Entry point; wires all modules, registers Windows App ID |
| `src/alertPoller.js` | `EventEmitter`; polls API, implements exponential backoff |
| `src/alertHandler.js` | Filters alerts by area, runs actions, manages safety timer |
| `src/configManager.js` | Read/write `config.json`; allowlist-based updates |
| `src/configServer.js` | Express server; REST API + static `public/` serving |
| `src/tray.js` | System tray (systray2 native module); lazy-loads icons |
| `src/autoStart.js` | Enable/disable login auto-start (macOS: LaunchAgent plist; Windows: Startup shortcut via MSI) |
| `src/originClassifier.js` | Classifies alert origin (Gaza, Lebanon, Iran, Yemen) using timeframes + region heuristics |
| `src/logger.js` | File logger → `%LOCALAPPDATA%\RedAlert\redalert.log` |
| `src/platform.js` | Platform flags and path helpers |
| `public/` | Web UI (config panel `index.html`, alert view `alert-view.html`) |
| `scripts/build.js` | esbuild + pkg pipeline; cross-platform targets |

## Commands

```bash
npm start                        # Run the app (dev)
npm run build                    # Build for current platform
npm run build:win                # Build Windows .exe
npm run build:mac                # Build macOS arm64 binary
npm run build:linux              # Build Linux binary
npm run build:msi                # Build Windows .exe + MSI installer
node scripts/generate-assets.js  # (First run) generate tray icons + alert sound
npm test                         # Run Playwright smoke tests
```

## Testing

Tests live in `tests/` and use **Playwright**. The config server must be running locally on port `3847` for tests to work. Helper `getCsrfToken()` in `smoke.spec.js` is the pattern for all mutating API requests in tests.

## Key Don'ts

- Do **not** add new npm runtime dependencies without considering pkg bundling and native module constraints.
- Do **not** use `path.resolve()` or `__dirname`-relative paths in `src/` — use the `appDir` pattern.
- Do **not** accept arbitrary keys in config update payloads — always go through `ALLOWED_KEYS`.
- Do **not** add `systray2` to the esbuild bundle — it must stay externalized.
- Do **not** use a Node audio library for alert sounds — audio is played via PowerShell `Media.SoundPlayer`.
