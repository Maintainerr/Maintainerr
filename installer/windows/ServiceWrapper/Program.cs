using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using dotenv.net;

namespace Maintainerr.Service
{
    public class Program
    {
        public static void Main(string[] args)
        {
            CreateHostBuilder(args).Build().Run();
        }

        public static IHostBuilder CreateHostBuilder(string[] args) =>
            Host.CreateDefaultBuilder(args)
                .UseWindowsService(options =>
                {
                    options.ServiceName = "Maintainerr";
                })
                .ConfigureServices((hostContext, services) =>
                {
                    services.AddHostedService<MaintainerrWorker>();
                });
    }

    public class MaintainerrWorker : BackgroundService
    {
        private readonly ILogger<MaintainerrWorker> _logger;
        private Process? _serverProcess;
        private string _dataFolder = string.Empty;
        private string? _nodeExePath = null;

        public MaintainerrWorker(ILogger<MaintainerrWorker> logger)
        {
            _logger = logger;
        }

        private string GetNodeExecutablePath()
        {
            // Return cached path if already found
            if (!string.IsNullOrEmpty(_nodeExePath))
            {
                return _nodeExePath;
            }

            // Get Node.js path from environment or use default
            string nodeExe = Environment.GetEnvironmentVariable("NODE_PATH") ?? "node";
            
            // Validate Node.js executable exists
            if (!File.Exists(nodeExe) && nodeExe == "node")
            {
                // Try to find node.exe in common locations
                var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                
                var possiblePaths = new[]
                {
                    Path.Combine(programFiles, "nodejs", "node.exe"),
                    Path.Combine(programFilesX86, "nodejs", "node.exe"),
                };
                
                foreach (var path in possiblePaths)
                {
                    if (File.Exists(path))
                    {
                        nodeExe = path;
                        _logger.LogInformation($"Found Node.js at: {nodeExe}");
                        break;
                    }
                }
            }

            _nodeExePath = nodeExe;
            return nodeExe;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                _logger.LogInformation("Maintainerr Service starting...");

                // Load environment variables from .env file in data directory
                LoadEnvironmentVariables();

                // Start server process (which serves both API and UI)
                await StartServerProcess(stoppingToken);

                // Keep service running
                while (!stoppingToken.IsCancellationRequested)
                {
                    // Check if process is still running
                    if (_serverProcess != null && _serverProcess.HasExited)
                    {
                        _logger.LogWarning("Server process has exited unexpectedly. Restarting...");
                        await StartServerProcess(stoppingToken);
                    }

                    await Task.Delay(5000, stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("Maintainerr Service is stopping...");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred in Maintainerr Service");
            }
        }

        private void LoadEnvironmentVariables()
        {
            // Try to get data folder from environment or registry
            _dataFolder = Environment.GetEnvironmentVariable("DATA_DIR") ?? string.Empty;

            // If not set, try to get from registry (set during installation)
            if (string.IsNullOrEmpty(_dataFolder))
            {
                try
                {
                    using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Maintainerr"))
                    {
                        if (key != null)
                        {
                            _dataFolder = key.GetValue("DataFolder") as string ?? _dataFolder;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not read registry values");
                }
            }

            if (string.IsNullOrEmpty(_dataFolder))
            {
                throw new InvalidOperationException("DATA_DIR is not set. Cannot start service.");
            }

            _logger.LogInformation($"Data Folder: {_dataFolder}");

            // Load .env file from data directory
            string envFilePath = Path.Combine(_dataFolder, ".env");
            if (File.Exists(envFilePath))
            {
                _logger.LogInformation($"Loading environment from: {envFilePath}");
                DotEnv.Load(new DotEnvOptions(envFilePaths: new[] { envFilePath }));
            }
            else
            {
                _logger.LogWarning($".env file not found at: {envFilePath}");
            }

            // Set NODE_ENV if not already set
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("NODE_ENV")))
            {
                Environment.SetEnvironmentVariable("NODE_ENV", "production");
            }
        }

        private async Task StartServerProcess(CancellationToken stoppingToken)
        {
            try
            {
                _logger.LogInformation("Starting Maintainerr server...");

                // Get install folder from registry
                string installFolder = string.Empty;
                try
                {
                    using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Maintainerr"))
                    {
                        if (key != null)
                        {
                            installFolder = key.GetValue("InstallFolder") as string ?? string.Empty;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Could not read install folder from registry");
                    throw;
                }

                if (string.IsNullOrEmpty(installFolder))
                {
                    throw new InvalidOperationException("Install folder not found in registry");
                }

                string serverPath = Path.Combine(installFolder, "server");
                string nodeExe = GetNodeExecutablePath();
                string serverMain = Path.Combine(serverPath, "dist", "main.js");

                if (!File.Exists(serverMain))
                {
                    _logger.LogError($"Server main file not found: {serverMain}");
                    throw new FileNotFoundException("Server main file not found", serverMain);
                }

                _logger.LogInformation($"Install Folder: {installFolder}");
                _logger.LogInformation($"Server Path: {serverPath}");

                var startInfo = new ProcessStartInfo
                {
                    FileName = nodeExe,
                    Arguments = $"\"{serverMain}\"",
                    WorkingDirectory = serverPath,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true
                };

                // Pass environment variables from .env file (already loaded)
                startInfo.EnvironmentVariables["NODE_ENV"] = Environment.GetEnvironmentVariable("NODE_ENV") ?? "production";
                startInfo.EnvironmentVariables["DATA_DIR"] = _dataFolder;
                
                string uiPort = Environment.GetEnvironmentVariable("UI_PORT") ?? "6246";
                string uiHostname = Environment.GetEnvironmentVariable("UI_HOSTNAME") ?? "0.0.0.0";
                string basePath = Environment.GetEnvironmentVariable("BASE_PATH") ?? "";
                string versionTag = Environment.GetEnvironmentVariable("VERSION_TAG") ?? "";
                string gitSha = Environment.GetEnvironmentVariable("GIT_SHA") ?? "";
                
                startInfo.EnvironmentVariables["UI_PORT"] = uiPort;
                startInfo.EnvironmentVariables["UI_HOSTNAME"] = uiHostname;
                if (!string.IsNullOrEmpty(basePath))
                {
                    startInfo.EnvironmentVariables["BASE_PATH"] = basePath;
                }
                if (!string.IsNullOrEmpty(versionTag))
                {
                    startInfo.EnvironmentVariables["VERSION_TAG"] = versionTag;
                }
                if (!string.IsNullOrEmpty(gitSha))
                {
                    startInfo.EnvironmentVariables["GIT_SHA"] = gitSha;
                }

                _serverProcess = new Process { StartInfo = startInfo };
                _serverProcess.OutputDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        _logger.LogInformation($"[Server] {e.Data}");
                    }
                };
                _serverProcess.ErrorDataReceived += (sender, e) =>
                {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        _logger.LogError($"[Server] {e.Data}");
                    }
                };

                _serverProcess.Start();
                _serverProcess.BeginOutputReadLine();
                _serverProcess.BeginErrorReadLine();

                _logger.LogInformation($"Maintainerr server started on {uiHostname}:{uiPort}");

                // Give server time to start
                await Task.Delay(3000, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to start Maintainerr server");
                throw;
            }
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Stopping Maintainerr Service...");

            // Stop server process
            if (_serverProcess != null && !_serverProcess.HasExited)
            {
                try
                {
                    _logger.LogInformation("Stopping server process...");
                    _serverProcess.Kill(entireProcessTree: true);
                    await _serverProcess.WaitForExitAsync(cancellationToken);
                    _logger.LogInformation("Server process stopped");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error stopping server process");
                }
            }

            await base.StopAsync(cancellationToken);
        }
    }
}
