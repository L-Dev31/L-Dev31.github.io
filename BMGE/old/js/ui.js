import { state, els, ENCODINGS } from './state.js';
import { formatHex, formatBytes, formatCharCount, formatOffsetLabel, formatAttrLabel, formatEntryTitle, makeBadge, normalizeInput, countVisibleCharacters, splitPreservingTokens } from './utils.js';
import { resolveEntry, detectSequencedGroups, detectMixedSequencedGroups, detectScrollingGroups, getMidGroupForId } from './entries.js';
import { encodeBmgString } from './bmg-format.js';
import { tokenRegex, parseSpecialToken, encodeSpecialCode } from './tokens.js';
import { updateCalculatedOffsets } from './layout.js';
import { handleFileSelection, handleDownload, handleExportJson, handleImportJsonClick, handleImportJsonFile } from './io.js';
import { onEntryEdit, onEntryRevert, onFilter } from './editor.js';

export function renderEntries() {
  console.log(`Starting renderEntries with ${state.entries.length} INF1 entries and ${state.midStrings?.length || 0} MID1 entries`);
  els.entries.innerHTML = '';

  let displayEntries = [];


  (state.entries || []).forEach(e => displayEntries.push(e));


  const midAll = state.midStrings || [];
  const userGroups = state.midGroups || [];
  const userMemberSet = new Set((userGroups.flat ? userGroups.flat() : []).filter(Boolean));


  const handledMidIds = new Set();
  userGroups.forEach((group) => {
    if (!Array.isArray(group) || group.length === 0) return;
    const leader = group[0];
    const members = group.map(id => midAll.find(m => m.id === id)).filter(Boolean);
    members.forEach(m => handledMidIds.add(m.id));
    displayEntries.push({
      kind: 'mid',
      id: leader,
      isUserMidGroup: true,
      groupedIds: group.slice(),
      groupedEntries: members,
      text: members.map(m => m.text).join('')
    });
  });


  const autoPool = midAll.filter(m => !handledMidIds.has(m.id));

  // Detect scrolling groups first (before sequenced groups)
  const scrollingGroups = detectScrollingGroups(autoPool);
  scrollingGroups.forEach((group) => {
    if (group.isScrolling) {
      displayEntries.push({
        kind: 'mid',
        id: group.entries[0].id,
        isScrollingGroup: true,
        scrollingEntries: group.entries,
        scrollingIds: group.entries.map(e => e.id),
        scrollingCount: group.entries.length,
        text: group.entries[0].text // Use the first (longest) text
      });
    }
  });

  // Detect sequenced groups on remaining entries
  const remainingPool = autoPool.filter(m => !scrollingGroups.some(g => g.isScrolling && g.entries.includes(m)));
  const midGroups = detectSequencedGroups(remainingPool);
  midGroups.forEach((group) => {
    if (group.isSequenced) {
      displayEntries.push({
        kind: 'mid',
        id: group.entries[0].id,
        isSequencedGroup: true,
        sequencedEntries: group.entries,

        sequencedIndices: group.entries.map(e => e.id),
        sequencedCount: group.entries.length,
        text: group.entries.map(e => e.text).join('')
      });
    } else {
      displayEntries.push(group.entries[0]);
    }
  });

  const finalEntries = [];
  const infProcessed = new Set();

  // Detect mixed INF1/MID1 sequenced groups
  const mixedGroups = detectMixedSequencedGroups(state.entries, state.midStrings || []);
  mixedGroups.forEach(group => {
    if (group.isMixedSequenced) {
      const firstEntry = group.entries[0];
      finalEntries.push({
        ...firstEntry,
        isSequencedGroup: true,
        sequencedEntries: group.entries,
        sequencedIndices: group.entries.map(e => e.id),
        sequencedCount: group.entries.length,
        text: group.entries.map(e => e.text).join('')
      });
      group.entries.forEach(entry => infProcessed.add(entry.id));
    }
  });

  // Remove entries that are in mixed groups from displayEntries
  const mixedEntryIds = new Set();
  mixedGroups.forEach(group => {
    if (group.isMixedSequenced) {
      group.entries.forEach(entry => mixedEntryIds.add(entry.id));
    }
  });
  displayEntries = displayEntries.filter(entry => !mixedEntryIds.has(entry.id));

  // Detect sequenced groups on remaining INF1 entries
  const remainingInfEntries = state.entries.filter(entry => !infProcessed.has(entry.id));
  const infGroups = detectSequencedGroups(remainingInfEntries);

  infGroups.forEach(group => {
    if (group.isSequenced) {
      const firstEntry = group.entries[0];
      finalEntries.push({
        ...firstEntry,
        isSequencedGroup: true,
        sequencedEntries: group.entries,
        sequencedIndices: group.indices,
        sequencedCount: group.entries.length
      });
      group.indices.forEach(idx => infProcessed.add(idx));
    } else {
      if (!infProcessed.has(group.indices[0])) {
        finalEntries.push(group.entries[0]);
        infProcessed.add(group.indices[0]);
      }
    }
  });

  displayEntries.forEach(entry => {
    if (entry.kind !== 'mid') {
      const idx = finalEntries.findIndex(e => e.id === entry.id && e.kind === entry.kind);
      if (idx >= 0) {
        finalEntries[idx] = entry;
      }
    } else {
      finalEntries.push(entry);
    }
  });

  const activeEntries = finalEntries.filter(matchesFilter);

  console.log(`Final entries count: ${finalEntries.length}, active entries count: ${activeEntries.length}`);
  activeEntries.forEach(entry => {
    console.log(`Active entry: kind=${entry.kind}, id=${entry.id}, text="${entry.text}", offset=${entry.offset}`);
  });

  // Sort entries by file offset for logical reading order
  activeEntries.sort((a, b) => {
    const aOffset = a.offset || a.originalOffset || 0;
    const bOffset = b.offset || b.originalOffset || 0;
    return aOffset - bOffset;
  });

  // Grouper les single entries par contenu identique pour refléter la structure JSON
  const singleGroups = new Map();
  const sequencedEntries = new Set();
  const scrollingEntries = new Set();

  // Marquer les entries qui sont dans des groupes
  activeEntries.forEach((entry, displayIndex) => {
    if (entry.isSequencedGroup) {
      entry.sequencedIndices.forEach(idx => sequencedEntries.add(idx));
    }
    if (entry.isScrollingGroup) {
      entry.scrollingIds.forEach(id => scrollingEntries.add(id));
    }
  });

  // Créer les cartes pour l'affichage
  const fragment = document.createDocumentFragment();

  // Collecter tous les éléments à afficher dans l'ordre
  const itemsToDisplay = [];

  // Ajouter les groupes sequenced et scrolling
  activeEntries.forEach((entry, displayIndex) => {
    if (entry.isSequencedGroup || entry.isScrollingGroup) {
      itemsToDisplay.push({ entry, displayIndex });
    }
  });

  // Grouper par segments DAT (offset partagé) directement depuis state.datSegments
  const datGroups = new Map();
  const segmentEntryMap = new Map();

  // Construire une map des segments vers les entries
  (state.datSegments || []).forEach(segment => {
    const entryIndices = segment.entryIndices || [];
    if (entryIndices.length > 1) {
      const key = segment.originalOffset;
      const entries = entryIndices
        .map(idx => state.entries[idx])
        .filter(e => e && activeEntries.includes(e))
        .map(entry => ({ entry, displayIndex: activeEntries.indexOf(entry) }));
      
      if (entries.length > 1) {
        datGroups.set(key, entries);
        entries.forEach(({ entry }) => segmentEntryMap.set(entry, key));
      }
    }
  });

  // Traiter les groupes DAT
  datGroups.forEach((entries, offset) => {
    const firstEntry = entries[0].entry;
    const displayIndices = entries.map(e => e.displayIndex);
    const groupEntry = {
      ...firstEntry,
      isContentGroup: true,
      contentGroupEntries: entries.map(e => e.entry),
      contentGroupIndices: displayIndices,
      contentGroupCount: entries.length
    };
    itemsToDisplay.push({ entry: groupEntry, displayIndex: displayIndices[0] });
  });

  // Ajouter les entries individuelles restantes
  activeEntries.forEach((entry, displayIndex) => {
    if (entry.isSequencedGroup || entry.isScrollingGroup) return;
    if (segmentEntryMap.has(entry)) return; // Déjà traité dans un groupe DAT
    
    itemsToDisplay.push({ entry, displayIndex });
  });

  // Trier par displayIndex pour maintenir l'ordre
  itemsToDisplay.sort((a, b) => a.displayIndex - b.displayIndex);

  // Afficher dans l'ordre
  itemsToDisplay.forEach(({ entry, displayIndex }) => {
    const card = buildEntryCard(entry, displayIndex);
    fragment.appendChild(card);
  });

  els.entries.appendChild(fragment);

  const visibleCount = activeEntries.reduce((sum, entry) => {
    if (entry.kind === 'mid' && entry.isScrollingGroup) {
      return sum + (entry.scrollingCount || 1);
    }
    if (entry.isSequencedGroup) {
      return sum + (entry.sequencedCount || 1);
    }
    return sum + 1;
  }, 0);

  updateEntryCount(visibleCount);
}

