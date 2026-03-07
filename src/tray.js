import SysTrayModule from 'systray2';
const SysTray = SysTrayModule.default || SysTrayModule;
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import { getConfig } from './configManager.js';
import { log } from './logger.js';

// Resolve the real app directory (not the pkg snapshot)
// In pkg, process.execPath is the real exe location on disk
const appDir = process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..');

let systray = null;
let menuItems = [];

const iconPath = join(appDir, 'assets', 'icon.ico');
const alertIconPath = join(appDir, 'assets', 'icon-alert.ico');
log.info('Icon path:', iconPath, 'exists:', existsSync(iconPath));
log.info('Alert icon path:', alertIconPath, 'exists:', existsSync(alertIconPath));

const normalIcon = readFileSync(iconPath).toString('base64');
const alertIcon = readFileSync(alertIconPath).toString('base64');

export function createTray({ onStart, onStop }) {
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

  // Restore CWD after tray init starts (async, but binary path is resolved immediately)
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
