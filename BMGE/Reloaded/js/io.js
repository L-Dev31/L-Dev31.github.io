import { state, els } from './state.js';
import { parseBmg } from './bmg-format.js';
import { buildBmg } from './build-bmg.js';
import { renderEntries, updateMeta, showMessage, updateSaveButton } from './ui.js';
import { parseMessageSegments } from './group-segments.js';

/**
 * File I/O Module - Following AeonMSBT architecture
 * Handles loading and saving BMG files
 */

export async function handleFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  
  try {
    showMessage('Loading file...', 'info');
    
    const buffer = await file.arrayBuffer();
    state.bmgFile = parseBmg(buffer);
    state.fileName = file.name;
    
    els.fileLabel.textContent = file.name;
    els.search.disabled = false;
    els.exportJson.disabled = false;
    els.importJson.disabled = false;
    
    showMessage(`Loaded ${state.bmgFile.messages.length} messages successfully`, 'info');
    renderEntries();
    updateMeta();
    updateSaveButton();
    
  } catch (error) {
    console.error('Error loading BMG file:', error);
    showMessage(`Error loading file: ${error.message}`, 'error');
  }
}

export function handleDownload() {
  if (!state.bmgFile) {
    showMessage('No file loaded', 'warning');
    return;
  }
  
  try {
    showMessage('Building BMG file...', 'info');
    
    const buffer = buildBmg(state.bmgFile);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = state.fileName || 'modified.bmg';
    a.click();
    
    URL.revokeObjectURL(url);
    
    showMessage('BMG file downloaded successfully', 'info');
    
  } catch (error) {
    console.error('Error building BMG file:', error);
    showMessage(`Error building BMG: ${error.message}`, 'error');
  }
}

/**
 * UI wrapper: click hidden file input to import JSON
 */
export function handleImportJsonClick() {
  const input = document.getElementById('import-json-input');
  if (!input) return;
  input.value = '';
  input.click();
}

export { handleExportJson, handleImportJsonFile } from './json.js';
