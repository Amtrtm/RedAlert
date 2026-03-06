import { execFile } from 'child_process';
import { getConfig } from './configManager.js';
import notifier from 'node-notifier';
import open from 'open';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const alertCooldowns = new Map();
const alertHistory = [];

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
    timeout: 30
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

export function getAlertHistory() {
  return alertHistory;
}
