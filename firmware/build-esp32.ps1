[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9_-]+$')]
    [string]$Environment = 'esp32dev'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$firmwareRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Split-Path -Parent $firmwareRoot
$platformio = Get-Command pio -ErrorAction Stop
$requiresAlias = $repositoryRoot -match '[^\x00-\x7F]'

if (-not $requiresAlias) {
    & $platformio.Source run --project-dir $firmwareRoot --environment $Environment
    if ($LASTEXITCODE -ne 0) {
        throw "PlatformIO build failed with exit code $LASTEXITCODE."
    }
    exit 0
}

$driveLetter = @('Z', 'Y', 'X', 'W', 'V', 'U', 'T') |
    Where-Object { -not (Test-Path -LiteralPath ("{0}:\" -f $_)) } |
    Select-Object -First 1
if (-not $driveLetter) {
    throw 'No unused drive letter is available for the temporary ASCII path.'
}

$drive = "${driveLetter}:"
$mappedFirmware = "${drive}\firmware"
$mapped = $false
$buildExitCode = 1
try {
    & subst.exe $drive $repositoryRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Could not map $drive to the repository."
    }
    $mapped = $true

    $marker = Join-Path $mappedFirmware 'platformio.ini'
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
        throw "Temporary mapping does not resolve to the firmware project: $mappedFirmware"
    }

    & $platformio.Source run --project-dir $mappedFirmware --environment $Environment
    $buildExitCode = $LASTEXITCODE
} finally {
    if ($mapped) {
        & subst.exe $drive /D
        if ($LASTEXITCODE -ne 0) {
            throw "PlatformIO finished, but the temporary mapping $drive could not be removed."
        }
    }
}

if ($buildExitCode -ne 0) {
    throw "PlatformIO build failed with exit code $buildExitCode."
}
