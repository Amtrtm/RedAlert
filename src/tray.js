import SysTrayModule from 'systray2';
const SysTray = SysTrayModule.default || SysTrayModule;
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import { getConfig } from './configManager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let systray = null;
let menuItems = [];

const normalIcon = readFileSync(join(__dirname, '..', 'assets', 'icon.ico')).toString('base64');
const alertIcon = readFileSync(join(__dirname, '..', 'assets', 'icon-alert.ico')).toString('base64');

export function createTray({ onStart, onStop }) {
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
