import { state, els } from './state.js';
import {
  handleFileSelection,
  handleDownload,
  handleExportJson,
  handleImportJsonClick,
  handleImportJsonFile
} from './io.js';

let currentGameConfig = null;
let getSpecialTokenInfo = () => null;

export async function loadGameConfig(gameName) {
  if (!gameName) {
    currentGameConfig = null;
    return null;
  }
  try {
    const mod = await import(`../game/${gameName}/${gameName}.js`);
    currentGameConfig = mod;
    return mod;
  } catch (e) {
    currentGameConfig = null;
    return null;
  }
}

export function getCurrentGameConfig() {
  return currentGameConfig;
}

export function setSpecialTokenApi(fn) {
  getSpecialTokenInfo = fn || (() => null);
}

// Convert internal tag forms (e.g. [FF:0:0200]) to the user-facing display form ([Color:0200])
function normalizeTagForDisplay(tag) {
  const m = /^\[FF:0:([0-9A-F]{1,4})\]$/i.exec(tag);
  if (m) return `[Color:${m[1].toUpperCase().padStart(4, '0')}]`;
  return tag;
}

function formatForDisplay(text) {
  if (!text) return text;
  return String(text).replace(/\[FF:0:([0-9A-F]{1,4})\]/gi, (_, h) => `[Color:${h.toUpperCase().padStart(4, '0')}]`);
}

export function init() {
  els.fileInput = document.getElementById('file-input');
  els.fileLabel = document.getElementById('file-label');
  els.search = document.getElementById('search');
  els.entries = document.getElementById('entries');
  els.entryCount = document.getElementById('entry-count');
  els.download = document.getElementById('download');
  els.exportJson = document.getElementById('export-json');
  els.importJson = document.getElementById('import-json');
  els.importJsonInput = document.getElementById('import-json-input');
  els.fileMeta = document.getElementById('file-meta');
  els.statusInfo = document.getElementById('status-info');
  els.filterEmpty = document.getElementById('filter-empty');
  els.filterModified = document.getElementById('filter-modified');
  els.filterSingle = document.getElementById('filter-single');

  if (els.fileInput) els.fileInput.addEventListener('change', handleFileSelection);
  if (els.search) els.search.addEventListener('input', handleFilter);
  if (els.filterEmpty) els.filterEmpty.addEventListener('change', () => renderEntries());
  if (els.filterModified) els.filterModified.addEventListener('change', () => renderEntries());
  if (els.filterSingle) els.filterSingle.addEventListener('change', () => renderEntries());
  if (els.download) els.download.addEventListener('click', handleDownload);
  if (els.exportJson) els.exportJson.addEventListener('click', handleExportJson);
  if (els.importJson) els.importJson.addEventListener('click', handleImportJsonClick);
  if (els.importJsonInput) els.importJsonInput.addEventListener('change', handleImportJsonFile);

  resetUi();
}

export function renderEntries() {
  if (!state.bmgFile) {
    els.entries.innerHTML = '';
    updateEntryCount(0);
    return;
  }

  const messages = state.bmgFile.messages;
  const filteredMessages = messages.filter(matchesFilter);

  els.entries.innerHTML = '';
  const fragment = document.createDocumentFragment();

  filteredMessages.forEach((message, displayIndex) => {
    const card = createEntryCard(message, displayIndex);
    fragment.appendChild(card);
  });

  els.entries.appendChild(fragment);
  updateEntryCount(filteredMessages.length, messages.length);
}

