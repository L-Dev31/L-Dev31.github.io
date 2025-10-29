const $ = (selector) => document.querySelector(selector);

const els = {
  fileInput: $('#file-input'),
  fileLabel: $('#file-label'),
  fileMeta: $('#file-meta'),
  search: $('#search'),
  entries: $('#entries'),
  entryCount: $('#entry-count'),
  download: $('#download'),
  exportJson: $('#export-json'),
  importJson: $('#import-json'),
  importJsonInput: $('#import-json-input'),
  filterInf: $('#filter-inf'),
  filterMid: $('#filter-mid'),
  filterEmpty: $('#filter-empty')
};

const HEX_TOKEN_PATTERN = '[0-9A-F]{2}(?::[0-9A-F]{4}(?:,[0-9A-F]{4})*)?';
const NAMED_TOKEN_PATTERN = '[A-Z][A-Z0-9_]{1,15}';
const SPECIAL_TOKEN_PATTERN = `(?:${HEX_TOKEN_PATTERN}|${NAMED_TOKEN_PATTERN})`;
const LEGACY_TOKEN_REGEX = /🔒([0-9a-fA-F]{2})/g;

// Added suggested ENCODINGS map
const ENCODINGS = {
  0x00: 'cp1252',    // Latin-1 (often used for UTF-16LE in practice)
  0x01: 'utf-16le',  // UTF-16 Little Endian
  0x02: 'shift-jis'  // Japanese
};

// Added suggested FLOW_CONTROL_CODES
const NAMED_TOKEN_ENTRIES = [
  [0x06, 'WAIT'],     
  [0x07, 'CLEAR'],    

  [0x00, 'GRAY'],    
  [0x01, 'RED'],     
  [0x02, 'WHITE'],    
];


const NAMED_TOKENS = new Map(NAMED_TOKEN_ENTRIES);
const REVERSE_NAMED_TOKENS = new Map(
  NAMED_TOKEN_ENTRIES.map(([code, label]) => [label, code])
);

const CONTROL_CODE_PARAMS = new Map([
  [0x1a, 1],
  [0xff, 2]
]);

// Max string length (in 16-bit units) to read, prevents infinite loops on corrupt data
const MAX_STRING_READ_LENGTH = 10000;

function formatHex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

// --- Added Safe Reader Functions ---

/**
 * Safely reads a Uint16 from a DataView, checking boundaries.
 * @param {DataView} view The DataView to read from.
 * @param {number} offset The offset to read at.
 * @param {number} limit The absolute byte limit of the buffer.
 * @returns {number} The Uint16 value.
 * @throws {Error} If the read is out of bounds.
 */
function safeGetUint16(view, offset, limit) {
  if (offset + 2 > limit) {
    throw new Error(`Read beyond buffer at offset 0x${offset.toString(16)}`);
  }
  return view.getUint16(offset, true);
}

/**
 * Safely reads a Uint32 from a DataView, checking boundaries.
 * @param {DataView} view The DataView to read from.
 * @param {number} offset The offset to read at.
 * @param {number} limit The absolute byte limit of the buffer.
 * @returns {number} The Uint32 value.
 * @throws {Error} If the read is out of bounds.
 */
function safeGetUint32(view, offset, limit) {
  if (offset + 4 > limit) {
    throw new Error(`Read beyond buffer at offset 0x${offset.toString(16)}`);
  }
  return view.getUint32(offset, true);
}

// --- End Safe Reader Functions ---

function tokenRegex() {
  return new RegExp(`\\[(${SPECIAL_TOKEN_PATTERN})\\]`, 'gi');
}

function encodeSpecialCode(code, params = []) {
  const label = NAMED_TOKENS.get(code);
  if (label) {
    return params.length
      ? `[${label}:${params.map((param) => param.toString(16).padStart(4, '0').toUpperCase()).join(',')}]`
      : `[${label}]`;
  }
  const head = code.toString(16).padStart(2, '0').toUpperCase();
  if (!params.length) {
    return `[${head}]`;
  }
  const tail = params
    .map((param) => param.toString(16).padStart(4, '0').toUpperCase())
    .join(',');
  return `[${head}:${tail}]`;
}

function parseSpecialToken(label) {
  const upper = label.toUpperCase();
  if (REVERSE_NAMED_TOKENS.has(upper)) {
    const code = REVERSE_NAMED_TOKENS.get(upper);
    const params = [];
    // Check param count for named tokens
    const expected = CONTROL_CODE_PARAMS.get(code);
    if (typeof expected === 'number' && expected !== params.length) {
      return null; // Or handle default params if needed
    }
    return { code, params };
  }
  const [head, ...rest] = upper.split(':');
  if (!/^[0-9A-F]{2}$/u.test(head)) {
    return null;
  }
  const code = parseInt(head, 16);
  if (Number.isNaN(code)) {
    return null;
  }
  if (!rest.length) {
    // Check param count for hex codes with no params
    const expected = CONTROL_CODE_PARAMS.get(code);
    if (typeof expected === 'number' && expected !== 0) {
      return null;
    }
    return { code, params: [] };
  }
  const paramStrings = rest.join(':').split(',');
  if (paramStrings.some((chunk) => !/^[0-9A-F]{4}$/u.test(chunk))) {
    return null;
  }
  const params = paramStrings.map((chunk) => parseInt(chunk, 16));
  if (params.some((value) => Number.isNaN(value))) {
    return null;
  }
  const expected = CONTROL_CODE_PARAMS.get(code);
  if (typeof expected === 'number' && expected !== params.length) {
    return null;
  }
  return { code, params };
}

function isSpecialControl(code) {
  if (CONTROL_CODE_PARAMS.has(code)) {
    return true;
  }
  // Added named tokens to this check
  if (NAMED_TOKENS.has(code)) {
    return true;
  }
  return code > 0 && code < 32 && code !== 10;
}

const state = {
  fileName: '',
  originalBuffer: null,
  bytes: null,
  view: null,
  entries: [],
  infOffset: 0,
  infSize: 0,
  headerBytes: 0,
  entrySize: 0,
  entryCount: 0,
  entryStart: 0,
  datOffset: 0,
  datBase: 0,
  datDeclaredSize: 0,
  datActualSize: 0,
  filter: '',
  message: '',
  messageTone: 'info',
  previewDatSize: 0,
  previewDatPadding: 0,
  bmgType: '',
  encoding: 0,
  sectionsCount: 0,
  fileSize: 0,
  midOffset: -1,
  midSize: 0,
  midEntryCount: 0,
  midEntrySize: 0,
  midColumnCount: 0,
  midReserved: 0,
  midRowCount: 0,
  midEntries: [],
  midIds: [],
  midKind: 'none',
  midStrings: [],
  datSegments: [],
  lastLayout: null
};

function resolveEntry(kind, id) {
  const index = Number(id);
  if (Number.isNaN(index) || index < 0) {
    return null;
  }
  if (kind === 'mid') {
    return state.midStrings?.[index] ?? null;
  }
  return state.entries?.[index] ?? null;
}

