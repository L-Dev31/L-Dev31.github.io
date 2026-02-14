function showErrorMessage(message) {
  const errorDiv = document.getElementById('error-message');
  if (!errorDiv) return;
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  setTimeout(() => { try { errorDiv.classList.remove('show'); } catch(e){} }, 6000);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0,0,0';
}

function updateViewButtons(){
    const elMap = { kanban: 'viewBtnKanban', list: 'viewBtnList', gantt: 'viewBtnGantt' };
    Object.keys(elMap).forEach(m => {
        const btn = document.getElementById(elMap[m]);
        if (!btn) return;
        btn.classList.toggle('active', viewMode === m);
    });
}

// --- App-wide constants & minimal state (added to ensure missing symbols exist) ---
const STORAGE_KEY = 'ynov_board_v1';
const STATUSES = ['todo','doing','verify','done'];
let boardData = { sprints: [] };
let viewMode = localStorage.getItem('viewMode') || 'list';
let selectedSprintId = null;
let selectedPoleId = null;
let modalFiles = [];
let modalImages = [];
let modalAssignees = [];
let editingTaskId = null;
let pendingAddStatus = null;
let pendingAddPartieId = null;
let wbsOnlyPoleView = true; // par défaut : afficher le WBS pour le pôle sélectionné

const DEFAULT_POLES = [
  { id: 'creatif-artistique', name: 'Créatif', color: '#28a745', icon: 'fa-solid fa-paint-brush' },
  { id: 'systeme-dev', name: 'Système Dev', color: '#0d6efd', icon: 'fa-solid fa-code' },
  { id: 'audiovisuel-marketing', name: 'AMC', color: '#fd7e14', icon: 'fa-solid fa-bullhorn' },
  { id: '3d-animation', name: '3D Animation', color: '#6f42c1', icon: 'fa-solid fa-cube' },
  { id: 'administration', name: 'Administration', color: '#6c757d', icon: 'fa-solid fa-cog' }
];

// Minimal safe stubs for rendering functions (restored so init() can run)
function setViewMode(m) { viewMode = m; localStorage.setItem('viewMode', viewMode); updateViewButtons(); renderView(); }
function renderView(){
  // simple dispatcher: if detailed renderers exist, they will be used; otherwise fall back to kanban
  if (viewMode === 'list') return renderListView();
  if (viewMode === 'gantt') return renderGanttView();
  return renderKanbanView();
}

function renderBoard(){ renderView(); renderPoleTabs && renderPoleTabs(); }

// Render the left navigation of sprints
function renderSprintsNav(){
  const nav = document.getElementById('sprints-nav'); if (!nav) return;
  const list = nav.querySelector('.sprints-list') || nav;
  list.innerHTML = '';
  boardData.sprints.forEach(sprint => {
    const btn = document.createElement('button');
    btn.className = 'sprint-button btn btn-sm';
    btn.textContent = sprint.name;
    btn.onclick = () => { selectedSprintId = sprint.id; selectedPoleId = null; renderBoard(); };
    if (selectedSprintId === sprint.id) btn.classList.add('active');
    list.appendChild(btn);
  });
}

// Improved renderBoard: update header, count, and then render view
function renderBoard(){
  renderSprintsNav();

  const sprint = boardData.sprints.find(s => s.id === selectedSprintId) || (boardData.sprints[0] || null);
  const poleNameHeader = document.getElementById('selectedPoleName');
  const countEl = document.getElementById('selectedCount');

  if (!sprint) {
    if (poleNameHeader) poleNameHeader.textContent = 'Sélectionnez un sprint';
    if (countEl) countEl.textContent = '';
    // clear lists
    ['todo','doing','verify','done'].forEach(s => { const el = document.getElementById(s+'-list'); if (el) el.innerHTML=''; });
    return;
  }

  selectedSprintId = sprint.id;

  const pole = (selectedPoleId === 'all-poles') ? (sprint.poles[0] || null) : (sprint.poles.find(p => p.id === selectedPoleId) || (sprint.poles[0] || null));

  if (!pole) {
    if (poleNameHeader) poleNameHeader.textContent = 'Sélectionnez un pôle';
    if (countEl) countEl.textContent = '';
    // clear lists
    ['todo','doing','verify','done'].forEach(s => { const el = document.getElementById(s+'-list'); if (el) el.innerHTML=''; });
    return;
  }

  // preserve special 'all-poles' selection; otherwise keep selected pole id
  if (selectedPoleId !== 'all-poles') selectedPoleId = pole.id;

  if (poleNameHeader) {
    // prefer values from pole; fall back to DEFAULT_POLES definitions when missing
    const def = DEFAULT_POLES.find(d => d.id === (pole && pole.id)) || {};
    const headerIcon = (pole && pole.icon) || def.icon || 'fa-solid fa-circle';
    const headerColor = (pole && pole.color) || def.color || '#666';
    const headerName = (selectedPoleId === 'all-poles') ? 'Tous les pôles' : ((pole && pole.name) || def.name || (pole && pole.id) || 'Pôle');
    poleNameHeader.innerHTML = `<i class="pole-icon ${headerIcon}" style="color: ${headerColor}"></i> ${headerName}`;
  }

  // count tasks (sum across poles when viewing "all-poles")
  let tasksCount = (selectedPoleId === 'all-poles') ? (sprint.poles || []).reduce((acc,p)=> acc + ((p.tasks||[]).length), 0) : (pole.tasks || []).length;
  if (countEl) countEl.textContent = `${tasksCount} ressources`;

  // render pole tabs
  renderPoleTabs();
  renderView();

  // Ensure pole-only is the visible default and remove obsolete WBS footer controls if present
  wbsOnlyPoleView = true;
  const scopeBtn = document.getElementById('wbsScopeBtn'); if (scopeBtn) scopeBtn.remove();
  const exportBtn = document.getElementById('exportWbsBtn'); if (exportBtn) exportBtn.remove();
}

