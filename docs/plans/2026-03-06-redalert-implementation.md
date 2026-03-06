# RedAlert Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Windows system tray app that polls the Pikud HaOref API for missile alerts, filters by user's area, and opens Chrome to N12 live feed + notification + sound when a siren is detected.

**Architecture:** Node.js polling service with systray2 for system tray, Express for local config panel on localhost:3847, node-notifier for Windows toast notifications, and open package for safe browser launching.

**Tech Stack:** Node.js 18+, systray2, Express, node-notifier, open (npm)

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `src/main.js` (placeholder)
- Create: `config.json` (default config)

**Step 1: Initialize project and install dependencies**

```bash
cd ~/Documents/RedAlert
npm init -y
npm install express systray2 node-notifier open play-sound
```

**Step 2: Create default config.json**

Create `config.json`:
```json
{
  "areas": [],
  "pollInterval": 5000,
  "alertActions": {
    "openBrowser": true,
    "notification": true,
    "sound": true
  },
  "browserUrl": "https://www.n12.co.il/",
  "alertCooldown": 60000,
  "autoStart": false,
  "configPort": 3847
}
```

**Step 3: Create placeholder main.js**

Create `src/main.js`:
```js
console.log('RedAlert starting...');
```

**Step 4: Update package.json scripts**

Add to package.json scripts and set `"type": "module"`:
```json
{
  "type": "module",
  "scripts": {
    "start": "node src/main.js"
  }
}
```

**Step 5: Verify it runs**

Run: `npm start`
Expected: prints "RedAlert starting..."

**Step 6: Initialize git and commit**

```bash
git init
echo "node_modules/" > .gitignore
git add .gitignore package.json package-lock.json config.json src/main.js docs/
git commit -m "feat: initial project scaffolding with dependencies"
```

---

### Task 2: Config Manager

**Files:**
- Create: `src/configManager.js`

**Step 1: Write configManager.js**

Create `src/configManager.js`:
```js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

const DEFAULT_CONFIG = {
  areas: [],
  pollInterval: 5000,
  alertActions: {
    openBrowser: true,
    notification: true,
    sound: true
  },
  browserUrl: 'https://www.n12.co.il/',
  alertCooldown: 60000,
  autoStart: false,
  configPort: 3847
};

let config = null;

export function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } else {
    config = { ...DEFAULT_CONFIG };
    saveConfig();
  }
  return config;
}

export function getConfig() {
  if (!config) loadConfig();
  return config;
}

export function updateConfig(updates) {
  config = { ...config, ...updates };
  saveConfig();
  return config;
}

function saveConfig() {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
```

**Step 2: Verify by importing in main.js**

Update `src/main.js`:
```js
import { loadConfig, getConfig } from './configManager.js';

const config = loadConfig();
console.log('Config loaded:', JSON.stringify(config, null, 2));
```

**Step 3: Run to verify**

Run: `npm start`
Expected: prints the config JSON

**Step 4: Commit**

```bash
git add src/configManager.js src/main.js package.json
git commit -m "feat: add config manager with load/save/update"
```

---

### Task 3: Alert Poller

**Files:**
- Create: `src/alertPoller.js`

**Step 1: Write alertPoller.js**