function matchesFilter(entry) {
  console.log(`Checking filter for entry: kind=${entry.kind}, id=${entry.id}, text="${entry.text}", offset=${entry.offset}`);
  if (entry.kind === 'inf' && !els.filterInf.checked) {
    console.log(`Filter failed: INF1 filter not checked`);
    return false;
  }
  if (entry.kind === 'mid' && !els.filterMid.checked) {
    console.log(`Filter failed: MID1 filter not checked`);
    return false;
  }
  if (!els.filterEmpty.checked && (!entry.text || entry.text.trim() === '')) {
    console.log(`Filter failed: Empty filter not checked and entry is empty`);
    return false;
  }
  if (!els.filterSequenced.checked && entry.isSequencedGroup) {
    console.log(`Filter failed: Sequenced filter not checked and entry is sequenced`);
    return false;
  }
  if (!els.filterScrolling.checked && entry.isScrollingGroup) {
    console.log(`Filter failed: Scrolling filter not checked and entry is scrolling`);
    return false;
  }
  if (!els.filterModified.checked && entry.dirty) {
    console.log(`Filter failed: Modified filter not checked and entry is dirty`);
    return false;
  }
  
  const query = state.filter.trim().toLowerCase();
  if (!query) {
    console.log(`Filter passed: no search query`);
    return true;
  }
  if (entry.kind === 'mid') {
    if (typeof entry.offset === 'number') {
      const pointerHex = `0x${entry.offset.toString(16)}`.toLowerCase();
      if (pointerHex.includes(query)) {
        console.log(`Filter passed: pointer hex matches`);
        return true;
      }
    }
    const midLabel = `mid${(typeof entry.id === 'number' ? entry.id + 1 : '')}`;
    if (midLabel.includes(query)) {
      console.log(`Filter passed: mid label matches`);
      return true;
    }
    if (entry.references && entry.references.some((ref) => `row${ref.row}`.includes(query) || `col${ref.column}`.includes(query) || `${ref.row}:${ref.column}`.includes(query))) {
      console.log(`Filter passed: references match`);
      return true;
    }
    const text = (entry.text ?? '').toLowerCase();
    const original = (entry.originalText ?? '').toLowerCase();
    if (text.includes(query) || original.includes(query)) {
      console.log(`Filter passed: text matches`);
      return true;
    }
    console.log(`Filter failed: no match for mid entry`);
    return false;
  }
  if (`${entry.index}`.includes(query)) {
    console.log(`Filter passed: index matches`);
    return true;
  }
  if (typeof entry.offset === 'number' && (`0x${entry.offset.toString(16)}`.toLowerCase().includes(query))) {
    console.log(`Filter passed: offset matches`);
    return true;
  }
  if (typeof entry.messageId === 'number') {
    const messageIdDec = entry.messageId.toString();
    if (messageIdDec.includes(query)) {
      console.log(`Filter passed: messageId decimal matches`);
      return true;
    }
    const messageIdHex = `0x${formatHex(entry.messageId, 4)}`.toLowerCase();
    if (messageIdHex.includes(query)) {
      console.log(`Filter passed: messageId hex matches`);
      return true;
    }
  }
  if (typeof entry.groupId === 'number') {
    const groupIdDec = entry.groupId.toString();
    if (groupIdDec.includes(query)) {
      console.log(`Filter passed: groupId decimal matches`);
      return true;
    }
    const groupIdHex = `0x${formatHex(entry.groupId, 4)}`.toLowerCase();
    if (groupIdHex.includes(query)) {
      console.log(`Filter passed: groupId hex matches`);
      return true;
    }
  }
  if (typeof entry.attr1 === 'number') {
    const attr1Dec = entry.attr1.toString();
    if (attr1Dec.includes(query)) {
      console.log(`Filter passed: attr1 decimal matches`);
      return true;
    }
    const attr1Hex = `0x${formatHex(entry.attr1, 4)}`.toLowerCase();
    if (attr1Hex.includes(query)) {
      console.log(`Filter passed: attr1 hex matches`);
      return true;
    }
  }
  if (typeof entry.attr2 === 'number') {
    const attr2Dec = entry.attr2.toString();
    if (attr2Dec.includes(query)) {
      console.log(`Filter passed: attr2 decimal matches`);
      return true;
    }
    const attr2Hex = `0x${formatHex(entry.attr2, 4)}`.toLowerCase();
    if (attr2Hex.includes(query)) {
      console.log(`Filter passed: attr2 hex matches`);
      return true;
    }
  }
  if (typeof entry.compositeId === 'bigint') {
    const compositeDec = entry.compositeId.toString();
    if (compositeDec.includes(query)) {
      console.log(`Filter passed: compositeId decimal matches`);
      return true;
    }
    const compositeHex = `0x${entry.compositeId.toString(16)}`.toLowerCase();
    if (compositeHex.includes(query)) {
      console.log(`Filter passed: compositeId hex matches`);
      return true;
    }
  }
  if (typeof entry.attributeHex === 'string' && entry.attributeHex.length) {
    const attrHexLower = entry.attributeHex.toLowerCase();
    if (attrHexLower.includes(query)) {
      console.log(`Filter passed: attributeHex matches`);
      return true;
    }
    const attrHexPrefixed = `0x${attrHexLower}`;
    if (attrHexPrefixed.includes(query)) {
      console.log(`Filter passed: prefixed attributeHex matches`);
      return true;
    }
  }
  if (Array.isArray(entry.extraFields) && entry.extraFields.length) {
    const extrasDecimal = entry.extraFields.some((value) => value.toString().includes(query));
    if (extrasDecimal) {
      console.log(`Filter passed: extraFields decimal matches`);
      return true;
    }
    const extrasHex = entry.extraFields
      .map((value) => `0x${formatHex(value, 4)}`.toLowerCase())
      .some((label) => label.includes(query));
    if (extrasHex) {
      console.log(`Filter passed: extraFields hex matches`);
      return true;
    }
  }
  if (typeof entry.originalOffset === 'number' && (`0x${entry.originalOffset.toString(16)}`.toLowerCase().includes(query))) {
    console.log(`Filter passed: originalOffset matches`);
    return true;
  }
  const text = (entry.text ?? '').toLowerCase();
  const original = (entry.originalText ?? '').toLowerCase();
  if (text.includes(query) || original.includes(query)) {
    console.log(`Filter passed: text matches`);
    return true;
  }
  console.log(`Filter failed: no match`);
  return false;
}

