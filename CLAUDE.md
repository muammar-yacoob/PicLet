# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PicLet is a Windows context menu tool that adds image manipulation options to the right-click menu. It uses WSL (Windows Subsystem for Linux) with ImageMagick for image processing.

**Features:**
- **Make Icon**: Converts PNG to ICO with multiple resolutions (256, 128, 64, 48, 32, 16)
- **Remove Background**: Removes solid backgrounds from images with fuzz tolerance
- **Scale Image**: Resizes images with optional square padding
- **Generate Icon Pack**: Creates complete icon sets for Web, Android, and iOS platforms

## Architecture

```
PicLet/
├── install_piclet.bat      # Installer (requires admin)
├── uninstall_piclet.bat    # Uninstaller (requires admin)
├── src/
│   ├── common.sh           # Shared utilities (colors, progress, squarify)
│   ├── makeicon.sh         # PNG to ICO converter
│   ├── remove-bg.sh        # Background removal with options
│   ├── rescale.sh          # Image scaling with square padding
│   ├── iconpack.sh         # Multi-platform icon generator wizard
│   ├── makeicon.bat        # Windows wrapper → WSL
│   ├── remove-bg.bat       # Windows wrapper → WSL
│   ├── rescale.bat         # Windows wrapper → WSL
│   ├── iconpack.bat        # Windows wrapper → WSL
│   ├── piclet.reg          # Registry entries for context menu
│   └── icons/              # Menu icons (.ico files)
└── libs/                   # Legacy (no longer used with WSL)
```

## How It Works

1. **Windows Context Menu** → Calls `.bat` wrapper
2. **Batch Wrapper** → Converts paths and calls `wsl bash script.sh`
3. **Shell Script** → Uses ImageMagick in WSL for processing

## Key Components

### common.sh
Shared utilities used by all scripts:
- `success`, `error`, `warn`, `info` - Status output with ✓/✗ emojis
- `wip`, `wip_done` - Work-in-progress indicators
- `squarify` - Adds transparent padding to make images square
- `scale_to_size` - Scales with aspect ratio preservation and padding
- `win_to_wsl` - Path conversion helper

### Non-Square Image Handling
All scripts handle non-square images by:
1. Finding the larger dimension
2. Creating a transparent canvas of that size
3. Centering the original image

### Icon Pack Generator (iconpack.sh)
Generates platform-specific icons:
- **Web**: favicon.ico, apple-touch-icon, android-chrome, mstile
- **Android**: mipmap-mdpi through xxxhdpi, Play Store icon
- **iOS**: All AppIcon sizes including @2x/@3x variants

## Requirements

- Windows 10/11 with WSL installed
- ImageMagick in WSL: `sudo apt install imagemagick`

## Registry Integration

Context menu entries under `HKEY_CLASSES_ROOT\SystemFileAssociations\`:
- `.png` - All four tools
- `.jpg`, `.jpeg` - Scale Image, Icon Pack
- `.gif`, `.bmp` - Scale Image only

## Release Process

Automated via GitHub Actions using semantic-release:
- Push to `main` triggers release workflow
- Uses conventional commits (`feat:`, `fix:`, etc.)
- Skip CI with `skip-ci` in commit message
