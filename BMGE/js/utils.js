import { state } from './state.js';

function formatHex(value, width = 2) {
  if (typeof value !== 'number' || isNaN(value)) {
    return '00'.repeat(width / 2);
  }
  return value.toString(16).toUpperCase().padStart(width, '0');
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

export { 
  formatHex, 
  formatBytes, 
  safeGetUint16, 
  safeGetUint32, 
  readAscii 
};