function createEntryCard(message, displayIndex) {
  const card = document.createElement('article');
  card.className = 'entry-card';
  card.dataset.index = message._index;

  if (message.dirty) card.classList.add('modified');

  const header = document.createElement('header');
  header.className = 'entry-heading';

  const title = document.createElement('h3');
  title.textContent = `Message ${message._index}`;

  const badges = document.createElement('div');
  badges.className = 'badges';

  if (message.dirty) badges.appendChild(createBadge('Modified', 'warning'));
  if (state.bmgFile.hasMid1) badges.appendChild(createBadge(`ID: ${message.id}`, 'info'));
  if (state.bmgFile.hasStr1 && message.label) badges.appendChild(createBadge(`Label: ${formatForDisplay(message.label)}`, 'info'));

  header.appendChild(title);
  header.appendChild(badges);
  card.appendChild(header);

  const segments = [{ text: formatForDisplay(message.text || ''), groupId: null }];
  segments.forEach((segment, segmentIndex) => {
    const segmentContainer = document.createElement('div');
    segmentContainer.className = 'segment-container';
    if (segment.groupId !== null) segmentContainer.dataset.groupId = segment.groupId;

    const label = document.createElement('label');
    label.className = 'entry-editor segment-editor';

    const textareaContainer = document.createElement('div');
    textareaContainer.className = 'editor-shell';

    const highlight = document.createElement('pre');
    highlight.className = 'text-highlight';
    highlight.setAttribute('aria-hidden', 'true');
    updateTextHighlight(highlight, segment.text);

    const textarea = document.createElement('textarea');
    textarea.spellcheck = false;
    textarea.value = segment.text;
    textarea.dataset.index = message._index;
    textarea.dataset.segmentIndex = segmentIndex;
    textarea.rows = Math.max(2, (segment.text || '').split('\n').length);

    textarea.addEventListener('input', (e) => {
      // record per-entry undo action (previous -> next) so Ctrl+Z inside this entry walks this message's history
      const prev = message.text;
      const next = e.target.value;
      if (prev !== next) {
        const msgRef = message;
        pushEntryAction(message._index, {
          undo: () => { const m = state.bmgFile?.messages.find(x => x === msgRef); if (m) { m.text = prev; renderEntries(); updateSaveButton(); } },
          redo: () => { const m = state.bmgFile?.messages.find(x => x === msgRef); if (m) { m.text = next; renderEntries(); updateSaveButton(); } }
        });
      }

      message.text = next;
      updateTextHighlight(highlight, next);

      if (message.dirty && !card.classList.contains('modified')) {
        card.classList.add('modified');
        const badges = card.querySelector('.badges');
        if (badges && !badges.querySelector('.badge-warning')) {
          const modifiedBadge = createBadge('Modified', 'warning');
          badges.insertBefore(modifiedBadge, badges.firstChild);
        }
      } else if (!message.dirty && card.classList.contains('modified')) {
        card.classList.remove('modified');
        const badges = card.querySelector('.badges');
        const modifiedBadge = badges?.querySelector('.badge-warning');
        if (modifiedBadge) modifiedBadge.remove();
      }

      updateSaveButton();

      const charCount = card.querySelector('.char-count');
      if (charCount) charCount.textContent = `${message.text.length} chars`;
    });

    textarea.addEventListener('scroll', (e) => {
      highlight.scrollTop = e.target.scrollTop;
      highlight.scrollLeft = e.target.scrollLeft;
    });

    // Track edits for undo/redo
    let editStartText = segment.text;
    textarea.addEventListener('focus', () => {
      editStartText = message.text;
    });
    textarea.addEventListener('blur', () => {
      // keep editStartText in sync; per-entry history is recorded on input events so
      // we no longer push a global undo action for text edits here.
      editStartText = message.text;
    });

    textareaContainer.appendChild(highlight);
    textareaContainer.appendChild(textarea);
    label.appendChild(textareaContainer);
    segmentContainer.appendChild(label);

    card.appendChild(segmentContainer);
  });

  const actions = document.createElement('div');
  actions.className = 'entry-actions';

  const helper = document.createElement('div');
  helper.className = 'entry-helper';

  const charCount = document.createElement('span');
  charCount.className = 'char-count';
  charCount.textContent = `${formatForDisplay(message.text || '').length} chars`;
  helper.appendChild(charCount);

  const offset = document.createElement('span');
  offset.className = 'offset';
  offset.textContent = `Offset: 0x${message._offset.toString(16).padStart(4, '0').toUpperCase()}`;
  helper.appendChild(offset);

  if (message.attribute.length > 0) {
    const attr = document.createElement('span');
    attr.className = 'attr';
    const attrHex = Array.from(message.attribute)
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    attr.textContent = `Attr: ${attrHex}`;
    helper.appendChild(attr);
  }

  actions.appendChild(helper);

  const btnGroup = document.createElement('div');
  btnGroup.className = 'entry-btn-group';

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'ghost delete-msg';
  deleteBtn.innerHTML = '<i class="fas fa-trash-alt"></i>';
  deleteBtn.title = 'Delete message';
  deleteBtn.addEventListener('click', () => openDeleteConfirmModal(message._index));
  btnGroup.appendChild(deleteBtn);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'ghost edit-msg';
  editBtn.innerHTML = '<i class="fas fa-pen"></i>';
  editBtn.title = 'Edit message';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showEditDropdown(editBtn, message._index);
  });
  btnGroup.appendChild(editBtn);

  const revertBtn = document.createElement('button');
  revertBtn.type = 'button';
  revertBtn.className = 'ghost revert';
  revertBtn.textContent = 'Revert';
  revertBtn.disabled = !message.dirty;
  revertBtn.addEventListener('click', () => {
    const prev = message.text;
    const next = message._originalText || '';
    const msgRef = message;
    pushEntryAction(message._index, {
      undo: () => { const m = state.bmgFile?.messages.find(x => x === msgRef); if (m) { m.text = prev; renderEntries(); updateSaveButton(); } },
      redo: () => { const m = state.bmgFile?.messages.find(x => x === msgRef); if (m) { m.text = next; renderEntries(); updateSaveButton(); } }
    });
    message.text = next;
    const newCard = createEntryCard(message, message._index + 1);
    card.replaceWith(newCard);
  });
  btnGroup.appendChild(revertBtn);

  actions.appendChild(btnGroup);

  card.appendChild(actions);

  return card;
}

