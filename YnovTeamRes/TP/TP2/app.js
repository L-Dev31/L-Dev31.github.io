let editingTaskId = null;

window.openViewModal = function(taskId) {
  const pole = boardData.lists.find(l => l.tasks.some(t => t.id === taskId));
  if (!pole) return;
  const task = pole.tasks.find(t => t.id === taskId);
  if (!task) return;

  document.getElementById('viewModalTitle').textContent = task.title;
  document.getElementById('viewDesc').textContent = task.desc || '';
  document.getElementById('viewList').textContent = `Dans la liste: ${pole.name}`;
  // Render assignees
  const assigneesArea = document.getElementById('viewAssignees');
  if (assigneesArea) { assigneesArea.innerHTML = ''; const arr = task.assignees || []; arr.forEach(a=>{ const span = document.createElement('span'); span.className = 'assignee-tag'; span.title = a; span.textContent = a.split(' ').map(x=>x[0]).join('').toUpperCase(); assigneesArea.appendChild(span); }); }
  // Render due date
  const dueEl = document.getElementById('viewDueDate'); if (dueEl) { dueEl.textContent = task.dueDate ? `Date limite: ${new Date(task.dueDate).toLocaleDateString()}` : ''; }
  // Render files
  const filesArea = document.getElementById('viewFiles');
  if (filesArea) { filesArea.innerHTML = ''; (task.files||[]).forEach((f, i)=>{ const row = document.createElement('div'); row.className = 'attachment-row'; const a = document.createElement('a'); a.href = f.data || '#'; a.download = f.name; a.textContent = f.name; a.className = 'small text-muted'; row.appendChild(a); filesArea.appendChild(row); }); }
  
  const viewModal = new bootstrap.Modal(document.getElementById('viewModal'));
  viewModal.show();

  const deleteBtn = document.getElementById('taskDelete');
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      if (confirm('Supprimer cette ressource ?')) {
        deleteTask(taskId);
        viewModal.hide();
      }
    };
  }

  const editBtn = document.getElementById('taskEdit');
  if (editBtn) {
    editBtn.onclick = () => {
      viewModal.hide();
      openEditModal(taskId);
    };
  }
}

window.clearBoard = function() {
  // TODO: Implement a confirmation before clearing
  localStorage.removeItem(STORAGE_KEY);
  boardData = defaultData();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boardData));
  selectedPoleId = null; // Reset selected pole
  renderBoard();
}

// app.js - Load lists from JSON, render columns, implement simple drag/drop and persistence
const DATA_URL = 'resources.json';
const STORAGE_KEY = 'ynov_trello_resources_v1';

let boardData = null;
let isDragging = false;
let selectedPoleId = null; // currently selected pole id
const STATUSES = ['todo','doing','done'];
let pendingAddStatus = null; // when clicking add button on a column, this stores the target status
let modalFiles = []; // temporary files added into the modal before saving
let modalAssignees = []; // selection when creating/adding a task
let AVAILABLE_MEMBERS = [];

// Default icon map for poles / lists
const ICON_MAP = {
  'creatif-artistique': 'fa-solid fa-paint-brush',
  'systeme-dev': 'fa-solid fa-code',
  'audiovisuel-marketing': 'fa-solid fa-bullhorn',
  '3d-animation': 'fa-solid fa-cube'
    ,'administration': 'fa-solid fa-file-lines'
};

// Normalize icons on a board to ensure every list has an icon string
function normalizeBoardIcons(board){
  if (!board || !Array.isArray(board.lists)) return;
  board.lists.forEach(l => {
    if (!l.icon || l.icon === 'undefined' || l.icon === 'null') l.icon = ICON_MAP[l.id] || 'fa-solid fa-circle';
  });
}

// Helper function to convert hex to rgba
function hexToRgb(hex) {
    if (!hex) return '0,0,0';
    let c;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x'+c.join('');
        return [(c>>16)&255, (c>>8)&255, c&255].join(',');
    }
    throw new Error('Bad Hex');
}


