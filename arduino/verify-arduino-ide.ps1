[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$arduinoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sketchRoot = Join-Path $arduinoRoot 'SmartPrivacyLocker'
$syncScript = Join-Path $arduinoRoot 'sync-sketch.ps1'
$ideConfig = Join-Path $env:USERPROFILE '.arduinoIDE\arduino-cli.yaml'

& $syncScript -Check

$cliCandidates = @(
    @(
        (Join-Path $env:ProgramFiles 'Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'),
        (Get-Command arduino-cli -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } |
        Select-Object -Unique
)
if ($cliCandidates.Count -eq 0) {
    throw 'arduino-cli was not found. Install Arduino IDE 2.x first.'
}
if (-not (Test-Path -LiteralPath $ideConfig -PathType Leaf)) {
    throw "Arduino IDE config was not found: $ideConfig"
}

$arduinoCli = $cliCandidates[0]
Write-Output "Using Arduino IDE config: $ideConfig"
& $arduinoCli --config-file $ideConfig version
if ($LASTEXITCODE -ne 0) {
    throw "arduino-cli version failed with exit code $LASTEXITCODE"
}

$sketchbookOutput = & $arduinoCli --config-file $ideConfig config get directories.user
if ($LASTEXITCODE -ne 0) {
    throw "Reading Arduino Sketchbook path failed with exit code $LASTEXITCODE"
}
$sketchbookPath = @($sketchbookOutput) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Select-Object -Last 1
if ($null -ne $sketchbookPath) {
    $sketchbookPath = $sketchbookPath.Trim()
}
if ([string]::IsNullOrWhiteSpace($sketchbookPath) -or $sketchbookPath -match '[^\x00-\x7F]') {
    throw "Arduino Sketchbook must use an ASCII-only path for ESP32 core 2.0.17: $sketchbookPath"
}
Write-Output "Arduino Sketchbook: $sketchbookPath"

$coreInventory = ((& $arduinoCli --config-file $ideConfig core list --format json) -join "`n") |
    ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    throw "Arduino core inventory failed with exit code $LASTEXITCODE"
}
$esp32Core = $coreInventory.platforms | Where-Object { $_.id -eq 'esp32:esp32' }
if ($null -eq $esp32Core -or $esp32Core.installed_version -ne '2.0.17') {
    $actualCore = if ($null -eq $esp32Core) { 'missing' } else { $esp32Core.installed_version }
    throw "Expected global esp32:esp32 2.0.17, found $actualCore"
}
Write-Output 'Arduino-ESP32 core: 2.0.17'

$expectedLibraries = [ordered]@{
    'Adafruit BusIO' = '1.17.4'
    'Adafruit Unified Sensor' = '1.1.15'
    'Adafruit GFX Library' = '1.12.1'
    'Adafruit SSD1306' = '2.5.15'
    'Adafruit NeoPixel' = '1.12.5'
    'ArduinoJson' = '7.4.2'
    'PubSubClient' = '2.8.0'
    'WiFiManager' = '2.0.17'
    'ESP32Servo' = '3.0.7'
    'DHT sensor library' = '1.4.6'
}

function Normalize-ArduinoVersion([string]$Version) {
    $parts = [System.Collections.Generic.List[string]]::new()
    foreach ($part in $Version.Split('.')) {
        $parts.Add($part)
    }
    while ($parts.Count -lt 3) {
        $parts.Add('0')
    }
    return $parts -join '.'
}

$libraryInventory = ((& $arduinoCli --config-file $ideConfig lib list --format json) -join "`n") |
    ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
    throw "Arduino library inventory failed with exit code $LASTEXITCODE"
}
foreach ($expectedLibrary in $expectedLibraries.GetEnumerator()) {
    $installed = $libraryInventory.installed_libraries |
        Where-Object { $_.library.name -eq $expectedLibrary.Key -and $_.library.location -eq 'user' } |
        Select-Object -First 1
    if ($null -eq $installed) {
        throw "Required Arduino library is missing: $($expectedLibrary.Key)"
    }
    $actualVersion = Normalize-ArduinoVersion $installed.library.version
    $expectedVersion = Normalize-ArduinoVersion $expectedLibrary.Value
    if ($actualVersion -ne $expectedVersion) {
        throw "Expected $($expectedLibrary.Key) $($expectedLibrary.Value), found $($installed.library.version)"
    }
    Write-Output "$($expectedLibrary.Key): $($installed.library.version)"
}

& $arduinoCli --config-file $ideConfig compile --clean $sketchRoot
if ($LASTEXITCODE -ne 0) {
    throw "Arduino IDE-equivalent build failed with exit code $LASTEXITCODE"
}

Write-Output 'Arduino IDE-equivalent build PASS.'
