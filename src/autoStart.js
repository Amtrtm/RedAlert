import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isMac, isWindows, getLaunchAgentDir } from './platform.js';
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
  // Windows auto-start is managed via the MSI installer's Startup folder shortcut.
  // For development/non-MSI installs, we could add a registry Run key here.
  log.info(`Windows auto-start ${enabled ? 'enabled' : 'disabled'} (managed by installer)`);
}
