/**
 * Build script: bundles the app with esbuild, then compiles to .exe with pkg.
 *
 * Usage: node scripts/build.js
 * Output: dist/RedAlert.exe + dist/public/ + dist/assets/ + dist/config.json
 */
import { execFileSync } from 'child_process';
import { mkdirSync, cpSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const BUNDLE = join(DIST, 'bundle.cjs');

console.log('=== RedAlert Build ===\n');

// Step 1: Clean & prepare dist
console.log('1. Preparing dist directory...');
if (existsSync(DIST)) {
  rmSync(DIST, { recursive: true, force: true });
}
mkdirSync(DIST, { recursive: true });

// Step 2: Bundle ESM -> single CJS file with esbuild
// Use banner to inject __dirname since import.meta is not available in CJS
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
    js: 'const __bundle_dirname = __dirname;'
  },
  define: {
    'import.meta.url': '__bundled_import_meta_url',
  },
  inject: [join(ROOT, 'scripts', 'esm-shim.js')],
});
console.log('   Bundle created: dist/bundle.cjs');

// Step 3: Copy static assets
console.log('3. Copying static assets...');
cpSync(join(ROOT, 'public'), join(DIST, 'public'), { recursive: true });
cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true });
cpSync(join(ROOT, 'config.json'), join(DIST, 'config.json'));

// Copy systray2 native module (needed at runtime)
const systrayPath = join(ROOT, 'node_modules', 'systray2');
if (existsSync(systrayPath)) {
  cpSync(systrayPath, join(DIST, 'node_modules', 'systray2'), { recursive: true });
}

// Step 4: Compile with pkg
// All arguments are hardcoded paths — no user input, safe to use
console.log('4. Compiling with pkg...');
const pkgBin = join(ROOT, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
execFileSync(process.execPath, [
  pkgBin,
  BUNDLE,
  '--targets', 'node22-win-x64',
  '--output', join(DIST, 'RedAlert.exe'),
  '--compress', 'GZip',
], { cwd: DIST, stdio: 'inherit' });

console.log('\n=== Build complete! ===');
console.log('Output: dist/RedAlert.exe');
console.log('Assets: dist/public/, dist/assets/, dist/config.json');
console.log('\nTo create MSI installer, run: node scripts/build-msi.js');
