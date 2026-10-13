# Fit Meter Lifecycle — Setup & Transfer

This document is the precise, end-to-end reference for the two things the
reverse engineering was built to do:

1. **Set up a NEW Fit Meter** on an account (pairing).
2. **Transfer data to an ALREADY-linked account** (daily sync).

It is the most important artifact of the RE: it ties the wire protocol
(`WireProtocol.md`) to the console's behaviour (`HowTheyTalk.md`) and to the
code we actually ship (`fitmeter.py` + the Cemu plugin). Every claim is
labelled **[verified]** (byte-confirmed against the real capture
`fms-1551470126.txt`, transcribed in `docs/17`), **[symbol]** (taken from the
decompiled `Step.elf` SAMU function names — the function exists, its body is
not fully decompiled), or **[emulation]** (how our code behaves; may differ
from real hardware).

> The real capture (`fitmetersync-master/testing/fms-1551470126.txt`) is
> included in this repo, restored from the fitmetersync project. Everything
> below marked "[verified]" comes from it (see [Sources](./Sources.md)).

---

## 1. The two paths at a glance

| | New-meter setup (Pairing) | Transfer to linked account (Sync) |
|---|---|---|
| Console SAMU mode | `StartPairingMode` → `SAMUPairing_*` **[symbol]** | `StartReceiveMode` → `SAMUReceive_*` **[symbol]** |
| Who drives the data | Console **SENDS** to meter (`f4 cmd|0x80`) **[verified]** | Console **REQUESTS** from meter (`f4 cmd&0x7f`) **[verified]** |
| Verified on hardware? | No real pairing capture exists **[emulation]** | Yes — the `fms` capture is exactly this **[verified]** |
| Console writes to account save? | Writes identity binding (ident, time, store CRC) **[symbol]** | Writes daily data (METs/Height/Tag/Calorie/Steps) **[symbol+verified]** |
| Our code status | Implemented, `unverified_on_hardware` **[emulation]** | Replayed byte-for-byte from capture **[verified]** |

Both paths share the **same physical + link bring-up** (section 3). They
diverge only in which `f4` commands the console issues and whether it pushes
or pulls data.

---

## 2. Wire frame recap (verified — full detail in `WireProtocol.md`)

```
A5 <sessionId> <flags> [<dataSize_hi> if LARGE] <prefix:2> <msg…> <crc8>
```

- `A5` sync, `sessionId` (0x00 pre-connect, 0xEB meter, 0x02/0x08 console).
- `flags`: bit7 `0x80` SETUP, bit6 `0x40` LARGE, bits0-5 `0x3F` small size.
- `prefix` 2 bytes present on **all** non-SETUP frames; **NOT** a CRC16 and
  **NOT** the reply size (ruled out in `docs/17` §3). Semantics unresolved.
- `msg` opcodes: `f4` command, `f1` data chunk, `f2`/`f3` ack/status.
- `crc8` poly `0x07`, init `0x00`, MSB-first, over the **whole** frame
  including `A5`. Verified 10/10.
- App-layer obfuscation: **XOR-0xAA** applied to `f0`/`f1` **data payload
  only** — never to `f4` commands, `f2`/`f3` acks, or framing.

Roles **[verified from IRCUConnect]**:
- Console = initiator (mode 0): **waits to receive a single `0xF3`** first.
- Meter = acceptor (mode 1): **sends `0xF3`** as its opening frame.

---

## 3. Physical + link bring-up (identical for both paths)

1. Wii Fit U opens the GamePad IR sensor (`IrDA-SIR`, **115200 bps**).
   The meter is a passive IR device — **not Bluetooth** `[verified]`.
2. **Meter → Console**: open frame
   `a5 00 84 01 03 04 eb f9` — SETUP, size 4, assigns itself id `0xEB`.
3. **Console → Meter**: open-ack
   `a5 02 81 02 ca` — SETUP, size 1, console id `0x02`.
4. **Meter → Console**: first unsolicited frame is status `0xF3`
   `a5 eb 03 00 00 f3 33` (param `00 00`, opcode `f3`).
   This is the moment the console was waiting for; the link is now up.
5. The console begins issuing `f4` commands. From here the two paths split.

Close frame (either side): `a5 02 81 0f e9` (SETUP, data `0x0F`).

---

## 4. Path A — Set up a NEW Fit Meter (pairing)

> **Status: [symbol] + [emulation].** No real pairing capture exists in the
> repo. The command sequence below is reconstructed from the `SAMUPairing_*`
> function names and from `meter_protocol.py`'s SEND-side map
> (`_on_console_data_complete`). Our emulator implements it but flags every
> setup frame `unverified_on_hardware`.

### 4.1 What the console does
1. Bring up the link (section 3).
2. **Read ident** — `f4 0x00 <be16>` (request). Meter returns its 9-byte
   ident: `{u32 saveDataID | u32 samuID | u8 registered}`. An unregistered
   meter carries `registered != 0` (`0x01`). `[emulation]`