function renderPoleTabs(){
  const nav = document.getElementById('sub-poles-nav');
  if (!nav) return;
  nav.innerHTML = '';
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId) || null;

  // Render only poles that are present in the current sprint; use DEFAULT_POLES for visual defaults.
  DEFAULT_POLES.forEach(def => {
    const present = sprint && sprint.poles && sprint.poles.find(p => p.id === def.id);
    if (!present) return; // invisible when not included in sprint

    const btn = document.createElement('button');
    btn.className = 'btn btn-sm pole-tab-button';

    const color = present.color || def.color;
    const icon = present.icon || def.icon || '';
    btn.style.setProperty('--pole-color-rgb', hexToRgb(color || '#666'));

    btn.innerHTML = `<i class="pole-icon ${icon}" style="color: ${color}"></i> ${def.name}`;

    btn.onclick = () => { selectedPoleId = def.id; renderBoard(); };
    if (selectedPoleId === def.id) btn.classList.add('active');

    nav.appendChild(btn);
  });

  // Add "Tous les pôles" button at the end (merges all poles)
  const allBtn = document.createElement('button');
  allBtn.className = 'btn btn-sm pole-tab-button all-poles-button';
  allBtn.innerHTML = `<i class="fa-solid fa-layer-group" style="color: #adb5bd"></i> Tous les pôles`;
  allBtn.onclick = () => { selectedPoleId = 'all-poles'; renderBoard(); };
  if (selectedPoleId === 'all-poles') allBtn.classList.add('active');
  nav.appendChild(allBtn);
} 



// Basic Kanban renderer: populates the four status columns with simple cards (draggable)
function renderKanbanView(){
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId);
  const pole = sprint ? sprint.poles.find(p => p.id === selectedPoleId) : null;
  if (!pole) return;
  if (!selectedPoleId) selectedPoleId = pole.id;
  STATUSES.forEach(status => {
    const container = document.getElementById(`${status}-list`);
    if (!container) return;
    container.innerHTML = '';
    // gather tasks from pole
    const tasks = pole.tasks || [];
    const filtered = tasks.filter(t => (t.status || 'todo') === status);
    if (filtered.length === 0) {
      container.classList.add('no-tasks');
      const placeholder = document.createElement('div');
      placeholder.className = 'empty-placeholder small text-muted';
      placeholder.textContent = 'Aucune tâche';
      container.appendChild(placeholder);
    } else {
      container.classList.remove('no-tasks');
      filtered.forEach(task => {
        const card = document.createElement('div'); card.className = 'card-task'; card.draggable = true;
        card.setAttribute('data-task-id', task.id);
        card.ondragstart = (e) => { try { e.dataTransfer.setData('text/plain', task.id); } catch (err){} };
        const title = document.createElement('div'); title.className = 'card-title'; title.textContent = task.title;
        const meta = document.createElement('div'); meta.className = 'card-meta small text-muted'; meta.textContent = task.desc || '';
        card.appendChild(title); card.appendChild(meta);
        card.onclick = () => openPreviewModal(task.id);
        // right-click on card -> edit / delete
        card.oncontextmenu = (ev) => { ev.preventDefault(); showContextMenu([
          { label: 'Modifier la tâche', onClick: () => openEditModal(task.id) },
          { label: 'Supprimer la tâche', onClick: () => { if (confirm('Supprimer cette tâche ?')) deleteTask(task.id); } }
        ], ev.pageX, ev.pageY); };
        container.appendChild(card);
      });
    }
    // Right-click on column -> add task (replaces 'Ajouter' button)
    container.oncontextmenu = (ev) => { ev.preventDefault(); showContextMenu([
      { label: 'Ajouter une tâche', onClick: () => { pendingAddStatus = status; openTaskModal(status); } }
    ], ev.pageX, ev.pageY); };

    // Drag helpers on the full column (use a counter to avoid flicker when moving over child elements)
    const col = container.parentElement;
    // ensure the column accepts drops across its whole area
    col.ondragover = (e) => { e.preventDefault(); };

    // dragenter/leave counter to prevent rapid flicker when traversing child nodes
    if (!col.__dragCounter) col.__dragCounter = 0;
    col.ondragenter = (e) => {
      e.preventDefault();
      col.__dragCounter = (col.__dragCounter || 0) + 1;
      col.classList.add('drop-target');
    };
    col.ondragleave = (e) => {
      col.__dragCounter = (col.__dragCounter || 1) - 1;
      if (col.__dragCounter <= 0) {
        col.classList.remove('drop-target');
        col.__dragCounter = 0;
      }
    };

    // accept drops on the column (clear counter & class)
    col.ondrop = (e) => {
      e.preventDefault();
      col.__dragCounter = 0;
      col.classList.remove('drop-target');
      drop(e);
    };
  });
}