async function loadData() {
  // Try to load from localStorage first
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    boardData = JSON.parse(saved);
    normalizeBoardIcons(boardData);
    // Ensure 'administration' default list exists so new users see it even if localStorage is from an old version
    if (!boardData.lists.some(l => l.id === 'administration')){
      boardData.lists.push({ id: 'administration', name: 'Administration', color: '#6c757d', icon: ICON_MAP['administration'], tasks: [] });
    }
    // Persist normalization so missing icons aren't reintroduced
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boardData));
    return;
  }
  // Otherwise try to fetch resources.json
  try {
    const resp = await fetch(DATA_URL);
    if (!resp.ok) throw new Error('fetch fail');
    boardData = await resp.json();
    // ensure tasks have a status (default to 'todo')
    boardData.lists.forEach(l => l.tasks.forEach(t => { if (!t.status) t.status = 'todo'; }));
    // ensure lists have icons (from JSON or fallback map)
    normalizeBoardIcons(boardData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boardData));
    return;
  } catch (e) {
    console.warn('Could not fetch resources.json; falling back to inlined sample');
    // fallback to embedded default in case fetch fails. (Should not happen when serving its files.)
    boardData = defaultData();
    boardData.lists.forEach(l => l.tasks.forEach(t => { if (!t.status) t.status = 'todo'; }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boardData));
  }
}

function defaultData(){
  return {
    lists:[
      {id:'creatif-artistique', name:'Créatif', color:'#28a745', icon: ICON_MAP['creatif-artistique'], tasks:[{id:'c1',title:'Moodboard & Inspiration',desc:'Collect references for the project', status:'todo', assignees:['Alice Martin'], dueDate: null, files: []}]},
      {id:'systeme-dev', name:'Système Dev', color:'#0d6efd', icon: ICON_MAP['systeme-dev'], tasks:[{id:'s1',title:'Setup repo',desc:'Initialize repository and CI', status:'todo'}]},
      {id:'audiovisuel-marketing', name:'AMC', color:'#fd7e14', icon: ICON_MAP['audiovisuel-marketing'], tasks:[{id:'a1',title:'Promo video',desc:'Short trailer for social media', status:'todo'}]},
      {id:'3d-animation', name:'3D Animation', color:'#6f42c1', icon: ICON_MAP['3d-animation'], tasks:[{id:'d1',title:'Modeling',desc:'Model main assets in Blender', status:'todo'}]},
      {id:'administration', name:'Administration', color:'#6c757d', icon: ICON_MAP['administration'], tasks:[{id:'ad1',title:'Add team roles',desc:'Define roles and permissions', status:'todo'}]}
    ]
  }
}

// Build available members from current board data (unique list of assignees)
function buildAvailableMembers(){
  const set = new Set();
  boardData.lists.forEach(l => l.tasks.forEach(t => { (t.assignees||[]).forEach(a => set.add(a)); }));
  // Add some defaults
  ['Alice Martin','Bob Dupont','Chloé Durand','David' ].forEach(a=>set.add(a));
  AVAILABLE_MEMBERS = Array.from(set);
}

function initAssigneeSelector() {
    buildAvailableMembers();
    const container = document.getElementById('taskAssigneesContainer');
    if (!container) return;

    function renderAssignees() {
        container.innerHTML = '';
        AVAILABLE_MEMBERS.forEach(name => {
            const item = document.createElement('div');
            item.className = 'assignee-item';
            if (modalAssignees.includes(name)) {
                item.classList.add('selected');
            }

            const pfp = document.createElement('img');
            pfp.className = 'assignee-pfp';
            // Placeholder image - replace with real pfp URLs if available
            pfp.src = `https://i.pravatar.cc/32?u=${name.replace(/\s/g, '')}`;
            pfp.alt = name;

            const nameEl = document.createElement('div');
            nameEl.className = 'assignee-name';
            nameEl.textContent = name;

            const checkbox = document.createElement('div');
            checkbox.className = 'assignee-checkbox';

            item.appendChild(pfp);
            item.appendChild(nameEl);
            item.appendChild(checkbox);

            item.onclick = () => {
                if (modalAssignees.includes(name)) {
                    modalAssignees = modalAssignees.filter(x => x !== name);
                    item.classList.remove('selected');
                } else {
                    modalAssignees.push(name);
                    item.classList.add('selected');
                }
            };

            container.appendChild(item);
        });
    }

    // Initial render
    renderAssignees();

    // Re-render when modal is shown
    const taskModal = document.getElementById('taskModal');
    if (taskModal) {
        taskModal.addEventListener('show.bs.modal', renderAssignees);
    }
}

function renderBoard(){
  renderPolesNav();
  // Default to first pole if none selected
  if (!selectedPoleId && boardData && boardData.lists && boardData.lists.length) {
      setSelectedPole(boardData.lists[0].id);
  } else {
      renderMainLists();
  }
}

