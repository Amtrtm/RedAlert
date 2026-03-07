import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Log to %LOCALAPPDATA%\RedAlert\redalert.log — works regardless of pkg snapshot paths
const LOG_DIR = join(process.env.LOCALAPPDATA || '.', 'RedAlert');
const LOG_FILE = join(LOG_DIR, 'redalert.log');

try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

function timestamp() {
  return new Date().toISOString();
}

function write(level, ...args) {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  const line = `[${timestamp()}] [${level}] ${msg}\n`;
  try { appendFileSync(LOG_FILE, line); } catch {}
  // Also write to original console
  if (level === 'ERROR') process.stderr.write(line);
  else process.stdout.write(line);
}

export const log = {
  info: (...args) => write('INFO', ...args),
  error: (...args) => write('ERROR', ...args),
  warn: (...args) => write('WARN', ...args),
  file: LOG_FILE,
};
