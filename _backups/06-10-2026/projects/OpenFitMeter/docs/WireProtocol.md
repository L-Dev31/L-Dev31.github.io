# Wire Protocol — IR layer / A5 frame

## Physical medium

- **IrDA-SIR** (serial infrared) link between the Wii U GamePad IR port and the Fit Meter.
- Baud rate: **115200 bps**.

## Protocol layers

The system is divided into three software layers:

| Layer | Role |
|-------|------|
| **CCRCDC** | Low-level IR driver (IrDA framing, connect/disconnect). System call `CCRCDCPerIrdaControl`. |
| **IRCU** | Wiimote-style rendezvous manager (WiimoteMgr / IRCMgr). Drives the link state machine. |
| **SAMU** | Game business logic (Wii Fit U). Owns the Fit Meter state (RPHealthSaveManager / RPStepSAMUData). |

`IRC_Proc` (in the IRCU layer) is the function that **parses** incoming frames and
drives the entire state machine. It relies on `VPADBASEGetIRCStatus`
(see [PluginArchitecture](./PluginArchitecture.md)).

## A5 frame format

Every IR frame is an **A5 frame** structured as follows:

```
A5  <sessionId>  <flags>  [<size8> if LARGE]  <prefix:2 bytes>  <msg>  <crc8>
```

| Field | Size | Description |
|-------|------|-------------|
| `A5` | 1 | Fixed magic byte `0xA5`. |
| `sessionId` | 1 | Session identifier. `0xEB` = Fit Meter. `0x02` / `0x08` = Wii U console. (The plugin uses `0x00` for relaying.) |
| `flags` | 1 | Flags (see below). |
| `size8` | 1 | **Present only if LARGE.** Completes the size (see below). |
| `prefix` | 2 | **2 big-endian bytes**, present on **all** non-SETUP frames. Semantics unresolved — **not** a CRC16 and **not** the reply size (ruled out in `docs/17` §3). Treated as IR/HAL bookkeeping. Absent on SETUP frames. |
| `msg` | variable | Payload (opcode + data). |
| `crc8` | 1 | Checksum (see CRC-8). |

### Flags (`flags`)

| Bit | Mask | Meaning |
|-----|------|---------|
| 7 | `0x80` | **SETUP** — initialization frame. No `prefix`, no `size8`. Size is `flags & 0x3F`. |
| 6 | `0x40` | **LARGE** — 14-bit size (see below). |
| 0–5 | `0x3F` | Payload (`msg`) size for a normal frame. |

### Computing `dataSize`

- **Normal frame (non-SETUP):** `dataSize = len(frame) − 4` (A5 + sessionId + flags + crc8),
  including the 2-byte `prefix`.
- **SETUP frame:** `dataSize = len(frame) − 3` (no prefix). The meter's reply is also sent without a prefix.
- **LARGE frame:** data size is encoded on 14 bits:
  `dataSize = ((flags & 0x3F) << 8) | size8`. `dataSize` counts the `prefix` (2) plus `msg`.

### CRC-8

- Algorithm: **polynomial `0x07`, init `0x00`, MSB-first**.
- Computed over the **entire frame including the `A5` magic byte** (up to but not including the crc8).
- Reference implementation (identical in C and Python):

```c
uint8_t crc8_frame(const uint8_t* data, uint32_t len) {
    uint8_t crc = 0;
    for (uint32_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int b = 0; b < 8; b++)
            crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x07) : (uint8_t)(crc << 1);
    }
    return crc;
}
```

## Console ↔ meter roles

| Role | mode | Behavior |
|------|------|----------|
| **Console (Wii U)** | mode 0 (initiator) | Sends the `f4` request, then **waits for a single `0xF3`** from the meter. |
| **Meter (Fit Meter)** | mode 1 (acceptor) | Sends `0xF3` to the console to initiate, then handles `f4`. |

## Bulk transfer (chunks)

Large data is split into **chunks**:

| Byte | Name | Description |
|------|------|-------------|
| `0xF0` | CHUNK | Chunk (not the last). Expected ack: `0xF2`. |
| `0xF1` | CHUNK (final) | Last chunk. Expected ack: `0xF3`. |
| `0xF2` | ACK | Acknowledgment of a `0xF0`. |
| `0xF3` | END | End of transmission / session marker. |
| `0xF5` | RESEND | Resend request. Last 2 bytes = number of chunks to resend. |

- Chunks are split into **≤ 60 bytes** of data per frame.
- The **DATA section** of `0xF0`/`0xF1` frames is **XORed with `0xAA`** by the
  application layer (the decoder de-XORs when receiving on the game side).
- The meter sends chunks in a burst, awaiting `0xF2` between each `0xF0`
  (the final `0xF1` awaits `0xF3`).
