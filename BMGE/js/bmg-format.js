import { safeGetUint16, safeGetUint32, readAscii } from './utils.js';

const toHexByte = (b) => b.toString(16).padStart(2, '0').toUpperCase();

const parseArgHex = (argHex) => {
  if (!argHex) return [];
  const cleaned = argHex.replace(/^0x/i, '');
  const out = [];
  for (let i = 0; i < cleaned.length; i += 2) {
    const byteStr = cleaned.substring(i, i + 2);
    if (byteStr.length === 2) out.push(parseInt(byteStr, 16));
  }
  return out;
};

class BmgTag {
  constructor(groupId, typeId, argumentData = []) {
    this.groupId = groupId;
    this.typeId = typeId;
    this.argumentData = argumentData;
    this._originalBytes = null;
  }

  toString() {
    if (this.groupId === 0xFF && this.typeId === 0x0000 && this.argumentData?.length) {
      return `[Color:${this.argumentData.map(toHexByte).join('').padStart(4, '0')}]`;
    }
    const g = this.groupId.toString(16).toUpperCase();
    const t = this.typeId.toString(16).toUpperCase();
    const a = this.argumentData?.length ? `:${this.argumentData.map(toHexByte).join('')}` : '';
    return `[${g}:${t}${a}]`;
  }

  static fromString(str) {
    const colorMatch = /^\[Color:([0-9A-F]+)\]$/i.exec(str);
    if (colorMatch) {
      const hex = colorMatch[1].padStart(4, '0');
      return new BmgTag(0xFF, 0x0000, [parseInt(hex.substring(2, 4), 16), parseInt(hex.substring(0, 2), 16)]);
    }

    const hexMatch = [
      /\[([0-9A-F]+):([0-9A-F]+)(?::([0-9A-F]+))?\]/i,
      /\[@([0-9A-F]+):([0-9A-F]+)(?::([0-9A-F]+))?\]/i,
      /\{\{@([0-9A-F]{1,2}):([0-9A-F]{1,4})(?::([0-9A-F]+))?\}\}/i
    ].map((regex) => regex.exec(str)).find(Boolean);

    if (hexMatch) {
      return new BmgTag(
        parseInt(hexMatch[1], 16),
        parseInt(hexMatch[2], 16),
        parseArgHex(hexMatch[3])
      );
    }

    const decMatch =
      /\{\{@?(\d+):(\d+)(?:\s+([a-fA-F0-9]+))?\}\}/.exec(str) ||
      /\{\{@?(\d+):(\d+)(?:\s+arg="((?:0x)?[a-fA-F0-9]*)")?\}\}/.exec(str);
    if (!decMatch) return null;

    return new BmgTag(
      parseInt(decMatch[1], 10),
      parseInt(decMatch[2], 10),
      parseArgHex(decMatch[3])
    );
  }
  
  toBytes() {
    if (this._originalBytes) return this._originalBytes;
    const argLen = this.argumentData.length;
    const bytes = new Uint8Array(argLen + 6);
    bytes[0] = 0x1A;
    bytes[1] = argLen + 4; // group(1) + type(2) + args
    bytes[2] = this.groupId;
    bytes[3] = this.typeId & 0xFF;
    bytes[4] = (this.typeId >> 8) & 0xFF;
    for (let i = 0; i < argLen; i++) bytes[5 + i] = this.argumentData[i];
    return bytes;
  }
}

class BmgMessage {
  constructor() {
    this.id = 0;
    this.label = '';
    this.attribute = [];
    this.text = '';
    this._originalText = '';
    this._offset = 0;
    this._index = 0;
    this._tagBytesMap = new Map();
  }

  get dirty() {
    return this.text !== this._originalText;
  }
  
  storeTagBytes(tagString, bytes) {
    this._tagBytesMap.set(tagString, bytes);
  }
  
  getTagBytes(tagString) {
    return this._tagBytesMap.get(tagString);
  }

  toString() {
    return this.text;
  }
}

class BmgFile {
  constructor() {
    this.bigEndian = false;
    this.bigEndianLabels = false;
    this.encodingType = 'Latin1';
    this.fileId = 0;
    this.defaultColor = 0;
    this.hasMid1 = false;
    this.mid1Format = [];
    this.hasStr1 = false;
    this.str1Data = [];
    this.messages = [];
    
    this._rawData = null;
    this._inf1Data = null;
    this._dat1Data = null;
    this._mid1Data = null;
    this._str1Data = null;
  }
}

// Search for an ASCII section tag in a byte array
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

const ENCODING_MAP = { UTF16: 'utf-16le', UTF8: 'utf-8', ShiftJIS: 'shift_jis' };

