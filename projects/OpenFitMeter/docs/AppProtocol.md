# Application Protocol — F1–F4 commands

The application layer works on the `msg` field of the A5 frame
(see [WireProtocol](./WireProtocol.md)). The **first byte of `msg` is the opcode**.

> The real opcodes are **`0xF1`–`0xF4`**. Older descriptions mention `0x80`/`0x81`;
> those are errors. The corrected reference is given here.

## Opcodes

| Opcode | Name | Description |
|--------|------|-------------|
| `0xF1` | SETUP / beacon | Synchronization / beacon frame sent by the meter to the console. |
| `0xF2` | ACK | Acknowledgment. |
| `0xF3` | END / session | End marker; also the **initiating** frame sent by the meter (mode 1) to the console. |
| `0xF4` | TRANSFER | Data exchange (command + size + payload). |

## `f4` frame (TRANSFER)

```
f4  <cmd>  <size:2 bytes big-endian>  [<data>]
```

- `cmd`: sub-command identifier (e.g. `0x02` METs, `0x03` height…).
- `size`: number of `data` bytes (big-endian).
- `data`: optional, depending on direction.

### Console → meter direction

| Form | Meaning | Meter reaction |
|------|---------|----------------|
| `f4  (cmd | 0x80)  <size>  <data>` | Console **sends** data to the meter. | Meter replies `0xF2` (ACK), then reads the chunks. |
| `f4  (cmd & 0x7F)  <size>` | Console **requests** data from the meter. | Meter sends the chunks, and the console expects `0xF3`. |

## Registration / synchronization (sequence)

1. The console (Wii Fit U) opens an IR session → `CCR_IRDA_COMMAND_CONNECT`.
2. The meter replies with its **first `0xF3` frame** (mode 1, initiator).
3. The console and meter exchange `f4` frames to transfer the various data
   categories (see [DailyData](./DailyData.md)).
4. At the end, the console emits `0xF3` (END) and closes the session
   (`CCR_IRDA_COMMAND_DISCONNECT`).

## `f4` command identifiers (cmd)

| `cmd` | Data | Size received |
|-------|------|---------------|
| `0x02` | METs per minute | up to 10080 bytes |
| `0x03` | Height per minute | up to 10080 bytes |
| `0x04` | Activity tag per minute | up to 10080 bytes |
| `0x05` | Daily calories | 120 bytes |
| `0x06` | Daily steps | 120 bytes |

These five commands constitute the **daily data** transfer described in
[DailyData](./DailyData.md).

## Sync model: incremental by default, full window on pairing

The `size` field of an `f4` request tells the meter how many bytes to send;
the meter must reply with **exactly** that many.

- **Incremental sync (normal daily use):** the console asks for only the
  minutes recorded since the last sync. The reference capture
  (`fms-1551470126.txt`, see [Sources](./Sources.md)) shows requests of
  `0x029d` (669 bytes ≈ 11 h) and even `0x0017` (23 minutes) for `0x02`
  through `0x04` — i.e. the meter is normally synced every day and each
  sync transfers the delta.
- **Full window (pairing / long gap):** a request of `0x2760` (10080 bytes)
  asks for the whole 7-day minute ring at once. The meter holds up to 7
  days of minute data precisely so a week can be uploaded after a gap.

The daily totals (`0x05`/`0x06`, 120 bytes) always carry the full
per-day history (51 slots), independent of the minute-delta size.
