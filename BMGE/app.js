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

const ENCODINGS = {
  0x00: 'cp1252',
  0x01: 'utf-16le',
  0x02: 'shift-jis'
};

const NAMED_TOKEN_ENTRIES = [
  //[0x01, 'RED']
];

const NAMED_TOKENS = new Map(NAMED_TOKEN_ENTRIES);
const REVERSE_NAMED_TOKENS = new Map(
  NAMED_TOKEN_ENTRIES.map(([code, label]) => [label, code])
);

const CONTROL_CODE_PARAMS = new Map([
  [0x1a, 1],
  [0xff, 2]
]);

const MAX_STRING_READ_LENGTH = 10000;

function formatHex(value, width = 4) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function safeGetUint16(view, offset, limit) {
  if (offset + 2 > limit) {
    throw new Error(`Read beyond buffer at offset 0x${offset.toString(16)}`);
  }
  return view.getUint16(offset, true);
}

function safeGetUint32(view, offset, limit) {
  if (offset + 4 > limit) {
    throw new Error(`Read beyond buffer at offset 0x${offset.toString(16)}`);
  }
  return view.getUint32(offset, true);
}

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
    const expected = CONTROL_CODE_PARAMS.get(code);
    if (typeof expected === 'number' && expected !== params.length) {
      return null;
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
  midGroups: [],
  datSegments: [],
  lastLayout: null
};

