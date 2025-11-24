import { safeGetUint16, safeGetUint32 } from './utils.js';
import { BmgTag } from './bmg-format.js';

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
 * Encode a single BMG token to binary bytes
 * 
 * Token format: [GG:T:ARGS] or [GG:TTTT:ARGS] where:
 * - GG is groupId (hex, 2 digits = 1 byte)
 * - T or TTTT is typeId (hex, 1-4 digits = 2 bytes, little-endian)
 * - ARGS is optional hex string (variable length bytes)
 * 
 * Examples:
 * - [FF:0:20] -> groupId=0xFF, typeId=0x0000, args=[0x20]
 * - [FF:0:80] -> groupId=0xFF, typeId=0x0000, args=[0x80]
 * - [00:0A] -> groupId=0x00, typeId=0x000A, args=[]
 * 
 * Binary structure in UTF-16LE:
 * - Escape sequence: 0x1A 0x00 (UTF-16LE encoded \x1A)
 * - Length byte: total length of tag data (groupId + typeId + args) = 3 + args.length
 * - GroupId: 1 byte
 * - TypeId: 2 bytes (little-endian)
 * - Args: N bytes (raw hex data)
 * 
 * @param {string} tokenString - Token in format [GG:T:ARGS] or [GG:TTTT:ARGS]
 * @param {string} [encodingType='UTF16'] - Encoding type to determine escape width ('UTF16' => 0x1A 0x00, others => 0x1A)
 * @returns {Uint8Array} Binary representation of the token
 */
function encodeToken(tokenString, encodingType = 'UTF16') {
    // Use BmgTag.fromString to accept all supported token formats (legacy and new).
    // This centralizes parsing logic and ensures encode is the proper inverse of parse.
    const tag = BmgTag.fromString(tokenString);
    if (!tag) {
        throw new Error(`Invalid token format: ${tokenString}`);
    }

    // Argument bytes already in tag.argumentData (array of numbers)
    const argData = Array.isArray(tag.argumentData) ? tag.argumentData.slice() : [];

    // Calculate tag length: groupId (1) + typeId (2) + args
    const tagLength = 3 + argData.length;

    const tokenBytes = [];

    // Escape sequence depends on encoding width
    if (encodingType === 'UTF16') {
      // UTF-16LE: escape is 0x001A => bytes 0x1A, 0x00
      tokenBytes.push(0x1A, 0x00);
    } else {
      tokenBytes.push(0x1A);
    }

    // Length byte
    tokenBytes.push(tagLength);

    // Group ID
    tokenBytes.push(tag.groupId & 0xFF);

    // Type ID little-endian
    tokenBytes.push(tag.typeId & 0xFF);
    tokenBytes.push((tag.typeId >> 8) & 0xFF);

    // Arguments
    tokenBytes.push(...argData);

    return new Uint8Array(tokenBytes);
}

/**
 * Encode text based on encoding type
 */
