import { execFile } from 'child_process';
import { getConfig } from './configManager.js';
import notifier from 'node-notifier';
import open from 'open';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const alertCooldowns = new Map();
const alertHistory = [];

// Current alert state for the alert-view page
let currentAlertState = {
  active: false,
  areas: [],
  title: '',
  description: '',
  timestamp: null
};

export function handleAlert(alert) {
  const config = getConfig();
  const matchedAreas = findMatchingAreas(alert, config.areas);

  if (matchedAreas.length === 0) return;

  const cooldownKey = alert.id || matchedAreas.join(',');
  const now = Date.now();
  const lastAlert = alertCooldowns.get(cooldownKey);

  if (lastAlert && (now - lastAlert) < config.alertCooldown) {
    console.log(`Alert ${cooldownKey} still in cooldown, skipping`);
    return;
  }

  alertCooldowns.set(cooldownKey, now);

  alertHistory.unshift({
    timestamp: new Date().toISOString(),
    id: alert.id,
    title: alert.title,
    areas: matchedAreas,
    category: alert.cat,
    description: alert.desc
  });

  if (alertHistory.length > 100) alertHistory.length = 100;

  console.log(`SIREN in your area: ${matchedAreas.join(', ')}`);

  // Update current alert state for the alert-view page
  currentAlertState = {
    active: true,
    areas: matchedAreas,
    title: alert.title || 'התרעה',
    description: alert.desc || '',
    timestamp: new Date().toISOString()
  };

  const actions = config.alertActions;

  if (actions.notification) {
    showNotification(alert, matchedAreas);
  }

  if (actions.sound) {
    playAlertSound();
  }

  if (actions.openBrowser) {
    openBrowser(`http://localhost:${config.configPort}/alert-view.html`);
  }
}

function findMatchingAreas(alert, configuredAreas) {
  if (!alert.data || !Array.isArray(alert.data)) return [];
  if (!configuredAreas || configuredAreas.length === 0) return alert.data;

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
    sound: false,
    wait: true,
    timeout: 30,
    appID: 'RedAlert.PikudHaoref.Monitor',
    icon: join(__dirname, '..', 'assets', 'icon-alert.ico')
  });
}

function playAlertSound() {
  const soundPath = join(__dirname, '..', 'assets', 'alert.wav');
  execFile('powershell.exe', [
    '-NoProfile', '-Command',
    `(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`
  ], (err) => {
    if (err) console.error('Sound playback error:', err.message);
  });
}

function openBrowser(url) {
  open(url, { app: { name: 'chrome' } }).catch(() => {
    open(url).catch(err => {
      console.error('Failed to open browser:', err.message);
    });
  });
}

export function clearAlert() {
  if (currentAlertState.active) {
    console.log('Alert cleared - event is over');
    currentAlertState = {
      active: false,
      areas: currentAlertState.areas,
      title: 'האירוע הסתיים',
      description: 'The event is over',
      timestamp: new Date().toISOString()
    };
  }
}

export function getAlertStatus() {
  return currentAlertState;
}

export function getAlertHistory() {
  return alertHistory;
}