function renderListView(){
  const listsContainer = document.getElementById('lists'); if (!listsContainer) return;
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId) || (boardData.sprints[0] || null);
  if (!sprint) { listsContainer.innerHTML = '<div class="list-table"><em>Aucun sprint sélectionné</em></div>'; return; }

  const rows = [];
  // show ONLY parties/tasks for the selected pole (or all poles when 'all-poles' selected)
  const poleFilter = (selectedPoleId && selectedPoleId !== 'all-poles') ? selectedPoleId : null;

  // if sprint defines parties, render hierarchical parties -> tasks (tasks assigned via task.partieId)
  if (sprint.parties && sprint.parties.length){
    const addPartyNode = (party, parentCode, level) => {
      rows.push({ code: parentCode, level, title: party.name, type: 'Partie', partyId: party.id });
      // combine children parties and tasks assigned to this party (respect pole filter)
      const childParties = (party.children || []);
      const tasksAssigned = getTasksForParty(sprint, party.id, poleFilter);
      const combined = [ ...childParties.map(p => ({ kind: 'party', item: p })), ...tasksAssigned.map(t => ({ kind: 'task', item: t })) ];
      for (let i = 0; i < combined.length; i++){
        const node = combined[i];
        const code = `${parentCode}.${i+1}`;
        if (node.kind === 'party') addPartyNode(node.item, code, level+1);
        else {
          const task = node.item;
          rows.push({ code, level: level+1, title: task.title || '(sans titre)', type: 'Tâche', status: task.status || 'todo', assignees: task.assignees || [], taskId: task.id, desc: task.desc || '' });
        }
      }
    };

    // top-level parties (start numbering at 1 and level 0) — DO NOT show sprint/pole as headers
    (sprint.parties || []).forEach((p, idx) => addPartyNode(p, `${idx+1}`, 0));

    // catch-all: tasks without partie -> show under "Sans partie" (respect selected pole)
    const unassigned = [];
    (sprint.poles || []).forEach(p => (p.tasks || []).forEach(t => { if (!t.partieId && (!poleFilter || p.id === poleFilter)) unassigned.push(t); }));
    if (unassigned.length){
      const base = `${(sprint.parties || []).length + 1}`;
      rows.push({ code: base, level: 0, title: 'Sans partie', type: 'Partie' });
      unassigned.forEach((t, i) => rows.push({ code: `${base}.${i+1}`, level: 1, title: t.title, type: 'Tâche', status: t.status, assignees: t.assignees || [], taskId: t.id, desc: t.desc || '' }));
    }
  } else {
    // No parties defined: show tasks directly for the selected pole (or merged when 'all-poles') — do NOT render pole headers
    if (poleFilter) {
      const pole = sprint.poles.find(p => p.id === poleFilter) || { tasks: [] };
      (pole.tasks || []).forEach((task, tIdx) => {
        rows.push({ code: `${tIdx+1}`, level: 0, title: task.title || '(sans titre)', type: 'Tâche', status: task.status || 'todo', assignees: task.assignees || [], taskId: task.id, desc: task.desc || '' });
      });
    } else {
      // all poles: merge tasks sequentially
      let counter = 0;
      (sprint.poles || []).forEach(p => (p.tasks || []).forEach(task => {
        counter++;
        rows.push({ code: `${counter}`, level: 0, title: task.title || '(sans titre)', type: 'Tâche', status: task.status || 'todo', assignees: task.assignees || [], taskId: task.id, desc: task.desc || '' });
      }));
    }
  }

  // compute hasChildren and render table (same as before)
  rows.forEach((r, i) => { r.hasChildren = !!rows[i+1] && rows[i+1].level > r.level; });
  let html = '<table class="list-table">';
  html += '<thead><tr><th>WBS</th><th>Titre</th><th>Type</th><th>Statut</th><th>Assignés</th></tr></thead>';
  html += '<tbody>';
  rows.forEach((r, idx) => {
    const indent = r.level * 26;
    const caret = r.hasChildren ? `<i class="wbs-caret fa fa-chevron-down" data-row-index="${idx}"></i>` : '';
    const codeInline = `<span class=\"wbs-code-inline\">${escapeHtml(r.code)}</span>`;
    const titleHtml = `<div class=\"wbs-title\" style=\"padding-left:${indent}px\">${codeInline}${caret}<span class=\\"wbs-title-text\\">${escapeHtml(r.title)}</span></div>`;
    const descHtml = r.desc ? `<div class="small text-muted">${escapeHtml(r.desc)}</div>` : '';
    const statusHtml = r.status ? `<span class="badge status-${r.status}">${escapeHtml(r.status)}</span>` : '';
    const assigneesHtml = (r.assignees && r.assignees.length) ? r.assignees.map(a => `<span class="assignee-pill">${escapeHtml(a)}</span>`).join(' ') : '';
    const attrs = [];
    if (r.taskId) attrs.push(`data-task-id=\"${r.taskId}\"`);
    if (r.partyId) attrs.push(`data-party-id=\"${r.partyId}\"`);
    const extraAttr = attrs.length ? attrs.join(' ') : '';
    html += `<tr data-row-index=\"${idx}\" data-level=\"${r.level}\" ${extraAttr} class=\"wbs-row\">` +
            `<td class=\"wbs-code\"></td>` +
            `<td class="wbs-title-cell">${titleHtml}${descHtml}</td>` +
            `<td class="wbs-type">${escapeHtml(r.type || '')}</td>` +
            `<td class="wbs-status">${statusHtml}</td>` +
            `<td class="wbs-assignees">${assigneesHtml}</td>` +
            `</tr>`;
  });
  html += '</tbody></table>';
  listsContainer.innerHTML = html;

  // ensure footer stays empty (visual buttons removed)
  const footerOverride = document.getElementById('viewFooter'); if (footerOverride) footerOverride.innerHTML = '';

  // DEFAULT: collapse all parent nodes (hide their descendants)
  const tbodyEl = listsContainer.querySelector('tbody'); if (!tbodyEl) return;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].hasChildren) {
      const parentRow = tbodyEl.querySelector(`tr[data-row-index="${i}"]`);
      if (!parentRow) continue;
      parentRow.classList.add('collapsed');
      const lvl = rows[i].level;
      for (let j = i + 1; j < rows.length; j++) {
        if (rows[j].level <= lvl) break;
        const childRow = tbodyEl.querySelector(`tr[data-row-index="${j}"]`);
        if (childRow) childRow.style.display = 'none';
      }
      const caret = parentRow.querySelector('.wbs-caret'); if (caret) caret.classList.add('rotated');
    }
  }
  tbodyEl.querySelectorAll('tr').forEach(tr => {
    const rowIndex = parseInt(tr.getAttribute('data-row-index'), 10);
    const level = parseInt(tr.getAttribute('data-level'), 10) || 0;
    const taskId = tr.getAttribute('data-task-id');
    const partyId = tr.getAttribute('data-party-id');

    // left-click: rows with children toggle collapse; tasks open PREVIEW (edit only via context menu)
    tr.onclick = (ev) => {
      const rowData = rows[rowIndex] || {};
      // if row has children toggle collapse for the whole row
      if (rowData.hasChildren) {
        const isCollapsed = tr.classList.toggle('collapsed');
        for (let i = rowIndex + 1; i < rows.length; i++){
          const r = rows[i];
          const rowEl = tbodyEl.querySelector(`tr[data-row-index=\"${i}\"]`);
          if (!rowEl) continue;
          if (r.level <= rowData.level) break;
          rowEl.style.display = isCollapsed ? 'none' : '';
        }
        const caret = tr.querySelector('.wbs-caret'); if (caret) caret.classList.toggle('rotated', isCollapsed);
        return;
      }

      // otherwise if it's a task open preview modal (no inline edit)
      if (taskId) {
        openPreviewModal(taskId);
      }
    };

    // right-click (context menu) handling
    tr.oncontextmenu = (ev) => {
      ev.preventDefault();
      const x = ev.pageX, y = ev.pageY;
      if (partyId) {
        showContextMenu([
          { label: 'Ajouter une tâche', onClick: () => { pendingAddPartieId = partyId; pendingAddStatus = 'todo'; openTaskModal('todo'); } },
          { label: 'Modifier la partie', onClick: () => {
            const current = tr.querySelector('.wbs-title-text')?.textContent || '';
            const v = prompt('Nouveau nom de la partie', current);
            if (v && v.trim()) { renamePartyById(sprint.parties || [], partyId, v.trim()); saveData(); renderBoard(); }
          } },
          { label: 'Supprimer la partie (avec enfants)', onClick: () => {
            if (confirm('Supprimer cette partie et toutes ses sous‑parties ?')){ deletePartyAndUnassignTasks(sprint, partyId); renderBoard(); }
          } }
        ], x, y);
      } else if (taskId) {
        showContextMenu([
          { label: 'Modifier la tâche', onClick: () => openEditModal(taskId) },
          { label: 'Supprimer la tâche', onClick: () => { if (confirm('Supprimer cette tâche ?')) deleteTask(taskId); } }
        ], x, y);
      }
    };

    const caretEl = tr.querySelector('.wbs-caret');
    if (caretEl) {
      caretEl.style.cursor = 'pointer';
      caretEl.onclick = (ev) => {
        ev.stopPropagation();
        const isCollapsed = tr.classList.toggle('collapsed');
        for (let i = rowIndex + 1; i < rows.length; i++){
          const r = rows[i];
          const rowEl = tbodyEl.querySelector(`tr[data-row-index=\"${i}\"]`);
          if (!rowEl) continue;
          if (r.level <= level) break;
          rowEl.style.display = isCollapsed ? 'none' : '';
        }
        caretEl.classList.toggle('rotated', isCollapsed);
      };
    }
  });

  // WBS footer: scope toggle + export + hint
  const footer = document.getElementById('viewFooter');
  if (footer) {
    footer.innerHTML = `\n      <div class="d-flex gap-2 align-items-center">\n        <button id="wbsScopeBtn" class="view-add-btn btn-sm" title="Basculer portée WBS">${wbsOnlyPoleView ? '<i class="fa-solid fa-filter"></i> Pôle uniquement' : '<i class="fa-solid fa-sitemap"></i> Sprint entier'}</button>\n        <button id="exportWbsBtn" class="view-add-btn btn-sm"><i class="fa-solid fa-file-export"></i> Exporter WBS (JSON)</button>\n      </div>\n    `;
    const scopeBtn = document.getElementById('wbsScopeBtn'); if (scopeBtn) scopeBtn.onclick = () => { wbsOnlyPoleView = !wbsOnlyPoleView; renderView(); };
    const exportBtn = document.getElementById('exportWbsBtn'); if (exportBtn) exportBtn.onclick = () => { const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${sprint.id}_wbs.json`; a.click(); URL.revokeObjectURL(url); };
  }
}
// small HTML-escape helper to avoid accidental injection from task titles/descriptions
function escapeHtml(str){
  if (!str && str !== 0) return '';
  return String(str).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[ch]));
}

function renderGanttView(){
  const listsContainer = document.getElementById('lists'); if (!listsContainer) return;
  listsContainer.innerHTML = '<div class="gantt-empty-note">Diagramme de Gantt non implémenté (placeholder)</div>';
}


// --- Context menu helpers (created once) ---
let __contextMenuEl = null;
function ensureContextMenu(){
  if (__contextMenuEl) return __contextMenuEl;
  const el = document.createElement('div'); el.id = 'contextMenu'; el.className = 'context-menu'; el.style.display = 'none'; document.body.appendChild(el); __contextMenuEl = el;
  document.addEventListener('click', () => { el.style.display = 'none'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.style.display = 'none'; });
  return el;
}
function showContextMenu(items, x, y){
  const menu = ensureContextMenu();
  menu.innerHTML = items.map((it, i) => `<div class=\"context-menu-item\" data-idx=\"${i}\">${it.label}</div>`).join('');
  menu.style.left = (x + 2) + 'px'; menu.style.top = (y + 2) + 'px'; menu.style.display = 'block';
  menu.querySelectorAll('.context-menu-item').forEach(el => { el.onclick = () => { const idx = Number(el.getAttribute('data-idx')); menu.style.display = 'none'; try{ items[idx].onClick(); } catch(e){ console.error(e); } }; });
}
function hideContextMenu(){ if (__contextMenuEl) __contextMenuEl.style.display = 'none'; }

// party utilities: collect/remove/rename
function collectPartyIds(node, out){ out.push(node.id); (node.children||[]).forEach(c => collectPartyIds(c, out)); }
function removePartyById(list, id){
  for (let i = 0; i < list.length; i++){
    if (list[i].id === id) { const removed = []; collectPartyIds(list[i], removed); list.splice(i,1); return removed; }
    const child = removePartyById(list[i].children||[], id);
    if (child) return child;
  }
  return null;
}
function renamePartyById(list, id, newName){
  for (const p of list){ if (p.id === id){ p.name = newName; return true; } if (p.children && renamePartyById(p.children, id, newName)) return true; }
  return false;
}
function deletePartyAndUnassignTasks(sprint, partyId){
  const removed = removePartyById(sprint.parties || [], partyId);
  if (!removed) return false;
  (sprint.poles || []).forEach(p => (p.tasks || []).forEach(t => { if (t.partieId && removed.indexOf(t.partieId) !== -1) t.partieId = null; }));
  saveData();
  return true;
}

function moveTaskToList(taskId, dest){
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId);
  if (!sprint) return;

  if (STATUSES.includes(dest)){
    for (const pole of sprint.poles){
      const t = pole.tasks.find(x => x.id === taskId);
      if (t){ t.status = dest; saveData(); renderView(); renderPoleTabs(); return; }
    }
    return;
  }
  
  // move to another pole
  let foundPole = null; let taskIndex = -1;
  for (const p of sprint.poles){
    taskIndex = p.tasks.findIndex(x => x.id === taskId);
    if (taskIndex !== -1){ foundPole = p; break; }
  }
  if (!foundPole) return;
  const [task] = foundPole.tasks.splice(taskIndex, 1);
  const destPole = sprint.poles.find(p => p.id === dest);
  if (!destPole) return;
  destPole.tasks.push(task);
  saveData(); renderBoard(); renderPoleTabs();
}

