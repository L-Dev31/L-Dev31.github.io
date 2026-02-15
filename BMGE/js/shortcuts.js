import { state, els } from './state.js';
import { handleDownload, handleExportJson, handleImportJsonClick } from './io.js';
import { downloadFolderZip } from './folder.js';
import { undo, redo } from './ui.js';

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

    // Ctrl+Z → Undo (respect native input undo)
    if (ctrl && !e.shiftKey && key === 'z') {
      const active = document.activeElement;
      const tag = active && active.tagName ? active.tagName.toLowerCase() : '';
      const isEditable = active && (tag === 'input' || tag === 'textarea' || active.isContentEditable);
      // If an editable element is focused, let the browser handle undo (preserve native per-message undo)
      if (isEditable) return;
      e.preventDefault();
      undo();
      return;
    }

    // Ctrl+Shift+Z → Redo
    if (ctrl && e.shiftKey && key === 'z') {
      e.preventDefault();
      redo();
      return;
    }
  });
}
