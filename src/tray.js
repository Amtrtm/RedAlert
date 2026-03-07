import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import open from 'open';
import { getConfig } from './configManager.js';
import { log } from './logger.js';

const require = createRequire(import.meta.url);

// Resolve the real app directory (not the pkg snapshot)
const appDir = process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..');

let systray = null;
let menuItems = [];

// Lazy-load icons — do NOT read files at module top-level (crashes before error handler)
let normalIcon = null;
let alertIcon = null;

function loadIcons() {
  const iconPath = join(appDir, 'assets', 'icon.ico');
  const alertIconPath = join(appDir, 'assets', 'icon-alert.ico');
  log.info('Icon path:', iconPath, 'exists:', existsSync(iconPath));
  log.info('Alert icon path:', alertIconPath, 'exists:', existsSync(alertIconPath));

  try {
    normalIcon = readFileSync(iconPath).toString('base64');
  } catch (e) {
    log.error('Failed to read icon.ico:', e.message);
    normalIcon = '';
  }
  try {
    alertIcon = readFileSync(alertIconPath).toString('base64');
  } catch (e) {
    log.error('Failed to read icon-alert.ico:', e.message);
    alertIcon = normalIcon;
  }
}

let SysTray = null;

export function createTray({ onStart, onStop }) {
  // Load icons at call time (inside try/catch from main.js), not at import time
  loadIcons();

  // Load systray2 module (synchronous require — systray2 is CommonJS)
  let SysTrayModule;
  try {
    SysTrayModule = require('systray2');
  } catch (e) {
    log.error('Failed to require systray2:', e.message);
    throw e;
  }
  SysTray = SysTrayModule.default || SysTrayModule;
  log.info('systray2 loaded successfully');

  // systray2 looks for traybin/ relative to CWD first, then __dirname.
  // In pkg, __dirname is a snapshot path that doesn't exist on disk.
  // Switch CWD to the real systray2 module directory so it finds the binary.
  const systray2Dir = join(appDir, 'node_modules', 'systray2');
  const trayBin = join(systray2Dir, 'traybin', 'tray_windows_release.exe');
  log.info('systray2 dir:', systray2Dir, 'binary exists:', existsSync(trayBin));

  const origCwd = process.cwd();
  try { process.chdir(systray2Dir); } catch (e) {
    log.warn('Could not chdir to systray2 dir:', e.message);
  }

  systray = new SysTray({
    menu: {
      icon: normalIcon,
      title: 'RedAlert',
      tooltip: 'RedAlert - Pikud HaOref Monitor',
      items: menuItems = [
        { title: 'RedAlert - Active', tooltip: 'Status', enabled: false },
        SysTray.separator,
        { title: 'Open Config Panel', tooltip: 'Open settings in browser', enabled: true },
        { title: 'Pause Monitoring', tooltip: 'Pause/Resume polling', enabled: true },
        SysTray.separator,
        { title: 'Quit', tooltip: 'Exit RedAlert', enabled: true }
      ]
    },
    debug: false,
    copyDir: false
  });

  // Restore CWD after tray init starts
  setTimeout(() => {
    try { process.chdir(origCwd); } catch {}
  }, 1000);

  systray.onClick(action => {
    switch (action.seq_id) {
      case 2: {
        const config = getConfig();
        open(`http://localhost:${config.configPort}`);
        break;
      }
      case 3:
        if (action.item.title === 'Pause Monitoring') {
          onStop();
          systray.sendAction({
            type: 'update-item',
            item: { ...action.item, title: 'Resume Monitoring' },
            seq_id: action.seq_id
          });
          setStatusText('RedAlert - Paused');
        } else {
          onStart();
          systray.sendAction({
            type: 'update-item',
            item: { ...action.item, title: 'Pause Monitoring' },
            seq_id: action.seq_id
          });
          setStatusText('RedAlert - Active');
        }
        break;
      case 5:
        if (systray) systray.kill(false);
        process.exit(0);
        break;
    }
  });

  return systray;
}

export function setAlertMode(isAlert) {
  if (!systray) return;
  systray.sendAction({
    type: 'update-menu',
    menu: {
      icon: isAlert ? alertIcon : normalIcon,
      title: 'RedAlert',
      tooltip: isAlert ? 'ALERT ACTIVE!' : 'RedAlert - Monitoring',
      items: menuItems
    }
  });

  // Alert mode is cleared by the safety timer callback in alertHandler.js
  // Do NOT auto-reset here — the 10-minute safety timer handles it
}

function setStatusText(text) {
  if (!systray) return;
  systray.sendAction({
    type: 'update-item',
    item: { title: text, tooltip: text, enabled: false },
    seq_id: 0
  });
}

export function killTray() {
  if (systray) systray.kill(false);
}
