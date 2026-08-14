[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

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

$arduinoCli = $cliCandidates[0]
$ideConfig = Join-Path $env:USERPROFILE '.arduinoIDE\arduino-cli.yaml'
if (-not (Test-Path -LiteralPath $ideConfig -PathType Leaf)) {
    throw "Arduino IDE config was not found: $ideConfig. Start Arduino IDE once, close it, then run this script again."
}
$configArguments = @('--config-file', $ideConfig)

Write-Output "Using Arduino CLI: $arduinoCli"
Write-Output "Using Arduino IDE config: $ideConfig"

$sketchbookOutput = & $arduinoCli @configArguments config get directories.user
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
    $sketchbookPath = 'C:\ArduinoSketches'
    & $arduinoCli @configArguments config set directories.user $sketchbookPath
    if ($LASTEXITCODE -ne 0) {
        throw "Setting an ASCII Arduino Sketchbook path failed with exit code $LASTEXITCODE"
    }
    Write-Output "Arduino Sketchbook changed to ASCII path: $sketchbookPath"
}
New-Item -ItemType Directory -Force -Path $sketchbookPath | Out-Null

& $arduinoCli @configArguments core update-index `
    --additional-urls 'https://espressif.github.io/arduino-esp32/package_esp32_index.json'
if ($LASTEXITCODE -ne 0) {
    throw "Arduino index update failed with exit code $LASTEXITCODE"
}

& $arduinoCli @configArguments core install 'esp32:esp32@2.0.17' `
    --additional-urls 'https://espressif.github.io/arduino-esp32/package_esp32_index.json'
if ($LASTEXITCODE -ne 0) {
    throw "Arduino-ESP32 2.0.17 installation failed with exit code $LASTEXITCODE"
}

$libraries = @(
    'Adafruit BusIO@1.17.4',
    'Adafruit Unified Sensor@1.1.15',
    'Adafruit GFX Library@1.12.1',
    'Adafruit SSD1306@2.5.15',
    'Adafruit NeoPixel@1.12.5',
    'ArduinoJson@7.4.2',
    'PubSubClient@2.8.0',
    'WiFiManager@2.0.17',
    'ESP32Servo@3.0.7',
    'DHT sensor library@1.4.6',
    # SSD1306 may install the newest compatible GFX transitively. Pin GFX
    # again last so the final global environment matches the release profile.
    'Adafruit GFX Library@1.12.1'
)

foreach ($library in $libraries) {
    & $arduinoCli @configArguments lib install $library
    if ($LASTEXITCODE -ne 0) {
        throw "Arduino library installation failed for $library with exit code $LASTEXITCODE"
    }
}

& $arduinoCli @configArguments core list
if ($LASTEXITCODE -ne 0) {
    throw "Arduino core inventory failed with exit code $LASTEXITCODE"
}
& $arduinoCli @configArguments lib list
if ($LASTEXITCODE -ne 0) {
    throw "Arduino library inventory failed with exit code $LASTEXITCODE"
}

Write-Output 'Arduino IDE toolchain setup complete. Restart Arduino IDE before use.'
