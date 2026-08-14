[CmdletBinding()]
param(
    [switch]$Check,
    [switch]$IncludeLocalConfig
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$arduinoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositoryRoot = Split-Path -Parent $arduinoRoot
$firmwareSource = Join-Path $repositoryRoot 'firmware\src'
$firmwareInclude = Join-Path $repositoryRoot 'firmware\include'
$sketchSource = Join-Path $arduinoRoot 'SmartPrivacyLocker'
$localNames = @('app_config.h', 'secrets.h')
$localDestinations = @{
    'app_config.h' = Join-Path $sketchSource 'app_config.h'
    'secrets.h' = Join-Path $sketchSource 'private\secrets.local.h'
}

$sourceFiles = @(
    Get-ChildItem -LiteralPath $firmwareSource -File -Filter '*.cpp'
    Get-ChildItem -LiteralPath $firmwareInclude -File -Filter '*.h' |
        Where-Object { $_.Name -notin $localNames }
) | Sort-Object Name

if ($sourceFiles.Count -eq 0) {
    throw 'No firmware source files were found.'
}

if ($Check) {
    if (-not (Test-Path -LiteralPath $sketchSource -PathType Container)) {
        throw "Arduino mirror is missing: $sketchSource"
    }

    $problems = [System.Collections.Generic.List[string]]::new()
    $expectedNames = @($sourceFiles.Name)
    foreach ($sourceFile in $sourceFiles) {
        $target = Join-Path $sketchSource $sourceFile.Name
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
            $problems.Add("missing: $($sourceFile.Name)")
            continue
        }
        $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $sourceFile.FullName).Hash
        $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash
        if ($sourceHash -ne $targetHash) {
            $problems.Add("different: $($sourceFile.Name)")
        }
    }

    Get-ChildItem -LiteralPath $sketchSource -File |
        Where-Object {
            $_.Extension -in @('.cpp', '.h') -and
            $_.Name -notin $expectedNames -and
            $_.Name -notin $localNames
        } |
        ForEach-Object { $problems.Add("unexpected: $($_.Name)") }

    if ($problems.Count -gt 0) {
        throw "Arduino mirror is not synchronized:`n$($problems -join [Environment]::NewLine)"
    }

    Write-Output "Arduino mirror synchronized: $($sourceFiles.Count) tracked source files match."
    exit 0
}

New-Item -ItemType Directory -Force -Path $sketchSource | Out-Null
foreach ($sourceFile in $sourceFiles) {
    Copy-Item -LiteralPath $sourceFile.FullName -Destination (Join-Path $sketchSource $sourceFile.Name) -Force
}

if ($IncludeLocalConfig) {
    foreach ($localName in $localDestinations.Keys) {
        $localSource = Join-Path $firmwareInclude $localName
        if (Test-Path -LiteralPath $localSource -PathType Leaf) {
            $localDestination = $localDestinations[$localName]
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $localDestination) | Out-Null
            Copy-Item -LiteralPath $localSource -Destination $localDestination -Force
        }
    }
}

Write-Output "Arduino mirror updated: $($sourceFiles.Count) tracked source files copied."
if ($IncludeLocalConfig) {
    Write-Output 'Existing ignored local configuration was copied without printing its contents.'
}
