import { state, els, ENCODINGS } from './state.js';
import { formatHex, formatBytes, normalizeInput, countVisibleCharacters, splitPreservingTokens } from './utils.js';
import { parseBmg, buildBmg, encodeBmgString } from './bmg-format.js';
import { updateCalculatedOffsets } from './layout.js';
import { updateMeta, renderEntries, updateSaveButton, showMessage, resetUi } from './ui.js';
import { generateScrollingVariants } from './entries.js';
import { detectSequencedGroups, detectScrollingGroups, detectMixedSequencedGroups } from './entries.js';

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

export function handleExportJson() {
  // Get entries in display order (sorted by offset)
  const allEntries = [...state.entries];
  if (state.midStrings) {
    allEntries.push(...state.midStrings);
  }

  // Sort by offset for consistent display order (same as renderEntries)
  allEntries.sort((a, b) => {
    const aOffset = a.offset || a.calculatedOffset || 0;
    const bOffset = b.offset || b.calculatedOffset || 0;
    return aOffset - bOffset;
  });

  const midGroups = detectSequencedGroups(state.midStrings || []);
  const scrollingGroups = detectScrollingGroups(state.midStrings || []);
  const mixedGroups = detectMixedSequencedGroups(state.entries, state.midStrings || []);

  // Create maps to track which entries belong to which groups
  const entryToGroupMap = new Map();
  const processedEntries = new Set();

  // Process mixed sequenced groups
  mixedGroups.forEach(group => {
    if (group.isMixedSequenced && group.entries.length > 0) {
      group.entries.forEach(entry => {
        const key = `${entry.kind}-${entry.id}`;
        entryToGroupMap.set(key, {
          type: 'sequenced',
          group: group,
          entries: group.entries,
          mixedTypes: group.mixedTypes
        });
        processedEntries.add(key);
      });
    }
  });

  // Process scrolling groups
  scrollingGroups.forEach(group => {
    if (group.isScrolling && group.entries.length > 0) {
      group.entries.forEach(entry => {
        const key = `${entry.kind}-${entry.id}`;
        if (!processedEntries.has(key)) {
          entryToGroupMap.set(key, {
            type: 'scrolling',
            group: group,
            entries: group.entries
          });
          processedEntries.add(key);
        }
      });
    }
  });

  // Process sequenced groups
  midGroups.forEach(group => {
    if (group.isSequenced && group.entries.length > 0) {
      group.entries.forEach(entry => {
        const key = `${entry.kind}-${entry.id}`;
        if (!processedEntries.has(key)) {
          entryToGroupMap.set(key, {
            type: 'sequenced',
            group: group,
            entries: group.entries
          });
          processedEntries.add(key);
        }
      });
    }
  });

  // Unified structure with display order numbering (0, 1, 2, 3...)
  const data = {
    single: null, // placeholder
    sequenced: [],
    scrolling: []
  };

  // Track processed groups to avoid duplicates
  const processedGroups = new Set();

  // Group single entries by identical messages to reduce JSON size
  const singleGroups = new Map();
  const sequencedEntries = new Set();
  const scrollingEntries = new Set();

  // First pass: collect all entries that belong to groups
  allEntries.forEach((entry, displayIndex) => {
    const key = `${entry.kind}-${entry.id}`;
    const groupInfo = entryToGroupMap.get(key);

    if (groupInfo) {
      // This entry belongs to a group
      const groupKey = `${groupInfo.type}-${groupInfo.entries.map(e => `${e.kind}-${e.id}`).sort().join(',')}`;

      if (!processedGroups.has(groupKey)) {
        processedGroups.add(groupKey);

        if (groupInfo.type === 'scrolling') {
          // Find all display indices for this scrolling group
          const groupDisplayIndices = groupInfo.entries.map(e =>
            allEntries.findIndex(ee => ee.id === e.id && ee.kind === e.kind)
          ).filter(idx => idx >= 0).sort((a, b) => a - b);

          data.scrolling.push({
            id: groupDisplayIndices[0], // Use first display index as base
            message: groupInfo.entries[0].text,
            scrollingGroup: groupDisplayIndices,
            variants: groupInfo.entries.map(e => e.text),
            // include actual messages per-bank inside the scrolling object
            inf1: groupInfo.entries.map(e => (e.kind !== 'mid' ? e.text : null)),
            mid1: groupInfo.entries.map(e => (e.kind === 'mid' ? e.text : null))
          });

          // Mark these entries as processed
          groupDisplayIndices.forEach(idx => scrollingEntries.add(idx));
        } else if (groupInfo.type === 'sequenced') {
          // Find all display indices for this sequenced group
          const groupDisplayIndices = groupInfo.entries.map(e =>
            allEntries.findIndex(ee => ee.id === e.id && ee.kind === e.kind)
          ).filter(idx => idx >= 0).sort((a, b) => a - b);

          data.sequenced.push({
            id: groupDisplayIndices[0], // Use first display index as base
            sequencedGroup: groupDisplayIndices,
            // include actual messages per-bank inside the sequenced object
            inf1: groupInfo.entries.map(e => (e.kind !== 'mid' ? e.text : null)),
            mid1: groupInfo.entries.map(e => (e.kind === 'mid' ? e.text : null))
          });

          // Mark these entries as processed
          groupDisplayIndices.forEach(idx => sequencedEntries.add(idx));
        }
      }
    }
  });

  // Second pass: group single entries by identical messages
  allEntries.forEach((entry, displayIndex) => {
    if (sequencedEntries.has(displayIndex) || scrollingEntries.has(displayIndex)) {
      return; // Already processed as part of a group
    }

    const message = entry.text;
    if (!singleGroups.has(message)) {
      singleGroups.set(message, []);
    }
    singleGroups.get(message).push(displayIndex);
  });

  // Build inf1/mid1 arrays for single entries (aligned to display order)
  const tempInf1 = [];
  const tempMid1 = [];
  allEntries.forEach((entry, displayIndex) => {
    if (sequencedEntries.has(displayIndex) || scrollingEntries.has(displayIndex)) return;
    if (entry.kind === 'mid') {
      tempInf1.push(null);
      tempMid1.push(entry.text);
    } else {
      tempInf1.push(entry.text);
      tempMid1.push(null);
    }
  });

  // Group identical messages to reduce JSON size and include IDs
  const groupMessages = (arr) => {
    const grouped = {};
    arr.forEach((msg, i) => {
      if (msg != null) {
        if (!grouped[msg]) grouped[msg] = [];
        grouped[msg].push(i);
      }
    });
    return Object.entries(grouped).map(([message, ids]) => ({ id: ids, message }));
  };
  data.single = {
    inf1: groupMessages(tempInf1),
    mid1: groupMessages(tempMid1)
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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
      
      // Expand grouped messages back to arrays
      const expandGrouped = (grouped, length) => {
        const arr = new Array(length).fill(null);
        grouped.forEach(item => {
          item.id.forEach(id => arr[id] = item.message);
        });
        return arr;
      };
      
      // Get entries in display order (same sorting as export)
      const allEntries = [...state.entries];
      if (state.midStrings) {
        allEntries.push(...state.midStrings);
      }
      
      // Sort by offset for consistent display order (same as export)
      allEntries.sort((a, b) => {
        const aOffset = a.offset || a.calculatedOffset || 0;
        const bOffset = b.offset || b.calculatedOffset || 0;
        return aOffset - bOffset;
      });
      
      // Handle new format with single section
      if (data.single) {
        data.inf1 = expandGrouped(data.single.inf1, allEntries.length);
        data.mid1 = expandGrouped(data.single.mid1, allEntries.length);
      } else {
        // Expand inf1 and mid1 if grouped (old format)
        if (data.inf1 && typeof data.inf1 === 'object' && !Array.isArray(data.inf1)) {
          data.inf1 = expandGrouped(data.inf1, allEntries.length);
        }
        if (data.mid1 && typeof data.mid1 === 'object' && !Array.isArray(data.mid1)) {
          data.mid1 = expandGrouped(data.mid1, allEntries.length);
        }
      }
      
      // Handle both new unified format and legacy format
      let entries = { single: [], sequenced: [], scrolling: [] };
      
      if (data.inf1 || data.mid1) {
        // Legacy format with separate inf1/mid1 sections
        const inf1 = data.inf1 || { single: [], sequenced: [], scrolling: [] };
        const mid1 = data.mid1 || { single: [], sequenced: [], scrolling: [] };
        
        // Convert legacy format to unified structure
        entries.single = [...(inf1.single || []), ...(mid1.single || [])];
        entries.sequenced = [...(inf1.sequenced || []), ...(mid1.sequenced || [])];
        entries.scrolling = [...(inf1.scrolling || []), ...(mid1.scrolling || [])];
      } else {
        // New unified format
        entries = { 
          single: data.single || [], 
          sequenced: data.sequenced || [], 
          scrolling: data.scrolling || [] 
        };
      }

      
      // Build sets of display indices used by sequenced/scrolling so we can find single indices.
      const sequencedDisplaySet = new Set();
      entries.sequenced.forEach(it => {
        if (Array.isArray(it.sequencedGroup)) it.sequencedGroup.map(Number).forEach(n => sequencedDisplaySet.add(n));
      });

      const scrollingDisplaySet = new Set();
      entries.scrolling.forEach(it => {
        if (Array.isArray(it.scrollingGroup)) it.scrollingGroup.map(Number).forEach(n => scrollingDisplaySet.add(n));
      });

      // Apply top-level inf1/mid1 to single entries (aligned to display order of single entries)
      const infArr = Array.isArray(data.inf1) ? data.inf1 : null;
      const midArr = Array.isArray(data.mid1) ? data.mid1 : null;
      const singleDisplayIndices = [];
      allEntries.forEach((_, idx) => {
        if (!sequencedDisplaySet.has(idx) && !scrollingDisplaySet.has(idx)) singleDisplayIndices.push(idx);
      });

      singleDisplayIndices.forEach((displayIndex, i) => {
        const entry = allEntries[displayIndex];
        if (!entry) return;
        let msg = undefined;
        if (infArr && infArr[i] != null) msg = infArr[i];
        else if (midArr && midArr[i] != null) msg = midArr[i];
        if (msg !== undefined) {
          entry.text = normalizeInput(msg);
          entry.dirty = entry.text !== entry.originalText;
          entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
        }
      });
      
      // Import sequenced entries using display order indices
      entries.sequenced.forEach(item => {
        const baseDisplayIndex = Number(item.id);
        if (!Number.isInteger(baseDisplayIndex)) return;
        
        if (Array.isArray(item.sequencedGroup) && item.sequencedGroup.length > 0) {
          const displayIndices = item.sequencedGroup.map(Number);
          
          if (Array.isArray(item.inf1) || Array.isArray(item.mid1)) {
            // Per-bank messages provided: inf1/mid1 arrays (may contain nulls)
            displayIndices.forEach((targetDisplayIndex, i) => {
              if (targetDisplayIndex >= 0 && targetDisplayIndex < allEntries.length) {
                const entry = allEntries[targetDisplayIndex];
                const msg = (Array.isArray(item.inf1) && item.inf1[i] != null) ? item.inf1[i]
                          : (Array.isArray(item.mid1) && item.mid1[i] != null) ? item.mid1[i]
                          : undefined;
                if (msg !== undefined) {
                  entry.text = normalizeInput(msg);
                  entry.dirty = entry.text !== entry.originalText;
                  entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
                }
              }
            });
          } else if (typeof item.message === 'string') {
            const targets = displayIndices
              .filter(idx => idx >= 0 && idx < allEntries.length)
              .map(idx => allEntries[idx])
              .filter(Boolean);
            const parts = splitTextProportionally(item.message, targets);

            targets.forEach((entry, i) => {
              entry.text = parts[i];
              entry.dirty = entry.text !== entry.originalText;
              entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
            });
          }
        }
      });
      
      // Import scrolling entries using display order indices
      entries.scrolling.forEach(item => {
        const baseDisplayIndex = Number(item.id);
        if (!Number.isInteger(baseDisplayIndex)) return;
        
          if (Array.isArray(item.scrollingGroup) && item.scrollingGroup.length > 0) {
          // Build variants prioritizing inf1/mid1 arrays if provided
          const generated = generateScrollingVariants(item.message);
          const variants = (Array.isArray(item.inf1) || Array.isArray(item.mid1))
            ? item.scrollingGroup.map((_, i) => {
                if (Array.isArray(item.inf1) && item.inf1[i] != null) return item.inf1[i];
                if (Array.isArray(item.mid1) && item.mid1[i] != null) return item.mid1[i];
                if (Array.isArray(item.variants) && item.variants[i] != null) return item.variants[i];
                return generated[i];
              })
            : (item.variants || generated);

          item.scrollingGroup.forEach((variantDisplayIndex, i) => {
            if (variantDisplayIndex >= 0 && variantDisplayIndex < allEntries.length && variants[i] !== undefined) {
              const entry = allEntries[variantDisplayIndex];
              entry.text = variants[i];
              entry.dirty = entry.text !== entry.originalText;
              entry.byteLength = encodeBmgString(entry.text, { leadingNull: entry.leadingNull }).length;
            }
          });
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