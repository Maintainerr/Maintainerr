# Maintainerr Windows Installer

This directory contains the WiX Toolset-based Windows Installer for Maintainerr.

## Prerequisites

To build the installer, you need:

1. **WiX Toolset v5.0.2 or later**
   - Install via: `dotnet tool install --global wix`
   - Or download from: https://wixtoolset.org/

2. **.NET 8.0 SDK**
   - Download from: https://dotnet.microsoft.com/download/dotnet/8.0

3. **Node.js 20.19.0+ or 22.12.0+**
   - Required for building Maintainerr
   - Download from: https://nodejs.org/

4. **Yarn**
   - Installed via corepack: `corepack enable`

## Building the Installer

### Step 1: Build Maintainerr

First, build the Maintainerr application from the repository root:

```powershell
# From repository root
yarn install
yarn build
```

### Step 2: Build the Service Wrapper

Build the Windows Service wrapper:

```powershell
cd installer/windows/ServiceWrapper
dotnet publish -c Release -r win-x64 --self-contained
```

The output will be in `ServiceWrapper/bin/Release/net8.0/win-x64/publish/MaintainerrService.exe`

### Step 3: Build Custom Actions

Build the custom actions DLL:

```powershell
cd installer/windows/CustomActions
dotnet build -c Release
```

### Step 4: Create Resources

Copy necessary resources to the `Resources` directory:

```powershell
cd installer/windows
mkdir -p Resources

# Copy service wrapper
copy ServiceWrapper/bin/Release/net8.0/win-x64/publish/MaintainerrService.exe Resources/

# Create a placeholder icon (or provide your own)
# Resources/maintainerr.ico

# Create .env template
echo "# Maintainerr Environment Configuration" > Resources/.env.server
```

### Step 5: Build the Installer

Build the WiX installer:

```powershell
cd installer/windows
dotnet build Installer.wixproj -c Release
```

The installer will be output to: `installer/windows/bin/Release/Maintainerr.msi`

## Installer Features

### Installation Process

1. **Node.js Validation**
   - Checks if Node.js is installed
   - Validates version meets requirements (20.19.0+ or 22.12.0+)
   - Prompts user to install/update if needed

2. **Directory Selection**
   - Installation Directory: Where Maintainerr application files will be installed
   - Data Directory: Where Maintainerr stores its data (database, logs, config)
   - Validates that data directory is outside installation directory

3. **File Extraction**
   - Extracts all application files to installation directory
   - Preserves existing `node_modules` during upgrades

4. **Dependency Installation**
   - Runs `yarn install` to install/update dependencies
   - Configured to run `yarn install --immutable` in production mode

5. **Environment Configuration**
   - Creates `.env` file in data directory
   - Sets `APP_DIR` and `DATA_DIR` environment variables
   - Preserves existing `.env` files during upgrades

6. **Windows Service**
   - Installs Maintainerr as a Windows Service
   - Configured to start automatically
   - Configured with restart on failure

### Upgrade Process

When upgrading:

1. Service is stopped
2. Installation directory is cleaned (except `node_modules`)
3. New files are extracted
4. `yarn install` runs to sync dependencies
5. `.env` file is updated with new `APP_DIR` if changed
6. Service is restarted

### Uninstallation

1. Service is stopped and removed
2. Installation directory is removed
3. Data directory is preserved (contains user data)

## Configuration

After installation, users can configure Maintainerr by editing the `.env` file in the data directory:

```
APP_DIR=C:\Program Files\Maintainerr
DATA_DIR=C:\ProgramData\MaintainerrData
API_PORT=3001
UI_PORT=6246
UI_HOSTNAME=0.0.0.0
NODE_ENV=production
VERSION_TAG=stable
```

## Service Management

The Maintainerr service can be managed via:

- Services snap-in (`services.msc`)
- PowerShell: `Get-Service Maintainerr`, `Start-Service Maintainerr`, `Stop-Service Maintainerr`
- Command line: `sc query Maintainerr`, `sc start Maintainerr`, `sc stop Maintainerr`

## Troubleshooting

### Installation Fails

1. **Node.js not found**
   - Ensure Node.js is installed and in PATH
   - Restart the installer after installing Node.js

2. **Yarn install fails**
   - Check internet connectivity
   - Verify Node.js version
   - Check logs in Windows Event Viewer

3. **Service won't start**
   - Check Event Viewer for error messages
   - Verify `.env` file exists in data directory
   - Ensure data directory has correct permissions

### Logs

- Installation logs: `%TEMP%\Maintainerr_Install.log`
- Service logs: Windows Event Viewer > Windows Logs > Application
- Application logs: `<DATA_DIR>\logs\`

## Development

### Project Structure

```
installer/windows/
├── CustomActions/          # C# custom actions
│   ├── CustomActions.cs
│   └── CustomActions.csproj
├── ServiceWrapper/         # Windows Service wrapper
│   ├── Program.cs
│   └── ServiceWrapper.csproj
├── Resources/              # Installer resources
│   ├── maintainerr.ico
│   ├── .env.server
│   └── MaintainerrService.exe
├── Product.wxs             # Main installer definition
├── Bundle.wxs              # Bootstrapper (future)
├── DataFolderDialog.wxs    # Custom dialog for data folder
├── Components.wxs          # Component definitions
├── Installer.wixproj       # WiX project file
├── Build.ps1               # Build automation script
└── README.md               # This file
```

### Custom Actions

The installer includes several custom actions:

1. `ValidateNodeJsVersion` - Validates Node.js installation and version
2. `ValidateDataFolderPath` - Ensures data folder is outside install folder
3. `CreateEnvironmentFiles` - Creates/updates `.env` file
4. `RunYarnInstall` - Installs dependencies
5. `SetupWindowsService` - Configures the Windows Service
6. `RemoveWindowsService` - Removes the service on uninstall

## License

MIT License - See LICENSE file in repository root
