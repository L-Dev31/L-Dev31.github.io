# Daily Data Format — Complete Reference (verified via Ghidra, 2026-08-21; re-verified 2026-08-22)

This page is the **complete, decompiler-verified** description of how the
Wii U console receives, saves and displays the Fit Meter's daily data. It
supersedes the earlier hypothesis-based version (notably the "23:59 tail"
and "tag = 0xFF everywhere" conventions, both now corrected).

All facts are derived from decompiling `Step.rpx` (Wii Fit U, PPC
big-endian) with the function addresses listed; each claim is traceable to
the cited function.

**2026-08-22 re-verification:** every claim below (RLE format, the
`this+0xD0` console-clock alignment, the "no registration-date filter"
finding, and the 3-way graph gate) was independently re-derived by
decompiling the live functions in Ghidra (via the MCP HTTP bridge on
`:8089`) rather than trusting the prior write-up. All of it checked out
byte-for-byte against the text below. One previously undocumented behavior
was found in the process: §4.6, the save-slot eviction/abort case.

---

## 1. The five daily buffers

The console requests daily data with `f4 <cmd> <param:u16 BE>`:

| cmd | Content | Full size | Encoding |
|-----|---------|-----------|----------|
| `0x02` | **METs** per minute | 10080 B | u8/minute, METs ×10, `0xFF` = empty |
| `0x03` | **Height** per minute | 10080 B | signed 7-bit deltas + RLE |
| `0x04` | **Activity tag** per minute | 10080 B | u8/minute (0..15), `0xFF` = empty |
| `0x05` | **Daily calories** | 120 B | 51 × u16 day slots + 9-u16 tail |
| `0x06` | **Daily steps** | 120 B | 51 × u16 day slots + 9-u16 tail |

`SettingLogReceiveSequence__Q2_3jet7SAMUSeqFb` (`0x02338940`) allocates
5 receive buffers `{10080, 10080, 10080, 120, 120}` (full sync) or
3 buffers `{10080, 10080, 120}` (partial sync).

The `param` is the number of **bytes** to send back:
- `0x2760` (10080) = full 7-day window
- smaller values (`0x029d` = 669, `0x0017` = 23 seen in the capture) =
  incremental syncs of the most recent minutes.

---

## 2. Buffer layout (10080 bytes)

```
[ minute data : 10061 B ][ date : 5 B ][ reserved : 13 B ][ marker : 1 B ]
```

### 2.1 Minute data — newest minute first

- `buf[0]` = the **newest** minute ("now"), `buf[k]` = `now − k` minutes.
- The console copies `decoded[k]` onto minute `now − k` (wrapping
  midnights; `SaveMETs` @ `0x02327884`).
- Per-minute encoding (identical for METs, height and tag streams):
  | bytes | meaning |
  |---|---|
  | `0xFF`, `0xFE` | **empty minute — SKIPPED by the decoder** (the stream is compacted) |
  | `[v]` (v ≠ 0, next ≠ 0) | one minute, value `v` |
  | `[count][0x00]` (count = 1..253) | `count` minutes of value 0 (RLE) |
- The first byte must not be a bare `0x00` (skipped by the decoder) — a
  leading zero run is RLE-encoded.

### 2.2 Tail

```
[ minute ][ hour ][ day ][ month ][ year-2000 ] | 13 × 0x00 | 0xFD / 0xFC
```

- **marker**: `0xFD` = valid data, `0xFC` = empty. `GetDatePos`
  (`0x023265fc`) scans the buffer **backwards** for the first `0xFD`/`0xFC`
  and returns `marker_pos − 13`.
- The date is read from the 5 bytes at `[marker_pos − 18 .. marker_pos − 14]`.
- The 13 reserved bytes are zero-filled and not interpreted.
- **Important**: in the normal (first) save pass the console does **not**
  use this tail date at all — see §4. The 5 date bytes are simply decoded
  as 5 extra "minutes" of data landing ~6 days ago (harmless noise). The
  tail date only matters for `0xFC`-segmented buffers (§4.2).

