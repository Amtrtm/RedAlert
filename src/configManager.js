import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getAppDataDir } from './platform.js';

// Resolve the real app directory (not the pkg snapshot)
const appDir = process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..');

// Config lives beside the app binary in production, or in appDir during dev
const CONFIG_PATH = join(appDir, 'config.json');

const DEFAULT_CONFIG = {
  areas: [],
  pollInterval: 5000,
  alertActions: {
    openBrowser: true,
    notification: true,
    sound: true
  },
  browserUrl: 'https://www.n12.co.il/',
  alertCooldown: 60000,
  autoStart: false,
  configPort: 3847
};

let config = null;

export function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } else {
    config = { ...DEFAULT_CONFIG };
    saveConfig();
  }
  return config;
}

export function getConfig() {
  if (!config) loadConfig();
  return config;
}

// Only these keys can be set via the API
const ALLOWED_KEYS = ['areas', 'pollInterval', 'alertActions', 'browserUrl', 'alertCooldown', 'autoStart'];

export function updateConfig(updates) {
  let autoStartChanged = false;
  for (const key of ALLOWED_KEYS) {
    if (key in updates) {
      if (key === 'alertActions') {
        // Only allow known boolean sub-keys
        const actions = updates.alertActions;
        if (actions && typeof actions === 'object') {
          config.alertActions = {
            openBrowser: Boolean(actions.openBrowser),
            notification: Boolean(actions.notification),
            sound: Boolean(actions.sound)
          };
        }
      } else {
        if (key === 'autoStart' && config[key] !== Boolean(updates[key])) {
          autoStartChanged = true;
        }
        config[key] = updates[key];
      }
    }
  }
  saveConfig();

  // Apply auto-start change
  if (autoStartChanged) {
    import('./autoStart.js').then(m => m.setAutoStart(Boolean(config.autoStart))).catch(() => {});
  }

  return config;
}

function saveConfig() {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