function renderPolesNav() {
    const polesNav = document.getElementById('poles-nav');
    if (!polesNav) return;
    polesNav.innerHTML = '';
    const logo = document.createElement('img');
    logo.src = 'image/synapsis.png';
    logo.alt = 'Synapsis Logo';
    logo.className = 'nav-logo';
    polesNav.appendChild(logo);
    boardData.lists.forEach(list => {
        const button = document.createElement('button');
        button.className = 'pole-button';
        button.dataset.poleId = list.id;
        
        const color = list.color;
        const rgbColor = hexToRgb(color);
        button.style.setProperty('--pole-color-rgb', rgbColor);

        const iconClass = list.icon || ICON_MAP[list.id] || 'fa-solid fa-circle';
        button.innerHTML = `<i class="pole-icon ${iconClass}" style="color: ${color};"></i> ${list.name}`;
        
        button.onclick = () => setSelectedPole(list.id);
        polesNav.appendChild(button);
    });
    updateActivePoleButton();
}

function updateActivePoleButton() {
    document.querySelectorAll('.pole-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.poleId === selectedPoleId);
    });
}

function setSelectedPole(poleId){
  selectedPoleId = poleId;
  updateActivePoleButton();
  renderMainLists();
}

function renderMainLists(){
  STATUSES.forEach(status => { const el = document.getElementById(`${status}-list`); if (el) el.innerHTML=''; });
  
  const poleNameHeader = document.getElementById('selectedPoleName');
  const countEl = document.getElementById('selectedCount');

  if (!selectedPoleId) {
    if(poleNameHeader) poleNameHeader.textContent = 'Sélectionnez un pôle';
    if(countEl) countEl.textContent = '';
    return;
  }

  const pole = boardData.lists.find(l=>l.id===selectedPoleId);
  if (!pole) return;

    if (poleNameHeader) {
    const headerIcon = pole.icon || ICON_MAP[pole.id] || 'fa-solid fa-circle';
    poleNameHeader.innerHTML = `<i class="pole-icon ${headerIcon}" style="color: ${pole.color}"></i> ${pole.name}`;
  }
  if(countEl) countEl.textContent = `${pole.tasks.length} ressources`;

  pole.tasks.forEach(t=>{ if (!t.status) t.status = 'todo'; });
  
  STATUSES.forEach(status => {
    const el = document.getElementById(`${status}-list`);
    if (!el) return;
    // Attach handlers to both the body AND the column so the hitbox is larger
    if (el) {
      el.ondragenter = dragEnter;
      el.ondragleave = dragLeave;
      el.ondrop = drop;
    }
    // Column-level drag handlers removed: fallback to list body handlers only
    const tasks = pole.tasks.filter(t=>t.status===status);
    const headerEl = el.previousElementSibling; 
    if (headerEl) {
        const headerText = headerEl.textContent.split(' (')[0];
        headerEl.textContent = `${headerText} (${tasks.length})`;
    }
    tasks.forEach(task => {
      const card = createTaskCard(task);
      card.style.borderLeftColor = pole.color;
      el.appendChild(card);
    });
    // Toggle empty state class so we can center the add button vertically when there are no tasks
    if (tasks.length === 0) el.classList.add('no-tasks'); else el.classList.remove('no-tasks');
    // Append an 'Ajouter' button at the end of the list
    const addBtn = createAddButton(status, pole.color);
    el.appendChild(addBtn);
  });
}

function createAddButton(status, color) {
  const btn = document.createElement('div');
  btn.className = 'add-card-btn';
  btn.dataset.status = status;
  btn.innerHTML = `<i class="fa-solid fa-plus"></i> <span>Ajouter</span>`;
  // Icon/text color is controlled via CSS to match the dashed outline and opacity
  btn.onclick = (e) => {
    pendingAddStatus = status;
    // Reset inputs
    const title = document.getElementById('taskTitle');
    const desc = document.getElementById('taskDesc');
    const due = document.getElementById('taskDueDate');
    const filesList = document.getElementById('taskFilesList');
    if (title) title.value = '';
    if (desc) desc.value = '';
    if (due) due.value = '';
    if (filesList) filesList.textContent = '';
    const filesInput = document.getElementById('taskFilesInput'); if (filesInput) filesInput.value = '';
    modalFiles = [];
    modalAssignees = [];
    // Update modal title for clarity
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.textContent = 'Ajouter une ressource';
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();
    // Focus on title input shortly after modal opens
    setTimeout(() => { if (title) title.focus(); }, 120);
  };
  return btn;
}

