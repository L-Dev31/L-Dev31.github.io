const $ = (selector) => (typeof document !== 'undefined') ? document.querySelector(selector) : null;

const els = {
  fileInput: $('#file-input'),
  fileLabel: $('#file-label'),
  fileMeta: $('#file-meta'),
  search: $('#search'),
  entries: $('#entries'),
  entryCount: $('#entry-count'),
  download: $('#download'),
  exportJson: $('#export-json'),
  importJson: $('#import-json'),
  importJsonInput: $('#import-json-input'),
  filterInf: $('#filter-inf'),
  filterMid: $('#filter-mid'),
  filterEmpty: $('#filter-empty')
};

const HEX_TOKEN_PATTERN = '[0-9A-F]{2}(?::[0-9A-F]{4}(?:,[0-9A-F]{4})*)?';
const NAMED_TOKEN_PATTERN = '[A-Z][A-Z0-9_]{1,15}';
const SPECIAL_TOKEN_PATTERN = `(?:${HEX_TOKEN_PATTERN}|${NAMED_TOKEN_PATTERN})`;
const LEGACY_TOKEN_REGEX = /🔒([0-9a-fA-F]{2})/g;

const NAMED_TOKEN_ENTRIES = [
  
];

const NAMED_TOKENS = new Map(NAMED_TOKEN_ENTRIES);
const REVERSE_NAMED_TOKENS = new Map(
  NAMED_TOKEN_ENTRIES.map(([code, label]) => [label, code])
);

const CONTROL_CODE_PARAMS = new Map([
  [0x1a, 1],
  [0xff, 2]
]);

const MAX_STRING_READ_LENGTH = 10000;

const ENCODINGS = {
  0x00: 'cp1252',
  0x01: 'utf-16le',
  0x02: 'shift-jis'
};

const state = {
  fileName: '',
  originalBuffer: null,
  bytes: null,
  view: null,
  entries: [],
  infOffset: 0,
  infSize: 0,
  headerBytes: 0,
  entrySize: 0,
  entryCount: 0,
  entryStart: 0,
  datOffset: 0,
  datBase: 0,
  datDeclaredSize: 0,
  datActualSize: 0,
  filter: '',
  message: '',
  messageTone: 'info',
  previewDatSize: 0,
  previewDatPadding: 0,
  bmgType: '',
  encoding: 0,
  sectionsCount: 0,
  fileSize: 0,
  midOffset: -1,
  midSize: 0,
  midEntryCount: 0,
  midEntrySize: 0,
  midColumnCount: 0,
  midReserved: 0,
  midRowCount: 0,
  midEntries: [],
  midIds: [],
  midKind: 'none',
  midStrings: [],
  midGroups: [],
  datSegments: [],
  lastLayout: null
};

export { $, els, HEX_TOKEN_PATTERN, NAMED_TOKEN_PATTERN, SPECIAL_TOKEN_PATTERN, LEGACY_TOKEN_REGEX, NAMED_TOKENS, REVERSE_NAMED_TOKENS, CONTROL_CODE_PARAMS, MAX_STRING_READ_LENGTH, ENCODINGS, state };