els.fileInput.addEventListener('change', handleFileSelection);
els.search.addEventListener('input', onFilter);
els.download.addEventListener('click', handleDownload);
els.exportJson.addEventListener('click', handleExportJson);
els.importJson.addEventListener('click', handleImportJsonClick);
els.importJsonInput.addEventListener('change', handleImportJsonFile);
els.filterInf.addEventListener('change', renderEntries);
els.filterMid.addEventListener('change', renderEntries);
els.filterEmpty.addEventListener('change', renderEntries);

function planDatLayout(entries) {
  const segments = (state.datSegments ?? []).slice();
  
  // For ID mode, preserve EXACT absolute positions of ALL segments (including MID)
  // The scanner finds unused strings at specific offsets, so we must preserve their positions
  if (state.midKind === 'ids' && state.midStrings && state.midStrings.length > 0) {
    // Sort ALL segments by original offset (preserve the natural order in DAT)
    segments.sort((a, b) => a.originalOffset - b.originalOffset);
    
    // Rebuild with padding to maintain absolute offsets
    const paddedSegments = [];
    let cursor = 0;
    
    segments.forEach((seg, idx) => {
      const targetOffset = seg.originalOffset;
      
      // If this segment was originally after current cursor, add padding
      if (targetOffset > cursor) {
        const paddingSize = targetOffset - cursor;
        paddedSegments.push({
          originalOffset: cursor,
          bytes: new Uint8Array(paddingSize).fill(0),  // null padding
          entryIndices: [],
          midRefs: [],
          leadingNull: false,
          text: '',
          type: 'raw'
        });
        cursor = targetOffset;
      }
      
      // Add the segment at its original position
      paddedSegments.push(seg);
      cursor += (seg.bytes?.length || 0);
    });
    
    // Replace segments with padded version
    segments.length = 0;
    paddedSegments.forEach(s => segments.push(s));
  } else {
    // Normal mode: sort all by original offset
    segments.sort((a, b) => a.originalOffset - b.originalOffset);
  }
  
  const chunks = [];
  const chunkByEntry = new Map();
  const chunkBySegment = new Map();
  const offsetRemap = new Map();

  segments.forEach((segment) => {
    const entryIndices = segment.entryIndices ?? [];
    const segmentEntries = entryIndices
      .map((index) => entries[index])
      .filter((entry) => entry !== undefined);
    let bytes = segment.bytes ?? new Uint8Array(0);

    // Check if this is a MID segment
    const isMidSegment = segment.type === 'mid' || segment.type === 'mid-id';
    const midEntry = isMidSegment ? segment.midEntry : null;

    if (segmentEntries.length) {
      const canonical = segmentEntries[0];
      const mismatch = segmentEntries.some((entry) => (
        entry.leadingNull !== canonical.leadingNull
        || entry.text !== canonical.text
      ));
      if (mismatch) {
        throw new Error(
          `Entries ${segmentEntries.map((entry) => entry.index).join(', ')} share DAT offset 0x${formatHex(segment.originalOffset, 6)}. Keep their text identical.`
        );
      }
      const requiresEncoding = segmentEntries.some((entry) => entry.dirty)
        || segmentEntries.some((entry) => (
          entry.text !== entry.originalText
          || entry.leadingNull !== entry.originalLeadingNull
        ));
      if (requiresEncoding) {
        bytes = encodeBmgString(canonical.text, { leadingNull: canonical.leadingNull });
      }
    } else if (midEntry && midEntry.dirty) {
      // Handle dirty MID strings
      bytes = encodeBmgString(midEntry.text, { leadingNull: midEntry.leadingNull });
    }

    const chunk = {
      originalOffset: segment.originalOffset,
      bytes,
      entryIndices,
      midRefs: segment.midRefs ?? [],
      type: segment.type ?? 'raw'
    };
    chunk.segment = segment;
    chunks.push(chunk);
  });

  let cursor = 0;
  chunks.forEach((chunk) => {
    chunk.offset = cursor;
    offsetRemap.set(chunk.originalOffset, chunk.offset);
    chunkBySegment.set(chunk.segment, chunk);
    if (chunk.entryIndices.length) {
      chunk.entryIndices.forEach((index) => {
        const entry = entries[index];
        if (entry) {
          chunkByEntry.set(entry, chunk);
          entry.byteLength = chunk.bytes.length;
        }
      });
    }
    cursor += chunk.bytes.length;
  });

  const padding = (4 - (cursor % 4)) % 4;
  return { chunks, chunkByEntry, chunkBySegment, dataSize: cursor, padding, offsetRemap };
}

function updateCalculatedOffsets(layout) {
  let resolvedLayout;
  try {
    resolvedLayout = layout ?? planDatLayout(state.entries);
  } catch (error) {
    console.error(error);
    showMessage(error instanceof Error ? error.message : 'Failed to update offsets.', 'error');
    return null;
  }
  const { chunkByEntry, chunkBySegment, dataSize, padding } = resolvedLayout;
  state.entries.forEach((entry) => {
    const chunk = chunkByEntry.get(entry);
    if (chunk) {
      entry.byteLength = chunk.bytes.length;
      entry.calculatedOffset = chunk.offset;
    } else {
      entry.byteLength = entry.originalBytes.length;
      entry.calculatedOffset = entry.offset;
    }
  });
  if (Array.isArray(state.midStrings)) {
    state.midStrings.forEach((entry) => {
      const segment = entry.segment;
      if (!segment) {
        entry.byteLength = entry.byteLength ?? (entry.originalBytes?.length ?? 0);
        entry.calculatedOffset = entry.calculatedOffset ?? entry.offset;
        return;
      }
      const chunk = chunkBySegment?.get(segment);
      entry.byteLength = segment.bytes?.length ?? entry.byteLength ?? 0;
      entry.calculatedOffset = chunk ? chunk.offset : entry.offset;
    });
  }
  state.previewDatSize = dataSize;
  state.previewDatPadding = padding;
  state.lastLayout = resolvedLayout;
  return resolvedLayout;
}

function refreshEntryMetrics() {
  document.querySelectorAll('.entry-card').forEach((card) => {
    const kind = card.dataset.kind;
    const id = card.dataset.id;
    const entry = resolveEntry(kind, id);
    if (!entry) {
      return;
    }
    card.dataset.color = entry.color ?? 'default';
    const charCountEl = card.querySelector('.char-count');
    if (charCountEl) {
      charCountEl.textContent = formatCharCount(entry);
    }
    const offsetEl = card.querySelector('.offset');
    if (offsetEl) {
      offsetEl.textContent = formatOffsetLabel(entry);
    }
    const attrEl = card.querySelector('.attr');
    if (attrEl) {
      attrEl.textContent = formatAttrLabel(entry);
    }
    const badges = card.querySelector('.badges');
    if (badges) {
      updateBadges(badges, entry);
    }
    const highlight = card.querySelector('.text-highlight');
    if (highlight) {
      highlight.dataset.entryKind = entry.kind;
      highlight.dataset.entryColor = entry.color ?? 'default';
      updateTextHighlight(highlight, entry.text);
    }
  });
}

function handleFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) {
    resetUi();
    return;
  }
  els.fileLabel.textContent = `${file.name}`;
  file.arrayBuffer()
    .then((buffer) => {
      try {
        loadBuffer(buffer, file.name);
        console.log('Total entries:', state.entries.length);
        console.log('Total MID strings:', state.midStrings?.length ?? 0);
        console.log('MID kind:', state.midKind);
        console.log('Sample MID strings:', state.midStrings?.slice(0, 5).map((entry) => ({
          id: entry.id,
          text: entry.text.slice(0, 50),
          offset: `0x${entry.offset.toString(16)}`
        })) ?? []);
        // Show file info message by default, warnings may overwrite this
        showMessage(`${file.name} • ${formatBytes(buffer.byteLength)}`, 'success');
        
        // Check encoding and show warning if not UTF-16LE
        if (state.encoding !== 0x01) {
          const encodingName = ENCODINGS[state.encoding] || `Unknown (0x${formatHex(state.encoding, 2)})`;
          const message = `Warning: File encoding is ${encodingName}. This editor only supports UTF-16LE (0x01). Text may appear corrupt.`;
          showMessage(message, 'warning');
          console.warn(message);
        }
        
      } catch (error) {
        console.error(error);
        resetUi();
        showMessage(error instanceof Error ? error.message : String(error), 'error');
      }
    })
    .catch((error) => {
      console.error(error);
      resetUi();
      showMessage('Unable to read file.', 'error');
    });
}

function loadBuffer(buffer, name) {
  const parsed = parseBmg(buffer);
  Object.assign(state, parsed, { fileName: name, filter: '', message: '', messageTone: 'info' });
  els.search.value = '';
  els.search.disabled = false;
  els.download.disabled = false;
  els.exportJson.disabled = false;
  els.importJson.disabled = false;
  updateCalculatedOffsets();
  renderEntries();
  updateMeta();
  updateSaveButton();
}

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
  const encoding = view.getUint8(16); // No safeGetUint8, but it's fine
  
  const infOffset = findSection(bytes, 'INF1');
  const datOffset = findSection(bytes, 'DAT1');
  let midOffset = -1;
  let midSize = 0;
  try {
    midOffset = findSection(bytes, 'MID1');
    midSize = safeGetUint32(view, midOffset + 4, bufferLimit);
  } catch (e) {
    // MID1 section is optional
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
  // DAT actual size should not extend beyond the next section (MID1)
  const datActualSize = midOffset >= 0 
    ? Math.min(datDeclaredSize, nextSectionOffset - datBase)
    : Math.max(datDeclaredSize, bytes.length - datBase);
  const datLimit = bytes.length; // Use full file buffer
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
      kind: 'entry',
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
           midRowCount = row; // Truncate row count
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

      console.log('MID pointer analysis:', {
        pointerCandidates,
        pointerInvalid,
        midRowCount,
        midColumnCount
      });

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
            
            // Try to find and extract string for this ID
            // The ID might be a composite messageId, so try to find matching strings in DAT
            if (idValue > 0) {
              // Scan DAT section for this ID value (treat it as a potential message ID)
              // Since we don't have a direct pointer, we'll mark segments as MID-referenced
              // if they're not already used by INF entries
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
    // When MID contains IDs, scan DAT for unused strings
    const usedOffsets = new Set();
    entries.forEach(entry => {
      if (typeof entry.offset === 'number') {
        usedOffsets.add(entry.offset);
      }
    });
    
    // Scan DAT section for null-terminated strings not used by INF entries
    let scanOffset = 0;
    let midStringIndex = 0;
    
    while (scanOffset < datActualSize && midStringIndex < midIds.length) {
      const absolutePos = datBase + scanOffset;
      if (absolutePos >= bytes.length) break;
      
      // Skip if this offset is used by an INF entry
      if (usedOffsets.has(scanOffset)) {
        try {
          const info = safeReadBmgString(view, absolutePos, bytes.length);
          scanOffset += info.length;
        } catch (e) {
          scanOffset += 2;
        }
        continue;
      }
      
      // Check for null-terminator pair
      if (absolutePos + 1 < bytes.length && bytes[absolutePos] === 0 && bytes[absolutePos + 1] === 0) {
        scanOffset += 2;
        continue;
      }
      
      // Try to read a string at this position
      try {
        const info = safeReadBmgString(view, absolutePos, bytes.length);
        if (info && info.text && info.text.trim().length > 0 && info.length > 2) {
          // Found an unused string - create segment and MID entry for it
          const row = Math.floor(midStringIndex / midColumnCount);
          const column = midStringIndex % midColumnCount;
          const midId = midIds[midStringIndex] || 0;
          
          // Create or get segment for this offset
          const segment = ensureDatSegment(scanOffset);
          if (!segment.bytes) {
            segment.bytes = bytes.slice(absolutePos, absolutePos + info.length);
            segment.leadingNull = info.leadingNull;
            segment.text = info.text;
          }
          if (segment.type !== 'entry') {
            segment.type = 'mid-id';
          }
          segment.midRefs.push({ row, column, flags: 0, raw: midId });
          
          midStringIndex++;
        }
        scanOffset += Math.max(2, info.length);
      } catch (e) {
        scanOffset += 2;
      }
    }
    
    // Rebuild datSegments array to include newly added MID segments
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
  
  // Extract strings from MID pointer segments and MID-ID segments
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
    const color = references.some((ref) => (ref.flags & 1) !== 0) ? 'red' : 'default';
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
      color,
      segment
    };
    segment.midEntry = entry;
    midStrings.push(entry);
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

/**
 * Renamed to safeReadBmgString and added maxLength check.
 * @param {DataView} view
 * @param {number} pointer
 * @param {number} limit
 * @param {number} [maxLength=10000]
 * @returns {{text: string, length: number, leadingNull: boolean}}
 */
function safeReadBmgString(view, pointer, limit, maxLength = MAX_STRING_READ_LENGTH) {
  if (pointer < 0 || pointer >= limit) {
    return { text: '', length: 0, leadingNull: false };
  }
  let pos = pointer;
  let length = 0;
  let hadLeadingNull = false;
  const parts = [];
  let unitCount = 0; // Counter for 16-bit units

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
      break; // End of string
    }
    
    if (isSpecialControl(code)) {
      const paramCount = CONTROL_CODE_PARAMS.get(code) ?? 0;
      const params = [];
      
      // Peek at the parameter to detect corruption
      let isCorrupted = false;
      if (paramCount > 0 && pos + 1 < limit) {
        const firstParam = safeGetUint16(view, pos, limit);
        // If parameter looks like a printable ASCII letter (A-Z, a-z), treat as corrupted
        if ((firstParam >= 0x0041 && firstParam <= 0x005A) || // A-Z
            (firstParam >= 0x0061 && firstParam <= 0x007A)) { // a-z
          isCorrupted = true;
        }
      }
      
      if (isCorrupted) {
        parts.push(encodeSpecialCode(code));
      } else {
        // Normal control code processing
        if (pos + (paramCount * 2) > limit) {
           // Not enough data for params, break loop to avoid error
           console.warn(`Control code 0x${formatHex(code,2)} at 0x${formatHex(pos-2, 6)} expects ${paramCount} params but buffer ended.`);
           break;
        }
        for (let i = 0; i < paramCount; i += 1) {
          const param = safeGetUint16(view, pos, limit);
          params.push(param);
          pos += 2;
          length += 2;
        }
        parts.push(encodeSpecialCode(code, params));
      }
    } else {
      parts.push(String.fromCodePoint(code));
    }
  }
  
  if (unitCount >= maxLength) {
    console.warn(`String at 0x${formatHex(pointer, 6)} exceeded max length of ${maxLength}. Truncating.`);
  }

  const text = parts.join('');
  return { text, length, leadingNull: hadLeadingNull };
}