function createBadge(text, variant = 'default') {
  const badge = document.createElement('span');
  badge.className = `badge badge-${variant}`;
  badge.textContent = text;
  return badge;
}

function updateTextHighlight(element, text) {
  if (!text || text.trim() === '') {
    element.classList.add('highlight-empty');
    element.textContent = 'Empty';
    return;
  }

  element.classList.remove('highlight-empty');

  const tagRegex = /\[Color:[0-9A-F]+\]|\[(@?)([0-9A-F]+):([0-9A-F]+)(?::([0-9A-F]+))?\]|\{\{@([0-9A-F]{1,2}):([0-9A-F]{1,4})(?::([0-9A-F]+))?\}\}|\{\{@?(\d+):(\d+)(?:\s+(?:arg=")?([a-fA-F0-9]+)"?)?\}\}/gi;
  let lastIndex = 0;
  let activeTextClass = '';
  const fragment = document.createDocumentFragment();
  let match;

  const appendTextSegment = (segmentText) => {
    if (!segmentText) return;
    if (activeTextClass) {
      const span = document.createElement('span');
      span.className = activeTextClass;
      span.textContent = segmentText;
      fragment.appendChild(span);
    } else {
      const textNode = document.createTextNode(segmentText);
      fragment.appendChild(textNode);
    }
  };

  while ((match = tagRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendTextSegment(text.slice(lastIndex, match.index));
    }

    const tagSpan = document.createElement('span');
    tagSpan.className = 'token-chip';

      const displayToken = normalizeTagForDisplay(match[0]);
    const specialInfo = getSpecialTokenInfo(displayToken);
    if (specialInfo) {
      tagSpan.classList.add('special');
      if (specialInfo.cls) tagSpan.classList.add(specialInfo.cls);
      tagSpan.title = specialInfo.name || specialInfo.argHex || displayToken;
      if (specialInfo.textCls) {
        activeTextClass = specialInfo.textCls;
      } else {
        activeTextClass = '';
      }
    } else {
      tagSpan.classList.add('jaune');
    }
    tagSpan.textContent = specialInfo && specialInfo.label ? specialInfo.label : displayToken;
    fragment.appendChild(tagSpan);

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    appendTextSegment(text.slice(lastIndex));
  }

  element.replaceChildren(fragment);
}

function matchesFilter(message) {
  const showEmpty = els.filterEmpty ? els.filterEmpty.checked : false;
  if (!showEmpty && (!message.text || message.text.trim() === '')) return false;

  const showModified = els.filterModified ? els.filterModified.checked : true;
  if (!showModified && message.dirty) return false;

  const query = state.filter.trim().toLowerCase();
  if (!query) return true;

  const dispText = formatForDisplay(message.text || '');
  if (dispText.toLowerCase().includes(query)) return true;
  const dispLabel = formatForDisplay(message.label || '');
  if (dispLabel && dispLabel.toLowerCase().includes(query)) return true;

  return false;
}

function handleFilter(event) {
  state.filter = event.target.value;
  renderEntries();
}

function updateEntryCount(filtered, total) {
  if (!total) total = filtered;
  els.entryCount.textContent = `${filtered} / ${total} messages`;
}

export function updateSaveButton() {
  if (!state.bmgFile) {
    els.download.disabled = true;
    return;
  }

  els.download.disabled = false;
}

export function updateMeta() {
  if (!state.bmgFile) {
    els.fileMeta.innerHTML = '';
    return;
  }

  const messageCount = state.bmgFile.messages.length;
  const encoding = state.bmgFile.encodingType;
  const hasMid1 = state.bmgFile.hasMid1 ? 'Yes' : 'No';
  const hasStr1 = state.bmgFile.hasStr1 ? 'Yes' : 'No';

  els.fileMeta.innerHTML = `
    <div class="meta-lines">
      <div class="meta-block">
        <strong>Messages:</strong> ${messageCount} &nbsp;|&nbsp;
        <strong>Encoding:</strong> ${encoding} &nbsp;|&nbsp;
        <strong>MID1:</strong> ${hasMid1} &nbsp;|&nbsp;
        <strong>STR1:</strong> ${hasStr1}
      </div>
    </div>
  `.trim();
}

export function showMessage(text, tone = 'info') {
  state.message = text;
  state.messageTone = tone;
  if (els.statusInfo) {
    els.statusInfo.innerHTML = text
      ? `<span class="status status-${tone}">${text}</span>`
      : '';
  }
}

export function resetUi() {
  state.fileName = '';
  state.bmgFile = null;
  state.filter = '';
  state.message = '';
  state.messageTone = 'info';

  els.fileLabel.textContent = 'No file selected';
  els.search.value = '';
  els.search.disabled = true;
  els.entries.innerHTML = '';
  els.entryCount.textContent = '0 messages';
  els.download.disabled = true;
  els.exportJson.disabled = true;
  els.importJson.disabled = true;
  els.fileMeta.innerHTML = '';
  if (els.statusInfo) els.statusInfo.innerHTML = '';

  if (els.filterEmpty) els.filterEmpty.checked = true;
  if (els.filterModified) els.filterModified.checked = true;
}

// --- Delete confirmation modal ---
let pendingDeleteIndex = null;

function openDeleteConfirmModal(index) {
  pendingDeleteIndex = index;
  const modal = document.getElementById('delete-confirm-modal');
  if (modal) modal.classList.add('open');
}

function closeDeleteConfirmModal() {
  pendingDeleteIndex = null;
  const modal = document.getElementById('delete-confirm-modal');
  if (modal) modal.classList.remove('open');
}

function confirmDelete() {
  if (pendingDeleteIndex !== null) {
    const idx = pendingDeleteIndex;
    closeDeleteConfirmModal();
    // Find the card in the DOM and animate it out
    const card = els.entries?.querySelector(`.entry-card[data-index="${idx}"]`);
    if (card) {
      card.style.maxHeight = card.offsetHeight + 'px';
      // Force reflow then add class
      void card.offsetHeight;
      card.classList.add('removing');
      card.addEventListener('transitionend', () => {
        deleteMessage(idx);
      }, { once: true });
    } else {
      deleteMessage(idx);
    }
  } else {
    closeDeleteConfirmModal();
  }
}

// --- Undo / Redo system (unified: each action = { undo, redo }) ---
export function pushUndo(action) {
  state.undoStack.push(action);
  state.redoStack.length = 0;
  updateUndoRedoButtons();
}

export function undo() {
  const action = state.undoStack.pop();
  if (!action) return;
  action.undo();
  state.redoStack.push(action);
  updateUndoRedoButtons();
}

export function redo() {
  const action = state.redoStack.pop();
  if (!action) return;
  action.redo();
  state.undoStack.push(action);
  updateUndoRedoButtons();
}

export function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('toolbar-undo');
  const redoBtn = document.getElementById('toolbar-redo');
  if (undoBtn) undoBtn.disabled = state.undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
}

