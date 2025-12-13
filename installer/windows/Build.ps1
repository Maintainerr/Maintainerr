# Build script for Maintainerr Windows Installer
# This script automates the entire build process

param(
    [string]$Configuration = "Release",
    [switch]$SkipBuild,
    [switch]$SkipTests,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "../..")
$InstallerDir = $ScriptDir
$ResourcesDir = Join-Path $InstallerDir "Resources"

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "Maintainerr Windows Installer Build" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if a command exists
function Test-CommandExists {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Verify prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check .NET SDK
if (-not (Test-CommandExists "dotnet")) {
    Write-Error ".NET SDK is not installed. Please install .NET 8.0 SDK from https://dotnet.microsoft.com/"
    exit 1
}

$dotnetVersion = dotnet --version
Write-Host "  .NET SDK: $dotnetVersion" -ForegroundColor Green

# Check WiX
try {
    $wixVersion = wix --version 2>&1
    Write-Host "  WiX Toolset: $wixVersion" -ForegroundColor Green
} catch {
    Write-Error "WiX Toolset is not installed. Install with: dotnet tool install --global wix"
    exit 1
}

# Check Node.js
if (-not (Test-CommandExists "node")) {
    Write-Error "Node.js is not installed. Please install Node.js 20.19.0+ or 22.12.0+ from https://nodejs.org/"
    exit 1
}

$nodeVersion = node --version
Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green

# Check Yarn
try {
    $yarnVersion = yarn --version 2>&1
    Write-Host "  Yarn: $yarnVersion" -ForegroundColor Green
} catch {
    Write-Host "  Yarn not found, enabling corepack..." -ForegroundColor Yellow
    corepack enable
    $yarnVersion = yarn --version 2>&1
    Write-Host "  Yarn: $yarnVersion" -ForegroundColor Green
}

Write-Host ""

# Clean if requested
if ($Clean) {
    Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
    
    if (Test-Path (Join-Path $InstallerDir "bin")) {
        Remove-Item -Path (Join-Path $InstallerDir "bin") -Recurse -Force
        Write-Host "  Removed installer bin directory" -ForegroundColor Gray
    }
    
    if (Test-Path (Join-Path $InstallerDir "obj")) {
        Remove-Item -Path (Join-Path $InstallerDir "obj") -Recurse -Force
        Write-Host "  Removed installer obj directory" -ForegroundColor Gray
    }
    
    if (Test-Path (Join-Path $InstallerDir "CustomActions/bin")) {
        Remove-Item -Path (Join-Path $InstallerDir "CustomActions/bin") -Recurse -Force
        Write-Host "  Removed CustomActions bin directory" -ForegroundColor Gray
    }
    
    if (Test-Path (Join-Path $InstallerDir "CustomActions/obj")) {
        Remove-Item -Path (Join-Path $InstallerDir "CustomActions/obj") -Recurse -Force
        Write-Host "  Removed CustomActions obj directory" -ForegroundColor Gray
    }
    
    if (Test-Path (Join-Path $InstallerDir "ServiceWrapper/bin")) {
        Remove-Item -Path (Join-Path $InstallerDir "ServiceWrapper/bin") -Recurse -Force
        Write-Host "  Removed ServiceWrapper bin directory" -ForegroundColor Gray
    }
    
    if (Test-Path (Join-Path $InstallerDir "ServiceWrapper/obj")) {
        Remove-Item -Path (Join-Path $InstallerDir "ServiceWrapper/obj") -Recurse -Force
        Write-Host "  Removed ServiceWrapper obj directory" -ForegroundColor Gray
    }
    
    Write-Host "Clean complete" -ForegroundColor Green
    Write-Host ""
}

# Build Maintainerr application if not skipped
if (-not $SkipBuild) {
    Write-Host "Building Maintainerr application..." -ForegroundColor Yellow
    Push-Location $RepoRoot
    
    try {
        Write-Host "  Installing dependencies..." -ForegroundColor Gray
        yarn install --immutable
        
        Write-Host "  Building application..." -ForegroundColor Gray
        yarn build
        
        Write-Host "  Maintainerr build complete" -ForegroundColor Green
    }
    catch {
        Write-Error "Failed to build Maintainerr application: $_"
        Pop-Location
        exit 1
    }
    finally {
        Pop-Location
    }
    
    Write-Host ""
}

# Create Resources directory
Write-Host "Preparing resources..." -ForegroundColor Yellow
if (-not (Test-Path $ResourcesDir)) {
    New-Item -ItemType Directory -Path $ResourcesDir | Out-Null
    Write-Host "  Created Resources directory" -ForegroundColor Gray
}

# Build Service Wrapper
Write-Host "Building Windows Service wrapper..." -ForegroundColor Yellow
Push-Location (Join-Path $InstallerDir "ServiceWrapper")

try {
    dotnet publish -c $Configuration -r win-x64 --self-contained -o "bin/$Configuration/net8.0/win-x64/publish"
    
    # Copy to Resources
    $serviceExePath = "bin/$Configuration/net8.0/win-x64/publish/MaintainerrService.exe"
    if (Test-Path $serviceExePath) {
        Copy-Item $serviceExePath (Join-Path $ResourcesDir "MaintainerrService.exe") -Force
        Write-Host "  Service wrapper built and copied to Resources" -ForegroundColor Green
    } else {
        throw "Service wrapper executable not found at $serviceExePath"
    }
}
catch {
    Write-Error "Failed to build service wrapper: $_"
    Pop-Location
    exit 1
}
finally {
    Pop-Location
}

Write-Host ""

# Build Custom Actions
Write-Host "Building custom actions..." -ForegroundColor Yellow
Push-Location (Join-Path $InstallerDir "CustomActions")

try {
    dotnet build -c $Configuration
    
    # Copy to installer directory
    $customActionsDll = "bin/$Configuration/net8.0/CustomActions.CA.dll"
    if (Test-Path $customActionsDll) {
        Copy-Item $customActionsDll (Join-Path $InstallerDir "CustomActions.CA.dll") -Force
        Write-Host "  Custom actions built" -ForegroundColor Green
    } else {
        throw "Custom actions DLL not found at $customActionsDll"
    }
}
catch {
    Write-Error "Failed to build custom actions: $_"
    Pop-Location
    exit 1
}
finally {
    Pop-Location
}

Write-Host ""

# Create .env template if it doesn't exist
$envTemplatePath = Join-Path $ResourcesDir ".env.server"
if (-not (Test-Path $envTemplatePath)) {
    Write-Host "Creating .env template..." -ForegroundColor Yellow
    @"
# Maintainerr Environment Configuration
# This file will be copied to the data directory during installation

# Where Maintainerr will store its data
DATA_DIR=

# Server Port (default: 6246)
UI_PORT=6246

# Server Hostname (default: 0.0.0.0)
UI_HOSTNAME=0.0.0.0

# Base path for serving under a subdirectory (e.g., /maintainerr)
# Leave empty if serving from root
BASE_PATH=

# Node environment
NODE_ENV=production

# Version tag
VERSION_TAG=stable

# Git SHA (populated during build)
GIT_SHA=
"@ | Out-File -FilePath $envTemplatePath -Encoding UTF8 -NoNewline
    Write-Host "  .env template created" -ForegroundColor Green
    Write-Host ""
}

# Create placeholder icon if it doesn't exist
$iconPath = Join-Path $ResourcesDir "maintainerr.ico"
if (-not (Test-Path $iconPath)) {
    Write-Host "WARNING: maintainerr.ico not found in Resources directory." -ForegroundColor Yellow
    Write-Host "         Creating a minimal placeholder icon for build purposes." -ForegroundColor Yellow
    Write-Host "         For production builds, provide a proper icon file at:" -ForegroundColor Yellow
    Write-Host "         $iconPath" -ForegroundColor Yellow
    
    # Create a minimal 1x1 pixel ico file as placeholder
    # This should be replaced with a proper icon for production builds
    $iconBytes = @(0,0,1,0,1,0,1,1,0,0,1,0,24,0,48,0,0,0,22,0,0,0,40,0,0,0,1,0,0,0,2,0,0,0,1,0,24,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,0,0,255,0,0,0,0,0)
    [System.IO.File]::WriteAllBytes($iconPath, $iconBytes)
    
    Write-Host ""
}

# Build WiX installer
Write-Host "Building WiX installer..." -ForegroundColor Yellow
Push-Location $InstallerDir

try {
    # Build the installer
    dotnet build Installer.wixproj -c $Configuration
    
    $msiPath = "bin/$Configuration/Maintainerr.msi"
    if (Test-Path $msiPath) {
        $msiFullPath = Resolve-Path $msiPath
        $msiSize = (Get-Item $msiPath).Length / 1MB
        
        Write-Host ""
        Write-Host "==================================" -ForegroundColor Green
        Write-Host "Build Successful!" -ForegroundColor Green
        Write-Host "==================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Installer created at:" -ForegroundColor Cyan
        Write-Host "  $msiFullPath" -ForegroundColor White
        Write-Host ""
        Write-Host "Size: $([Math]::Round($msiSize, 2)) MB" -ForegroundColor Gray
        Write-Host ""
    } else {
        throw "Installer MSI not found at $msiPath"
    }
}
catch {
    Write-Error "Failed to build WiX installer: $_"
    Pop-Location
    exit 1
}
finally {
    Pop-Location
}

Write-Host "Build complete!" -ForegroundColor Green
