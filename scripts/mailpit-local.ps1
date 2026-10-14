#requires -Version 7.4
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
if (-not $IsWindows -or [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
    throw 'This pinned Mailpit launcher supports Windows x64 only.'
}

# Official release metadata: https://api.github.com/repos/axllent/mailpit/releases/tags/v1.31.5
$mailpitVersion = 'v1.31.5'
$archiveSha256 = '9637e21c02b33185fe69268ba05317152a5d8ac7877115e8a70e29b7e199e8dc'
$repositoryPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mailpitRoot = Join-Path $repositoryPath '.local/mailpit'
$versionDirectory = Join-Path $mailpitRoot $mailpitVersion
$archivePath = Join-Path $versionDirectory 'mailpit-windows-amd64.zip'
$extractDirectory = Join-Path $versionDirectory 'extracted'
$pidPath = Join-Path $mailpitRoot 'mailpit.pid'
$mailpitProcess = $null
$mailpitStarted = $false
$launcherLock = $null

function Assert-LocalPortAvailable([int] $Port) {
    $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $probe.Server.ExclusiveAddressUse = $true
    try {
        $probe.Start()
    } catch {
        throw "Local port $Port is occupied. This launcher will not stop or reuse another process."
    } finally {
        $probe.Stop()
    }
}

try {
    [System.IO.Directory]::CreateDirectory($versionDirectory) | Out-Null
    # Held until this launcher exits; concurrent launchers must not overwrite its PID/cache.
    $launcherLock = [System.IO.File]::Open((Join-Path $mailpitRoot 'launcher.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    Assert-LocalPortAvailable 1025
    Assert-LocalPortAvailable 8025

    if (-not (Test-Path -LiteralPath $archivePath)) {
        Write-Host "Downloading official Mailpit $mailpitVersion Windows x64 archive..."
        Invoke-WebRequest -Uri "https://github.com/axllent/mailpit/releases/download/$mailpitVersion/mailpit-windows-amd64.zip" -OutFile $archivePath
    }
    $actualSha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha256 -ne $archiveSha256) {
        throw "Mailpit ZIP checksum mismatch. Nothing was executed. Remove the corrupt archive at $archivePath before retrying."
    }
    # Re-extract the verified archive so an existing executable is never trusted unverified.
    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractDirectory -Force
    $executablePath = Join-Path $extractDirectory 'mailpit.exe'
    if (-not (Test-Path -LiteralPath $executablePath -PathType Leaf)) {
        throw 'Verified Mailpit archive does not contain mailpit.exe at the expected location.'
    }

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $executablePath
    $startInfo.WorkingDirectory = $versionDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    # Drop every inherited Mailpit option, including SMTP relay/forward and webhook settings.
    foreach ($environmentName in @($startInfo.Environment.Keys)) {
        if ($environmentName.StartsWith('MP_', [System.StringComparison]::OrdinalIgnoreCase)) {
            $startInfo.Environment.Remove($environmentName) | Out-Null
        }
    }
    foreach ($argument in @(
        '--listen', '127.0.0.1:8025',
        '--smtp', '127.0.0.1:1025',
        '--database', (Join-Path $mailpitRoot 'mailpit.db'),
        '--disable-version-check',
        '--smtp-disable-rdns',
        '--log-file', (Join-Path $mailpitRoot 'mailpit.log')
    )) {
        $startInfo.ArgumentList.Add($argument)
    }

    $mailpitProcess = [System.Diagnostics.Process]::new()
    $mailpitProcess.StartInfo = $startInfo
    if (-not $mailpitProcess.Start()) { throw 'Mailpit process could not start.' }
    $mailpitStarted = $true
    [System.IO.File]::WriteAllText($pidPath, [string] $mailpitProcess.Id)

    $ready = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($mailpitProcess.HasExited) { throw "Mailpit exited before readiness (code $($mailpitProcess.ExitCode)); inspect .local/mailpit/mailpit.log." }
        try {
            $info = Invoke-RestMethod -Uri 'http://127.0.0.1:8025/api/v1/info' -TimeoutSec 2
            if ($info.Version -and -not $mailpitProcess.HasExited) {
                $ready = $true
                break
            }
        } catch {
            # The listener is not ready yet; retry only within this bounded startup window.
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Mailpit did not become ready at /api/v1/info within the startup window.' }
    Write-Host "Mailpit $mailpitVersion ready, PID $($mailpitProcess.Id). SMTP 127.0.0.1:1025; UI http://127.0.0.1:8025"
    Write-Host 'Relay/forwarding are disabled. Press Ctrl+C in this terminal to stop this Mailpit process.'
    while (-not $mailpitProcess.HasExited) { Start-Sleep -Milliseconds 500 }
    if ($mailpitProcess.ExitCode -ne 0) { throw "Mailpit exited with code $($mailpitProcess.ExitCode)." }
} finally {
    if ($null -ne $mailpitProcess) {
        if ($mailpitStarted -and -not $mailpitProcess.HasExited) {
            # Stop only the process object created by this invocation; never kill by name/port.
            $mailpitProcess.Kill()
            $mailpitProcess.WaitForExit()
        }
        $mailpitProcess.Dispose()
        if ($mailpitStarted) {
            [System.IO.File]::Delete($pidPath)
            Write-Host 'Local Mailpit process stopped. Captured mail remains in .local/mailpit/mailpit.db.'
        }
    }
    if ($null -ne $launcherLock) { $launcherLock.Dispose() }
}
