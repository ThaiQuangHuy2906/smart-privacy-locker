[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$arduinoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sketchRoot = Join-Path $arduinoRoot 'SmartPrivacyLocker'
$syncScript = Join-Path $arduinoRoot 'sync-sketch.ps1'

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
    throw 'arduino-cli was not found. Install Arduino IDE 2.x or add arduino-cli to PATH.'
}

$arduinoCli = $cliCandidates[0]
Write-Output "Using Arduino CLI: $arduinoCli"
& $arduinoCli version
if ($LASTEXITCODE -ne 0) {
    throw "arduino-cli version failed with exit code $LASTEXITCODE"
}

& $arduinoCli compile --profile esp32dev_2_0_17 --clean $sketchRoot
if ($LASTEXITCODE -ne 0) {
    throw "Arduino profile build failed with exit code $LASTEXITCODE"
}

Write-Output 'Arduino profile build PASS.'