function deleteTask(taskId){
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId);
  if (!sprint) return;
  for (const pole of sprint.poles){
    const idx = pole.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1){
      pole.tasks.splice(idx,1);
      saveData();
      renderView();
      renderPoleTabs();
      return;
    }
  }
}

function saveData(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boardData));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      showErrorMessage("Erreur : L'espace de stockage local est plein. Impossible de sauvegarder les modifications.");
    } else {
      showErrorMessage("Une erreur est survenue lors de la sauvegarde des données.");
    }
    console.error(e);
  }
}

async function init() {
  await loadData();
  // setup view mode buttons
  const btnKanban = document.getElementById('viewBtnKanban'); if (btnKanban) btnKanban.onclick = () => setViewMode('kanban');
  const btnList = document.getElementById('viewBtnList'); if (btnList) btnList.onclick = () => setViewMode('list');
  const btnGantt = document.getElementById('viewBtnGantt'); if (btnGantt) btnGantt.onclick = () => setViewMode('gantt');
  updateViewButtons();
  renderBoard();

  // global resize handler to recompute Gantt when active (debounced)
  const debouncedGanttResize = (() => {
    let t = null;
    return () => { clearTimeout(t); t = setTimeout(() => { if (viewMode === 'gantt') renderGanttView(); }, 140); };
  })();
  window.addEventListener('resize', debouncedGanttResize);
}

