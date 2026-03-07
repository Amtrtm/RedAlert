import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { getConfig } from './configManager.js';
import notifier from 'node-notifier';
import open from 'open';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve the real app directory (not the pkg snapshot)
const appDir = process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..');

const alertCooldowns = new Map();
const alertHistory = [];

// Safety timer: minimum 10 minutes must pass with no new alerts in our region
const SAFETY_DURATION_MS = 10 * 60 * 1000; // 10 minutes
let safetyTimer = null;
let lastRegionalAlertTime = null;

// Current alert state for the alert-view page
let currentAlertState = {
  active: false,
  areas: [],
  title: '',
  description: '',
  timestamp: null,
  safetyCountdown: null
};

let browserOpen = false;
let onClearCallback = null;

export function setOnClearCallback(cb) {
  onClearCallback = cb;
}

// Pikud HaOref sends "האירוע הסתיים" as an alert when the event is officially over
const EVENT_OVER_TITLE = 'האירוע הסתיים';

export function handleAlert(alert) {
  const config = getConfig();
  const matchedAreas = findMatchingAreas(alert, config.areas);

  if (matchedAreas.length === 0) return;

  // Check if this is an "event over" message from Pikud HaOref
  if (alert.title === EVENT_OVER_TITLE) {
    console.log(`Official "event over" received for our area: ${matchedAreas.join(', ')}`);

    alertHistory.unshift({
      timestamp: new Date().toISOString(),
      id: alert.id,
      title: alert.title,
      areas: matchedAreas,
      category: alert.cat,
      description: 'הודעה רשמית מפיקוד העורף - האירוע הסתיים'
    });
    if (alertHistory.length > 100) alertHistory.length = 100;

    // Official all-clear — cancel safety timer and clear the alert
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    clearAlertSafe(true);
    return;
  }

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

  // Track when the last alert hit our region
  lastRegionalAlertTime = now;

  // Cancel any pending safety timer — new alert resets the countdown
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
    console.log('Safety timer RESET — new alert in region');
  }

  // Start the safety timer (10 min from now)
  startSafetyTimer();

  // Update current alert state for the alert-view page
  currentAlertState = {
    active: true,
    areas: matchedAreas,
    title: alert.title || 'התרעה',
    description: alert.desc || '',
    timestamp: new Date().toISOString(),
    safetyCountdown: lastRegionalAlertTime + SAFETY_DURATION_MS
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

function startSafetyTimer() {
  safetyTimer = setTimeout(() => {
    safetyTimer = null;
    const elapsed = Date.now() - lastRegionalAlertTime;
    if (elapsed >= SAFETY_DURATION_MS) {
      console.log(`Safety timer expired — ${SAFETY_DURATION_MS / 60000} minutes with no alerts in region. Event is over.`);
      clearAlertSafe();
    }
  }, SAFETY_DURATION_MS);

  const expiresAt = new Date(lastRegionalAlertTime + SAFETY_DURATION_MS);
  console.log(`Safety timer started — event will clear at ${expiresAt.toLocaleTimeString('he-IL')} (10 min from last regional alert)`);
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
    icon: join(appDir, 'assets', 'icon-alert.ico')
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
  const soundPath = join(appDir, 'assets', 'alert.wav');
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

// Called when event is officially over (Pikud HaOref message or safety timer)
function clearAlertSafe(isOfficial) {
  browserOpen = false;
  if (currentAlertState.active) {
    const reason = isOfficial
      ? 'הודעה רשמית מפיקוד העורף'
      : 'עברו 10 דקות ללא התרעות באזורך';
    console.log(`Alert cleared — ${isOfficial ? 'official Pikud HaOref all-clear' : '10 minutes with no alerts in region'}`);
    currentAlertState = {
      active: false,
      areas: currentAlertState.areas,
      title: 'האירוע הסתיים',
      description: reason,
      timestamp: new Date().toISOString(),
      safetyCountdown: null
    };
    lastRegionalAlertTime = null;
    if (onClearCallback) onClearCallback();
  }
}

// Called externally — does NOT immediately clear, only resets browser flag
// The actual clear happens only via the safety timer
export function clearAlert() {
  // Do nothing here — the safety timer handles the actual clear
  // This prevents premature "event is over" when the API goes empty
}

export function getAlertStatus() {
  // Include remaining countdown time so the UI can show it
  if (currentAlertState.active && lastRegionalAlertTime) {
    const remaining = Math.max(0, (lastRegionalAlertTime + SAFETY_DURATION_MS) - Date.now());
    return {
      ...currentAlertState,
      safetyRemaining: remaining,
      safetyDuration: SAFETY_DURATION_MS
    };
  }
  return currentAlertState;
}

export function getAlertHistory() {
  return alertHistory;
}
