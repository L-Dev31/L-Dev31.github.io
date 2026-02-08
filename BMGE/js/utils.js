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

function readAscii(bytes, start, length) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
}

export { safeGetUint16, safeGetUint32, readAscii };
