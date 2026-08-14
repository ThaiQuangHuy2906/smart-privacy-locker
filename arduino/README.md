# Arduino IDE build of Smart Privacy Locker

`SmartPrivacyLocker/` is the Arduino IDE-compatible mirror of the production
firmware in `../firmware/`. The primary `.ino` intentionally contains only
dependency includes; `setup()` and `loop()` remain in `main.cpp` so the same
modular C++ code is compiled by Arduino IDE and PlatformIO. The C++ files are
kept at the sketch root so they are visible as normal tabs in Arduino IDE.

## Source-of-truth rule

Edit production code only under `firmware/src` and `firmware/include`, then
refresh and verify this mirror from the repository root:

```powershell
.\arduino\sync-sketch.ps1
.\arduino\sync-sketch.ps1 -Check
```

`app_config.h` and `private/secrets.local.h` are local, ignored files. The
tracked Arduino `secrets.h` is only a safe wrapper that falls back to
`secrets.example.h`. To copy the existing ignored firmware configuration into
the Arduino sketch without displaying its contents:

```powershell
.\arduino\sync-sketch.ps1 -IncludeLocalConfig
```

Never commit either local file or include credentials in screenshots/logs.

## Reproducible target

- Arduino IDE: 2.3.10 or a compatible 2.x release
- Board package: `esp32 by Espressif Systems` 2.0.17
- Board: `ESP32 Dev Module`
- Core Debug Level: `Info`
- Serial monitor: 115200 baud

`SmartPrivacyLocker/sketch.yaml` pins the board package and all direct and
transitive libraries for an isolated Arduino CLI verification build. Arduino
IDE users must still select the documented package/library versions in Boards
Manager and Library Manager.

Prepare or repair the Arduino IDE's global core/library environment (this may
change the active ESP32/library versions used by other sketches on the machine):

```powershell
.\arduino\setup-arduino-ide.ps1
```

On a fresh installation, start Arduino IDE once and close it before running
the script so the IDE-owned `arduino-cli.yaml` exists.

Verify the exact global environment used by the Arduino IDE GUI:

```powershell
.\arduino\verify-arduino-ide.ps1
```

Run the isolated verification from the repository root:

```powershell
.\arduino\verify-sketch.ps1
```
