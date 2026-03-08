/**
 * Build script: creates a macOS .app bundle and optionally a .dmg installer.
 *
 * Usage: node scripts/build-dmg.js
 * Prerequisites: Run `node scripts/build.js --mac` first
 *
 * Output: dist/RedAlert.app/ + dist/RedAlert.dmg
 */
import { execFileSync } from 'child_process';
import { mkdirSync, cpSync, existsSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

// Support both single-platform and multi-platform dist layouts
const macDist = existsSync(join(DIST, 'mac')) ? join(DIST, 'mac') : DIST;
const binaryPath = join(macDist, 'RedAlert');

console.log('=== RedAlert macOS App Bundle ===\n');

// Step 1: Verify prerequisites
if (!existsSync(binaryPath)) {
  console.error('Error: dist/RedAlert binary not found.');
  console.error('Run `node scripts/build.js --mac` first.');
  process.exit(1);
}

// Step 2: Create .app bundle structure
const APP = join(DIST, 'RedAlert.app');
const CONTENTS = join(APP, 'Contents');
const MACOS = join(CONTENTS, 'MacOS');
const RESOURCES = join(CONTENTS, 'Resources');

console.log('1. Creating .app bundle structure...');
if (existsSync(APP)) rmSync(APP, { recursive: true, force: true });

mkdirSync(MACOS, { recursive: true });
mkdirSync(RESOURCES, { recursive: true });

// Step 3: Write Info.plist
console.log('2. Writing Info.plist...');
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>RedAlert</string>
  <key>CFBundleDisplayName</key>
  <string>RedAlert</string>
  <key>CFBundleIdentifier</key>
  <string>com.redalert.monitor</string>
  <key>CFBundleVersion</key>
  <string>1.1.0</string>
  <key>CFBundleShortVersionString</key>
  <string>1.1.0</string>
  <key>CFBundleExecutable</key>
  <string>RedAlert</string>
  <key>CFBundleIconFile</key>
  <string>icon</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSUserNotificationAlertStyle</key>
  <string>alert</string>
</dict>
</plist>`;

writeFileSync(join(CONTENTS, 'Info.plist'), plist);

// Step 4: Copy binary
console.log('3. Copying binary...');
cpSync(binaryPath, join(MACOS, 'RedAlert'));
chmodSync(join(MACOS, 'RedAlert'), 0o755);

// Step 5: Copy resources
console.log('4. Copying resources...');
cpSync(join(macDist, 'public'), join(RESOURCES, 'public'), { recursive: true });
cpSync(join(macDist, 'assets'), join(RESOURCES, 'assets'), { recursive: true });
cpSync(join(macDist, 'data'), join(RESOURCES, 'data'), { recursive: true });
cpSync(join(macDist, 'config.json'), join(RESOURCES, 'config.json'));

if (existsSync(join(macDist, 'node_modules'))) {
  cpSync(join(macDist, 'node_modules'), join(RESOURCES, 'node_modules'), { recursive: true });
}

// Copy icon.png as icon.icns placeholder (proper .icns requires iconutil)
if (existsSync(join(macDist, 'assets', 'icon.png'))) {
  cpSync(join(macDist, 'assets', 'icon.png'), join(RESOURCES, 'icon.icns'));
}

console.log('   Created: dist/RedAlert.app');

// Step 6: Create DMG (if hdiutil available — macOS only)
try {
  execFileSync('which', ['hdiutil'], { stdio: 'ignore' });

  console.log('\n5. Creating DMG...');
  const dmgPath = join(DIST, 'RedAlert.dmg');
  if (existsSync(dmgPath)) rmSync(dmgPath);

  // Create a temporary directory for DMG contents
  const dmgTemp = join(DIST, 'dmg-temp');
  if (existsSync(dmgTemp)) rmSync(dmgTemp, { recursive: true, force: true });
  mkdirSync(dmgTemp, { recursive: true });

  // Copy .app to temp dir
  cpSync(APP, join(dmgTemp, 'RedAlert.app'), { recursive: true });

  // Create symlink to /Applications
  execFileSync('ln', ['-s', '/Applications', join(dmgTemp, 'Applications')]);

  // Create DMG
  execFileSync('hdiutil', [
    'create',
    '-volname', 'RedAlert',
    '-srcfolder', dmgTemp,
    '-ov',
    '-format', 'UDZO',
    dmgPath
  ], { stdio: 'inherit' });

  // Clean up temp
  rmSync(dmgTemp, { recursive: true, force: true });

  console.log(`\n   Created: dist/RedAlert.dmg`);
} catch {
  console.log('\n5. Skipping DMG creation (hdiutil not available — requires macOS)');
  console.log('   The .app bundle is ready at: dist/RedAlert.app');
}

console.log('\n=== macOS build complete! ===');
