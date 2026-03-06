import { execFile } from 'child_process';
import { existsSync } from 'fs';
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

let browserOpen = false;

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

  if (actions.openBrowser && !browserOpen) {
    browserOpen = true;
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
  }, (err, response, metadata) => {
    if (err) {
      console.error('Notification error:', err.message);
    }
    if (metadata?.activationType === 'error' || response === 'error') {
      console.error('Notification failed. Falling back to PowerShell toast.');
      showPowerShellToast(alert, matchedAreas);
    }
  });
}

function showPowerShellToast(alert, matchedAreas) {
  const title = (alert.title || 'Alert').replace(/'/g, "''");
  const areas = matchedAreas.join(', ').replace(/'/g, "''");
  execFile('powershell.exe', [
    '-NoProfile', '-Command',
    `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null;
     [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null;
     $xml = New-Object Windows.Data.Xml.Dom.XmlDocument;
     $xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>Red Alert!</text><text>${title} - ${areas}</text></binding></visual></toast>');
     $toast = [Windows.UI.Notifications.ToastNotification]::new($xml);
     [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('RedAlert.PikudHaoref.Monitor').Show($toast);`
  ], (err) => {
    if (err) console.error('PowerShell toast error:', err.message);
    else console.log('PowerShell toast shown successfully');
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
  // On Windows, 'open' needs the start command or the full exe path for Chrome
  const chromePaths = [
    join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];

  const chromePath = chromePaths.find(p => {
    try { return existsSync(p); } catch { return false; }
  });

  if (chromePath) {
    console.log('Opening Chrome:', url);
    execFile(chromePath, ['--new-window', url], (err) => {
      if (err) {
        console.error('Chrome launch error:', err.message);
        openDefault(url);
      }
    });
  } else {
    console.log('Chrome not found, using default browser');
    openDefault(url);
  }
}

function openDefault(url) {
  open(url).catch(err => {
    console.error('Failed to open browser:', err.message);
  });
}

export function clearAlert() {
  browserOpen = false;
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
