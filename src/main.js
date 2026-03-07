import { execFileSync, execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, getConfig } from './configManager.js';
import AlertPoller from './alertPoller.js';
import { handleAlert, clearAlert, setOnClearCallback } from './alertHandler.js';
import { startConfigServer } from './configServer.js';
import { createTray, setAlertMode, killTray } from './tray.js';

// Register App ID for Windows toast notifications
try {
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `
    $appId = 'RedAlert.PikudHaoref.Monitor'
    $key = 'HKCU:\\SOFTWARE\\Classes\\AppUserModelId\\' + $appId
    if (-not (Test-Path $key)) {
      New-Item -Path $key -Force | Out-Null
      New-ItemProperty -Path $key -Name 'DisplayName' -Value 'RedAlert' -Force | Out-Null
    }
  `], { stdio: 'ignore' });
} catch (e) {
  // Non-critical — notifications may still work without registration
}

loadConfig();

const poller = new AlertPoller();

poller.on('alert', (alert) => {
  console.log(`Alert received: ${alert.title} - ${alert.data?.join(', ')}`);
  handleAlert(alert);
  setAlertMode(true);
});

// Safety timer in alertHandler manages the clear — tray icon updates via callback
setOnClearCallback(() => setAlertMode(false));

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

try {
  createTray({
    onStart: () => poller.start(),
    onStop: () => poller.stop()
  });
} catch (err) {
  console.error('Tray creation failed (app will continue without tray icon):', err.message);
}

poller.start();

console.log('RedAlert is running. Monitoring for alerts...');

// First-run: if no areas configured, open the config page so the user can set up
const firstRunConfig = getConfig();
if (!firstRunConfig.areas || firstRunConfig.areas.length === 0) {
  console.log('No areas configured — opening config page for first-time setup...');
  const configUrl = `http://localhost:${firstRunConfig.configPort}`;
  // Small delay to ensure the server is ready
  setTimeout(() => openConfigInChrome(configUrl), 1500);
}

function openConfigInChrome(url) {
  const chromePaths = [
    join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  const chromePath = chromePaths.find(p => {
    try { return existsSync(p); } catch { return false; }
  });

  if (chromePath) {
    execFile(chromePath, ['--new-window', url], (err) => {
      if (err) {
        console.error('Chrome launch error:', err.message);
        import('open').then(m => m.default(url)).catch(() => {});
      }
    });
  } else {
    import('open').then(m => m.default(url)).catch(e => {
      console.error('Failed to open browser:', e.message);
    });
  }
}

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