Create `src/alertPoller.js`:
```js
import { EventEmitter } from 'events';
import { getConfig } from './configManager.js';

const ALERTS_URL = 'https://www.oref.org.il/WarningMessages/alert/alerts.json';
const HEADERS = {
  'Referer': 'https://www.oref.org.il/',
  'X-Requested-With': 'XMLHttpRequest',
  'Accept': 'application/json'
};

class AlertPoller extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.lastAlertId = null;
    this.consecutiveErrors = 0;
  }

  start() {
    const config = getConfig();
    this.poll(); // immediate first poll
    this.timer = setInterval(() => this.poll(), config.pollInterval);
    console.log(`Polling started (every ${config.pollInterval / 1000}s)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('Polling stopped');
    }
  }

  restart() {
    this.stop();
    this.start();
  }

  async poll() {
    try {
      const response = await fetch(ALERTS_URL, {
        headers: HEADERS,
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      this.consecutiveErrors = 0;

      // Empty response = no active alerts
      if (!text || text.trim() === '') {
        this.emit('status', { polling: true, error: null });
        return;
      }

      const alert = JSON.parse(text);

      // Skip if we already processed this alert
      if (alert.id && alert.id === this.lastAlertId) {
        return;
      }

      this.lastAlertId = alert.id;
      this.emit('alert', alert);
      this.emit('status', { polling: true, error: null });

    } catch (err) {
      this.consecutiveErrors++;
      console.error(`Poll error (${this.consecutiveErrors}):`, err.message);
      this.emit('status', { polling: true, error: err.message });

      // Exponential backoff after 3 consecutive errors
      if (this.consecutiveErrors >= 3) {
        this.stop();
        const backoff = Math.min(30000, 5000 * Math.pow(2, this.consecutiveErrors - 3));
        console.log(`Backing off for ${backoff / 1000}s`);
        setTimeout(() => this.start(), backoff);
      }
    }
  }
}

export default AlertPoller;
```

**Step 2: Test poller in main.js**

Update `src/main.js`:
```js
import { loadConfig } from './configManager.js';
import AlertPoller from './alertPoller.js';

loadConfig();

const poller = new AlertPoller();
poller.on('alert', (alert) => {
  console.log('ALERT:', JSON.stringify(alert));
});
poller.on('status', (status) => {
  if (status.error) console.log('Status:', status.error);
});
poller.start();

// Stop after 30s for testing
setTimeout(() => {
  poller.stop();
  process.exit(0);
}, 30000);
```

**Step 3: Run to verify polling works**

Run: `npm start`
Expected: Polls every 5s, prints status. If no active alerts, no ALERT lines. If API is reachable from Israel, should work. If geo-blocked (non-Israeli IP during dev), will show HTTP errors.

**Step 4: Commit**

```bash
git add src/alertPoller.js src/main.js
git commit -m "feat: add alert poller with Pikud HaOref API integration"
```

---

### Task 4: Alert Handler

**Files:**
- Create: `src/alertHandler.js`

**Step 1: Write alertHandler.js**

Create `src/alertHandler.js`:
```js
import { execFile } from 'child_process';
import { getConfig } from './configManager.js';
import notifier from 'node-notifier';
import open from 'open';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Track cooldowns per area to prevent duplicate alerts
const alertCooldowns = new Map();

// Alert history for config panel
const alertHistory = [];

export function handleAlert(alert) {
  const config = getConfig();
  const matchedAreas = findMatchingAreas(alert, config.areas);

  if (matchedAreas.length === 0) return;

  // Check cooldown
  const cooldownKey = alert.id || matchedAreas.join(',');
  const now = Date.now();
  const lastAlert = alertCooldowns.get(cooldownKey);

  if (lastAlert && (now - lastAlert) < config.alertCooldown) {
    console.log(`Alert ${cooldownKey} still in cooldown, skipping`);
    return;
  }

  alertCooldowns.set(cooldownKey, now);

  // Log to history
  alertHistory.unshift({
    timestamp: new Date().toISOString(),
    id: alert.id,
    title: alert.title,
    areas: matchedAreas,
    category: alert.cat,
    description: alert.desc
  });

  // Keep only last 100 alerts
  if (alertHistory.length > 100) alertHistory.length = 100;

  console.log(`SIREN in your area: ${matchedAreas.join(', ')}`);

  // Execute alert actions
  const actions = config.alertActions;

  if (actions.notification) {
    showNotification(alert, matchedAreas);
  }

  if (actions.sound) {
    playAlertSound();
  }

  if (actions.openBrowser) {
    openBrowser(config.browserUrl);
  }
}

function findMatchingAreas(alert, configuredAreas) {
  if (!alert.data || !Array.isArray(alert.data)) return [];
  if (!configuredAreas || configuredAreas.length === 0) return alert.data; // If no areas configured, match all

  return alert.data.filter(area =>
    configuredAreas.some(configured =>
      area.includes(configured) || configured.includes(area)
    )
  );
}

function showNotification(alert, matchedAreas) {
  notifier.notify({
    title: 'Red Alert!',
    message: `${alert.title || 'Alert'}\n${matchedAreas.join(', ')}\n${alert.desc || ''}`,
    sound: false, // We handle sound separately
    wait: true,
    timeout: 30
  });
}

function playAlertSound() {
  const soundPath = join(__dirname, '..', 'assets', 'alert.wav');
  // Use PowerShell to play sound safely via execFile (no shell injection)
  execFile('powershell.exe', [
    '-NoProfile', '-Command',
    `(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`
  ], (err) => {
    if (err) console.error('Sound playback error:', err.message);
  });
}

function openBrowser(url) {
  open(url, { app: { name: 'chrome' } }).catch(() => {
    // Fallback to default browser if Chrome not found
    open(url).catch(err => {
      console.error('Failed to open browser:', err.message);
    });
  });
}

export function getAlertHistory() {
  return alertHistory;
}
```

**Step 2: Commit**

```bash
git add src/alertHandler.js
git commit -m "feat: add alert handler with notifications, sound, and browser launch"
```

---

### Task 5: Generate Tray Icons and Alert Sound

**Files:**
- Create: `scripts/generate-assets.js`
- Creates: `assets/icon.ico`, `assets/icon-alert.ico`, `assets/alert.wav`

**Step 1: Create asset generation script**

Create `scripts/generate-assets.js`:
```js
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'assets');

