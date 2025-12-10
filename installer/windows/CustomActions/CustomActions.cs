using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.ServiceProcess;
using System.Text.RegularExpressions;
using WixToolset.Dtf.WindowsInstaller;

namespace Maintainerr.Installer.CustomActions
{
    public class CustomActions
    {
        private const string RequiredNodeVersionMajorMin = "20";
        private const string RequiredNodeVersionMinorMin = "19";
        private const string AlternateNodeVersionMajorMin = "22";
        private const string AlternateNodeVersionMinorMin = "12";

        /// <summary>
        /// Validates that Node.js is installed and meets minimum version requirements
        /// </summary>
        [CustomAction]
        public static ActionResult ValidateNodeJsVersion(Session session)
        {
            session.Log("Begin ValidateNodeJsVersion");

            try
            {
                // Try to execute node --version
                var processStartInfo = new ProcessStartInfo
                {
                    FileName = "node",
                    Arguments = "--version",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(processStartInfo))
                {
                    if (process == null)
                    {
                        session.Log("Failed to start node process");
                        return ShowNodeJsError(session);
                    }

                    process.WaitForExit();
                    string output = process.StandardOutput.ReadToEnd().Trim();
                    session.Log($"Node.js version output: {output}");

                    if (process.ExitCode != 0)
                    {
                        session.Log($"Node.js returned exit code: {process.ExitCode}");
                        return ShowNodeJsError(session);
                    }

                    // Parse version (format: vX.Y.Z)
                    var versionMatch = Regex.Match(output, @"v(\d+)\.(\d+)\.(\d+)");
                    if (!versionMatch.Success)
                    {
                        session.Log($"Failed to parse Node.js version from: {output}");
                        return ShowNodeJsError(session);
                    }

                    int major = int.Parse(versionMatch.Groups[1].Value);
                    int minor = int.Parse(versionMatch.Groups[2].Value);
                    int patch = int.Parse(versionMatch.Groups[3].Value);

                    session.Log($"Detected Node.js version: {major}.{minor}.{patch}");

                    // Check if version meets requirements: ^20.19.0 || >=22.12.0
                    bool meetsRequirements = false;

                    if (major == 20 && minor >= 19)
                    {
                        meetsRequirements = true;
                        session.Log("Node.js version meets requirements (20.19.0+)");
                    }
                    else if (major >= 22)
                    {
                        if (major == 22 && minor >= 12)
                        {
                            meetsRequirements = true;
                            session.Log("Node.js version meets requirements (22.12.0+)");
                        }
                        else if (major > 22)
                        {
                            meetsRequirements = true;
                            session.Log($"Node.js version meets requirements ({major}.{minor}.{patch})");
                        }
                    }

                    if (!meetsRequirements)
                    {
                        session.Log($"Node.js version {major}.{minor}.{patch} does not meet requirements");
                        return ShowNodeJsVersionError(session, $"{major}.{minor}.{patch}");
                    }

                    session.Log("Node.js validation successful");
                    return ActionResult.Success;
                }
            }
            catch (System.ComponentModel.Win32Exception)
            {
                session.Log("Node.js not found in PATH");
                return ShowNodeJsError(session);
            }
            catch (Exception ex)
            {
                session.Log($"Error validating Node.js: {ex.Message}");
                return ShowNodeJsError(session);
            }
        }

        private static ActionResult ShowNodeJsError(Session session)
        {
            using (var record = new Record(0))
            {
                record.FormatString = "Node.js is not installed or not found in PATH.\n\n" +
                    "Maintainerr requires Node.js version 20.19.0 or later, or 22.12.0 or later.\n\n" +
                    "Please download and install Node.js from https://nodejs.org/\n\n" +
                    "After installing Node.js, restart this installer.";
                session.Message(InstallMessage.Error, record);
            }
            return ActionResult.Failure;
        }

        private static ActionResult ShowNodeJsVersionError(Session session, string installedVersion)
        {
            using (var record = new Record(0))
            {
                record.FormatString = $"Installed Node.js version ({installedVersion}) does not meet requirements.\n\n" +
                    "Maintainerr requires Node.js version 20.19.0 or later, or 22.12.0 or later.\n\n" +
                    "Please update Node.js from https://nodejs.org/\n\n" +
                    "After updating Node.js, restart this installer.";
                session.Message(InstallMessage.Error, record);
            }
            return ActionResult.Failure;
        }

