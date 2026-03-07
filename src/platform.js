import { join } from 'path';
import { existsSync } from 'fs';
import { homedir } from 'os';

export const isMac = process.platform === 'darwin';
export const isWindows = process.platform === 'win32';
export const isLinux = process.platform === 'linux';

/**
 * Returns the platform-appropriate application data directory for RedAlert.
 * - Windows: %LOCALAPPDATA%\RedAlert
 * - macOS:   ~/Library/Application Support/RedAlert
 * - Linux:   ~/.local/share/RedAlert
 */
export function getAppDataDir() {
  if (isWindows) {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'RedAlert');
  }
  if (isMac) {
    return join(homedir(), 'Library', 'Application Support', 'RedAlert');
  }
  // Linux / fallback
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'RedAlert');
}

/**
 * Returns the platform-appropriate log directory for RedAlert.
 * - Windows: %LOCALAPPDATA%\RedAlert
 * - macOS:   ~/Library/Logs/RedAlert
 * - Linux:   ~/.local/share/RedAlert/logs
 */
export function getLogDir() {
  if (isWindows) {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'RedAlert');
  }
  if (isMac) {
    return join(homedir(), 'Library', 'Logs', 'RedAlert');
  }
  return join(getAppDataDir(), 'logs');
}

/**
 * Returns the path to Chrome/Chromium if found, or null.
 */
export function getChromePath() {
  if (isWindows) {
    const paths = [
      join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    return paths.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
  }

  if (isMac) {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    ];
    return paths.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
  }

  // Linux
  const paths = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/chromium'];
  return paths.find(p => { try { return existsSync(p); } catch { return false; } }) || null;
}

/**
 * Returns the platform-specific tray binary name for systray2.
 */
export function getTrayBinaryName() {
  if (isWindows) return 'tray_windows_release.exe';
  if (isMac) return 'tray_darwin_release';
  return 'tray_linux_release';
}

/**
 * Returns the icon file extension appropriate for the platform.
 * macOS tray icons use PNG; Windows uses ICO.
 */
export function getTrayIconExtension() {
  return isWindows ? 'ico' : 'png';
}

/**
 * Returns the macOS LaunchAgents directory path.
 */
export function getLaunchAgentDir() {
  return join(homedir(), 'Library', 'LaunchAgents');
}
