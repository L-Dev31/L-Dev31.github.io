import { state } from './state.js';
import { safeGetUint16, safeGetUint32, readAscii } from './utils.js';

/**
 * BMG File Parser - Following AeonSake.NintendoTools architecture
 * Parses BMG (MESGbmg1) binary message files used in Nintendo games
 */

/**
 * Represents a BMG tag embedded in message text
 * Matches: AeonSake.NintendoTools.FileFormats.Bmg.BmgTag
 */
class BmgTag {
  constructor(groupId, typeId, argumentData = []) {
    this.groupId = groupId;    // byte
    this.typeId = typeId;      // ushort
    this.argumentData = argumentData; // byte[]
    this._originalBytes = null; // Store original bytes for bit-perfect rebuild
  }

  toString() {
    // Format court, compact, tout en hex, sans espace, pour tous les tags
    const groupHex = this.groupId.toString(16).toUpperCase();
    const typeHex = this.typeId.toString(16).toUpperCase();
    let result = `[${groupHex}:${typeHex}`;
    if (this.argumentData && this.argumentData.length > 0) {
      const hex = this.argumentData.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      result += `${hex ? ':' + hex : ''}`;
    }
    result += ']';
    return result;
  }

  /**
   * Parse tag from string format back to BmgTag object
   * Supports formats: [GG:TT:ARGS], [GG:TT], old format with @ [@GG:TT:ARGS], {{@GG:TT:ARGS}}, {{@255:0 0200}}
   */
  static fromString(str) {
    // Try new format without @: [FF:0:200]
    let match = /\[([0-9A-F]+):([0-9A-F]+)(?::([0-9A-F]+))?\]/i.exec(str);
    
    if (!match) {
      // Try old format with @: [@FF:0:200]
      match = /\[@([0-9A-F]+):([0-9A-F]+)(?::([0-9A-F]+))?\]/i.exec(str);
    }
    
    if (!match) {
      // Try old compact hex format: {{@FF:00:0200}}
      match = /\{\{@([0-9A-F]{1,2}):([0-9A-F]{1,4})(?::([0-9A-F]+))?\}\}/i.exec(str);
    }
    
    if (!match) {
      // Try old format with decimal and spaces: {{@255:0 0200}} or {{255:0 0200}}
      match = /\{\{@?(\d+):(\d+)(?:\s+([a-fA-F0-9]+))?\}\}/.exec(str);
      
      if (!match) {
        // Try legacy format: {{groupId:typeId arg="hex"}}
        match = /\{\{@?(\d+):(\d+)(?:\s+arg="((?:0x)?[a-fA-F0-9]*)")?\}\}/.exec(str);
      }
      
      if (!match) return null;
      
      // Parse decimal format
      const groupId = parseInt(match[1], 10);
      const typeId = parseInt(match[2], 10);
      const argHex = match[3] || '';
      const argData = [];
      
      if (argHex) {
        const cleaned = argHex.replace(/^0x/i, '');
        for (let i = 0; i < cleaned.length; i += 2) {
          const byteStr = cleaned.substring(i, i + 2);
          if (byteStr.length === 2) {
            argData.push(parseInt(byteStr, 16));
          }
        }
      }
      
      return new BmgTag(groupId, typeId, argData);
    }
    
    // Parse hex format
    const groupId = parseInt(match[1], 16);
    const typeId = parseInt(match[2], 16);
    const argHex = match[3] || '';
    const argData = [];
    
    if (argHex) {
      for (let i = 0; i < argHex.length; i += 2) {
        const byteStr = argHex.substring(i, i + 2);
        if (byteStr.length === 2) {
          argData.push(parseInt(byteStr, 16));
        }
      }
    }
    
    return new BmgTag(groupId, typeId, argData);
  }
  