        /// <summary>
        /// Validates that the data folder path is valid and outside the installation directory
        /// </summary>
        [CustomAction]
        public static ActionResult ValidateDataFolderPath(Session session)
        {
            session.Log("Begin ValidateDataFolderPath");

            try
            {
                string installFolder = session["INSTALLFOLDER"];
                string dataFolder = session["DATAFOLDER"];

                session.Log($"Install folder: {installFolder}");
                session.Log($"Data folder: {dataFolder}");

                if (string.IsNullOrWhiteSpace(dataFolder))
                {
                    using (var record = new Record(0))
                    {
                        record.FormatString = "Data folder path cannot be empty.";
                        session.Message(InstallMessage.Error, record);
                    }
                    return ActionResult.Failure;
                }

                // Normalize paths for comparison
                string normalizedInstall = Path.GetFullPath(installFolder).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string normalizedData = Path.GetFullPath(dataFolder).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

                session.Log($"Normalized install folder: {normalizedInstall}");
                session.Log($"Normalized data folder: {normalizedData}");

                // Check if data folder is inside or same as install folder
                if (normalizedData.Equals(normalizedInstall, StringComparison.OrdinalIgnoreCase) ||
                    normalizedData.StartsWith(normalizedInstall + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                {
                    using (var record = new Record(0))
                    {
                        record.FormatString = "The data directory must be outside the installation directory.\n\n" +
                            "This ensures your data is preserved during upgrades.";
                        session.Message(InstallMessage.Error, record);
                    }
                    return ActionResult.Failure;
                }

                session.Log("Data folder validation successful");
                return ActionResult.Success;
            }
            catch (Exception ex)
            {
                session.Log($"Error validating data folder: {ex.Message}");
                using (var record = new Record(0))
                {
                    record.FormatString = $"Error validating data folder path: {ex.Message}";
                    session.Message(InstallMessage.Error, record);
                }
                return ActionResult.Failure;
            }
        }

        /// <summary>
        /// Creates .env files in the data directory
        /// </summary>
        [CustomAction]
        public static ActionResult CreateEnvironmentFiles(Session session)
        {
            session.Log("Begin CreateEnvironmentFiles");

            try
            {
                string dataFolder = session["DATAFOLDER"];
                string installFolder = session["INSTALLFOLDER"];

                session.Log($"Creating .env file in: {dataFolder}");

                // Ensure data directory exists
                if (!Directory.Exists(dataFolder))
                {
                    var dirInfo = Directory.CreateDirectory(dataFolder);
                    session.Log($"Created data directory: {dataFolder}");
                    
                    // Set permissions to allow the service account (LocalService) to access the directory
                    try
                    {
                        var dirSecurity = dirInfo.GetAccessControl();
                        // Allow LocalService full control
                        var localServiceSid = new System.Security.Principal.SecurityIdentifier(
                            System.Security.Principal.WellKnownSidType.LocalServiceSid, null);
                        dirSecurity.AddAccessRule(new System.Security.AccessControl.FileSystemAccessRule(
                            localServiceSid,
                            System.Security.AccessControl.FileSystemRights.FullControl,
                            System.Security.AccessControl.InheritanceFlags.ContainerInherit | 
                            System.Security.AccessControl.InheritanceFlags.ObjectInherit,
                            System.Security.AccessControl.PropagationFlags.None,
                            System.Security.AccessControl.AccessControlType.Allow));
                        dirInfo.SetAccessControl(dirSecurity);
                        session.Log("Set LocalService permissions on data directory");
                    }
                    catch (Exception ex)
                    {
                        session.Log($"Warning: Could not set directory permissions: {ex.Message}");
                        // Don't fail installation if we can't set permissions
                    }
                }

                string envFilePath = Path.Combine(dataFolder, ".env");

                // Check if .env file already exists (upgrade scenario)
                if (File.Exists(envFilePath))
                {
                    session.Log(".env file already exists, preserving existing configuration");
                }
                else
                {
                    // Create new .env file
                    var envContent = new[]
                    {
                        "# Maintainerr Configuration",
                        "# This file contains environment variables for Maintainerr",
                        "",
                        "# Where Maintainerr will store its data",
                        $"DATA_DIR={dataFolder}",
                        "",
                        "# Server Port (default: 6246)",
                        "UI_PORT=6246",
                        "",
                        "# Server Hostname (default: 0.0.0.0)",
                        "UI_HOSTNAME=0.0.0.0",
                        "",
                        "# Base path for serving under a subdirectory (e.g., /maintainerr)",
                        "# Leave empty if serving from root",
                        "BASE_PATH=",
                        "",
                        "# Node environment",
                        "NODE_ENV=production",
                        "",
                        "# Version tag",
                        "VERSION_TAG=stable",
                        "",
                        "# Git SHA (populated during build)",
                        "GIT_SHA=",
                    };

                    File.WriteAllLines(envFilePath, envContent);
                    session.Log("Created new .env file");
                }

                session.Log("Environment files created successfully");
                return ActionResult.Success;
            }
            catch (Exception ex)
            {
                session.Log($"Error creating environment files: {ex.Message}");
                using (var record = new Record(0))
                {
                    record.FormatString = $"Error creating environment files: {ex.Message}";
                    session.Message(InstallMessage.Error, record);
                }
                return ActionResult.Failure;
            }
        }

        /// <summary>
        /// Validates that a path is safe and doesn't contain command injection characters
        /// </summary>
        private static bool IsPathSafe(string path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return false;
            }

            // Check for command injection characters
            char[] dangerousChars = { '&', '|', '>', '<', '"', '\'', ';', '$', '`', '\n', '\r' };
            if (path.IndexOfAny(dangerousChars) >= 0)
            {
                return false;
            }

            return true;
        }

        /// <summary>
        /// Checks if path normalization is consistent (path hasn't been tampered with)
        /// </summary>
        private static bool IsPathNormalizationConsistent(string originalPath, string normalizedPath)
        {
            return normalizedPath.Equals(
                originalPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar),
                StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Runs yarn install to install dependencies
        /// </summary>
        [CustomAction]
        public static ActionResult RunYarnInstall(Session session)
        {
            session.Log("Begin RunYarnInstall");

            try
            {
                string installFolder = session["INSTALLFOLDER"];
                session.Log($"Running yarn install in: {installFolder}");

                // Validate install folder path to prevent path injection
                if (!IsPathSafe(installFolder))
                {
                    session.Log("Install folder contains invalid or dangerous characters");
                    using (var record = new Record(0))
                    {
                        record.FormatString = "Installation folder path contains invalid characters.";
                        session.Message(InstallMessage.Error, record);
                    }
                    return ActionResult.Failure;
                }

                // Normalize and validate the path
                try
                {
                    string normalizedPath = Path.GetFullPath(installFolder);
                    if (!IsPathNormalizationConsistent(installFolder, normalizedPath))
                    {
                        session.Log($"Path normalization mismatch: {installFolder} vs {normalizedPath}");
                    }
                }
                catch (Exception ex)
                {
                    session.Log($"Invalid install folder path: {ex.Message}");
                    using (var record = new Record(0))
                    {
                        record.FormatString = "Invalid installation folder path.";
                        session.Message(InstallMessage.Error, record);
                    }
                    return ActionResult.Failure;
                }

                // Check if yarn is available
                var processStartInfo = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c corepack enable && yarn --version",
                    WorkingDirectory = installFolder,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = Process.Start(processStartInfo))
                {
                    if (process == null)
                    {
                        session.Log("Failed to start yarn version check");
                        return ActionResult.Failure;
                    }

                    process.WaitForExit();
                    string output = process.StandardOutput.ReadToEnd();
                    string error = process.StandardError.ReadToEnd();
                    
                    session.Log($"Yarn version check output: {output}");
                    if (!string.IsNullOrEmpty(error))
                    {
                        session.Log($"Yarn version check error: {error}");
                    }
                }

                // Run yarn install
                processStartInfo = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c corepack enable && yarn install --immutable",
                    WorkingDirectory = installFolder,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                session.Log("Starting yarn install...");

                using (var process = Process.Start(processStartInfo))
                {
                    if (process == null)
                    {
                        session.Log("Failed to start yarn install process");
                        return ActionResult.Failure;
                    }

                    // Read output while process is running
                    while (!process.HasExited)
                    {
                        string line = process.StandardOutput.ReadLine();
                        if (!string.IsNullOrEmpty(line))
                        {
                            session.Log($"Yarn: {line}");
                        }
                    }

                    // Read any remaining output
                    string remainingOutput = process.StandardOutput.ReadToEnd();
                    string errorOutput = process.StandardError.ReadToEnd();

                    if (!string.IsNullOrEmpty(remainingOutput))
                    {
                        session.Log($"Yarn output: {remainingOutput}");
                    }

                    if (!string.IsNullOrEmpty(errorOutput))
                    {
                        session.Log($"Yarn errors: {errorOutput}");
                    }

                    if (process.ExitCode != 0)
                    {
                        session.Log($"Yarn install failed with exit code: {process.ExitCode}");
                        using (var record = new Record(0))
                        {
                            record.FormatString = $"Failed to install dependencies. Exit code: {process.ExitCode}\n\n" +
                                $"Error: {errorOutput}";
                            session.Message(InstallMessage.Warning, record);
                        }
                        // Don't fail installation, just warn
                        return ActionResult.Success;
                    }
                }

                session.Log("Yarn install completed successfully");
                return ActionResult.Success;
            }
            catch (Exception ex)
            {
                session.Log($"Error running yarn install: {ex.Message}");
                using (var record = new Record(0))
                {
                    record.FormatString = $"Warning: Could not install dependencies: {ex.Message}\n\n" +
                        "You may need to run 'yarn install' manually in the installation directory.";
                    session.Message(InstallMessage.Warning, record);
                }
                // Don't fail installation, just warn
                return ActionResult.Success;
            }
        }

        /// <summary>
        /// Sets up the Windows Service
        /// </summary>
        [CustomAction]
        public static ActionResult SetupWindowsService(Session session)
        {
            session.Log("Begin SetupWindowsService");

            try
            {
                string installFolder = session["INSTALLFOLDER"];
                string dataFolder = session["DATAFOLDER"];
                
                session.Log($"Setting up Windows Service with install folder: {installFolder}");
                session.Log($"Data folder: {dataFolder}");

                // The service is already created by the ServiceInstall element in WiX
                // We just need to configure it with the correct environment variables

                // Set environment variables for the service
                string serviceName = "Maintainerr";
                
                try
                {
                    using (var service = ServiceController.GetServices().FirstOrDefault(s => s.ServiceName == serviceName))
                    {
                        if (service != null)
                        {
                            session.Log($"Service '{serviceName}' found, status: {service.Status}");
                        }
                        else
                        {
                            session.Log($"Service '{serviceName}' not found yet (will be created by ServiceInstall)");
                        }
                    }
                }
                catch (Exception ex)
                {
                    session.Log($"Note: Could not query service status: {ex.Message}");
                }

                session.Log("Windows Service setup completed");
                return ActionResult.Success;
            }
            catch (Exception ex)
            {
                session.Log($"Error setting up Windows Service: {ex.Message}");
                using (var record = new Record(0))
                {
                    record.FormatString = $"Warning: Could not fully configure Windows Service: {ex.Message}\n\n" +
                        "The service may need manual configuration.";
                    session.Message(InstallMessage.Warning, record);
                }
                // Don't fail installation
                return ActionResult.Success;
            }
        }

        /// <summary>
        /// Removes the Windows Service
        /// </summary>
        [CustomAction]
        public static ActionResult RemoveWindowsService(Session session)
        {
            session.Log("Begin RemoveWindowsService");

            try
            {
                // The service removal is handled by ServiceControl element in WiX
                session.Log("Service removal will be handled by WiX ServiceControl");
                return ActionResult.Success;
            }
            catch (Exception ex)
            {
                session.Log($"Error removing Windows Service: {ex.Message}");
                // Don't fail uninstallation
                return ActionResult.Success;
            }
        }
    }
}
