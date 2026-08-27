param(
    [Parameter(Mandatory = $true)]
    [string]$HostName,
    [string]$User = "swu-deck-builder",
    [int]$Port = 22,
    [string]$IdentityFile = "",
    [string]$Bundle = "",
    [switch]$SkipPackage,
    [switch]$SkipUpload,
    [switch]$UploadOnly,
    [switch]$PreflightOnly,
    [switch]$NoPreflight,
    [switch]$AllowDowngrade,
    [switch]$Status,
    [switch]$Rollback,
    [switch]$AcceptNewHostKey
)

$ErrorActionPreference = "Stop"
$remoteInbox = "/var/lib/swu-deck-builder-deploy/incoming"

function Write-DeployLog {
    param([string]$Message)
    Write-Host "[swu-deploy] $Message"
}

function Fail-Deploy {
    param([string]$Message)
    throw "[swu-deploy] $Message"
}

function Invoke-Checked {
    param(
        [string]$Tool,
        [string[]]$Arguments
    )

    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        Fail-Deploy "$Tool failed with exit code $LASTEXITCODE"
    }
}

function Resolve-RepoRoot {
    return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Get-Sha256 {
    param([string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Get-NewestBundle {
    param([string]$RepoRoot)

    $directory = Join-Path $RepoRoot "artifacts\service"
    if (-not (Test-Path -LiteralPath $directory)) {
        Fail-Deploy "service package directory does not exist: $directory"
    }
    $candidate = Get-ChildItem -LiteralPath $directory -Filter "swu-deck-builder-*.zip" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($null -eq $candidate) {
        Fail-Deploy "no service bundle found in $directory"
    }
    return $candidate.FullName
}

function Invoke-RemoteCommand {
    param(
        [string[]]$BaseArguments,
        [string]$Remote,
        [string]$Command
    )

    $arguments = @()
    $arguments += $BaseArguments
    $arguments += $Remote
    $arguments += $Command
    Invoke-Checked "ssh" $arguments
}

$repoRoot = Resolve-RepoRoot
Set-Location -LiteralPath $repoRoot

if ([string]::IsNullOrWhiteSpace($IdentityFile)) {
    $IdentityFile = Join-Path $env:USERPROFILE ".ssh\swu_deck_builder_deploy_ed25519"
}
if (-not (Test-Path -LiteralPath $IdentityFile)) {
    Fail-Deploy "identity file not found: $IdentityFile"
}
$IdentityFile = (Resolve-Path -LiteralPath $IdentityFile).Path

$hostKeyPolicy = if ($AcceptNewHostKey) { "accept-new" } else { "yes" }
$sshBaseArguments = @(
    "-i", $IdentityFile,
    "-p", $Port.ToString(),
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=$hostKeyPolicy"
)
$remote = "$User@$HostName"

if ($Status) {
    Invoke-RemoteCommand $sshBaseArguments $remote "status"
    exit 0
}
if ($Rollback) {
    Invoke-RemoteCommand $sshBaseArguments $remote "rollback"
    Invoke-RemoteCommand $sshBaseArguments $remote "status"
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Bundle)) {
    if (-not $SkipPackage) {
        Write-DeployLog "building a fresh service bundle"
        Invoke-Checked "powershell" @(
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", (Join-Path $repoRoot "scripts\package-service.ps1")
        )
    }
    $Bundle = Get-NewestBundle $repoRoot
}
if (-not (Test-Path -LiteralPath $Bundle)) {
    Fail-Deploy "bundle not found: $Bundle"
}
$Bundle = (Resolve-Path -LiteralPath $Bundle).Path
$bundleName = Split-Path -Leaf $Bundle
if ($bundleName -notmatch '^swu-deck-builder-[0-9A-Za-z._-]+-b[0-9]+\.zip$') {
    Fail-Deploy "bundle filename is not valid for the restricted upload hook: $bundleName"
}
$checksum = Get-Sha256 $Bundle

if (-not $SkipUpload) {
    Write-DeployLog "uploading $bundleName"
    $scpArguments = @(
        "-O",
        "-i", $IdentityFile,
        "-P", $Port.ToString(),
        "-o", "IdentitiesOnly=yes",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=$hostKeyPolicy",
        $Bundle,
        "${remote}:$remoteInbox/$bundleName"
    )
    Invoke-Checked "scp" $scpArguments
} else {
    Write-DeployLog "using the pre-staged remote bundle $bundleName"
}

if ($UploadOnly) {
    Write-DeployLog "upload complete"
    exit 0
}

if (-not $NoPreflight) {
    Write-DeployLog "running remote preflight"
    Invoke-RemoteCommand $sshBaseArguments $remote "preflight $bundleName $checksum"
}
if ($PreflightOnly) {
    Write-DeployLog "preflight complete"
    exit 0
}

$deployCommand = "deploy $bundleName $checksum"
if ($AllowDowngrade) {
    $deployCommand += " allow-downgrade"
}
Write-DeployLog "installing the service"
Invoke-RemoteCommand $sshBaseArguments $remote $deployCommand
Write-DeployLog "checking service status"
Invoke-RemoteCommand $sshBaseArguments $remote "status"
Write-DeployLog "deployment complete"