if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });

// Generate a minimal 16x16 ICO file with a colored circle
function createIco(color) {
  const width = 16, height = 16;
  const bmpDataSize = width * height * 4 + width * height / 8;
  const bmpHeaderSize = 40;
  const dataOffset = 6 + 16;

  const buf = Buffer.alloc(dataOffset + bmpHeaderSize + bmpDataSize);
  let offset = 0;

  // ICO Header
  buf.writeUInt16LE(0, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;

  // ICO Directory Entry
  buf.writeUInt8(width, offset); offset += 1;
  buf.writeUInt8(height, offset); offset += 1;
  buf.writeUInt8(0, offset); offset += 1;
  buf.writeUInt8(0, offset); offset += 1;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(32, offset); offset += 2;
  buf.writeUInt32LE(bmpHeaderSize + bmpDataSize, offset); offset += 4;
  buf.writeUInt32LE(dataOffset, offset); offset += 4;

  // BMP Info Header
  buf.writeUInt32LE(bmpHeaderSize, offset); offset += 4;
  buf.writeInt32LE(width, offset); offset += 4;
  buf.writeInt32LE(height * 2, offset); offset += 4;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(32, offset); offset += 2;
  buf.writeUInt32LE(0, offset); offset += 4;
  buf.writeUInt32LE(bmpDataSize, offset); offset += 4;
  buf.writeInt32LE(0, offset); offset += 4;
  buf.writeInt32LE(0, offset); offset += 4;
  buf.writeUInt32LE(0, offset); offset += 4;
  buf.writeUInt32LE(0, offset); offset += 4;

  // Pixel data (BGRA, bottom-up)
  const cx = 7.5, cy = 7.5, r = 6;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        buf.writeUInt8(color.b, offset);
        buf.writeUInt8(color.g, offset + 1);
        buf.writeUInt8(color.r, offset + 2);
        buf.writeUInt8(255, offset + 3);
      } else {
        buf.writeUInt32LE(0, offset);
      }
      offset += 4;
    }
  }

  // AND mask
  const andMaskSize = width * height / 8;
  for (let i = 0; i < andMaskSize; i++) {
    buf.writeUInt8(0, offset); offset++;
  }

  return buf;
}

// Generate a simple WAV siren (1.5 seconds, alternating 800/600Hz)
function createAlertWav() {
  const sampleRate = 44100;
  const duration = 1.5;
  const numSamples = sampleRate * duration;
  const dataSize = numSamples * 2;
  const headerSize = 44;

  const buf = Buffer.alloc(headerSize + dataSize);
  let offset = 0;

  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(36 + dataSize, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt16LE(1, offset); offset += 2;
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(sampleRate * 2, offset); offset += 4;
  buf.writeUInt16LE(2, offset); offset += 2;
  buf.writeUInt16LE(16, offset); offset += 2;
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const freq = Math.floor(t / 0.3) % 2 === 0 ? 800 : 600;
    const amplitude = 0.8 * 32767;
    const sample = Math.round(amplitude * Math.sin(2 * Math.PI * freq * t));
    buf.writeInt16LE(sample, offset);
    offset += 2;
  }

  return buf;
}

