# Index — Essential Fit Meter / Wii Fit U Documentation

This folder is the strict, complete reference for how the **Fit Meter**
(Wii Fit U accessory) communicates with the Wii U. Any reader, without prior
knowledge, should fully understand the system after reading these pages.

## Contents

0. [How Wii Fit and the Fit Meter talk to each other](./HowTheyTalk.md)
   — The key reverse-engineering findings: IR not Bluetooth, three layers, the
   handshake, the transfer model, and why the link is fully emulatable.

0b. [Lifecycle — Setup a new meter & Transfer to a linked account](./Lifecycle.md)
   — The two end-to-end paths (pairing vs daily sync): the exact `f4` command
   sequence, how the console tells a new meter from a linked one, and what our
   emulator actually does. Start here for "how it works in practice".

1. [Wire Protocol (IR layer / A5 frame)](./WireProtocol.md)
   — Frame format, CRC-8, flags (SETUP / LARGE), console ↔ meter roles,
   bulk transfer (chunks).

2. [Application Protocol (F1–F4 commands)](./AppProtocol.md)
   — Opcode semantics, the `f4` frame, registration / synchronization, data exchange.

3. [Daily Data Format](./DailyData.md)
   — The 5 received buffers (METs, height, activity, calories, steps): the
   newest-first layout, the 19-byte tail (date + marker), the RLE/delta
   encodings, the console's save pipeline (SaveU8Data/SaveMETs/SaveHeight/
   SaveTag), the **alignment rule** (decoded[0] = the console's own clock),
   and the **graph display gate** (tag ≠ 0xFF required). Complete,
   decompiler-verified reference (Ghidra, 2026-08-21).

4. [Mii Format](./MiiFormat.md)
   — 0x60-byte FFSD structure, bit-by-bit fields, CRC-16 checksum, rendering
   (FFL.js pixel-perfect + texture composite).

4b. [Interchange Data Formats](./DataFormats.md)
   — The two JSON documents both programs read and write: `openfitmeter.week`
   (seven days of activity) and `openfitmeter.profile` (one account, carrying
   the archives the console pushed verbatim). Export on either side, import on
   the other.

5. [WUPS Plugin Architecture + TCP Protocol](./PluginArchitecture.md)
   — The plugin that intercepts the Wii U's IR and relays it to the PC.

6. [PC Server (fitmeter.py + MeterEmulator)](./PCServer.md)
   — The Python program that emulates the meter and talks to the plugin.

7. [Building & Running](./BuildAndRun.md)
   — Requirements, running the server, building the plugin, FFL.js setup,
   the test suite, and how to reproduce the reverse engineering.

8. [Sources & Reverse-Engineering References](./Sources.md)
   — Every public project, official asset and decompiled address this
   documentation is based on.

## One-line overview

The Wii U sends **IR frames** to the Fit Meter through the GamePad's infrared port;
the WUPS plugin **intercepts** those frames at the system level and **relays them
over TCP** to a PC that **emulates the meter** (fitmeter.py), which replies with the
stored data (METs, steps, height, Mii…) in the exact binary format the game expects.