// Load initial data from localStorage or fallback resources.json
async function loadData(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      boardData = JSON.parse(raw);
    } else {
      const resp = await fetch('resources.json');
      if (resp.ok) {
        boardData = await resp.json();
      } else {
        boardData = { sprints: [] };
      }
    }
  } catch (e) {
    console.error('Error loading data', e);
    boardData = { sprints: [] };
  }
  if (!boardData.sprints) boardData.sprints = [];
  normalizeBoardIcons(boardData);

  // --- migrate / sanitize board data (fix localStorage stale state) ---
  const migrateBoardData = () => {
    // ensure sprint-quai contains all DEFAULT_POLES (no tasks)
    const quai = boardData.sprints.find(s => s.id === 'sprint-quai');
    if (quai) {
      quai.poles = DEFAULT_POLES.map(p => ({ id: p.id, tasks: [] }));
    }
    // remove legacy lists property if exists
    if (boardData.lists) delete boardData.lists;
  };
  migrateBoardData();

  // persist migration so localStorage stays consistent
  try { saveData(); } catch(e) { /* non-fatal */ }

  // ensure selected sprint/pole are valid after migration
  if (!selectedSprintId && boardData.sprints.length > 0) selectedSprintId = boardData.sprints[0].id;
  const currentSprint = boardData.sprints.find(s => s.id === selectedSprintId) || boardData.sprints[0] || null;
  if (currentSprint && (!selectedPoleId || !currentSprint.poles.find(p => p.id === selectedPoleId))) {
    selectedPoleId = (currentSprint.poles && currentSprint.poles.length > 0) ? currentSprint.poles[0].id : null;
  }

  // build members list for modal
  buildAvailableMembers();
}

function normalizeBoardIcons(bd){
  bd.sprints = bd.sprints || [];
  bd.sprints.forEach(s => {
    s.poles = s.poles || [];
    s.poles.forEach(p => {
      if (!p.icon) p.icon = 'fa-solid fa-circle';
      if (!p.color) p.color = '#666';
      p.tasks = p.tasks || [];
      p.tasks.forEach(t => { t.assignees = t.assignees || []; });
    });
    // ensure parties array exists for new format compatibility
    s.parties = s.parties || [];
  });
}

// Flatten parties for select / traversal (pre-order)
function flattenParties(parties, level = 0, out = []){
  (parties || []).forEach(p => {
    out.push({ id: p.id, name: p.name, level });
    if (p.children && p.children.length) flattenParties(p.children, level+1, out);
  });
  return out;
}

// return tasks (from all poles) assigned to a party id for a given sprint
function getTasksForParty(sprint, partieId, poleFilter){
  const list = [];
  if (!sprint) return list;
  (sprint.poles || []).forEach(p => (p.tasks || []).forEach(t => { if (t.partieId === partieId && (!poleFilter || p.id === poleFilter)) list.push(Object.assign({}, t, { _poleId: p.id })); }));
  return list;
}

// populate the partie selector in the task modal (or hide if no parties)
function renderPartiesSelect(sprint, selectedId){
  const group = document.getElementById('taskPartieGroup');
  const sel = document.getElementById('taskPartieSelect');
  if (!sel || !group) return;
  const flat = flattenParties((sprint && sprint.parties) || []);
  if (!flat || flat.length === 0) {
    group.style.display = 'none';
    sel.innerHTML = '<option value="">— Aucune —</option>';
    return;
  }
  group.style.display = 'block';
  sel.innerHTML = '<option value="">— Aucune —</option>' + flat.map(p => `<option value="${p.id}">${'\u00A0'.repeat(p.level*2)}${escapeHtml(p.name)}</option>`).join('');
  if (selectedId) sel.value = selectedId; else sel.value = '';
}

// find a party by id (recursive)
function findPartyById(list, id){
  if (!list) return null;
  for (const p of list){ if (p.id === id) return p; const found = findPartyById(p.children, id); if (found) return found; }
  return null;
} 

// Build a list of available members from tasks and render the assignee selector
function buildAvailableMembers(){
  const set = new Set();
  boardData.sprints.forEach(s => (s.poles || []).forEach(p => (p.tasks || []).forEach(t => (t.assignees || []).forEach(a => set.add(a)))));
  const members = Array.from(set).sort();
  window.availableMembers = members;
  const container = document.getElementById('taskAssigneesContainer');
  if (!container) return;
  container.innerHTML = '';
  members.forEach(name => {
    const item = document.createElement('div'); item.className = 'assignee-item';
    const img = document.createElement('img'); img.className = 'assignee-pfp'; img.src = `https://i.pravatar.cc/40?u=${encodeURIComponent(name)}`;
    const span = document.createElement('span'); span.className = 'assignee-name'; span.textContent = name;
    item.appendChild(img); item.appendChild(span);
    item.onclick = () => {
      const idx = modalAssignees.indexOf(name);
      if (idx === -1) modalAssignees.push(name); else modalAssignees.splice(idx,1);
      item.classList.toggle('selected', idx === -1);
    };
    container.appendChild(item);
  });
}

function initAssigneeSelector(){ buildAvailableMembers(); }