function renderEntries() {
  els.entries.innerHTML = '';
  const fragment = document.createDocumentFragment();
  const all = [...(state.entries ?? []), ...(state.midStrings ?? [])];
  
  // Groupe les messages MID avec effet de défilement
  const displayEntries = [];
  const processed = new Set();
  
  all.forEach((entry, index) => {
    if (processed.has(index)) return;
    
    if (entry.kind === 'mid') {
      // Cherche si c'est le début d'un groupe scrolling
      const group = [entry];
      let j = index + 1;
      let prevText = entry.text.replace(/\n/g, '');
      
      while (j < all.length && all[j].kind === 'mid') {
        const nextText = all[j].text.replace(/\n/g, '');
        if (nextText === prevText.slice(1) && nextText.length > 0) {
          group.push(all[j]);
          processed.add(j);
          prevText = nextText;
          j++;
        } else {
          break;
        }
      }
      
      // Ajoute le groupe (ou message simple)
      displayEntries.push({
        ...entry,
        isScrollingGroup: group.length > 1,
        scrollingIds: group.map(e => e.id),
        scrollingCount: group.length
      });
    } else {
      displayEntries.push(entry);
    }
    
    processed.add(index);
  });
  
  const activeEntries = displayEntries.filter(matchesFilter);
  activeEntries.forEach((entry) => {
    const card = buildEntryCard(entry);
    fragment.appendChild(card);
  });
  els.entries.appendChild(fragment);

  // Compute visible count: scrolling groups represent multiple MID entries
  const visibleCount = activeEntries.reduce((sum, entry) => {
    if (entry.kind === 'mid' && entry.isScrollingGroup) {
      return sum + (entry.scrollingCount || 1);
    }
    return sum + 1;
  }, 0);

  updateEntryCount(visibleCount);
}

function matchesFilter(entry) {
  // Check type filters first
  if (entry.kind === 'mid' && !els.filterMid.checked) {
    return false;
  }
  if (entry.kind !== 'mid' && !els.filterInf.checked) {
    return false;
  }
  // Hide empty entries if "Empty" is unticked
  if (!els.filterEmpty.checked && (!entry.text || entry.text.trim() === '')) {
    return false;
  }
  
  const query = state.filter.trim().toLowerCase();
  if (!query) {
    return true;
  }
  if (entry.kind === 'mid') {
    const pointerHex = `0x${entry.offset.toString(16)}`.toLowerCase();
    if (pointerHex.includes(query)) {
      return true;
    }
    const midLabel = `mid${entry.id + 1}`;
    if (midLabel.includes(query)) {
      return true;
    }
    if ((entry.color ?? '').toLowerCase().includes(query)) {
      return true;
    }
    if (entry.references && entry.references.some((ref) => `row${ref.row}`.includes(query) || `col${ref.column}`.includes(query) || `${ref.row}:${ref.column}`.includes(query))) {
      return true;
    }
    const text = entry.text.toLowerCase();
    const original = entry.originalText.toLowerCase();
    return text.includes(query) || original.includes(query);
  }
  if (`${entry.index}`.includes(query)) {
    return true;
  }
  if (`0x${entry.offset.toString(16)}`.toLowerCase().includes(query)) {
    return true;
  }
  if (typeof entry.messageId === 'number') {
    const messageIdDec = entry.messageId.toString();
    if (messageIdDec.includes(query)) {
      return true;
    }
    const messageIdHex = `0x${formatHex(entry.messageId, 4)}`.toLowerCase();
    if (messageIdHex.includes(query)) {
      return true;
    }
  }
  if (typeof entry.groupId === 'number') {
    const groupIdDec = entry.groupId.toString();
    if (groupIdDec.includes(query)) {
      return true;
    }
    const groupIdHex = `0x${formatHex(entry.groupId, 4)}`.toLowerCase();
    if (groupIdHex.includes(query)) {
      return true;
    }
  }
  if (typeof entry.attr1 === 'number') {
    const attr1Dec = entry.attr1.toString();
    if (attr1Dec.includes(query)) {
      return true;
    }
    const attr1Hex = `0x${formatHex(entry.attr1, 4)}`.toLowerCase();
    if (attr1Hex.includes(query)) {
      return true;
    }
  }
  if (typeof entry.attr2 === 'number') {
    const attr2Dec = entry.attr2.toString();
    if (attr2Dec.includes(query)) {
      return true;
    }
    const attr2Hex = `0x${formatHex(entry.attr2, 4)}`.toLowerCase();
    if (attr2Hex.includes(query)) {
      return true;
    }
  }
  if (typeof entry.compositeId === 'bigint') {
    const compositeDec = entry.compositeId.toString();
    if (compositeDec.includes(query)) {
      return true;
    }
    const compositeHex = `0x${entry.compositeId.toString(16)}`.toLowerCase();
    if (compositeHex.includes(query)) {
      return true;
    }
  }
  if (typeof entry.attributeHex === 'string' && entry.attributeHex.length) {
    const attrHexLower = entry.attributeHex.toLowerCase();
    if (attrHexLower.includes(query)) {
      return true;
    }
    const attrHexPrefixed = `0x${attrHexLower}`;
    if (attrHexPrefixed.includes(query)) {
      return true;
    }
  }
  if (Array.isArray(entry.extraFields) && entry.extraFields.length) {
    const extrasDecimal = entry.extraFields.some((value) => value.toString().includes(query));
    if (extrasDecimal) {
      return true;
    }
    const extrasHex = entry.extraFields
      .map((value) => `0x${formatHex(value, 4)}`.toLowerCase())
      .some((label) => label.includes(query));
    if (extrasHex) {
      return true;
    }
  }
  if (`0x${entry.originalOffset.toString(16)}`.toLowerCase().includes(query)) {
    return true;
  }
  const text = entry.text.toLowerCase();
  const original = entry.originalText.toLowerCase();
  return text.includes(query) || original.includes(query);
}

