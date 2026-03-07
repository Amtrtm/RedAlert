import { EventEmitter } from 'events';
import { getConfig } from './configManager.js';
import { log } from './logger.js';

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
  }

  start() {
    const config = getConfig();
    this.poll();
    this.timer = setInterval(() => this.poll(), config.pollInterval);
    log.info(`Polling started (every ${config.pollInterval / 1000}s)`);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      log.info('Polling stopped');
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
        this.emit('status', { polling: true, error: null });
        return;
      }

      const alert = JSON.parse(text);

      // Validate alert structure — reject malformed responses
      if (!isValidAlert(alert)) {
        log.warn('Invalid alert structure received, ignoring:', JSON.stringify(alert).slice(0, 200));
        return;
      }

      if (alert.id && alert.id === this.lastAlertId) {
        return;
      }

      this.lastAlertId = alert.id;
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

function isValidAlert(alert) {
  if (!alert || typeof alert !== 'object') return false;
  // Must have an id (string or number)
  if (alert.id == null) return false;
  // data must be an array of strings if present
  if (alert.data != null) {
    if (!Array.isArray(alert.data)) return false;
    if (!alert.data.every(d => typeof d === 'string')) return false;
  }
  // title must be a string if present
  if (alert.title != null && typeof alert.title !== 'string') return false;
  // desc must be a string if present
  if (alert.desc != null && typeof alert.desc !== 'string') return false;
  // cat must be a string or number if present
  if (alert.cat != null && typeof alert.cat !== 'string' && typeof alert.cat !== 'number') return false;
  return true;
}

export default AlertPoller;