export function buildEntryCard(entry, displayIndex = null) {
  const template = document.getElementById('entry-template');
  const card = template.content.firstElementChild.cloneNode(true);
  card.dataset.kind = entry.kind;
  card.dataset.id = String(entry.id);
  
  card.classList.toggle('mid-entry', entry.kind === 'mid');
  card.classList.toggle('inf-entry', entry.kind === 'inf');
  card.classList.toggle('sequenced-entry', entry.isSequencedGroup === true);
  card.classList.toggle('scrolling-entry', entry.isScrollingGroup === true);
  
  const title = card.querySelector('h3');
  let titleText = displayIndex !== null ? `Entry #${displayIndex}` : formatEntryTitle(entry);
  
  if (entry.isScrollingGroup) {
    const first = entry.scrollingIds[0];
    const last = entry.scrollingIds[entry.scrollingIds.length - 1];
    titleText += ` (IDs ${first}-${last}, ${entry.scrollingCount} variants)`;
  }
  
  if (entry.isUserMidGroup) {
    
    (entry.groupedEntries || []).forEach((part) => {
      const shell = document.createElement('div');
      shell.className = 'editor-shell';

      const pre = document.createElement('pre');
      pre.className = 'text-highlight';
      pre.dataset.entryKind = 'mid';
      updateTextHighlight(pre, part.text);

      const ta = document.createElement('textarea');
      ta.value = part.text;
      ta.dataset.kind = 'mid';
      ta.dataset.id = String(part.id);
      ta.addEventListener('input', onEntryEdit);

      shell.appendChild(pre);
      shell.appendChild(ta);
      textareaContainer.appendChild(shell);
    });
  }
  if (entry.isContentGroup) {
    const first = entry.contentGroupIndices[0];
    const last = entry.contentGroupIndices[entry.contentGroupIndices.length - 1];
    titleText += ` (Entries ${first}-${last}, ${entry.contentGroupCount} identical)`;
  }
  
  title.textContent = titleText;
  
  const badges = card.querySelector('.badges');
  updateBadges(badges, entry);

  
  if (entry.kind === 'mid') {
    const midGroup = getMidGroupForId(entry.id);
    if (midGroup) {
      const groupBadge = makeBadge(`Grouped (${midGroup.join(',')})`, 'warning');
      badges.appendChild(groupBadge);
    }
  }
  
  if (entry.isScrollingGroup) {
    const scrollBadge = makeBadge('Scrolling', 'scrolling');
    badges.appendChild(scrollBadge);
  }
  
  if (entry.isSequencedGroup) {
    const seqBadge = makeBadge('Sequenced', 'sequenced');
    badges.appendChild(seqBadge);
  }

  if (entry.isContentGroup) {
    const contentBadge = makeBadge('Identical Pointers', 'content');
    badges.appendChild(contentBadge);
  }
  
  card.querySelector('.offset').textContent = formatOffsetLabel(entry);
  card.querySelector('.attr').textContent = formatAttrLabel(entry);
  
  const textareaContainer = card.querySelector('.textarea-container');
  textareaContainer.innerHTML = '';

  if (entry.isSequencedGroup) {
    if (entry.kind === 'mid') {
      
      entry.sequencedEntries.forEach((part) => {
        const shell = document.createElement('div');
        shell.className = 'editor-shell ' + (part.kind === 'mid' ? 'editor-shell-mid' : 'editor-shell-inf');

        const pre = document.createElement('pre');
        pre.className = 'text-highlight';
        pre.dataset.entryKind = part.kind;
        updateTextHighlight(pre, part.text);

        const ta = document.createElement('textarea');
        ta.value = part.text;
        ta.dataset.kind = part.kind;
        ta.dataset.id = String(part.id);
        ta.addEventListener('input', onEntryEdit);

        shell.appendChild(pre);
        shell.appendChild(ta);
        textareaContainer.appendChild(shell);
      });
    } else {
      
      entry.sequencedEntries.forEach((part) => {
        const shell = document.createElement('div');
        shell.className = 'editor-shell ' + (part.kind === 'mid' ? 'editor-shell-mid' : 'editor-shell-inf');

        const pre = document.createElement('pre');
        pre.className = 'text-highlight';
        pre.dataset.entryKind = part.kind;
        updateTextHighlight(pre, part.text);

        const ta = document.createElement('textarea');
        ta.value = part.text;
        ta.dataset.kind = part.kind;
        ta.dataset.id = String(part.id);
        ta.addEventListener('input', onEntryEdit);

        shell.appendChild(pre);
        shell.appendChild(ta);
        textareaContainer.appendChild(shell);
      });
    }
  } else if (entry.isContentGroup) {
    // Groupe d'entries avec même contenu - afficher un seul textarea
    const shell = document.createElement('div');
    shell.className = 'editor-shell';

    const pre = document.createElement('pre');
    pre.className = 'text-highlight';
    pre.dataset.entryKind = entry.kind;
    updateTextHighlight(pre, entry.text);

    const ta = document.createElement('textarea');
    ta.value = entry.text;
    ta.dataset.kind = entry.kind;
    ta.dataset.id = String(entry.id);
    ta.dataset.ids = JSON.stringify(entry.contentGroupEntries.map(e => e.id));
    ta.addEventListener('input', onEntryEdit);

    shell.appendChild(pre);
    shell.appendChild(ta);
    textareaContainer.appendChild(shell);
  } else {
    {
      const shell = document.createElement('div');
      shell.className = 'editor-shell';

      const pre = document.createElement('pre');
      pre.className = 'text-highlight';
      pre.dataset.entryKind = entry.kind;
      updateTextHighlight(pre, entry.text);

      const ta = document.createElement('textarea');
      ta.value = entry.text;
      ta.dataset.kind = entry.kind;
      ta.dataset.id = String(entry.id);
      if (entry.isScrollingGroup) {
        ta.dataset.scrollingIds = JSON.stringify(entry.scrollingIds);
      }
      ta.addEventListener('input', onEntryEdit);

      shell.appendChild(pre);
      shell.appendChild(ta);
      textareaContainer.appendChild(shell);
    }
  }
  
  const revertBtn = card.querySelector('.revert');
  revertBtn.dataset.kind = entry.kind;
  revertBtn.dataset.id = String(entry.id);

  
  if (entry.kind === 'mid') {
    
  }
  
  if (entry.isScrollingGroup) {
    revertBtn.dataset.scrollingIds = JSON.stringify(entry.scrollingIds);
  }
  
  if (entry.isSequencedGroup) {
    revertBtn.dataset.sequencedIndices = JSON.stringify(entry.sequencedIndices);
  }

  if (entry.isContentGroup) {
    revertBtn.dataset.ids = JSON.stringify(entry.contentGroupEntries.map(e => e.id));
  }
  
  revertBtn.disabled = !entry.dirty;
  revertBtn.addEventListener('click', onEntryRevert);
  const charCount = card.querySelector('.char-count');
  charCount.textContent = formatCharCount(entry);
  
  (function computeCardModified() {
    let modified = !!entry.dirty;
    const taList = card.querySelectorAll('textarea');
    taList.forEach((ta) => {
      const resolved = resolveEntry(ta.dataset.kind, ta.dataset.id);
      if (resolved && resolved.dirty) modified = true;
    });
    card.classList.toggle('modified', modified);
    
    const existing = Array.from(badges.children).find(b => (b.textContent || '').toLowerCase() === 'modified');
    if (modified && !existing) {
      badges.appendChild(makeBadge('modified', 'warning'));
    } else if (!modified && existing) {
      existing.remove();
    }
    
    revertBtn.disabled = !modified;
  })();
  return card;
}