// drop handler for kanban columns
function drop(ev){
  ev.preventDefault();
  const data = ev.dataTransfer && ev.dataTransfer.getData && ev.dataTransfer.getData('text/plain');
  if (!data) return;
  // container id is like 'todo-list' -> extract status
  const id = ev.currentTarget && ev.currentTarget.id ? ev.currentTarget.id : '';
  const status = id.replace(/-list$/, '');
  if (STATUSES.includes(status)) moveTaskToList(data, status);
}

window.drop = drop;

function exportJSON() {
  const dataStr = JSON.stringify(boardData, null, 2);
  const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
  const exportFileDefaultName = 'board_export.json';
  const linkElement = document.createElement('a');
  linkElement.setAttribute('href', dataUri);
  linkElement.setAttribute('download', exportFileDefaultName);
  linkElement.click();
}

function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');
    reader.onload = readerEvent => {
      const content = readerEvent.target.result;
      try {
        const newBoardData = JSON.parse(content);
        
        boardData = newBoardData;
        
        normalizeBoardIcons(boardData);
        saveData();
        renderBoard();
      } catch (err) {
        console.error("Error parsing JSON file", err);
        alert("Error: Could not import this file. Make sure it is a valid JSON file.");
      }
    }
  }
  input.click();
}

function saveModalTask() {
  const titleEl = document.getElementById('taskTitle');
  const descEl = document.getElementById('taskDesc');
  const title = titleEl ? titleEl.value.trim() : '';
  const desc = descEl ? descEl.value.trim() : '';
  if (!title) {
    alert('Veuillez saisir un titre');
    return;
  }

  const assignees = modalAssignees.slice();
  const dueDateInput = document.getElementById('taskDueDate');
  const dueDate = dueDateInput && dueDateInput.value ? new Date(dueDateInput.value).toISOString() : null;
  const partieSelect = document.getElementById('taskPartieSelect');
  const partieId = partieSelect && partieSelect.value ? partieSelect.value : null;

  if (editingTaskId) {
    updateTask(editingTaskId, title, desc, assignees, dueDate, modalImages, partieId);
  } else {
    createTask(title, desc, assignees, dueDate, modalImages, partieId);
  }
  finishSave();
} 

function finishSave() {
  saveData();
  buildAvailableMembers();

  const modalEl = document.getElementById('taskModal');
  const modal = bootstrap.Modal.getInstance(modalEl);
  if (modal) modal.hide();

  editingTaskId = null;
  pendingAddStatus = null;
  modalFiles = [];
  modalImages = [];
  renderView();
  renderPoleTabs();
}

function createTask(title, desc, assignees, dueDate, images, partieId) {
  const status = pendingAddStatus || 'todo';
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId);
  const pole = sprint ? sprint.poles.find(p => p.id === selectedPoleId) : null;
  if (!pole) {
    alert('Aucun pôle sélectionné');
    return;
  }

  const id = `t${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
  
  const existingTitles = pole.tasks.map(t => t.title);
  const uniqueTitle = makeUniqueName(title, existingTitles);
  const taskObj = { id, title: uniqueTitle, desc, status, assignees, dueDate, files: modalFiles.slice(), images, partieId: partieId || null };
  // If user provided a dueDate but no explicit start/end, set them to the dueDate so Gantt shows it
  if (dueDate && !taskObj.startDate && !taskObj.endDate) {
    taskObj.startDate = dueDate;
    taskObj.endDate = dueDate;
  }
  pole.tasks.push(taskObj);
} 

function updateTask(taskId, title, desc, assignees, dueDate, images, partieId) {
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId);
  if (!sprint) return;
  for (const pole of sprint.poles) {
    const task = pole.tasks.find(t => t.id === taskId);
    if (task) {
      const otherTitles = pole.tasks.filter(t => t.id !== taskId).map(t => t.title);
      task.title = makeUniqueName(title, otherTitles);
      task.desc = desc;
      task.assignees = assignees;
      task.dueDate = dueDate;
      task.partieId = partieId || null;
      // Ensure Gantt dates are set when dueDate is provided and start/end are missing
      if (dueDate && !task.startDate && !task.endDate) {
        task.startDate = dueDate;
        task.endDate = dueDate;
      }
      task.files = modalFiles.slice();
      task.images = images;
      return;
    }
  }
} 

function openEditModal(taskId) {
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId);
  if (!sprint) return;
  let task = null;
  let parentPole = null;
  for (const pole of sprint.poles) {
    task = pole.tasks.find(t => t.id === taskId);
    if (task) {
      parentPole = pole;
      break;
    }
  }
  if (!task) return;

  editingTaskId = taskId;

  document.getElementById('task-modal-actions').style.display = 'flex';
  document.getElementById('task-modal-close-btn').style.display = 'none';

  const modalDeleteBtn = document.getElementById('modalTaskDelete');
  if (modalDeleteBtn) {
    modalDeleteBtn.onclick = () => {
      if (confirm('Supprimer cette ressource ?')) {
        const modalEl = document.getElementById('taskModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        deleteTask(taskId);
      }
    };
  }

  document.getElementById('modalTitle').textContent = 'Modifier la ressource';
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDesc').value = task.desc || '';
  document.getElementById('taskDueDate').value = task.dueDate ? task.dueDate.split('T')[0] : '';

  // parties selector (if sprint defines parties)
  const sprintForEdit = boardData.sprints.find(s => s.id === selectedSprintId);
  renderPartiesSelect(sprintForEdit, task.partieId || null);
  
  

  const imagePreview = document.getElementById('taskImagePreview');
  const imageChooserInner = document.querySelector('.image-chooser-inner');
  imagePreview.innerHTML = '';
  modalImages = task.images || [];
  if (modalImages.length > 0) {
    modalImages.forEach((image, index) => {
      const imgContainer = document.createElement('div');
      imgContainer.className = 'gallery-item';
      const img = document.createElement('img');
      img.src = image;
      img.className = 'img-fluid';
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '&times;';
      removeBtn.className = 'btn btn-danger btn-sm remove-img-btn';
      removeBtn.onclick = () => {
        modalImages.splice(index, 1);
        openEditModal(taskId);
      }
      imgContainer.appendChild(img);
      imgContainer.appendChild(removeBtn);
      imagePreview.appendChild(imgContainer);
    });
    imageChooserInner.style.display = 'none';
    imagePreview.style.display = 'flex';
  } else {
    imageChooserInner.style.display = 'block';
    imagePreview.style.display = 'none';
  }

  modalAssignees = [...(task.assignees || [])];
  modalFiles = [...(task.files || [])];

  const filesList = document.getElementById('taskFilesList');
  filesList.innerHTML = '';
  modalFiles.forEach(file => {
    const div = document.createElement('div');
    div.className = 'small text-muted';
    div.textContent = file.name;
    const rem = document.createElement('button');
    rem.className = 'btn btn-sm btn-link text-danger ms-2';
    rem.textContent = 'Suppr';
    rem.onclick = () => {
      modalFiles = modalFiles.filter(f => f.name !== file.name);
      div.remove();
    };
    div.appendChild(rem);
    filesList.appendChild(div);
  });
  
  const modal = new bootstrap.Modal(document.getElementById('taskModal'));
  modal.show();
}

// open preview (view) modal for a task (left-click behaviour)
function openPreviewModal(taskId){
  const sprint = boardData.sprints.find(s => s.id === selectedSprintId);
  if (!sprint) return;
  let task = null; let parentPole = null;
  for (const pole of sprint.poles){ task = pole.tasks.find(t=>t.id===taskId); if (task){ parentPole = pole; break; } }
  if (!task) return;

  const titleEl = document.getElementById('viewModalTitle'); if (titleEl) titleEl.textContent = task.title;
  document.querySelectorAll('#viewList').forEach(el => { el.textContent = parentPole ? `${parentPole.id} · ${task.id}` : task.id; });
  const dueEl = document.getElementById('viewDueDate'); if (dueEl) dueEl.textContent = task.dueDate ? `Date limite : ${new Date(task.dueDate).toLocaleDateString()}` : '';

  const assEl = document.getElementById('viewAssignees'); if (assEl){ assEl.innerHTML = ''; (task.assignees||[]).forEach(a=>{ const img = document.createElement('img'); img.className = 'assignee-pfp me-2'; img.src = `https://i.pravatar.cc/32?u=${encodeURIComponent(a)}`; const span = document.createElement('span'); span.className = 'assignee-name me-3 small text-muted'; span.textContent = a; assEl.appendChild(img); assEl.appendChild(span); }); }

  const descEl = document.getElementById('viewDesc'); if (descEl) descEl.textContent = task.desc || '';

  const imgPreview = document.getElementById('viewImagePreview'); if (imgPreview){ imgPreview.innerHTML = ''; (task.images||[]).forEach(src=>{ const i = document.createElement('img'); i.src = src; i.className = 'img-fluid mb-2'; imgPreview.appendChild(i); }); const carousel = document.getElementById('viewImageCarousel'); if (carousel) carousel.style.display = (task.images && task.images.length) ? 'flex' : 'none'; }

  const filesEl = document.getElementById('viewFiles'); if (filesEl){ filesEl.innerHTML = ''; (task.files||[]).forEach(f=>{ const a = document.createElement('a'); a.href = '#'; a.textContent = f.name; a.className = 'd-block small'; filesEl.appendChild(a); }); }

  // preview is VIEW-ONLY by default: hide edit/delete buttons (edit via context menu only)
  const editBtn = document.getElementById('taskEdit'); if (editBtn) { editBtn.style.display = 'none'; editBtn.onclick = null; }
  const delBtn = document.getElementById('taskDelete'); if (delBtn) { delBtn.style.display = 'none'; delBtn.onclick = null; }

  const modal = new bootstrap.Modal(document.getElementById('viewModal'));
  modal.show();
}