// --- Per-entry (message) undo/redo ---
// Each message keeps its own stack of actions ({ undo, redo }).
const MAX_ENTRY_HISTORY = 300;

function ensureEntryHistory(msg) {
  if (!msg) return;
  if (!msg._entryUndo) msg._entryUndo = [];
  if (!msg._entryRedo) msg._entryRedo = [];
}

export function pushEntryAction(index, action) {
  if (!state.bmgFile) return;
  const msg = state.bmgFile.messages[index];
  if (!msg) return;
  ensureEntryHistory(msg);
  msg._entryUndo.push(action);
  if (msg._entryUndo.length > MAX_ENTRY_HISTORY) msg._entryUndo.shift();
  msg._entryRedo.length = 0;
}

export function entryUndo(index) {
  if (!state.bmgFile) return;
  const msg = state.bmgFile.messages[index];
  if (!msg || !msg._entryUndo || msg._entryUndo.length === 0) return;
  const action = msg._entryUndo.pop();
  action.undo?.();
  msg._entryRedo.push(action);
  renderEntries();
  updateSaveButton();
}

export function entryRedo(index) {
  if (!state.bmgFile) return;
  const msg = state.bmgFile.messages[index];
  if (!msg || !msg._entryRedo || msg._entryRedo.length === 0) return;
  const action = msg._entryRedo.pop();
  action.redo?.();
  msg._entryUndo.push(action);
  renderEntries();
  updateSaveButton();
}