---

## 3. Value encodings

### 3.1 METs — raw byte, scale ×10

- `10` = 1.0 METs (resting), `30` = 3.0 (walking), `80` = 8.0 (running).
- Verified by `CalcMetabolism__11SAMUProcessSFbifT3` (`0x02321198`), which
  bands the byte at `<3, <6, <8, <10, <12, <15, <18, <30, <50, <70`
  (i.e. 0.3 / 0.6 / 0.8 / 1.0 / 1.2 / 1.5 / 1.8 / 3.0 / 5.0 / 7.0 METs)
  and picks one of 11 kcal-rate categories × 2 genders from the table at
  `0x10046070`.
- Stored raw: `getSAMUMETs__14RPStepSAMUDataCFiT1` (`0x0205b640`) returns
  `*(buf + day*0x5a0 + minute + 500)` — one byte per (day, minute).
- Any value 1..254 is accepted by the save path; the graph plots the raw
  byte (axis labels `2,4,6,8` — `InitializeMETsText` @ `0x0249b330`).
- Realistic emulated values should be clean levels (quantized), e.g.
  `10, 12, 15, 18, 20, 25, 30, 35, 40, 50, 60, 70, 80`.

### 3.2 Height — signed 7-bit per-minute deltas

- `+1..+127` → `v` ; `−1..−126` → `0x7F − v` (i.e. `0x80..0xFD`).
- Escapes after a value: `0xFA` = +127, `0xFB` = −120
  (`SaveHeight` @ `0x02328b40`).
- Stored as **u16 cumulative height**, empty = `0x7FFF`.
- `0xFC`/`0xFD` must never appear as bare values inside the stream: the
  marker scanner would misread them (encoder caps deltas at −124/`0xFB`).

### 3.3 Activity tag — the graph's gate

- u8 per minute, `0xFF` = empty. Stored raw (`getSAMUActivityTag`).
- **The graph only displays a minute if the tag ≠ 0xFF** (see §5) — this
  is why an all-`0xFF` tag stream yields a completely empty graph even
  though the METs/height data is saved correctly.
- The tag also selects the bar color: `SetupNewestBarGraph`
  (`0x024a566c`) indexes the table at `0x1005dcb4`:

  | tag | color | tag | color |
  |-----|-------|-----|-------|
  | 0,7,8,9,10 | 0 | 3,5,13 | 4 |
  | 1,2,11,12 | 5 | 4,6,14 | 3 |
  | 15 | 1 |  |  |

- Because tag 0 is a valid value and `[v][0x00]` is RLE, the tag stream
  must be RLE-encoded exactly like the height stream.

---

## 4. The console's save pipeline (what actually happens)

### 4.1 Entry

`SAMUDataSave__11SAMUProcessFv` (`0x0232ce08`) walks the 5 received
buffers and calls `SaveU8Data__11SAMUProcessFUcPUci` (`0x0232b290`) for
cmd 2/3/4 and `SaveU16Data__11SAMUProcessFUcPUsi` (`0x0232c2d0`) for
cmd 5/6.

### 4.2 `SaveU8Data` (simple) — the segment walker

1. Scans the buffer **forwards** for the first `0xFC`/`0xFD` byte.
2. Calls `SaveU8Data___…` (complex, `0x0232aeb0`) for the data **before**
   the marker with `bool = 1`.