export function updateMeta() {
  if (!state.bytes) {
    els.fileMeta.innerHTML = state.message
      ? `<span class="status status-${state.messageTone}">${state.message}</span>`
      : '';
    return;
  }
  const infSize = formatBytes(state.infSize);
const datSize = formatBytes(state.datDeclaredSize);
  const midSize = state.midSize ? formatBytes(state.midSize) : '0 B';
  const infCount = state.entryCount;
  const midCount = state.midStrings?.length ?? 0;
  const totalCount = infCount + midCount;

  const sizeLine = `<div class="meta-block"><strong>Section sizes</strong><br>INF1: <strong>${infCount}</strong> · ${infSize} &nbsp;·&nbsp; DAT1: <strong>${datSize}</strong> &nbsp;·&nbsp; MID1: <strong>${midCount}</strong> · ${midSize}</div>`;
  const countLine = `<div class="meta-block"><strong>Entry counts</strong><br>Total: <strong>${totalCount}</strong> · INF1: <strong>${infCount}</strong> · MID1: <strong>${midCount}</strong></div>`;

  let html = `
    <div class="meta-lines">
      ${sizeLine}
      ${countLine}
    </div>
  `.trim();

  if (state.message) {
    if (state.messageTone === 'warning') {
      html += ` <span class="status status-warning badge-red">⚠️ ${state.message}</span>`;
    } else if (state.messageTone === 'error') {
      html += ` <span class="status status-error">❌ ${state.message}</span>`;
    } else {
      html += ` <span class="status status-${state.messageTone}">${state.message}</span>`;
    }
  }
  els.fileMeta.innerHTML = html;
}

