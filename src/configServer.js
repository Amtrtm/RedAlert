import express from 'express';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getConfig, updateConfig } from './configManager.js';
import { getAlertHistory } from './alertHandler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let onConfigChange = null;

export function startConfigServer({ onConfigUpdate }) {
  onConfigChange = onConfigUpdate;
  const config = getConfig();
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, '..', 'public')));

  app.get('/api/config', (req, res) => {
    res.json(getConfig());
  });

  app.post('/api/config', (req, res) => {
    const updated = updateConfig(req.body);
    if (onConfigChange) onConfigChange(updated);
    res.json(updated);
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
