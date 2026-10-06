# Mii Format (FFL / RFL)

A **Mii** is stored in an **FFSD** ("FFLiStoreData") structure of **0x60 (96) bytes**,
in the Wii U format. It is transmitted/displayed by the meter and the game.

## Binary encoding

- Fields are **packed bit-by-bit** (LSB-first within each byte), with
  **little-endian** field assembly (`value |= bit << k`).
- The **name** and **creator name** are **UTF-16LE** strings of 0x14 bytes
  (NUL-terminated).

## Checksum

- Algorithm: **CRC-16, polynomial `0x1021`, MSB-first, init `0x0000`**.
- Computed over the **first 0x5E bytes**, followed by **16 zero bits**.
- Stored **big-endian** at bytes `0x5E`–`0x5F`.
- A structure with an incorrect checksum is rejected.

```python
def crc16_mii(data):
    crc = 0x0000
    for byte in data[:0x5E]:
        for bit in range(7, -1, -1):
            flag = (crc & 0x8000) != 0
            crc = ((crc << 1) | ((byte >> bit) & 1)) ^ (0x1021 if flag else 0)
            crc &= 0xFFFF
    for _ in range(16):
        flag = (crc & 0x8000) != 0
        crc = ((crc << 1) ^ (0x1021 if flag else 0)) & 0xFFFF
    return crc
```

## Field layout (bit-by-bit decode)

| Field | Bits | Notes |
|-------|------|-------|
| `version` | 8 | Format version number. |
| `allow_copying` | 1 | |
| `profanity_flag` | 1 | |
| `region_lock` | 2 | |
| `character_set` | 2 | |
| *(align 8)* | | |
| `page_index` | 4 | |
| `slot_index` | 4 | |
| `unknown1` | 4 | |
| `device_origin` | 3 | |
| *(align 8)* | | |
| `system_id` | 8 bytes | |
| `normal_mii` | 1 | |
| `ds_mii` | 1 | |
| `non_user_mii` | 1 | |
| `is_valid` | 1 | |
| `creation_time` | 28 | |
| `console_mac` | 6 bytes | |
| *(skip 16)* | | padding |
| `gender` | 1 | 0 = M, 1 = F |
| `birth_month` | 4 | |
| `birth_day` | 5 | |
| `favorite_color` | 4 | |
| `favorite` | 1 | |
| *(align 8)* | | |
| `name` | 0x14 bytes | UTF-16LE (offset ≈ 0x1A) |
| `height` | 8 | |
| `build` | 8 | |
| `disable_sharing` | 1 | |
| `face_type` | 4 | |
| `skin_color` | 3 | |
| `wrinkles_type` | 4 | |
| `makeup_type` | 4 | |
| `hair_type` | 8 | |
| `hair_color` | 3 | |
| `flip_hair` | 1 | |
| *(align 8)* | | |
| `eye_type` | 6 | |
| `eye_color` | 3 | |
| `eye_scale` | 4 | |
| `eye_vertical_stretch` | 3 | |
| `eye_rotation` | 5 | |
| `eye_spacing` | 4 | |
| `eye_y_position` | 5 | |
| *(align 8)* | | |
| `eyebrow_type` | 5 | |
| `eyebrow_color` | 3 | |
| `eyebrow_scale` | 4 | |
| `eyebrow_vertical_stretch` | 3 | |
| *(skip 1)* | | |
| `eyebrow_rotation` | 4 | |
| *(skip 1)* | | |
| `eyebrow_spacing` | 4 | |
| `eyebrow_y_position` | 5 | |
| *(align 8)* | | |
| `nose_type` | 5 | |
| `nose_scale` | 4 | |
| `nose_y_position` | 5 | |
| *(align 8)* | | |
| `mouth_type` | 6 | |
| `mouth_color` | 3 | |
| `mouth_scale` | 4 | |
| `mouth_horizontal_stretch` | 3 | |
| `mouth_y_position` | 5 | |
| `mustache_type` | 3 | |
| `unknown2` | 8 | |
| `beard_type` | 3 | |
| `facial_hair_color` | 3 | |
| `mustache_scale` | 4 | |
| `mustache_y_position` | 5 | |
| *(align 8)* | | |
| *(glasses, etc.)* | | `glasses_type`, `glasses_color`, `mole_type`, … |
| `creator_name` | 0x14 bytes | UTF-16LE |
| `crc` | 16 | bytes 0x5E–0x5F (big-endian) |

## Colors

The color fields are 3/4 bits wide and are resolved to real color ids via the
**ToVer3** tables (from mii-creator-dev): `TO_VER3_EYE_COLOR`,
`TO_VER3_MOUTH_COLOR`, `TO_VER3_GLASS_COLOR`, `TO_VER3_GLASS_TYPE`,
`TO_VER3_FACELINE_COLOR`.

## Rendering

Rendering is FFL.js only, and it needs a resource archive you supply yourself.

### FFL.js (the only renderer)

[FFL.js](https://github.com/ariankordi/FFL.js) is a JavaScript port of the
console's own FFL (FaceLib) character engine. It renders a profile **exactly**
like the game does - feature positions, sizes and rotations are all computed by
the original code rather than approximated.

- Desktop: runs headless on Node.js through the `webgpu` npm package (software
  WebGPU device, no GPU required) - `GUI/ffl_renderer/render_mii.js`.
- Android: runs the same wasm build in a WebView on WebGL -
  `logic/FflRenderer.kt`.
- Input: the profile's Studio data (`studio_data()`, 47 bytes) or the raw
  0x60-byte record; output: an RGBA image with a transparent background, using
  the icon camera pose (`ModelIcon`).

### The resource archive is yours to supply

FFL needs `FFLResHigh.dat` (= `AFLResHigh_2_3.dat`), which is Nintendo's
copyrighted data. It is **never bundled, committed or downloaded** by this
project: you point the desktop tool (`Provide FFL resource...`) or the Android
app (Settings -> Resources) at your own copy, dumped from hardware or a title
you own, and it stays in local storage.

### Without it: a neutral placeholder

When no resource is present, both applications show the profile's initial on its
favourite-colour plate. There is deliberately no second renderer: an earlier
revision composited the platform holder's own part textures pulled from their
CDN, which is neither ours to fetch nor ours to cache. See
`THIRD_PARTY_NOTICES.md`.

The favourite (clothes) colour palette used for that plate is the 12-entry table
in `mii_decode.FAVORITE_COLORS`.
