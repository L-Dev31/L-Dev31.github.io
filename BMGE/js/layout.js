import { state } from './state.js';
import { formatHex, formatBytes, formatCharCount, formatOffsetLabel, formatAttrLabel, formatEntryTitle, makeBadge } from './utils.js';
import { resolveEntry, getMidGroupForId } from './entries.js';
import { encodeBmgString } from './bmg-format.js';

// planDatLayout function
export function planDatLayout(entries) {
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

// updateCalculatedOffsets function
export function updateCalculatedOffsets(layout) {
  let resolvedLayout;
  try {
    resolvedLayout = layout ?? planDatLayout(state.entries);
  } catch (error) {
    console.error(error);
    // Note: showMessage is from ui.js, will be imported later
    // showMessage(error instanceof Error ? error.message : 'Failed to update offsets.', 'error');
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

// refreshEntryMetrics function
export function refreshEntryMetrics() {
  document.querySelectorAll('.entry-card').forEach((card) => {
    const kind = card.dataset.kind;
    const id = card.dataset.id;
    const entry = resolveEntry(kind, id);
    if (!entry) {
      return;
    }
    card.dataset.color = 'default';
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
      // Note: updateBadges is from ui.js, will be imported later
      // updateBadges(badges, entry);
    }
    const highlight = card.querySelector('.text-highlight');
    if (highlight) {
      highlight.dataset.entryKind = entry.kind;
      highlight.dataset.entryColor = 'default';
      // Note: updateTextHighlight is from ui.js, will be imported later
      // updateTextHighlight(highlight, entry.text);
    }
  });
}