  /**
   * Get the original binary representation of this tag
   * Returns the exact bytes from the original BMG file
   */
  toBytes() {
    if (this._originalBytes) {
      return this._originalBytes;
    }
    
    // Fallback: construct bytes manually (should match original)
    const length = 4 + this.argumentData.length; // groupId + typeId(2) + args
    const bytes = new Uint8Array(length + 2);
    
    bytes[0] = 0x1A;
    bytes[1] = length;
    bytes[2] = this.groupId;
    bytes[3] = this.typeId & 0xFF;
    bytes[4] = (this.typeId >> 8) & 0xFF;
    
    for (let i = 0; i < this.argumentData.length; i++) {
      bytes[5 + i] = this.argumentData[i];
    }
    
    return bytes;
  }
}

/**
 * Represents a single BMG message
 * Matches: AeonSake.NintendoTools.FileFormats.Bmg.BmgMessage
 */
class BmgMessage {
  constructor() {
    this.id = 0;              // uint - from MID1 section
    this.label = '';          // string - from STR1 section
    this.attribute = [];      // byte[] - from INF1 section
    this.text = '';           // string - message content with tags formatted
    this._originalText = '';  // Store original for dirty tracking
    this._offset = 0;         // DAT1 offset
    this._index = 0;          // Position in entries array
    this._tagBytesMap = new Map(); // Map<tagString, Uint8Array> - Store original bytes for each tag
  }

  get dirty() {
    return this.text !== this._originalText;
  }
  
  /**
   * Store original bytes for a tag string
   */
  storeTagBytes(tagString, bytes) {
    this._tagBytesMap.set(tagString, bytes);
  }
  
  /**
   * Get original bytes for a tag string
   */
  getTagBytes(tagString) {
    return this._tagBytesMap.get(tagString);
  }

  toString() {
    return this.text;
  }
}

/**
 * Represents a BMG file structure
 * Matches: AeonSake.NintendoTools.FileFormats.Bmg.BmgFile
 */
class BmgFile {
  constructor() {
    this.bigEndian = false;
    this.bigEndianLabels = false;
    this.encodingType = 'Latin1'; // 'Latin1', 'UTF16', 'ShiftJIS', 'UTF8'
    this.fileId = 0;
    this.defaultColor = 0;
    this.hasMid1 = false;
    this.mid1Format = [];
    this.hasStr1 = false;
    this.str1Data = [];
    this.messages = []; // BmgMessage[]
    
    // Raw section data for rebuilding
    this._rawData = null;
    this._inf1Data = null;
    this._dat1Data = null;
    this._mid1Data = null;
    this._str1Data = null;
  }
}

/**
 * Find section offset by magic tag (INF1, DAT1, MID1, STR1)
 */
