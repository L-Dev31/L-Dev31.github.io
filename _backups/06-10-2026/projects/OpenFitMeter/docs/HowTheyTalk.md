# How Wii Fit and the Fit Meter talk to each other

This page collects the **key reverse-engineering findings** about how the Wii U
(Wii Fit U) and the Fit Meter communicate. It is the most important takeaway of the
whole project. (Lower-level detail lives in [WireProtocol](./WireProtocol.md),
[AppProtocol](./AppProtocol.md), [DailyData](./DailyData.md),
[MiiFormat](./MiiFormat.md), [PluginArchitecture](./PluginArchitecture.md),
[PCServer](./PCServer.md).)

## 1. It is infrared, not Bluetooth

The single most important discovery: the Fit Meter does **not** use Bluetooth or
RFCOMM. It talks to the Wii U over the **infrared (IrDA-SIR) port on the GamePad**
at **115200 bps**. Any prior assumption that the meter is a Bluetooth device is
wrong; the entire link is a short-range IR serial line.

## 2. Three software layers

The communication is split into three discoverable layers:

| Layer | What it does |
|-------|--------------|
| **CCRCDC** | Low-level IR driver. Opens/closes the IR link and moves raw bytes (`CCRCDCPerIrdaControl`). |
| **IRCU** | A Wiimote-style rendezvous/state machine (`WiimoteMgr` / `IRCMgr`). Drives connect → exchange → disconnect and parses incoming frames (`IRC_Proc`). |
| **SAMU** | The game's business logic (`RPHealthSaveManager` / `RPStepSAMUData`). Decides what data to ask for and stores the result. |

The *data protocol* (what is exchanged) lives at the **SAMU** layer; the lower two
are generic Wii U IR plumbing that the game reuses for other IR accessories.

## 3. The wire frame is an "A5" frame with a CRC-8

Every IR message is:

```
A5  <sessionId>  <flags>  [<size8>]  <2-byte prefix (semantics unresolved)>  <msg>  <crc8>
```

- The magic byte is `0xA5`.
- `sessionId`: `0xEB` = Fit Meter, `0x02`/`0x08` = console.
- `flags`: bit7 = SETUP, bit6 = LARGE, bits0–5 = payload size.
- **CRC-8: polynomial `0x07`, init `0x00`, MSB-first**, computed over the whole
  frame including the `A5` byte.
- On SETUP frames there is no `prefix` and no `size8`. The 2-byte prefix is
  present on all non-SETUP frames; its meaning is unresolved (not a CRC16,
  not the reply size — see `WireProtocol.md`).

## 4. Handshake: console initiates, meter accepts

The rendezvous follows fixed roles:

- **Console (Wii Fit U) = initiator (mode 0):** sends an `f4` request, then
  **waits for a single `0xF3`** from the meter.
- **Meter = acceptor (mode 1):** first sends a **`0xF3` frame** to announce itself,
  then handles the console's `f4` commands.

So a session is: connect → meter sends `0xF3` → a series of `f4` exchanges →
console sends `0xF3` (END) → disconnect.

## 5. Transfer model: `f4` with send-vs-request, chunked

All data moves through the **`f4` frame**: `f4 <cmd> <size:2 bytes BE> [<data>]`.

- `cmd | 0x80` → console **sends** data to the meter (meter replies `0xF2` ACK).
- `cmd & 0x7F` → console **requests** data from the meter (meter sends chunks,
  console expects `0xF3`).

Large payloads are split into **chunks**:
- `0xF0` = chunk (not last), ack `0xF2`
- `0xF1` = last chunk, ack `0xF3`
- The chunk **DATA section is XORed with `0xAA`** by the application layer.

## 6. What is actually exchanged

The console pulls exactly **five data categories** plus the **Mii**:

| `cmd` | Content | Size |
|-------|---------|------|
| `0x02` | METs per minute | 10080 bytes |
| `0x03` | Height per minute | 10080 bytes |
| `0x04` | Activity tag per minute | 10080 bytes |
| `0x05` | Daily calories | 120 bytes |
| `0x06` | Daily steps | 120 bytes |
| — | **Mii** (0x60-byte FFSD) | 96 bytes |

The per-minute buffers cover 7 days × 1440 minutes; the daily buffers cover 51 day
slots + 9 tail slots. (See [DailyData](./DailyData.md) and [MiiFormat](./MiiFormat.md).)

## 7. No authentication, no encryption — fully emulatable

The most consequential finding for emulation: the link is **completely
unauthenticated and unencrypted**. The console never issues a cryptographic
challenge, a nonce, or a signed handshake — it is a deterministic request/response
exchange. This is proven by the fact that a **recorded conversation can be replayed
verbatim**: a captured meter state is answered back to the game
and accepted as a real meter.

Concretely, the WUPS plugin:
1. hooks `CCRCDCPerIrdaControl` (IR driver) and `VPADBASEGetIRCStatus` (IR status bits),
2. forces the "connected / has data" bits the game gates on,
3. relays every frame over **TCP** to a PC running `fitmeter.py`, which returns the
   emulated meter's replies.

Because the game only cares about the A5 frames and the CRC-8, a software meter
works exactly like the hardware one.

## 8. Common misconception: the `0x80` byte

A frequent confusion: `0x80` is **not** an opcode. It is the **SETUP flag** inside
the A5 `flags` byte. The real application opcodes are **`0xF1`–`0xF4`**
(SETUP/beacon, ACK, END, TRANSFER). Older notes that list `0x80`/`0x81` as commands
are misreads of the SETUP flag.

## Sources

All findings on this page trace back to the public fitmetersync project,
the decompilation of `Step.rpx`, and the hardware capture — see
[Sources](./Sources.md) for the complete list and the exact function
addresses.
