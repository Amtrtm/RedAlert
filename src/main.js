import { loadConfig, getConfig } from './configManager.js';
import AlertPoller from './alertPoller.js';
import { handleAlert, clearAlert } from './alertHandler.js';
import { startConfigServer } from './configServer.js';
import { createTray, setAlertMode, killTray } from './tray.js';

loadConfig();

const poller = new AlertPoller();

poller.on('alert', (alert) => {
  console.log(`Alert received: ${alert.title} - ${alert.data?.join(', ')}`);
  handleAlert(alert);
  setAlertMode(true);
});

poller.on('clear', () => {
  clearAlert();
  setAlertMode(false);
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
