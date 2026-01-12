function showErrorMessage(message) {
  const errorDiv = document.getElementById('error-message');
  if (!errorDiv) return;
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  setTimeout(() => { try { errorDiv.classList.remove('show'); } catch(e){} }, 6000);
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
let boardData = { lists: [] };
let viewMode = localStorage.getItem('viewMode') || 'kanban';
let selectedPoleId = null;
let selectedSubpartId = null;
let modalFiles = [];
let modalImages = [];
let modalAssignees = [];
let editingTaskId = null;
let pendingAddStatus = null;

// Minimal safe stubs for rendering functions (restored so init() can run)
function setViewMode(m) { viewMode = m; localStorage.setItem('viewMode', viewMode); updateViewButtons(); renderView(); }
function renderView(){
  // simple dispatcher: if detailed renderers exist, they will be used; otherwise fall back to kanban
  if (viewMode === 'list') return renderListView();
  if (viewMode === 'gantt') return renderGanttView();
  return renderKanbanView();
}

function renderBoard(){ renderView(); renderSubpartTabs && renderSubpartTabs(); }

// Render the left/top navigation of poles
function renderPolesNav(){
  const nav = document.getElementById('poles-nav'); if (!nav) return;
  nav.innerHTML = '';
  boardData.lists.forEach(pole => {
    const btn = document.createElement('button');
    btn.className = 'pole-button btn btn-sm';
    btn.innerHTML = `<i class="pole-icon ${pole.icon}" style="color: ${pole.color}"></i> ${pole.name}`;
    btn.onclick = () => { selectedPoleId = pole.id; selectedSubpartId = null; renderBoard(); };
    if (selectedPoleId === pole.id) btn.classList.add('active');
    nav.appendChild(btn);
  });
}

// Improved renderBoard: update header, count, subpart button visibility and then render view
function renderBoard(){
  renderPolesNav();

  const pole = boardData.lists.find(l => l.id === selectedPoleId) || (boardData.lists[0] || null);
  const poleNameHeader = document.getElementById('selectedPoleName');
  const countEl = document.getElementById('selectedCount');
  const addSubpartBtn = document.getElementById('addSubpartBtn');

  if (!pole) {
    if (poleNameHeader) poleNameHeader.textContent = 'Sélectionnez un pôle';
    if (countEl) countEl.textContent = '';
    if (addSubpartBtn) addSubpartBtn.style.display = 'none';
    // clear lists
    ['todo','doing','verify','done'].forEach(s => { const el = document.getElementById(s+'-list'); if (el) el.innerHTML=''; });
    return;
  }

  if (poleNameHeader) {
    const headerIcon = pole.icon || 'fa-solid fa-circle';
    poleNameHeader.innerHTML = `<i class="pole-icon ${headerIcon}" style="color: ${pole.color}"></i> ${pole.name}`;
  }

  // count tasks
  let tasksCount = 0;
  if (pole.subparts) {
    pole.subparts.forEach(s => { tasksCount += (s.tasks || []).length; });
  }
  if (countEl) countEl.textContent = `${tasksCount} ressources`;

  if (addSubpartBtn) addSubpartBtn.style.display = 'inline-flex';

  // ensure a selected subpart exists
  if (!selectedSubpartId && pole.subparts && pole.subparts.length > 0) selectedSubpartId = pole.subparts[0].id;

  // render subparts and the current view
  renderSubpartTabs();
  renderView();
}

function renderSubpartTabs(){
  const nav = document.getElementById('sub-poles-nav');
  if (!nav) return;
  nav.innerHTML = '';
  const pole = boardData.lists.find(l => l.id === selectedPoleId);
  if (!pole || !pole.subparts) return;
  pole.subparts.forEach(subpart => {
    const btnGroup = document.createElement('div'); btnGroup.className = 'btn-group me-2';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'btn btn-sm sub-pole-button'; button.textContent = subpart.name;
    button.dataset.subpartId = subpart.id; button.onclick = () => selectSubpart(subpart.id);
    btnGroup.appendChild(button);
    nav.appendChild(btnGroup);
  });
  updateActiveSubpartButton && updateActiveSubpartButton();
}

function selectSubpart(subpartId) {
  selectedSubpartId = subpartId;
  renderView();
  updateActiveSubpartButton && updateActiveSubpartButton();
}

function updateActiveSubpartButton() {
  document.querySelectorAll('#sub-poles-nav .btn').forEach(btn => {
    const sid = btn.dataset.subpartId || null;
    const isActive = sid && selectedSubpartId === sid;
    btn.classList.toggle('active', !!isActive);
  });
}

// Basic Kanban renderer: populates the four status columns with simple cards (draggable)
function renderKanbanView(){
  const pole = boardData.lists.find(l => l.id === selectedPoleId) || (boardData.lists[0] || null);
  if (!pole) return;
  if (!selectedPoleId) selectedPoleId = pole.id;
  STATUSES.forEach(status => {
    const container = document.getElementById(`${status}-list`);
    if (!container) return;
    container.innerHTML = '';
    // gather tasks from subparts
    const tasks = pole.subparts ? pole.subparts.flatMap(s => s.tasks || []) : [];
    const filtered = tasks.filter(t => (t.status || 'todo') === status);
    if (filtered.length === 0) {
      container.classList.add('no-tasks');
      const addBtn = document.createElement('button'); addBtn.className = 'btn btn-sm add-card-btn'; addBtn.textContent = 'Ajouter'; addBtn.onclick = () => openTaskModal(status); container.appendChild(addBtn);
    } else {
      container.classList.remove('no-tasks');
      filtered.forEach(task => {
        const card = document.createElement('div'); card.className = 'card-task'; card.draggable = true;
        card.ondragstart = (e) => { try { e.dataTransfer.setData('text/plain', task.id); } catch (err){} };
        const title = document.createElement('div'); title.className = 'card-title'; title.textContent = task.title;
        const meta = document.createElement('div'); meta.className = 'card-meta small text-muted'; meta.textContent = task.desc || '';
        card.appendChild(title); card.appendChild(meta);
        card.onclick = () => openEditModal(task.id);
        container.appendChild(card);
      });
    }
    const addBtn = document.createElement('button'); addBtn.className = 'btn btn-sm add-card-btn'; addBtn.textContent = 'Ajouter'; addBtn.onclick = () => openTaskModal(status); container.appendChild(addBtn);

    // Drag enter/leave visual helpers
    container.ondragenter = (e) => { container.classList.add('drop-target'); };
    container.ondragleave = (e) => { container.classList.remove('drop-target'); };
    container.ondrop = (e) => { container.classList.remove('drop-target'); drop(e); };
  });
}

function renderListView(){
  // simple fallback: show number of tasks
  const listsContainer = document.getElementById('lists'); if (!listsContainer) return;
  listsContainer.innerHTML = '<div class="list-table"><em>Vue liste — en construction</em></div>';
}

function renderGanttView(){
  const listsContainer = document.getElementById('lists'); if (!listsContainer) return;
  listsContainer.innerHTML = '<div class="gantt-empty-note">Diagramme de Gantt non implémenté (placeholder)</div>';
}


function moveTaskToList(taskId, dest){
  if (STATUSES.includes(dest)){
    
    for (const pole of boardData.lists){
      for (const subpart of (pole.subparts || [])){
        const t = subpart.tasks.find(x => x.id === taskId);
        if (t){ t.status = dest; saveData(); renderView(); renderSubpartTabs(); return; }
      }
    }
    return;
  }
  
  
  let found = null; let foundSubpart = null;
  for (const p of boardData.lists){
    for (const sp of (p.subparts || [])){
      const idx = sp.tasks.findIndex(x => x.id === taskId);
      if (idx !== -1){ found = p; foundSubpart = { subpart: sp, index: idx }; break; }
    }
    if (found) break;
  }
  if (!found || !foundSubpart) return;
  const [task] = foundSubpart.subpart.tasks.splice(foundSubpart.index, 1);
  const destPole = boardData.lists.find(l=>l.id===dest);
  if (!destPole) return;
  
  if (!destPole.subparts) destPole.subparts = [];
  if (destPole.subparts.length === 0){
    const newId = `subpart-${Date.now().toString(36)}${Math.random().toString(36).substr(2,5)}`;
    destPole.subparts.push({ id: newId, name: 'General', tasks: [] });
  }
  destPole.subparts[0].tasks.push(task);
  saveData(); renderBoard(); renderSubpartTabs();
}

function deleteTask(taskId){
  for (const pole of boardData.lists){
    for (const subpart of pole.subparts){
      const idx = subpart.tasks.findIndex(t => t.id === taskId);
      if (idx !== -1){
        subpart.tasks.splice(idx,1);
        saveData();
        renderView();
        renderSubpartTabs();
        return;
      }
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
        boardData = { lists: [] };
      }
    }
  } catch (e) {
    console.error('Error loading data', e);
    boardData = { lists: [] };
  }
  if (!boardData.lists) boardData.lists = [];
  normalizeBoardIcons(boardData);
  if (!selectedPoleId && boardData.lists.length > 0) selectedPoleId = boardData.lists[0].id;
  // build members list for modal
  buildAvailableMembers();
}

