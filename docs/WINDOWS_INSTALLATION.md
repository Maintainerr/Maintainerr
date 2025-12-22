# Maintainerr Windows Installation Guide

This guide covers the installation, upgrade, and management of Maintainerr using the Windows Installer.

## Table of Contents

- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Service Management](#service-management)
- [Upgrading](#upgrading)
- [Uninstallation](#uninstallation)
- [Troubleshooting](#troubleshooting)

## System Requirements

### Required Software

- **Windows 10 or Windows Server 2016** or later
- **Node.js 20.19.0 or later, OR 22.12.0 or later**
  - Download from: https://nodejs.org/
  - The installer will validate your Node.js version

### Recommended Hardware

- **CPU**: 2 cores or more
- **RAM**: 4 GB or more
- **Disk Space**: 
  - Installation: ~500 MB
  - Data: Varies based on usage (recommend at least 1 GB)

## Installation

### Step 1: Download the Installer

Download the latest `Maintainerr.msi` installer from the [GitHub Releases page](https://github.com/Maintainerr/Maintainerr/releases).

### Step 2: Install Node.js (if needed)

Before running the installer, ensure Node.js is installed:

1. Open Command Prompt or PowerShell
2. Run: `node --version`
3. If Node.js is not installed or the version is too old:
   - Download from: https://nodejs.org/
   - Install Node.js
   - Restart your terminal
   - Verify: `node --version`

### Step 3: Run the Installer

1. Double-click `Maintainerr.msi`
2. Click **Next** on the welcome screen
3. Accept the license agreement
4. **Select Data Directory**:
   - Choose a directory to store Maintainerr data
   - **Important**: This must be outside the installation directory
   - Example: `C:\ProgramData\MaintainerrData`
   - This directory will contain:
     - Database (SQLite)
     - Logs
     - Configuration (.env file)
5. **Select Installation Directory**:
   - Default: `C:\Program Files\Maintainerr`
   - Or choose a custom location
6. Click **Install**

The installer will:
- Extract application files
- Install dependencies via `yarn install`
- Create `.env` configuration file in data directory
- Install and start Maintainerr as a Windows Service

### Step 4: Verify Installation

1. Open Services (`services.msc`)
2. Find "Maintainerr Service" - it should be running
3. Open a web browser and navigate to: `http://localhost:6246`
4. You should see the Maintainerr UI

## Configuration

### Environment Variables

After installation, configure Maintainerr by editing the `.env` file in your data directory.

**Location**: `<DATA_DIR>\.env`

Example configuration options in the `.env` file are documented in the installer's README.

## Service Management

The Maintainerr Windows Service can be managed using standard Windows tools. See the full installation guide for detailed instructions.

## Upgrading

Run the new installer - it will automatically detect and upgrade your existing installation while preserving your data and configuration.

## Uninstallation

Use "Programs and Features" in Control Panel to uninstall. Your data directory will be preserved.

## Troubleshooting

For detailed troubleshooting steps, see the full documentation in `installer/windows/README.md`.

## Support

- **Documentation**: https://docs.maintainerr.info
- **GitHub Issues**: https://github.com/Maintainerr/Maintainerr/issues
