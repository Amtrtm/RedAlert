/**
 * MSI Build script: uses the pre-built dist/ from build.js and creates
 * an MSI installer using WiX binaries (from wix-msi package).
 *
 * Prerequisites: run `node scripts/build.js` first
 * Usage: node scripts/build-msi.js
 * Output: dist/RedAlert-<version>.msi
 */
import { execFileSync } from 'child_process';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');
const WIX_BIN = join(ROOT, 'node_modules', 'wix-msi', 'wix_bin');
const INSTALLER_DIR = join(ROOT, 'installer');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const MSI_OUTPUT = join(DIST, `RedAlert-${version}.msi`);

// Verify prerequisites
if (!existsSync(join(DIST, 'RedAlert.exe'))) {
  console.error('Error: dist/RedAlert.exe not found. Run `node scripts/build.js` first.');
  process.exit(1);
}

if (!existsSync(join(WIX_BIN, 'candle.exe'))) {
  console.error('Error: WiX binaries not found. Run `npm install` first.');
  process.exit(1);
}

const HEAT = join(WIX_BIN, 'heat.exe');
const CANDLE = join(WIX_BIN, 'candle.exe');
const LIGHT = join(WIX_BIN, 'light.exe');

console.log('=== RedAlert MSI Build ===\n');

if (!existsSync(INSTALLER_DIR)) mkdirSync(INSTALLER_DIR, { recursive: true });

// Step 1: Harvest directories with heat.exe
// Use -dr to target the correct subdirectory IDs defined in the WiX XML.
// Do NOT use -srd — we need the directory structure preserved.
console.log('1. Harvesting directories...');

// Harvest public/ → installs to INSTALLFOLDER\public\
execFileSync(HEAT, [
  'dir', join(DIST, 'public'),
  '-cg', 'PublicFiles',
  '-dr', 'PublicFolder',
  '-srd', '-ag', '-sfrag',
  '-var', 'var.PublicDir',
  '-out', join(INSTALLER_DIR, 'public.wxs'),
], { stdio: 'inherit' });

// Harvest assets/ → installs to INSTALLFOLDER\assets\
execFileSync(HEAT, [
  'dir', join(DIST, 'assets'),
  '-cg', 'AssetFiles',
  '-dr', 'AssetsFolder',
  '-srd', '-ag', '-sfrag',
  '-var', 'var.AssetsDir',
  '-out', join(INSTALLER_DIR, 'assets.wxs'),
], { stdio: 'inherit' });

// Harvest data/ → installs to INSTALLFOLDER\data\
execFileSync(HEAT, [
  'dir', join(DIST, 'data'),
  '-cg', 'DataFiles',
  '-dr', 'DataFolder',
  '-srd', '-ag', '-sfrag',
  '-var', 'var.DataDir',
  '-out', join(INSTALLER_DIR, 'data.wxs'),
], { stdio: 'inherit' });

// Harvest node_modules/systray2/ → installs to INSTALLFOLDER\node_modules\systray2\
execFileSync(HEAT, [
  'dir', join(DIST, 'node_modules', 'systray2'),
  '-cg', 'Systray2Files',
  '-dr', 'Systray2Folder',
  '-srd', '-ag', '-sfrag',
  '-var', 'var.Systray2Dir',
  '-out', join(INSTALLER_DIR, 'systray2.wxs'),
], { stdio: 'inherit' });

console.log('   Directories harvested');

