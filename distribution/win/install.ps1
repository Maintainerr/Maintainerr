Write-Host "Welcome to the Maintainerr installation script!"

if (Test-Path .installed) {
    Write-Host "The script has already been run. If you need to re-run it, please delete the installation directory, backing up any customized .env files in server/ and ui/ and extract the archive again."
    exit 1
}

Write-Host "The user running this script must have write permissions to the installation directory."

$continue = Read-Host "Do you want to continue with the installation? (y/n)"

if ($continue -ne "y") {
    Write-Host "Exiting..."
    exit 1
}

$basePath = Read-Host "Will you be hosting Maintainerr under a subfolder (e.g. http://192.168.0.1/maintainerr)? If so, please provide the subfolder (e.g. /maintainerr) or press ENTER to continue without a subfolder"

if ($basePath) {
    if ($basePath[0] -ne "/") {
        Write-Host "The subfolder must start with a slash. Exiting..."
        exit 1
    }

    # Remove trailing slash if present
    $basePath = $basePath.TrimEnd('/')
}

Get-ChildItem -Path ./ui -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules' } | ForEach-Object {
    (Get-Content -LiteralPath $_.FullName) -replace '/__PATH_PREFIX__', $basePath | Set-Content -LiteralPath $_.FullName
}

New-Item -ItemType File -Path .installed  | Out-Null

Write-Host "Subfolder configuration set."

Write-Host "You must now manually update the server/.env and ui/.env files with your configuration."