function openTaskModal(status) {
  pendingAddStatus = status;
  editingTaskId = null;
  
  document.getElementById('task-modal-actions').style.display = 'none';
  document.getElementById('task-modal-close-btn').style.display = 'block';

  document.getElementById('modalTitle').textContent = 'Ajouter une ressource';
  
  
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskDueDate').value = '';
  document.getElementById('taskFilesList').innerHTML = '';
  document.getElementById('taskFilesInput').value = '';
  document.getElementById('taskImageInput').value = '';
  document.getElementById('taskImagePreview').innerHTML = '';
  
  const imageChooserInner = document.querySelector('.image-chooser-inner');
  imageChooserInner.style.display = 'block';
  document.getElementById('taskImagePreview').style.display = 'none';

  modalFiles = [];
  modalAssignees = [];
  modalImages = [];

  // populate parties selector for new task (support right-click preselect)
  const sprintForNew = boardData.sprints.find(s => s.id === selectedSprintId);
  renderPartiesSelect(sprintForNew, pendingAddPartieId || null);
  pendingAddPartieId = null; 

  const modal = new bootstrap.Modal(document.getElementById('taskModal'));
  modal.show();
  
  setTimeout(() => { 
    const titleInput = document.getElementById('taskTitle');
    if (titleInput) titleInput.focus();
  }, 120);
}

 

