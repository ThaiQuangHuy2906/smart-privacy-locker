[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$wokwiRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Join-Path $wokwiRoot 'smart-privacy-locker-wokwi'
$destination = Join-Path $wokwiRoot 'smart-privacy-locker-wokwi.zip'
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) (
    'smart-privacy-locker-wokwi-{0}.zip' -f [guid]::NewGuid().ToString('N'))

$projectRoot = [System.IO.Path]::GetFullPath($projectRoot)
$destination = [System.IO.Path]::GetFullPath($destination)
$projectPrefix = $projectRoot.TrimEnd('\') + '\'
if (-not (Test-Path -LiteralPath $projectRoot -PathType Container)) {
    throw "Wokwi project directory not found: $projectRoot"
}
if ([System.IO.Path]::GetDirectoryName($destination) -ne
    [System.IO.Path]::GetFullPath($wokwiRoot).TrimEnd('\')) {
    throw "Refusing to write outside the Wokwi directory: $destination"
}

$files = Get-ChildItem -LiteralPath $projectRoot -Recurse -File -Force |
    Where-Object {
        $relative = $_.FullName.Substring($projectPrefix.Length)
        $segments = $relative -split '[\\/]'
        $segments -notcontains '.pio'
    } |
    Sort-Object FullName

$forbidden = $files | Where-Object {
    $_.Name -match '(?i)^(?:\.env|secrets(?:\.local)?\.h|app_config\.h)$' -or
    $_.FullName -match '(?i)[\\/]private[\\/]'
}
if ($forbidden) {
    throw "Refusing to package private/local configuration: $($forbidden.FullName -join ', ')"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$fixedTimestamp = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
$fileStream = $null
$archive = $null
try {
    $fileStream = [System.IO.File]::Open(
        $temporary,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None)
    $archive = [System.IO.Compression.ZipArchive]::new(
        $fileStream,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $false)

    foreach ($file in $files) {
        $relative = $file.FullName.Substring($projectPrefix.Length)
        $entryName = $relative.Replace('\', '/')
        $entry = $archive.CreateEntry(
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal)
        $entry.LastWriteTime = $fixedTimestamp

        $input = [System.IO.File]::OpenRead($file.FullName)
        $output = $entry.Open()
        try {
            $input.CopyTo($output)
        } finally {
            $output.Dispose()
            $input.Dispose()
        }
    }

    $archive.Dispose()
    $archive = $null
    $fileStream.Dispose()
    $fileStream = $null
    Move-Item -LiteralPath $temporary -Destination $destination -Force
} finally {
    if ($archive) { $archive.Dispose() }
    if ($fileStream) { $fileStream.Dispose() }
    if (Test-Path -LiteralPath $temporary) {
        Remove-Item -LiteralPath $temporary -Force
    }
}

$hash = Get-FileHash -LiteralPath $destination -Algorithm SHA256
Write-Output ("Packaged {0} files to {1}" -f $files.Count, $destination)
Write-Output ("SHA-256 {0}" -f $hash.Hash.ToLowerInvariant())