writeFileSync(join(assetsDir, 'icon.ico'), createIco({ r: 46, g: 204, b: 113 }));
writeFileSync(join(assetsDir, 'icon-alert.ico'), createIco({ r: 231, g: 76, b: 60 }));
writeFileSync(join(assetsDir, 'alert.wav'), createAlertWav());

console.log('Assets generated in', assetsDir);
```

**Step 2: Run asset generator**

Run: `node scripts/generate-assets.js`
Expected: prints "Assets generated in ..." and creates 3 files in assets/

**Step 3: Commit**

```bash
git add scripts/generate-assets.js assets/
git commit -m "feat: add asset generation script and generated tray icons + alert sound"
```

---

### Task 6: System Tray

**Files:**
- Create: `src/tray.js`

**Step 1: Write tray.js**

Create `src/tray.js`:
```js
import SysTray from 'systray2';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import { getConfig } from './configManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let systray = null;

const normalIcon = readFileSync(join(__dirname, '..', 'assets', 'icon.ico')).toString('base64');
const alertIcon = readFileSync(join(__dirname, '..', 'assets', 'icon-alert.ico')).toString('base64');

export function createTray({ onStart, onStop }) {
  systray = new SysTray({
    menu: {
      icon: normalIcon,
      title: 'RedAlert',
      tooltip: 'RedAlert - Pikud HaOref Monitor',
      items: [
        { title: 'RedAlert - Active', tooltip: 'Status', enabled: false },
        SysTray.separator,
        { title: 'Open Config Panel', tooltip: 'Open settings in browser', enabled: true },
        { title: 'Pause Monitoring', tooltip: 'Pause/Resume polling', enabled: true },
        SysTray.separator,
        { title: 'Quit', tooltip: 'Exit RedAlert', enabled: true }
      ]
    },
    debug: false,
    copyDir: false
  });

  systray.onClick(action => {
    switch (action.seq_id) {
      case 2: // Open Config Panel
        const config = getConfig();
        open(`http://localhost:${config.configPort}`);
        break;
      case 3: // Pause/Resume
        if (action.item.title === 'Pause Monitoring') {
          onStop();
          systray.sendAction({
            type: 'update-item',
            item: { ...action.item, title: 'Resume Monitoring' },
            seq_id: action.seq_id
          });
          setStatusText('RedAlert - Paused');
        } else {
          onStart();
          systray.sendAction({
            type: 'update-item',
            item: { ...action.item, title: 'Resume Monitoring' },
            seq_id: action.seq_id
          });
          setStatusText('RedAlert - Active');
        }
        break;
      case 5: // Quit
        if (systray) systray.kill(false);
        process.exit(0);
        break;
    }
  });

  return systray;
}

export function setAlertMode(isAlert) {
  if (!systray) return;
  systray.sendAction({
    type: 'update-menu',
    menu: {
      icon: isAlert ? alertIcon : normalIcon,
      title: 'RedAlert',
      tooltip: isAlert ? 'ALERT ACTIVE!' : 'RedAlert - Monitoring'
    }
  });

  if (isAlert) {
    setTimeout(() => setAlertMode(false), 30000);
  }
}

function setStatusText(text) {
  if (!systray) return;
  systray.sendAction({
    type: 'update-item',
    item: { title: text, tooltip: text, enabled: false },
    seq_id: 0
  });
}

export function killTray() {
  if (systray) systray.kill(false);
}
```

**Step 2: Commit**

```bash
git add src/tray.js
git commit -m "feat: add system tray with menu controls"
```

---

### Task 7: Config Server (Express Web Panel)

**Files:**
- Create: `src/configServer.js`
- Create: `public/index.html`
- Create: `public/style.css`
- Create: `public/app.js`

**Step 1: Write configServer.js**

Create `src/configServer.js`:
```js
import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConfig, updateConfig } from './configManager.js';
import { getAlertHistory } from './alertHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let onConfigChange = null;

