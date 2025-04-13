#!/bin/bash

echo "Welcome to the Maintainerr installation script!"

if [ -f .installed ]; then
  echo "The script has already been ran. If you need to re-run it, please delete the installation directory, backing up any customized .env files in server/ and ui/ and extract the archive again."
  exit 1
fi

echo "The user running this script must have write permissions to the installation directory."

echo "Do you want to continue with the installation? (y/n):"

read CONTINUE

if [ "$CONTINUE" != "y" ]; then
  echo "Exiting..."
  exit 1
fi

echo "Will you be hosting Maintainerr under a subfolder (e.g. http://192.168.0.1/maintainerr)? If so, please provide the subfolder (e.g. /maintainerr) or press ENTER to continue without a subfolder:"

read BASE_PATH

if [ -n "$BASE_PATH" ]; then
  if [ "${BASE_PATH:0:1}" != "/" ]; then
    echo "The subfolder must start with a slash. Exiting..."
    exit 1
  fi

  # Remove trailing slash if present
  BASE_PATH=${BASE_PATH%/}
fi

find ./ui -type f -not -path '*/node_modules/*' -print0 | xargs -0 sed -i "s,/__PATH_PREFIX__,$BASE_PATH,g"

touch .installed

echo "Subfolder configuration set."

echo "Installing dependencies..."

npm rebuild

echo "You must now manually update the server/.env and ui/.env files with your configuration."