function resolveEntry(kind, id) {
  const num = Number(id);
  if (Number.isNaN(num) || num < 0) return null;
  if (kind === 'mid') {
    // Prefer lookup by the entry.id field; fall back to index-based access
    const byId = (state.midStrings || []).find(e => e.id === num);
    if (byId) return byId;
    return state.midStrings?.[num] ?? null;
  }
  // INF entries are indexed by position (index) in state.entries
  return state.entries?.[num] ?? (state.entries || []).find(e => e.id === num) ?? null;
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
  
  if (state.midKind === 'ids' && state.midStrings && state.midStrings.length > 0) {
    segments.sort((a, b) => a.originalOffset - b.originalOffset);
    
    const paddedSegments = [];
    let cursor = 0;
    
    segments.forEach((seg, idx) => {
      const targetOffset = seg.originalOffset;
      
      if (targetOffset > cursor) {
        const paddingSize = targetOffset - cursor;
        paddedSegments.push({
          originalOffset: cursor,
          bytes: new Uint8Array(paddingSize).fill(0),
          entryIndices: [],
          midRefs: [],
          leadingNull: false,
          text: '',
          type: 'raw'
        });
        cursor = targetOffset;
      }
      
      paddedSegments.push(seg);
      cursor += (seg.bytes?.length || 0);
    });
    
    segments.length = 0;
    paddedSegments.forEach(s => segments.push(s));
  } else {
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
        showMessage(`${file.name} • ${formatBytes(buffer.byteLength)}`, 'success');
        
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

function detectSequencedGroups(entries) {
  const groups = [];
  const processed = new Set();

  if (!entries || entries.length === 0) return groups;

  // Detect whether this list is a collection of MID strings (conservative check)
  const isMidCollection = entries.every(e => e && e.kind === 'mid') || (entries[0] && entries[0].kind === 'mid');

  for (let i = 0; i < entries.length; i++) {
    if (processed.has(i)) continue;

    const entry = entries[i];
    const group = [entry];
    const indices = [i];

    for (let j = i + 1; j < entries.length; j++) {
      if (processed.has(j)) continue;

      const next = entries[j];
      const last = group[group.length - 1];

      // MID-specific heuristics: offsets, insertion tokens like [1A:FF08] or [1A:0108], and punctuation
      if (isMidCollection) {
        const tokenLinkPattern = /\[1A:(?:FF08|0108)\]/i;
        const hasControlCodes = hasSpecialTokens(last.text) || hasSpecialTokens(next.text) || tokenLinkPattern.test(last.text) || tokenLinkPattern.test(next.text);

        let isSequential = false;

        // Offsets consecutive: if next.offset equals last.offset + last.byteLength (exact adjacency)
        if (typeof last.offset === 'number' && typeof next.offset === 'number') {
          const lastEnd = last.offset + (last.byteLength || 0);
          if (next.offset === lastEnd) {
            isSequential = true;
          } else if (Math.abs(next.offset - last.offset) <= 4) {
            // small tolerance for alignment differences
            isSequential = true;
          }
        }

        // Token-based linking: insertion token at end of last + next starts with a token
        if (!isSequential && hasControlCodes) {
          const lastEndsWithInsert = /\[1A:(?:FF08|0108)\]\s*$/.test(last.text);
          const nextStartsWithToken = /^\s*\[[0-9A-Fa-f]{2,}.*\]/.test(next.text) || /^\s*\[0[2-9]\]/.test(next.text) || /^\s*\[08\]/.test(next.text);
          if (lastEndsWithInsert && nextStartsWithToken) {
            isSequential = true;
          }
        }

        // Fallback: punctuation / incomplete sentence heuristics
        if (!isSequential) {
          const lastWithoutCodes = (last.text || '').replace(tokenRegex(), '').trim();
          const nextWithoutCodes = (next.text || '').replace(tokenRegex(), '').trim();
          const lastEndsWithPunct = /[.!?。！？]$/.test(lastWithoutCodes);
          if (!lastEndsWithPunct && lastWithoutCodes.length > 0 && nextWithoutCodes.length > 0) {
            // If last looks like a fragment and next isn't punctuation-only, consider sequential
            isSequential = true;
          }
        }

        if (isSequential) {
          group.push(next);
          indices.push(j);
          processed.add(j);
          continue;
        }

        // if not matched by MID heuristics, skip to next candidate
        continue;
      }

      // Original INF/GENERAL behavior preserved for non-MID entries
      const hasControlCodes = hasSpecialTokens(last.text) || hasSpecialTokens(next.text);
      if (!hasControlCodes) continue;

      const lastWithoutCodes = last.text.replace(tokenRegex(), '');
      const nextWithoutCodes = next.text.replace(tokenRegex(), '');

      const isSequential = lastWithoutCodes.length > 0 &&
                          nextWithoutCodes.length > 0 &&
                          (lastWithoutCodes.endsWith(nextWithoutCodes) ||
                           nextWithoutCodes.startsWith(lastWithoutCodes));

      if (isSequential) {
        group.push(next);
        indices.push(j);
        processed.add(j);
      }
    }

    if (group.length > 1) {
      groups.push({
        entries: group,
        indices: indices,
        isSequenced: true
      });
    } else {
      groups.push({
        entries: [entry],
        indices: [i],
        isSequenced: false
      });
    }

    processed.add(i);
  }

  return groups;
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

      // MID pointer analysis computed; suppressed verbose logging in production.

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

  // --- Vérification de complétude MID (diagnostic) ---
  try {
    const midSegmentCount = datSegments.filter(s => s.type === 'mid' || s.type === 'mid-id').length;
    console.log(`Total MID segments found: ${midSegmentCount}`);
    console.log(`Total MID strings created: ${midStrings.length}`);

    if (midSegmentCount !== midStrings.length) {
      console.error(`MISMATCH: ${midSegmentCount} segments but ${midStrings.length} strings`);
      datSegments.forEach((seg) => {
        if ((seg.type === 'mid' || seg.type === 'mid-id') && !seg.midEntry) {
          console.error(`Segment at offset 0x${(seg.originalOffset||0).toString(16)} has no midEntry!`);
        }
      });
    }
  } catch (e) {
    console.warn('MID completeness check failed:', e);
  }
  // --- end diagnostic ---
  
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

function renderEntries() {
  els.entries.innerHTML = '';
  const fragment = document.createDocumentFragment();
  // Build display entries: INF entries handled via detectSequencedGroups below.
  // For MID entries we want automatic grouping (but allow any user-defined groups to take precedence).
  const displayEntries = [];

  // First, add INF entries placeholders (we'll replace with sequenced groups later)
  (state.entries || []).forEach(e => displayEntries.push(e));

  // Prepare MID entries honoring user-defined groups first
  const midAll = state.midStrings || [];
  const userGroups = state.midGroups || [];
  const userMemberSet = new Set((userGroups.flat ? userGroups.flat() : []).filter(Boolean));

  // Add user-defined group entries (leader only) and mark those members as handled
  const handledMidIds = new Set();
  userGroups.forEach((group) => {
    if (!Array.isArray(group) || group.length === 0) return;
    const leader = group[0];
    const members = group.map(id => midAll.find(m => m.id === id)).filter(Boolean);
    members.forEach(m => handledMidIds.add(m.id));
    displayEntries.push({
      kind: 'mid',
      id: leader,
      isUserMidGroup: true,
      groupedIds: group.slice(),
      groupedEntries: members,
      text: members.map(m => m.text).join('')
    });
  });

  // For remaining MID entries (not in user groups), attempt auto-detection for UI/display only.
  // Export remains per-entry (lossless) elsewhere.
  const autoPool = midAll.filter(m => !handledMidIds.has(m.id));
  const midGroups = detectSequencedGroups(autoPool);
  midGroups.forEach((group) => {
    if (group.isSequenced) {
      displayEntries.push({
        kind: 'mid',
        id: group.entries[0].id,
        isSequencedGroup: true,
        sequencedEntries: group.entries,
        // store sequencedIds (actual mid ids) for revert/edit handlers
        sequencedIndices: group.entries.map(e => e.id),
        sequencedCount: group.entries.length,
        text: group.entries.map(e => e.text).join('')
      });
    } else {
      displayEntries.push(group.entries[0]);
    }
  });
  
  const infGroups = detectSequencedGroups(state.entries);
  
  const finalEntries = [];
  const infProcessed = new Set();
  
  infGroups.forEach(group => {
    if (group.isSequenced) {
      const firstEntry = group.entries[0];
      finalEntries.push({
        ...firstEntry,
        isSequencedGroup: true,
        sequencedEntries: group.entries,
        sequencedIndices: group.indices,
        sequencedCount: group.entries.length
      });
      group.indices.forEach(idx => infProcessed.add(idx));
    } else {
      if (!infProcessed.has(group.indices[0])) {
        finalEntries.push(group.entries[0]);
        infProcessed.add(group.indices[0]);
      }
    }
  });
  
  displayEntries.forEach(entry => {
    if (entry.kind !== 'mid') {
      const idx = finalEntries.findIndex(e => e.id === entry.id && e.kind === entry.kind);
      if (idx >= 0) {
        finalEntries[idx] = entry;
      }
    } else {
      finalEntries.push(entry);
    }
  });
  
  const activeEntries = finalEntries.filter(matchesFilter);
  activeEntries.forEach((entry) => {
    const card = buildEntryCard(entry);
    fragment.appendChild(card);
  });
  els.entries.appendChild(fragment);

  const visibleCount = activeEntries.reduce((sum, entry) => {
    if (entry.kind === 'mid' && entry.isScrollingGroup) {
      return sum + (entry.scrollingCount || 1);
    }
    if (entry.isSequencedGroup) {
      return sum + (entry.sequencedCount || 1);
    }
    return sum + 1;
  }, 0);

  updateEntryCount(visibleCount);
}

function matchesFilter(entry) {
  if (entry.kind === 'mid' && !els.filterMid.checked) {
    return false;
  }
  if (entry.kind !== 'mid' && !els.filterInf.checked) {
    return false;
  }
  if (!els.filterEmpty.checked && (!entry.text || entry.text.trim() === '')) {
    return false;
  }
  
  const query = state.filter.trim().toLowerCase();
  if (!query) {
    return true;
  }
  if (entry.kind === 'mid') {
    if (typeof entry.offset === 'number') {
      const pointerHex = `0x${entry.offset.toString(16)}`.toLowerCase();
      if (pointerHex.includes(query)) {
        return true;
      }
    }
    const midLabel = `mid${(typeof entry.id === 'number' ? entry.id + 1 : '')}`;
    if (midLabel.includes(query)) {
      return true;
    }
    if ((entry.color ?? '').toLowerCase().includes(query)) {
      return true;
    }
    if (entry.references && entry.references.some((ref) => `row${ref.row}`.includes(query) || `col${ref.column}`.includes(query) || `${ref.row}:${ref.column}`.includes(query))) {
      return true;
    }
    const text = (entry.text ?? '').toLowerCase();
    const original = (entry.originalText ?? '').toLowerCase();
    return text.includes(query) || original.includes(query);
  }
  if (`${entry.index}`.includes(query)) {
    return true;
  }
  if (typeof entry.offset === 'number' && (`0x${entry.offset.toString(16)}`.toLowerCase().includes(query))) {
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
  if (typeof entry.originalOffset === 'number' && (`0x${entry.originalOffset.toString(16)}`.toLowerCase().includes(query))) {
    return true;
  }
  const text = (entry.text ?? '').toLowerCase();
  const original = (entry.originalText ?? '').toLowerCase();
  return text.includes(query) || original.includes(query);
}

function buildEntryCard(entry) {
  const template = document.getElementById('entry-template');
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.kind = entry.kind;
  card.dataset.id = String(entry.id);
  card.dataset.color = entry.color ?? 'default';
  // modified state for the card will be computed after building child textareas
  card.classList.toggle('mid-entry', entry.kind === 'mid');
  card.classList.toggle('sequenced-entry', entry.isSequencedGroup === true);
  
  const title = card.querySelector('h3');
  let titleText = formatEntryTitle(entry);
  
  if (entry.isScrollingGroup) {
    const first = entry.scrollingIds[0];
    const last = entry.scrollingIds[entry.scrollingIds.length - 1];
    titleText += ` (IDs ${first}-${last}, ${entry.scrollingCount} variants)`;
  }
  
  if (entry.isUserMidGroup) {
    // Render one textarea per member for a user-defined MID group (preserve parts separately)
    (entry.groupedEntries || []).forEach((part) => {
      const shell = document.createElement('div');
      shell.className = 'editor-shell';

      const pre = document.createElement('pre');
      pre.className = 'text-highlight';
      pre.dataset.entryKind = 'mid';
      pre.dataset.entryColor = part.color ?? 'default';
      updateTextHighlight(pre, part.text);

      const ta = document.createElement('textarea');
      ta.value = part.text;
      ta.dataset.kind = 'mid';
      ta.dataset.id = String(part.id);
      ta.addEventListener('input', onEntryEdit);

      shell.appendChild(pre);
      shell.appendChild(ta);
      textareaContainer.appendChild(shell);
    });
  } else if (entry.isSequencedGroup) {
    const first = entry.sequencedIndices[0];
    const last = entry.sequencedIndices[entry.sequencedIndices.length - 1];
    titleText += ` (Entries ${first}-${last}, ${entry.sequencedCount} parts)`;
  }
  
  title.textContent = titleText;
  
  const badges = card.querySelector('.badges');
  updateBadges(badges, entry);

  // MID grouping controls (manual)
  if (entry.kind === 'mid') {
    const midGroup = getMidGroupForId(entry.id);
    if (midGroup) {
      const groupBadge = makeBadge(`Grouped (${midGroup.join(',')})`, 'warning');
      badges.appendChild(groupBadge);
    }
  }
  
  if (entry.isScrollingGroup) {
    const scrollBadge = makeBadge('Scrolling', 'scrolling');
    badges.appendChild(scrollBadge);
  }
  
  if (entry.isSequencedGroup) {
    const seqBadge = makeBadge('Sequenced', 'sequenced');
    badges.appendChild(seqBadge);
  }
  
  card.querySelector('.offset').textContent = formatOffsetLabel(entry);
  card.querySelector('.attr').textContent = formatAttrLabel(entry);
  
  const textareaContainer = card.querySelector('.textarea-container');
  textareaContainer.innerHTML = '';

  if (entry.isSequencedGroup) {
    if (entry.kind === 'mid') {
      // For automatically-detected MID sequences, render one textarea per sequenced part
      entry.sequencedEntries.forEach((part) => {
        const shell = document.createElement('div');
        shell.className = 'editor-shell';

        const pre = document.createElement('pre');
        pre.className = 'text-highlight';
        pre.dataset.entryKind = 'mid';
        pre.dataset.entryColor = part.color ?? 'default';
        updateTextHighlight(pre, part.text);

        const ta = document.createElement('textarea');
        ta.value = part.text;
        ta.dataset.kind = 'mid';
        ta.dataset.id = String(part.id);
        ta.addEventListener('input', onEntryEdit);

        shell.appendChild(pre);
        shell.appendChild(ta);
        textareaContainer.appendChild(shell);
      });
    } else {
      // Render a single combined textarea for the whole sequenced group (INF behavior)
      const combined = entry.sequencedEntries.map(e => e.text).join('');
      const textarea = document.createElement('textarea');
      textarea.value = combined;
      textarea.dataset.kind = entry.kind;
      textarea.dataset.id = String(entry.id);
      // Store the indices of the sequenced parts so edits can be redistributed.
      textarea.dataset.sequencedIndices = JSON.stringify(entry.sequencedIndices);
      textarea.addEventListener('input', onEntryEdit);
      textareaContainer.appendChild(textarea);

      const highlight = document.createElement('div');
      highlight.className = 'text-highlight';
      highlight.dataset.entryKind = entry.kind;
      highlight.dataset.entryColor = entry.color ?? 'default';
      updateTextHighlight(highlight, combined);
      textareaContainer.appendChild(highlight);
    }
  } else {
    {
      const shell = document.createElement('div');
      shell.className = 'editor-shell';

      const pre = document.createElement('pre');
      pre.className = 'text-highlight';
      pre.dataset.entryKind = entry.kind;
      pre.dataset.entryColor = entry.color ?? 'default';
      updateTextHighlight(pre, entry.text);

      const ta = document.createElement('textarea');
      ta.value = entry.text;
      ta.dataset.kind = entry.kind;
      ta.dataset.id = String(entry.id);
      if (entry.isScrollingGroup) {
        ta.dataset.scrollingIds = JSON.stringify(entry.scrollingIds);
      }
      ta.addEventListener('input', onEntryEdit);

      shell.appendChild(pre);
      shell.appendChild(ta);
      textareaContainer.appendChild(shell);
    }
  }
  
  const revertBtn = card.querySelector('.revert');
  revertBtn.dataset.kind = entry.kind;
  revertBtn.dataset.id = String(entry.id);

  // Add MID group buttons in the actions area
  if (entry.kind === 'mid') {
    // Group/ungroup controls retired: MID grouping is handled automatically.
  }
  
  if (entry.isScrollingGroup) {
    revertBtn.dataset.scrollingIds = JSON.stringify(entry.scrollingIds);
  }
  
  if (entry.isSequencedGroup) {
    revertBtn.dataset.sequencedIndices = JSON.stringify(entry.sequencedIndices);
  }
  
  revertBtn.disabled = !entry.dirty;
  revertBtn.addEventListener('click', onEntryRevert);
  const charCount = card.querySelector('.char-count');
  charCount.textContent = formatCharCount(entry);
  // Compute card-level modified state: if the main entry or any child part is dirty.
  (function computeCardModified() {
    let modified = !!entry.dirty;
    const taList = card.querySelectorAll('textarea');
    taList.forEach((ta) => {
      const resolved = resolveEntry(ta.dataset.kind, ta.dataset.id);
      if (resolved && resolved.dirty) modified = true;
    });
    card.classList.toggle('modified', modified);
    // manage modified badge visibility
    const existing = Array.from(badges.children).find(b => (b.textContent || '').toLowerCase() === 'modified');
    if (modified && !existing) {
      badges.appendChild(makeBadge('modified', 'warning'));
    } else if (!modified && existing) {
      existing.remove();
    }
    // enable revert when any part is modified
    revertBtn.disabled = !modified;
  })();
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
  const sequencedIndicesStr = event.target.dataset.sequencedIndices;
  const sequencedIndex = event.target.dataset.sequencedIndex;
  
  const entry = resolveEntry(kind, id);
  if (!entry) return;
  
  const previousText = entry.text;
  const previousDirty = entry.dirty;
  
  const normalized = normalizeInput(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  
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
  } else if (sequencedIndicesStr && kind !== 'mid') {
    const sequencedIndices = JSON.parse(sequencedIndicesStr);
    // If a specific sequencedIndex is provided (old UI with separate textareas), handle normally.
    if (sequencedIndex !== undefined) {
      const seqIdx = Number(sequencedIndex);
      const targetIndex = sequencedIndices[seqIdx];
      const targetEntry = state.entries[targetIndex];
      if (targetEntry) {
        targetEntry.text = normalized;
        targetEntry.dirty = targetEntry.text !== targetEntry.originalText;
        const encodedLength = encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull }).length;
        targetEntry.byteLength = targetEntry.dirty ? encodedLength : targetEntry.originalBytes.length;
      }
    } else {
      // Combined textarea edited: distribute the full text across sequenced parts.
      const fullText = normalized;
      const targets = sequencedIndices.map(idx => state.entries[idx]).filter(Boolean);
      if (targets.length) {
        // Compute original visible lengths to determine proportionate split.
        const origVis = targets.map(t => Math.max(1, countVisibleCharacters(t.originalText)));
        const sumOrig = origVis.reduce((a, b) => a + b, 0) || targets.length;
        const desired = origVis.map(v => Math.round((v / sumOrig) * countVisibleCharacters(fullText)));
        // Adjust to ensure total equals full length
        let totalDesired = desired.reduce((a, b) => a + b, 0);
        const fullVis = countVisibleCharacters(fullText);
        // Fix rounding drift
        let i = 0;
        while (totalDesired !== fullVis && i < desired.length) {
          if (totalDesired < fullVis) {
            desired[i] += 1;
            totalDesired += 1;
          } else if (totalDesired > fullVis && desired[i] > 0) {
            desired[i] -= 1;
            totalDesired -= 1;
          }
          i = (i + 1) % desired.length;
        }
        const parts = splitPreservingTokens(fullText, desired);
        targets.forEach((targetEntry, idx) => {
          const part = parts[idx] ?? '';
          targetEntry.text = part;
          targetEntry.dirty = targetEntry.text !== targetEntry.originalText;
          if (targetEntry.kind === 'mid' && targetEntry.segment) {
            const nextBytes = targetEntry.dirty
              ? encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull })
              : targetEntry.originalBytes.slice();
            targetEntry.segment.bytes = nextBytes;
            targetEntry.segment.text = targetEntry.text;
            targetEntry.segment.leadingNull = targetEntry.leadingNull;
            targetEntry.byteLength = nextBytes.length;
          } else {
            const encodedLength = encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull }).length;
            targetEntry.byteLength = targetEntry.dirty ? encodedLength : targetEntry.originalBytes.length;
          }
        });
      }
    }
  } else if (sequencedIndicesStr && kind === 'mid') {
    // Combined MID group textarea edited: distribute across MID ids
    const sequencedIds = JSON.parse(sequencedIndicesStr);
    const fullText = normalized;
    const targets = sequencedIds.map(id => state.midStrings.find(e => e.id === id)).filter(Boolean);
    if (targets.length) {
      const origVis = targets.map(t => Math.max(1, countVisibleCharacters(t.originalText)));
      const sumOrig = origVis.reduce((a, b) => a + b, 0) || targets.length;
      const fullVis = countVisibleCharacters(fullText);
      const desired = origVis.map(v => Math.round((v / sumOrig) * fullVis));
      // Fix rounding drift
      let totalDesired = desired.reduce((a, b) => a + b, 0);
      let idxFix = 0;
      while (totalDesired !== fullVis && idxFix < desired.length) {
        if (totalDesired < fullVis) { desired[idxFix] += 1; totalDesired += 1; }
        else if (totalDesired > fullVis && desired[idxFix] > 0) { desired[idxFix] -= 1; totalDesired -= 1; }
        idxFix = (idxFix + 1) % desired.length;
      }
      const parts = splitPreservingTokens(fullText, desired);
      targets.forEach((targetEntry, idx) => {
        const part = parts[idx] ?? '';
        targetEntry.text = part;
        targetEntry.dirty = targetEntry.text !== targetEntry.originalText;
        if (targetEntry.segment) {
          const nextBytes = targetEntry.dirty
            ? encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull })
            : targetEntry.originalBytes.slice();
          targetEntry.segment.bytes = nextBytes;
          targetEntry.segment.text = targetEntry.text;
          targetEntry.segment.leadingNull = targetEntry.leadingNull;
          targetEntry.byteLength = nextBytes.length;
        } else {
          const encodedLength = encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull }).length;
          targetEntry.byteLength = targetEntry.dirty ? encodedLength : targetEntry.originalBytes.length;
        }
      });
    }
  } else {
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
    return;
  }
  
  card.classList.toggle('modified', entry.dirty);
  // Update the preview highlight for the specific textarea that was edited.
  try {
    const shell = event.target.closest('.editor-shell');
    const hl = shell ? shell.querySelector('.text-highlight') : null;
    if (hl) updateTextHighlight(hl, event.target.value);
  } catch (e) {
    // ignore
  }
  // Update card-level modified state when editing a part
  try {
    const card = event.target.closest('.entry-card');
    if (card) {
      let modified = false;
      const taList = card.querySelectorAll('textarea');
      taList.forEach((ta) => {
        const resolved = resolveEntry(ta.dataset.kind, ta.dataset.id);
        if (resolved && resolved.dirty) modified = true;
      });
      // also consider top-level entry.dirty
      const topEntryKind = event.target.dataset.kind;
      const topEntryId = event.target.dataset.id;
      const topResolved = resolveEntry(topEntryKind, topEntryId);
      if (topResolved && topResolved.dirty) modified = true;

      card.classList.toggle('modified', modified);
      const badges = card.querySelector('.badges');
      const existing = badges ? Array.from(badges.children).find(b => (b.textContent || '').toLowerCase() === 'modified') : null;
      if (badges) {
        if (modified && !existing) badges.appendChild(makeBadge('modified', 'warning'));
        else if (!modified && existing) existing.remove();
      }
      const revertBtn = card.querySelector('.revert');
      if (revertBtn) revertBtn.disabled = !modified;
    }
  } catch (e) {
    // ignore
  }
  const revertBtn = card.querySelector('.revert');
  if (revertBtn) {
    revertBtn.disabled = !entry.dirty;
  }
  refreshEntryMetrics();
  updateSaveButton();
}