export function startConfigServer({ onConfigUpdate }) {
  onConfigChange = onConfigUpdate;
  const config = getConfig();
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, '..', 'public')));

  app.get('/api/config', (req, res) => {
    res.json(getConfig());
  });

  app.post('/api/config', (req, res) => {
    const updated = updateConfig(req.body);
    if (onConfigChange) onConfigChange(updated);
    res.json(updated);
  });

  app.get('/api/history', (req, res) => {
    res.json(getAlertHistory());
  });

  app.post('/api/test-alert', (req, res) => {
    if (onConfigChange) {
      onConfigChange(null, true);
    }
    res.json({ ok: true });
  });

  app.listen(config.configPort, '127.0.0.1', () => {
    console.log(`Config panel: http://localhost:${config.configPort}`);
  });
}
```

**Step 2: Write public/index.html**

Create `public/index.html`:
```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RedAlert - Settings</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>RedAlert</h1>
      <p class="subtitle">Pikud HaOref Siren Monitor</p>
    </header>

    <section class="card">
      <h2>Monitored Areas</h2>
      <p class="help">Enter area names in Hebrew as they appear in the Pikud HaOref system. One per line.</p>
      <textarea id="areas" rows="4" placeholder="e.g. &#1514;&#1500; &#1488;&#1489;&#1497;&#1489; - &#1502;&#1512;&#1499;&#1494; &#1492;&#1506;&#1497;&#1512;&#10;&#1495;&#1493;&#1500;&#1493;&#1503;"></textarea>
    </section>

    <section class="card">
      <h2>Poll Interval</h2>
      <div class="radio-group">
        <label><input type="radio" name="pollInterval" value="3000"> 3s</label>
        <label><input type="radio" name="pollInterval" value="5000"> 5s</label>
        <label><input type="radio" name="pollInterval" value="10000"> 10s</label>
        <label><input type="radio" name="pollInterval" value="15000"> 15s</label>
        <label><input type="radio" name="pollInterval" value="30000"> 30s</label>
      </div>
    </section>

    <section class="card">
      <h2>Alert Actions</h2>
      <div class="checkbox-group">
        <label><input type="checkbox" id="openBrowser"> Open Chrome to N12 live feed</label>
        <label><input type="checkbox" id="notification"> Show desktop notification</label>
        <label><input type="checkbox" id="sound"> Play alert sound</label>
      </div>
    </section>

    <section class="card">
      <h2>News Feed URL</h2>
      <input type="url" id="browserUrl" placeholder="https://www.n12.co.il/">
    </section>

    <section class="card">
      <h2>Alert Cooldown</h2>
      <p class="help">Seconds to wait before re-triggering for the same alert.</p>
      <select id="alertCooldown">
        <option value="30000">30 seconds</option>
        <option value="60000">60 seconds</option>
        <option value="120000">2 minutes</option>
        <option value="300000">5 minutes</option>
      </select>
    </section>

    <div class="actions">
      <button id="saveBtn" class="btn-primary">Save Settings</button>
      <button id="testBtn" class="btn-secondary">Test Alert</button>
    </div>

    <section class="card">
      <h2>Alert History</h2>
      <div id="history" class="history-list">
        <p class="empty">No alerts yet.</p>
      </div>
      <button id="refreshHistory" class="btn-secondary btn-small">Refresh</button>
    </section>
  </div>

  <script src="app.js"></script>
</body>
</html>
```

**Step 3: Write public/style.css**

Create `public/style.css`:
```css
* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: 'Segoe UI', Tahoma, sans-serif;
  background: #0f0f23;
  color: #e0e0e0;
  min-height: 100vh;
  padding: 20px;
}

.container { max-width: 600px; margin: 0 auto; }

header { text-align: center; margin-bottom: 30px; }

