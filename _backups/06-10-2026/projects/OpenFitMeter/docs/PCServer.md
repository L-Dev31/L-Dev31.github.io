# PC Server — fitmeter.py + MeterEmulator

## Role

The Python program `fitmeter.py` runs on the PC. It:
- opens a **TCP server** (see [PluginArchitecture](./PluginArchitecture.md));
- **emulates the Fit Meter** via `MeterEmulator`;
- replies to the Wii U console's frames with the stored data (METs, steps, height,
  Mii…) in the exact binary format the game expects.

## TCP server

- **Host:** `0.0.0.0` — **Port:** `8476`.
- **One client** at a time (the plugin).
- Loop: receives 2 length bytes, then the payload;
  `payload[0]` = control byte (`ctrl`), `payload[1:]` = data.
- Reply: `2 length bytes + data` (length 0 = nothing to serve).
- Control bytes: `0x00` CONNECT, `0x01` SEND, `0x02` RECEIVE, `0x03` DISCONNECT.

### Message dispatch

| `ctrl` | Action |
|--------|--------|
| CONNECT | `em.start_session()`; returns `next_meter_frame()` (the initial `0xF3` frame). |
| DISCONNECT | `em.reset()`; returns `b''`. |
| SEND | wraps data in `Frame`, if valid `em.on_console_frame(data)`, returns `next_meter_frame()`. |
| RECEIVE | returns `next_meter_frame()`. |

## MeterEmulator

`MeterEmulator` is the **meter state model**:

- `start_session()`: starts a session.
- `reset()`: resets the state.
- `on_console_frame(data)`: processes a frame received from the console and updates
  the internal state.
- `next_response()` / `next_meter_frame()`: produces the **next meter frame** to
  return (or `b''` if there is nothing).

### Playback (custom) mode

- In "custom" mode, if a manually loaded packet queue (`packet_queue`) is not
  empty, `next_meter_frame()` replays the next packet from it.
- Otherwise it uses the response computed by `em.next_response()`.

## `Frame` class

- Parses a raw A5 frame (see [WireProtocol](./WireProtocol.md)).
- Attribute `.ok`: validity (CRC-8 verified).
- The CRC-8 is **auto-corrected on load** of recorded packets if needed.

## Emulated data

The data served to the game comes from the day-plan module (`day_plan.py`,
see [DailyData](./DailyData.md)) and the Mii (see [MiiFormat](./MiiFormat.md)).
The server restores them in the exact binary format expected by Wii Fit U,
respecting the application-layer `0xAA` XOR and the wire-layer CRC-8.

### Activity to serve

Activity is authored or imported as an **`openfitmeter.week` document** - the
same schema the Android app reads and writes, described in
[DataFormats](./DataFormats.md). A day is a list of activity segments
(`from`, `to`, `mets`, `altitude_m`); a minute covered by no segment has no
data and is transmitted as an empty minute.

`week_format.py` turns a document into a `WeekPlan`, and `day_plan.py` encodes
that into the three 10080-byte streams plus the per-day totals. When a week is
installed, `f4 0x02/0x03/0x04` serve the encoded buffers (full window or
incremental `param` bytes) and `f4 0x05/0x06` serve the computed daily totals.
Without one, the emulator answers the safe all-empty state (no data, no
corruption).

### Profile rendering

The profile preview renders with **FFL.js** (headless Node.js + software
WebGPU) when the user has provided their own `ffl_renderer/FFLResHigh.dat` and
the Node dependencies are present. Otherwise the panel shows a neutral
placeholder and offers a **Provide FFL resource…** button. Nothing is
downloaded. See [MiiFormat](./MiiFormat.md) and `THIRD_PARTY_NOTICES.md`.

## Persistent state (`accounts/<name>.json`)

One file per account, written in the shared **`openfitmeter.profile`** shape
so the state file doubles as an export (and a profile exported from the phone
can be dropped into `accounts/` as-is). Full field reference in
[DataFormats](./DataFormats.md); the emulator reads and writes:

| Key | Type | Meaning |
|-----|------|---------|
| `ident` | hex string | 9-byte meter ident `{u32 saveDataID | u32 samuID | u8 registered}` (`registered == 0` = linked). |
| `time_data` | hex string | 6-byte time pushed by the console `{registered, year-2000, month, day, hour, minute}`. |
| `pushed` | object | `cmd -> [hex payloads]`: the archives the console pushed, verbatim and still XOR-0xAA obfuscated. The profile shown in the UI is decoded from these. |
| `profile_updated_at` | string | When `pushed` last changed. |
| `calorie_values` | array | per-day calorie totals served for `0x05`. |
| `steps_values` | array | per-day step totals served for `0x06`. |

Each session's archives **replace** the stored copy for the commands it pushed,
rather than being appended: the file stays a fixed size across syncs, and a
profile edited in the game (a changed height, a restyled avatar) supersedes the
copy captured at pairing.

The activity to serve is transient and is set from a week document; see above.