function onEntryRevert(event) {
  const kind = event.currentTarget.dataset.kind;
  const id = event.currentTarget.dataset.id;
  const scrollingIdsStr = event.currentTarget.dataset.scrollingIds;
  const sequencedIndicesStr = event.currentTarget.dataset.sequencedIndices;
  
  const entry = resolveEntry(kind, id);
  if (!entry) return;
  
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
  } else if (sequencedIndicesStr && kind !== 'mid') {
    const sequencedIndices = JSON.parse(sequencedIndicesStr);
    sequencedIndices.forEach((targetIndex) => {
      const targetEntry = state.entries[targetIndex];
      if (targetEntry) {
        targetEntry.text = targetEntry.originalText;
        targetEntry.leadingNull = targetEntry.originalLeadingNull;
        targetEntry.byteLength = targetEntry.originalBytes.length;
        targetEntry.dirty = false;
      }
    });
  } else {
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
  const textareas = card.querySelectorAll('textarea');
  if (sequencedIndicesStr) {
    const sequencedIndices = JSON.parse(sequencedIndicesStr);
    // If a single combined textarea is present, set its value to the concatenation of parts.
    if (textareas.length === 1) {
      let combined;
      if (kind === 'mid') {
        combined = sequencedIndices.map(i => (state.midStrings.find(e => e.id === i)?.text ?? '')).join('');
      } else {
        combined = sequencedIndices.map(i => (state.entries[i]?.text ?? '')).join('');
      }
      textareas[0].value = combined;
      // find associated highlight (support shell-wrapped or adjacent highlight)
      const shell0 = textareas[0].closest('.editor-shell');
      const hl0 = (textareas[0].nextElementSibling && textareas[0].nextElementSibling.classList && textareas[0].nextElementSibling.classList.contains('text-highlight'))
        ? textareas[0].nextElementSibling
        : (shell0 ? shell0.querySelector('.text-highlight') : null);
      if (hl0) updateTextHighlight(hl0, combined);
    } else {
      // multiple textareas for parts (legacy INF or auto MID groups)
      textareas.forEach((textarea, idx) => {
        const targetKey = sequencedIndices[idx];
        if (kind === 'mid') {
          const targetEntry = state.midStrings.find(e => e.id === targetKey);
          if (targetEntry) {
            textarea.value = targetEntry.text;
            const shell = textarea.closest('.editor-shell');
            const highlight = (textarea.nextElementSibling && textarea.nextElementSibling.classList && textarea.nextElementSibling.classList.contains('text-highlight'))
              ? textarea.nextElementSibling
              : (shell ? shell.querySelector('.text-highlight') : null);
            if (highlight) updateTextHighlight(highlight, targetEntry.text);
          }
        } else {
          const targetIndex = targetKey;
          const targetEntry = state.entries[targetIndex];
          if (targetEntry) {
            textarea.value = targetEntry.text;
            const shell = textarea.closest('.editor-shell');
            const highlight = (textarea.nextElementSibling && textarea.nextElementSibling.classList && textarea.nextElementSibling.classList.contains('text-highlight'))
              ? textarea.nextElementSibling
              : (shell ? shell.querySelector('.text-highlight') : null);
            if (highlight) updateTextHighlight(highlight, targetEntry.text);
          }
        }
      });
    }
  } else {
    textareas.forEach(textarea => {
      textarea.value = entry.text;
    });
    const highlights = card.querySelectorAll('.text-highlight');
    highlights.forEach(highlight => {
      highlight.dataset.entryKind = entry.kind;
      highlight.dataset.entryColor = entry.color ?? 'default';
      updateTextHighlight(highlight, entry.text);
    });
  }
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

  const sizeLine = `<div class="meta-block"><strong>Section sizes</strong><br>INF1: <strong>${infCount}</strong> · ${infSize} &nbsp;·&nbsp; DAT1: <strong>${datSize}</strong> &nbsp;·&nbsp; MID1: <strong>${midCount}</strong> · ${midSize}</div>`;
  const countLine = `<div class="meta-block"><strong>Entry counts</strong><br>Total: <strong>${totalCount}</strong> · INF1: <strong>${infCount}</strong> · MID1: <strong>${midCount}</strong></div>`;
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
  // Build MID grouped messages using improved detection (offsets/tokens heuristics)
  const groupedMessages = [];
  const midStrings = state.midStrings || [];

  // DO NOT auto-detect MID groups for export. Export every MID entry separately so no fragments are lost.
  if (midStrings.length) {
    midStrings.forEach((entry) => {
      groupedMessages.push({
        id: entry.id,
        message: entry.text
      });
    });
  }

  // Include any user-defined MID groups (state.midGroups) in the export.
  const userGroups = state.midGroups || [];
  userGroups.forEach((group) => {
    if (!Array.isArray(group) || group.length === 0) return;
    const leader = group[0];
    // Avoid duplicates: only add if not present already
    if (groupedMessages.some((m) => m.id === leader)) return;
    const combined = group.map(id => {
      const s = midStrings.find(m => m.id === id);
      return s ? s.text : '';
    }).join('');

    // Try to produce an explicit `messages` array matching sequenced ids so
    // exported JSON keeps parts separate (lossless round-trip). Use
    // token-preserving splitting based on the original visible lengths of
    // each target entry where possible. Fall back to a single combined
    // message if splitting isn't feasible.
    const targets = group.map(id => midStrings.find(m => m.id === id)).filter(Boolean);
    if (targets.length > 1) {
      const normalizedFull = normalizeInput(combined);
      // Compute visible char counts from originalText if available, else current text
      const origVis = targets.map(t => Math.max(1, countVisibleCharacters(t.originalText ?? t.text ?? '')));
      const sumOrig = origVis.reduce((a, b) => a + b, 0) || targets.length;
      const fullVis = countVisibleCharacters(normalizedFull);
      const desired = origVis.map(v => Math.round((v / sumOrig) * fullVis));
      let totalDesired = desired.reduce((a, b) => a + b, 0);
      let idxFix = 0;
      while (totalDesired !== fullVis && idxFix < desired.length) {
        if (totalDesired < fullVis) { desired[idxFix] += 1; totalDesired += 1; }
        else if (totalDesired > fullVis && desired[idxFix] > 0) { desired[idxFix] -= 1; totalDesired -= 1; }
        idxFix = (idxFix + 1) % desired.length;
      }
      const parts = splitPreservingTokens(normalizedFull, desired);
      // Ensure parts array matches group length
      while (parts.length < group.length) parts.push('');
      groupedMessages.push({ id: leader, messages: parts, sequencedGroup: group.slice() });
    } else {
      // Fallback: export as single combined message
      groupedMessages.push({ id: leader, message: combined, sequencedGroup: group.slice() });
    }
  });
  
  const infGroups = detectSequencedGroups(state.entries);
  const groupedInfEntries = [];
  
  infGroups.forEach(group => {
    if (group.isSequenced) {
      groupedInfEntries.push({
        id: group.entries[0].index,
        messages: group.entries.map(e => e.text),
        // Export canonical INF indices (entry.index) so imports map reliably by index
        sequencedGroup: group.entries.map(e => e.index)
      });
    } else {
      groupedInfEntries.push({
        id: group.entries[0].index,
        message: group.entries[0].text
      });
    }
  });
  
  const payload = {
    inf1: groupedInfEntries,
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
      
      const seen = new Set();
      const messages = new Map();
      
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
        // Accept either a single string `message` or an array `messages` when sequencedGroup present
        const hasMessagesArray = Array.isArray(item.messages) && item.messages.every(m => typeof m === 'string');
        const hasSingleMessage = typeof item.message === 'string';
        if (!hasSingleMessage && !hasMessagesArray) {
          throw new Error(`Entry ${id} must have either a string "message" or an array "messages".`);
        }
        seen.add(id);

        if (Array.isArray(item.sequencedGroup) && item.sequencedGroup.length > 1) {
          // sequenced group: prefer explicit `messages` array; fall back to single combined `message` string
          if (hasMessagesArray) {
            messages.set(id, {
              isSequenced: true,
              indices: item.sequencedGroup,
              messages: item.messages.map(m => normalizeInput(m))
            });
          } else {
            messages.set(id, {
              isSequenced: true,
              indices: item.sequencedGroup,
              // older form: one combined string, importer will split proportionally
              message: normalizeInput(item.message)
            });
          }
        } else {
          // non-sequenced single message
          messages.set(id, {
            isSequenced: false,
            message: normalizeInput(item.message ?? (Array.isArray(item.messages) ? item.messages[0] : ''))
          });
        }
      });
      
      // Apply provided entries/groups to INF entries. The JSON may provide group leaders
      // (with sequencedGroup + messages[]) or single-entry items. Iterate the messages
      // map and apply each item to the target entries.
      messages.forEach((data, key) => {
        const numericKey = Number(key);
        if (!data || typeof data !== 'object') return;
        if (!data.isSequenced) {
          const entry = state.entries[numericKey];
          if (!entry) return;
          entry.text = normalizeInput(data.message ?? '');
          const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
          entry.dirty = entry.text !== entry.originalText;
          entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
          return;
        }

        // Sequenced group: data.indices lists target INF indices. If an explicit
        // `messages` array is provided, assign parts directly; otherwise fall back
        // to splitting the combined `message` string proportionally.
        const targetIndices = Array.isArray(data.indices) ? data.indices.map(Number) : [];
        if (!targetIndices.length) return;

        if (Array.isArray(data.messages) && data.messages.length > 0) {
          targetIndices.forEach((tIdx, idx) => {
            const targetEntry = state.entries[tIdx];
            if (!targetEntry) return;
            const part = normalizeInput(data.messages[idx] ?? '');
            targetEntry.text = part;
            const encodedLength = encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull }).length;
            targetEntry.dirty = targetEntry.text !== targetEntry.originalText;
            targetEntry.byteLength = targetEntry.dirty ? encodedLength : targetEntry.originalBytes.length;
          });
        } else if (typeof data.message === 'string') {
          const normalizedFull = normalizeInput(data.message);
          const targets = targetIndices.map(i => state.entries[i]).filter(Boolean);
          if (targets.length) {
            const origVis = targets.map(t => Math.max(1, countVisibleCharacters(t.originalText)));
            const sumOrig = origVis.reduce((a, b) => a + b, 0) || targets.length;
            const fullVis = countVisibleCharacters(normalizedFull);
            const desired = origVis.map(v => Math.round((v / sumOrig) * fullVis));
            let totalDesired = desired.reduce((a, b) => a + b, 0);
            let idxFix = 0;
            while (totalDesired !== fullVis && idxFix < desired.length) {
              if (totalDesired < fullVis) { desired[idxFix] += 1; totalDesired += 1; }
              else if (totalDesired > fullVis && desired[idxFix] > 0) { desired[idxFix] -= 1; totalDesired -= 1; }
              idxFix = (idxFix + 1) % desired.length;
            }
            const parts = splitPreservingTokens(normalizedFull, desired);
            targets.forEach((targetEntry, idx) => {
              const part = parts[idx] ?? '';
              targetEntry.text = part;
              targetEntry.dirty = targetEntry.text !== targetEntry.originalText;
              const encodedLength = encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull }).length;
              targetEntry.byteLength = targetEntry.dirty ? encodedLength : targetEntry.originalBytes.length;
            });
          }
        }
      });
      
      if (Array.isArray(midStrings) && midStrings.length > 0 && state.midStrings && state.midStrings.length > 0) {
        midStrings.forEach((item) => {
          if (typeof item !== 'object' || item === null) {
            return;
          }
          
          const baseId = Number(item.id);
          const message = item.message;
          const messagesArr = Array.isArray(item.messages) ? item.messages : null;
          const scrollingGroup = item.scrollingGroup;

          if (!Number.isInteger(baseId) || (!messagesArr && typeof message !== 'string' && !Array.isArray(scrollingGroup))) {
            return;
          }

          if (Array.isArray(scrollingGroup) && scrollingGroup.length > 1 && typeof message === 'string') {
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
            // Support sequencedGroup for MID entries in import JSON
            if (Array.isArray(item.sequencedGroup) && item.sequencedGroup.length > 1) {
              const ids = item.sequencedGroup.map(Number);
              // If explicit messages array is provided, assign parts directly
              if (Array.isArray(messagesArr) && messagesArr.length > 0) {
                ids.forEach((idVal, idx) => {
                  const entry = state.midStrings.find(e => e.id === idVal);
                  if (!entry) return;
                  entry.text = normalizeInput(messagesArr[idx] ?? '');
                  const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
                  entry.dirty = entry.text !== entry.originalText;
                  entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
                });
              } else if (typeof message === 'string') {
                const normalizedFull = normalizeInput(message);
                const targets = ids.map(id => state.midStrings.find(e => e.id === id)).filter(Boolean);
                if (targets.length) {
                  const origVis = targets.map(t => Math.max(1, countVisibleCharacters(t.originalText)));
                  const sumOrig = origVis.reduce((a, b) => a + b, 0) || targets.length;
                  const fullVis = countVisibleCharacters(normalizedFull);
                  const desired = origVis.map(v => Math.round((v / sumOrig) * fullVis));
                  let totalDesired = desired.reduce((a, b) => a + b, 0);
                  let idxFix = 0;
                  while (totalDesired !== fullVis && idxFix < desired.length) {
                    if (totalDesired < fullVis) { desired[idxFix] += 1; totalDesired += 1; }
                    else if (totalDesired > fullVis && desired[idxFix] > 0) { desired[idxFix] -= 1; totalDesired -= 1; }
                    idxFix = (idxFix + 1) % desired.length;
                  }
                  const parts = splitPreservingTokens(normalizedFull, desired);
                  targets.forEach((entry, idx) => {
                    const part = parts[idx] ?? '';
                    entry.text = part;
                    const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
                    entry.dirty = entry.text !== entry.originalText;
                    entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
                  });
                }
              }
            } else {
              const entry = state.midStrings.find(e => e.id === baseId);
              if (entry) {
                if (Array.isArray(messagesArr) && messagesArr.length > 0) {
                  // If multiple messages were provided for a single baseId, use the first
                  entry.text = normalizeInput(messagesArr[0] ?? '');
                } else {
                  entry.text = normalizeInput(message ?? '');
                }
                const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
                entry.dirty = entry.text !== entry.originalText;
                entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
              }
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
    out[index * 2] = code & 0xff;
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
  
  const sectionLabel = entry.kind === 'mid' ? 'MID1' : 'INF1';
  const sectionVariant = entry.kind === 'mid' ? 'mid1' : 'inf1';
  const sectionBadge = makeBadge(sectionLabel, sectionVariant);
  container.appendChild(sectionBadge);
  
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

/**
 * Split a full text into parts while preserving special token chunks (e.g. [02], [RED], hex tokens).
 * desiredVisibleCounts is an array of integers representing how many visible characters (excluding tokens)
 * each part should contain. Returns an array of strings (parts) of same length.
 */
function splitPreservingTokens(fullText, desiredVisibleCounts) {
  // Tokenize fullText into segments: {type:'text'|'token', text}
  const regex = tokenRegex();
  let lastIndex = 0;
  let match;
  const segments = [];
  while ((match = regex.exec(fullText)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: fullText.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'token', text: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < fullText.length) {
    segments.push({ type: 'text', text: fullText.slice(lastIndex) });
  }

  // Helper to consume N visible chars from segments, returning concatenated string and new cursor state
  function consumeVisible(cursor, need) {
    let { segIndex, charOffset } = cursor;
    let out = '';
    while (need > 0 && segIndex < segments.length) {
      const seg = segments[segIndex];
      if (seg.type === 'token') {
        out += seg.text;
        segIndex += 1;
        charOffset = 0;
        continue;
      }
      const text = seg.text;
      const available = text.length - charOffset;
      if (available <= 0) {
        segIndex += 1;
        charOffset = 0;
        continue;
      }
      const take = Math.min(need, available);
      out += text.slice(charOffset, charOffset + take);
      need -= take;
      charOffset += take;
      if (charOffset >= text.length) {
        segIndex += 1;
        charOffset = 0;
      }
    }
    // After consuming desired visible chars, also include any following tokens that immediately follow
    while (segIndex < segments.length && segments[segIndex].type === 'token') {
      out += segments[segIndex].text;
      segIndex += 1;
    }
    return { out, cursor: { segIndex, charOffset } };
  }

  // Total parts
  const parts = [];
  let cursor = { segIndex: 0, charOffset: 0 };
  for (let i = 0; i < desiredVisibleCounts.length; i += 1) {
    const want = Math.max(0, desiredVisibleCounts[i] || 0);
    const { out, cursor: next } = consumeVisible(cursor, want);
    parts.push(out);
    cursor = next;
  }
  // If anything remains, append to the last part
  let remainder = '';
  while (cursor.segIndex < segments.length) {
    remainder += segments[cursor.segIndex].text.slice(cursor.charOffset);
    cursor.segIndex += 1;
    cursor.charOffset = 0;
  }
  if (remainder.length) {
    if (parts.length === 0) parts.push(remainder); else parts[parts.length - 1] += remainder;
  }
  return parts;
}

// MID group management helpers
function getMidGroupForId(id) {
  const groups = state.midGroups || [];
  for (let i = 0; i < groups.length; i += 1) {
    if (groups[i].includes(id)) return groups[i];
  }
  return null;
}

function removeIdFromGroups(id) {
  const groups = state.midGroups || [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const idx = groups[i].indexOf(id);
    if (idx >= 0) {
      groups[i].splice(idx, 1);
      if (groups[i].length < 2) {
        groups.splice(i, 1);
      }
    }
  }
}

function addMidGroupPair(a, b) {
  if (a === b) return;
  state.midGroups = state.midGroups || [];
  const ga = getMidGroupForId(a);
  const gb = getMidGroupForId(b);
  if (ga && gb) {
    if (ga === gb) return; // already same group
    // merge gb into ga
    ga.push(...gb.filter(x => !ga.includes(x)));
    // remove gb
    state.midGroups = state.midGroups.filter(g => g !== gb);
    return;
  }
  if (ga && !gb) {
    if (!ga.includes(b)) ga.push(b);
    return;
  }
  if (!ga && gb) {
    if (!gb.includes(a)) gb.unshift(a);
    return;
  }
  // neither in group: create new group with order [a,b]
  state.midGroups.push([a, b]);
}

function onGroupWithNext(event) {
  const id = Number(event.currentTarget.dataset.id);
  const idx = state.midStrings.findIndex(e => e.id === id);
  if (idx < 0) return showMessage('MID entry not found.', 'error');
  const next = state.midStrings[idx + 1];
  if (!next) return showMessage('No next MID entry to group with.', 'warning');
  addMidGroupPair(id, next.id);
  renderEntries();
  showMessage(`Grouped MID ${id} with ${next.id}.`, 'success');
}

// onUngroup removed: MID grouping is automatic and controlled internally.