// --- Delete message ---
function deleteMessage(index) {
  if (!state.bmgFile) return;
  const msg = state.bmgFile.messages[index];
  if (!msg) return;
  const bmg = state.bmgFile;
  bmg.messages.splice(index, 1);
  reindexMessages();
  const refresh = () => { reindexMessages(); renderEntries(); updateSaveButton(); updateMeta(); };
  pushUndo({
    undo: () => { bmg.messages.splice(index, 0, msg); refresh(); },
    redo: () => { const i = bmg.messages.indexOf(msg); if (i !== -1) bmg.messages.splice(i, 1); refresh(); }
  });
  renderEntries();
  updateSaveButton();
  updateMeta();
  showMessage(`Message ${index} deleted`, 'info');
}

// --- Create message (via modal) ---
export function openNewMessageModal() {
  if (!state.bmgFile) {
    showMessage('Load a BMG file first', 'warning');
    return;
  }
  const modal = document.getElementById('new-msg-modal');
  const input = document.getElementById('new-msg-id-input');
  const error = document.getElementById('new-msg-id-error');
  if (!modal) return;

  // Pre-fill with smallest available ID
  const usedIds = new Set(state.bmgFile.messages.map(m => m.id));
  let nextId = 0;
  while (usedIds.has(nextId)) nextId++;
  input.value = String(nextId);

  error.textContent = '';
  error.style.display = 'none';

  // Set defaults for text and attribute fields
  const textInput = document.getElementById('new-msg-text-input');
  const attrInput = document.getElementById('new-msg-attr-input');
  const attrSizeInput = document.getElementById('new-msg-attr-size');
  const attrError = document.getElementById('new-msg-attr-error');
  const defaultAttrSize = 8;
  if (textInput) textInput.value = '';
  if (attrSizeInput) attrSizeInput.value = defaultAttrSize;
  if (attrInput) {
    attrInput.value = Array(defaultAttrSize).fill('00').join(' ');
    attrInput.placeholder = Array(defaultAttrSize).fill('00').join(' ');
  }
  if (attrError) { attrError.textContent = ''; attrError.style.display = 'none'; }

  modal.classList.add('open');
  input.focus();
  input.select();
}

export function closeNewMessageModal() {
  const modal = document.getElementById('new-msg-modal');
  if (modal) modal.classList.remove('open');
}

export function confirmNewMessage() {
  const input = document.getElementById('new-msg-id-input');
  const error = document.getElementById('new-msg-id-error');
  const raw = input.value.trim();

  if (!/^\d+$/.test(raw)) {
    error.textContent = 'ID must be a positive integer.';
    error.style.display = 'block';
    return;
  }
  const id = parseInt(raw, 10);
  if (state.bmgFile.messages.some(m => m.id === id)) {
    error.textContent = `ID ${id} already exists.`;
    error.style.display = 'block';
    return;
  }

  // Insert at the correct position sorted by ID
  const msgs = state.bmgFile.messages;
  let insertIndex = msgs.length;
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].id > id) { insertIndex = i; break; }
  }

  // Read text from modal
  const textInput = document.getElementById('new-msg-text-input');
  const messageText = textInput ? textInput.value : '';

  // Read attribute from modal (default to zeros)
  const attrSizeInput = document.getElementById('new-msg-attr-size');
  const attrInput = document.getElementById('new-msg-attr-input');
  const attrSize = attrSizeInput ? parseInt(attrSizeInput.value, 10) || 8 : 8;
  const attribute = parseHexAttribute(attrInput ? attrInput.value : '', attrSize);

  // Place after all existing DAT1 data
  const newOffset = state.bmgFile._dat1DataSize || 0;
  state.bmgFile._dat1DataSize = newOffset + 4;
  const msg = {
    id,
    label: '',
    attribute,
    text: messageText,
    _originalText: null,
    _offset: newOffset,
    _index: 0,
    _tagBytesMap: new Map(),
    get dirty() { return true; }
  };
  msgs.splice(insertIndex, 0, msg);
  reindexMessages();
  const bmg = state.bmgFile;
  const refresh = () => { reindexMessages(); renderEntries(); updateSaveButton(); updateMeta(); };
  pushUndo({
    undo: () => { const i = bmg.messages.indexOf(msg); if (i !== -1) bmg.messages.splice(i, 1); refresh(); },
    redo: () => { bmg.messages.splice(insertIndex, 0, msg); refresh(); }
  });
  closeNewMessageModal();
  renderEntries();
  updateSaveButton();
  updateMeta();
  showMessage(`Message created (ID: ${id})`, 'info');

  // Scroll to the new message card
  requestAnimationFrame(() => {
    const card = els.entries?.querySelector(`.entry-card[data-index="${msg._index}"]`);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

// --- Hex attribute helpers ---
function parseHexAttribute(hexStr, size) {
  const raw = hexStr.replace(/[^0-9a-fA-F]/g, '');
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const hex = raw.slice(i * 2, i * 2 + 2);
    bytes[i] = hex.length === 2 ? parseInt(hex, 16) : 0;
  }
  return bytes;
}

function formatHexField(input, maxBytes) {
  const pos = input.selectionStart;
  const oldVal = input.value;
  let hexBeforeCursor = 0;
  for (let i = 0; i < pos && i < oldVal.length; i++) {
    if (/[0-9a-fA-F]/i.test(oldVal[i])) hexBeforeCursor++;
  }
  const raw = oldVal.replace(/[^0-9a-fA-F]/g, '').slice(0, maxBytes * 2).toUpperCase();
  const formatted = raw.match(/.{1,2}/g)?.join(' ') || '';
  input.value = formatted;
  let newPos = 0, count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[0-9a-fA-F]/i.test(formatted[i])) {
      count++;
      if (count >= hexBeforeCursor) { newPos = i + 1; break; }
    }
  }
  if (count < hexBeforeCursor) newPos = formatted.length;
  input.setSelectionRange(newPos, newPos);
}