window.onload = () => {
  
  
  const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
  let authMode = 'login';
  function prepareAuthModal(mode){
    authMode = mode;
    const modalTitle = document.querySelector('#loginModal .modal-title');
    const primaryBtn = document.getElementById('loginSubmit');
    if (modalTitle) modalTitle.textContent = (mode === 'signup') ? 'Créer un compte' : 'Connexion';
    if (primaryBtn) primaryBtn.textContent = (mode === 'signup') ? 'Créer le compte' : 'Connexion';
    const u = document.getElementById('usernameInput');
    const p = document.getElementById('passwordInput');
    if (u) u.value = '';
    if (p) p.value = '';
    const signupExtras = document.getElementById('signupExtras');
    if (signupExtras) {
      if (mode === 'signup') {
        signupExtras.classList.remove('d-none');
      } else {
        signupExtras.classList.add('d-none');
        const c = document.getElementById('confirmPasswordInput'); if (c) c.value = '';
        const pfpInput = document.getElementById('signupPfpInput'); if (pfpInput) pfpInput.value = '';
        const preview = document.getElementById('signupPfpPreview'); if (preview) { preview.src = ''; preview.classList.add('d-none'); }
        const chooserBtn = document.querySelector('.pfp-chooser-btn'); if (chooserBtn) chooserBtn.classList.remove('has-image');
        signupPfpData = null;
      }
    }
    const pfpWrapper = document.getElementById('signupPfpWrapper');
    if (pfpWrapper) {
      if (mode === 'signup') pfpWrapper.classList.remove('d-none'); else pfpWrapper.classList.add('d-none');
    }
  }
  document.getElementById('downloadJsonBtn').onclick = () => { exportJSON(); };

  document.getElementById('loginSubmit').onclick = () => {
    const username = (document.getElementById('usernameInput').value || '').trim();
    const password = document.getElementById('passwordInput').value || '';
    if (authMode === 'login'){
      if (username === 'admin' && password === 'admin') {
        loginModal.hide();
        const adminBtn = document.getElementById('admin-buttons'); if (adminBtn) adminBtn.style.display = 'flex';
        const downloadJsonBtnEl = document.getElementById('downloadJsonBtn'); if (downloadJsonBtnEl) downloadJsonBtnEl.style.display = 'none';
      } else {
        alert('Nom d\'utilisateur ou mot de passe incorrect');
      }
    } else {
      // signup flow: validate confirm password and store a demo user with optional pfp
      const confirm = (document.getElementById('confirmPasswordInput') && document.getElementById('confirmPasswordInput').value) || '';
      if (!username || !password) { alert('Veuillez fournir un nom d\'utilisateur et un mot de passe'); return; }
      if (password !== confirm) { alert('Les mots de passe ne correspondent pas'); return; }
      const users = JSON.parse(localStorage.getItem('ynov_users_v1') || '[]');
      if (users.find(u=>u.username === username)) { alert('Nom d\'utilisateur déjà utilisé'); return; }
      users.push({ username, password, pfp: signupPfpData || null });
      localStorage.setItem('ynov_users_v1', JSON.stringify(users));
      loginModal.hide();
      alert('Compte créé pour: ' + username);
    }
  };

  document.getElementById('togglePassword').onclick = () => {
    const passwordInput = document.getElementById('passwordInput');
    const icon = document.querySelector('#togglePassword i');
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
    } else {
      passwordInput.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
    }
  };
  const toggleConfirm = document.getElementById('toggleConfirmPassword');
  if (toggleConfirm) toggleConfirm.onclick = () => {
    const input = document.getElementById('confirmPasswordInput');
    const icon = document.querySelector('#toggleConfirmPassword i');
    if (!input) return;
    if (input.type === 'password') { input.type = 'text'; icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
  };

  const pfpInput = document.getElementById('signupPfpInput');
  const pfpPreview = document.getElementById('signupPfpPreview');
  if (pfpInput) {
    pfpInput.onchange = e => {
      const file = e.target.files && e.target.files[0];
      const chooserBtn = document.querySelector('.pfp-chooser-btn');
      if (!file) {
        signupPfpData = null;
        if (pfpPreview) { pfpPreview.src=''; pfpPreview.classList.add('d-none'); }
        if (chooserBtn) chooserBtn.classList.remove('has-image');
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        signupPfpData = ev.target.result;
        if (pfpPreview) { pfpPreview.src = signupPfpData; pfpPreview.classList.remove('d-none'); }
        if (chooserBtn) chooserBtn.classList.add('has-image');
      };
      reader.readAsDataURL(file);
    };
  }

  // Ensure pfp chooser is placed under username: when signup mode toggles, show wrapper
  const signupPfpWrapper = document.getElementById('signupPfpWrapper');
  if (signupPfpWrapper) {
    // no-op here: visibility handled in prepareAuthModal
  }
  // signup uses same modal; signup button handler set above
  
  const saveBtn = document.getElementById('taskSave');
  if (saveBtn) saveBtn.onclick = saveModalTask;
  const formEl = document.getElementById('taskForm');
  if (formEl) formEl.onsubmit = (e) => { e.preventDefault(); saveModalTask(); };
  
  
  const filesInput = document.getElementById('taskFilesInput');
  const filesListEl = document.getElementById('taskFilesList');
  if (filesInput) {
    filesInput.onchange = e => {
      const files = Array.from(e.target.files);
      modalFiles = [];
      if (filesListEl) filesListEl.innerHTML = '';
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          modalFiles.push({ name: file.name, size: file.size, type: file.type, data: ev.target.result });
          if (filesListEl) {
            const div = document.createElement('div');
            div.className = 'small text-muted';
            div.textContent = file.name;
            const rem = document.createElement('button'); rem.className = 'btn btn-sm btn-link text-danger ms-2'; rem.textContent = 'Suppr';
            rem.onclick = () => { modalFiles = modalFiles.filter(f => f.name !== file.name); div.remove(); filesInput.value = ''; };
            div.appendChild(rem);
            filesListEl.appendChild(div);
          }
        };
        reader.readAsDataURL(file);
      });
    };
  }

  const imageInput = document.getElementById('taskImageInput');
  const imagePreview = document.getElementById('taskImagePreview');
  const imageChooserInner = document.querySelector('.image-chooser-inner');

  if (imageInput) {
    imageInput.onchange = e => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        imageChooserInner.style.display = 'none';
        imagePreview.style.display = 'flex';
      }
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
          modalImages.push(ev.target.result);
          const imgContainer = document.createElement('div');
          imgContainer.className = 'gallery-item';
          const img = document.createElement('img');
          img.src = ev.target.result;
          img.className = 'img-fluid';
          const removeBtn = document.createElement('button');
          removeBtn.innerHTML = '&times;';
          removeBtn.className = 'btn btn-danger btn-sm remove-img-btn';
          removeBtn.onclick = () => {
            modalImages = modalImages.filter(img => img !== ev.target.result);
            imgContainer.remove();
            if(modalImages.length === 0) {
              imageChooserInner.style.display = 'block';
              imagePreview.style.display = 'none';
            }
          }
          imgContainer.appendChild(img);
          imgContainer.appendChild(removeBtn);
          imagePreview.appendChild(imgContainer);
        };
        reader.readAsDataURL(file);
      });
    };
  }
  
  init();
  
  initAssigneeSelector();
  
  const viewModalEl = document.getElementById('viewModal');
  if (viewModalEl) viewModalEl.addEventListener('hidden.bs.modal', () => { const edit = document.getElementById('taskEdit'); if (edit) edit.style.display = 'none'; const db = document.getElementById('taskDelete'); if (db) db.style.display = 'none'; });

  const taskModalEl = document.getElementById('taskModal');
  if (taskModalEl) {
      taskModalEl.addEventListener('hidden.bs.modal', () => {
          
          document.getElementById('task-modal-actions').style.display = 'none';
          document.getElementById('task-modal-close-btn').style.display = 'block';
      });
  }


};

window.drop = drop;

 
