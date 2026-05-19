# FeedZero self-host CLI — PowerShell edition.
#
# Same surface as scripts/feedzero (POSIX). Use this on native Windows
# PowerShell when WSL2 / Git Bash is unavailable.
#
# Usage:
#   pwsh ./scripts/feedzero.ps1 <command> [args]

[CmdletBinding()]
param(
    [Parameter(Position = 0)] [string] $Command = 'help',
    [Parameter(Position = 1, ValueFromRemainingArguments = $true)] [string[]] $Args
)

$ErrorActionPreference = 'Stop'

# Repo root = parent of this script's directory.
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir
Set-Location $RepoRoot

function Write-Red    ([string]$m) { Write-Host $m -ForegroundColor Red }
function Write-Green  ([string]$m) { Write-Host $m -ForegroundColor Green }
function Write-Yellow ([string]$m) { Write-Host $m -ForegroundColor Yellow }
function Write-Dim    ([string]$m) { Write-Host $m -ForegroundColor DarkGray }

# Detect docker compose (modern) vs docker-compose (legacy)
function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Args)
    $null = & docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        & docker compose @Args
    }
    elseif (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        & docker-compose @Args
    }
    else {
        Write-Red "Docker Compose not found."
        Write-Red "  Install Docker Desktop for Windows — it ships with the"
        Write-Red "  compose plugin out of the box."
        exit 1
    }
}

function Require-Env {
    if (-not (Test-Path .env)) {
        Write-Red ".env not found in $RepoRoot"
        Write-Red "  Copy the template and edit it:"
        Write-Red "    Copy-Item .env.example .env"
        Write-Red "  At minimum, set HOSTNAME."
        exit 1
    }
}

function Confirm-Action {
    param([string]$Message)
    Write-Host "$Message [y/N] " -ForegroundColor Yellow -NoNewline
    $answer = Read-Host
    return $answer -match '^(y|Y|yes|YES)$'
}

function Get-EnvVar {
    param([string]$Name, [string]$Default = '')
    if (-not (Test-Path .env)) { return $Default }
    $line = Select-String -Path .env -Pattern "^$Name=" -SimpleMatch:$false |
            Select-Object -First 1
    if ($null -eq $line) { return $Default }
    $value = $line.Line -replace "^$Name=", ''
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value
}

# ──────────────────────────────────────────────────────────────────
# Commands
# ──────────────────────────────────────────────────────────────────

function Cmd-Up {
    Require-Env
    Write-Green "Starting FeedZero..."
    Invoke-Compose up -d --build --remove-orphans
    Write-Green "Started. Check logs with: ./scripts/feedzero.ps1 logs"
}

function Cmd-Down {
    Write-Green "Stopping FeedZero..."
    Invoke-Compose down
}

function Cmd-Restart {
    Write-Green "Restarting FeedZero..."
    Invoke-Compose restart
}

function Cmd-Update {
    Require-Env
    Write-Green "Pulling latest image..."
    Invoke-Compose pull
    Write-Green "Recreating containers..."
    Invoke-Compose up -d --remove-orphans
    Write-Green "Update complete. Recent logs:"
    Invoke-Compose logs --tail=20 feedzero
}

function Cmd-Logs {
    if ($Args -and $Args.Count -gt 0) {
        Invoke-Compose logs -f $Args[0]
    }
    else {
        Invoke-Compose logs -f
    }
}

function Cmd-Status {
    Invoke-Compose ps
    Write-Host ''
    Write-Dim "Health check (may be unhealthy briefly during startup):"
    Invoke-Compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Health}}'
}

function Cmd-Backup {
    $dataDir = Get-EnvVar -Name 'DATA_DIR' -Default './data'
    if (-not (Test-Path $dataDir)) {
        Write-Red "Data directory not found: $dataDir"
        Write-Red "  Is FeedZero actually running here?"
        exit 1
    }

    if (-not (Test-Path backups)) { New-Item -ItemType Directory -Path backups | Out-Null }
    $timestamp = (Get-Date -AsUTC -Format 'yyyy-MM-ddTHHmmss') + 'Z'
    $out = "backups/feedzero-$timestamp.tar.gz"
    Write-Green "Backing up $dataDir to $out..."
    # Windows 10+ ships tar via libarchive.
    & tar -czf $out $dataDir
    if ($LASTEXITCODE -ne 0) {
        Write-Red "tar failed. On older Windows, install via 'winget install GnuWin32.Tar'."
        exit $LASTEXITCODE
    }
    $size = (Get-Item $out).Length
    Write-Green ("Backup complete: $out ({0:N0} bytes)" -f $size)
}

