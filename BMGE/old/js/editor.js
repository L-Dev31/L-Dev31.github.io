import { state } from './state.js';
import { normalizeInput, countVisibleCharacters, splitPreservingTokens, makeBadge } from './utils.js';
import { resolveEntry, generateScrollingVariants } from './entries.js';
import { encodeBmgString } from './bmg-format.js';
import { updateCalculatedOffsets, refreshEntryMetrics } from './layout.js';
import { updateSaveButton, updateTextHighlight, renderEntries } from './ui.js';

// onEntryEdit function
export function onEntryEdit(event) {
  const kind = event.target.dataset.kind;
  const id = event.target.dataset.id;
  const idsStr = event.target.dataset.ids;
  const scrollingIdsStr = event.target.dataset.scrollingIds;
  const sequencedIndicesStr = event.target.dataset.sequencedIndices;
  const sequencedIndex = event.target.dataset.sequencedIndex;
  
  const entry = resolveEntry(kind, id);
  if (!entry) return;
  
  const previousText = entry.text;
  const previousDirty = entry.dirty;
  
  const normalized = normalizeInput(event.target.value);
  if (normalized !== event.target.value) {
    event.target.value = normalized;
  }
  
  // Helper function to update all entries sharing the same DAT segment
  const updateSharedSegmentEntries = (targetEntry, newText) => {
    if (targetEntry.kind !== 'inf') return; // Only INF1 entries share DAT segments
    
    const segment = (state.datSegments || []).find(seg => 
      seg.entryIndices && seg.entryIndices.includes(targetEntry.index)
    );
    
    if (segment && segment.entryIndices && segment.entryIndices.length > 1) {
      segment.entryIndices.forEach(entryIndex => {
        const sharedEntry = state.entries[entryIndex];
        if (sharedEntry) {
          sharedEntry.text = newText;
          sharedEntry.dirty = sharedEntry.text !== sharedEntry.originalText;
          const encodedLength = encodeBmgString(sharedEntry.text, { leadingNull: sharedEntry.leadingNull }).length;
          sharedEntry.byteLength = sharedEntry.dirty ? encodedLength : sharedEntry.originalBytes.length;
        }
      });
    }
  };
  
  // Handle identical content groups
  if (idsStr) {
    const ids = JSON.parse(idsStr);
    ids.forEach((entryId) => {
      const groupEntry = state.entries.find(e => e.id === entryId);
      if (groupEntry) {
        groupEntry.text = normalized;
        groupEntry.dirty = groupEntry.text !== groupEntry.originalText;
        const encodedLength = encodeBmgString(groupEntry.text, { leadingNull: groupEntry.leadingNull }).length;
        groupEntry.byteLength = groupEntry.dirty ? encodedLength : groupEntry.originalBytes.length;
      }
    });
  } else if (scrollingIdsStr && kind === 'mid') {
    const scrollingIds = JSON.parse(scrollingIdsStr);
    const variants = generateScrollingVariants(normalized);
    
    scrollingIds.forEach((variantId, index) => {
      const variantEntry = state.midStrings.find(e => e.id === variantId);
      if (variantEntry && variants[index] !== undefined) {
        variantEntry.text = variants[index];
        variantEntry.dirty = variantEntry.text !== variantEntry.originalText;
        
        if (variantEntry.segment) {
          const nextBytes = encodeBmgString(variantEntry.text, { leadingNull: variantEntry.leadingNull });
          variantEntry.segment.bytes = nextBytes;
          variantEntry.segment.text = variantEntry.text;
          variantEntry.segment.leadingNull = variantEntry.leadingNull;
          variantEntry.byteLength = nextBytes.length;
        }
      }
    });
  } else if (sequencedIndicesStr && kind !== 'mid') {
    const sequencedIndices = JSON.parse(sequencedIndicesStr);
    
    if (sequencedIndex !== undefined) {
      const seqIdx = Number(sequencedIndex);
      const targetIndex = sequencedIndices[seqIdx];
      const targetEntry = state.entries[targetIndex];
      if (targetEntry) {
        targetEntry.text = normalized;
        targetEntry.dirty = targetEntry.text !== targetEntry.originalText;
        const encodedLength = encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull }).length;
        targetEntry.byteLength = targetEntry.dirty ? encodedLength : targetEntry.originalBytes.length;
      }
    } else {
      
      const fullText = normalized;
      const targets = sequencedIndices.map(idx => state.entries[idx]).filter(Boolean);
      if (targets.length) {
        
        const origVis = targets.map(t => Math.max(1, countVisibleCharacters(t.originalText)));
        const sumOrig = origVis.reduce((a, b) => a + b, 0) || targets.length;
        const desired = origVis.map(v => Math.round((v / sumOrig) * countVisibleCharacters(fullText)));
        
        let totalDesired = desired.reduce((a, b) => a + b, 0);
        const fullVis = countVisibleCharacters(fullText);
        
        let i = 0;
        while (totalDesired !== fullVis && i < desired.length) {
          if (totalDesired < fullVis) {
            desired[i] += 1;
            totalDesired += 1;
          } else if (totalDesired > fullVis && desired[i] > 0) {
            desired[i] -= 1;
            totalDesired -= 1;
          }
          i = (i + 1) % desired.length;
        }
        const parts = splitPreservingTokens(fullText, desired);
        targets.forEach((targetEntry, idx) => {
          const part = parts[idx] ?? '';
          targetEntry.text = part;
          targetEntry.dirty = targetEntry.text !== targetEntry.originalText;
          if (targetEntry.kind === 'mid' && targetEntry.segment) {
            const nextBytes = targetEntry.dirty
              ? encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull })
              : targetEntry.originalBytes.slice();
            targetEntry.segment.bytes = nextBytes;
            targetEntry.segment.text = targetEntry.text;
            targetEntry.segment.leadingNull = targetEntry.leadingNull;
            targetEntry.byteLength = nextBytes.length;
          } else {
            const encodedLength = encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull }).length;
            targetEntry.byteLength = targetEntry.dirty ? encodedLength : targetEntry.originalBytes.length;
          }
        });
      }
    }
  } else if (sequencedIndicesStr && kind === 'mid') {
    
    const sequencedIds = JSON.parse(sequencedIndicesStr);
    const fullText = normalized;
    const targets = sequencedIds.map(id => state.midStrings.find(e => e.id === id)).filter(Boolean);
    if (targets.length) {
      const origVis = targets.map(t => Math.max(1, countVisibleCharacters(t.originalText)));
      const sumOrig = origVis.reduce((a, b) => a + b, 0) || targets.length;
      const fullVis = countVisibleCharacters(fullText);
      const desired = origVis.map(v => Math.round((v / sumOrig) * fullVis));
      
      let totalDesired = desired.reduce((a, b) => a + b, 0);
      let idxFix = 0;
      while (totalDesired !== fullVis && idxFix < desired.length) {
        if (totalDesired < fullVis) { desired[idxFix] += 1; totalDesired += 1; }
        else if (totalDesired > fullVis && desired[idxFix] > 0) { desired[idxFix] -= 1; totalDesired -= 1; }
        idxFix = (idxFix + 1) % desired.length;
      }
      const parts = splitPreservingTokens(fullText, desired);
      targets.forEach((targetEntry, idx) => {
        const part = parts[idx] ?? '';
        targetEntry.text = part;
        targetEntry.dirty = targetEntry.text !== targetEntry.originalText;
        if (targetEntry.segment) {
          const nextBytes = targetEntry.dirty
            ? encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull })
            : targetEntry.originalBytes.slice();
          targetEntry.segment.bytes = nextBytes;
          targetEntry.segment.text = targetEntry.text;
          targetEntry.segment.leadingNull = targetEntry.leadingNull;
          targetEntry.byteLength = nextBytes.length;
        } else {
          const encodedLength = encodeBmgString(targetEntry.text, { leadingNull: targetEntry.leadingNull }).length;
          targetEntry.byteLength = targetEntry.dirty ? encodedLength : targetEntry.originalBytes.length;
        }
      });
    }
  } else {
    entry.text = normalized;
    entry.dirty = entry.text !== entry.originalText;
    
    if (entry.kind === 'mid' && entry.segment) {
      const nextBytes = entry.dirty
        ? encodeBmgString(entry.text, { leadingNull: entry.leadingNull })
        : entry.originalBytes.slice();
      entry.segment.bytes = nextBytes;
      entry.segment.text = entry.text;
      entry.segment.leadingNull = entry.leadingNull;
      entry.byteLength = nextBytes.length;
    } else {
      const encodedLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
      entry.byteLength = entry.dirty ? encodedLength : entry.originalBytes.length;
    }
  }
  
  // Ensure all entries sharing the same DAT segment have identical text
  updateSharedSegmentEntries(entry, normalized);
  
  const card = event.target.closest('.entry-card');
  const layout = updateCalculatedOffsets();
  
  if (!layout) {
    entry.text = previousText;
    entry.dirty = previousDirty;
    event.target.value = previousText;
    return;
  }
  
  card.classList.toggle('modified', entry.dirty);
  
  try {
    const shell = event.target.closest('.editor-shell');
    const hl = shell ? shell.querySelector('.text-highlight') : null;
    if (hl) updateTextHighlight(hl, event.target.value);
  } catch (e) {
    
  }
  
  try {
    const card = event.target.closest('.entry-card');
    if (card) {
      let modified = false;
      const taList = card.querySelectorAll('textarea');
      taList.forEach((ta) => {
        if (ta.dataset.ids) {
          // Handle identical content groups
          const ids = JSON.parse(ta.dataset.ids);
          ids.forEach((entryId) => {
            const groupEntry = state.entries.find(e => e.id === entryId);
            if (groupEntry && groupEntry.dirty) modified = true;
          });
        } else {
          const resolved = resolveEntry(ta.dataset.kind, ta.dataset.id);
          if (resolved && resolved.dirty) modified = true;
        }
      });
      
      const topEntryKind = event.target.dataset.kind;
      const topEntryId = event.target.dataset.id;
      const topIdsStr = event.target.dataset.ids;
      if (topIdsStr) {
        const ids = JSON.parse(topIdsStr);
        ids.forEach((entryId) => {
          const groupEntry = state.entries.find(e => e.id === entryId);
          if (groupEntry && groupEntry.dirty) modified = true;
        });
      } else {
        const topResolved = resolveEntry(topEntryKind, topEntryId);
        if (topResolved && topResolved.dirty) modified = true;
      }

      card.classList.toggle('modified', modified);
      const badges = card.querySelector('.badges');
      const existing = badges ? Array.from(badges.children).find(b => (b.textContent || '').toLowerCase() === 'modified') : null;
      if (badges) {
        if (modified && !existing) {
          badges.appendChild(makeBadge('modified', 'warning'));
        }
        else if (!modified && existing) existing.remove();
      }
      const revertBtn = card.querySelector('.revert');
      if (revertBtn) revertBtn.disabled = !modified;
    }
  } catch (e) {
    
  }
  const revertBtn = card.querySelector('.revert');
  if (revertBtn) {
    let hasModified = false;
    if (idsStr) {
      const ids = JSON.parse(idsStr);
      ids.forEach((entryId) => {
        const groupEntry = state.entries.find(e => e.id === entryId);
        if (groupEntry && groupEntry.dirty) hasModified = true;
      });
    } else {
      hasModified = entry.dirty;
    }
    revertBtn.disabled = !hasModified;
  }
  refreshEntryMetrics();
  updateSaveButton();
}

