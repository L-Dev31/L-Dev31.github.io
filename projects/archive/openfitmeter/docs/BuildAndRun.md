# Building & Running

## PC side

Requirements: **Python 3.10+**, [Pillow](https://python-pillow.org/), Tkinter
(included with most Python installs).

```bash
pip install pillow
python fitmeter.py
```

- Starts the TCP server on `0.0.0.0:8476` and opens the GUI.
- Each **account** lives in `accounts/<name>.json` (independent meter
  identity + state); the GUI lets you create/delete/reset accounts and
  switch between them.
- The GUI lets you: inject day totals, edit or import a week of activity,
  export it again, import/export an account profile, render the profile
  (FFL.js, see below), and switch between the state machine and a manual
  packet queue.
- Both file formats are shared with the Android app, so a file exported on
  either side opens on the other unchanged - see
  [DataFormats](./DataFormats.md). `week_demo.json` is the starting template
  loaded into the editor.

### Tests

```bash
python tests/test_meter.py    # wire protocol + state machine
python tests/test_day.py      # minute-stream encoders
python tests/test_mii.py      # profile record decode
python tests/test_plan.py     # activity plans, week document, serving
python tests/test_profile.py  # profile document round trip
```

## Wii U plugin

The WUPS plugin lives in `src/`. It hooks `CCRCDCPerIrdaControl` and
`VPADBASEGetIRCStatus`, forces the IR status bits the game gates on, and
relays every frame over TCP to the PC (see [PluginArchitecture](./PluginArchitecture.md)).

Build with the WUPS toolchain:

```bash
make                       # produces OpenFitMeterHook.wps
```

Deploy `OpenFitMeterHook.wps` to `sd:/wiiu/plugins/` (or the path your loader
uses). The plugin **auto-discovers** the PC over UDP (no IP configuration
needed) and exposes a WUPS config menu (enable/disable, manual IP, port); you
may also pin the address at build time:

```bash
make WIIFIT_SERVER_IP=192.168.0.195 WIIFIT_SERVER_PORT=8476
```

`make.bat` is provided for Windows builds. A debug build emits logs over UDP,
which can be captured on the PC with `GUI/udplogserver.py` (port 4405):

```bash
make DEBUG=1
python GUI/udplogserver.py
```

## Profile rendering (FFL.js)

The renderer lives in `ffl_renderer/` and needs two things:

1. **Your own copy of the FFL resource** `FFLResHigh.dat`
   (= `AFLResHigh_2_3.dat`). It is Nintendo-copyrighted data, so it is not
   shipped with this project and is not downloaded by it: dump it from
   hardware or a title you own. In the GUI use **Provide FFL resource…**,
   which copies it to `ffl_renderer/FFLResHigh.dat`; on Android, Settings ->
   Resources.
2. Node.js dependencies (software WebGPU — no GPU needed):

   ```bash
   cd ffl_renderer
   npm install
   ```

Render on demand:

```bash
node render_mii.js <hexOrBase64ProfileData> out.bmp [width]
```

Without the resource, both applications show a neutral placeholder (the
profile's initial on its favourite colour). There is no texture-compositing
fallback — see [MiiFormat](./MiiFormat.md) and `THIRD_PARTY_NOTICES.md`.

## Reproducing the reverse engineering

The protocol was decoded from the Wii Fit U executable `Step.rpx` (PPC
big-endian). Virtual-address → file-offset mapping uses the RPL section
table at file offset `0x40` (`.text` at VA `0x02000020`, file offset
`0xA100C0`); disassembly used the Capstone PPC backend. The exact function
addresses are listed in [Sources](./Sources.md).