function buildEntryCard(entry) {
  const template = document.getElementById('entry-template');
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.kind = entry.kind;
  card.dataset.id = String(entry.id);
  card.dataset.color = entry.color ?? 'default';
  card.classList.toggle('modified', entry.dirty);
  card.classList.toggle('mid-entry', entry.kind === 'mid');
  
  const title = card.querySelector('h3');
  let titleText = formatEntryTitle(entry);
  
  // Ajoute l'info du groupe scrolling
  if (entry.isScrollingGroup) {
    const first = entry.scrollingIds[0];
    const last = entry.scrollingIds[entry.scrollingIds.length - 1];
    titleText += ` (IDs ${first}-${last}, ${entry.scrollingCount} variants)`;
  }
  
  title.textContent = titleText;
  
  const badges = card.querySelector('.badges');
  updateBadges(badges, entry);
  
  // Ajoute un badge pour les groupes scrolling
  if (entry.isScrollingGroup) {
    const scrollBadge = makeBadge('Scrolling', 'scrolling');
    badges.appendChild(scrollBadge);
  }
  
  card.querySelector('.offset').textContent = formatOffsetLabel(entry);
  card.querySelector('.attr').textContent = formatAttrLabel(entry);
  const textarea = card.querySelector('textarea');
  textarea.value = entry.text;
  textarea.dataset.kind = entry.kind;
  textarea.dataset.id = String(entry.id);
  
  // Si c'est un groupe scrolling, mettre les IDs du groupe en data attribute
  if (entry.isScrollingGroup) {
    textarea.dataset.scrollingIds = JSON.stringify(entry.scrollingIds);
  }
  
  textarea.addEventListener('input', onEntryEdit);
  const highlight = card.querySelector('.text-highlight');
  highlight.dataset.entryKind = entry.kind;
  highlight.dataset.entryColor = entry.color ?? 'default';
  updateTextHighlight(highlight, entry.text);
  const revertBtn = card.querySelector('.revert');
  revertBtn.dataset.kind = entry.kind;
  revertBtn.dataset.id = String(entry.id);
  
  // Si groupe scrolling, stocker aussi les IDs pour le revert
  if (entry.isScrollingGroup) {
    revertBtn.dataset.scrollingIds = JSON.stringify(entry.scrollingIds);
  }
  
  revertBtn.disabled = !entry.dirty;
  revertBtn.addEventListener('click', onEntryRevert);
  const charCount = card.querySelector('.char-count');
  charCount.textContent = formatCharCount(entry);
  return card;
}

function hasSpecialTokens(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const regex = tokenRegex();
  let match;
  while ((match = regex.exec(value)) !== null) {
    const label = match[1] ?? '';
    if (parseSpecialToken(label) !== null) {
      return true;
    }
  }
  return false;
}

