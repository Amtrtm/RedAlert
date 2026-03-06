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

setTimeout(() => {
  poller.stop();
  process.exit(0);
}, 15000);
