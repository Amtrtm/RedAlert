import express from 'express';
import crypto from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import { getConfig, updateConfig } from './configManager.js';
import { getAlertHistory, getAlertStatus } from './alertHandler.js';
import { log } from './logger.js';

// Resolve the real app directory (not the pkg snapshot)
const appDir = process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..');

// CSRF token — generated once at startup, required on all mutating requests
const csrfToken = crypto.randomBytes(32).toString('hex');

let onConfigChange = null;

export function startConfigServer({ onConfigUpdate }) {
  onConfigChange = onConfigUpdate;
  const config = getConfig();
  const app = express();

  app.use(express.json());

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  // Rate limiting (skip for localhost/testing)
  const limiter = rateLimit({
    windowMs: 60000, // 1 minute
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' || req.connection.remoteAddress === '127.0.0.1'
  });
  app.use(limiter);

  // Input validation function
  function validateConfig(config) {
    const errors = [];

    if (!Array.isArray(config.areas)) {
      errors.push('areas must be an array');
    } else if (config.areas.length > 50) {
      errors.push('areas must have ≤50 items');
    } else if (config.areas.some(a => typeof a !== 'string' || a.length > 100)) {
      errors.push('each area must be a string ≤100 chars');
    }

    const pollInt = parseInt(config.pollInterval);
    if (isNaN(pollInt) || pollInt < 1000 || pollInt > 60000) {
      errors.push('pollInterval must be 1000–60000 ms');
    }

    const cooldown = parseInt(config.alertCooldown);
    if (isNaN(cooldown) || cooldown < 30000 || cooldown > 600000) {
      errors.push('alertCooldown must be 30s–10m');
    }

    // Validate browserUrl
    try {
      const url = new URL(config.browserUrl);
      if (!url.protocol.startsWith('https')) {
        errors.push('browserUrl must use https://');
      }
    } catch {
      errors.push('browserUrl must be a valid URL');
    }

    return errors;
  }

  // CSRF protection for all POST requests
  function csrfGuard(req, res, next) {
    const token = req.headers['x-csrf-token'];
    if (!token || token !== csrfToken) {
      return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }
    next();
  }

  // --- API routes (registered BEFORE static files) ---

  app.get('/api/csrf-token', (req, res) => {
    res.json({ token: csrfToken });
  });

  app.get('/api/config', (req, res) => {
    res.json(getConfig());
  });

  app.post('/api/config', csrfGuard, (req, res) => {
    const errors = validateConfig(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join('; ') });
    }

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

  app.post('/api/test-alert', csrfGuard, (req, res) => {
    if (onConfigChange) {
      onConfigChange(null, true);
    }
    res.json({ ok: true });
  });

  // --- Static files (after API routes) ---
  const publicDir = join(appDir, 'public');
  log.info('Serving static files from:', publicDir);
  app.use(express.static(publicDir));

  app.listen(config.configPort, '127.0.0.1', () => {
    log.info(`Config panel: http://localhost:${config.configPort}`);
  });
}