function findSection(bytes, tag) {
  const pattern = new Uint8Array(tag.length);
  for (let i = 0; i < tag.length; i++) {
    pattern[i] = tag.charCodeAt(i);
  }
  for (let i = 0; i <= bytes.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (bytes[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i;
    }
  }
  return -1; // Not found
}

/**
 * Decode text based on encoding type
 */
function decodeText(buffer, encodingType) {
  const decoder = new TextDecoder(
    encodingType === 'UTF16' ? 'utf-16le' :
    encodingType === 'UTF8' ? 'utf-8' :
    encodingType === 'ShiftJIS' ? 'shift_jis' :
    'windows-1252' // Latin1
  );
  
  try {
    return decoder.decode(buffer);
  } catch (e) {
    console.warn('Decode error:', e);
    return '';
  }
}

/**
 * Encode text based on encoding type
 */
function encodeText(text, encodingType) {
  const encoder = new TextEncoder(
    encodingType === 'UTF16' ? 'utf-16le' :
    encodingType === 'UTF8' ? 'utf-8' :
    encodingType === 'ShiftJIS' ? 'shift_jis' :
    'windows-1252' // Latin1
  );
  
  try {
    return encoder.encode(text);
  } catch (e) {
    console.warn('Encode error:', e);
    // Fallback to UTF-8
    return new TextEncoder().encode(text);
  }
}

/**
 * Parse individual message text from buffer, extracting tags
 * Returns {text: string, tagBytesMap: Map<tagString, Uint8Array>}
 */
function parseMessageText(buffer, encodingWidth, tagDecoder, encodingType, bigEndian) {
  const parts = [];
  const tagBytesMap = new Map();
  let textIndex = 0;
  let foundTerminator = false;
  
  // Create a proper decoder for this buffer
  const bufferView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const readCode = encodingWidth === 1
    ? (idx) => buffer[idx]
    : (idx) => (idx + 1 < buffer.length)
        ? bufferView.getUint16(idx, !bigEndian)
        : 0;
  
  for (let j = 0; j < buffer.length; j += encodingWidth) {
    const code = readCode(j);
    
    // Null terminator
    if (code === 0x00) {
      if (j > textIndex) {
        parts.push(decodeText(buffer.slice(textIndex, j), encodingType));
      }
      foundTerminator = true;
      break;
    }
    
    // BMG tag escape sequence (0x1A)
    if (code !== 0x1A) continue;
    
    // Append text before tag
    if (j > textIndex) {
      parts.push(decodeText(buffer.slice(textIndex, j), encodingType));
    }
    
    // Parse tag structure
    const tagDataOffset = j + encodingWidth;
    if (tagDataOffset >= buffer.length) break;
    
  const tagLength = buffer[tagDataOffset];
  // Length byte covers: group (1) + type (2) + argument bytes + escape padding (encodingWidth)
  // Control sequences store the escape (0x1A) using the current encoding width, so we subtract
  // the per-character width in addition to the fixed 4 byte header to get the argument length.
  const overhead = encodingWidth + 4;
  const argLength = Math.max(0, tagLength - overhead);
    
    if (tagDataOffset + 1 >= buffer.length) break;
    const groupId = buffer[tagDataOffset + 1];
    
    if (tagDataOffset + 3 >= buffer.length) break;
    const typeId = bigEndian
      ? (buffer[tagDataOffset + 2] << 8) | buffer[tagDataOffset + 3]
      : buffer[tagDataOffset + 2] | (buffer[tagDataOffset + 3] << 8);
    
    const argData = [];
    for (let k = 0; k < argLength && tagDataOffset + 4 + k < buffer.length; k++) {
      argData.push(buffer[tagDataOffset + 4 + k]);
    }
    
    const tag = new BmgTag(groupId, typeId, argData);
    const tagString = tag.toString();
    
    // Store original bytes for bit-perfect rebuild
    // Tag structure: escape(encodingWidth) + length(1) + group(1) + type(2) + args(argLength)
    const tagEndOffset = j + encodingWidth + 1 + 1 + 2 + argLength;
    const originalBytes = new Uint8Array(buffer.slice(j, tagEndOffset));
    tagBytesMap.set(tagString, originalBytes);
    
    parts.push(tagString);
    
  j += 4 + argLength;
    textIndex = j + encodingWidth;
  }
  
  // Append remaining text only if no null terminator was found in the loop
  if (!foundTerminator && textIndex < buffer.length) {
    parts.push(decodeText(buffer.slice(textIndex), encodingType));
  }
  
  return { text: parts.join(''), tagBytesMap };
}

/**
 * Parse DAT1 section and extract message text with tags
 * Matches: BmgFileReader.ParseDat1
 */
function parseDat1Section(buffer, messageInfo, encoding, bigEndian) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  
  const dat1Offset = findSection(bytes, 'DAT1');
  if (dat1Offset === -1) {
    throw new Error('DAT1 section not found');
  }
  
  const sectionSize = safeGetUint32(view, dat1Offset + 4, buffer.byteLength, !bigEndian);
  const sectionStart = dat1Offset + 8;
  
  const encodingWidth = encoding === 'UTF16' ? 2 : 1;
  const tagDecoder = encodingWidth === 1 
    ? (buf, idx) => buf[idx]
    : bigEndian
      ? (buf, idx) => (buf[idx] << 8) | buf[idx + 1]
      : (buf, idx) => buf[idx] | (buf[idx + 1] << 8);
  
  // Sort message offsets (some games don't sort them)
  const offsets = messageInfo.map((info, index) => ({
    offset: info.offset,
    index: index,
    attribute: info.attribute
  }));
  offsets.sort((a, b) => a.offset - b.offset);
  
  const content = new Array(messageInfo.length);
  
  for (let i = 0; i < offsets.length; i++) {
    const { offset: messageStart, index } = offsets[i];
    const messageEnd = i + 1 < offsets.length 
      ? offsets[i + 1].offset 
      : sectionSize - 8;
    
    const bufferStart = sectionStart + messageStart;
    const bufferEnd = sectionStart + messageEnd;
    
    if (bufferStart >= buffer.byteLength) {
      content[index] = '';
      continue;
    }
    
    const messageBuffer = bytes.slice(bufferStart, Math.min(bufferEnd, buffer.byteLength));
    const result = parseMessageText(messageBuffer, encodingWidth, tagDecoder, encoding, bigEndian);
    
    content[index] = result;
  }
  
  return content;
}

