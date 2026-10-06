import { safeGetUint16, safeGetUint32, findSection } from './utils.js';
import { BmgTag } from './bmg-format.js';

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

  // Discover all sections in the file
  const sectionList = [];
  for (const tag of ['INF1', 'DAT1', 'MID1', 'STR1', 'FLW1', 'FLI1']) {
    const off = findSection(bytes, tag);
    if (off !== -1) {
      const size = safeGetUint32(view, off + 4, rawBuffer.byteLength, le);
      sectionList.push({ tag, offset: off, size });
    }
  }
  sectionList.sort((a, b) => a.offset - b.offset);

  const inf1 = sectionList.find(s => s.tag === 'INF1');
  const dat1 = sectionList.find(s => s.tag === 'DAT1');
  if (!inf1 || !dat1) throw new Error('Required sections not found');

  const oldEntryCount = safeGetUint16(view, inf1.offset + 8, rawBuffer.byteLength);
  const entrySize = safeGetUint16(view, inf1.offset + 10, rawBuffer.byteLength);
  const dat1DataStart = dat1.offset + 8;
  const encodingWidth = bmgFile.encodingType === 'UTF16' ? 2 : 1;
  const newEntryCount = bmgFile.messages.length;
  const oldDat1DataSize = dat1.size - 8;

  // --- Build DAT1 data chunks ---
  const newMsgIndices = [];  // messages with no original offset (newly created)
  const offsetGroups = new Map();
  const offsetSet = new Set([0]);
  for (let i = 0; i < newEntryCount; i++) {
    const off = Number(bmgFile.messages[i]._offset);
    if (off < 0) { newMsgIndices.push(i); continue; }
    if (!offsetGroups.has(off)) offsetGroups.set(off, []);
    offsetGroups.get(off).push(i);
    offsetSet.add(off);
  }

  const uniqueOffsets = [...offsetSet].sort((a, b) => a - b);

  const originalChunkMap = new Map();
  const dat1DataEnd = dat1DataStart + oldDat1DataSize;
  let boundary = Math.max(0, oldDat1DataSize);
  for (let i = uniqueOffsets.length - 1; i >= 0; i--) {
    const off = uniqueOffsets[i];
    const start = dat1DataStart + off, end = dat1DataStart + boundary;
    originalChunkMap.set(off, (start >= dat1DataEnd || start >= end)
      ? new Uint8Array(0) : bytes.slice(start, Math.min(end, dat1DataEnd)));
    boundary = off;
  }

  const chunkEntries = [];
  const messageChunkMap = new Array(newEntryCount);
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

  // Encode newly created messages (no original data to preserve)
  for (const idx of newMsgIndices) {
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

  let runOff = 0;
  for (const e of chunkEntries) { e.newOffset = runOff; runOff += e.data.length; }

  // --- Build new INF1 (supports changed entry count) ---
  const newInf1RawSize = 16 + newEntryCount * entrySize;
  const newInf1Size = (inf1.size % 32 === 0) ? Math.ceil(newInf1RawSize / 32) * 32 : newInf1RawSize;
  const newInf1 = new Uint8Array(newInf1Size);
  const newInf1View = new DataView(newInf1.buffer);
  newInf1.set(bytes.slice(inf1.offset, inf1.offset + 16)); // copy header
  newInf1View.setUint32(4, newInf1Size, le);
  newInf1View.setUint16(8, newEntryCount, le);

  for (let i = 0; i < newEntryCount; i++) {
    const pos = 16 + i * entrySize;
    newInf1View.setUint32(pos, messageChunkMap[i]?.newOffset ?? 0, le);
    const attr = bmgFile.messages[i].attribute;
    for (let j = 0; j < entrySize - 4; j++) {
      newInf1[pos + 4 + j] = (attr && j < attr.length) ? (attr[j] ?? 0) : 0;
    }
  }

  // --- Build new DAT1 ---
  const newDat1TotalSize = 8 + newDat1DataSize;
  const newDat1 = new Uint8Array(newDat1TotalSize);
  const newDat1View = new DataView(newDat1.buffer);
  newDat1.set([0x44, 0x41, 0x54, 0x31]);
  newDat1View.setUint32(4, newDat1TotalSize, le);
  let wOff = 8;
  for (const e of chunkEntries) { newDat1.set(e.data, wOff); wOff += e.data.length; }

  // --- Build new MID1 if present ---
  let newMid1 = null;
  const mid1Sec = sectionList.find(s => s.tag === 'MID1');
  if (bmgFile.hasMid1 && mid1Sec) {
    const newMid1RawSize = 16 + newEntryCount * 4;
    const newMid1Size = (mid1Sec.size % 32 === 0) ? Math.ceil(newMid1RawSize / 32) * 32 : newMid1RawSize;
    newMid1 = new Uint8Array(newMid1Size);
    const newMid1View = new DataView(newMid1.buffer);
    newMid1.set([0x4D, 0x49, 0x44, 0x31]);
    newMid1View.setUint32(4, newMid1Size, le);
    newMid1View.setUint16(8, newEntryCount, le);
    if (bmgFile.mid1Format?.length >= 2) { newMid1[10] = bmgFile.mid1Format[0]; newMid1[11] = bmgFile.mid1Format[1]; }
    for (let i = 0; i < newEntryCount; i++) {
      newMid1View.setUint32(16 + i * 4, bmgFile.messages[i].id, le);
    }
  }

  // --- Assemble final file (preserving section order and inter-section gaps) ---
  const builtSections = { INF1: newInf1, DAT1: newDat1 };
  if (newMid1) builtSections.MID1 = newMid1;

  const parts = [bytes.slice(0, sectionList[0].offset)]; // file header
  let pos = sectionList[0].offset;

  for (const sec of sectionList) {
    if (sec.offset > pos) parts.push(bytes.slice(pos, sec.offset)); // inter-section gap
    parts.push(builtSections[sec.tag] || bytes.slice(sec.offset, sec.offset + sec.size));
    pos = sec.offset + sec.size;
  }
  if (pos < bytes.length) parts.push(bytes.slice(pos)); // trailing data

  const totalSize = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalSize);
  const resultView = new DataView(result.buffer);
  let cursor = 0;
  for (const p of parts) { result.set(p, cursor); cursor += p.length; }
  resultView.setUint32(8, totalSize, le);

  return result.buffer;
}

export { buildBmg, encodeMessageText, encodeToken };