// Step 2: Write main WiX source
console.log('2. Writing main installer definition...');
const wxs = `<?xml version="1.0" encoding="UTF-8"?>
<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">
  <Product
    Id="*"
    Name="RedAlert"
    Language="1033"
    Version="1.2.0"
    Manufacturer="RedAlert Project"
    UpgradeCode="a1b2c3d4-e5f6-7890-abcd-ef1234567890">

    <Package
      InstallerVersion="200"
      Compressed="yes"
      InstallScope="perUser"
      Description="Pikud HaOref Siren Monitor with N12 Live Feed" />

    <MajorUpgrade DowngradeErrorMessage="A newer version of RedAlert is already installed." />
    <MediaTemplate EmbedCab="yes" />

    <Icon Id="RedAlertIcon" SourceFile="$(var.DistDir)\\assets\\icon.ico" />
    <Property Id="ARPPRODUCTICON" Value="RedAlertIcon" />

    <Directory Id="TARGETDIR" Name="SourceDir">
      <Directory Id="LocalAppDataFolder">
        <Directory Id="INSTALLFOLDER" Name="RedAlert">
          <Directory Id="PublicFolder" Name="public" />
          <Directory Id="AssetsFolder" Name="assets" />
          <Directory Id="DataFolder" Name="data" />
          <Directory Id="NodeModulesFolder" Name="node_modules">
            <Directory Id="Systray2Folder" Name="systray2" />
          </Directory>
        </Directory>
      </Directory>
      <Directory Id="ProgramMenuFolder">
        <Directory Id="AppMenuFolder" Name="RedAlert" />
      </Directory>
      <Directory Id="StartupFolder" />
    </Directory>

    <DirectoryRef Id="INSTALLFOLDER">
      <Component Id="MainExe" Guid="b2c3d4e5-f6a7-8901-bcde-f12345678901">
        <File Id="RedAlertExe" Source="$(var.DistDir)\\RedAlert.exe" KeyPath="yes" />
      </Component>
      <Component Id="ConfigFile" Guid="c3d4e5f6-a7b8-9012-cdef-123456789012">
        <File Id="ConfigJson" Source="$(var.DistDir)\\config.json" KeyPath="yes" />
      </Component>
      <Component Id="VbsLauncher" Guid="f6a7b8c9-d0e1-2345-abcd-456789012345">
        <File Id="RedAlertVbs" Source="$(var.DistDir)\\RedAlert.vbs" KeyPath="yes" />
      </Component>
    </DirectoryRef>

    <DirectoryRef Id="AppMenuFolder">
      <Component Id="StartMenuShortcut" Guid="d4e5f6a7-b8c9-0123-defa-234567890123">
        <Shortcut Id="AppShortcut"
          Name="RedAlert"
          Description="Pikud HaOref Siren Monitor"
          Target="[SystemFolder]wscript.exe"
          Arguments="&quot;[INSTALLFOLDER]RedAlert.vbs&quot;"
          WorkingDirectory="INSTALLFOLDER"
          Icon="RedAlertIcon" />
        <RemoveFolder Id="CleanAppMenu" On="uninstall" />
        <RegistryValue Root="HKCU" Key="Software\\RedAlert" Name="installed" Type="integer" Value="1" KeyPath="yes" />
      </Component>
    </DirectoryRef>

    <DirectoryRef Id="StartupFolder">
      <Component Id="StartupShortcut" Guid="e5f6a7b8-c9d0-1234-efab-345678901234">
        <Shortcut Id="StartupLink"
          Name="RedAlert"
          Target="[SystemFolder]wscript.exe"
          Arguments="&quot;[INSTALLFOLDER]RedAlert.vbs&quot;"
          WorkingDirectory="INSTALLFOLDER"
          Icon="RedAlertIcon" />
        <RegistryValue Root="HKCU" Key="Software\\RedAlert" Name="autostart" Type="integer" Value="1" KeyPath="yes" />
      </Component>
    </DirectoryRef>

    <Feature Id="MainFeature" Title="RedAlert" Level="1">
      <ComponentRef Id="MainExe" />
      <ComponentRef Id="ConfigFile" />
      <ComponentRef Id="VbsLauncher" />
      <ComponentRef Id="StartMenuShortcut" />
      <ComponentGroupRef Id="PublicFiles" />
      <ComponentGroupRef Id="AssetFiles" />
      <ComponentGroupRef Id="DataFiles" />
      <ComponentGroupRef Id="Systray2Files" />
    </Feature>

    <Feature Id="AutoStart" Title="Start with Windows" Level="1">
      <ComponentRef Id="StartupShortcut" />
    </Feature>

    <!-- Launch app after install (via VBS to hide console window) -->
    <SetProperty Id="WscriptPath" Value="[SystemFolder]wscript.exe" After="CostFinalize" Sequence="execute" />
    <CustomAction Id="LaunchApp" Property="WscriptPath" ExeCommand="&quot;[INSTALLFOLDER]RedAlert.vbs&quot;" Return="asyncNoWait" />
    <InstallExecuteSequence>
      <Custom Action="LaunchApp" After="InstallFinalize">NOT Installed OR REINSTALL</Custom>
    </InstallExecuteSequence>

  </Product>
</Wix>`;

writeFileSync(join(INSTALLER_DIR, 'RedAlert.wxs'), wxs);

// Step 3: Compile with candle
console.log('3. Compiling WiX sources...');
const wxsFiles = ['RedAlert.wxs', 'public.wxs', 'assets.wxs', 'data.wxs', 'systray2.wxs'];
const wixobjFiles = wxsFiles.map(f => f.replace('.wxs', '.wixobj'));

execFileSync(CANDLE, [
  ...wxsFiles.map(f => join(INSTALLER_DIR, f)),
  '-dDistDir=' + DIST,
  '-dPublicDir=' + join(DIST, 'public'),
  '-dAssetsDir=' + join(DIST, 'assets'),
  '-dDataDir=' + join(DIST, 'data'),
  '-dSystray2Dir=' + join(DIST, 'node_modules', 'systray2'),
  '-o', join(INSTALLER_DIR, '\\'),
], { stdio: 'inherit' });
console.log('   Compiled to .wixobj');

// Step 4: Link with light
console.log('4. Linking MSI...');
execFileSync(LIGHT, [
  ...wixobjFiles.map(f => join(INSTALLER_DIR, f)),
  '-o', MSI_OUTPUT,
  '-sice:ICE91',
  '-sice:ICE61',
  '-sice:ICE38',
  '-sice:ICE64',
], { stdio: 'inherit' });

console.log('\n=== MSI Build complete! ===');
console.log('Output:', MSI_OUTPUT);
console.log('\nUsers can double-click to install. Includes:');
console.log('  - Start Menu shortcut');
console.log('  - Auto-start with Windows');
console.log('  - Installs to AppData (no admin required)');
console.log('\nInstall directory structure:');
console.log('  %LOCALAPPDATA%\\RedAlert\\');
console.log('    RedAlert.exe');
console.log('    config.json');
console.log('    public\\       (web UI)');
console.log('    assets\\       (icons, sounds)');
console.log('    node_modules\\systray2\\  (tray binary)');