function Cmd-Restore {
    if (-not $Args -or $Args.Count -eq 0) {
        Write-Red "Usage: ./scripts/feedzero.ps1 restore <archive.tar.gz>"
        exit 1
    }
    $archive = $Args[0]
    if (-not (Test-Path $archive)) {
        Write-Red "Archive not found: $archive"
        exit 1
    }

    $dataDir = Get-EnvVar -Name 'DATA_DIR' -Default './data'
    Write-Yellow "WARNING: this will overwrite $dataDir with $archive."
    if (-not (Confirm-Action 'Continue?')) {
        Write-Yellow 'Aborted.'
        return
    }

    Write-Green "Stopping containers so the data dir is quiescent..."
    Invoke-Compose down

    Write-Green "Extracting $archive..."
    & tar -xzf $archive

    Write-Green "Restart with: ./scripts/feedzero.ps1 up"
}

function Cmd-Doctor {
    $ok = $true

    Write-Host 'Checking prerequisites...'
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Green "  ✓ docker installed: $(docker --version)"
    }
    else {
        Write-Red "  ✗ docker not installed"
        $ok = $false
    }

    $null = & docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Green "  ✓ docker compose available"
    }
    else {
        Write-Red "  ✗ docker compose not available"
        $ok = $false
    }

    if (Test-Path .env) {
        Write-Green "  ✓ .env present"
        $hostname = Get-EnvVar -Name 'HOSTNAME'
        if ($hostname -eq 'feedzero.example.com') {
            Write-Yellow "  ! HOSTNAME still set to the example value — edit .env"
            $ok = $false
        }
    }
    else {
        Write-Red "  ✗ .env missing (copy from .env.example)"
        $ok = $false
    }

    if ((Test-Path Caddyfile) -and (Test-Path docker-compose.yml)) {
        Write-Green "  ✓ Caddyfile + docker-compose.yml present"
    }
    else {
        Write-Red "  ✗ missing Caddyfile or docker-compose.yml"
        $ok = $false
    }

    if ($ok) {
        Write-Green 'All prerequisites OK.'
    }
    else {
        Write-Red 'Some checks failed — see above.'
        exit 1
    }
}

function Cmd-Help {
    @'
FeedZero self-host CLI (PowerShell).

Usage:
  pwsh ./scripts/feedzero.ps1 <command> [args]

Commands:
  up                     Start FeedZero + Caddy (first run builds if needed).
  down                   Stop the stack.
  restart                Restart without recreating containers.
  update                 Pull the latest image and restart.
  logs [service]         Tail logs (all services, or just feedzero / caddy).
  status                 Show container state + health.
  backup                 Snapshot vault data into backups/feedzero-<ts>.tar.gz.
  restore <archive>      Restore from a backup tarball (asks before overwriting).
  doctor                 Sanity-check the environment (docker, .env, configs).
  help                   This message.

Common flows:
  First-time install:
    Copy-Item .env.example .env
    notepad .env             # set HOSTNAME (and ACME_EMAIL)
    pwsh ./scripts/feedzero.ps1 up

  Update:
    pwsh ./scripts/feedzero.ps1 update

  Backup:
    pwsh ./scripts/feedzero.ps1 backup
'@
}

# ──────────────────────────────────────────────────────────────────
# Dispatch
# ──────────────────────────────────────────────────────────────────

switch ($Command) {
    'up'      { Cmd-Up }
    'down'    { Cmd-Down }
    'restart' { Cmd-Restart }
    'update'  { Cmd-Update }
    'logs'    { Cmd-Logs }
    'status'  { Cmd-Status }
    'backup'  { Cmd-Backup }
    'restore' { Cmd-Restore }
    'doctor'  { Cmd-Doctor }
    { $_ -in 'help', '-h', '--help' } { Cmd-Help }
    default {
        Write-Red "Unknown command: $Command"
        Cmd-Help
        exit 1
    }
}
