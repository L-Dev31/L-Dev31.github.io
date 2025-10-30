import { state, els, ENCODINGS } from './state.js';
import { formatHex, formatBytes, normalizeInput, countVisibleCharacters, splitPreservingTokens } from './utils.js';
import { parseBmg, buildBmg, encodeBmgString } from './bmg-format.js';
import { updateCalculatedOffsets } from './layout.js';
import { updateMeta, renderEntries, updateSaveButton, showMessage, resetUi } from './ui.js';
import { generateScrollingVariants } from './entries.js';
import { detectSequencedGroups } from './entries.js';

// ============================================================================
// FILE LOADING
// ============================================================================

export function handleFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) {
    resetUi();
    return;
  }
  
  els.fileLabel.textContent = file.name;
  
  file.arrayBuffer()
    .then((buffer) => {
      try {
        loadBuffer(buffer, file.name);
        showMessage(`${file.name} • ${formatBytes(buffer.byteLength)}`, 'success');
      } catch (error) {
        console.error(error);
        resetUi();
        showMessage(error instanceof Error ? error.message : String(error), 'error');
      }
    })
    .catch((error) => {
      console.error(error);
      resetUi();
      showMessage('Unable to read file.', 'error');
    });
}

function loadBuffer(buffer, name) {
  const parsed = parseBmg(buffer);
  Object.assign(state, parsed, { 
    fileName: name, 
    filter: '', 
    message: '', 
    messageTone: 'info' 
  });
  
  els.search.value = '';
  els.search.disabled = false;
  els.download.disabled = false;
  els.exportJson.disabled = false;
  els.importJson.disabled = false;
  
  updateCalculatedOffsets();
  renderEntries();
  updateMeta();
  updateSaveButton();
}

// ============================================================================
// FILE SAVING
// ============================================================================

export function handleDownload() {
  const hasChanges = state.entries.some(e => e.dirty) || 
                     (state.midStrings?.some(e => e.dirty) ?? false);
  
  if (!hasChanges) return;
  
  let buffer;
  try {
    ({ buffer } = buildBmg());
  } catch (error) {
    console.error(error);
    showMessage(error instanceof Error ? error.message : String(error), 'error');
    return;
  }
  
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = state.fileName ? state.fileName.replace(/\.bmg$/i, '') : 'messages';
  
  anchor.href = url;
  anchor.download = `${safeName}_edited.bmg`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  
  applyNewBuffer(buffer);
  showMessage('Export complete. Changes reloaded.', 'success');
}

function applyNewBuffer(buffer) {
  const filter = state.filter;
  const fileName = state.fileName;
  const parsed = parseBmg(buffer);
  
  Object.assign(state, parsed, {
    fileName,
    filter,
    message: state.message,
    messageTone: state.messageTone
  });
  
  state.entries.forEach((entry) => {
    entry.dirty = false;
    entry.byteLength = entry.originalBytes.length;
    entry.leadingNull = entry.originalLeadingNull;
  });
  
  state.midStrings.forEach((entry) => {
    entry.dirty = false;
    entry.byteLength = entry.originalBytes.length;
    entry.leadingNull = entry.originalLeadingNull;
    if (entry.segment) {
      entry.segment.bytes = entry.originalBytes.slice();
      entry.segment.text = entry.originalText;
      entry.segment.leadingNull = entry.originalLeadingNull;
    }
  });
  
  els.search.disabled = false;
  els.search.value = filter;
  
  updateCalculatedOffsets();
  renderEntries();
  updateMeta();
  updateSaveButton();
}

// ============================================================================
// JSON EXPORT
// ============================================================================

