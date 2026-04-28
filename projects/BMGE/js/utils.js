function safeGetUint16(view, offset, limit, le = true) {
  if (offset + 2 > limit) {
    throw new Error(`Read beyond buffer at offset 0x${offset.toString(16)}`);
  }
  return view.getUint16(offset, le);
}

function safeGetUint32(view, offset, limit, le = true) {
  if (offset + 4 > limit) {
    throw new Error(`Read beyond buffer at offset 0x${offset.toString(16)}`);
  }
  return view.getUint32(offset, le);
}

function readAscii(bytes, start, length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
}

/** Search for an ASCII section tag in a byte array */
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

export { safeGetUint16, safeGetUint32, readAscii, findSection };