3. **Assign ident** — `f4 0x80 0x00 <be16>` (console SENDS). Payload 9 bytes;
   the console writes `registered = 0` (linked). Maps to
   `ReceiveIdentData` → `SetIdentData` → `setSAMUID` / `setSAMUID`. `[symbol]`
4. **Send time** — `f4 0x80 0x01 <be16>`, 6 bytes
   `{registered(0) | year-2000 | month+1 | day | hour | minute}`. Maps to
   `ReceiveTimeData` → `SetTime`. `[symbol+emulation]`
5. **Write registration archives** — `f4 0x80 0x02`, `0x80 0x03`,
   `0x80 0x04` (large chunks). Personal/history baseline pushed to the
   meter. `[emulation]`

   The archive set is built by the decompiled `SAMUSequence_SendInitialData`
   encoder (`jet::SAMUSeq`, `ActiveMassmeter` module):
   `__AddTimeData`, `__AddLocalizeLangData`, `__AddPersonalData`,
   `__AddMiiIconData`, `__AddIdentData` — each produces one `BinContainer`
   (20-byte record `{ptr, size, flags, ?, allocator}`). `[symbol]`
6. **Write personal data** — `SAMUSequence_WritePersonalData` →
   `SetPersonalData` / `SetMiiInfoData`. `[symbol]`
7. **Bind the meter to the account** — `setSAMUFirstPairingDate` and
   `setSAMUStoreDataCRC`. The `storeDataCRC` is the actual linking key
   (see section 6). `[symbol]`
8. After step 7 the meter satisfies `IsPairingSAMU` / `IsMyselfSAMU`. Pairing
   is complete; subsequent sessions use Path B.

The 9-byte ident record (from `SetIdentData`, `Step.rpx`): bytes 0–3
`saveDataID`, bytes 4–7 `crcXorTime = CalcCrc32(10-byte id block) XOR
calendarTime32`, byte 8 the `registered` flag (`0xFF` default, `0x00`
linked). `[symbol]`

### 4.2 What our emulator does (Path A)
`MeterEmulator.on_console_frame` handles `f4 cmd|0x80` by:
- acking with a single `F2` (`pending_cmd_ack`), then buffering the console's
  `f0`/`f1` chunks (XOR-0xAA stripped),
- on final `f1` calling `_on_console_data_complete`, which stores
  ident/time into the account file (`accounts/<name>.json`) and, for cmd `0x00`, echoes the
  registered ident back as confirmation.

This is the only part of the emulator marked `unverified_on_hardware`.

---

## 5. Path B — Transfer to an ALREADY-linked account (daily sync)

> **Status: [verified].** This is exactly the `fms-1551470126.txt` capture.

### 5.1 What the console does
1. Bring up the link (section 3).
2. **Verify identity** — `getSAMUStoreDataCRC` / `IsMyselfSAMU`: the meter's
   stored CRC must match the account's record. If it matches, the session is
   a sync (Path B); if not, the console would enter pairing (Path A) instead.
   `[symbol]`
3. **Request the data buffers** (`f4 cmd&0x7f <be16 param>`), each answered by
   the meter with chunked `f1` frames (XOR-0xAA) ending in a final `F3`
   "send complete":

   | cmd | Request | Payload | Console sink |
   |-----|---------|---------|--------------|
   | `0x01` | time | 6 B | `ReceiveTimeData` |
   | `0x02` | 7-day METs stream | 10080 B (u8/min, 0xFF empty) | `SaveMETs` |
   | `0x03` | 7-day Height stream | 10080 B | `SaveHeight` |
   | `0x04` | 7-day ActivityTag stream | 10080 B | `SaveActivityTag` |
   | `0x05` | daily calories | 120 B (60 u16, 0xFFFF empty) | `SaveCalorie` |
   | `0x06` | daily steps | 120 B (60 u16, 0xFFFF empty) | `SaveSteps` |

   The `param` (be16) is the requested window size: `0x2760` = 10080 = full
   7-day window; smaller values = incremental sync of the last N minutes.
   `[verified, meter_protocol.py]`

4. **Bulk receive** — `ProcessBulkReceive` into five `AllocReceiveBuffers`
   (`ReceiveBuffers`), then the `saveMETs/Height/Steps/Calorie/Tag` family
   writes into the account's `RPHealthSaveManager` / `RPStepSAMUData` save.
   `[symbol]`
5. **Write-back (observed)** — the capture also shows the console *pushing*
   `f4 0x85` (`0x80|0x05`) calorie data back to the meter, i.e. the console
   re-sends the merged/computed summary after the sync. `[verified]`

### 5.2 Verified capture handshake (the bytes we replay)