header h1 {
  font-size: 2.5rem;
  color: #e74c3c;
  text-shadow: 0 0 20px rgba(231, 76, 60, 0.3);
}

.subtitle { color: #888; margin-top: 5px; }

.card {
  background: #1a1a2e;
  border: 1px solid #2a2a4a;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

.card h2 { font-size: 1.1rem; color: #fff; margin-bottom: 12px; }

.help { font-size: 0.85rem; color: #888; margin-bottom: 10px; }

textarea, input[type="url"], select {
  width: 100%;
  padding: 10px 14px;
  background: #16213e;
  border: 1px solid #2a2a4a;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 0.95rem;
  font-family: inherit;
  direction: rtl;
}

textarea:focus, input:focus, select:focus {
  outline: none;
  border-color: #e74c3c;
  box-shadow: 0 0 0 2px rgba(231, 76, 60, 0.2);
}

.radio-group, .checkbox-group { display: flex; flex-wrap: wrap; gap: 12px; }

.checkbox-group { flex-direction: column; gap: 10px; }

.radio-group label, .checkbox-group label {
  cursor: pointer;
  padding: 8px 16px;
  background: #16213e;
  border-radius: 8px;
  border: 1px solid #2a2a4a;
  transition: all 0.2s;
}

.radio-group label:has(:checked),
.checkbox-group label:has(:checked) {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

.actions { display: flex; gap: 12px; margin-bottom: 16px; }

.btn-primary, .btn-secondary {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary { background: #e74c3c; color: #fff; flex: 1; }
.btn-primary:hover { background: #c0392b; }
.btn-secondary { background: #2a2a4a; color: #e0e0e0; }
.btn-secondary:hover { background: #3a3a5a; }
.btn-small { padding: 6px 14px; font-size: 0.85rem; margin-top: 10px; }

.history-list { max-height: 300px; overflow-y: auto; }

.history-item {
  padding: 10px;
  border-bottom: 1px solid #2a2a4a;
  font-size: 0.9rem;
}

.history-item .time { color: #888; font-size: 0.8rem; }
.history-item .areas { color: #e74c3c; font-weight: 600; }
.empty { color: #555; text-align: center; padding: 20px; }

.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  background: #2ecc71;
  color: #fff;
  border-radius: 8px;
  font-weight: 600;
  opacity: 0;
  transition: opacity 0.3s;
  z-index: 100;
}

.toast.show { opacity: 1; }
```

**Step 4: Write public/app.js (using safe DOM methods, no innerHTML)**

Create `public/app.js`:
```js
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  loadHistory();

  document.getElementById('saveBtn').addEventListener('click', saveConfig);
  document.getElementById('testBtn').addEventListener('click', testAlert);
  document.getElementById('refreshHistory').addEventListener('click', loadHistory);
});

async function loadConfig() {
  const res = await fetch('/api/config');
  const config = await res.json();

  document.getElementById('areas').value = (config.areas || []).join('\n');

  const radios = document.querySelectorAll('input[name="pollInterval"]');
  radios.forEach(r => { r.checked = parseInt(r.value) === config.pollInterval; });

  document.getElementById('openBrowser').checked = config.alertActions?.openBrowser ?? true;
  document.getElementById('notification').checked = config.alertActions?.notification ?? true;
  document.getElementById('sound').checked = config.alertActions?.sound ?? true;

  document.getElementById('browserUrl').value = config.browserUrl || 'https://www.n12.co.il/';
  document.getElementById('alertCooldown').value = String(config.alertCooldown || 60000);
}

async function saveConfig() {
  const areasText = document.getElementById('areas').value.trim();
  const areas = areasText ? areasText.split('\n').map(a => a.trim()).filter(Boolean) : [];

  const pollRadio = document.querySelector('input[name="pollInterval"]:checked');
  const pollInterval = pollRadio ? parseInt(pollRadio.value) : 5000;

  const config = {
    areas,
    pollInterval,
    alertActions: {
      openBrowser: document.getElementById('openBrowser').checked,
      notification: document.getElementById('notification').checked,
      sound: document.getElementById('sound').checked
    },
    browserUrl: document.getElementById('browserUrl').value || 'https://www.n12.co.il/',
    alertCooldown: parseInt(document.getElementById('alertCooldown').value)
  };

  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config)
  });

  showToast('Settings saved!');
}

async function testAlert() {
  await fetch('/api/test-alert', { method: 'POST' });
  showToast('Test alert triggered!');
}

async function loadHistory() {
  const res = await fetch('/api/history');
  const history = await res.json();
  const container = document.getElementById('history');

  // Clear existing content safely
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (history.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No alerts yet.';
    container.appendChild(p);
    return;
  }

  history.forEach(h => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = new Date(h.timestamp).toLocaleString('he-IL');
    item.appendChild(time);

    const areas = document.createElement('div');
    areas.className = 'areas';
    areas.textContent = h.areas.join(', ');
    item.appendChild(areas);

    const desc = document.createElement('div');
    desc.textContent = [h.title, h.description].filter(Boolean).join(' - ');
    item.appendChild(desc);

    container.appendChild(item);
  });
}

function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}
```

**Step 5: Commit**

```bash
git add src/configServer.js public/
git commit -m "feat: add config server and web-based settings panel"
```

---

### Task 8: Wire Everything Together in main.js

**Files:**
- Modify: `src/main.js`

**Step 1: Write final main.js**

Rewrite `src/main.js`:
```js
import { loadConfig, getConfig } from './configManager.js';
import AlertPoller from './alertPoller.js';
import { handleAlert } from './alertHandler.js';
import { startConfigServer } from './configServer.js';
import { createTray, setAlertMode, killTray } from './tray.js';

loadConfig();

const poller = new AlertPoller();

poller.on('alert', (alert) => {
  console.log(`Alert received: ${alert.title} - ${alert.data?.join(', ')}`);
  handleAlert(alert);
  setAlertMode(true);
});

poller.on('status', (status) => {
  if (status.error) {
    console.log(`Polling error: ${status.error}`);
  }
});

startConfigServer({
  onConfigUpdate: (newConfig, isTestAlert) => {
    if (isTestAlert) {
      handleAlert({
        id: `test-${Date.now()}`,
        cat: '1',
        title: 'Test Alert',
        data: getConfig().areas.length > 0 ? getConfig().areas : ['Test Area'],
        desc: 'This is a test alert'
      });
      setAlertMode(true);
      return;
    }
    console.log('Config updated, restarting poller');
    poller.restart();
  }
});

createTray({
  onStart: () => poller.start(),
  onStop: () => poller.stop()
});

poller.start();

console.log('RedAlert is running. Monitoring for alerts...');

process.on('SIGINT', () => {
  poller.stop();
  killTray();
  process.exit(0);
});

process.on('SIGTERM', () => {
  poller.stop();
  killTray();
  process.exit(0);
});
```

**Step 2: Run the complete app**

Run: `npm start`
Expected:
- Console prints "RedAlert is running. Monitoring for alerts..."
- Console prints "Config panel: http://localhost:3847"
- Console prints "Polling started (every 5s)"
- System tray icon appears (green circle)
- http://localhost:3847 shows the config panel

**Step 3: Commit**

```bash
git add src/main.js
git commit -m "feat: wire all components together in main entry point"
```

---

### Task 9: Add README

**Files:**
- Create: `README.md`

**Step 1: Write README.md**

Create `README.md` with project description, shields.io badges, prerequisites (Node.js 18+), installation steps, usage, configuration docs, data flow, and MIT license notice. Include note that this uses the unofficial Pikud HaOref API and requires an Israeli IP.

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
```

---

### Task 10: End-to-End Testing

**Step 1: Full startup test**

Run: `npm start`
Verify: tray icon appears, config panel loads at http://localhost:3847, polling logs appear every 5s

**Step 2: Test alert flow**

Open config panel, click "Test Alert", verify: notification appears, sound plays, Chrome opens to N12, alert in history

**Step 3: Test config changes**

Change poll interval to 10s, Save, verify console shows new interval

**Step 4: Test tray menu**

Right-click tray icon: "Open Config Panel" opens browser, "Pause" stops polling, "Resume" restarts, "Quit" exits