3. If the marker was `0xFC` (empty) and more data follows, repeats with
   `bool = 0` and the date taken from the 5 bytes **before the `0xFC`**
   (the buffer's tail date) — this handles multi-segment buffers.
4. Stops at `0xFD` (valid) or the buffer end.

### 4.3 `SaveU8Data___…` (complex) — the saver

1. `GetDatePos` → `datePos = marker_pos − 13` (or `size − 1` if no marker).
2. Date selection:
   - `bool = 1` (normal case): **the console's own clock**
     (`SAMUProcess` time at `this + 0xD0`, synced with the meter via the
     cmd 0x01 time exchange) — **the buffer's tail date is ignored here**.
   - `bool = 0`: the buffer's date from the 5 bytes before the `0xFC`.
3. Scans backwards from `datePos` for the last non-`0xFF` byte → the
   decode limit.
4. Dispatches to `SaveMETs` (type 2), `SaveHeight` (type 3) or `SaveTag`
   (type 4).

### 4.4 The alignment rule

In `SaveMETs`, `decoded[0]` is stored at minute
`hour*60 + minute` of the selected date (the console's current time), and
`decoded[k]` at `now − k`, wrapping midnights.

**Consequence:** the emulator's buffer must have its **newest byte =
the console's current minute**. Future minutes are simply absent
(`0xFF`, skipped by the decoder) — this both aligns the stream and marks
"no data yet". The 19-byte tail may follow immediately.

> The earlier "stamp the tail 23:59" convention is **wrong** for the first
> pass: the console maps `decoded[0]` to its own clock regardless of the
> tail. Stamping 23:59 while filling a whole day shifts the data by
> `23:59 − now`.

**No registration/pairing-date filter exists anywhere in this path.**
`getSAMUFirstPairingDate` (`0x0205b73c`) — the function that would reject
data older than when the meter was first paired — has exactly two
call sites in the whole binary, both inside
`Reset__24RPHealthBodyCheckManagerFv` (confirmed via `xrefs_to` on the
live decompilation), which belongs to the unrelated body-check/BMI-scale
flow. `SAMUDataSave`, `SaveU8Data`/`SaveU8Data___`, `SaveMETs` and
`GetSaveDataIndexWithClearData` never call it and never read the meter's
pairing time for anything. **The console accepts whatever the meter sends
and simply anchors it to its own current clock — it has no concept of "too
old to count."** The only thing that matters for the meter emulator's
"now" is that the emulator's clock and the Wii U's system clock agree to
within a minute or so (true on any home network).

### 4.5 Incremental sync

For `param < 0x2760` the console receives `param` bytes into its 10080-byte
buffer and `SaveMETs` runs an overlap search (`SearchMatchPos`): it builds
the last-10-minutes pattern of the existing save and scans the freshly
decoded tail for it, so only the new minutes are appended. The emulator
therefore serves `param − 19` newest minutes + the 19-byte tail.

**Observed on hardware (2026-08-22, test account, mid-session sync):** the
console requested `f4 cmd=02/03/04 param=0x02ae` (686 bytes = 667 minutes
of data + the 19-byte tail, ≈ "today plus a sliver of last night") for all
three minute streams. So the request seen for a given sync is one of two
shapes: `param = 0x2760` (10080 bytes, the full 7-day window) or a smaller
`param` (an incremental window covering only the most recent minutes) —
which one the game asks for depends on the in-game context that triggered
the sync, and only the `param` value in the log tells you which happened.

**This is why previously-set data for older days can appear to "not stay":**
if a session's `f4 cmd=02/03/04` requests are all small `param` values, the
minute-level streams for anything older than ~today were **never
transmitted in that session at all** — there's nothing to overwrite or
preserve, the bytes simply weren't sent. Meanwhile `cmd=05/06` (daily
kcal/steps, §6) always requested `param=0x0078` (120 bytes = the *entire*
51-slot array) in the same session — those two are single-shot, whole-table
transfers with no incremental variant, so every day's totals update on
every sync regardless of what the minute streams did. **Symptom: steps/kcal
correct for all days, but the graph only shows today.** Check the `param`
in the `f4 cmd=02/03/04` log lines to tell which case a given session hit.

### 4.6 Save-slot allocation can silently abort a multi-day write

The account's save file holds a **fixed 50-day table**
(`GetSaveDataIndexWithClearData`, `0x0232687c`: 5 groups × 10 unrolled
slots). Every time `SaveMETs`/`SaveHeight`/`SaveTag` cross a midnight while
walking a multi-day buffer backwards, they call this function again to get
the slot for the new (earlier) day:

1. Exact date match among the 50 slots → reuse it.
2. Else an empty slot (`date == 0`) → clear it and use it.
3. Else the **oldest unlocked** slot (`getSAMUFlag & 1 == 0`, i.e. not
   starred/commented by the user) → evict and reuse it.

In every case, right before returning, the function checks
`if (foundIndex == param_3) return -1;` where `param_3` is the slot the
*caller* is already writing into (today's slot, passed down from
`SaveU8Data___`). **If step 2/3 picks that same physical slot, the function
returns -1 and `SaveMETs` returns immediately** — the rest of the buffer
(every earlier day still queued) is silently dropped; only the days already
written before the collision survive.

This can only happen once the 50-slot table is full and unlocked (a fresh
account, or one with < 50 days of history, always finds a free slot and
never collides). It means: **injecting a full 7-day window in one shot is
safest right after registering a fresh meter/account.** On an account that
already has a long real play history, a single full-week sync can — in the
worst case — stop partway through the older days if slot eviction happens
to land on the slot in use, which would show up as "today looks right but
some of the earlier days in the week are missing from the graph." This is
a genuine console-side limit, not something the emulator's wire format can
avoid; the only mitigation is smaller/more frequent syncs (matches real
Fit Meter behavior, which syncs incrementally rather than sending 10080
bytes every time — see §4.5).

---

## 5. The graph display (why "nothing appears")

`__MakeSAMUDataFromSavedata__Q2_4menu3amgFv` (`0x0249de24`) builds the
graph data from the save. For each minute it requires **all three**:

```
getSAMUActivityTag(day, minute) != 0xFF   AND
getSAMUHeight      (day, minute) != 0x7FFF AND
getSAMUMETs        (day, minute) != 0xFF
```

Only then are the METs (u16 at `+0x5BE`), height (u16 at `+0x10FE`) and
tag (u8 at `+0x1D`) copied into the graph record. `SetupNewestBarGraph`
(`0x024a566c`) draws a bar per group when METs ≠ 0xFF and tag ≠ 0xFF,
colored by `color_table[tag]`.

**Therefore a minute needs all three streams filled:**
- METs: non-`0xFF` (e.g. 10..254),
- Height: decodes to a non-`0x7FFF` cumulative value,
- Tag: **non-`0xFF`** (0..15), which also picks the color.

> One unrelated gate exists one level up: `__MakeSAMUDataFromSavedata`
> skips the entire per-minute loop for a day whose profile is a "pet"
> (`isPet__17RPHealthParameterFi` — the legacy Wii Fit dog/cat body-test
> profile type). Not reachable from a normal human Mii account; noted only
> because it would look identical to "meter data isn't arriving" if ever
> hit by accident.

---

## 6. Daily blocks (cmd 0x05 / 0x06) — 120 bytes

```
[ 51 × u16 day slots, newest first; 0xFFFF = empty slot ]
[ 9 × u16 fixed tail ]
```

Unlike cmd 0x02/0x03/0x04, there is no incremental variant of this
request: the console always asks for `param = 0x0078` (120 bytes, the
whole array) and gets every day's total in one shot. See §4.5 — this is
why steps/kcal for older days can look "up to date" in the same session
where the minute-level graph for those same days shows nothing.

- The tail observed on real hardware (capture `fms-1551470126.txt`,
  XOR-0xAA decoded):
  `0000 0000 0003 001a 0002 0013 fffd 000d fffe`
- `GetDatePos` (u16 version, `0x0232b578`) scans backwards for `0xFFFD`
  (valid) / `0xFFFC` (empty); the slot scan skips `0xFFFF` and stops at
  `0xFFFE`.
- An all-`0xFFFF` block records nothing (safe "no data" state).
- The values are u16 per-day calorie/step totals (newest first).

---

## 7. XOR-0xAA

`SAMU_ThreadMain` (`0x02016858`) XORs **every byte of the f0/f1 bulk
payload** with `0xAA` on the console side (both directions). Applies to
the minute streams, the daily blocks, ident, time — never to the `f4`
commands, `f2`/`f3` acks or the A5 framing.

---

## 8. Emulator checklist (day_plan.py / meter_protocol.py)

- [x] METs: one byte per minute, ×10, quantized levels, `0xFF` only for
      genuinely empty minutes.
- [x] Height: signed 7-bit deltas + `0xFA`/`0xFB` escapes, RLE zero runs,
      capped at ±124 to avoid marker collisions.
- [x] Tag: `tag_for_mets()` maps the METs level to tags 0..6, RLE-encoded
      (`encode_minutes`), `0xFF` for empty minutes.
- [x] Tail: `[minute, hour, day, month, year-2000]` + 13 × `0x00` +
      `0xFD`; incremental syncs serve `param − 19` newest minutes + tail.
- [x] Alignment: the three streams share a common **minute window**
      (`WeekPlan._minute_window`): `[now, now−1, …]` newest first, so
      `decoded[0]` = "now" of the console's clock and the three streams
      decode to exactly the same number of minutes (RLE compresses the
      tag/height streams, so a per-day byte layout would drift apart).
- [x] Daily blocks: 51 slots + the captured 9-u16 tail; XOR-0xAA applied.
- [x] XOR-0xAA on all f0/f1 payloads (`_chunk_frames`, `_build_daily_block`).

## 9. Function address index

| Function | Address |
|---|---|
| `SettingLogReceiveSequence__Q2_3jet7SAMUSeqFb` | `0x02338940` |
| `AllocReceiveBuffers__Q2_3jet4SAMUSF…` | `0x0201adac` |
| `ProcessBulkReceive__Q2_3jet4SAMUSFv` | `0x02017ed0` |
| `ThreadMain__Q2_3jet4SAMUSFiPv` (XOR-0xAA) | `0x02016858` |
| `SAMUDataSave__11SAMUProcessFv` | `0x0232ce08` |
| `SaveU8Data__11SAMUProcessFUcPUci` (simple walker) | `0x0232b290` |
| `SaveU8Data___11SAMUProcessFUcPUcibT2T3` (complex) | `0x0232aeb0` |
| `SaveU16Data___11SAMUProcessFUcPUsibT2T3` | `0x0232be74` |
| `GetDatePos__11SAMUProcessFPUci…` (u8) | `0x023265fc` |
| `GetDatePos__11SAMUProcessFPUsi…` (u16) | `0x0232b578` |
| `SaveMETs__11SAMUProcessFPUciT2…` | `0x02327884` |
| `SaveHeight__11SAMUProcessFPUciT2…T6` | `0x02328b40` |
| `SaveTag__11SAMUProcessFPUciT2…` | `0x02329de0` |
| `SaveCalorie__11SAMUProcessFPUsiT2…` | `0x0232b7f0` |
| `SaveSteps__11SAMUProcessFPUsiT2…` | `0x0232bb30` |
| `GetSaveDataIndexWithClearData__11SAMUProcessFPQ2_11SAMUProcess8SAMUDatei` (50-slot day table, §4.6) | `0x0232687c` |
| `getSAMUFirstPairingDate__14RPStepSAMUDataCFv` (only called from `Reset__24RPHealthBodyCheckManagerFv`, never the save path) | `0x0205b73c` |
| `getSAMUMETs__14RPStepSAMUDataCFiT1` | `0x0205b640` |
| `getSAMUHeight__14RPStepSAMUDataCFiT1` | `0x0205b668` |
| `CalcMetabolism__11SAMUProcessSFbifT3` | `0x02321198` |
| `__MakeSAMUDataFromSavedata__Q2_4menu3amgFv` | `0x0249de24` |
| `SetupNewestBarGraph__Q2_4menu3amgF…` | `0x024a566c` |
| `InitializeMETsText__Q3_4menu3amg6DetailFv` | `0x0249b330` |
| `GetMetsText__Q2_4menu21TrainingDataInterfaceFPwUi` | `0x023e463c` |
| METs metabolism table | `0x10046070` |
| Tag→color table | `0x1005dcb4` |