/**
 * Parse INF1 section - message metadata
 * Matches: BmgFileReader.ParseInf1
 */
function parseInf1Section(buffer, bigEndian) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  
  const inf1Offset = findSection(bytes, 'INF1');
  if (inf1Offset === -1) {
    throw new Error('INF1 section not found');
  }
  
  const entryCount = safeGetUint16(view, inf1Offset + 8, buffer.byteLength);
  const entrySize = safeGetUint16(view, inf1Offset + 10, buffer.byteLength);
  const fileId = safeGetUint16(view, inf1Offset + 12, buffer.byteLength);
  const defaultColor = bytes[inf1Offset + 14];
  
  const messageInfo = [];
  const entryStart = inf1Offset + 16;
  
  for (let i = 0; i < entryCount; i++) {
    const base = entryStart + i * entrySize;
    if (base + entrySize > buffer.byteLength) {
      throw new Error(`INF1 Entry #${i} read out of bounds`);
    }
    
    const offset = safeGetUint32(view, base, buffer.byteLength);
    const attribute = bytes.slice(base + 4, base + entrySize);
    
    messageInfo.push({ offset, attribute });
  }
  
  return { messageInfo, fileId, defaultColor };
}

/**
 * Parse MID1 section - message IDs
 * Matches: BmgFileReader.ParseMid1
 */
function parseMid1Section(buffer, bigEndian) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  
  const mid1Offset = findSection(bytes, 'MID1');
  if (mid1Offset === -1) {
    return { ids: [], midFormat: [] };
  }
  
  const entryCount = safeGetUint16(view, mid1Offset + 8, buffer.byteLength);
  const midFormat = bytes.slice(mid1Offset + 10, mid1Offset + 12);
  // Skip 4 reserved bytes
  
  const ids = [];
  const dataStart = mid1Offset + 16;
  
  for (let i = 0; i < entryCount; i++) {
    const offset = dataStart + i * 4;
    if (offset + 4 <= buffer.byteLength) {
      ids.push(safeGetUint32(view, offset, buffer.byteLength));
    }
  }
  
  return { ids, midFormat };
}

/**
 * Parse STR1 section - message labels
 * Matches: BmgFileReader.ParseStr1
 */
function parseStr1Section(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  
  const str1Offset = findSection(bytes, 'STR1');
  if (str1Offset === -1) {
    return { labels: [] };
  }
  
  const sectionSize = safeGetUint32(view, str1Offset + 4, buffer.byteLength);
  const sectionEnd = str1Offset + sectionSize;
  const dataStart = str1Offset + 9; // Skip magic(4) + size(4) + padding(1)
  
  const labels = [];
  let pos = dataStart;
  
  while (pos < sectionEnd && pos < buffer.byteLength) {
    // Read null-terminated ASCII string
    let label = '';
    while (pos < sectionEnd && bytes[pos] !== 0) {
      label += String.fromCharCode(bytes[pos]);
      pos++;
    }
    labels.push(label);
    pos++; // Skip null terminator
  }
  
  return { labels };
}

