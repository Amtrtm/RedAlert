# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RedAlert is a Windows system tray application that monitors the Pikud HaOref (Israeli Home Front Command) API for real-time missile/rocket alerts. Written in JavaScript (ESM), it polls an unofficial geo-blocked API, filters alerts by user-configured Hebrew area names, and triggers desktop notifications, alert sounds, and opens a browser-based alert view. It includes a 10-minute safety timer and a web config panel on `localhost:3847`.

## Commands

```bash
npm start                    # Run the app (node src/main.js)
npm run build                # Bundle with esbuild + compile to .exe with @yao-pkg/pkg
npm run build:msi            # Build .exe then create MSI installer with WiX
node scripts/generate-assets.js  # Generate tray icons (.ico) and alert sound (.wav) in assets/
```

There are no tests (`npm test` is a stub).

## Architecture

The app is a long-running Node.js process (no framework, pure ESM modules) with these core components:

- **`src/main.js`** - Entry point. Wires together all modules: registers Windows App ID for toast notifications, creates the poller, config server, and system tray. Opens config page on first run (no areas configured).

- **`src/alertPoller.js`** - `EventEmitter` subclass that polls `oref.org.il/WarningMessages/alert/alerts.json` at the configured interval. Emits `'alert'` and `'status'` events. Implements exponential backoff (up to 30s) after 3+ consecutive errors.

- **`src/alertHandler.js`** - Receives alerts, filters by area (bidirectional substring match), enforces cooldown, and triggers actions (notification, sound, browser). Manages the 10-minute safety timer that keeps alerts active until either the timer expires or Pikud HaOref sends the official `'האירוע הסתיים'` message. Exposes `getAlertStatus()` and `getAlertHistory()` for the config server API.

- **`src/configManager.js`** - Reads/writes `config.json` from the app directory. Uses `process.pkg` check to resolve the real filesystem path vs. the pkg snapshot path.

- **`src/configServer.js`** - Express server serving static files from `public/` and REST API endpoints (`/api/config`, `/api/history`, `/api/alert-status`, `/api/test-alert`).

- **`src/tray.js`** - System tray icon using `systray2`. Lazy-loads icons and the native module to avoid crashes before the error handler is registered. Temporarily changes CWD to `node_modules/systray2` so the native binary is found at runtime.

- **`src/logger.js`** - File logger writing to `%LOCALAPPDATA%\RedAlert\redalert.log`.

- **`public/`** - Web UI (config panel at `index.html`, alert view at `alert-view.html`).

### Build Pipeline

1. **esbuild** bundles all ESM source into a single CJS file (`dist/bundle.cjs`), externalizing `systray2` (native module)
2. **@yao-pkg/pkg** compiles the CJS bundle into `dist/RedAlert.exe` (node22-win-x64)
3. Static files (`public/`, `assets/`, `config.json`, `node_modules/systray2/`) are copied alongside the exe
4. **WiX** (via `wix-msi` package) creates an MSI installer that installs to `%LOCALAPPDATA%\RedAlert\`

### Key Patterns

- **`appDir` resolution**: Multiple modules use `process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..')` to find the real app directory, since pkg snapshots virtual filesystem paths.
- **CJS/ESM bridge**: The project is ESM (`"type": "module"`) but esbuild bundles to CJS for pkg compatibility. `scripts/esm-shim.js` provides the `import.meta.url` polyfill. `tray.js` uses `require()` for `systray2` since it's externalized.
- **Alert sound**: Played via PowerShell `Media.SoundPlayer`, not a Node audio library.
- **Notifications**: Uses `node-notifier` with PowerShell toast fallback if `node-notifier` fails.

## API Constraints

- The Pikud HaOref API is **geo-blocked** to Israeli IP addresses only.
- The API returns an empty body when there are no active alerts, and a JSON object with `id`, `cat`, `title`, `data` (area list), and `desc` when alerts are active.
- Area matching is bidirectional substring: `area.includes(configured) || configured.includes(area)`.
