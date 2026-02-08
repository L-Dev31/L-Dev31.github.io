const $ = (selector) => (typeof document !== 'undefined') ? document.querySelector(selector) : null;

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
};

const state = {
  fileName: '',
  bmgFile: null,
  filter: '',
  message: '',
  messageTone: 'info',
  modifiedEntries: new Set(),
  undoStack: [],
  redoStack: []
};

export { $, els, state };