function decodeText(buffer, encodingType) {
  try { return new TextDecoder(ENCODING_MAP[encodingType] || 'windows-1252').decode(buffer); }
  catch { return ''; }
}

function encodeText(text, encodingType) {
  try { return new TextEncoder(ENCODING_MAP[encodingType] || 'windows-1252').encode(text); }
  catch { return new TextEncoder().encode(text); }
}

// Parse message text from buffer, extracting inline BMG tags
function parseMessageText(buffer, encodingWidth, tagDecoder, encodingType, bigEndian) {
  const parts = [];
  const tagBytesMap = new Map();
  let textIndex = 0;
  let foundTerminator = false;

  const bufferView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const readCode = encodingWidth === 1
    ? (idx) => buffer[idx]
    : (idx) => (idx + 1 < buffer.length) ? bufferView.getUint16(idx, !bigEndian) : 0;

  for (let j = 0; j < buffer.length; j += encodingWidth) {
    const code = readCode(j);

    if (code === 0x00) {
      if (j > textIndex) parts.push(decodeText(buffer.slice(textIndex, j), encodingType));
      foundTerminator = true;
      break;
    }

    if (code !== 0x1A) continue;
    if (j > textIndex) parts.push(decodeText(buffer.slice(textIndex, j), encodingType));

    const tagDataOffset = j + encodingWidth;
    if (tagDataOffset >= buffer.length) break;

    const tagLength = buffer[tagDataOffset];
    // argLength = total tag length - escape padding (encodingWidth) - fixed header (4 bytes)
    const argLength = Math.max(0, tagLength - encodingWidth - 4);

    if (tagDataOffset + 3 >= buffer.length) break;
    const groupId = buffer[tagDataOffset + 1];
    const typeId = bigEndian
      ? (buffer[tagDataOffset + 2] << 8) | buffer[tagDataOffset + 3]
      : buffer[tagDataOffset + 2] | (buffer[tagDataOffset + 3] << 8);

    const argData = [];
    for (let k = 0; k < argLength && tagDataOffset + 4 + k < buffer.length; k++) {
      argData.push(buffer[tagDataOffset + 4 + k]);
    }

    const tag = new BmgTag(groupId, typeId, argData);
    const tagString = tag.toString();
    tagBytesMap.set(tagString, new Uint8Array(buffer.slice(j, j + encodingWidth + 4 + argLength)));
    parts.push(tagString);

    j += 4 + argLength;
    textIndex = j + encodingWidth;
  }

  if (!foundTerminator && textIndex < buffer.length) {
    parts.push(decodeText(buffer.slice(textIndex), encodingType));
  }

  return { text: parts.join(''), tagBytesMap };
}

function parseDat1Section(buffer, messageInfo, encoding, bigEndian) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const dat1Offset = findSection(bytes, 'DAT1');
  if (dat1Offset === -1) throw new Error('DAT1 section not found');

  const sectionSize = safeGetUint32(view, dat1Offset + 4, buffer.byteLength, !bigEndian);
  const sectionStart = dat1Offset + 8;
  const encodingWidth = encoding === 'UTF16' ? 2 : 1;
  const tagDecoder = encodingWidth === 1
    ? (buf, idx) => buf[idx]
    : bigEndian
      ? (buf, idx) => (buf[idx] << 8) | buf[idx + 1]
      : (buf, idx) => buf[idx] | (buf[idx + 1] << 8);

  const offsets = messageInfo.map((info, index) => ({ offset: info.offset, index }));
  offsets.sort((a, b) => a.offset - b.offset);

  const content = new Array(messageInfo.length);
  for (let i = 0; i < offsets.length; i++) {
    const { offset: msgStart, index } = offsets[i];
    const msgEnd = i + 1 < offsets.length ? offsets[i + 1].offset : sectionSize - 8;
    const bufferStart = sectionStart + msgStart;

    if (bufferStart >= buffer.byteLength) { content[index] = ''; continue; }

    const msgBuf = bytes.slice(bufferStart, Math.min(sectionStart + msgEnd, buffer.byteLength));
    content[index] = parseMessageText(msgBuf, encodingWidth, tagDecoder, encoding, bigEndian);
  }
  return content;
}

function parseInf1Section(buffer, bigEndian) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const inf1Offset = findSection(bytes, 'INF1');
  if (inf1Offset === -1) throw new Error('INF1 section not found');

  const entryCount = safeGetUint16(view, inf1Offset + 8, buffer.byteLength);
  const entrySize = safeGetUint16(view, inf1Offset + 10, buffer.byteLength);
  const fileId = safeGetUint16(view, inf1Offset + 12, buffer.byteLength);
  const defaultColor = bytes[inf1Offset + 14];
  const messageInfo = [];
  const entryStart = inf1Offset + 16;

  for (let i = 0; i < entryCount; i++) {
    const base = entryStart + i * entrySize;
    if (base + entrySize > buffer.byteLength) throw new Error(`INF1 Entry #${i} out of bounds`);
    messageInfo.push({ offset: safeGetUint32(view, base, buffer.byteLength), attribute: bytes.slice(base + 4, base + entrySize) });
  }
  return { messageInfo, fileId, defaultColor };
}

