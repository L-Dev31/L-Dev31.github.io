import { safeGetUint16, safeGetUint32 } from './utils.js';
import { BmgTag } from './bmg-format.js';

// Find section offset by ASCII tag name (labeled-continue pattern)
function findSection(bytes, tag) {
  const len = tag.length;
  outer:
  for (let i = 0, end = bytes.length - len; i <= end; i++) {
    for (let j = 0; j < len; j++) {
      if (bytes[i + j] !== tag.charCodeAt(j)) continue outer;
    }
    return i;
  }
  return -1;
}

// Convert a token string to its binary escape sequence
function encodeToken(tokenString, encodingType = 'UTF16') {
  const tag = BmgTag.fromString(tokenString);
  if (!tag) throw new Error(`Invalid token format: ${tokenString}`);

  const args = tag.argumentData || [];
  const out = encodingType === 'UTF16' ? [0x1A, 0x00] : [0x1A];
  out.push(3 + args.length, tag.groupId & 0xFF, tag.typeId & 0xFF, (tag.typeId >> 8) & 0xFF, ...args);
  return new Uint8Array(out);
}

// Encode text to bytes based on encoding type
function encodeText(text, encodingType) {
  if (encodingType === 'UTF16') {
    const codes = [];
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i);
      if (cp === undefined) break;
      if (cp > 0xFFFF) {
        const adj = cp - 0x10000;
        const hi = 0xD800 + (adj >> 10), lo = 0xDC00 + (adj & 0x3FF);
        codes.push(hi & 0xFF, hi >> 8, lo & 0xFF, lo >> 8);
        i++;
      } else {
        codes.push(cp & 0xFF, cp >> 8);
      }
    }
    return new Uint8Array(codes);
  }
  const enc = { UTF8: 'utf-8', ShiftJIS: 'shift_jis' }[encodingType] || 'windows-1252';
  try { return new TextEncoder(enc).encode(text); }
  catch { return new TextEncoder().encode(text); }
}

// Encode message text with inline tags back to binary.
// Reuses original tag bytes from tagBytesMap when available (bit-perfect rebuild).
function encodeMessageText(text, encodingType, tagBytesMap = null) {
  const tokenRegex = /\[(?:[0-9A-F]{1,2}):(?:[0-9A-F]{1,4})(?::(?:[0-9A-F]+))?|Color:[0-9A-F]+\]/gi;
  const parts = [];
  let lastIndex = 0, match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ text: text.substring(lastIndex, match.index) });

    const tok = match[0];
    let tokenBytes = tagBytesMap instanceof Map ? tagBytesMap.get(tok) : null;
    if (tokenBytes) {
      tokenBytes = new Uint8Array(tokenBytes);
    } else {
      try { tokenBytes = encodeToken(tok, encodingType); }
      catch { parts.push({ text: tok }); tokenBytes = null; }
    }
    if (tokenBytes) parts.push({ bytes: tokenBytes });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.substring(lastIndex) });

  // Encode text parts and calculate total size
  let totalSize = 0;
  for (const p of parts) {
    if (p.text !== undefined) { p.encoded = encodeText(p.text, encodingType); totalSize += p.encoded.length; }
    else totalSize += p.bytes.length;
  }

  const result = new Uint8Array(totalSize);
  let off = 0;
  for (const p of parts) {
    const data = p.encoded || p.bytes;
    result.set(data, off);
    off += data.length;
  }
  return result;
}

