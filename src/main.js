import { log } from './logger.js';

// Catch ALL uncaught errors and log them to file
process.on('uncaughtException', (err) => {
  log.error('UNCAUGHT EXCEPTION:', err.stack || err.message || err);
});
process.on('unhandledRejection', (reason) => {
  log.error('UNHANDLED REJECTION:', reason?.stack || reason?.message || reason);
});

log.info('=== RedAlert starting ===');
log.info('Log file:', log.file);
log.info('process.execPath:', process.execPath);
log.info('process.cwd():', process.cwd());
log.info('__dirname (snapshot):', typeof __dirname !== 'undefined' ? __dirname : 'N/A');
log.info('LOCALAPPDATA:', process.env.LOCALAPPDATA);

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
  log.info('App ID registered for notifications');
} catch (e) {
  log.warn('App ID registration failed (non-critical):', e.message);
}

log.info('Loading config...');
loadConfig();
const config = getConfig();
log.info('Config loaded:', JSON.stringify({ areas: config.areas, port: config.configPort, pollInterval: config.pollInterval }));

const poller = new AlertPoller();

poller.on('alert', (alert) => {
  log.info(`Alert received: ${alert.title} - ${alert.data?.join(', ')}`);
  handleAlert(alert);
  setAlertMode(true);
});

// Safety timer in alertHandler manages the clear — tray icon updates via callback
setOnClearCallback(() => setAlertMode(false));

poller.on('status', (status) => {
  if (status.error) {
    log.warn(`Polling error: ${status.error}`);
  }
});

log.info('Starting config server...');
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
    log.info('Config updated, restarting poller');
    poller.restart();
  }
});
log.info('Config server started');

log.info('Creating system tray...');
try {
  createTray({
    onStart: () => poller.start(),
    onStop: () => poller.stop()
  });
  log.info('System tray created successfully');
} catch (err) {
  log.error('Tray creation failed (app will continue without tray icon):', err.stack || err.message);
}

poller.start();
log.info('Poller started');

log.info('RedAlert is running. Monitoring for alerts...');

// First-run: if no areas configured, open the config page so the user can set up
const firstRunConfig = getConfig();
if (!firstRunConfig.areas || firstRunConfig.areas.length === 0) {
  log.info('No areas configured — opening config page for first-time setup...');
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
  log.info('Searching for Chrome:', chromePaths.join(', '));
  const chromePath = chromePaths.find(p => {
    try { return existsSync(p); } catch { return false; }
  });

  if (chromePath) {
    log.info('Found Chrome at:', chromePath);
    execFile(chromePath, ['--new-window', url], (err) => {
      if (err) {
        log.error('Chrome launch error:', err.message);
        import('open').then(m => m.default(url)).catch(() => {});
      }
    });
  } else {
    log.warn('Chrome not found, using default browser');
    import('open').then(m => m.default(url)).catch(e => {
      log.error('Failed to open browser:', e.message);
    });
  }
}

process.on('SIGINT', () => {
  log.info('SIGINT received, shutting down');
  poller.stop();
  killTray();
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down');
  poller.stop();
  killTray();
  process.exit(0);
});
