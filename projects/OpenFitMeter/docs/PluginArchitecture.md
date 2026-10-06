# WUPS Plugin Architecture + TCP Protocol

## Purpose

The **Open FitMeter Hook** WUPS plugin runs on the Wii U and **intercepts** the IR
communication destined for the Fit Meter, then **relays it over TCP** to a PC that
emulates the meter (see [PCServer](./PCServer.md)).

## Configuration menu (WUPS)

The plugin exposes a WUPS config menu ("Open FitMeter Hook"):

| Setting | Meaning |
|---------|---------|
| **Plugin enabled** | Master toggle: when off, every hook passes through to the real driver (meter emulation fully disabled). |
| **Use a manual server IP** | Off = auto-discovery (default). On = connect to the fixed IP below. |
| **PC server IP (manual mode)** | The PC address to connect to when manual mode is on. |
| **PC server port** | TCP/UDP port (default `8476`). |

Environment variables `WIIFIT_SERVER_IP` / `WIIFIT_SERVER_PORT` override the
menu values (useful for `make`-time pinning).

## General operation

1. The Wii U (Wii Fit U game) drives the IR port via the `CCRCDCPerIrdaControl` driver.
2. The plugin **replaces** that system call and `VPADBASEGetIRCStatus`.
3. Instead of talking to a real meter, the plugin sends the frames to the PC over TCP.
4. The PC replies with the meter's frames (emulated), which the plugin hands back to the game.

## Activation

- The plugin only acts **if** the game's Title ID high 32 bits equal `0x00050000`
  (Wii Fit U) **and** a real IR session is active.
- This prevents the game from thinking a meter is present at boot and attempting an
  auto-sync that would crash.

## Installed hooks

| Hooked function | Library | Role |
|-----------------|---------|------|
| `CCRCDCPerIrdaControl` (stub `0xc08b6f78`) | nsysccr | Low-level IR control: CONNECT / DISCONNECT / SEND / RECEIVE. |
| `VPADBASEGetIRCStatus` (stub `0xc08b7380`) | vpadbase | IR link status as seen by the game. |

### Forcing the IR status (`VPADBASEGetIRCStatus`)

The game (IRC_Proc) gates on two bits:

| Bit | Mask | Meaning | Forced by plugin |
|-----|------|---------|------------------|
| 1 | `0x02` | Link connected | Yes (while session active) |
| 0 | `0x01` | IR data event | Yes (if frames are pending) |

Without a real physical meter, neither bit would ever set; the plugin forces them
to advance the state machine.

## TCP protocol (plugin ↔ PC)

- The PC listens on `0.0.0.0 : 8476` (configurable).
- **Plugin → PC:** `[len_hi][len_lo][ctrl][data…]` where `len = 1 + len(data)`.
- **PC → Plugin:** `[len_hi][len_lo][data…]` (length 0 = nothing to serve).

### Auto-discovery (no IP needed)

By default the plugin has **no IP configured**. It broadcasts a UDP probe
(`OPENFITSYNC`) to `255.255.255.255:8476`, the companion app answers
`OPENFITSYNC_ACK`, and the plugin takes the reply's source address and opens the
TCP connection there. The scan returns as soon as somebody answers.

A device is discoverable exactly while it is serving: the Android app only holds
the UDP socket open while its send screen is on, and the desktop server while it
is running. That is the whole selection mechanism - there is no tie-break when
several devices answer, because only one is meant to be transmitting at a time.

**The scan runs at the start of every IR session**, rate-limited to one every
three seconds (the same cadence as a reconnect attempt, so a game that opens and
closes sessions in a loop can never stall on it). This is the part that matters:
the previous build discovered once and then cached that address until the
connection actually failed, so whichever device answered first kept the console
for as long as it stayed online — which is why a second phone could not be
reached. Re-scanning per session means switching phones is just "open the send
screen on the other one".

Enable "Use a manual server IP" (or set `WIIFIT_SERVER_IP`) to skip discovery
entirely and use a fixed address.

### Latency

Both ends set `TCP_NODELAY` and write each message with a single `send`. A
transfer is thousands of tiny request/response round trips; with Nagle's
algorithm active, each one waits for the peer's delayed ACK, which turned a
few-second sync into a multi-minute one.

### One link at a time, and how it is reclaimed

The plugin holds **exactly one** TCP socket: every path that opens a new one
closes the old one first. A second connection arriving at the companion app
therefore always means the first is already dead, so **the newest connection
wins** — the app closes the previous socket, which unblocks its handler at once
instead of leaving it parked in `read()`. (Refusing the newcomer instead locks
the console out for a whole read timeout whenever the plugin's close was never
delivered — a Wi-Fi drop, which is exactly when it reconnects.) A superseded
handler does not commit its half-finished session: the connection that replaced
it owns the emulator.

Because the plugin keeps its socket open between game sessions, an idle link is
normal and must not be cut short — a session interrupted mid-registration loses
the archives the console had already pushed. Both servers therefore use a **60 s
idle timeout**, long enough to outlast any pause inside a session but short
enough that a silent link is reclaimed rather than parking the server forever on
a blocking read. Reconnecting costs the plugin one handshake, and `proxy_connect`
retries its `CONNECT` once if the first exchange discovers a stale socket, so the
first session after a long pause still opens normally.

### Control bytes (`ctrl`)

| Value | Name | Description |
|-------|------|-------------|
| `0x00` | CONNECT | New session. Plugin clears the FIFO, notifies the PC; the PC starts the session and returns the meter's first frame (`0xF3`). |
| `0x01` | SEND | Plugin rebuilds the console frame verbatim (adds CRC-8), sends it; the PC processes it and returns the meter's reply. |
| `0x02` | RECEIVE | Plugin asks for the next meter frame to serve to the game. |
| `0x03` | DISCONNECT | End of session; plugin clears the FIFO and notifies the PC. |

### Pending-frame FIFO

- The game **interleaves** SEND (acks) and RECEIVE (data pulls). A SEND must
  **append** to the queue, never overwrite a frame already pre-fetched for a RECEIVE.
- A FIFO (`MAX_PENDING = 8`) holds the pending meter frames.
- On RECEIVE: if the FIFO is empty, the plugin asks the PC for a frame, then reads
  from the FIFO and wraps it in the format expected by IRC_Proc:
  `[0x00][size_hi][size_lo][raw A5 frame]`, and returns it to the game.

### Reconnection

- Automatic reconnection attempts (max 5).
- After 10 consecutive failures, the plugin disables itself.
