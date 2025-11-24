import { encodeBmgString } from './bmg-format.js';
import { countVisibleCharacters, splitPreservingTokens } from './entries.js';
import { tokenRegex, parseSpecialToken, encodeSpecialCode, isSpecialControl } from './tokens.js';
import { state, els, CONTROL_CODE_PARAMS, LEGACY_TOKEN_REGEX, ENCODINGS } from './state.js';
import { updateMeta } from './ui.js';

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

function formatCharCount(entry) {
  const bytes = entry.byteLength
    ?? encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
  const chars = countVisibleCharacters(entry.text);
  return `${chars} chars · ${bytes} bytes`;
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

function formatAttrLabel(entry) {
  if (entry.kind === 'mid') {
    const refs = entry.references ?? [];
    if (!refs.length) {
      return 'MID refs: none';
    }
    const parts = refs.slice(0, 3).map((ref) => {
      return `row ${ref.row} · col ${ref.column}`;
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

function formatEntryTitle(entry) {
  if (entry.kind === 'mid') {
    return `MID1 Entry #${entry.id}`;
  }
  return `INF1 Entry #${entry.index}`;
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

function makeBadge(text, variant) {
  const span = document.createElement('span');
  span.className = 'badge';
  if (variant) {
    span.classList.add(`badge-${variant}`);
  }
  span.textContent = text;
  return span;
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

function updateSaveButton() {
  const hasChanges = state.entries.some((entry) => entry.dirty)
    || (state.midStrings?.some((entry) => entry.dirty) ?? false);
  els.download.disabled = !hasChanges;
}

export { formatBytes, formatCharCount, formatOffsetLabel, formatAttrLabel, formatEntryTitle, safeGetUint16, safeGetUint32, normalizeInput, readAscii, makeBadge, resetUi, updateSaveButton, formatHex, countVisibleCharacters, splitPreservingTokens };