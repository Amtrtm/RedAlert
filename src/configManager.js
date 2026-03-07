import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Resolve the real app directory (not the pkg snapshot)
const appDir = process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..');
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

export function updateConfig(updates) {
  config = { ...config, ...updates };
  saveConfig();
  return config;
}

function saveConfig() {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}