// Build a patched BMG file from a BmgFile object
function buildBmg(bmgFile) {
  const rawBuffer = bmgFile._rawData;
  const bytes = new Uint8Array(rawBuffer);
  const view = new DataView(rawBuffer);
  const le = !bmgFile.bigEndian;

  const inf1Offset = findSection(bytes, 'INF1');
  const dat1Offset = findSection(bytes, 'DAT1');
  if (inf1Offset === -1 || dat1Offset === -1) throw new Error('Required sections not found');

  const inf1Size = safeGetUint32(view, inf1Offset + 4, rawBuffer.byteLength, le);
  const entryCount = safeGetUint16(view, inf1Offset + 8, rawBuffer.byteLength);
  const entrySize = safeGetUint16(view, inf1Offset + 10, rawBuffer.byteLength);
  const dat1Size = safeGetUint32(view, dat1Offset + 4, rawBuffer.byteLength, le);
  const dat1DataStart = dat1Offset + 8;
  const inf1HeaderSize = 16;
  const encodingWidth = bmgFile.encodingType === 'UTF16' ? 2 : 1;

  // Group messages by original DAT offset to preserve shared strings
  const offsetGroups = new Map();
  const offsetSet = new Set([0]);
  for (let i = 0; i < bmgFile.messages.length; i++) {
    const off = Number(bmgFile.messages[i]._offset) || 0;
    if (!offsetGroups.has(off)) offsetGroups.set(off, []);
    offsetGroups.get(off).push(i);
    offsetSet.add(off);
  }

  const uniqueOffsets = [...offsetSet].filter(o => o >= 0).sort((a, b) => a - b);

  // Extract original chunks per unique offset
  const originalChunkMap = new Map();
  let boundary = Math.max(0, dat1Size - 8);
  for (let i = uniqueOffsets.length - 1; i >= 0; i--) {
    const off = uniqueOffsets[i];
    const start = dat1DataStart + off, end = dat1DataStart + boundary;
    originalChunkMap.set(off, (start >= bytes.length || start >= end)
      ? new Uint8Array(0) : bytes.slice(start, Math.min(end, bytes.length)));
    boundary = off;
  }

  // Build output chunks — reuse originals for clean messages, re-encode dirty ones
  const chunkEntries = [];
  const messageChunkMap = new Array(bmgFile.messages.length);
  let newDat1DataSize = 0;

  for (const off of uniqueOffsets) {
    const indices = offsetGroups.get(off) || [];
    const origChunk = originalChunkMap.get(off);

    if (indices.length === 0) {
      if (origChunk?.length) { chunkEntries.push({ data: origChunk }); newDat1DataSize += origChunk.length; }
      continue;
    }

    const clean = indices.filter(i => !bmgFile.messages[i].dirty);
    const dirty = indices.filter(i => bmgFile.messages[i].dirty);

    if (clean.length > 0 && origChunk) {
      const entry = { data: origChunk };
      chunkEntries.push(entry);
      clean.forEach(i => { messageChunkMap[i] = entry; });
      newDat1DataSize += origChunk.length;
    }

    for (const idx of (origChunk ? dirty : indices)) {
      const msg = bmgFile.messages[idx];
      const encoded = encodeMessageText(msg.text, bmgFile.encodingType, msg._tagBytesMap);
      const msgSize = encoded.length + encodingWidth;
      const padding = (4 - (msgSize % 4)) % 4;
      const chunk = new Uint8Array(msgSize + padding);
      chunk.set(encoded, 0);
      const entry = { data: chunk };
      chunkEntries.push(entry);
      messageChunkMap[idx] = entry;
      newDat1DataSize += chunk.length;
    }
  }

  // Assign new DAT1 offsets
  let runOff = 0;
  for (const e of chunkEntries) { e.newOffset = runOff; runOff += e.data.length; }

  // Rebuild INF1 with updated offsets
  const newInf1 = new Uint8Array(inf1Size);
  const newInf1View = new DataView(newInf1.buffer);
  newInf1.set(bytes.slice(inf1Offset, inf1Offset + inf1HeaderSize));
  newInf1View.setUint32(4, inf1Size, le);

  for (let i = 0; i < entryCount; i++) {
    const newPos = inf1HeaderSize + i * entrySize;
    const oldPos = inf1Offset + inf1HeaderSize + i * entrySize;
    newInf1View.setUint32(newPos, messageChunkMap[i]?.newOffset ?? 0, le);
    newInf1.set(bytes.slice(oldPos + 4, oldPos + entrySize), newPos + 4);
  }

  // Rebuild DAT1
  const newDat1TotalSize = 8 + newDat1DataSize;
  const newDat1 = new Uint8Array(newDat1TotalSize);
  const newDat1View = new DataView(newDat1.buffer);
  newDat1.set([0x44, 0x41, 0x54, 0x31]); // 'DAT1'
  newDat1View.setUint32(4, newDat1TotalSize, le);
  let wOff = 8;
  for (const e of chunkEntries) { newDat1.set(e.data, wOff); wOff += e.data.length; }

  // Preserve sections between INF1 and DAT1, and after DAT1
  const gapSize = dat1Offset - (inf1Offset + inf1Size);
  const gap = gapSize > 0 ? bytes.slice(inf1Offset + inf1Size, dat1Offset) : new Uint8Array(0);
  const tail = (dat1Offset + dat1Size < bytes.length) ? bytes.slice(dat1Offset + dat1Size) : new Uint8Array(0);

  // Assemble final file
  const finalSize = inf1Offset + inf1Size + gapSize + newDat1TotalSize + tail.length;
  const result = new Uint8Array(finalSize);
  const resultView = new DataView(result.buffer);
  let cursor = 0;

  result.set(bytes.slice(0, inf1Offset), cursor); cursor += inf1Offset;
  result.set(newInf1, cursor); cursor += inf1Size;
  if (gapSize > 0) { result.set(gap, cursor); cursor += gapSize; }
  result.set(newDat1, cursor); cursor += newDat1TotalSize;
  if (tail.length > 0) result.set(tail, cursor);

  resultView.setUint32(8, finalSize, le);
  return result.buffer;
}

export { buildBmg, encodeMessageText, encodeToken };
