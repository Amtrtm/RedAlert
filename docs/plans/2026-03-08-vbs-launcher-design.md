# VBS Launcher for Windowless Execution

**Goal:** Hide the console window on Windows by launching RedAlert.exe via a VBS wrapper.

**Architecture:** A VBScript sits alongside the .exe and launches it with `vbHide` (window style 0). MSI shortcuts target `wscript.exe` with the VBS as argument.

## Changes

| File | Change |
|------|--------|
| `launcher/RedAlert.vbs` | New — 2-line VBS wrapper |
| `scripts/build.js` | Copy VBS to dist for Windows builds |
| `installer/RedAlert.wxs` | Add VBS component, point all shortcuts to wscript.exe + VBS |

## How It Works

- `wscript.exe` runs the VBS silently (no console)
- VBS uses `WshShell.Run` with window style `0` (hidden) to launch RedAlert.exe
- The exe runs completely in the background — only the system tray icon is visible
- Start Menu shortcut, Startup shortcut, and post-install launch all use this path
