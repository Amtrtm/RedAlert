<p align="center">
  <img src="assets/icon.png" alt="RedAlert Icon" width="128" height="128">
</p>

<h1 align="center">RedAlert</h1>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Platform-Windows-blue.svg" alt="Platform">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-green.svg" alt="Runtime"></a>
  <img src="https://img.shields.io/badge/Language-JavaScript-F7DF1E.svg" alt="Language">
  <a href="https://github.com/Amtrtm/RedAlert/releases/latest"><img src="https://img.shields.io/badge/Download-MSI%20Installer-e74c3c.svg" alt="Download MSI"></a>
</p>

<p align="center"><strong>Real-time Pikud HaOref (Home Front Command) siren monitor for Windows</strong></p>

---

## Description

RedAlert is a Windows system tray application that monitors the Pikud HaOref (Israeli Home Front Command) API for real-time missile and rocket alerts. When a siren is detected in your configured area, the app automatically opens a live N12 news feed with HLS video streaming, shows desktop notifications, and plays an alert sound.

The application includes a 10-minute safety timer that keeps the alert active until the official all-clear is received, and a web-based configuration panel for managing monitored areas and alert preferences.

## Features

- Real-time polling of the Pikud HaOref alert API (configurable interval, default 5 seconds)
- Area-based filtering using Hebrew area names
- Automatic Chrome launch to N12 live news feed when a siren is detected
- Windows desktop notifications with alert details
- Audible alert sound playback
- System tray icon with pause, resume, and quit controls
- Web-based configuration panel served on `localhost:3847`
- Alert history log (last 100 alerts)
- Cooldown mechanism to prevent duplicate alert triggers
- Exponential backoff on consecutive API errors

## Prerequisites

- **Node.js 18+** (uses native `fetch`)
- **Windows** operating system
- **Israeli IP address** — the Pikud HaOref API is geo-blocked and only responds to requests originating from Israeli IP addresses

## Installation

```bash
git clone <your-repo-url>
cd RedAlert
npm install
node scripts/generate-assets.js
```

The `generate-assets.js` script creates the required tray icon and alert sound files in the `assets/` directory.

## Usage

```bash
npm start
```

The application will start polling for alerts and place an icon in the Windows system tray. Open the configuration panel in your browser at [http://localhost:3847](http://localhost:3847) to adjust settings.

## Configuration

All settings are managed through the web-based config panel at `http://localhost:3847`, or by editing `config.json` directly.

| Setting | Description | Default |
|---------|-------------|---------|
| **Areas** | List of Hebrew area names to monitor (e.g., `תל אביב`). Leave empty to receive all alerts. | `[]` (all areas) |
| **Poll Interval** | How often to check for new alerts, in milliseconds. | `5000` (5s) |
| **Open Browser** | Whether to automatically open Chrome to the news feed on alert. | `true` |
| **Notification** | Whether to show a Windows desktop notification on alert. | `true` |
| **Sound** | Whether to play an alert sound. | `true` |
| **Browser URL** | The URL to open when an alert is triggered. | `https://www.n12.co.il/` |
| **Alert Cooldown** | Minimum time between repeated alerts for the same area, in milliseconds. | `60000` (60s) |
| **Config Port** | The port for the web-based configuration panel. | `3847` |

## How It Works

1. The **Alert Poller** sends HTTP requests to the Pikud HaOref alerts endpoint at the configured interval.
2. When a non-empty response is received, it is parsed and compared against the last known alert ID to detect new alerts.
3. The **Alert Handler** filters the alert's area list against the user's configured areas.
4. If a match is found and the cooldown period has elapsed, the handler triggers the configured actions: desktop notification, alert sound, and/or opening Chrome to the N12 live feed.
5. The alert is recorded in the in-memory history log, viewable through the config panel.
6. If consecutive polling errors occur, the poller backs off exponentially (up to 30 seconds) before retrying.

## Important Notes

- This application uses the **unofficial** Pikud HaOref (Home Front Command) alert API. The API may change or become unavailable without notice.
- The API is **geo-blocked** and requires an Israeli IP address to function.
- This project is **not affiliated** with the Israeli government, the IDF, or Pikud HaOref in any way.
- This tool is intended for **personal use only**. Always follow the official Home Front Command instructions and guidelines during an emergency. Do not rely solely on this application for life-safety decisions.

## License

This project is licensed under the [MIT License](LICENSE).
