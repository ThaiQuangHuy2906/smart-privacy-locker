# Arduino IDE build of Smart Privacy Locker

> Audit snapshot 2026-08-18: the 32 production mirror files match
> byte-for-byte and the pinned Arduino profile compiles successfully. The local
> as-built configuration uses SG90 latch-lock `80°`, latch-unlock `170°`, a
> 2,000 ms settle deadline, ten WS2812 pixels
> and active-low GPIO26 buzzer. Compile success is software evidence; run the
> physical sequence in
> [../HUONG_DAN_TEST_END_TO_END.md](../HUONG_DAN_TEST_END_TO_END.md).

Current measured isolated build after the door-security correction:

- isolated pinned profile: 1,112,269 program bytes (84%) and 53,608 RAM bytes
  (16%);
- the earlier Arduino IDE-equivalent global result (1,111,201/53,600 bytes)
  predates auto-lock and was not rerun; do not cite it as the current binary.

The profile compiles the same 32 production mirror files checked by the sync
script. This remains software evidence, not physical runtime evidence.

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