/**
 * Main BMG parser - Creates BmgFile from ArrayBuffer
 * Matches: BmgFileReader.Read
 */
function parseBmg(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  
  // Check signature and detect endianness
  const signature = readAscii(bytes, 0, 8);
  let bigEndian = false;
  let bigEndianLabels = false;
  
  if (signature === 'MESGbmg1') {
    bigEndian = false;
  } else if (signature === 'GSEM1gmb') {
    bigEndian = true;
    bigEndianLabels = true;
  } else {
    throw new Error('Unsupported file header (expected MESGbmg1 or GSEM1gmb magic)');
  }
  
  // Parse file metadata
  const fileSize = safeGetUint32(view, 8, buffer.byteLength);
  let sectionCount = safeGetUint32(view, 12, buffer.byteLength);
  
  // Sanity check - if section count is unreasonable, try other endian
  if (sectionCount > 10) {
    bigEndian = !bigEndian;
    sectionCount = safeGetUint32(view, 12, buffer.byteLength);
  }
  
  const encodingByte = bytes[16];
  const encodingType = 
    encodingByte === 2 ? 'UTF16' :
    encodingByte === 3 ? 'ShiftJIS' :
    encodingByte === 4 ? 'UTF8' :
    'Latin1';
  
  const bmgFile = new BmgFile();
  bmgFile.bigEndian = bigEndian;
  bmgFile.bigEndianLabels = bigEndianLabels;
  bmgFile.encodingType = encodingType;
  bmgFile._rawData = buffer;
  
  // Parse INF1 section
  const { messageInfo, fileId, defaultColor } = parseInf1Section(buffer, bigEndian);
  bmgFile.fileId = fileId;
  bmgFile.defaultColor = defaultColor;
  
  // Parse DAT1 section
  const content = parseDat1Section(buffer, messageInfo, encodingType, bigEndian);
  
  // Parse MID1 section (optional)
  const { ids, midFormat } = parseMid1Section(buffer, bigEndian);
  bmgFile.hasMid1 = ids.length > 0;
  bmgFile.mid1Format = midFormat;
  
  // Parse STR1 section (optional)
  const { labels } = parseStr1Section(buffer);
  bmgFile.hasStr1 = labels.length > 0;
  
  // Verify STR1 data
  let hasStr1Data = false;
  if (labels.length > 0) {
    const uniqueLabels = new Set();
    let contentIndex = 0;
    
    for (let i = labels.length - 1; i >= 0; i--) {
      if (labels[i].length === 0) continue;
      if (contentIndex === 0) contentIndex = i + 1;
      
      // Check if STR1 data can be used as labels
      if (contentIndex !== content.length || !uniqueLabels.add(labels[i])) {
        hasStr1Data = true;
        bmgFile.str1Data = labels.slice(0, contentIndex);
        break;
      }
    }
  }
  
  // Compile messages
  for (let i = 0; i < content.length; i++) {
    const message = new BmgMessage();
    message._index = i;
    message._offset = messageInfo[i].offset;
    message.id = i < ids.length ? ids[i] : 0;
    message.label = !hasStr1Data && i < labels.length ? labels[i] : '';
    message.attribute = messageInfo[i].attribute;
    
    // Handle new format: content[i] is {text: string, tagBytesMap: Map}
    if (typeof content[i] === 'object' && content[i].text !== undefined) {
      message.text = content[i].text;
      message._originalText = content[i].text;
      message._tagBytesMap = content[i].tagBytesMap;
    } else {
      // Legacy format: content[i] is just a string
      message.text = content[i];
      message._originalText = content[i];
    }
    
    bmgFile.messages.push(message);
  }
  
  return bmgFile;
}

export { BmgTag, BmgMessage, BmgFile, parseBmg };