export function updateEntryCount(activeCount) {
  const extra = state.midStrings?.length ?? 0;
  const total = state.entryCount + extra;
  const label = `${activeCount} / ${total} items`;
  els.entryCount.textContent = label;
}

export function updateSaveButton() {
  const hasChanges = state.entries.some((entry) => entry.dirty)
    || (state.midStrings?.some((entry) => entry.dirty) ?? false);
  els.download.disabled = !hasChanges;
}

export function showMessage(text, tone = 'info') {
  state.message = text;
  state.messageTone = tone;
  updateMeta();
}

export function resetUi() {
  state.fileName = '';
  state.originalBuffer = null;
  state.bytes = null;
  state.view = null;
  state.entries = [];
  state.entryCount = 0;
  state.infSize = 0;
  state.infOffset = 0;
  state.headerBytes = 0;
  state.entrySize = 0;
  state.entryStart = 0;
  state.datDeclaredSize = 0;
  state.datActualSize = 0;
  state.datOffset = 0;
  state.datBase = 0;
  state.filter = '';
  state.message = '';
  state.messageTone = 'info';
  state.bmgType = '';
  state.encoding = 0;
  state.sectionsCount = 0;
  state.fileSize = 0;
  state.midOffset = -1;
  state.midSize = 0;
  state.midEntryCount = 0;
  state.midEntrySize = 0;
  state.midColumnCount = 0;
  state.midReserved = 0;
  state.midRowCount = 0;
  state.midEntries = [];
  state.midIds = [];
  state.midKind = 'none';
  state.midStrings = [];
  state.datSegments = [];
  state.lastLayout = null;
  els.fileLabel.textContent = 'No file selected';
  els.search.value = '';
  els.search.disabled = true;
  els.entries.innerHTML = '';
  els.entryCount.textContent = '0 items';
  els.download.disabled = true;
  els.exportJson.disabled = true;
  els.importJson.disabled = true;
  if (els.importJsonInput) {
    els.importJsonInput.value = '';
  }
  els.fileMeta.textContent = '';
  updateSearchIcons();
  updateSaveButton();
  updateMeta();
}

