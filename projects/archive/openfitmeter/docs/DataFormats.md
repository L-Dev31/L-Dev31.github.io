# Interchange Data Formats

Two JSON documents move data between the desktop tool (`GUI/`) and the Android
app. Both sides read and write **the same schema**, so a file exported on one
side imports on the other with no conversion step.

Every document carries a `format` and a `version` field; a reader that does not
recognise the pair refuses the file instead of guessing.

| `format` | Contents | Written by | Read by |
|----------|----------|-----------|---------|
| `openfitmeter.week` | Seven days of activity (METs + altitude + daily totals) | both | both |
| `openfitmeter.profile` | One account: pairing identity + the raw archives the console pushed | both | both |

---

## 1. `openfitmeter.week` (version 1)

```json
{
  "format": "openfitmeter.week",
  "version": 1,
  "generated_at": "2026-08-25T14:05:00",
  "source": "OpenFitMeter Android",
  "profile_name": "Leo",
  "weight_kg": 62.0,
  "days": [
    {
      "date": "2026-08-25",
      "steps": 7200,
      "kcal": 821,
      "segments": [
        { "from": "07:00", "to": "08:00", "mets": 4.0, "altitude_m": 4 },
        { "from": "17:00", "to": "17:15", "mets": 6.0, "altitude_m": 2 }
      ]
    }
  ]
}
```

### Top level

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `format` | string | yes | `"openfitmeter.week"` |
| `version` | int | yes | `1` |
| `generated_at` | string | no | Local ISO-8601 timestamp, informational |
| `source` | string | no | Which program wrote the file, informational |
| `profile_name` | string | no | Account the week belongs to, informational |
| `weight_kg` | number | no | Body mass used to compute calories. Default `60.0` |
| `days` | array | yes | Up to seven day objects, any order |

### Day

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `date` | string | one of | `YYYY-MM-DD`. Canonical; what an export always writes |
| `day` | int | one of | Relative offset instead of `date`: `0` = today, `1` = yesterday … `6` |
| `steps` | int | no | Day total. Computed from the segments when absent |
| `kcal` | int | no | Day total. Computed from the segments and `weight_kg` when absent |
| `segments` | array | no | Activity spans. Absent or empty = a day with no data at all |

A day is placed in the rolling seven-day window by its offset from **today on
the importing device**. Days that fall outside `0..6` are ignored — an export
that sat around for a week simply drops out of range rather than landing on the
wrong dates.

### Segment

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `from` | string | yes | `"HH:MM"`, inclusive |
| `to` | string | yes | `"HH:MM"`, **exclusive**. `"24:00"` means end of day |
| `mets` | number | yes | Metabolic equivalent, real units (`1.0` = rest) |
| `altitude_m` | number | no | Total altitude change **across the whole segment**, in metres. Default `0` |

Rules:

- **A minute covered by no segment has no data.** It is transmitted as an empty
  minute (`0xFF`) and the console draws nothing for it — the same thing a real
  meter records while it is sitting in a drawer. This is the only rule that
  decides "empty" vs "resting": a resting minute is a segment with `mets: 1.0`.
- Segments must not overlap. If they do, the later one in the array wins.
- `altitude_m` is spread evenly over the segment's minutes; the wire format only
  carries per-minute *deltas*, so absolute altitude is meaningful only relative
  to the start of the window.
- The importer clamps METs into the range the wire format can hold
  (`1.0 … 25.1`, one byte at ×10 resolution).

### What an export writes

An export run-length merges consecutive minutes that share the same quantised
METs value *and* the same integer altitude delta, so a real recorded day comes
out as a few hundred segments rather than 1440, and a hand-written plan comes
out exactly as it was written.

---

## 2. `openfitmeter.profile` (version 1)

```json
{
  "format": "openfitmeter.profile",
  "version": 1,
  "generated_at": "2026-08-25T14:05:00",
  "source": "OpenFitMeter Android",
  "name": "Leo",
  "weight_kg": 62.0,
  "profile_updated_at": "2026-08-25T13:58:00",
  "ident": "cb03bf5344c9c7a200",
  "time_data": "001a0815151e",
  "pushed": {
    "0": ["…"],
    "1": ["aab0a2bfbbaa"],
    "2": ["…"]
  },
  "avatar_data": "…0x60 bytes, hex…",
  "calorie_values": [821, 682, 899],
  "steps_values": [7200, 5900, 8100]
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `ident` | hex string | The 9-byte pairing identity `{u32 saveDataID, u32 samuID, u8 registered}` the console assigned. `null` for an account that has never paired |
| `time_data` | hex string | The 6-byte time block the console pushed at pairing |
| `pushed` | object | **The raw payloads received from the console, verbatim**: `"<f4 cmd>" -> [hex, …]`, still XOR-`0xAA` obfuscated exactly as they arrived. This is the authoritative copy of the profile as the game sent it |
| `avatar_data` | hex string | Convenience: the 0x60-byte profile block already located inside `pushed` and de-obfuscated. Always re-derivable from `pushed` |
| `calorie_values` | int array | Per-day kcal totals, newest first |
| `steps_values` | int array | Per-day step totals, newest first |
| `profile_updated_at` | string | When `pushed`/`avatar_data` were last refreshed by a session |

### The profile is not frozen at pairing

The console re-pushes its archives on later sessions, and what is inside them
can change — a height edited in the game's profile, a renamed or restyled
avatar. Both sides therefore **re-read the profile out of `pushed` after every
session** and update the stored account in place, keeping only the fields the
user owns locally (their entered body mass, the local display name if they
renamed it). `profile_updated_at` records when that last happened.

Because `pushed` is stored verbatim, a profile exported today can be re-decoded
by a future version of either program without another sync.

### Compatibility with the desktop account files

The desktop tool stores one account per file in `GUI/accounts/<name>.json` using
these exact key names, so a profile exported from the phone can be dropped
straight into that folder and picked up as an account. The extra `format` /
`version` / `name` keys are ignored by the emulator state loader.
