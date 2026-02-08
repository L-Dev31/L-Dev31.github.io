let currentGameConfig = null;
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
import { state, els } from './state.js';
let getSpecialTokenInfo = () => null;
export function setSpecialTokenApi(fn) {
  getSpecialTokenInfo = fn || (() => null);
}
import {
  handleFileSelection,
  handleDownload,
  handleExportJson,
  handleImportJsonClick,
  handleImportJsonFile
} from './io.js';

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

  // Ctrl+S to download BMG
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (state.bmgFile && !els.download.disabled) {
        handleDownload();
      }
    }
  });

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
  if (state.bmgFile.hasStr1 && message.label) badges.appendChild(createBadge(`Label: ${message.label}`, 'info'));

  header.appendChild(title);
  header.appendChild(badges);
  card.appendChild(header);

  const segments = [{ text: message.text, groupId: null }];
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
      message.text = e.target.value;
      updateTextHighlight(highlight, e.target.value);

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
      if (message.text !== editStartText) {
        pushUndo({ type: 'edit', index: message._index, oldText: editStartText, newText: message.text });
        editStartText = message.text;
      }
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
  charCount.textContent = `${message.text.length} chars`;
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

  const revertBtn = document.createElement('button');
  revertBtn.type = 'button';
  revertBtn.className = 'ghost revert';
  revertBtn.textContent = 'Revert';
  revertBtn.disabled = !message.dirty;
  revertBtn.addEventListener('click', () => {
    message.text = message._originalText || '';
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

    const specialInfo = getSpecialTokenInfo(match[0]);
    if (specialInfo) {
      tagSpan.classList.add('special');
      if (specialInfo.cls) tagSpan.classList.add(specialInfo.cls);
      tagSpan.title = specialInfo.name || specialInfo.argHex || match[0];
      if (specialInfo.textCls) {
        activeTextClass = specialInfo.textCls;
      } else {
        activeTextClass = '';
      }
    } else {
      tagSpan.classList.add('jaune');
    }
    tagSpan.textContent = specialInfo && specialInfo.label ? specialInfo.label : match[0];
    fragment.appendChild(tagSpan);

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    appendTextSegment(text.slice(lastIndex));
  }

  element.replaceChildren(fragment);
}

function matchesFilter(message) {
  const filterSingle = true;

  const showEmpty = els.filterEmpty ? els.filterEmpty.checked : false;
  if (!showEmpty && (!message.text || message.text.trim() === '')) return false;

  const showModified = els.filterModified ? els.filterModified.checked : true;
  if (!showModified && message.dirty) return false;

  const query = state.filter.trim().toLowerCase();
  if (!query) return true;

  if (message.text.toLowerCase().includes(query)) return true;
  if (message.label && message.label.toLowerCase().includes(query)) return true;

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

// --- Undo / Redo system ---
function pushUndo(action) {
  state.undoStack.push(action);
  state.redoStack.length = 0;
  updateUndoRedoButtons();
}

function applyAction(action, reverse) {
  if (!state.bmgFile) return;
  const msgs = state.bmgFile.messages;
  if (action.type === 'delete') {
    if (reverse) {
      // Undo delete = re-insert
      msgs.splice(action.index, 0, action.message);
    } else {
      // Redo delete = remove again
      const idx = msgs.findIndex(m => m === action.message);
      if (idx !== -1) msgs.splice(idx, 1);
    }
  } else if (action.type === 'create') {
    if (reverse) {
      // Undo create = remove
      const idx = msgs.findIndex(m => m === action.message);
      if (idx !== -1) msgs.splice(idx, 1);
    } else {
      // Redo create = re-insert
      msgs.splice(action.index, 0, action.message);
    }
  } else if (action.type === 'edit') {
    // Undo/redo text edit
    const msg = msgs[action.index];
    if (msg) {
      msg.text = reverse ? action.oldText : action.newText;
    }
  }
  reindexMessages();
  renderEntries();
  updateSaveButton();
  updateMeta();
}

export function undo() {
  const action = state.undoStack.pop();
  if (!action) return;
  applyAction(action, true);
  state.redoStack.push(action);
  updateUndoRedoButtons();
}

export function redo() {
  const action = state.redoStack.pop();
  if (!action) return;
  applyAction(action, false);
  state.undoStack.push(action);
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('toolbar-undo');
  const redoBtn = document.getElementById('toolbar-redo');
  if (undoBtn) undoBtn.disabled = state.undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
}

// --- Delete message ---
function deleteMessage(index) {
  if (!state.bmgFile) return;
  const msg = state.bmgFile.messages[index];
  if (!msg) return;
  state.bmgFile.messages.splice(index, 1);
  reindexMessages();
  pushUndo({ type: 'delete', index, message: msg });
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

  // Build a new BmgMessage-like object (always dirty so buildBmg encodes it)
  const attrSize = Math.max(0, (state.bmgFile.entrySize || 8) - 4);
  // Copy attribute from nearest neighbor (previous message, or next, or zeros)
  const neighbor = msgs[insertIndex - 1] || msgs[insertIndex];
  const attribute = neighbor?.attribute?.length === attrSize
    ? new Uint8Array(neighbor.attribute)
    : new Uint8Array(attrSize);
  // Place after all existing DAT1 data
  const newOffset = state.bmgFile._dat1DataSize || 0;
  state.bmgFile._dat1DataSize = newOffset + 4;
  const msg = {
    id,
    label: '',
    attribute,
    text: '',
    _originalText: null,
    _offset: newOffset,
    _index: 0,
    _tagBytesMap: new Map(),
    get dirty() { return true; }
  };
  msgs.splice(insertIndex, 0, msg);
  reindexMessages();
  pushUndo({ type: 'create', index: insertIndex, message: msg });
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
      const raw = input.value.trim();
      if (!raw) { error.style.display = 'none'; return; }
      if (!/^\d+$/.test(raw)) {
        error.textContent = 'ID must be a positive integer.';
        error.style.display = 'block';
        return;
      }
      const id = parseInt(raw, 10);
      if (state.bmgFile && state.bmgFile.messages.some(m => m.id === id)) {
        error.textContent = `ID ${id} already exists.`;
        error.style.display = 'block';
      } else {
        error.style.display = 'none';
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

  updateUndoRedoButtons();
}

export { createEntryCard, createBadge, updateTextHighlight };