function updateTextHighlight(target, value) {
  if (!target) {
    return;
  }
  const hasTokens = hasSpecialTokens(value);
  target.dataset.hasTokens = hasTokens ? 'true' : 'false';
  const color = target.dataset.entryColor ?? 'default';
  target.dataset.highlightColor = color;
  if (!value) {
    target.classList.add('highlight-empty');
    target.textContent = 'Empty';
    return;
  }
  target.classList.remove('highlight-empty');
  const regex = tokenRegex();
  let lastIndex = 0;
  let match;
  const fragment = document.createDocumentFragment();
  while ((match = regex.exec(value)) !== null) {
    const [token, label] = match;
    const segment = value.slice(lastIndex, match.index);
    if (segment) {
      fragment.append(segment);
    }
    const parsed = parseSpecialToken(label ?? '');
    if (!parsed) {
      fragment.append(token);
    } else {
      const span = document.createElement('span');
      span.className = 'token-chip';
      span.textContent = encodeSpecialCode(parsed.code, parsed.params);
      fragment.append(span);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < value.length) {
    fragment.append(value.slice(lastIndex));
  }
  target.replaceChildren(fragment);
}

function generateScrollingVariants(text) {
  const variants = [text];
  let current = text;
  
  while (current.length > 0) {
    // Enlève le premier caractère (en respectant les sauts de ligne)
    const lines = current.split('\n');
    if (lines[0].length > 0) {
      lines[0] = lines[0].slice(1);
      current = lines.join('\n');
    } else if (lines.length > 1) {
      lines.shift();
      current = lines.join('\n');
    } else {
      break;
    }
    
    if (current.trim().length > 0) {
      variants.push(current);
    }
  }
  
  return variants;
}

function onEntryEdit(event) {
  const kind = event.target.dataset.kind;
  const id = event.target.dataset.id;
  const scrollingIdsStr = event.target.dataset.scrollingIds;
  
  const entry = resolveEntry(kind, id);
  if (!entry) return;
  
  const previousText = entry.text;
  const previousDirty = entry.dirty;
  
  const normalized = normalizeInput(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  
  // Si c'est un groupe scrolling, mettre à jour toutes les variations
  if (scrollingIdsStr && kind === 'mid') {
    const scrollingIds = JSON.parse(scrollingIdsStr);
    const variants = generateScrollingVariants(normalized);
    
    scrollingIds.forEach((variantId, index) => {
      const variantEntry = state.midStrings.find(e => e.id === variantId);
      if (variantEntry && variants[index] !== undefined) {
        variantEntry.text = variants[index];
        variantEntry.dirty = variantEntry.text !== variantEntry.originalText;
        
        if (variantEntry.segment) {
          const nextBytes = encodeBmgString(variantEntry.text, { leadingNull: variantEntry.leadingNull });
          variantEntry.segment.bytes = nextBytes;
          variantEntry.segment.text = variantEntry.text;
          variantEntry.segment.leadingNull = variantEntry.leadingNull;
          variantEntry.byteLength = nextBytes.length;
        }
      }
    });
  } else {
    // Logique normale pour message simple
    entry.text = normalized;
    entry.dirty = entry.text !== entry.originalText;
    
    if (entry.kind === 'mid' && entry.segment) {
      const nextBytes = entry.dirty
        ? encodeBmgString(entry.text, { leadingNull: entry.leadingNull })
        : entry.originalBytes.slice();
      entry.segment.bytes = nextBytes;
      entry.segment.text = entry.text;
      entry.segment.leadingNull = entry.leadingNull;
      entry.byteLength = nextBytes.length;
    } else {
      const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
      entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
    }
  }
  
  const card = event.target.closest('.entry-card');
  const layout = updateCalculatedOffsets();
  
  if (!layout) {
    entry.text = previousText;
    entry.dirty = previousDirty;
    event.target.value = previousText;
    if (card) {
      const restoreHighlight = card.querySelector('.text-highlight');
      if (restoreHighlight) {
        updateTextHighlight(restoreHighlight, previousText);
      }
      card.classList.toggle('modified', entry.dirty);
      const revertButton = card.querySelector('.revert');
      if (revertButton) {
        revertButton.disabled = !entry.dirty;
      }
    }
    refreshEntryMetrics();
    updateSaveButton();
    return;
  }
  
  card.classList.toggle('modified', entry.dirty);
  const highlight = card.querySelector('.text-highlight');
  highlight.dataset.entryKind = entry.kind;
  highlight.dataset.entryColor = entry.color ?? 'default';
  updateTextHighlight(highlight, entry.text);
  card.querySelector('.revert').disabled = !entry.dirty;
  refreshEntryMetrics();
  updateSaveButton();
}

function onEntryRevert(event) {
  const kind = event.currentTarget.dataset.kind;
  const id = event.currentTarget.dataset.id;
  const scrollingIdsStr = event.currentTarget.dataset.scrollingIds;
  
  const entry = resolveEntry(kind, id);
  if (!entry) return;
  
  // Si c'est un groupe scrolling, restaurer toutes les variations
  if (scrollingIdsStr && kind === 'mid') {
    const scrollingIds = JSON.parse(scrollingIdsStr);
    
    scrollingIds.forEach((variantId) => {
      const variantEntry = state.midStrings.find(e => e.id === variantId);
      if (variantEntry) {
        variantEntry.text = variantEntry.originalText;
        variantEntry.leadingNull = variantEntry.originalLeadingNull;
        variantEntry.dirty = false;
        
        if (variantEntry.segment) {
          variantEntry.segment.bytes = variantEntry.originalBytes.slice();
          variantEntry.segment.text = variantEntry.originalText;
          variantEntry.segment.leadingNull = variantEntry.originalLeadingNull;
          variantEntry.byteLength = variantEntry.originalBytes.length;
        }
      }
    });
  } else {
    // Logique normale pour message simple
    entry.text = entry.originalText;
    entry.leadingNull = entry.originalLeadingNull;
    
    if (entry.kind === 'mid' && entry.segment) {
      entry.segment.bytes = entry.originalBytes.slice();
      entry.segment.text = entry.originalText;
      entry.segment.leadingNull = entry.originalLeadingNull;
      entry.byteLength = entry.originalBytes.length;
    } else {
      entry.byteLength = entry.originalBytes.length;
    }
    
    entry.dirty = false;
  }
  
  updateCalculatedOffsets();
  const card = event.currentTarget.closest('.entry-card');
  const textarea = card.querySelector('textarea');
  textarea.value = entry.text;
  const highlight = card.querySelector('.text-highlight');
  highlight.dataset.entryKind = entry.kind;
  highlight.dataset.entryColor = entry.color ?? 'default';
  updateTextHighlight(highlight, entry.text);
  card.classList.toggle('modified', entry.dirty);
  event.currentTarget.disabled = true;
  refreshEntryMetrics();
  updateSaveButton();
}

function onFilter(event) {
  state.filter = event.target.value;
  renderEntries();
}

function updateEntryCount(activeCount) {
  const extra = state.midStrings?.length ?? 0;
  const total = state.entryCount + extra;
  const label = `${activeCount} / ${total} items`;
  els.entryCount.textContent = label;
}

function updateMeta() {
  if (!state.bytes) {
    els.fileMeta.innerHTML = state.message
      ? `<span class="status status-${state.messageTone}">${state.message}</span>`
      : '';
    return;
  }
  const encodingName = ENCODINGS[state.encoding] || `0x${formatHex(state.encoding, 2)}`;
  const infSize = formatBytes(state.infSize);
  const datSize = formatBytes(state.datDeclaredSize);
  const midSize = state.midSize ? formatBytes(state.midSize) : '0 B';
  const infCount = state.entryCount;
  const midCount = state.midStrings?.length ?? 0;
  const totalCount = infCount + midCount;

  // Section sizes (entry count before size)
  const sizeLine = `<div class="meta-block"><strong>Section sizes</strong><br>INF1: <strong>${infCount}</strong> · ${infSize} &nbsp;·&nbsp; DAT1: <strong>${datSize}</strong> &nbsp;·&nbsp; MID1: <strong>${midCount}</strong> · ${midSize}</div>`;
  // Entry counts
  const countLine = `<div class="meta-block"><strong>Entry counts</strong><br>Total: <strong>${totalCount}</strong> · INF1: <strong>${infCount}</strong> · MID1: <strong>${midCount}</strong></div>`;
  // Encoding/settings
  const encodingLine = `<div class="meta-block"><strong>Encoding</strong><br>${encodingName}</div>`;

  let html = `
    <div class="meta-lines">
      ${sizeLine}
      ${countLine}
      ${encodingLine}
    </div>
  `.trim();

  if (state.message) {
    if (state.messageTone === 'warning') {
      html += ` <span class="status status-warning badge-red">⚠️ ${state.message}</span>`;
    } else if (state.messageTone === 'error') {
      html += ` <span class="status status-error">❌ ${state.message}</span>`;
    } else {
      html += ` <span class="status status-${state.messageTone}">${state.message}</span>`;
    }
  }
  els.fileMeta.innerHTML = html;
}

function updateSaveButton() {
  const hasChanges = state.entries.some((entry) => entry.dirty)
    || (state.midStrings?.some((entry) => entry.dirty) ?? false);
  els.download.disabled = !hasChanges;
}

function handleDownload() {
  const hasEntryChanges = state.entries.some((entry) => entry.dirty);
  const hasMidChanges = state.midStrings?.some((entry) => entry.dirty) ?? false;
  if (!hasEntryChanges && !hasMidChanges) {
    return;
  }
  let buffer;
  try {
    ({ buffer } = buildBmg());
  } catch (error) {
    console.error(error);
    showMessage(error instanceof Error ? error.message : String(error), 'error');
    return;
  }
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = state.fileName ? state.fileName.replace(/\.bmg$/i, '') : 'messages';
  anchor.href = url;
  anchor.download = `${safeName}_edited.bmg`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  applyNewBuffer(buffer);
  showMessage('Export complete. Changes reloaded into the editor.', 'success');
}

function handleExportJson() {
  // Détecte et groupe les messages avec effet de défilement
  const groupedMessages = [];
  const processed = new Set();
  
  const midStrings = state.midStrings || [];
  
  for (let i = 0; i < midStrings.length; i++) {
    if (processed.has(i)) continue;
    
    const baseMsg = midStrings[i];
    const baseText = baseMsg.text.replace(/\n/g, '');
    
    // Cherche les variations scrolling suivantes
    let j = i + 1;
    let prevText = baseText;
    const groupIds = [baseMsg.id];
    
    while (j < midStrings.length) {
      const nextText = midStrings[j].text.replace(/\n/g, '');
      
      // Vérifie si c'est une variation (texte précédent sans le premier char)
      if (nextText === prevText.slice(1) && nextText.length > 0) {
        groupIds.push(midStrings[j].id);
        processed.add(j);
        prevText = nextText;
        j++;
      } else {
        break;
      }
    }
    
    // Ajoute seulement le message complet (pas les variations)
    groupedMessages.push({
      id: baseMsg.id,
      message: baseMsg.text,
      scrollingGroup: groupIds.length > 1 ? groupIds : undefined
    });
    
    processed.add(i);
  }
  
  const payload = {
    inf1: state.entries.map((entry) => ({
      id: entry.index,
      message: entry.text
    })),
    mid1: groupedMessages
  };
  
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = state.fileName ? state.fileName.replace(/\.bmg$/i, '') : 'messages';
  anchor.href = url;
  anchor.download = `${safeName}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function handleImportJsonClick() {
  if (els.importJson.disabled) {
    return;
  }
  els.importJsonInput.value = '';
  els.importJsonInput.click();
}

function handleImportJsonFile(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  if (!state.entries.length) {
    showMessage('Load a BMG file before importing JSON.', 'error');
    event.target.value = '';
    return;
  }
  file.text()
    .then((raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        throw new Error('Invalid JSON format.');
      }
      
      // Support multiple formats
      let entries, midStrings;
      if (Array.isArray(data)) {
        entries = data;
        midStrings = [];
      } else if (typeof data === 'object' && data !== null) {
        if (data.inf1) {
          entries = data.inf1;
          midStrings = data.mid1 || [];
        } else {
          entries = data.entries || [];
          midStrings = data.midStrings || [];
        }
      } else {
        throw new Error('JSON must be an array or an object with "inf1" field.');
      }
      
      if (!Array.isArray(entries)) {
        throw new Error('JSON "entries" must be an array.');
      }
      if (entries.length !== state.entryCount) {
        throw new Error(`JSON entry count (${entries.length}) does not match BMG entry count (${state.entryCount}).`);
      }
      
      const seen = new Set();
      const messages = new Array(state.entryCount);
      entries.forEach((item, idx) => {
        if (typeof item !== 'object' || item === null) {
          throw new Error(`Entry at index ${idx} is not an object.`);
        }
        const id = Number(item.id);
        if (!Number.isInteger(id) || id < 0 || id >= state.entryCount) {
          throw new Error(`Invalid entry id at array index ${idx}.`);
        }
        if (seen.has(id)) {
          throw new Error(`Duplicate entry id ${id} in JSON.`);
        }
        if (typeof item.message !== 'string') {
          throw new Error(`Entry ${id} is missing a string "message" field.`);
        }
        seen.add(id);
        messages[id] = normalizeInput(item.message);
      });
      for (let id = 0; id < state.entryCount; id += 1) {
        if (typeof messages[id] !== 'string') {
          throw new Error(`Missing message for entry id ${id}.`);
        }
      }
      
      // Apply INF entry updates
      state.entries.forEach((entry, index) => {
        const nextText = messages[index];
        entry.text = nextText;
        const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
        entry.dirty = entry.text !== entry.originalText;
        entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
      });
      
      // Apply MID string updates - avec support des groupes scrolling
      if (Array.isArray(midStrings) && midStrings.length > 0 && state.midStrings && state.midStrings.length > 0) {
        midStrings.forEach((item) => {
          if (typeof item !== 'object' || item === null) {
            return;
          }
          
          const baseId = Number(item.id);
          const message = item.message;
          const scrollingGroup = item.scrollingGroup;
          
          if (!Number.isInteger(baseId) || typeof message !== 'string') {
            return;
          }
          
          // Si c'est un groupe scrolling, générer les variations
          if (Array.isArray(scrollingGroup) && scrollingGroup.length > 1) {
            const variants = generateScrollingVariants(message);
            
            scrollingGroup.forEach((variantId, index) => {
              const entry = state.midStrings.find(e => e.id === variantId);
              if (entry && variants[index] !== undefined) {
                entry.text = variants[index];
                const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
                entry.dirty = entry.text !== entry.originalText;
                entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
              }
            });
          } else {
            // Message simple
            const entry = state.midStrings.find(e => e.id === baseId);
            if (entry) {
              entry.text = normalizeInput(message);
              const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
              entry.dirty = entry.text !== entry.originalText;
              entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
            }
          }
        });
      }
      
      updateCalculatedOffsets();
      renderEntries();
      updateSaveButton();
      showMessage('Imported messages from JSON.', 'success');
    })
    .catch((error) => {
      console.error(error);
      showMessage(error instanceof Error ? error.message : 'Failed to import JSON.', 'error');
    })
    .finally(() => {
      event.target.value = '';
    });
}

function buildBmg() {
  const layout = planDatLayout(state.entries);
  const { chunks, chunkByEntry, chunkBySegment, dataSize, padding, offsetRemap } = layout;
  
  // Extract the section BEFORE DAT1
  const before = state.bytes.slice(0, state.datOffset + 8);
  
  // Extract everything AFTER DAT1 (MID1 section if it exists)
  // CRITICAL: Use state.midOffset if MID1 exists, otherwise use file end
  // This ensures MID1 is extracted from its EXACT position, not from a calculated offset
  const afterStart = state.midOffset >= 0 
    ? state.midOffset 
    : state.bytes.length;
  const after = state.bytes.slice(afterStart);
  
  // Calculate new DAT1 size (content + padding, without the 8-byte header)
  // CRITICAL: The original game format adds 8 extra bytes to DAT1 declared size
  // This makes MID1 start 8 bytes "inside" the declared DAT1 zone
  const newDatSize = dataSize + padding + 8;
  
  // Build the output buffer: before + new DAT1 content + padding + after (MID1)
  // Note: We write (dataSize + padding) bytes, but declare (dataSize + padding + 8) in header
  const output = new Uint8Array(before.length + dataSize + padding + after.length);
  let pos = 0;
  
  // Copy section before DAT1
  output.set(before, pos);
  pos += before.length;
  
  // Write DAT1 content
  chunks.forEach((chunk) => {
    output.set(chunk.bytes, pos);
    pos += chunk.bytes.length;
  });
  
  // Write padding to align to 4 bytes
  if (padding) {
    output.fill(0, pos, pos + padding);
    pos += padding;
  }
  
  // Copy section after DAT1 (MID1)
  const newMidOffset = pos;  // Store the new position of MID1
  output.set(after, pos);

  // Update file headers
  const view = new DataView(output.buffer);
  // Write new DAT1 size in DAT1 header
  view.setUint32(state.datOffset + 4, newDatSize, true);
  // Update total file size in MESG header
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
    // In pointer mode, we need to update MID1 pointers to account for DAT size changes
    const midBase = newMidOffset + 8;  // Use NEW position, not original
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

function applyNewBuffer(buffer) {
  const filter = state.filter;
  const fileName = state.fileName;
  const parsed = parseBmg(buffer);
  Object.assign(state, parsed, {
    fileName,
    filter,
    message: state.message,
    messageTone: state.messageTone
  });
  state.entries.forEach((entry) => {
    entry.dirty = false;
    entry.byteLength = entry.originalBytes.length;
    entry.leadingNull = entry.originalLeadingNull;
  });
  state.midStrings.forEach((entry) => {
    entry.dirty = false;
    entry.byteLength = entry.originalBytes.length;
    entry.leadingNull = entry.originalLeadingNull;
    entry.color = entry.color ?? ((entry.references ?? []).some((ref) => (ref.flags & 1) !== 0) ? 'red' : 'default');
    if (entry.segment) {
      entry.segment.bytes = entry.originalBytes.slice();
      entry.segment.text = entry.originalText;
      entry.segment.leadingNull = entry.originalLeadingNull;
    }
  });
  els.search.disabled = false;
  els.search.value = filter;
  updateCalculatedOffsets();
  renderEntries();
  updateMeta();
  updateSaveButton();
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
    out[index * 2] = code & 0xff;         // Little-endian
    out[index * 2 + 1] = code >> 8;
  });
  return out;
}

function formatCharCount(entry) {
  const bytes = entry.byteLength
    ?? encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
  const chars = countVisibleCharacters(entry.text);
  return `${chars} chars · ${bytes} bytes`;
}

function formatAttrLabel(entry) {
  if (entry.kind === 'mid') {
    const refs = entry.references ?? [];
    if (!refs.length) {
      return 'MID refs: none';
    }
    const parts = refs.slice(0, 3).map((ref) => {
      const flagLabel = (ref.flags & 1) !== 0 ? 'red' : 'default';
      return `row ${ref.row} · col ${ref.column} (${flagLabel})`;
    });
    if (refs.length > 3) {
      parts.push(`+${refs.length - 3} more`);
    }
    return `MID refs: ${parts.join(' · ')}`;
  }
  const parts = [];
  if (typeof entry.messageId === 'number') {
    parts.push(`id=0x${formatHex(entry.messageId, 4)}`);
  }
  if (typeof entry.groupId === 'number') {
    parts.push(`group=0x${formatHex(entry.groupId, 4)}`);
  }
  if (typeof entry.attr1 === 'number') {
    parts.push(`attr1=0x${formatHex(entry.attr1, 4)}`);
  }
  if (typeof entry.attr2 === 'number') {
    parts.push(`attr2=0x${formatHex(entry.attr2, 4)}`);
  }
  if (Array.isArray(entry.extraFields) && entry.extraFields.length) {
    const extras = entry.extraFields.map((value) => `0x${formatHex(value, 4)}`).join(', ');
    parts.push(`extra=[${extras}]`);
  }
  if (typeof entry.attributeHex === 'string' && entry.attributeHex.length) {
    parts.push(`attr=${entry.attributeHex}`);
  }
  return parts.join(' · ');
}

function formatOffsetLabel(entry) {
  if (entry.kind === 'mid') {
    const original = entry.originalOffset ?? entry.offset ?? 0;
    const preview = entry.calculatedOffset ?? original;
    const base = `MID pointer 0x${formatHex(original, 6)}`;
    if (preview === original) {
      return base;
    }
    return `${base} → 0x${formatHex(preview, 6)}`;
  }
  const original = entry.offset ?? 0;
  const preview = entry.calculatedOffset ?? original;
  if (preview === original) {
    return `offset 0x${formatHex(original, 6)}`;
  }
  return `offset 0x${formatHex(original, 6)} → 0x${formatHex(preview, 6)}`;
}

function formatEntryTitle(entry) {
  if (entry.kind === 'mid') {
    return `MID1 Entry #${entry.id}`;
  }
  return `INF1 Entry #${entry.index}`;
}

function normalizeInput(text) {
  if (typeof text !== 'string') {
    return '';
  }
  let normalized = text.replace(/\r\n?/g, '\n');
  normalized = normalized.replace(LEGACY_TOKEN_REGEX, (match, hex) => {
    const value = parseInt(hex, 16);
    return Number.isNaN(value) ? match : encodeSpecialCode(value);
  });
  normalized = normalized.replace(/\[([^\]\r\n]{1,32})\]/g, (match, rawLabel) => {
    const parsed = parseSpecialToken(rawLabel);
    return parsed ? encodeSpecialCode(parsed.code, parsed.params) : match;
  });
  for (let code = 1; code < 32; code += 1) {
    if (code === 10) {
      continue;
    }
    if (CONTROL_CODE_PARAMS.has(code)) {
      continue;
    }
    const controlChar = String.fromCharCode(code);
    if (normalized.includes(controlChar)) {
      normalized = normalized.split(controlChar).join(encodeSpecialCode(code));
    }
  }
  return normalized;
}

