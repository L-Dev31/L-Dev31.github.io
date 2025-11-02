import { state, els } from './state.js';
import { BmgMessage } from './bmg-format.js';
import { parseMessageSegments, reconstructTextFromSegments } from './group-segments.js';
import { 
  handleFileSelection,
  handleDownload,
  handleExportJson,
  handleImportJsonClick,
  handleImportJsonFile
} from './io.js';

/**
 * UI Module - Following AeonMSBT's entry card architecture
 * Creates individual entry cards for each BmgMessage
 */

export function init() {
  // Get DOM element references
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
  els.filterSequenced = document.getElementById('filter-sequenced');
  
  // Attach event listeners (these will be defined in other modules)
  if (els.fileInput) {
    els.fileInput.addEventListener('change', handleFileSelection);
  }
  if (els.search) {
    els.search.addEventListener('input', handleFilter);
  }
  if (els.filterEmpty) {
    els.filterEmpty.addEventListener('change', () => renderEntries());
  }
  if (els.filterModified) {
    els.filterModified.addEventListener('change', () => renderEntries());
  }
  if (els.filterSingle) {
    els.filterSingle.addEventListener('change', () => renderEntries());
  }
  if (els.filterSequenced) {
    els.filterSequenced.addEventListener('change', () => renderEntries());
  }
  if (els.download) {
    els.download.addEventListener('click', handleDownload);
  }
  if (els.exportJson) {
    els.exportJson.addEventListener('click', handleExportJson);
  }
  if (els.importJson) {
    els.importJson.addEventListener('click', handleImportJsonClick);
  }
  if (els.importJsonInput) {
    els.importJsonInput.addEventListener('change', handleImportJsonFile);
  }
  
  resetUi();
}

/**
 * Render all BMG message entries as individual cards
 * Matches: AeonMSBT's TextEditor approach - one card per message
 */
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

/**
 * Create an entry card for a single BmgMessage
 * Matches: AeonMSBT's entry card structure
 */
