/**
 * Global application state - Following AeonMSBT architecture
 * Simplified to work with BmgFile class from bmg-format.js
 */

// DOM helpers
const $ = (selector) => (typeof document !== 'undefined') ? document.querySelector(selector) : null;

// DOM element references
const els = {
  fileInput: null,
  fileLabel: null,
  fileMeta: null,
  search: null,
  entries: null,
  entryCount: null,
  download: null,
  exportJson: null,
  importJson: null,
  importJsonInput: null,
  filterEmpty: null,
  filterModified: null,
  filterSingle: null,
  filterSequenced: null
};

// Application state - matches AeonSake.NintendoTools.FileFormats.Bmg.BmgFile
const state = {
  fileName: '',
  bmgFile: null,        // BmgFile instance from bmg-format.js
  filter: '',           // Search/filter text
  message: '',          // Status message
  messageTone: 'info',  // 'info', 'warning', 'error'
  modifiedEntries: new Set()  // Track modified message indices
};

export { $, els, state };
