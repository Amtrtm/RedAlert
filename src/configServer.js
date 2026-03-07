import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConfig, updateConfig } from './configManager.js';
import { getAlertHistory, getAlertStatus } from './alertHandler.js';
import { log } from './logger.js';

// Resolve the real app directory (not the pkg snapshot)
const appDir = process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..');

let onConfigChange = null;

export function startConfigServer({ onConfigUpdate }) {
  onConfigChange = onConfigUpdate;
  const config = getConfig();
  const app = express();

  app.use(express.json());
  const publicDir = join(appDir, 'public');
  log.info('Serving static files from:', publicDir);
  app.use(express.static(publicDir));

  app.get('/api/config', (req, res) => {
    res.json(getConfig());
  });

  app.post('/api/config', (req, res) => {
    const updated = updateConfig(req.body);
    if (onConfigChange) onConfigChange(updated);
    res.json(updated);
  });

  app.get('/api/alert-status', (req, res) => {
    res.json(getAlertStatus());
  });

  app.get('/api/history', (req, res) => {
    res.json(getAlertHistory());
  });

  app.post('/api/test-alert', (req, res) => {
    if (onConfigChange) {
      onConfigChange(null, true);
    }
    res.json({ ok: true });
  });

  app.listen(config.configPort, '127.0.0.1', () => {
    console.log(`Config panel: http://localhost:${config.configPort}`);
  });
}