function normalizeBoardIcons(bd){
  bd.lists = bd.lists || [];
  bd.lists.forEach(l => {
    if (!l.icon) l.icon = 'fa-solid fa-circle';
    if (!l.color) l.color = '#666';
    l.subparts = l.subparts || [];
    l.subparts.forEach(s => { s.tasks = s.tasks || []; s.tasks.forEach(t => { t.assignees = t.assignees || []; }); });
  });
}

// Build a list of available members from tasks and render the assignee selector
function buildAvailableMembers(){
  const set = new Set();
  boardData.lists.forEach(l => (l.subparts || []).forEach(s => (s.tasks || []).forEach(t => (t.assignees || []).forEach(a => set.add(a)))));
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

  if (editingTaskId) {
    updateTask(editingTaskId, title, desc, assignees, dueDate, modalImages);
  } else {
    createTask(title, desc, assignees, dueDate, modalImages);
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
  renderSubpartTabs();
}

function createTask(title, desc, assignees, dueDate, images) {
  const status = pendingAddStatus || 'todo';
  const pole = boardData.lists.find(l => l.id === selectedPoleId);
  if (!pole) {
    alert('Aucun pôle sélectionné');
    return;
  }
  const subpart = pole.subparts.find(s => s.id === selectedSubpartId);
  if (!subpart) {
    alert('Aucune sous-partie sélectionnée pour ajouter la tâche.');
    return;
  }

  const id = `t${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`;
  
  const existingTitles = subpart.tasks.map(t => t.title);
  const uniqueTitle = makeUniqueName(title, existingTitles);
  const taskObj = { id, title: uniqueTitle, desc, status, assignees, dueDate, files: modalFiles.slice(), images };
  // If user provided a dueDate but no explicit start/end, set them to the dueDate so Gantt shows it
  if (dueDate && !taskObj.startDate && !taskObj.endDate) {
    taskObj.startDate = dueDate;
    taskObj.endDate = dueDate;
  }
  subpart.tasks.push(taskObj);
}

function updateTask(taskId, title, desc, assignees, dueDate, images) {
  
  for (const pole of boardData.lists) {
    for (const subpart of pole.subparts) {
      const task = subpart.tasks.find(t => t.id === taskId);
      if (task) {
        
        const otherTitles = subpart.tasks.filter(t => t.id !== taskId).map(t => t.title);
        task.title = makeUniqueName(title, otherTitles);
        task.desc = desc;
        task.assignees = assignees;
        task.dueDate = dueDate;
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
}

function openEditModal(taskId) {
  let task = null;
  let parentPole = null;
  for (const pole of boardData.lists) {
    for (const subpart of pole.subparts) {
      task = subpart.tasks.find(t => t.id === taskId);
      if (task) {
        parentPole = pole;
        break;
      }
    }
    if (task) break;
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
  document.getElementById('loginBtn').onclick = () => { prepareAuthModal('login'); loginModal.show(); };
  document.getElementById('signupBtn').onclick = () => { prepareAuthModal('signup'); loginModal.show(); };

  document.getElementById('loginSubmit').onclick = () => {
    const username = (document.getElementById('usernameInput').value || '').trim();
    const password = document.getElementById('passwordInput').value || '';
    if (authMode === 'login'){
      if (username === 'admin' && password === 'admin') {
        loginModal.hide();
        const adminBtn = document.getElementById('admin-buttons'); if (adminBtn) adminBtn.style.display = 'flex';
        const loginBtnEl = document.getElementById('loginBtn'); if (loginBtnEl) loginBtnEl.style.display = 'none';
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
  if (viewModalEl) viewModalEl.addEventListener('hidden.bs.modal', () => { const db = document.getElementById('taskDelete'); if (db) db.style.display = ''; });

  const taskModalEl = document.getElementById('taskModal');
  if (taskModalEl) {
      taskModalEl.addEventListener('hidden.bs.modal', () => {
          
          document.getElementById('task-modal-actions').style.display = 'none';
          document.getElementById('task-modal-close-btn').style.display = 'block';
      });
  }

  
  document.getElementById('addSubpartBtn').onclick = openAddSubpartModal;
  document.getElementById('saveNewSubpartBtn').onclick = addSubpart;
  document.getElementById('saveEditedSubpartBtn').onclick = editSubpart;
  document.getElementById('confirmDeleteSubpartBtn').onclick = deleteSubpart;
};

window.drop = drop;

 
function findSubpartById(subpartId) {
  const pole = boardData.lists.find(l => l.id === selectedPoleId);
  if (pole && pole.subparts) {
    return pole.subparts.find(s => s.id === subpartId);
  }
  return null;
}

 
function openAddSubpartModal() {
  const addSubpartModal = new bootstrap.Modal(document.getElementById('addSubpartModal'));
  document.getElementById('newSubpartName').value = '';
  addSubpartModal.show();
}

 
function addSubpart() {
  const subpartName = document.getElementById('newSubpartName').value.trim();
  if (!subpartName) {
    alert("Veuillez entrer un nom pour la sous-partie.");
    return;
  }

  const pole = boardData.lists.find(l => l.id === selectedPoleId);
  if (pole) {
    
    const existingNames = pole.subparts.map(s => s.name);
    const uniqueName = makeUniqueName(subpartName, existingNames);
    
    const newSubpartId = `subpart-${Date.now().toString(36)}${Math.random().toString(36).substr(2, 5)}`;
    pole.subparts.push({ id: newSubpartId, name: uniqueName, tasks: [] });
    saveData();
    renderSubpartTabs();
    selectSubpart(newSubpartId);
    const addSubpartModal = bootstrap.Modal.getInstance(document.getElementById('addSubpartModal'));
    if (addSubpartModal) addSubpartModal.hide();
  }
}

 
function openEditSubpartModal(subpartId) {
  const subpart = findSubpartById(subpartId);
  if (subpart) {
    const editSubpartModal = new bootstrap.Modal(document.getElementById('editSubpartModal'));
    document.getElementById('editSubpartName').value = subpart.name;
    document.getElementById('editSubpartId').value = subpart.id;
    editSubpartModal.show();
  }
}

 
function editSubpart() {
  const subpartId = document.getElementById('editSubpartId').value;
  const newSubpartName = document.getElementById('editSubpartName').value.trim();

  if (!newSubpartName) {
    alert("Veuillez entrer un nom pour la sous-partie.");
    return;
  }

  const subpart = findSubpartById(subpartId);
  if (subpart) {
    
    const pole = boardData.lists.find(l => l.id === selectedPoleId);
    const existingNames = (pole && pole.subparts) ? pole.subparts.filter(s => s.id !== subpartId).map(s => s.name) : [];
    subpart.name = makeUniqueName(newSubpartName, existingNames);
    saveData();
    renderSubpartTabs();
    const editSubpartModal = bootstrap.Modal.getInstance(document.getElementById('editSubpartModal'));
    if (editSubpartModal) editSubpartModal.hide();
    selectSubpart(subpartId);
  }
}

 
function openDeleteSubpartConfirmModal(subpartId) {
  const subpart = findSubpartById(subpartId);
  if (subpart) {
    const deleteSubpartConfirmModal = new bootstrap.Modal(document.getElementById('deleteSubpartConfirmModal'));
    document.getElementById('deleteSubpartId').value = subpart.id;
    deleteSubpartConfirmModal.show();
  }
}

 
function deleteSubpart() {
  const subpartId = document.getElementById('deleteSubpartId').value;
  const pole = boardData.lists.find(l => l.id === selectedPoleId);
  if (pole) {
    const initialSubpartCount = pole.subparts.length;
    pole.subparts = pole.subparts.filter(s => s.id !== subpartId);
    if (pole.subparts.length < initialSubpartCount) {
      saveData();
      renderSubpartTabs();
      
      if (pole.subparts.length > 0) {
        selectSubpart(pole.subparts[0].id);
      } else {
        selectSubpart(null);
      }
    }
    const deleteSubpartConfirmModal = bootstrap.Modal.getInstance(document.getElementById('deleteSubpartConfirmModal'));
    if (deleteSubpartConfirmModal) deleteSubpartConfirmModal.hide();
  }
}