function parseMid1Section(buffer, bigEndian) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const mid1Offset = findSection(bytes, 'MID1');
  if (mid1Offset === -1) return { ids: [], midFormat: [] };

  const entryCount = safeGetUint16(view, mid1Offset + 8, buffer.byteLength);
  const midFormat = bytes.slice(mid1Offset + 10, mid1Offset + 12);
  const ids = [];
  const dataStart = mid1Offset + 16;

  for (let i = 0; i < entryCount; i++) {
    const off = dataStart + i * 4;
    if (off + 4 <= buffer.byteLength) ids.push(safeGetUint32(view, off, buffer.byteLength));
  }
  return { ids, midFormat };
}

function parseStr1Section(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const str1Offset = findSection(bytes, 'STR1');
  if (str1Offset === -1) return { labels: [] };

  const sectionEnd = str1Offset + safeGetUint32(view, str1Offset + 4, buffer.byteLength);
  const labels = [];
  let pos = str1Offset + 9;

  while (pos < sectionEnd && pos < buffer.byteLength) {
    let label = '';
    while (pos < sectionEnd && bytes[pos] !== 0) label += String.fromCharCode(bytes[pos++]);
    labels.push(label);
    pos++;
  }
  return { labels };
}

function parseBmg(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const signature = readAscii(bytes, 0, 8);
  let bigEndian, bigEndianLabels = false;

  if (signature === 'MESGbmg1') bigEndian = false;
  else if (signature === 'GSEM1gmb') { bigEndian = true; bigEndianLabels = true; }
  else throw new Error('Unsupported file header (expected MESGbmg1 or GSEM1gmb magic)');

  let sectionCount = safeGetUint32(view, 12, buffer.byteLength);
  if (sectionCount > 10) { bigEndian = !bigEndian; sectionCount = safeGetUint32(view, 12, buffer.byteLength); }

  const encodingType = { 2: 'UTF16', 3: 'ShiftJIS', 4: 'UTF8' }[bytes[16]] || 'Latin1';

  const bmgFile = new BmgFile();
  bmgFile.bigEndian = bigEndian;
  bmgFile.bigEndianLabels = bigEndianLabels;
  bmgFile.encodingType = encodingType;
  bmgFile._rawData = buffer;

  const { messageInfo, fileId, defaultColor } = parseInf1Section(buffer, bigEndian);
  bmgFile.fileId = fileId;
  bmgFile.defaultColor = defaultColor;

  const content = parseDat1Section(buffer, messageInfo, encodingType, bigEndian);

  const { ids, midFormat } = parseMid1Section(buffer, bigEndian);
  bmgFile.hasMid1 = ids.length > 0;
  bmgFile.mid1Format = midFormat;

  const { labels } = parseStr1Section(buffer);
  bmgFile.hasStr1 = labels.length > 0;

  // Determine if STR1 contains raw data (not usable as labels)
  let hasStr1Data = false;
  if (labels.length > 0) {
    const uniqueLabels = new Set();
    let contentIndex = 0;
    for (let i = labels.length - 1; i >= 0; i--) {
      if (labels[i].length === 0) continue;
      if (contentIndex === 0) contentIndex = i + 1;
      if (contentIndex !== content.length || !uniqueLabels.add(labels[i])) {
        hasStr1Data = true;
        bmgFile.str1Data = labels.slice(0, contentIndex);
        break;
      }
    }
  }

  // Build messages from parsed sections
  for (let i = 0; i < content.length; i++) {
    const message = new BmgMessage();
    message._index = i;
    message._offset = messageInfo[i].offset;
    message.id = i < ids.length ? ids[i] : 0;
    message.label = !hasStr1Data && i < labels.length ? labels[i] : '';
    message.attribute = messageInfo[i].attribute;

    const entry = content[i];
    if (entry && typeof entry === 'object' && entry.text !== undefined) {
      message.text = entry.text;
      message._originalText = entry.text;
      message._tagBytesMap = entry.tagBytesMap;
    } else {
      message.text = entry || '';
      message._originalText = message.text;
    }
    bmgFile.messages.push(message);
  }
  return bmgFile;
}

export { BmgTag, BmgMessage, BmgFile, parseBmg };
