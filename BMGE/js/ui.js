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
  if (state.bmgFile.hasMid1 && message.id !== 0) badges.appendChild(createBadge(`ID: ${message.id}`, 'info'));
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

  const revertBtn = document.createElement('button');
  revertBtn.type = 'button';
  revertBtn.className = 'ghost revert';
  revertBtn.textContent = 'Revert';
  revertBtn.disabled = !message.dirty;
  revertBtn.addEventListener('click', () => {
    message.text = message._originalText;
    const newCard = createEntryCard(message, message._index + 1);
    card.replaceWith(newCard);
  });
  actions.appendChild(revertBtn);

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

  const hasChanges = state.bmgFile.messages.some(msg => msg.dirty);
  els.download.disabled = !hasChanges;
}

export function updateMeta() {
  if (!state.bmgFile) {
    els.fileMeta.innerHTML = state.message
      ? `<span class="status status-${state.messageTone}">${state.message}</span>`
      : '';
    return;
  }

  const messageCount = state.bmgFile.messages.length;
  const encoding = state.bmgFile.encodingType;
  const hasMid1 = state.bmgFile.hasMid1 ? 'Yes' : 'No';
  const hasStr1 = state.bmgFile.hasStr1 ? 'Yes' : 'No';

  let html = `
    <div class="meta-lines">
      <div class="meta-block">
        <strong>Messages:</strong> ${messageCount} &nbsp;|&nbsp;
        <strong>Encoding:</strong> ${encoding} &nbsp;|&nbsp;
        <strong>MID1:</strong> ${hasMid1} &nbsp;|&nbsp;
        <strong>STR1:</strong> ${hasStr1}
      </div>
    </div>
  `.trim();

  if (state.message) html += ` <span class="status status-${state.messageTone}">${state.message}</span>`;

  els.fileMeta.innerHTML = html;
}

export function showMessage(text, tone = 'info') {
  state.message = text;
  state.messageTone = tone;
  updateMeta();
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

  if (els.filterEmpty) els.filterEmpty.checked = false;
  if (els.filterModified) els.filterModified.checked = true;
}

export { createEntryCard, createBadge, updateTextHighlight };