// onEntryRevert function
export function onEntryRevert(event) {
  const kind = event.currentTarget.dataset.kind;
  const id = event.currentTarget.dataset.id;
  const idsStr = event.currentTarget.dataset.ids;
  const scrollingIdsStr = event.currentTarget.dataset.scrollingIds;
  const sequencedIndicesStr = event.currentTarget.dataset.sequencedIndices;
  
  const entry = resolveEntry(kind, id);
  if (!entry) return;
  
  // Helper function to revert all entries sharing the same DAT segment
  const revertSharedSegmentEntries = (targetEntry) => {
    if (targetEntry.kind !== 'inf') return; // Only INF1 entries share DAT segments
    
    const segment = (state.datSegments || []).find(seg => 
      seg.entryIndices && seg.entryIndices.includes(targetEntry.index)
    );
    
    if (segment && segment.entryIndices && segment.entryIndices.length > 1) {
      segment.entryIndices.forEach(entryIndex => {
        const sharedEntry = state.entries[entryIndex];
        if (sharedEntry) {
          sharedEntry.text = sharedEntry.originalText;
          sharedEntry.leadingNull = sharedEntry.originalLeadingNull;
          sharedEntry.byteLength = sharedEntry.originalBytes.length;
          sharedEntry.dirty = false;
        }
      });
    }
  };
  
  // Handle identical content groups
  if (idsStr) {
    const ids = JSON.parse(idsStr);
    ids.forEach((entryId) => {
      const groupEntry = state.entries.find(e => e.id === entryId);
      if (groupEntry) {
        groupEntry.text = groupEntry.originalText;
        groupEntry.leadingNull = groupEntry.originalLeadingNull;
        groupEntry.byteLength = groupEntry.originalBytes.length;
        groupEntry.dirty = false;
      }
    });
  } else if (scrollingIdsStr && kind === 'mid') {
    const scrollingIds = JSON.parse(scrollingIdsStr);
    
    scrollingIds.forEach((variantId) => {
      const variantEntry = state.midStrings.find(e => e.id === variantId);
      if (variantEntry) {
        variantEntry.text = variantEntry.originalText;
        variantEntry.leadingNull = variantEntry.originalLeadingNull;
        variantEntry.dirty = false;
        
        if (variantEntry.segment) {
          variantEntry.segment.bytes = variantEntry.originalBytes.slice();
          variantEntry.segment.text = variantEntry.originalText;
          variantEntry.segment.leadingNull = variantEntry.originalLeadingNull;
          variantEntry.byteLength = variantEntry.originalBytes.length;
        }
      }
    });
  } else if (sequencedIndicesStr && kind !== 'mid') {
    const sequencedIndices = JSON.parse(sequencedIndicesStr);
    sequencedIndices.forEach((targetIndex) => {
      const targetEntry = state.entries[targetIndex];
      if (targetEntry) {
        targetEntry.text = targetEntry.originalText;
        targetEntry.leadingNull = targetEntry.originalLeadingNull;
        targetEntry.byteLength = targetEntry.originalBytes.length;
        targetEntry.dirty = false;
      }
    });
  } else {
    entry.text = entry.originalText;
    entry.leadingNull = entry.originalLeadingNull;
    
    if (entry.kind === 'mid' && entry.segment) {
      entry.segment.bytes = entry.originalBytes.slice();
      entry.segment.text = entry.originalText;
      entry.segment.leadingNull = entry.originalLeadingNull;
      entry.byteLength = entry.originalBytes.length;
    } else {
      entry.byteLength = entry.originalBytes.length;
    }
    
    entry.dirty = false;
  }
  
  // Ensure all entries sharing the same DAT segment are reverted
  revertSharedSegmentEntries(entry);
  
  updateCalculatedOffsets();
  const card = event.currentTarget.closest('.entry-card');
  const textareas = card.querySelectorAll('textarea');
  if (idsStr) {
    const ids = JSON.parse(idsStr);
    const firstEntry = state.entries.find(e => e.id === ids[0]);
    if (firstEntry && textareas.length > 0) {
      textareas[0].value = firstEntry.text;
      const shell = textareas[0].closest('.editor-shell');
      const highlight = (textareas[0].nextElementSibling && textareas[0].nextElementSibling.classList && textareas[0].nextElementSibling.classList.contains('text-highlight'))
        ? textareas[0].nextElementSibling
        : (shell ? shell.querySelector('.text-highlight') : null);
      if (highlight) updateTextHighlight(highlight, firstEntry.text);
    }
  } else if (sequencedIndicesStr) {
    const sequencedIndices = JSON.parse(sequencedIndicesStr);
    
    if (textareas.length === 1) {
      let combined;
      if (kind === 'mid') {
        combined = sequencedIndices.map(i => (state.midStrings.find(e => e.id === i)?.text ?? '')).join('');
      } else {
        combined = sequencedIndices.map(i => (state.entries[i]?.text ?? '')).join('');
      }
      textareas[0].value = combined;
      
      const shell0 = textareas[0].closest('.editor-shell');
      const hl0 = (textareas[0].nextElementSibling && textareas[0].nextElementSibling.classList && textareas[0].nextElementSibling.classList.contains('text-highlight'))
        ? textareas[0].nextElementSibling
        : (shell0 ? shell0.querySelector('.text-highlight') : null);
      if (hl0) updateTextHighlight(hl0, combined);
    } else {
      
      textareas.forEach((textarea, idx) => {
        const targetKey = sequencedIndices[idx];
        if (kind === 'mid') {
          const targetEntry = state.midStrings.find(e => e.id === targetKey);
          if (targetEntry) {
            textarea.value = targetEntry.text;
            const shell = textarea.closest('.editor-shell');
            const highlight = (textarea.nextElementSibling && textarea.nextElementSibling.classList && textarea.nextElementSibling.classList.contains('text-highlight'))
              ? textarea.nextElementSibling
              : (shell ? shell.querySelector('.text-highlight') : null);
            if (highlight) updateTextHighlight(highlight, targetEntry.text);
          }
        } else {
          const targetIndex = targetKey;
          const targetEntry = state.entries[targetIndex];
          if (targetEntry) {
            textarea.value = targetEntry.text;
            const shell = textarea.closest('.editor-shell');
            const highlight = (textarea.nextElementSibling && textarea.nextElementSibling.classList && textarea.nextElementSibling.classList.contains('text-highlight'))
              ? textarea.nextElementSibling
              : (shell ? shell.querySelector('.text-highlight') : null);
            if (highlight) updateTextHighlight(highlight, targetEntry.text);
          }
        }
      });
    }
  } else {
    textareas.forEach(textarea => {
      textarea.value = entry.text;
    });
    const highlights = card.querySelectorAll('.text-highlight');
    highlights.forEach(highlight => {
      highlight.dataset.entryKind = entry.kind;
      updateTextHighlight(highlight, entry.text);
    });
  }
  let isModified = false;
  if (idsStr) {
    const ids = JSON.parse(idsStr);
    ids.forEach((entryId) => {
      const groupEntry = state.entries.find(e => e.id === entryId);
      if (groupEntry && groupEntry.dirty) isModified = true;
    });
  } else {
    isModified = entry.dirty;
  }
  card.classList.toggle('modified', isModified);
  event.currentTarget.disabled = true;
  refreshEntryMetrics();
  updateSaveButton();
}

// onFilter function
export function onFilter(event) {
  // Pour les checkboxes, on ne change pas state.filter, juste render
  if (event.target.type === 'checkbox') {
    renderEntries();
    return;
  }
  // Pour le champ de recherche textuelle
  state.filter = event.target.value;
  renderEntries();
}