function setupHexAutoFormat(inputId, sizeInputId) {
  const input = document.getElementById(inputId);
  const sizeInput = document.getElementById(sizeInputId);
  if (!input || !sizeInput) return;
  input.addEventListener('input', () => {
    const maxBytes = parseInt(sizeInput.value, 10) || 8;
    formatHexField(input, maxBytes);
  });
  sizeInput.addEventListener('input', () => {
    const maxBytes = parseInt(sizeInput.value, 10) || 8;
    formatHexField(input, maxBytes);
    input.placeholder = Array(maxBytes).fill('00').join(' ');
  });
}

// --- Edit dropdown ---
function showEditDropdown(anchor, messageIndex) {
  document.querySelectorAll('.edit-dropdown').forEach(d => d.remove());
  const dropdown = document.createElement('div');
  dropdown.className = 'edit-dropdown';

  const changeIdBtn = document.createElement('button');
  changeIdBtn.className = 'edit-dropdown-item';
  changeIdBtn.innerHTML = '<i class="fas fa-hashtag"></i> Change ID';
  changeIdBtn.addEventListener('click', () => { dropdown.remove(); openEditIdModal(messageIndex); });

  const changeAttrBtn = document.createElement('button');
  changeAttrBtn.className = 'edit-dropdown-item';
  changeAttrBtn.innerHTML = '<i class="fas fa-sliders-h"></i> Change Attribute';
  changeAttrBtn.addEventListener('click', () => { dropdown.remove(); openEditAttrModal(messageIndex); });

  dropdown.appendChild(changeIdBtn);
  dropdown.appendChild(changeAttrBtn);

  anchor.parentElement.style.position = 'relative';
  anchor.parentElement.appendChild(dropdown);

  const closeHandler = (e) => {
    if (!dropdown.contains(e.target) && e.target !== anchor) {
      dropdown.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

// --- Edit ID modal ---
let pendingEditIdIndex = null;

function openEditIdModal(index) {
  if (!state.bmgFile) return;
  const msg = state.bmgFile.messages[index];
  if (!msg) return;
  pendingEditIdIndex = index;
  const modal = document.getElementById('edit-id-modal');
  const input = document.getElementById('edit-id-input');
  const error = document.getElementById('edit-id-error');
  const confirmBtn = document.getElementById('edit-id-confirm');
  if (!modal) return;
  input.value = String(msg.id);
  error.textContent = '';
  error.style.display = 'none';
  if (confirmBtn) confirmBtn.disabled = false;
  modal.classList.add('open');
  input.focus();
  input.select();
}

function closeEditIdModal() {
  pendingEditIdIndex = null;
  const modal = document.getElementById('edit-id-modal');
  if (modal) modal.classList.remove('open');
}

function confirmEditId() {
  if (pendingEditIdIndex === null || !state.bmgFile) return;
  const msg = state.bmgFile.messages[pendingEditIdIndex];
  if (!msg) return;
  const input = document.getElementById('edit-id-input');
  const error = document.getElementById('edit-id-error');
  const raw = input.value.trim();
  if (!/^\d+$/.test(raw)) {
    error.textContent = 'ID must be a positive integer.';
    error.style.display = 'block';
    return;
  }
  const newId = parseInt(raw, 10);
  if (newId !== msg.id && state.bmgFile.messages.some(m => m.id === newId)) {
    error.textContent = `ID ${newId} already exists.`;
    error.style.display = 'block';
    return;
  }
  const oldId = msg.id;
  msg.id = newId;
  const refresh = () => { reindexMessages(); renderEntries(); updateSaveButton(); updateMeta(); };
  // per-entry undo for ID change
  pushEntryAction(pendingEditIdIndex, {
    undo: () => { const m = state.bmgFile?.messages[pendingEditIdIndex]; if (m) { m.id = oldId; refresh(); } },
    redo: () => { const m = state.bmgFile?.messages[pendingEditIdIndex]; if (m) { m.id = newId; refresh(); } }
  });
  closeEditIdModal();
  renderEntries();
  updateSaveButton();
  showMessage(`Message ID changed from ${oldId} to ${newId}`, 'info');
}

// --- Edit Attribute modal ---
let pendingEditAttrIndex = null;

function openEditAttrModal(index) {
  if (!state.bmgFile) return;
  const msg = state.bmgFile.messages[index];
  if (!msg) return;
  pendingEditAttrIndex = index;
  const modal = document.getElementById('edit-attr-modal');
  const input = document.getElementById('edit-attr-input');
  const sizeInput = document.getElementById('edit-attr-size');
  const error = document.getElementById('edit-attr-error');
  if (!modal) return;
  const currentAttrSize = msg.attribute.length || 8;
  if (sizeInput) sizeInput.value = currentAttrSize;
  if (input) {
    const hexStr = Array.from(msg.attribute).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
    input.value = hexStr;
    input.placeholder = Array(currentAttrSize).fill('00').join(' ');
  }
  if (error) { error.textContent = ''; error.style.display = 'none'; }
  modal.classList.add('open');
  if (input) { input.focus(); input.select(); }
}

function closeEditAttrModal() {
  pendingEditAttrIndex = null;
  const modal = document.getElementById('edit-attr-modal');
  if (modal) modal.classList.remove('open');
}

function confirmEditAttr() {
  if (pendingEditAttrIndex === null || !state.bmgFile) return;
  const msg = state.bmgFile.messages[pendingEditAttrIndex];
  if (!msg) return;
  const input = document.getElementById('edit-attr-input');
  const sizeInput = document.getElementById('edit-attr-size');
  const attrSize = sizeInput ? parseInt(sizeInput.value, 10) || 8 : msg.attribute.length;
  const newAttribute = parseHexAttribute(input ? input.value : '', attrSize);
  const oldAttribute = new Uint8Array(msg.attribute);
  msg.attribute = newAttribute;
  const idx = pendingEditAttrIndex;
  const refresh = () => { renderEntries(); updateSaveButton(); };
  // per-entry undo for attribute change
  pushEntryAction(pendingEditAttrIndex, {
    undo: () => { const m = state.bmgFile?.messages[pendingEditAttrIndex]; if (m) { m.attribute = oldAttribute; refresh(); } },
    redo: () => { const m = state.bmgFile?.messages[pendingEditAttrIndex]; if (m) { m.attribute = newAttribute; refresh(); } }
  });
  closeEditAttrModal();
  renderEntries();
  updateSaveButton();
  showMessage(`Attribute updated for message ${idx}`, 'info');
}

function reindexMessages() {
  if (!state.bmgFile) return;
  state.bmgFile.messages.forEach((m, i) => { m._index = i; });
}

// --- Toolbar init ---
export function initToolbar() {
  const undoBtn = document.getElementById('toolbar-undo');
  const redoBtn = document.getElementById('toolbar-redo');
  const newBtn = document.getElementById('toolbar-new');

  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (redoBtn) redoBtn.addEventListener('click', redo);
  if (newBtn) newBtn.addEventListener('click', openNewMessageModal);

  // Modal events
  const modalCancel = document.getElementById('new-msg-cancel');
  const modalConfirm = document.getElementById('new-msg-confirm');
  const overlay = document.getElementById('new-msg-modal');
  const input = document.getElementById('new-msg-id-input');

  if (modalCancel) modalCancel.addEventListener('click', closeNewMessageModal);
  if (modalConfirm) modalConfirm.addEventListener('click', confirmNewMessage);
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) closeNewMessageModal(); });
  if (input) {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmNewMessage(); if (e.key === 'Escape') closeNewMessageModal(); });
    // Live validation
    input.addEventListener('input', () => {
      const error = document.getElementById('new-msg-id-error');
      const confirmBtn = document.getElementById('new-msg-confirm');
      const raw = input.value.trim();
      if (!raw) { error.style.display = 'none'; if (confirmBtn) confirmBtn.disabled = false; return; }
      if (!/^\d+$/.test(raw)) {
        error.textContent = 'ID must be a positive integer.';
        error.style.display = 'block';
        if (confirmBtn) confirmBtn.disabled = true;
        return;
      }
      const id = parseInt(raw, 10);
      if (state.bmgFile && state.bmgFile.messages.some(m => m.id === id)) {
        error.textContent = `ID ${id} already exists.`;
        error.style.display = 'block';
        if (confirmBtn) confirmBtn.disabled = true;
      } else {
        error.style.display = 'none';
        if (confirmBtn) confirmBtn.disabled = false;
      }
    });
  }

  // Delete confirmation modal events
  const deleteModalCancel = document.getElementById('delete-confirm-cancel');
  const deleteModalConfirm = document.getElementById('delete-confirm-confirm');
  const deleteModalOverlay = document.getElementById('delete-confirm-modal');

  if (deleteModalCancel) deleteModalCancel.addEventListener('click', closeDeleteConfirmModal);
  if (deleteModalConfirm) deleteModalConfirm.addEventListener('click', confirmDelete);
  if (deleteModalOverlay) deleteModalOverlay.addEventListener('click', (e) => { if (e.target === deleteModalOverlay) closeDeleteConfirmModal(); });

  // Edit ID modal events
  const editIdCancel = document.getElementById('edit-id-cancel');
  const editIdConfirm = document.getElementById('edit-id-confirm');
  const editIdOverlay = document.getElementById('edit-id-modal');
  const editIdInput = document.getElementById('edit-id-input');
  if (editIdCancel) editIdCancel.addEventListener('click', closeEditIdModal);
  if (editIdConfirm) editIdConfirm.addEventListener('click', confirmEditId);
  if (editIdOverlay) editIdOverlay.addEventListener('click', (e) => { if (e.target === editIdOverlay) closeEditIdModal(); });
  if (editIdInput) {
    editIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmEditId(); if (e.key === 'Escape') closeEditIdModal(); });
    editIdInput.addEventListener('input', () => {
      const error = document.getElementById('edit-id-error');
      const confirm = document.getElementById('edit-id-confirm');
      const raw = editIdInput.value.trim();
      if (!raw) { error.style.display = 'none'; if (confirm) confirm.disabled = false; return; }
      if (!/^\d+$/.test(raw)) {
        error.textContent = 'ID must be a positive integer.';
        error.style.display = 'block';
        if (confirm) confirm.disabled = true;
        return;
      }
      const id = parseInt(raw, 10);
      const currentMsg = pendingEditIdIndex !== null ? state.bmgFile?.messages[pendingEditIdIndex] : null;
      if (state.bmgFile && state.bmgFile.messages.some(m => m.id === id && m !== currentMsg)) {
        error.textContent = `ID ${id} already exists.`;
        error.style.display = 'block';
        if (confirm) confirm.disabled = true;
      } else {
        error.style.display = 'none';
        if (confirm) confirm.disabled = false;
      }
    });
  }

  // Edit Attribute modal events
  const editAttrCancel = document.getElementById('edit-attr-cancel');
  const editAttrConfirm = document.getElementById('edit-attr-confirm');
  const editAttrOverlay = document.getElementById('edit-attr-modal');
  const editAttrInput = document.getElementById('edit-attr-input');
  if (editAttrCancel) editAttrCancel.addEventListener('click', closeEditAttrModal);
  if (editAttrConfirm) editAttrConfirm.addEventListener('click', confirmEditAttr);
  if (editAttrOverlay) editAttrOverlay.addEventListener('click', (e) => { if (e.target === editAttrOverlay) closeEditAttrModal(); });
  if (editAttrInput) {
    editAttrInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmEditAttr(); if (e.key === 'Escape') closeEditAttrModal(); });
  }

  // Setup hex auto-format for attribute inputs
  setupHexAutoFormat('new-msg-attr-input', 'new-msg-attr-size');
  setupHexAutoFormat('edit-attr-input', 'edit-attr-size');

  updateUndoRedoButtons();
}

export { createEntryCard, createBadge, updateTextHighlight };
