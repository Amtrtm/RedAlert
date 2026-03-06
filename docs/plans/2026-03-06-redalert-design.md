# RedAlert - Pikud HaOref Siren Monitor with N12 Live Feed

## Overview

A Node.js system tray application that polls the official Pikud HaOref API every 5 seconds (configurable), filters alerts by configured area, and when a siren is detected:
1. Opens Chrome to N12 live news feed
2. Shows a Windows desktop notification with alert details
3. Plays an alert sound

A local web-based config panel (Express server on localhost:3847) lets users configure settings.

## Tech Stack

- **Runtime**: Node.js (18+)
- **Tray**: node-systray (lightweight)
- **Config Panel**: Express on localhost:3847
- **Notifications**: node-notifier (Windows toast)
- **Sound**: play-sound
- **HTTP**: Built-in fetch (Node 18+)
- **Chrome Launch**: Uses execFile (not exec) to safely open browser without shell injection risk

## Project Structure

```
RedAlert/
├── src/
│   ├── main.js              # Entry point - tray app + orchestrator
│   ├── alertPoller.js        # Polls oref.org.il alerts.json
│   ├── alertHandler.js       # Filters by area, triggers actions
│   ├── configManager.js      # Reads/writes config.json
│   ├── configServer.js       # Express server for web config panel
│   └── tray.js               # System tray icon + menu
├── public/
│   ├── index.html            # Config panel UI
│   ├── style.css
│   └── app.js                # Config panel client-side JS
├── assets/
│   ├── icon.png              # Tray icon (normal)
│   ├── icon-alert.png        # Tray icon (alert active)
│   └── alert.wav             # Alert sound
├── config.json               # User settings (persisted)
├── package.json
└── README.md
```

## Data Flow

```
[Pikud HaOref API] --(poll every 5s)--> [alertPoller]
       |
       v
[alertHandler] -- matches area? --> YES --> Open Chrome to N12
                                        --> Windows notification
                                        --> Play alert sound
                                        --> Update tray icon
                                   NO  --> (skip, wait for next poll)
```

## API Integration

```
GET https://www.oref.org.il/WarningMessages/alert/alerts.json
Headers:
  Referer: https://www.oref.org.il/
  X-Requested-With: XMLHttpRequest

Response (active alert):
{
  "id": "...",
  "cat": "1",
  "title": "ירי רקטות וטילים",
  "data": ["תל אביב - מרכז העיר", "חולון"],
  "desc": "היכנסו למרחב המוגן"
}

Response (no alert): empty string ""
```

## Config Panel Settings (localhost:3847)

- Monitored areas: searchable multi-select of Pikud HaOref area names (Hebrew)
- Poll interval: 3s / 5s / 10s / 15s / 30s
- Alert actions: checkboxes for Chrome / Notification / Sound
- N12 URL: editable, default https://www.n12.co.il/
- Alert cooldown: prevent re-trigger for same alert (default: 60s)
- Auto-start with Windows: toggle
- Alert history log: recent alerts with timestamps

## Error Handling

- API unreachable: log, continue polling, warning icon in tray
- Rate limiting: exponential backoff, resume normal interval
- Chrome not found: fall back to default browser via execFile
- Duplicate alerts: track alert IDs, cooldown period

## Security

- Use execFile instead of exec for launching browser (prevents command injection)
- Config panel only binds to localhost (not exposed to network)
- No user input is passed to shell commands