function readAscii(bytes, start, length) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
}

function formatBytes(size) {
  if (size === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB'];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function makeBadge(text, variant) {
  const span = document.createElement('span');
  span.className = 'badge';
  if (variant) {
    span.classList.add(`badge-${variant}`);
  }
  span.textContent = text;
  return span;
}

function showMessage(text, tone = 'info') {
  state.message = text;
  state.messageTone = tone;
  updateMeta();
}

function updateBadges(container, entry) {
  if (!container) {
    return;
  }
  container.innerHTML = '';
  
  // Add section badge (INF1 or MID1)
  const sectionLabel = entry.kind === 'mid' ? 'MID1' : 'INF1';
  // Use renamed badge variants: 'mid1' and 'inf1'
  const sectionVariant = entry.kind === 'mid' ? 'mid1' : 'inf1';
  const sectionBadge = makeBadge(sectionLabel, sectionVariant);
  container.appendChild(sectionBadge);
  
  // Add modified badge if dirty
  if (entry.dirty) {
    container.appendChild(makeBadge('modified', 'warning'));
  }
}


function countVisibleCharacters(text) {
  const source = typeof text === 'string' ? text : '';
  const regex = tokenRegex();
  const canonical = source.replace(regex, (match, label) => {
    const parsed = parseSpecialToken(label ?? '');
    return parsed ? '◉' : match;
  });
  return Array.from(canonical).length;
}

function resetUi() {
  state.fileName = '';
  state.originalBuffer = null;
  state.bytes = null;
  state.view = null;
  state.entries = [];
  state.entryCount = 0;
  state.infSize = 0;
  state.infOffset = 0;
  state.headerBytes = 0;
  state.entrySize = 0;
  state.entryStart = 0;
  state.datDeclaredSize = 0;
  state.datActualSize = 0;
  state.datOffset = 0;
  state.datBase = 0;
  state.filter = '';
  state.message = '';
  state.messageTone = 'info';
  state.bmgType = '';
  state.encoding = 0;
  state.sectionsCount = 0;
  state.fileSize = 0;
  state.midOffset = -1;
  state.midSize = 0;
  state.midEntryCount = 0;
  state.midEntrySize = 0;
  state.midColumnCount = 0;
  state.midReserved = 0;
  state.midRowCount = 0;
  state.midEntries = [];
  state.midIds = [];
  state.midKind = 'none';
  state.midStrings = [];
  state.datSegments = [];
  state.lastLayout = null;
  els.fileLabel.textContent = 'No file selected';
  els.search.value = '';
  els.search.disabled = true;
  els.entries.innerHTML = '';
  els.entryCount.textContent = '0 items';
  els.download.disabled = true;
  els.exportJson.disabled = true;
  els.importJson.disabled = true;
  if (els.importJsonInput) {
    els.importJsonInput.value = '';
  }
  els.fileMeta.textContent = '';
  updateSaveButton();
  updateMeta();
}