function encodeText(text, encodingType) {
  if (encodingType === 'UTF16') {
    // Manual UTF-16LE encoding
    const codes = [];
    for (let i = 0; i < text.length; i++) {
      const codePoint = text.codePointAt(i);
      if (codePoint === undefined) break;
      
      if (codePoint > 0xFFFF) {
        // Surrogate pair for characters beyond BMP
        const adjusted = codePoint - 0x10000;
        const high = 0xD800 + (adjusted >> 10);
        const low = 0xDC00 + (adjusted & 0x3FF);
        codes.push(high & 0xFF, high >> 8);
        codes.push(low & 0xFF, low >> 8);
        i++; // Skip next char (it's part of surrogate pair)
      } else {
        // Regular character - little-endian
        codes.push(codePoint & 0xFF, codePoint >> 8);
      }
    }
    return new Uint8Array(codes);
  }
  
  // UTF-8, ShiftJIS, or Latin1
  const encoder = new TextEncoder(
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
 * Encode message text with tags back to binary
 * 
 * Handles:
 * - Regular text (encoded based on encodingType)
 * - BMG tokens in format [GG:TTTT:ARGS] or [GG:T:ARGS]
 * - NOTE: when available, the original raw token bytes from the parsed file
 *   (provided in `tagBytesMap`) will be reused verbatim. This preserves the
 *   exact escape sequence, grouping and padding used in the original file and
 *   avoids corruption caused by re-encoding tokens differently. If the original
 *   bytes are not available, the token is reconstructed from its textual form
 *   via `encodeToken`.
 * 
 * @param {string} text - Message text with embedded tokens
 * @param {string} encodingType - Encoding type ('UTF16', 'UTF8', 'ShiftJIS', 'Latin1')
 * @param {Map<string, Uint8Array>} tagBytesMap - (unused) Map of token strings to original bytes
 * @param {boolean} debugMode - Enable debug logging
 * @returns {Uint8Array} Binary representation of the message (without null terminator)
 */
function encodeMessageText(text, encodingType, tagBytesMap = null, debugMode = false) {
    // Match tokens in format [GG:TTTT:ARGS] or [GG:TTTT] or [GG:T:ARGS] or [GG:T]
    const tokenRegex = /\[([0-9A-F]{1,2}):([0-9A-F]{1,4})(?::([0-9A-F]+))?\]/gi;
    
    const parts = [];
    let lastIndex = 0;
    let match;

    if (debugMode) {
        console.log('  encodeMessageText - input text:', text.slice(0, 100));
        console.log('  encodeMessageText - encoding:', encodingType);
        console.log('  encodeMessageText - tagBytesMap present:', !!tagBytesMap);
    }

    // Find all tokens in the text
    while ((match = tokenRegex.exec(text)) !== null) {
        // Add text before this token
      if (match.index > lastIndex) {
        const textPart = text.substring(lastIndex, match.index);
        parts.push({ type: 'text', value: textPart });
        if (debugMode) {
            console.log('  Text part:', textPart.slice(0, 30));
        }
      }

    // Add the token. Prefer reusing the original raw bytes when present in
    // `tagBytesMap` (bit-perfect rebuild). Fall back to reconstructing via
    // `encodeToken` when original bytes are not available.
    const tokenString = match[0];
    if (debugMode) {
      console.log('  Token found:', tokenString);
    }

    let tokenBytes = null;
    if (tagBytesMap && tagBytesMap instanceof Map) {
      const orig = tagBytesMap.get(tokenString);
      if (orig && orig.length > 0) {
        // Use a copy of the original bytes to avoid accidental mutation
        tokenBytes = new Uint8Array(orig);
        if (debugMode) {
          console.log('  Reusing original token bytes:', Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
      }
    }

    if (!tokenBytes) {
      // No original bytes available — reconstruct deterministically
      if (debugMode) {
        console.log('  Reconstructing token bytes (fallback)');
      }
      try {
        tokenBytes = encodeToken(tokenString, encodingType);
        if (debugMode) {
          console.log('  Encoded token (reconstructed):', Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join(' '));
        }
      } catch (error) {
        console.warn(`Failed to encode token ${tokenString}:`, error);
        // If token encoding fails, treat it as text
        parts.push({ type: 'text', value: tokenString });
        tokenBytes = null;
      }
    }

    if (tokenBytes) parts.push({ type: 'token', value: tokenBytes });
        
        lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last token
    if (lastIndex < text.length) {
        parts.push({ type: 'text', value: text.substring(lastIndex) });
        if (debugMode) {
            console.log('  Final text part:', text.substring(lastIndex).slice(0, 30));
        }
    }

    // Calculate total size
    let totalSize = 0;
    const encodingWidth = encodingType === 'UTF16' ? 2 : 1;
    
    if (debugMode) {
        console.log('  Parts count:', parts.length);
    }
    
    for (const part of parts) {
        if (part.type === 'text') {
            // Size depends on encoding
            const encoded = encodeText(part.value, encodingType);
            part.encodedValue = encoded; // Cache for later use
            totalSize += encoded.length;
            if (debugMode) {
                console.log('  Text encoded to', encoded.length, 'bytes');
            }
        } else {
            totalSize += part.value.length; // Tokens have their own size
            if (debugMode) {
                console.log('  Token is', part.value.length, 'bytes');
            }
        }
    }

    if (debugMode) {
        console.log('  Total encoded size:', totalSize);
    }

    // Build the output buffer
    const result = new Uint8Array(totalSize);
    let offset = 0;

    for (const part of parts) {
        if (part.type === 'text') {
            // Use cached encoded value
            const encoded = part.encodedValue;
            result.set(encoded, offset);
            offset += encoded.length;
        } else {
            // Copy token bytes directly
            result.set(part.value, offset);
            offset += part.value.length;
        }
    }

    return result;
}

/**
 * Build BMG file from BmgFile object
 * Recalculates all offsets based on actual encoded message sizes
 */
function buildBmg(bmgFile, debugMode = false) {
    const rawBuffer = bmgFile._rawData;
    const bytes = new Uint8Array(rawBuffer);
    const view = new DataView(rawBuffer);
    
    const inf1Offset = findSection(bytes, 'INF1');
    const dat1Offset = findSection(bytes, 'DAT1');
    
    if (inf1Offset === -1 || dat1Offset === -1) {
        throw new Error('Required sections not found');
    }
    
    if (debugMode) {
        console.log('=== BUILD BMG DEBUG ===');
        console.log('Encoding:', bmgFile.encodingType);
        console.log('BigEndian:', bmgFile.bigEndian);
        console.log('Total messages:', bmgFile.messages.length);
    }
    
    // Read INF1 header information
  const inf1Size = safeGetUint32(view, inf1Offset + 4, rawBuffer.byteLength, !bmgFile.bigEndian);
  const entryCount = safeGetUint16(view, inf1Offset + 8, rawBuffer.byteLength);
  const entrySize = safeGetUint16(view, inf1Offset + 10, rawBuffer.byteLength);
    
    // Read DAT1 size
  const dat1Size = safeGetUint32(view, dat1Offset + 4, rawBuffer.byteLength, !bmgFile.bigEndian);
  const dat1DataStart = dat1Offset + 8;
    
    const inf1HeaderSize = 16;

  // Capture original offsets and message chunks for reuse when message is untouched
  // Group messages by their original DAT offsets to preserve shared strings
  const offsetGroups = new Map();
  const offsetSet = new Set([0]); // Preserve raw bytes before first message if present
  for (let i = 0; i < bmgFile.messages.length; i++) {
    const msg = bmgFile.messages[i];
    const offset = Number(msg._offset) || 0;
    if (!offsetGroups.has(offset)) {
      offsetGroups.set(offset, []);
    }
    offsetGroups.get(offset).push(i);
    offsetSet.add(offset);
  }

  // Prepare original chunk data per unique offset (sorted ascending)
  const uniqueOffsets = Array.from(offsetSet)
    .filter((off) => off >= 0)
    .sort((a, b) => a - b);

  const originalChunkMap = new Map();
  let nextOffsetBoundary = Math.max(0, dat1Size - 8);
  for (let i = uniqueOffsets.length - 1; i >= 0; i--) {
    const offset = uniqueOffsets[i];
    const start = dat1DataStart + offset;
    const end = dat1DataStart + nextOffsetBoundary;
    if (start >= bytes.length || start >= end) {
      originalChunkMap.set(offset, new Uint8Array(0));
    } else {
      const safeEnd = Math.min(end, bytes.length);
      originalChunkMap.set(offset, bytes.slice(start, safeEnd));
    }
    nextOffsetBoundary = offset;
  }

  // Build chunks to emit, keeping shared data single and encoding dirty ones separately
  const chunkEntries = [];
  const messageChunkMap = new Array(bmgFile.messages.length);
  const encodingWidth = bmgFile.encodingType === 'UTF16' ? 2 : 1;
  let newDat1DataSize = 0;

  for (const offset of uniqueOffsets) {
    const indices = offsetGroups.get(offset) || [];
    const originalChunk = originalChunkMap.get(offset);

    if (indices.length === 0) {
      if (originalChunk && originalChunk.length > 0) {
        const entry = { data: originalChunk, messageIndices: [] };
        chunkEntries.push(entry);
        newDat1DataSize += originalChunk.length;
      }
      continue;
    }

    const cleanIndices = indices.filter((idx) => !bmgFile.messages[idx].dirty);
    const dirtyIndices = indices.filter((idx) => bmgFile.messages[idx].dirty);

    if (cleanIndices.length > 0 && originalChunk) {
      const entry = { data: originalChunk, messageIndices: cleanIndices.slice() };
      chunkEntries.push(entry);
      cleanIndices.forEach((idx) => {
        messageChunkMap[idx] = entry;
      });
      newDat1DataSize += originalChunk.length;
    }

    const toEncode = originalChunk ? dirtyIndices : indices;
    for (const idx of toEncode) {
      const msg = bmgFile.messages[idx];
      
      if (debugMode && (msg.id === 1302300 || idx === 366)) {
        console.log(`\n=== Encoding message ${idx} (ID: ${msg.id}) ===`);
        console.log('Text:', msg.text.slice(0, 100));
        console.log('Dirty:', msg.dirty);
        console.log('_tagBytesMap size:', msg._tagBytesMap?.size || 0);
        if (msg._tagBytesMap) {
          for (const [key, val] of msg._tagBytesMap.entries()) {
            console.log('  Tag:', key, '-> bytes:', Array.from(val).map(b => b.toString(16).padStart(2, '0')).join(' '));
          }
        }
      }
      
      const encoded = encodeMessageText(msg.text, bmgFile.encodingType, msg._tagBytesMap, debugMode && (msg.id === 1302300 || idx === 366));
      
      if (debugMode && (msg.id === 1302300 || idx === 366)) {
        console.log('Encoded length:', encoded.length);
        console.log('Encoded bytes (first 96):', Array.from(encoded.slice(0, 96)).map(b => b.toString(16).padStart(2, '0')).join(' '));
      }
      
      const messageSize = encoded.length + encodingWidth;
      const padding = (4 - (messageSize % 4)) % 4;
      const chunk = new Uint8Array(messageSize + padding);
      chunk.set(encoded, 0);
      const entry = { data: chunk, messageIndices: [idx] };
      chunkEntries.push(entry);
      messageChunkMap[idx] = entry;
      newDat1DataSize += chunk.length;
    }
  }

  // Assign new offsets to each chunk
  let runningOffset = 0;
  for (const entry of chunkEntries) {
    entry.newOffset = runningOffset;
    runningOffset += entry.data.length;
  }
    
    // Build new INF1 section
  const newInf1Size = inf1Size;
  const newInf1 = new Uint8Array(newInf1Size);
  const newInf1View = new DataView(newInf1.buffer);
    
    // Copy INF1 header
    newInf1.set(bytes.slice(inf1Offset, inf1Offset + inf1HeaderSize));
    // Update INF1 size
  newInf1View.setUint32(4, newInf1Size, !bmgFile.bigEndian);
    
    // Write entries with new offsets
  const messageOffsets = messageChunkMap.map((entry) => (entry ? entry.newOffset : 0));

  for (let i = 0; i < entryCount; i++) {
        const entryOffsetInNew = inf1HeaderSize + (i * entrySize);
        const entryOffsetInOld = inf1Offset + inf1HeaderSize + (i * entrySize);
        
        // Write new offset
    const newOffset = messageOffsets[i] ?? 0;
    newInf1View.setUint32(entryOffsetInNew, newOffset, !bmgFile.bigEndian);
        
        // Copy attribute bytes
    newInf1.set(bytes.slice(entryOffsetInOld + 4, entryOffsetInOld + entrySize), entryOffsetInNew + 4);
    }
    
    // Build new DAT1 section
    const newDat1Size = 8 + newDat1DataSize;
    const newDat1 = new Uint8Array(newDat1Size);
    const newDat1View = new DataView(newDat1.buffer);
    
    // DAT1 header
    newDat1[0] = 0x44; // 'D'
    newDat1[1] = 0x41; // 'A'
    newDat1[2] = 0x54; // 'T'
    newDat1[3] = 0x31; // '1'
    newDat1View.setUint32(4, newDat1Size, !bmgFile.bigEndian);
    
    // Write message data
  let writeOffset = 8;
  for (const entry of chunkEntries) {
    newDat1.set(entry.data, writeOffset);
    writeOffset += entry.data.length;
    }
    
    // Preserve gap between INF1 and DAT1
    const gapStart = inf1Offset + inf1Size;
    const gapEnd = dat1Offset;
    const gapSize = gapEnd - gapStart;
    const gapData = gapSize > 0 ? bytes.slice(gapStart, gapEnd) : new Uint8Array(0);
    
    // Preserve tail after DAT1
    const tailStart = dat1Offset + dat1Size;
    const tailData = tailStart < bytes.length ? bytes.slice(tailStart) : new Uint8Array(0);
    
    // Assemble final file
    const finalSize = inf1Offset + newInf1Size + gapSize + newDat1Size + tailData.length;
    const result = new Uint8Array(finalSize);
    const resultView = new DataView(result.buffer);
    
    let cursor = 0;
    
    // 1. Copy header and everything before INF1
    result.set(bytes.slice(0, inf1Offset), cursor);
    cursor += inf1Offset;
    
    // 2. Write new INF1
    result.set(newInf1, cursor);
    cursor += newInf1Size;
    
    // 3. Write gap
    if (gapSize > 0) {
        result.set(gapData, cursor);
        cursor += gapSize;
    }
    
    // 4. Write new DAT1
    result.set(newDat1, cursor);
    cursor += newDat1Size;
    
    // 5. Write tail
    if (tailData.length > 0) {
        result.set(tailData, cursor);
    }
    
    // Update file size in header
    resultView.setUint32(8, finalSize, !bmgFile.bigEndian);
    
    return result.buffer;
}

export { buildBmg, encodeMessageText, encodeToken };
