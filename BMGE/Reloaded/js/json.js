import { state, els } from './state.js';
import { parseMessageSegments } from './group-segments.js';
import { updateTextHighlight, updateSaveButton, renderEntries, showMessage } from './ui.js';

// Simple helpers
function downloadStringAsFile(str, filename, mime = 'application/json') {
  const blob = new Blob([str], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function attributeToHex(attr) {
  if (!attr) return '';
  return Array.from(attr).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
}

/**
 * Export the current layout: only entries currently rendered in the UI.
 * Each exported entry contains: index, id, label, segments[] (plain editable strings).
 */
export function handleExportJson() {
  if (!state.bmgFile) {
    showMessage('No file loaded', 'warning');
    return;
  }

  try {
    const layout = [];

    for (let idx = 0; idx < state.bmgFile.messages.length; idx++) {
      const msg = state.bmgFile.messages[idx];
      if (!msg) continue;

      const segments = parseMessageSegments(msg.text || '').map(seg => seg.text);

      layout.push({
        index: idx,
        segments
      });
    }

    const out = { layout };
    const json = JSON.stringify(out, null, 2);
    const filename = (state.fileName || 'layout-export').replace(/\.bmg$/i, '') + '.layout.json';
    downloadStringAsFile(json, filename);
    showMessage(`Layout exported (${layout.length} entries)`, 'info');
  } catch (err) {
    console.error('Export layout failed:', err);
    showMessage(`Export failed: ${err.message}`, 'error');
  }
}

export function handleImportJsonClick() {
  const input = (els && els.importJsonInput) ? els.importJsonInput : document.getElementById('import-json-input');
  if (!input) {
    showMessage('Import input element not found', 'error');
    return;
  }
  input.value = '';
  input.click();
}

/**
 * Import layout JSON and apply to visible entry cards.
 * Behavior: for each imported entry, find the card by data-index and update its textareas
 * with the provided `segments` strings. Reconstruct message.text using original startTags
 * so tags are preserved. Update UI highlights, char counts and modified badges.
 */
export async function handleImportJsonFile(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (!state.bmgFile) {
    showMessage('Please load a BMG file first before importing JSON', 'warning');
    if (event && event.target) event.target.value = '';
    return;
  }

  try {
    showMessage('Reading JSON...', 'info');
    const text = await file.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error('Invalid JSON: ' + e.message);
    }

    const imported = Array.isArray(parsed.layout) ? parsed.layout : (Array.isArray(parsed) ? parsed : null);
    if (!imported) throw new Error('Unsupported JSON format: expected { layout } or an array');

    let applied = 0;
    let modified = 0;
    for (const entry of imported) {
      if (!entry || typeof entry !== 'object') continue;
      const idx = entry.index;
      if (typeof idx !== 'number' || Number.isNaN(idx)) continue;

      const dst = state.bmgFile.messages[idx];
      if (!dst) continue;

      const card = (els && els.entries) ? els.entries.querySelector(`.entry-card[data-index="${idx}"]`) : document.querySelector(`.entry-card[data-index="${idx}"]`);

      let entryModified = false;

      // Compare and update segments
      if (Array.isArray(entry.segments)) {
        const currentSegments = parseMessageSegments(dst.text || '');
        const importedSegments = entry.segments.map(s => typeof s === 'string' ? s : (s && s.text ? s.text : ''));

        // Check if segments differ
        const segmentsChanged = currentSegments.length !== importedSegments.length ||
          currentSegments.some((orig, i) => {
            const imp = importedSegments[i] || '';
            return (orig ? orig.text : '') !== imp;
          });

        // Decide authoritative action based on full text equality rather than
        // naive per-segment differences. If the joined imported segments equal
        // the current full message text we only need to re-render the UI to
        // reflect segmentation changes but we must NOT mark the message as
        // modified (dirty) unless the full text actually differs from the
        // original text.
        const importedFullText = importedSegments.join('');
        const currentFullText = dst.text || '';

        // If the full text differs, we consider the message modified and
        // replace the message text. If full text is identical but segment
        // boundaries differ, update the text (same value) so renderEntries()
        // will rebuild the correct number of segments without marking dirty.
        if (currentFullText !== importedFullText) {
          entryModified = true;
          dst.text = importedFullText;
        } else if (segmentsChanged) {
          // Full text unchanged but segmentation changed: update dst.text to
          // the same value to ensure the UI re-parses and re-creates
          // textareas, but do not count this as a modification.
          dst.text = importedFullText;
        }
      }

      if (entryModified) {
        modified++;
        // Update UI small parts
        if (card) {
          const charCount = card.querySelector('.char-count');
          if (charCount) charCount.textContent = `${dst.text.length} chars`;

          const isDirty = dst.text !== dst._originalText;
          card.classList.toggle('modified', isDirty);
          const badges = card.querySelector('.badges');
          if (badges) {
            const existing = badges.querySelector('.badge-warning');
            if (isDirty && !existing) {
              const mod = document.createElement('span');
              mod.className = 'badge badge-warning';
              mod.textContent = 'Modified';
              badges.insertBefore(mod, badges.firstChild);
            } else if (!isDirty && existing) existing.remove();
          }

          const revertBtn = card.querySelector('.revert');
          if (revertBtn) revertBtn.disabled = !isDirty;
        }
      }

      applied++;
    }

    if (event && event.target) event.target.value = '';
    updateSaveButton();
    renderEntries();
    showMessage(`Imported ${applied} entries, ${modified} modified`, 'info');
  } catch (err) {
    console.error('Import failed:', err);
    showMessage(`Import failed: ${err.message}`, 'error');
    if (event && event.target) event.target.value = '';
  }
}

export default { handleExportJson, handleImportJsonClick, handleImportJsonFile };
