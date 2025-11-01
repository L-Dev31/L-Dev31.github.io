import { state, MAX_STRING_READ_LENGTH, CONTROL_CODE_PARAMS } from './state.js';
import { safeGetUint16, safeGetUint32, readAscii, formatHex } from './utils.js';
import { tokenRegex, encodeSpecialCode, isSpecialControl, parseSpecialToken } from './tokens.js';
import { normalizeInput } from './utils.js';
import { planDatLayout, updateCalculatedOffsets } from './layout.js';

function findSection(bytes, tag) {
  const pattern = new Uint8Array(tag.length);
  for (let i = 0; i < tag.length; i += 1) {
    pattern[i] = tag.charCodeAt(i);
  }
  for (let i = 0; i <= bytes.length - pattern.length; i += 1) {
    let match = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (bytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  throw new Error(`Section ${tag} not found.`);
}

function safeReadBmgString(view, pointer, limit, maxLength = MAX_STRING_READ_LENGTH) {
  if (pointer < 0 || pointer >= limit) {
    return { text: '', length: 0, leadingNull: false, byteLength: 0 };
  }
  let pos = pointer;
  let length = 0;
  let hadLeadingNull = false;
  const parts = [];
  let unitCount = 0;
  const startPos = pos;

  if (pos + 1 < limit) {
    const maybeControl = safeGetUint16(view, pos, limit);
    if (maybeControl === 0) {
      hadLeadingNull = true;
      pos += 2;
      length += 2;
    }
  }

  while (pos + 1 < limit && unitCount < maxLength) {
    const code = safeGetUint16(view, pos, limit);
    pos += 2;
    length += 2;
    unitCount++;
    
    if (code === 0) {
      break;
    }
    
    if (code === 0x000A) {
      parts.push('\n');
      continue;
    }

    if (isSpecialControl(code)) {
      const paramCount = CONTROL_CODE_PARAMS.get(code) ?? 0;
      const params = [];
      if (pos + (paramCount * 2) > limit) {
        break;
      }
      for (let i = 0; i < paramCount; i += 1) {
        const param = safeGetUint16(view, pos, limit);
        params.push(param);
        pos += 2;
        length += 2;
      }
      parts.push(encodeSpecialCode(code, params));
      continue;
    }
    
    const char = String.fromCharCode(code);
    parts.push(char);
  }
  
  if (unitCount >= maxLength) {
    console.warn(`String at 0x${formatHex(pointer, 6)} exceeded max length of ${maxLength}. Truncating.`);
  }

  const text = parts.join('');
  const byteLength = pos - startPos;
  return { text, length, leadingNull: hadLeadingNull, byteLength };
}

function encodeBmgString(value, options = {}) {
  const normalized = normalizeInput(value);
  const { leadingNull = false } = options;
  const regex = tokenRegex();
  const codes = leadingNull ? [0] : [];
  let lastIndex = 0;
  let match;

  function appendSegment(segment) {
    for (let i = 0; i < segment.length; ) {
      const codePoint = segment.codePointAt(i);
      if (codePoint === undefined) {
        break;
      }
      if (codePoint > 0xffff) {
        const adjusted = codePoint - 0x10000;
        const high = 0xd800 + (adjusted >> 10);
        const low = 0xdc00 + (adjusted & 0x3ff);
        codes.push(high, low);
        i += 2;
      } else {
        codes.push(codePoint);
        i += 1;
      }
    }
  }

  while ((match = regex.exec(normalized)) !== null) {
    const segment = normalized.slice(lastIndex, match.index);
    if (segment) {
      appendSegment(segment);
    }
    const label = match[1] ?? '';
    const parsed = parseSpecialToken(label);
    if (!parsed) {
      appendSegment(match[0]);
    } else {
      const expected = CONTROL_CODE_PARAMS.get(parsed.code);
      if (typeof expected === 'number' && parsed.params.length !== expected) {
        appendSegment(match[0]);
      } else {
        codes.push(parsed.code);
        parsed.params.forEach((param) => {
          codes.push(param);
        });
      }
    }
    lastIndex = match.index + match[0].length;
  }

  const tail = normalized.slice(lastIndex);
  if (tail) {
    appendSegment(tail);
  }

  codes.push(0);
  const out = new Uint8Array(codes.length * 2);
  codes.forEach((code, index) => {
    out[index * 2] = code & 0xff;
    out[index * 2 + 1] = code >> 8;
  });
  return out;
}

// parseBmg and buildBmg are too long, I'll add them later

function parseBmg(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const bufferLimit = view.byteLength;
  
  const signature = readAscii(bytes, 0, 4);
  if (signature !== 'MESG') {
    throw new Error('Unsupported file header (expected MESG magic).');
  }
  
  const bmgType = readAscii(bytes, 0, 8);
  const fileSize = safeGetUint32(view, 8, bufferLimit);
  const sectionsCount = safeGetUint32(view, 12, bufferLimit);
  const encoding = view.getUint8(16);
  
  const infOffset = findSection(bytes, 'INF1');
  const datOffset = findSection(bytes, 'DAT1');
  let midOffset = -1;
  let midSize = 0;
  try {
    midOffset = findSection(bytes, 'MID1');
    midSize = safeGetUint32(view, midOffset + 4, bufferLimit);
  } catch (e) {
  }
  
  const infSize = safeGetUint32(view, infOffset + 4, bufferLimit);
  const entryCount = safeGetUint16(view, infOffset + 8, bufferLimit);
  const entrySize = safeGetUint16(view, infOffset + 10, bufferLimit);
  const usedInfBytes = entryCount * entrySize;
  const headerBytes = Math.max(0, infSize - 8 - usedInfBytes);
  const entryStart = infOffset + 8 + headerBytes;
  
  const datDeclaredSize = safeGetUint32(view, datOffset + 4, bufferLimit);
  const datBase = datOffset + 8;
  const nextSectionOffset = midOffset >= 0 ? midOffset : bytes.length;
  const datActualSize = midOffset >= 0 
    ? Math.min(datDeclaredSize, nextSectionOffset - datBase)
    : Math.max(datDeclaredSize, bytes.length - datBase);
  const datLimit = bytes.length;
  const datSegmentsMap = new Map();

  function ensureDatSegment(offset) {
    if (!datSegmentsMap.has(offset)) {
      datSegmentsMap.set(offset, {
        originalOffset: offset,
        bytes: null,
        entryIndices: [],
        midRefs: [],
        leadingNull: false,
        text: '',
        type: 'raw'
      });
    }
    return datSegmentsMap.get(offset);
  }
  
  const entries = [];
  for (let index = 0; index < entryCount; index += 1) {
    const base = entryStart + index * entrySize;
    if (base + entrySize > bufferLimit) {
      throw new Error(`INF1 Entry #${index} read out of bounds. File may be corrupt.`);
    }
    const messageId = entrySize >= 2 ? safeGetUint16(view, base, bufferLimit) : 0;
    const groupId = entrySize >= 4 ? safeGetUint16(view, base + 2, bufferLimit) : 0;
    const attr1 = entrySize >= 6 ? safeGetUint16(view, base + 4, bufferLimit) : 0;
    const attr2 = entrySize >= 8 ? safeGetUint16(view, base + 6, bufferLimit) : 0;
    const offsetFieldOffset = base + entrySize - 4;
    const offset = safeGetUint32(view, offsetFieldOffset, bufferLimit);
    const attributeBytes = bytes.slice(base, offsetFieldOffset);
    const attributeHex = Array.from(attributeBytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const compositeId = (BigInt(groupId) << 16n) | BigInt(messageId);
    const extraFields = [];
    for (let pos = 8; pos < entrySize - 4; pos += 2) {
      extraFields.push(safeGetUint16(view, base + pos, bufferLimit));
    }

    const { text, length, leadingNull } = safeReadBmgString(view, datBase + offset, datLimit);
    const originalBytes = bytes.slice(datBase + offset, datBase + offset + length);
    const byteLength = originalBytes.length;
    const segment = ensureDatSegment(offset);
    segment.type = 'entry';
    segment.entryIndices.push(index);
    if (!segment.bytes) {
      segment.bytes = originalBytes;
      segment.leadingNull = leadingNull;
      segment.text = text;
    }
    
    entries.push({
      kind: 'inf',
      id: index,
      index,
      messageId,
      groupId,
      attr1,
      attr2,
      extraFields,
      attributeBytes,
      attributeHex,
      compositeId,
      offset,
      originalOffset: offset,
      text,
      originalText: text,
      originalBytes,
      leadingNull,
      originalLeadingNull: leadingNull,
      dirty: false,
      byteLength
    });

    console.log(`Parsed INF1 entry ${index}: text="${text}", offset=${offset}, messageId=${messageId}, groupId=${groupId}`);
  }

  let midEntryCount = 0;
  let midEntrySize = 0;
  let midColumnCount = 0;
  let midRowCount = 0;
  let midReserved = 0;
  let midEntries = [];
  let midIds = [];
  let midKind = 'none';

  if (midOffset >= 0 && midSize > 0) {
    const midBase = midOffset + 8;
    midEntryCount = safeGetUint16(view, midBase, bufferLimit);
    midEntrySize = safeGetUint16(view, midBase + 2, bufferLimit);
    midReserved = safeGetUint32(view, midBase + 4, bufferLimit);
    midColumnCount = midEntrySize > 0 ? Math.max(1, Math.floor(midEntrySize / 4)) : 0;
    const midDataBytes = Math.max(0, midSize - 8);
    midRowCount = midColumnCount > 0 && midEntrySize > 0 ? Math.floor(midDataBytes / midEntrySize) : 0;

    if (midRowCount > 0 && midColumnCount > 0) {
      const usableCells = midRowCount * midColumnCount;
      midEntries = new Array(midRowCount);
      let pointerCandidates = 0;
      let pointerInvalid = 0;
      const midDataStart = midBase + 8;

      for (let row = 0; row < midRowCount; row += 1) {
        const midEntryBase = midDataStart + row * midEntrySize;
        if (midEntryBase + midEntrySize > bufferLimit) {
          console.warn(`MID1 row ${row} read out of bounds. Stopping MID parse.`);
          midRowCount = row;
          break;
        }
        const values = new Array(midColumnCount);
        for (let column = 0; column < midColumnCount; column += 1) {
          const value = safeGetUint32(view, midEntryBase + column * 4, bufferLimit);
          values[column] = value;
          if (value !== 0) {
            pointerCandidates += 1;
            const pointerOffset = value & ~1;
            const pointerAbsolute = datBase + pointerOffset;
            const withinBuffer = pointerAbsolute >= datBase && pointerAbsolute < datLimit;
            if (!withinBuffer) {
              pointerInvalid += 1;
            }
          }
        }
        midEntries[row] = values;
      }

      

      const pointerMode = pointerCandidates > 0 && pointerInvalid === 0;
      if (pointerMode) {
        midKind = 'pointers';
        for (let row = 0; row < midRowCount; row += 1) {
          const values = midEntries[row];
          for (let column = 0; column < midColumnCount; column += 1) {
            const pointer = values[column];
            if (!pointer) {
              continue;
            }
            const pointerOffset = pointer & ~1;
            const pointerFlags = pointer & 1;
            const segment = ensureDatSegment(pointerOffset);
            if (segment.type !== 'entry') {
              segment.type = 'mid';
            }
            segment.midRefs.push({ row, column, flags: pointerFlags, raw: pointer });
            if (!segment.bytes) {
              const info = safeReadBmgString(view, datBase + pointerOffset, datLimit);
              segment.bytes = bytes.slice(datBase + pointerOffset, datBase + pointerOffset + info.length);
              segment.leadingNull = info.leadingNull;
              segment.text = info.text;
            }
          }
        }
      } else if (midEntryCount > 0) {
        midKind = 'ids';
        const total = Math.min(midEntryCount, usableCells);
        midIds = new Array(total);
        for (let row = 0; row < midRowCount; row += 1) {
          const values = midEntries[row];
          for (let column = 0; column < midColumnCount; column += 1) {
            const index = row * midColumnCount + column;
            if (index >= total) {
              break;
            }
            const idValue = values[column];
            midIds[index] = idValue;
            
            if (idValue > 0) {
            }
          }
        }
      }
    }
  }

  const segmentOffsets = [...datSegmentsMap.keys()].sort((a, b) => a - b);
  const datSegments = [];
  let cursor = 0;
  segmentOffsets.forEach((offset) => {
    const segment = datSegmentsMap.get(offset);
    if (!segment || !segment.bytes) {
      return;
    }
    if (offset > cursor) {
      const gapBytes = bytes.slice(datBase + cursor, datBase + offset);
      if (gapBytes.length) {
        datSegments.push({
          originalOffset: cursor,
          bytes: gapBytes,
          entryIndices: [],
          midRefs: [],
          leadingNull: false,
          text: '',
          type: 'raw'
        });
      }
    }
    datSegments.push({
      originalOffset: segment.originalOffset,
      bytes: segment.bytes,
      entryIndices: [...segment.entryIndices],
      midRefs: [...segment.midRefs],
      leadingNull: segment.leadingNull,
      text: segment.text,
      type: segment.type
    });
    cursor = offset + segment.bytes.length;
  });
  if (cursor < datActualSize) {
    const tailBytes = bytes.slice(datBase + cursor, datBase + datActualSize);
    if (tailBytes.length) {
      datSegments.push({
        originalOffset: cursor,
        bytes: tailBytes,
        entryIndices: [],
        midRefs: [],
        leadingNull: false,
        text: '',
        type: 'raw'
      });
    }
  }

  const midStrings = [];
  
  if (midKind === 'ids' && midIds.length > 0) {
    const usedOffsets = new Set();
    entries.forEach(entry => {
      if (typeof entry.offset === 'number') {
        usedOffsets.add(entry.offset);
      }
    });
    datSegmentsMap.forEach((segment, offset) => {
      if (!segment) return;
      if ((segment.entryIndices && segment.entryIndices.length > 0) ||
          (segment.midRefs && segment.midRefs.length > 0) ||
          segment.type === 'entry' ||
          segment.type === 'mid' ||
          segment.type === 'mid-id') {
        usedOffsets.add(offset);
      }
    });
    
    let scanOffset = 0;
    let midStringIndex = 0;
    
    while (scanOffset < datActualSize && midStringIndex < midIds.length) {
      const absolutePos = datBase + scanOffset;
      if (absolutePos >= bytes.length) break;
      
      if (usedOffsets.has(scanOffset)) {
        try {
          const info = safeReadBmgString(view, absolutePos, bytes.length);
          scanOffset += info.length;
        } catch (e) {
          scanOffset += 2;
        }
        continue;
      }
      
      if (absolutePos + 1 < bytes.length && bytes[absolutePos] === 0 && bytes[absolutePos + 1] === 0) {
        scanOffset += 2;
        continue;
      }
      
      try {
  const info = safeReadBmgString(view, absolutePos, bytes.length);
        if (info && info.text && info.text.trim().length > 0 && info.length > 2) {
          const row = Math.floor(midStringIndex / midColumnCount);
          const column = midStringIndex % midColumnCount;
          const midId = midIds[midStringIndex] || 0;
          const segment = ensureDatSegment(scanOffset);
          if (!segment.bytes) {
            segment.bytes = bytes.slice(absolutePos, absolutePos + info.byteLength);
            segment.leadingNull = info.leadingNull;
            segment.text = info.text;
          }
          if (segment.type !== 'entry') {
            segment.type = 'mid-id';
          }
          segment.midRefs.push({ row, column, flags: 0, raw: midId });
          midStringIndex++;
        }
        scanOffset += Math.max(2, info.byteLength);
      } catch (e) {
        scanOffset += 2;
      }
    }
    
    const updatedOffsets = [...datSegmentsMap.keys()].sort((a, b) => a - b);
    datSegments.length = 0;
    cursor = 0;
    updatedOffsets.forEach((offset) => {
      const segment = datSegmentsMap.get(offset);
      if (!segment || !segment.bytes) {
        return;
      }
      if (offset > cursor) {
        const gapBytes = bytes.slice(datBase + cursor, datBase + offset);
        if (gapBytes.length) {
          datSegments.push({
            originalOffset: cursor,
            bytes: gapBytes,
            entryIndices: [],
            midRefs: [],
            leadingNull: false,
            text: '',
            type: 'raw'
          });
        }
      }
      datSegments.push({
        originalOffset: segment.originalOffset,
        bytes: segment.bytes,
        entryIndices: [...segment.entryIndices],
        midRefs: [...segment.midRefs],
        leadingNull: segment.leadingNull,
        text: segment.text,
        type: segment.type
      });
      cursor = offset + segment.bytes.length;
    });
    if (cursor < datActualSize) {
      const tailBytes = bytes.slice(datBase + cursor, datBase + datActualSize);
      if (tailBytes.length) {
        datSegments.push({
          originalOffset: cursor,
          bytes: tailBytes,
          entryIndices: [],
          midRefs: [],
          leadingNull: false,
          text: '',
          type: 'raw'
        });
      }
    }
  }
  
  datSegments.forEach((segment) => {
    if (segment.type !== 'mid' && segment.type !== 'mid-id') {
      return;
    }
    const id = midStrings.length;
    const references = (segment.midRefs ?? []).map((ref) => ({
      row: ref.row,
      column: ref.column,
      flags: ref.flags ?? 0,
      raw: ref.raw ?? 0
    }));
    const entry = {
      kind: 'mid',
      id,
      offset: segment.originalOffset,
      originalOffset: segment.originalOffset,
      calculatedOffset: segment.originalOffset,
      text: segment.text,
      originalText: segment.text,
      originalBytes: segment.bytes.slice(),
      leadingNull: segment.leadingNull,
      originalLeadingNull: segment.leadingNull,
      dirty: false,
      byteLength: segment.bytes.length,
      references,
      segment
    };
    segment.midEntry = entry;
    midStrings.push(entry);

    console.log(`Parsed MID1 entry ${id}: text="${entry.text}", offset=${entry.offset}, references=${JSON.stringify(entry.references)}`);
  });
  
  return {
    originalBuffer: buffer,
    bytes,
    view,
    entries,
    bmgType,
    encoding,
    sectionsCount,
    fileSize,
    infOffset,
    infSize,
    headerBytes,
    entrySize,
    entryCount,
    entryStart,
    datOffset,
    datBase,
    datDeclaredSize,
    datActualSize,
    midOffset,
    midSize,
    midEntryCount,
    midEntrySize,
    midColumnCount,
    midRowCount,
    midReserved,
    midEntries,
    midIds,
    midKind,
    midStrings,
    datSegments
  };
}

function buildBmg() {
  const layout = planDatLayout(state.entries);
  const { chunks, chunkByEntry, chunkBySegment, dataSize, padding, offsetRemap } = layout;
  
  const before = state.bytes.slice(0, state.datOffset + 8);
  
  const afterStart = state.midOffset >= 0 
    ? state.midOffset 
    : state.bytes.length;
  const after = state.bytes.slice(afterStart);
  
  const newDatSize = dataSize + padding + 8;
  
  const output = new Uint8Array(before.length + dataSize + padding + after.length);
  let pos = 0;
  
  output.set(before, pos);
  pos += before.length;
  
  chunks.forEach((chunk) => {
    output.set(chunk.bytes, pos);
    pos += chunk.bytes.length;
  });
  
  if (padding) {
    output.fill(0, pos, pos + padding);
    pos += padding;
  }
  
  const newMidOffset = pos;
  output.set(after, pos);

  const view = new DataView(output.buffer);
  view.setUint32(state.datOffset + 4, newDatSize, true);
  view.setUint32(8, output.length, true);
  const offsets = new Array(state.entryCount);
  state.entries.forEach((entry) => {
    const chunk = chunkByEntry.get(entry);
    const offset = chunk ? chunk.offset : entry.calculatedOffset ?? entry.offset;
    const base = state.entryStart + entry.index * state.entrySize;
    const offsetFieldOffset = base + state.entrySize - 4;
    view.setUint32(offsetFieldOffset, offset, true);
    offsets[entry.index] = offset;
  });

  if (state.midOffset >= 0 && state.midKind === 'pointers' && state.midRowCount > 0 && state.midColumnCount > 0) {
    const midBase = newMidOffset + 8;
    const midDataStart = midBase + 8;
    for (let row = 0; row < state.midRowCount; row += 1) {
      const rowBase = midDataStart + row * state.midEntrySize;
      const values = state.midEntries?.[row];
      for (let column = 0; column < state.midColumnCount; column += 1) {
        const originalPointer = values ? values[column] : view.getUint32(rowBase + column * 4, true);
        if (!originalPointer) {
          view.setUint32(rowBase + column * 4, 0, true);
          continue;
        }
        const flagBits = originalPointer & 1;
        const pointerOffset = originalPointer & ~1;
        const remapped = offsetRemap.get(pointerOffset);
        if (remapped === undefined) {
          console.warn(`MID1 pointer 0x${formatHex(originalPointer, 6)} not remapped.`);
          view.setUint32(rowBase + column * 4, originalPointer, true);
        } else {
          const nextValue = remapped | flagBits;
          view.setUint32(rowBase + column * 4, nextValue, true);
          if (values) {
            values[column] = nextValue;
          }
        }
      }
    }
  }

  updateCalculatedOffsets(layout);

  return { buffer: output.buffer, offsets };
}

export { findSection, safeReadBmgString, encodeBmgString, parseBmg, buildBmg };