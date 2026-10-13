# Sources & Reverse-Engineering References

Everything in this documentation is derived from the following public
sources and from original reverse engineering. Addresses refer to
`Step.rpx` (Wii Fit U, PPC big-endian) unless stated otherwise.

## 1. Public projects

| Project | Author | License | Used for |
|---------|--------|---------|----------|
| [fitmetersync](https://github.com/HenkKalkwater/fitmetersync) | Henk Kalkwater | GPL-3.0 | First public protocol documentation (IR link layer, A5 frame, handshake); the reference capture `testing/fms-1551470126.txt` (a real Fit Meter ↔ Wii U transfer session). |
| [FFL.js](https://github.com/ariankordi/FFL.js) | Arian Kordi (port of AboodXD's FFL decompilation) | AGPL-3.0 | Pixel-perfect Mii rendering (FFL engine port, headless WebGPU example). |
| [FFL-Testing](https://github.com/ariankordi/FFL-Testing) | Arian Kordi | — | Hosted FFL renderer (C++), FFL resource handling reference. |
| [WheelWizard](https://github.com/TeamWheelWizard/WheelWizard) | Team WheelWizard | — | Where to obtain the FFL resource: `WheelWizard/Features/MiiRendering/` downloads the Miitomo asset archive and extracts `AFLResHigh_2_3.dat`. |
| [Cemu](https://github.com/cemu-project/Cemu) | Cemu project | — | `src/Cafe/OS/RPL/rpl_structs.h`: the RPL container header layout used to map virtual addresses to file offsets in `Step.rpx`. |
| [mii-js](https://github.com/Barakat/mii-js) (vendored in mii-creator-dev) | Barakat | — | Bit-exact Mii Studio data encode/decode; the source of this project's character-record decoder. |
| [Wii U plugin system (WUPS)](https://github.com/wiiu-env/WiiUPluginSystem) | wiiu-env | — | Plugin framework used to hook the IR driver on the console. |
| [wut](https://github.com/devkitPro/wut) | devkitPro | — | Wii U Toolchain: `nsysccr`/`irda.h` IR structures. |

## 2. Assets needed for rendering

| Asset | What it is | How it is obtained |
|-------|-----------|--------------------|
| `FFLResHigh.dat` (= `AFLResHigh_2_3.dat`) | The FFL resource archive: the meshes and textures the character renderer needs | **Supplied by the user.** Dump it from hardware or an installed title you own, then point the desktop tool or the Android app at your copy. It is stored locally (`GUI/ffl_renderer/`, or app-private storage) and never committed, bundled or transmitted. |

The FFL resource is Nintendo-copyrighted data, so it is neither shipped nor
downloaded by this project. Without it, both applications fall back to a neutral
placeholder rather than attempting to reproduce the appearance another way.

Earlier revisions composited profile heads from the Mii Studio texture atlas by
fetching it from Nintendo's CDN, and `mii_decode` could build a URL for a
third-party rendering service. Both were removed: nothing profile-related leaves
the machine. See `THIRD_PARTY_NOTICES.md`.

## 3. Reverse-engineered addresses (`Step.rpx`, Wii Fit U)

| Symbol | Address | Purpose |
|--------|---------|---------|
| `GetDatePos` (u8) | `0x023265fc` | Scans the 10080-byte buffer backwards for the `0xFD`/`0xFC` marker; returns `marker_pos - 13`. |
| `GetDatePos` (u16) | `0x0232b578` | Same for the 120-byte daily blocks. |
| `SaveU8Data` | `0x0232aef4` | Parses a minute buffer: marker/date handling, 0xFF backward scan, type dispatch. |
| `SaveU16Data` | `0x0232bebc` | Parses the daily (u16) blocks. |
| METs write (type 2) | `0x02327a24` | RLE expansion of the wire stream and the day-slot copy loop (`buf[k]` → minute `tail_minute - k`). |
| Height write (type 3) | `0x02328ce0` | Same, for the 7-bit delta stream. |
| Tag write (type 4) | `0x02329f80` | Same, for the activity tags. |
| `GetSaveDataIndexWithClearData` | `0x0232687c` | Finds/creates the save slot for a day date; aborts the copy when the day-walk revisits the current slot. |
| date pack (`(y<<9)\|(m<<5)\|d`) | `0x022c76a0` | Packs year/month/day into the console's `u16` day code. |
| date unpack (u32 → fields) | `0x022c76c4` | Unpacks the console's `u32` date (year<<20 \| month<<16 \| day<<11 \| hour<<6 \| minute) into `[year, month, day, hour, minute]`. |
| date −1 day | `0x022c807c` | The "data crosses midnight" day shift. |

Mapping virtual address → file offset: the RPL header (`rplHeaderNew_t`,
see Cemu above) exposes the section table at file offset `0x40`; the
`.text` section is at VA `0x02000020`, file offset `0xA100C0`, size
`0xB3BCF8`.

## 4. Wire/application layer constants (verified)

- Frame: `A5 <session> <flags> [<size8>] <receiveSize:2> <data> <crc8>`.
- CRC-8: poly `0x07`, init `0x00`, MSB-first, over the whole frame
  including `A5`.
- session ids: `0xEB` meter, `0x02`/`0x08` console.
- Ops: `f4` command, `f0`/`f1` chunks, `f2`/`f3` acks, `f5` resend.
- Bulk payloads (registration archives, day buffers) are XOR-`0xAA`
  obfuscated at the application layer.
- Mii CRC-16: poly `0x1021`, init `0x0000`, MSB-first, over bytes
  `0x00..0x5D` + 16 zero bits, stored big-endian at `0x5E..0x5F`.

## 5. Reference captures

- `fitmetersync-master/testing/fms-1551470126.txt` — a real Fit Meter ↔
  Wii U IR session (handshake, time sync, `f4 0x01..0x06` commands,
  incremental sync params such as `0x029d` = 669 bytes). Restored from
  the fitmetersync repository.