function createTaskCard(task){
  const div = document.createElement('div');
  const statusClass = task && task.status ? `status-${task.status}` : 'status-todo';
  div.className = `card-task ${statusClass}`;
  div.dataset.status = task.status || 'todo';
  div.draggable = true;
  div.dataset.taskId = task.id;
  div.ondragstart = dragStart;
  div.ondragend = dragEnd;

  const assigneesHTML = (task.assignees && task.assignees.length)
    ? `<div class="card-assignees">${task.assignees.map(name => `<img src="https://i.pravatar.cc/24?u=${name.replace(/\s/g, '')}" alt="${name}" class="assignee-pfp-small" title="${name}">`).join('')}</div>`
    : '';

  div.innerHTML = `
    <div class="d-flex justify-content-between align-items-start">
      <div>
        <div class="card-title">${escapeHtml(task.title)}</div>
        <div class="card-desc">${escapeHtml(task.desc || '')}</div>
        <div class="card-meta d-flex gap-2 mt-2 small text-muted">
          ${assigneesHTML}
          ${task.dueDate ? `<span class="due-preview">📅 ${new Date(task.dueDate).toLocaleDateString()}</span>` : ''}
          ${task.files && task.files.length ? `<span class="file-count">📎 ${task.files.length}</span>` : ''}
        </div>
      </div>
    </div>
  `;
  div.onclick = (ev) => { if (!isDragging) openViewModal(task.id); };
  return div;
}

function escapeHtml(text){
  return (text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function dragStart(e){
  isDragging = true;
  const card = e.currentTarget || e.target.closest('.card-task');
  const id = card ? card.dataset.taskId : (e.target && e.target.dataset ? e.target.dataset.taskId : null);
  if (id) e.dataTransfer.setData('text/task-id', id);
}

function dragEnter(e){
  const list = e.currentTarget.closest('.list-col');
  if (list) list.classList.add('drop-target');
}

function dragLeave(e){
  const list = e.currentTarget.closest('.list-col');
  if (list) list.classList.remove('drop-target');
}

function dragEnd(e){
  document.querySelectorAll('.list-col').forEach(c=>c.classList.remove('drop-target'));
  isDragging = false;
}

function drop(e){
  e.preventDefault();
  const listElem = e.currentTarget;
  const col = listElem.closest('.list-col');
  if (!col) return;
  const status = col.dataset.status;
  const taskId = e.dataTransfer.getData('text/task-id');
  if (!taskId) return;
  moveTaskToList(taskId, status);
  // If dropped in the "done" list, trigger a fun confetti explosion
  if (status === 'done') {
    // Use the pointer coordinates from the event to anchor the confetti
    const x = e.clientX || window.innerWidth / 2;
    const y = e.clientY || window.innerHeight / 2;
    explodeConfetti(x, y, 24);
  }
  if (col) col.classList.remove('drop-target');
}

/* Minimal confetti implementation: creates N small divs with random velocity/rotation and colors
   Then removes them after animation finishes. Simple, no external libs. */
function explodeConfetti(x, y, count = 20){
  const colors = ['#FF595E', '#FFCA3A', '#8AC926', '#1982C4', '#6A4C93', '#FF8C42'];
  let container = document.querySelector('.confetti-container');
  if (!container){
    container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
  }
  const durationMax = 1400;
  for (let i=0;i<count;i++){
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const size = Math.floor(Math.random()*8)+6; // 6-14px
    piece.style.width = size+'px';
    piece.style.height = Math.round(size * 1.5)+'px';
    const color = colors[Math.floor(Math.random()*colors.length)];
    piece.style.backgroundColor = color;
    const offsetX = (Math.random()*140)-70; // spread left/right
    const offsetY = -(Math.random()*40); // slight upward start bias
    const translateX = Math.round((Math.random()*280)-140); // final x translation
    const translateY = Math.round((Math.random()*220)+140); // final y translation
    piece.style.left = (x + offsetX) + 'px';
    piece.style.top = (y + offsetY) + 'px';
    piece.style.setProperty('--tx', translateX + 'px');
    piece.style.setProperty('--ty', translateY + 'px');
    // random rotate and duration
    const dur = Math.floor(Math.random() * (durationMax - 700)) + 700; // 700-1400ms
    const delay = Math.floor(Math.random() * 120); // 0-120ms random delay
    piece.style.animationDuration = dur + 'ms';
    piece.style.animationDelay = delay + 'ms';
    container.appendChild(piece);
    // clean up after animation finishes using animationend
    const cleanup = () => {
      try{ container.removeChild(piece); } catch(e){}
      piece.removeEventListener('animationend', cleanup);
    };
    piece.addEventListener('animationend', cleanup);
    // fallback: ensure removal in case animationend doesn't fire for some reason
    setTimeout(()=>{
      try{ if (piece.parentNode === container) cleanup(); } catch(e){}
    }, dur + delay + 300);
  }
  // Optional: remove container if empty after some time
  setTimeout(()=>{ if (container && container.children.length === 0){ try{ container.remove(); }catch(e){} } }, durationMax+350);
}

function moveTaskToList(taskId, dest){
  if (STATUSES.includes(dest)){
    for (const pole of boardData.lists){
      const t = pole.tasks.find(x=>x.id===taskId);
      if (t){ t.status = dest; saveData(); renderMainLists(); return; }
    }
    return;
  }
  let foundPole = null; let taskIndex = -1;
  for (const p of boardData.lists){
    taskIndex = p.tasks.findIndex(x=>x.id===taskId);
    if (taskIndex !== -1){ foundPole = p; break; }
  }
  if (!foundPole) return;
  const [task] = foundPole.tasks.splice(taskIndex,1);
  const destPole = boardData.lists.find(l=>l.id===dest);
  if (!destPole) return;
  destPole.tasks.push(task);
  saveData(); renderBoard();
}

function deleteTask(taskId){
  for (const p of boardData.lists){
    const idx = p.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1){ p.tasks.splice(idx,1); saveData(); renderMainLists(); return; }
  }
}

function saveData(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(boardData));
}