```
Meter  : a5 00 84 01 03 04 eb f9    open, id 0xEB
Wii U  : a5 02 81 02 ca              open-ack, id 0x02
Wii U  : a5 02 03 00 07 f3 18        F3 poll
Meter  : a5 eb 03 00 00 f3 33        F3 reply
Wii U  : a5 02 06 00 07 f4 85 00 00 f0   F4 0x85 = SEND calories(0x05)
Meter  : a5 eb 03 00 00 f3 33        F3 reply
Wii U  : a5 02 06 00 0d f4 01 00 00 8d   F4 0x01 = REQ time
Meter  : a5 eb 03 00 00 f2 34        F2 ack
Wii U  : a5 02 06 00 1e f4 02 00 17 c1   F4 0x02 = REQ METs (23 B)
Meter  : a5 eb 0e 00 12 f1 8c aa ab 2a ab b8 aa 2a 85 aa ab   F1 small record
Wii U  : a5 02 06 00 80 f4 06 00 78 97   F4 0x06 = REQ steps
Meter  : a5 eb 0e 00 12 f1 a8 a8 af aa a8 a8 b0 aa a8 ae aa df   F1 small record
Meter  : a5 eb 40 7b 80 f4 f1 …(123 B)… 05   F1 LARGE record A
Meter  : a5 eb 40 7b 80 f4 f1 …(123 B)… 05   F1 LARGE record B
Wii U  : a5 02 81 0f e9              close
Meter  : a5 eb 40 7b 80 f4 f1 …(123 B)… d4   F1 LARGE record C (final)
```

CRC-8 poly `0x07` verified on every frame. `[verified, docs/17 §D]`

### 5.3 What our emulator does (Path B)
The transfer path replays the captured Meter→Console frames **byte-for-byte**
(`MeterEmulator._load_capture` + `next_response`). No live decoding is
required — the meter side is a deterministic state machine that emits the
next recorded frame on each console RECEIVE poll. This is the path that works
today without any hardware.

---

## 6. How the console tells a NEW meter from a LINKED one

The linking identity is a small tuple stored on both the meter and the
account save, managed by these symbols `[symbol]`:

- `samuID` (u32) — `getSAMUID` / `setSAMUID`
- `saveDataID` (u32) — part of the ident
- `registered` byte — `0` once paired
- `storeDataCRC` — `getSAMUStoreDataCRC` / `setSAMUStoreDataCRC`

The console decides the path with:
- `IsRegisteredIdentData` / `IsRegisteredTimeData` — has the meter been set up?
- `IsMyselfSAMU` — does the meter's `storeDataCRC` equal this account's?
- `IsPairingSAMU` — is this the meter currently being paired?

**The `storeDataCRC` is the binding key.** Pairing (Path A) writes it; sync
(Path B) checks it. A meter whose CRC does not match is treated as new and
routed to pairing. There is **no encryption and no account password** on the
link — identity is just this CRC, which is why a full emulation is possible.
`[verified in principle, docs/05 + HowTheyTalk.md]`

---

## 7. What we actually use (summary)

| Component | File | Role | Confidence |
|---|---|---|---|
| Wire codec + state machine | `meter_protocol.py` (`MeterEmulator`) | Emulates the meter side; parses/ builds A5 frames, handles `f4`/`f1`/`f2`/`f3`, persists the account file | verified codec, [emulation] setup path |
| Transfer replay | `meter_protocol.py` + capture transcriptions | Byte-exact daily sync | [verified] |
| Plugin glue | `src/` (Cemu plugin) | Polls `CCRCDCPerIrdaControl(RECEIVE)`, feeds `on_console_frame`, emits `next_response` | [emulation] |
| Mii decode | `mii_decode.py` | Decodes the Mii block (`MiiFormat.md`) | [verified] |
| Day data | `day_data.py` | 7-day 10080-byte streams, 120-byte daily summaries | [verified] |

---

## 8. Caveats / open questions

- **2-byte prefix**: present on every non-SETUP frame, but its semantics are
  unresolved (`docs/17` §3 rules out CRC16 and reply-size). Our code keeps the
  field but does not interpret it.
- **Inner checksum in `f1` data**: the trailing 2 bytes of small `f1` records
  are inconsistent as a CRC16 — unresolved.
- **Real pairing capture**: there is **no** `fms-*` pairing session in the
  repo, so Path A is reconstructed, not observed. Treat section 4 as the
  best-known reconstruction.
- **Pairing-vs-sync trigger**: which menu choice in Wii Fit U selects pairing
  vs receive is a UI behaviour, out of RE scope. At the protocol level the
  distinction is purely "console SENDS (0x80) vs console REQUESTS
  (0x7f)" plus the `storeDataCRC` check.
- **F3 internal structure**: the 2-byte param before the `f3` opcode is not
  fully decoded; only its role as status/heartbeat/ack is confirmed.