function createEntryCard(message, displayIndex) {
  const card = document.createElement('article');
  card.className = 'entry-card';
  card.dataset.index = message._index;
  
  if (message.dirty) {
    card.classList.add('modified');
  }
  
  // Header with title and badges
  const header = document.createElement('header');
  header.className = 'entry-heading';
  
  const title = document.createElement('h3');
  title.textContent = `Message ${message._index}`;
  
  const badges = document.createElement('div');
  badges.className = 'badges';
  
  // Add modified badge if dirty
  if (message.dirty) {
    const modifiedBadge = createBadge('Modified', 'warning');
    badges.appendChild(modifiedBadge);
  }
  
  // Add ID badge if MID1 exists
  if (state.bmgFile.hasMid1 && message.id !== 0) {
    const idBadge = createBadge(`ID: ${message.id}`, 'info');
    badges.appendChild(idBadge);
  }
  
  // Add label badge if STR1 exists
  if (state.bmgFile.hasStr1 && message.label) {
    const labelBadge = createBadge(`Label: ${message.label}`, 'info');
    badges.appendChild(labelBadge);
  }
  
  header.appendChild(title);
  header.appendChild(badges);
  card.appendChild(header);
  
  // (removed) full-message highlight — highlighting is per-segment only
  
  // Parse message into segments based on group tokens
  const segments = parseMessageSegments(message.text);
  
  // Add sequenced-entry class ONLY if message has 2 or more segments (2+ textareas)
  if (segments.length >= 2) {
    card.classList.add('sequenced-entry');
  }
  
  // Create a textarea for each segment
  segments.forEach((segment, segmentIndex) => {
    const segmentContainer = document.createElement('div');
    segmentContainer.className = 'segment-container';
    if (segment.groupId !== null) {
      segmentContainer.dataset.groupId = segment.groupId;
    }
    
    // Editor label and textarea
    const label = document.createElement('label');
    label.className = 'entry-editor segment-editor';
    
    // Textarea container with syntax highlighting
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
    textarea.rows = Math.max(2, segment.text.split('\n').length);
    
    textarea.addEventListener('input', (e) => {
      // Update the segment
      segments[segmentIndex].text = e.target.value;
      
      // Reconstruct full text from all segments
      message.text = reconstructTextFromSegments(segments);
      
  // Update highlight
  updateTextHighlight(highlight, e.target.value);
      
      // Check if message is now dirty (text different from original)
      if (message.dirty && !card.classList.contains('modified')) {
        card.classList.add('modified');
        
        // Add modified badge if not present
        const badges = card.querySelector('.badges');
        if (badges && !badges.querySelector('.badge-warning')) {
          const modifiedBadge = createBadge('Modified', 'warning');
          badges.insertBefore(modifiedBadge, badges.firstChild);
        }
      } else if (!message.dirty && card.classList.contains('modified')) {
        // Remove modified state if text matches original
        card.classList.remove('modified');
        const badges = card.querySelector('.badges');
        const modifiedBadge = badges?.querySelector('.badge-warning');
        if (modifiedBadge) {
          modifiedBadge.remove();
        }
      }
      
      // Update save button state
      updateSaveButton();
      
      // Update char count
      const charCount = card.querySelector('.char-count');
      if (charCount) {
        charCount.textContent = `${message.text.length} chars`;
      }
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
  
  // Entry actions (metadata + revert button)
  const actions = document.createElement('div');
  actions.className = 'entry-actions';
  
  const helper = document.createElement('div');
  helper.className = 'entry-helper';
  
  // Character count
  const charCount = document.createElement('span');
  charCount.className = 'char-count';
  charCount.textContent = `${message.text.length} chars`;
  helper.appendChild(charCount);
  
  // Offset info
  const offset = document.createElement('span');
  offset.className = 'offset';
  offset.textContent = `Offset: 0x${message._offset.toString(16).padStart(4, '0').toUpperCase()}`;
  helper.appendChild(offset);
  
  // Attribute info
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
  
  // Revert button
  const revertBtn = document.createElement('button');
  revertBtn.type = 'button';
  revertBtn.className = 'ghost revert';
  revertBtn.textContent = 'Revert';
  revertBtn.disabled = !message.dirty;
  revertBtn.addEventListener('click', () => {
    // Revert all segments
    message.text = message._originalText;
    
    // Re-render the card
    const newCard = createEntryCard(message, message._index + 1);
    card.replaceWith(newCard);
  });
  actions.appendChild(revertBtn);
  
  card.appendChild(actions);
  
  return card;
}

/**
 * Create a badge element
 */
function createBadge(text, variant = 'default') {
  const badge = document.createElement('span');
  badge.className = `badge badge-${variant}`;
  badge.textContent = text;
  return badge;
}

/**
 * Update text highlight (show BMG tags with syntax highlighting)
 */
function updateTextHighlight(element, text) {
  if (!text || text.trim() === '') {
    element.classList.add('highlight-empty');
    element.textContent = 'Empty';
    return;
  }
  
  element.classList.remove('highlight-empty');
  
  // Affiche tous les tags (tokens), même techniques, dans l'ordre du texte
  const tagRegex = /\[(@?)([0-9A-F]+):([0-9A-F]+)(?::([0-9A-F]+))?\]|\{\{@([0-9A-F]{1,2}):([0-9A-F]{1,4})(?::([0-9A-F]+))?\}\}|\{\{@?(\d+):(\d+)(?:\s+(?:arg=")?([a-fA-F0-9]+)"?)?\}\}/gi;
  let lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    // Ajoute le texte avant le tag (s'il y en a)
    if (match.index > lastIndex) {
      const textNode = document.createTextNode(text.slice(lastIndex, match.index));
      fragment.appendChild(textNode);
    }

  // Affiche tous les tags comme des chips jaunes (token-chip)
  const tagSpan = document.createElement('span');
  tagSpan.className = 'token-chip jaune';
    tagSpan.textContent = match[0];
    fragment.appendChild(tagSpan);

    lastIndex = match.index + match[0].length;
  }

  // Ajoute le texte restant après le dernier tag
  if (lastIndex < text.length) {
    const textNode = document.createTextNode(text.slice(lastIndex));
    fragment.appendChild(textNode);
  }

  element.replaceChildren(fragment);
}

/**
 * Handle text edit in a message
 */
function handleTextEdit(event, message) {
  const newText = event.target.value;
  message.text = newText;
  
  // Update highlight
  const card = event.target.closest('.entry-card');
  const highlight = card.querySelector('.text-highlight');
  updateTextHighlight(highlight, newText);
  
  // Update modified state
  const isDirty = message.dirty;
  card.classList.toggle('modified', isDirty);
  
  const badges = card.querySelector('.badges');
  const existingModifiedBadge = badges.querySelector('.badge-warning');
  
  if (isDirty && !existingModifiedBadge) {
    badges.appendChild(createBadge('Modified', 'warning'));
  } else if (!isDirty && existingModifiedBadge) {
    existingModifiedBadge.remove();
  }
  
  // Update revert button
  const revertBtn = card.querySelector('.revert');
  revertBtn.disabled = !isDirty;
  
  // Update character count
  const charCount = card.querySelector('.char-count');
  charCount.textContent = `${newText.length} chars`;
  
  updateSaveButton();
}

/**
 * Handle revert button click
 */
function handleRevert(message, textarea, highlight, card) {
  message.text = message._originalText;
  textarea.value = message._originalText;
  updateTextHighlight(highlight, message._originalText);
  
  card.classList.remove('modified');
  
  const badges = card.querySelector('.badges');
  const modifiedBadge = badges.querySelector('.badge-warning');
  if (modifiedBadge) {
    modifiedBadge.remove();
  }
  
  const revertBtn = card.querySelector('.revert');
  revertBtn.disabled = true;
  
  const charCount = card.querySelector('.char-count');
  charCount.textContent = `${message._originalText.length} chars`;
  
  updateSaveButton();
}

/**
 * Filter function to check if a message matches current filters
 */
function matchesFilter(message) {
  // Check if message is sequenced (has 2 or more segments = 2+ textareas)
  const segments = parseMessageSegments(message.text);
  const isSequenced = segments.length >= 2;
  
  // Check single/sequenced filter (default to true if checkbox doesn't exist)
  const filterSingle = els.filterSingle ? els.filterSingle.checked : true;
  const filterSequenced = els.filterSequenced ? els.filterSequenced.checked : true;
  
  if (isSequenced && !filterSequenced) {
    return false;
  }
  if (!isSequenced && !filterSingle) {
    return false;
  }
  
  // Check empty filter (default to false = hide empty)
  const showEmpty = els.filterEmpty ? els.filterEmpty.checked : false;
  if (!showEmpty && (!message.text || message.text.trim() === '')) {
    return false;
  }
  
  // Check modified filter (default to true = show modified)
  const showModified = els.filterModified ? els.filterModified.checked : true;
  if (!showModified && message.dirty) {
    return false;
  }
  
  // Check search query
  const query = state.filter.trim().toLowerCase();
  if (!query) {
    return true;
  }
  
  // Search in text
  if (message.text.toLowerCase().includes(query)) {
    return true;
  }
  
  // Search in label
  if (message.label && message.label.toLowerCase().includes(query)) {
    return true;
  }
  
  // Search in ID
  if (message.id.toString().includes(query)) {
    return true;
  }
  
  // Search in index
  if (message._index.toString().includes(query)) {
    return true;
  }
  
  return false;
}

/**
 * Handle filter/search input
 */
function handleFilter(event) {
  state.filter = event.target.value;
  renderEntries();
}

/**
 * Update entry count display
 */
function updateEntryCount(filtered, total) {
  if (!total) {
    total = filtered;
  }
  els.entryCount.textContent = `${filtered} / ${total} messages`;
}

/**
 * Update save button state
 */
export function updateSaveButton() {
  if (!state.bmgFile) {
    els.download.disabled = true;
    return;
  }
  
  const hasChanges = state.bmgFile.messages.some(msg => msg.dirty);
  els.download.disabled = !hasChanges;
}

/**
 * Update file metadata display
 */
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
  
  if (state.message) {
    html += ` <span class="status status-${state.messageTone}">${state.message}</span>`;
  }
  
  els.fileMeta.innerHTML = html;
}

/**
 * Show status message
 */
export function showMessage(text, tone = 'info') {
  state.message = text;
  state.messageTone = tone;
  updateMeta();
}

/**
 * Reset UI to initial state
 */
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