// Additional UI helper functions
export function hasSpecialTokens(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const regex = tokenRegex();
  let match;
  while ((match = regex.exec(value)) !== null) {
    const label = match[1] ?? '';
    if (parseSpecialToken(label) !== null) {
      return true;
    }
  }
  return false;
}

export function updateTextHighlight(target, value) {
  if (!target) {
    return;
  }
  const hasTokens = hasSpecialTokens(value);
  target.dataset.hasTokens = hasTokens ? 'true' : 'false';
  target.dataset.highlightColor = 'default';
  if (!value) {
    target.classList.add('highlight-empty');
    target.textContent = 'Empty';
    return;
  }
  target.classList.remove('highlight-empty');
  const regex = tokenRegex();
  let lastIndex = 0;
  let match;
  const fragment = document.createDocumentFragment();
  while ((match = regex.exec(value)) !== null) {
    const [token, label] = match;
    const segment = value.slice(lastIndex, match.index);
    if (segment) {
      fragment.append(segment);
    }
    const parsed = parseSpecialToken(label ?? '');
    if (!parsed) {
      fragment.append(token);
    } else {
      const span = document.createElement('span');
      span.className = 'token-chip';
      span.textContent = encodeSpecialCode(parsed.code, parsed.params);
      fragment.append(span);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < value.length) {
    fragment.append(value.slice(lastIndex));
  }
  target.replaceChildren(fragment);
}

export function updateBadges(container, entry) {
  if (!container) {
    return;
  }
  container.innerHTML = '';
  
  // Check for mixed sequenced groups
  let isMixed = false;
  if (entry.isSequencedGroup && entry.sequencedEntries) {
    const kinds = [...new Set(entry.sequencedEntries.map(e => e.kind))];
    isMixed = kinds.length > 1;
  }
  
  if (!isMixed) {
    const sectionLabel = entry.kind === 'mid' ? 'MID1' : 'INF1';
    const sectionVariant = entry.kind === 'mid' ? 'mid1' : 'inf1';
    const sectionBadge = makeBadge(sectionLabel, sectionVariant);
    container.appendChild(sectionBadge);
  }
  
  if (isMixed) {
    // Mixed group badge with improved gradient
    const mixedBadge = document.createElement('span');
    mixedBadge.className = 'badge badge-mixed';
    mixedBadge.textContent = 'INF1+MID1';
    container.appendChild(mixedBadge);
  }
  
  if (entry.dirty) {
    container.appendChild(makeBadge('modified', 'warning'));
  }
}

export function updateSearchIcons() {
  const searchClear = document.querySelector('.search-clear');
  if (searchClear) {
    searchClear.style.display = els.search.value.trim() ? 'block' : 'none';
  }
}

export function init() {
  // Initialize DOM element references
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
  els.filterInf = document.getElementById('filter-inf');
  els.filterMid = document.getElementById('filter-mid');
  els.filterEmpty = document.getElementById('filter-empty');
  els.filterSequenced = document.getElementById('filter-sequenced');
  els.filterScrolling = document.getElementById('filter-scrolling');
  els.filterModified = document.getElementById('filter-modified');

  // Attach event listeners
  els.fileInput.addEventListener('change', handleFileSelection);
  els.download.addEventListener('click', handleDownload);
  els.exportJson.addEventListener('click', handleExportJson);
  els.importJson.addEventListener('click', handleImportJsonClick);
  els.importJsonInput.addEventListener('change', handleImportJsonFile);
  els.search.addEventListener('input', onFilter);
  els.search.addEventListener('input', updateSearchIcons);
  els.filterInf.addEventListener('change', onFilter);
  els.filterMid.addEventListener('change', onFilter);
  els.filterEmpty.addEventListener('change', onFilter);
  els.filterSequenced.addEventListener('change', onFilter);
  els.filterScrolling.addEventListener('change', onFilter);
  els.filterModified.addEventListener('change', onFilter);

  // Add search clear functionality
  const searchClear = document.querySelector('.search-clear');
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      els.search.value = '';
      state.filter = '';
      updateSearchIcons();
      renderEntries();
    });
  }

  // Initialize UI state
  resetUi();
}