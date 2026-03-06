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
    this.wasActive = false;
  }

  start() {
    const config = getConfig();
    this.poll();
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

      if (!text || text.trim() === '') {
        if (this.wasActive) {
          this.wasActive = false;
          this.emit('clear');
        }
        this.emit('status', { polling: true, error: null });
        return;
      }

      const alert = JSON.parse(text);

      if (alert.id && alert.id === this.lastAlertId) {
        return;
      }

      this.lastAlertId = alert.id;
      this.wasActive = true;
      this.emit('alert', alert);
      this.emit('status', { polling: true, error: null });

    } catch (err) {
      this.consecutiveErrors++;
      console.error(`Poll error (${this.consecutiveErrors}):`, err.message);
      this.emit('status', { polling: true, error: err.message });

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
