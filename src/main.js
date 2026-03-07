import { execFileSync } from 'child_process';
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
