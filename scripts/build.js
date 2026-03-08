/**
 * Build script: bundles the app with esbuild, then compiles to native binary with pkg.
 *
 * Usage:
 *   node scripts/build.js              # Build for current platform
 *   node scripts/build.js --win        # Build for Windows (x64)
 *   node scripts/build.js --mac        # Build for macOS (arm64)
 *   node scripts/build.js --mac-x64    # Build for macOS (Intel x64)
 *   node scripts/build.js --linux      # Build for Linux (x64)
 *   node scripts/build.js --all        # Build for all platforms
 *
 * Output: dist/<platform>/RedAlert[.exe] + dist/<platform>/public/ + assets/ + config.json
 */
import { execFileSync } from 'child_process';
import { mkdirSync, cpSync, existsSync, rmSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const BUNDLE = join(DIST, 'bundle.cjs');

// Parse platform flags
const args = process.argv.slice(2);
const currentPlatform = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';

const platforms = [];
if (args.includes('--all')) {
  platforms.push('win', 'mac', 'mac-x64', 'linux');
} else {
  if (args.includes('--win')) platforms.push('win');
  if (args.includes('--mac')) platforms.push('mac');
  if (args.includes('--mac-x64')) platforms.push('mac-x64');
  if (args.includes('--linux')) platforms.push('linux');
}
if (platforms.length === 0) {
  // Default: build for current platform
  if (currentPlatform === 'mac') platforms.push('mac');
  else if (currentPlatform === 'win') platforms.push('win');
  else platforms.push('linux');
}

const PKG_TARGETS = {
  'win': { target: 'node22-win-x64', output: 'RedAlert.exe', trayBin: 'tray_windows_release.exe' },
  'mac': { target: 'node22-macos-arm64', output: 'RedAlert', trayBin: 'tray_darwin_release' },
  'mac-x64': { target: 'node22-macos-x64', output: 'RedAlert', trayBin: 'tray_darwin_release' },
  'linux': { target: 'node22-linux-x64', output: 'RedAlert', trayBin: 'tray_linux_release' },
};

console.log(`=== RedAlert Build (${platforms.join(', ')}) ===\n`);

// Step 1: Clean & prepare dist
console.log('1. Preparing dist directory...');
if (existsSync(DIST)) {
  try {
    rmSync(DIST, { recursive: true, force: true });
  } catch (e) {
    console.log('   Could not fully clean dist/ (may be locked). Overwriting files in-place.');
  }
}
mkdirSync(DIST, { recursive: true });

// Step 2: Bundle ESM -> single CJS file with esbuild
console.log('2. Bundling with esbuild...');
await build({
  entryPoints: [join(ROOT, 'src', 'main.js')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: BUNDLE,
  external: ['systray2'],
  minify: false,
  sourcemap: false,
  banner: {
    js: [
      'const __bundle_dirname = __dirname;',
      'const __bundled_import_meta_url = require("url").pathToFileURL(__filename).href;',
    ].join('\n')
  },
  define: {
    'import.meta.url': '__bundled_import_meta_url',
  },
});
console.log('   Bundle created: dist/bundle.cjs');

// Step 3-4: Build each platform
for (const platform of platforms) {
  const { target, output, trayBin } = PKG_TARGETS[platform];
  const platformDir = platforms.length > 1 ? join(DIST, platform) : DIST;

  if (platforms.length > 1) {
    mkdirSync(platformDir, { recursive: true });
  }

  console.log(`\n--- Building for ${platform} (${target}) ---`);

  // Copy static assets
  console.log(`3. Copying static assets for ${platform}...`);
  cpSync(join(ROOT, 'public'), join(platformDir, 'public'), { recursive: true });
  cpSync(join(ROOT, 'assets'), join(platformDir, 'assets'), { recursive: true });
  cpSync(join(ROOT, 'data'), join(platformDir, 'data'), { recursive: true });
  cpSync(join(ROOT, 'config.json'), join(platformDir, 'config.json'));

  // Copy VBS launcher for Windows (hides console window)
  if (platform === 'win') {
    cpSync(join(ROOT, 'launcher', 'RedAlert.vbs'), join(platformDir, 'RedAlert.vbs'));
  }

  // Copy bundle to platform dir if multi-platform build
  if (platforms.length > 1) {
    cpSync(BUNDLE, join(platformDir, 'bundle.cjs'));
  }

  // Copy systray2 native module and its dependencies (needed at runtime)
  // systray2 is externalized from the bundle, so it and its entire dep tree
  // must exist on disk next to the exe: systray2 -> fs-extra, debug
  // fs-extra -> graceful-fs, jsonfile, universalify; debug -> ms
  const systray2Deps = ['systray2', 'fs-extra', 'graceful-fs', 'jsonfile', 'universalify', 'debug', 'ms'];
  for (const dep of systray2Deps) {
    const depPath = join(ROOT, 'node_modules', dep);
    if (existsSync(depPath)) {
      cpSync(depPath, join(platformDir, 'node_modules', dep), { recursive: true });
    }
  }
  // Ensure tray binary is executable on macOS/Linux
  if (platform !== 'win') {
    const trayBinPath = join(platformDir, 'node_modules', 'systray2', 'traybin', trayBin);
    if (existsSync(trayBinPath)) {
      chmodSync(trayBinPath, 0o755);
    }
  }

  // Compile with pkg
  console.log(`4. Compiling with pkg (${target})...`);
  const pkgBin = join(ROOT, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
  const bundlePath = platforms.length > 1 ? join(platformDir, 'bundle.cjs') : BUNDLE;
  execFileSync(process.execPath, [
    pkgBin,
    bundlePath,
    '--targets', target,
    '--output', join(platformDir, output),
    '--compress', 'GZip',
  ], { cwd: platformDir, stdio: 'inherit' });

  // Clean up bundle copy in platform dir
  if (platforms.length > 1 && existsSync(join(platformDir, 'bundle.cjs'))) {
    rmSync(join(platformDir, 'bundle.cjs'), { force: true });
  }

  console.log(`   Built: ${platforms.length > 1 ? platform + '/' : ''}${output}`);
}

// Clean up root bundle if multi-platform
if (platforms.length > 1 && existsSync(BUNDLE)) {
  rmSync(BUNDLE, { force: true });
}

console.log('\n=== Build complete! ===');
for (const platform of platforms) {
  const { output } = PKG_TARGETS[platform];
  const prefix = platforms.length > 1 ? `dist/${platform}` : 'dist';
  console.log(`Output: ${prefix}/${output}`);
}
if (platforms.includes('win')) {
  console.log('\nTo create MSI installer, run: node scripts/build-msi.js');
}
if (platforms.includes('mac') || platforms.includes('mac-x64')) {
  console.log('To create DMG installer, run: node scripts/build-dmg.js');
}
