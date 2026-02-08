import { state, els } from './state.js';
import { handleDownload, handleExportJson, handleImportJsonClick } from './io.js';
import { downloadFolderZip } from './folder.js';

export function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    // Ctrl+S → Download current BMG
    if (ctrl && key === 's') {
      e.preventDefault();
      if (state.bmgFile) handleDownload();
      return;
    }

    // Ctrl+I → Open BMG file picker
    if (ctrl && key === 'i') {
      e.preventDefault();
      els.fileInput?.click();
      return;
    }

    // Ctrl+J → Export JSON
    if (ctrl && key === 'j') {
      e.preventDefault();
      if (state.bmgFile) handleExportJson();
      return;
    }

    // Shift+J → Import JSON
    if (!ctrl && e.shiftKey && key === 'j') {
      e.preventDefault();
      if (state.bmgFile) handleImportJsonClick();
      return;
    }

    // Shift+S → Download folder as ZIP
    if (!ctrl && e.shiftKey && key === 's') {
      e.preventDefault();
      downloadFolderZip();
      return;
    }
  });
}