export function handleExportJson() {
  const infGroups = detectSequencedGroups(state.entries);
  const midGroups = detectSequencedGroups(state.midStrings || []);
  
  // Build INF1 entries
  const inf1 = [];
  infGroups.forEach(group => {
    if (group.isSequenced) {
      inf1.push({
        id: group.entries[0].index,
        messages: group.entries.map(e => e.text),
        sequencedGroup: group.indices
      });
    } else {
      inf1.push({
        id: group.entries[0].index,
        message: group.entries[0].text
      });
    }
  });
  
  // Build MID1 entries
  const mid1 = [];
  midGroups.forEach(group => {
    if (group.isSequenced) {
      mid1.push({
        id: group.entries[0].id,
        messages: group.entries.map(e => e.text),
        sequencedGroup: group.entries.map(e => e.id)
      });
    } else {
      mid1.push({
        id: group.entries[0].id,
        message: group.entries[0].text
      });
    }
  });
  
  const payload = { inf1, mid1 };
  
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = state.fileName ? state.fileName.replace(/\.bmg$/i, '') : 'messages';
  
  anchor.href = url;
  anchor.download = `${safeName}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// ============================================================================
// JSON IMPORT
// ============================================================================

export function handleImportJsonClick() {
  if (els.importJson.disabled) return;
  els.importJsonInput.value = '';
  els.importJsonInput.click();
}

export function handleImportJsonFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  if (!state.entries.length) {
    showMessage('Load a BMG file before importing JSON.', 'error');
    event.target.value = '';
    return;
  }
  
  file.text()
    .then(raw => {
      const data = JSON.parse(raw);
      
      // Extract inf1 and mid1
      let inf1 = [];
      let mid1 = [];
      
      if (Array.isArray(data)) {
        inf1 = data;
      } else if (data.inf1) {
        inf1 = data.inf1;
        mid1 = data.mid1 || [];
      } else if (data.entries) {
        inf1 = data.entries;
        mid1 = data.midStrings || [];
      }
      
      // Import INF1 entries
      inf1.forEach(item => {
        const id = Number(item.id);
        if (!Number.isInteger(id) || id < 0 || id >= state.entryCount) return;
        
        // Handle sequenced group
        if (Array.isArray(item.sequencedGroup) && item.sequencedGroup.length > 0) {
          const indices = item.sequencedGroup;
          
          // If we have individual messages, apply them directly
          if (Array.isArray(item.messages)) {
            indices.forEach((targetIndex, i) => {
              const entry = state.entries[targetIndex];
              if (entry && item.messages[i] !== undefined) {
                entry.text = normalizeInput(item.messages[i]);
                entry.dirty = entry.text !== entry.originalText;
                entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
              }
            });
          }
          // Otherwise split single message
          else if (typeof item.message === 'string') {
            const targets = indices.map(i => state.entries[i]).filter(Boolean);
            const parts = splitTextProportionally(item.message, targets);
            
            targets.forEach((entry, i) => {
              entry.text = parts[i];
              entry.dirty = entry.text !== entry.originalText;
              entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
            });
          }
        }
        // Handle single entry
        else if (typeof item.message === 'string') {
          const entry = state.entries[id];
          if (entry) {
            entry.text = normalizeInput(item.message);
            entry.dirty = entry.text !== entry.originalText;
            entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
          }
        }
      });
      
      // Import MID1 entries
      mid1.forEach(item => {
        const baseId = Number(item.id);
        if (!Number.isInteger(baseId)) return;
        
        // Handle sequenced group
        if (Array.isArray(item.sequencedGroup) && item.sequencedGroup.length > 0) {
          const ids = item.sequencedGroup.map(Number);
          
          // If we have individual messages, apply them directly
          if (Array.isArray(item.messages)) {
            ids.forEach((targetId, i) => {
              const entry = state.midStrings.find(e => e.id === targetId);
              if (entry && item.messages[i] !== undefined) {
                entry.text = normalizeInput(item.messages[i]);
                entry.dirty = entry.text !== entry.originalText;
                entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
              }
            });
          }
          // Otherwise split single message
          else if (typeof item.message === 'string') {
            const targets = ids.map(id => state.midStrings.find(e => e.id === id)).filter(Boolean);
            const parts = splitTextProportionally(item.message, targets);
            
            targets.forEach((entry, i) => {
              entry.text = parts[i];
              entry.dirty = entry.text !== entry.originalText;
              entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
            });
          }
        }
        // Handle scrolling group
        else if (Array.isArray(item.scrollingGroup) && item.scrollingGroup.length > 0) {
          const variants = generateScrollingVariants(item.message);
          item.scrollingGroup.forEach((variantId, i) => {
            const entry = state.midStrings.find(e => e.id === variantId);
            if (entry && variants[i] !== undefined) {
              entry.text = variants[i];
              entry.dirty = entry.text !== entry.originalText;
              entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
            }
          });
        }
        // Handle single entry
        else if (typeof item.message === 'string') {
          const entry = state.midStrings.find(e => e.id === baseId);
          if (entry) {
            entry.text = normalizeInput(item.message);
            entry.dirty = entry.text !== entry.originalText;
            entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
          }
        }
      });
      
      updateCalculatedOffsets();
      renderEntries();
      updateSaveButton();
      
      const modifiedCount = state.entries.filter(e => e.dirty).length + 
                           (state.midStrings?.filter(e => e.dirty).length || 0);
      
      showMessage(`Imported JSON. Modified ${modifiedCount} entries.`, 'success');
    })
    .catch(error => {
      console.error(error);
      showMessage(error instanceof Error ? error.message : 'Failed to import JSON.', 'error');
    })
    .finally(() => {
      event.target.value = '';
    });
}

// ============================================================================
// HELPERS
// ============================================================================

function splitTextProportionally(fullText, targets) {
  if (!targets.length) return [];
  
  const normalized = normalizeInput(fullText);
  const origVis = targets.map(t => Math.max(1, countVisibleCharacters(t.originalText)));
  const sumOrig = origVis.reduce((a, b) => a + b, 0) || targets.length;
  const fullVis = countVisibleCharacters(normalized);
  const desired = origVis.map(v => Math.round((v / sumOrig) * fullVis));
  
  // Adjust to match total
  let totalDesired = desired.reduce((a, b) => a + b, 0);
  let idx = 0;
  while (totalDesired !== fullVis && idx < desired.length) {
    if (totalDesired < fullVis) {
      desired[idx]++;
      totalDesired++;
    } else if (totalDesired > fullVis && desired[idx] > 0) {
      desired[idx]--;
      totalDesired--;
    }
    idx = (idx + 1) % desired.length;
  }
  
  return splitPreservingTokens(normalized, desired);
}