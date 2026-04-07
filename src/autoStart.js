import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { isMac, isWindows, isLinux, getLaunchAgentDir } from './platform.js';
import { log } from './logger.js';

const PLIST_NAME = 'com.redalert.monitor.plist';

// Resolve the real app directory (not the pkg snapshot)
const appDir = process.pkg ? dirname(process.execPath) : join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Enables or disables auto-start on login.
 * - macOS: writes/removes a LaunchAgent plist
 * - Windows: handled via MSI installer (Startup folder shortcut)
 */
export function setAutoStart(enabled) {
  if (isMac) {
    setAutoStartMac(enabled);
  } else if (isWindows) {
    setAutoStartWindows(enabled);
  } else if (isLinux) {
    setAutoStartLinux(enabled);
  }
}

function setAutoStartMac(enabled) {
  const launchAgentDir = getLaunchAgentDir();
  const plistPath = join(launchAgentDir, PLIST_NAME);

  if (enabled) {
    mkdirSync(launchAgentDir, { recursive: true });

    const execPath = process.pkg ? process.execPath : join(appDir, 'src', 'main.js');
    const args = process.pkg
      ? `<string>${execPath}</string>`
      : `<string>${process.execPath}</string>\n      <string>${execPath}</string>`;

    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.redalert.monitor</string>
  <key>ProgramArguments</key>
  <array>
    ${args}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/tmp/redalert.stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/redalert.stderr.log</string>
</dict>
</plist>`;

    writeFileSync(plistPath, plist);
    log.info('LaunchAgent installed:', plistPath);
  } else {
    if (existsSync(plistPath)) {
      unlinkSync(plistPath);
      log.info('LaunchAgent removed:', plistPath);
    }
  }
}

function setAutoStartWindows(enabled) {
  log.info(`Windows auto-start ${enabled ? 'enabled' : 'disabled'} (managed by installer)`);
}

/**
 * Installs a desktop launcher entry on Linux so RedAlert appears in the
 * applications menu / launcher. Idempotent — safe to call on every startup.
 */
export function installLinuxLauncher() {
  if (!isLinux) return;

  const appsDir = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'applications');
  const desktopPath = join(appsDir, 'redalert.desktop');

  const execPath = process.pkg
    ? process.execPath
    : `${process.execPath} ${join(appDir, 'src', 'main.js')}`;
  const iconPath = join(appDir, 'assets', 'icon.png');

  const desktopEntry = `[Desktop Entry]
Type=Application
Name=RedAlert
Comment=Pikud HaOref alert monitor
Exec=${execPath}
Icon=${iconPath}
Terminal=false
Categories=Utility;Network;
StartupNotify=false
`;

  try {
    mkdirSync(appsDir, { recursive: true });
    // Only rewrite if missing or contents changed, to avoid unnecessary disk churn
    let needsWrite = true;
    if (existsSync(desktopPath)) {
      try {
        const current = readFileSync(desktopPath, 'utf8');
        if (current === desktopEntry) needsWrite = false;
      } catch {}
    }
    if (needsWrite) {
      writeFileSync(desktopPath, desktopEntry);
      log.info('Launcher entry installed:', desktopPath);
    }
  } catch (e) {
    log.warn('Failed to install Linux launcher entry:', e.message);
  }
}

function setAutoStartLinux(enabled) {
  const autostartDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'autostart');
  const desktopPath = join(autostartDir, 'redalert.desktop');

  if (enabled) {
    mkdirSync(autostartDir, { recursive: true });

    const execPath = process.pkg ? process.execPath : `${process.execPath} ${join(appDir, 'src', 'main.js')}`;

    const desktopEntry = `[Desktop Entry]
Type=Application
Name=RedAlert
Comment=Pikud HaOref alert monitor
Exec=${execPath}
Terminal=false
X-GNOME-Autostart-enabled=true
`;

    writeFileSync(desktopPath, desktopEntry);
    log.info('Autostart desktop entry installed:', desktopPath);
  } else {
    if (existsSync(desktopPath)) {
      unlinkSync(desktopPath);
      log.info('Autostart desktop entry removed:', desktopPath);
    }
  }
}
