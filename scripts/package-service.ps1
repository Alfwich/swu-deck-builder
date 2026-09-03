param(
    [string]$OutputDirectory = "",
    [switch]$SkipValidation,
    [switch]$RequireClean
)

$ErrorActionPreference = "Stop"

function Write-PackageLog {
    param([string]$Message)
    Write-Host "[swu-package] $Message"
}

function Fail-Package {
    param([string]$Message)
    throw "[swu-package] $Message"
}

function Invoke-Checked {
    param(
        [string]$Tool,
        [string[]]$Arguments
    )

    & $Tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        Fail-Package "$Tool failed with exit code $LASTEXITCODE"
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

function New-PosixZip {
    param(
        [string]$SourceDirectory,
        [string]$DestinationPath
    )

    Add-Type -AssemblyName System.IO.Compression
    $sourceRoot = [System.IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\', '/')
    $output = [System.IO.File]::Open(
        $DestinationPath,
        [System.IO.FileMode]::Create,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )
    $archive = New-Object System.IO.Compression.ZipArchive(
        $output,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    try {
        Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | ForEach-Object {
            $relativePath = $_.FullName.Substring($sourceRoot.Length).TrimStart('\', '/').Replace('\', '/')
            $entry = $archive.CreateEntry(
                $relativePath,
                [System.IO.Compression.CompressionLevel]::Optimal
            )
            $entry.LastWriteTime = $_.LastWriteTimeUtc
            $input = [System.IO.File]::OpenRead($_.FullName)
            $entryOutput = $entry.Open()
            try {
                $input.CopyTo($entryOutput)
            } finally {
                $entryOutput.Dispose()
                $input.Dispose()
            }
        }
    } finally {
        $archive.Dispose()
        $output.Dispose()
    }
}

function Test-ServiceBundle {
    param([string]$BundlePath)

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($BundlePath)
    try {
        $entries = @($archive.Entries | ForEach-Object FullName)
        $required = @(
            "manifest.json",
            "LICENSE",
            "package.json",
            "package-lock.json",
            "dist/index.html",
            "server/index.mjs",
            "shared/deck-history-format.mjs",
            "data/catalog.json",
            "data/agent/catalog.txt"
        )
        foreach ($requiredEntry in $required) {
            if ($requiredEntry -notin $entries) {
                Fail-Package "generated bundle is missing $requiredEntry"
            }
        }
        foreach ($entry in $entries) {
            if ($entry.Contains("\") -or $entry.StartsWith("/") -or $entry -match '(^|/)\.\.(/|$)') {
                Fail-Package "generated bundle contains an unsafe or non-POSIX path: $entry"
            }
            if ($entry -match '(^|/)(\.env($|\.)|openai-file-cache\.json$)' -or
                $entry -match '\.sqlite(-wal|-shm)?$' -or
                $entry.StartsWith("deploy/") -or
                $entry.StartsWith("ops/deploy/")) {
                Fail-Package "generated bundle contains a forbidden deployment or secret-bearing file: $entry"
            }
        }

        $packageEntry = $archive.GetEntry("package.json")
        $packageStream = $packageEntry.Open()
        $packageReader = [System.IO.StreamReader]::new($packageStream)
        try {
            $bundledPackage = $packageReader.ReadToEnd() | ConvertFrom-Json
        } finally {
            $packageReader.Dispose()
            $packageStream.Dispose()
        }
        if ([string]$bundledPackage.main -ne "server/index.mjs") {
            Fail-Package "generated bundle does not declare the safe server entrypoint"
        }
    } finally {
        $archive.Dispose()
    }
}

function Copy-RequiredItem {
    param(
        [string]$Source,
        [string]$Destination
    )

    if (-not (Test-Path -LiteralPath $Source)) {
        Fail-Package "required package input is missing: $Source"
    }
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse
}

$repoRoot = Resolve-RepoRoot
Set-Location -LiteralPath $repoRoot

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot "artifacts\service"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputDirectory)) {
    $OutputDirectory = Join-Path $repoRoot $OutputDirectory
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

$gitStatus = (& git status --porcelain) -join "`n"
if ($LASTEXITCODE -ne 0) {
    Fail-Package "git status failed"
}
$sourceDirty = -not [string]::IsNullOrWhiteSpace($gitStatus)
if ($RequireClean -and $sourceDirty) {
    Fail-Package "the working tree is dirty; commit or stash changes before packaging"
}
if ($sourceDirty) {
    Write-PackageLog "warning: packaging a dirty working tree"
}

if (-not $SkipValidation) {
    Write-PackageLog "running tests"
    Invoke-Checked "npm" @("test")
    Write-PackageLog "packing the browser catalog"
    Invoke-Checked "npm" @("run", "catalog:pack")
    Write-PackageLog "building the agent CSV-formatted text catalog"
    Invoke-Checked "npm" @("run", "catalog:agent")
    Write-PackageLog "building the production site"
    Invoke-Checked "npm" @("run", "build")
}

$packageJson = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
if ($version -notmatch '^[0-9A-Za-z][0-9A-Za-z._-]*$') {
    Fail-Package "package version contains unsupported filename characters: $version"
}
$buildNumber = (& git rev-list --count HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $buildNumber -notmatch '^[0-9]+$') {
    Fail-Package "could not derive a numeric build number from git"
}
$commit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $commit -notmatch '^[0-9a-fA-F]{40}$') {
    Fail-Package "could not resolve the source commit"
}

$bundleBaseName = "swu-deck-builder-$version-b$buildNumber"
$bundleName = "$bundleBaseName.zip"
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$bundlePath = Join-Path $OutputDirectory $bundleName
$checksumPath = "$bundlePath.sha256"

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("swu-deck-builder-package-" + [guid]::NewGuid().ToString("N"))
$stagingRoot = Join-Path $temporaryRoot $bundleBaseName
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

try {
    Write-PackageLog "staging service files"
    Copy-RequiredItem (Join-Path $repoRoot "dist") (Join-Path $stagingRoot "dist")
    Copy-RequiredItem (Join-Path $repoRoot "server") (Join-Path $stagingRoot "server")
    Copy-RequiredItem (Join-Path $repoRoot "shared") (Join-Path $stagingRoot "shared")
    Copy-RequiredItem (Join-Path $repoRoot "package.json") (Join-Path $stagingRoot "package.json")
    Copy-RequiredItem (Join-Path $repoRoot "package-lock.json") (Join-Path $stagingRoot "package-lock.json")
    Copy-RequiredItem (Join-Path $repoRoot "README.md") (Join-Path $stagingRoot "README.md")
    Copy-RequiredItem (Join-Path $repoRoot "LICENSE") (Join-Path $stagingRoot "LICENSE")

    # Electron requires desktop/main.mjs in the repository package manifest,
    # while the restricted Linux deployer requires an explicit server entrypoint.
    $servicePackageJson = Get-Content -LiteralPath (Join-Path $stagingRoot "package.json") -Raw | ConvertFrom-Json
    $servicePackageJson.main = "server/index.mjs"
    $servicePackageJson | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $stagingRoot "package.json") -Encoding utf8

    $stagedDataDirectory = Join-Path $stagingRoot "data"
    $stagedAgentDirectory = Join-Path $stagedDataDirectory "agent"
    New-Item -ItemType Directory -Path $stagedAgentDirectory -Force | Out-Null
    Copy-RequiredItem (Join-Path $repoRoot "data\catalog.json") (Join-Path $stagedDataDirectory "catalog.json")
    Copy-RequiredItem (Join-Path $repoRoot "data\agent\catalog.txt") (Join-Path $stagedAgentDirectory "catalog.txt")

    $manifest = [ordered]@{
        name = "swu-deck-builder"
        version = $version
        build_number = [int64]$buildNumber
        commit = $commit.ToLowerInvariant()
        source_dirty = $sourceDirty
        generated_at_utc = [DateTime]::UtcNow.ToString("o")
        node_minimum_major = 20
        health_path = "/healthz"
    }
    $manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stagingRoot "manifest.json") -Encoding utf8

    if (Test-Path -LiteralPath $bundlePath) {
        Remove-Item -LiteralPath $bundlePath
    }
    New-PosixZip $stagingRoot $bundlePath
    Test-ServiceBundle $bundlePath

    $checksum = Get-Sha256 $bundlePath
    "$checksum  $bundleName" | Set-Content -LiteralPath $checksumPath -Encoding ascii
    Write-PackageLog "bundle ready: $bundlePath"
    Write-PackageLog "sha256: $checksum"
} finally {
    $resolvedTempRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
    $systemTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
    if ($resolvedTempRoot.StartsWith($systemTempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
        $resolvedTempRoot -ne $systemTempRoot -and
        (Test-Path -LiteralPath $resolvedTempRoot)) {
        Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
    }
}

[pscustomobject]@{
    Bundle = $bundlePath
    Checksum = $checksumPath
    Version = $version
    BuildNumber = [int64]$buildNumber
    SourceDirty = $sourceDirty
}