async function init() {
  await loadData();
  renderBoard();
}

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
        // Some validation could be added here
        boardData = newBoardData;
        // Normalize icons on imported data (in case the file misses them)
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

window.onload = () => {
  document.getElementById('clearBtn').onclick = clearBoard;
  document.getElementById('exportBtn').onclick = exportJSON;
  document.getElementById('importBtn').onclick = importJSON;
  const saveBtn = document.getElementById('taskSave');
  function openEditModal(taskId) {
  const pole = boardData.lists.find(l => l.tasks.some(t => t.id === taskId));
  if (!pole) return;
  const task = pole.tasks.find(t => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;

  document.getElementById('modalTitle').textContent = 'Modifier la ressource';
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDesc').value = task.desc || '';
  document.getElementById('taskDueDate').value = task.dueDate ? task.dueDate.split('T')[0] : '';

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

// ... existing code ...

function saveModalTask(){
    const titleEl = document.getElementById('taskTitle');
    const descEl = document.getElementById('taskDesc');
    const title = titleEl ? titleEl.value.trim() : '';
    const desc = descEl ? descEl.value.trim() : '';
    if (!title) { alert('Veuillez saisir un titre'); return; }

    const assignees = modalAssignees.slice();
    const dueDateInput = document.getElementById('taskDueDate');
    const dueDate = dueDateInput && dueDateInput.value ? new Date(dueDateInput.value).toISOString() : null;

    if (editingTaskId) {
        // Update existing task
        const pole = boardData.lists.find(l => l.tasks.some(t => t.id === editingTaskId));
        if (pole) {
            const task = pole.tasks.find(t => t.id === editingTaskId);
            if (task) {
                task.title = title;
                task.desc = desc;
                task.assignees = assignees;
                task.dueDate = dueDate;
                task.files = modalFiles.slice();
            }
        }
    } else {
        // Create new task
        const status = pendingAddStatus || 'todo';
        const pole = boardData.lists.find(l=>l.id===selectedPoleId);
        if (!pole) { alert('Aucun pôle sélectionné'); return; }
        const id = `t${Date.now().toString(36)}${Math.floor(Math.random()*999)}`;
        const taskObj = { id, title, desc, status, assignees, dueDate, files: modalFiles.slice() };
        pole.tasks.push(taskObj);
    }

    saveData();
    buildAvailableMembers();
    
    const modalEl = document.getElementById('taskModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    editingTaskId = null;
    pendingAddStatus = null;
    modalFiles = [];
    renderMainLists();
}

  if (saveBtn) saveBtn.onclick = saveModalTask;
  const formEl = document.getElementById('taskForm');
  if (formEl) formEl.onsubmit = (e) => { e.preventDefault(); saveModalTask(); };
  // Handle files selection on modal
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
  init();
  // Initialize the assignee selector after board data is loaded
  initAssigneeSelector();
  // Hide delete button when view modal closes
  const viewModalEl = document.getElementById('viewModal');
  if (viewModalEl) viewModalEl.addEventListener('hidden.bs.modal', () => { const db = document.getElementById('taskDelete'); if (db) db.style.display = 'none'; });
};

window.drop = drop;