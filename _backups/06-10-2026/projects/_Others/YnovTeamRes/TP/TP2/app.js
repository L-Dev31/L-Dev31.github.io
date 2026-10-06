// --- CONSTANTS & STATE ---
const STATUSES = ['todo', 'doing', 'verify', 'done'];
const POLES_DEF = [
    { id: 'creatif-artistique', name: 'Créatif', color: '#e83e8c', icon: 'fa-palette' },
    { id: 'systeme-dev', name: 'Système Dev', color: '#0d6efd', icon: 'fa-code' },
    { id: 'audiovisuel-marketing', name: 'AMC', color: '#fd7e14', icon: 'fa-bullhorn' },
    { id: '3d-animation', name: '3D Anim', color: '#6f42c1', icon: 'fa-cube' },
    { id: 'administration', name: 'Admin', color: '#6c757d', icon: 'fa-user-tie' }
];

let boardData = { sprints: [] };
let viewState = { mode: 'list', sprintId: null, poleId: 'all', collapsed: {} };
let currentModalTask = null;
let currentPreviewTask = null;
let newTaskDefaultStatus = 'todo';

// --- INITIALIZATION ---
const init = async () => {
    // Load provided JSON or default
    try {
        const resp = await fetch('resources.json');
        if(resp.ok) boardData = await resp.json();
        else throw new Error("No file");
    } catch(e) {
        // Fallback default structure if fetch fails
        boardData = { sprints: [{ id: 's1', name: 'Sprint Démo', parties: [], poles: POLES_DEF.map(p=>({id:p.id, tasks:[]})) }] };
    }
    
    // Set defaults
    if(boardData.sprints.length > 0) viewState.sprintId = boardData.sprints[0].id;
    
    bindEvents();
    render();
};

const bindEvents = () => {
    document.getElementById('viewList').onclick = () => setView('list');
    document.getElementById('viewKanban').onclick = () => setView('kanban');
    document.getElementById('viewGantt').onclick = () => setView('gantt');
    document.getElementById('importJsonBtn').onclick = importJSON;
    document.getElementById('saveTaskBtn').onclick = saveTask;
    document.getElementById('taskImgInput').onchange = handleImageUpload;
    document.getElementById('newTaskBtn').onclick = () => openTaskModalForNew();
    document.getElementById('previewEditBtn').onclick = () => {
        if (currentPreviewTask) {
            bootstrap.Modal.getInstance(document.getElementById('previewModal'))?.hide();
            openTaskModal(currentPreviewTask);
        }
    };
};

// --- DATA HELPERS ---
const getSprint = () => boardData.sprints.find(s => s.id === viewState.sprintId);
const getPoleDef = (id) => POLES_DEF.find(p => p.id === id) || { name: id, color: '#666', icon: 'fa-circle' };

// Get all tasks for the current sprint, filtered by current Pole selection
const getFilteredTasks = () => {
    const sprint = getSprint();
    if (!sprint) return [];
    let tasks = [];
    (sprint.poles || []).forEach(pole => {
        if (viewState.poleId !== 'all' && pole.id !== viewState.poleId) return;
        (pole.tasks || []).forEach(task => {
            tasks.push({ ...task, _poleId: pole.id });
        });
    });
    return tasks;
};

// Find tasks assigned to a specific Party ID
const getTasksForParty = (partyId) => {
    return getFilteredTasks().filter(t => t.partieId === partyId);
};

// Recursive finder for parties (handles nested children)
const findPartyById = (parties, id) => {
    if(!parties || !id) return null;
    for(const p of parties) {
        if(p.id === id) return p;
        const found = findPartyById(p.children, id);
        if(found) return found;
    }
    return null;
};

// Return full path (code and name) for a partie id: e.g. { code: '1.2.3', namePath: 'Parent > Child > Sub' }
const findPartyPath = (parties, id, parentIndices = [], parentNames = []) => {
    if(!parties || !id) return null;
    for(let idx = 0; idx < parties.length; idx++){
        const p = parties[idx];
        const newIndices = parentIndices.concat([idx + 1]);
        const newNames = parentNames.concat([p.name]);
        if(p.id === id) return { code: newIndices.join('.'), namePath: newNames.join(' > ') };
        if(p.children){
            const found = findPartyPath(p.children, id, newIndices, newNames);
            if(found) return found;
        }
    }
    return null;
};

// --- RENDERING ---
const render = () => {
    renderSprintsNav();
    renderPolesNav();
    renderHeader();
    const container = document.getElementById('mainView');
    container.innerHTML = '';
    const sprint = getSprint();
    if (!sprint) {
        if (boardData.sprints.length === 0) {
            container.innerHTML = `
                <div class="empty-state text-center py-5 text-muted">
                    <i class="fa-solid fa-inbox fa-3x mb-3" style="opacity:0.5"></i>
                    <p class="mb-2">Aucun sprint.</p>
                    <p class="small">Importez un fichier .json contenant des sprints pour commencer.</p>
                </div>`;
        }
        return;
    }
    if (viewState.mode === 'list') renderWBS(container);
    else if (viewState.mode === 'kanban') renderKanban(container);
    else renderGantt(container);
};

const setView = (mode) => {
    viewState.mode = mode;
    ['viewList', 'viewKanban', 'viewGantt'].forEach(id => {
        document.getElementById(id).classList.toggle('active', id === `view${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    });
    render();
};

const renderSprintsNav = () => {
    const list = document.getElementById('sprints-list');
    list.innerHTML = '';
    boardData.sprints.forEach(s => {
        const btn = document.createElement('button');
        btn.className = `sprint-btn ${s.id === viewState.sprintId ? 'active' : ''}`;
        btn.innerHTML = `<i class="fa-solid fa-rocket me-2"></i> ${s.name}`;
        btn.onclick = () => { viewState.sprintId = s.id; render(); };
        list.appendChild(btn);
    });
};

const renderPolesNav = () => {
    const nav = document.getElementById('polesNav');
    nav.innerHTML = '';
    
    const mkBtn = (id, name, icon, color, isAll=false) => {
        const btn = document.createElement('button');
        btn.className = `pole-tab ${viewState.poleId === id ? 'active' : ''}`;
        btn.style.setProperty('--orb', color);
        btn.innerHTML = `<i class="fa-solid ${icon}" style="color:${isAll?'#fff':color}"></i> ${name}`;
        btn.onclick = () => { viewState.poleId = id; render(); };
        nav.appendChild(btn);
    };

    mkBtn('all', 'Tous les pôles', 'fa-layer-group', '#fff', true);
    
    const sprint = getSprint();
    if(sprint && sprint.poles) {
        sprint.poles.forEach(pData => {
            const def = getPoleDef(pData.id);
            mkBtn(pData.id, def.name, def.icon, def.color);
        });
    }
};

const renderHeader = () => {
    const s = getSprint();
    const pName = viewState.poleId === 'all' ? 'Vue Globale' : getPoleDef(viewState.poleId).name;
    const count = getFilteredTasks().length;
    document.getElementById('headerInfo').innerHTML = `
        <h4 class="mb-0 text-white fw-bold">${s ? s.name : 'Aucun Sprint'} <span style="color: var(--text-muted);" class="mx-2">/</span> ${pName}</h4>
        <small style="color: var(--text-muted);">${count} ressource(s) identifiée(s)</small>
    `;
};

// --- WBS ENGINE (LIST VIEW) ---
const renderWBS = (container) => {
    const sprint = getSprint();
    if(!sprint) return;

    const filteredTasks = getFilteredTasks();
    if (filteredTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state text-center py-5 text-muted">
                <i class="fa-solid fa-folder-open fa-3x mb-3" style="opacity:0.5"></i>
                <p class="mb-2">Aucune tâche dans cette vue.</p>
                <p class="small">Utilisez «&nbsp;Nouvelle tâche&nbsp;» pour en ajouter, ou changez de pôle.</p>
            </div>`;
        return;
    }

    const table = document.createElement('table');
    table.className = 'wbs-table';
    table.innerHTML = `
        <thead>
            <tr>
                <th style="width:100px">WBS</th>
                <th>Titre</th>
                <th style="width:150px">Pôle</th>
                <th style="width:150px">Assignés</th>
                <th style="width:120px">Date</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    // Recursive function to build rows
    const hasVisibleTasks = (party) => {
        const partyTasks = getTasksForParty(party.id);
        if (partyTasks.length > 0) return true;
        if (party.children) {
            for (const child of party.children) {
                if (hasVisibleTasks(child)) return true;
            }
        }
        return false;
    };
    const buildRows = (parties, parentCode = '', level = 0) => {
        parties.forEach((party, idx) => {
            if (!hasVisibleTasks(party)) return;
            const code = parentCode ? `${parentCode}.${idx + 1}` : `${idx + 1}`;
            const partyTasks = getTasksForParty(party.id);
            if (viewState.collapsed[party.id] === undefined) viewState.collapsed[party.id] = true;
            const isCollapsed = viewState.collapsed[party.id];
            
            // Render Party Row
            const tr = document.createElement('tr');
            tr.className = 'wbs-row wbs-party-row';
            tr.innerHTML = `
                <td><span class="wbs-code">${code}</span></td>
                <td colspan="5">
                    <div class="wbs-party-title" style="padding-left: ${level * 20}px">
                        <i class="fa-solid fa-chevron-right wbs-caret ${isCollapsed ? '' : 'rotated'}"></i>
                        <i class="fa-regular fa-folder" style="color: var(--ynov);"></i> ${party.name}
                    </div>
                </td>
            `;
            tr.onclick = () => {
                viewState.collapsed[party.id] = !viewState.collapsed[party.id];
                render(); // Re-render to toggle visibility
            };
            tbody.appendChild(tr);

                if (!isCollapsed) {
                // Render Tasks for this Party
                partyTasks.forEach((task, tIdx) => {
                    const taskCode = `${code}.${tIdx + 1}`;
                    const poleDef = getPoleDef(task._poleId);
                    const tRow = document.createElement('tr');
                    tRow.className = 'wbs-row wbs-task-row';
                    tRow.onclick = (e) => { e.stopPropagation(); openTaskPreviewModal(task); };
                    tRow.innerHTML = `
                        <td><span class="wbs-code" style="opacity:0.4">${taskCode}</span></td>
                        <td>
                            <div style="padding-left: ${(level + 1) * 20 + 20}px; display:flex; justify-content:space-between; align-items:center">
                                <span>${task.title}</span>
                                <span><span class="status-badge badge-${task.status}">${task.status}</span></span>
                            </div>
                        </td>
                        <td><span style="color:${poleDef.color}; font-size:0.85rem"><i class="fa-solid ${poleDef.icon}"></i> ${poleDef.name}</span></td>
                        <td>${(task.assignees||[]).map(a => `<img src="https://ui-avatars.com/api/?name=${a}&background=random" class="avatar" title="${a}">`).join(' ')}</td>
                        <td class="text-muted small">${task.dueDate || '-'}</td>
                    `;
                    tbody.appendChild(tRow);
                });

                // Recurse children
                if (party.children) buildRows(party.children, code, level + 1);
            }
        });
    };

    buildRows(sprint.parties || []);
    
    // Handle Unassigned Tasks
    const allAssignedIds = new Set();
    const traverseIds = (p) => { 
        getTasksForParty(p.id).forEach(t => allAssignedIds.add(t.id)); 
        if(p.children) p.children.forEach(traverseIds);
    };
    (sprint.parties || []).forEach(traverseIds);
    
    const unassigned = getFilteredTasks().filter(t => !allAssignedIds.has(t.id));
        if(unassigned.length > 0) {
        const uRow = document.createElement('tr');
        uRow.className = 'wbs-row wbs-party-row';
        uRow.innerHTML = `<td>-</td><td colspan="5"><div class="wbs-party-title"><i class="fa-solid fa-box-open text-secondary"></i> Non classé (Hors WBS)</div></td>`;
        tbody.appendChild(uRow);
        unassigned.forEach(task => {
            const poleDef = getPoleDef(task._poleId);
            const tRow = document.createElement('tr');
            tRow.className = 'wbs-row';
            tRow.onclick = () => openTaskPreviewModal(task);
            tRow.innerHTML = `
                <td></td>
                <td style="padding-left: 20px; display:flex; justify-content:space-between; align-items:center">${task.title} <span><span class="status-badge badge-${task.status}">${task.status}</span></span></td>
                <td><span style="color:${poleDef.color}">${poleDef.name}</span></td>
                <td>${(task.assignees||[]).length}</td>
                <td>${task.dueDate || '-'}</td>
            `;
            tbody.appendChild(tRow);
        });
    }

    container.appendChild(table);
};

// --- KANBAN VIEW ---
const renderKanban = (container) => {
    const board = document.createElement('div');
    board.className = 'kanban-board';
    
    STATUSES.forEach(status => {
        const col = document.createElement('div');
        col.className = `kanban-col kanban-${status}`;
        col.innerHTML = `
            <div class="kanban-header">
                <span>${status.toUpperCase()}</span>
                <span class="badge bg-dark">${getFilteredTasks().filter(t=>t.status===status).length}</span>
            </div>
            <div class="kanban-body" data-status="${status}"></div>
        `;
        
        // Drag Drop Logic
        const body = col.querySelector('.kanban-body');
        body.ondragover = e => handleDragOver(e, status, body);
        body.ondragleave = e => removePlaceholder(body);
        body.ondrop = e => handleDrop(e, status, body);
        
        getFilteredTasks().filter(t => t.status === status).forEach(task => {
            const card = document.createElement('div');
            card.className = 'kanban-card';
            card.draggable = true;
            card.dataset.tid = task.id;
            card.ondragstart = e => {
                e.dataTransfer.setData('text/json', JSON.stringify({tid: task.id, pid: task._poleId}));
                card.classList.add('dragging');
                // cache card positions to avoid layout thrashing during drag
                buildKanbanCardPositions();
            };
            card.ondragend = () => {
                card.classList.remove('dragging');
                removeAllPlaceholders();
                clearKanbanCardPositions();
            };
            card.onclick = () => openTaskPreviewModal(task);

            const pole = getPoleDef(task._poleId);
            card.innerHTML = `
                <div class="d-flex justify-content-between mb-2">
                    <span style="font-size:0.7rem; color:${pole.color}">${pole.name}</span>
                    ${task.images?.length ? '<i class="fa-solid fa-paperclip text-muted"></i>' : ''}
                </div>
                <div class="fw-bold mb-2">${task.title}</div>
                <div class="d-flex justify-content-between align-items-center">
                    <div class="d-flex gap-1">
                        ${(task.assignees||[]).map(a=>`<img src="https://ui-avatars.com/api/?name=${a}" class="avatar">`).join('')}
                    </div>
                    <small class="text-muted">${task.dueDate ? new Date(task.dueDate).getDate() + '/' + (new Date(task.dueDate).getMonth()+1) : ''}</small>
                </div>
            `;
            body.appendChild(card);
        });
        const addCard = document.createElement('button');
        addCard.className = 'kanban-add-card';
        addCard.type = 'button';
        addCard.innerHTML = '<i class="fa-solid fa-plus me-1"></i> Ajouter une tâche';
        addCard.onclick = () => openTaskModalForNew(status);
        body.appendChild(addCard);
        board.appendChild(col);
    });
    container.appendChild(board);
};

// --- KANBAN drag placeholder helpers ---

let kanbanDragRaf = null;
let kanbanLastDrag = null;

const removePlaceholder = (body) => {
    if (!body) return;
    if (body.__overlay) {
        body.__overlay.style.opacity = '0';
        body.__overlay.style.transform = 'translateY(-10000px)';
        delete body.__lastOverlayPos;
    }
    body.querySelector('.kanban-placeholder')?.remove();
    body.classList.remove('drag-over');
    delete body.__kanbanPrevInsertBefore;
    delete body.__kanbanLastInsertBefore;
    delete body.__kanbanStableCount;
    delete body.__kanbanLastChangeTime;
    kanbanLastDrag = null;
    if (kanbanDragRaf) {
        cancelAnimationFrame(kanbanDragRaf);
        kanbanDragRaf = null;
    }
};

const removeAllPlaceholders = () => {
    document.querySelectorAll('.kanban-body').forEach(b => {
        if (b.__overlay) {
            b.__overlay.style.opacity = '0';
            b.__overlay.style.transform = 'translateY(-10000px)';
            delete b.__lastOverlayPos;
        }
        b.querySelector('.kanban-placeholder')?.remove();
        b.classList.remove('drag-over');
        delete b.__kanbanPrevInsertBefore;
        delete b.__kanbanLastInsertBefore;
        delete b.__kanbanStableCount;
        delete b.__kanbanLastChangeTime;
    });
    kanbanLastDrag = null;
    if (kanbanDragRaf) {
        cancelAnimationFrame(kanbanDragRaf);
        kanbanDragRaf = null;
    }
    // also clear cached positions and overlays
    clearKanbanCardPositions();
};

const buildKanbanCardPositions = () => {
    document.querySelectorAll('.kanban-body').forEach(body => {
        try {
            const arr = Array.from(body.querySelectorAll('.kanban-card:not(.dragging)')).map(card => {
                const r = card.getBoundingClientRect();
                return { tid: card.dataset.tid, top: r.top, mid: r.top + r.height / 2, bottom: r.top + r.height };
            });
            body.__kanbanCardPos = arr;

            // attach scroll handler to refresh positions during drag (to avoid stale coordinates)
            if (!body.__kanbanScrollHandler) {
                body.__kanbanScrollHandler = () => {
                    body.__kanbanCardPos = Array.from(body.querySelectorAll('.kanban-card:not(.dragging)')).map(card => {
                        const r = card.getBoundingClientRect();
                        return { tid: card.dataset.tid, top: r.top, mid: r.top + r.height / 2, bottom: r.top + r.height };
                    });
                };
                body.addEventListener('scroll', body.__kanbanScrollHandler, { passive: true });
            }
        } catch (err) {
            /* ignore measurement errors */
        }
    });
};

const clearKanbanCardPositions = () => {
    document.querySelectorAll('.kanban-body').forEach(body => {
        if (body.__kanbanScrollHandler) {
            body.removeEventListener('scroll', body.__kanbanScrollHandler);
            delete body.__kanbanScrollHandler;
        }
        delete body.__kanbanCardPos;
    });
};

const KANBAN_HYST_PX = 12;
const KANBAN_TOP_SWITCH_PX = 2;
const KANBAN_STABLE_FRAMES = 1;
const KANBAN_DEBOUNCE_MS = 0;

const processKanbanDragOver = () => {
    kanbanDragRaf = null;
    const args = kanbanLastDrag;
    if (!args || !args.body) return;
    const { clientY, body } = args;

    document.querySelectorAll('.kanban-body').forEach(b => {
        if (b !== body) {
            b.querySelector('.kanban-placeholder')?.remove();
            b.classList.remove('drag-over');
            delete b.__kanbanPrevInsertBefore;
            delete b.__kanbanLastInsertBefore;
            delete b.__kanbanStableCount;
            delete b.__kanbanLastChangeTime;
        }
    });
    body.classList.add('drag-over');

    const existingPh = body.querySelector('.kanban-placeholder');
    const existingBefore = (existingPh && existingPh.dataset.insertBefore) || '';

    const cards = Array.from(body.querySelectorAll('.kanban-card:not(.dragging)'));
    let insertBeforeTid = '';
    for (const card of cards) {
        const r = card.getBoundingClientRect();
        const top = r.top;
        const tid = card.dataset.tid;
        const isCurrent = (tid === existingBefore);
        const threshold = isCurrent ? (top + KANBAN_HYST_PX) : (top + KANBAN_TOP_SWITCH_PX);
        if (clientY < threshold) {
            insertBeforeTid = tid;
            break;
        }
    }
    const normalized = insertBeforeTid || '';

    if (body.__kanbanLastInsertBefore !== normalized) {
        body.__kanbanStableCount = 0;
        body.__kanbanLastChangeTime = Date.now();
    }
    body.__kanbanPrevInsertBefore = body.__kanbanLastInsertBefore;
    body.__kanbanLastInsertBefore = normalized;
    const stableCount = (body.__kanbanStableCount = (body.__kanbanStableCount || 0) + 1);
    const firstInColumn = !existingPh;
    const now = Date.now();
    const debounceOk = firstInColumn || !body.__kanbanLastChangeTime || (now - body.__kanbanLastChangeTime >= KANBAN_DEBOUNCE_MS);
    const stableEnough = (stableCount >= KANBAN_STABLE_FRAMES) || firstInColumn;

    if (!stableEnough || !debounceOk) return;
    if (existingPh && existingBefore === normalized) return;
    existingPh?.remove();

    const ph = document.createElement('div');
    ph.className = 'kanban-placeholder';
    ph.dataset.insertBefore = normalized;

    if (insertBeforeTid) {
        const insertBeforeCard = body.querySelector(`.kanban-card[data-tid="${insertBeforeTid}"]`);
        if (insertBeforeCard) {
            body.insertBefore(ph, insertBeforeCard);
        } else {
            const addCardEl = body.querySelector('.kanban-add-card');
            if (addCardEl) body.insertBefore(ph, addCardEl);
            else body.appendChild(ph);
        }
    } else {
        const addCardEl = body.querySelector('.kanban-add-card');
        if (addCardEl) body.insertBefore(ph, addCardEl);
        else body.appendChild(ph);
    }
};

const handleDragOver = (e, status, body) => {
    e.preventDefault();
    // throttle DOM updates via requestAnimationFrame to avoid flicker
    kanbanLastDrag = { clientY: e.clientY, body };
    if (!kanbanDragRaf) kanbanDragRaf = requestAnimationFrame(processKanbanDragOver);
};

// --- GANTT VIEW (Simplifié) ---
const renderGantt = (container) => {
    const allFiltered = getFilteredTasks();
    const tasks = allFiltered.filter(t => t.dueDate);
    const undatedCount = allFiltered.length - tasks.length;
    if(tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state text-center py-5 text-muted">
                <i class="fa-solid fa-chart-gantt fa-3x mb-3" style="opacity:0.5"></i>
                <p class="mb-2">Aucune tâche avec date limite.</p>
                ${undatedCount > 0 ? `<p class="small">${undatedCount} tâche(s) sans date — ajoutez une date pour les afficher ici.</p>` : '<p class="small">Ajoutez des dates aux tâches pour les voir dans le Gantt.</p>'}
            </div>`;
        return;
    }
    
    const dates = tasks.map(t => new Date(t.dueDate).getTime());
    const minDate = Math.min(...dates) - 86400000 * 3;
    const maxDate = Math.max(...dates) + 86400000 * 7;
    const days = Math.ceil((maxDate - minDate) / 86400000);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'gantt-container';
    
    const timeline = document.createElement('div');
    timeline.className = 'gantt-chart custom-scrollbar';
    
    // Header
    const header = document.createElement('div');
    header.className = 'gantt-header-row';
    header.innerHTML = '<div class="gantt-side">Tâche</div>';
    const timeTrack = document.createElement('div');
    timeTrack.className = 'gantt-timeline';
    for(let i=0; i<days; i++) {
        const d = new Date(minDate + i*86400000);
        const cell = document.createElement('div');
        cell.className = 'gantt-day-header';
        cell.style.flex = '1';
        cell.textContent = `${d.getDate()}/${d.getMonth()+1}`;
        timeTrack.appendChild(cell);
    }
    header.appendChild(timeTrack);
    timeline.appendChild(header);
    
    // Rows
    tasks.forEach(task => {
        const row = document.createElement('div');
        row.className = 'gantt-row';
        row.innerHTML = `<div class="gantt-row-title" title="${task.title}">${task.title}</div>`;
        
        const barCont = document.createElement('div');
        barCont.className = 'gantt-bar-container';
        
        const taskEnd = new Date(task.dueDate).getTime();
        // Assume duration 2 days if no start date, for visual
        const taskStart = taskEnd - 86400000 * 2; 
        
        const leftPct = ((taskStart - minDate) / (maxDate - minDate)) * 100;
        const widthPct = ((taskEnd - taskStart) / (maxDate - minDate)) * 100;
        
        const bar = document.createElement('div');
        bar.className = 'gantt-bar';
        bar.style.left = `${leftPct}%`;
        bar.style.width = `${Math.max(widthPct, 2)}%`; // Min width
        bar.style.background = getPoleDef(task._poleId).color;
        bar.textContent = task.assignees?.[0] || '';
        bar.onclick = () => openTaskPreviewModal(task);
        
        barCont.appendChild(bar);
        row.appendChild(barCont);
        timeline.appendChild(row);
    });
    
    wrapper.appendChild(timeline);
    container.appendChild(wrapper);
};

// --- INTERACTIONS ---

// Drop Kanban — comportement pas à pas :
// 1. Lire la position du placeholder (beforeTid = id de la carte SOUS la ligne, ou '' si fin de colonne).
// 2. Retirer la tâche de son pôle et lui mettre le bon status.
// 3. Colonne visuelle = getFilteredTasks().filter(status) (déjà sans la tâche retirée), même ordre que le rendu.
// 4. visualInsertIndex = index de beforeTid dans cette liste (= position « entre deux tâches » où insérer).
// 5. samePoleCountBefore = nombre de tâches du même pôle avant cette position (dans la colonne visuelle).
// 6. Dans pole.tasks, insérer avant la (samePoleCountBefore+1)-ième tâche de ce status → la tâche atterrit exactement à la position du placeholder.
const handleDrop = (e, status, body) => {
    e.preventDefault();
    const ph = body.querySelector('.kanban-placeholder');
    const beforeTid = ph ? (ph.dataset.insertBefore || '') : '';

    let data;
    try {
        data = JSON.parse(e.dataTransfer.getData('text/json'));
    } catch (_) { return; }
    const sprint = getSprint();
    if (!sprint || !data?.pid || !data?.tid) return;
    const pole = sprint.poles?.find(p => p.id === data.pid);
    if (!pole || !pole.tasks) return;
    const taskIndex = pole.tasks.findIndex(t => t.id === data.tid);
    if (taskIndex === -1) return;

    const [task] = pole.tasks.splice(taskIndex, 1);
    task.status = status;

    // Colonne visuelle SANS la tâche qu'on vient de retirer (ordre = ordre d'affichage)
    const columnTasksWithoutDragged = getFilteredTasks().filter(t => t.status === status);
    const visualInsertIndex = beforeTid
        ? (() => { const i = columnTasksWithoutDragged.findIndex(t => t.id === beforeTid); return i >= 0 ? i : columnTasksWithoutDragged.length; })()
        : columnTasksWithoutDragged.length;
    const samePoleCountBefore = columnTasksWithoutDragged
        .slice(0, visualInsertIndex)
        .filter(t => t._poleId === data.pid).length;

    // insertAt = index où insérer pour que la tâche soit à la position visuelle (entre les tâches)
    // On insère AVANT la (samePoleCountBefore+1)-ième tâche de ce statut dans pole.tasks
    let insertAt = pole.tasks.length;
    let sameStatusCount = 0;
    for (let i = 0; i < pole.tasks.length; i++) {
        if (pole.tasks[i].status !== status) continue;
        sameStatusCount++;
        if (sameStatusCount === samePoleCountBefore + 1) {
            insertAt = i;
            break;
        }
    }

    pole.tasks.splice(insertAt, 0, task);

    // Fire confetti only when moved to `done`
    if (status === 'done') {
        const dragged = document.querySelector('.kanban-card.dragging');
        let x, y;
        if (dragged) {
            const r = dragged.getBoundingClientRect();
            x = r.left + r.width / 2;
            y = r.top + r.height / 2;
        } else {
            const rect = body.getBoundingClientRect();
            x = e.clientX || (rect.left + rect.width / 2);
            y = e.clientY || (rect.top + 40);
        }
        fireConfetti(x, y);
    }

    removePlaceholder(body);
    render();
};

// old openTaskPreview removed — replaced by openTaskPreviewModal

const openTaskPreviewModal = (task) => {
    currentPreviewTask = task;
    document.getElementById('previewTitle').textContent = task.title || 'Aperçu tâche';
    document.getElementById('previewDescription').textContent = task.desc || '';
    const headerStatusEl = document.getElementById('previewHeaderStatus');
    if(headerStatusEl) headerStatusEl.innerHTML = `<span class="status-badge badge-${task.status}">${task.status}</span>`;
    document.getElementById('previewAssignees').innerHTML = (task.assignees || []).map(a => `<img src="https://ui-avatars.com/api/?name=${encodeURIComponent(a)}" class="avatar" title="${a}">`).join('');
    const poleDef = getPoleDef(task._poleId) || { icon: 'fa-circle', name: 'Non défini', color: '#888' };
    document.getElementById('previewPole').innerHTML = `<i class="fa-solid ${poleDef.icon}" style="color:${poleDef.color}"></i> <span style="color:${poleDef.color}">${poleDef.name}</span>`;
    const sprint = getSprint();
    const partiePath = sprint && sprint.parties ? findPartyPath(sprint.parties, task.partieId) : null;
    document.getElementById('previewPartie').textContent = partiePath ? `${partiePath.code} — ${partiePath.namePath}` : '';
    document.getElementById('previewDueDate').textContent = task.dueDate || '';
    document.getElementById('previewImages').innerHTML = (task.images || []).map(src => `<img src="${src}" alt="preview">`).join('');

    document.getElementById('previewImagesSection').style.display = (task.images && task.images.length > 0) ? 'block' : 'none';
    document.getElementById('previewDescriptionSection').style.display = task.desc ? 'block' : 'none';
    document.getElementById('previewAssigneesSection').style.display = (task.assignees && task.assignees.length > 0) ? 'block' : 'none';
    document.getElementById('previewDueDateSection').style.display = task.dueDate ? 'block' : 'none';
    document.getElementById('previewPartieSection').style.display = partiePath ? 'block' : 'none';

    new bootstrap.Modal(document.getElementById('previewModal')).show();
};

const openTaskModalForNew = (defaultStatus = 'todo') => {
    const sprint = getSprint();
    if (!sprint) { alert('Aucun sprint sélectionné.'); return; }
    newTaskDefaultStatus = defaultStatus;
    currentModalTask = { assignees: [], images: [] };
    document.getElementById('modalTitle').textContent = 'Nouvelle tâche';
    document.getElementById('taskId').value = '';
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDesc').value = '';
    document.getElementById('taskDate').value = '';
    document.getElementById('taskStatus').value = defaultStatus;

    const poleGroup = document.getElementById('taskPoleGroup');
    const poleSelect = document.getElementById('taskPole');
    poleGroup.style.display = 'block';
    poleSelect.innerHTML = '';
    (sprint.poles || []).forEach(p => {
        const def = getPoleDef(p.id);
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = def.name;
        poleSelect.appendChild(opt);
    });
    if (viewState.poleId !== 'all' && sprint.poles?.some(p => p.id === viewState.poleId))
        poleSelect.value = viewState.poleId;

    const pSelect = document.getElementById('taskPartie');
    pSelect.innerHTML = '<option value="">-- Aucune --</option>';
    const traverse = (p, level=0) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = '\u00A0'.repeat(level*3) + p.name;
        pSelect.appendChild(opt);
        if(p.children) p.children.forEach(c => traverse(c, level+1));
    };
    if(sprint.parties) sprint.parties.forEach(p => traverse(p));

    const aCont = document.getElementById('assigneesContainer');
    aCont.innerHTML = '';
    ['Alice', 'Bob', 'Charlie', 'David'].forEach(u => {
        const badge = document.createElement('span');
        badge.className = 'badge bg-secondary';
        badge.style.cursor = 'pointer';
        badge.textContent = u;
        badge.onclick = () => {
            if(!currentModalTask.assignees) currentModalTask.assignees = [];
            if(currentModalTask.assignees.includes(u)) currentModalTask.assignees = currentModalTask.assignees.filter(x => x!==u);
            else currentModalTask.assignees.push(u);
            badge.className = `badge ${currentModalTask.assignees.includes(u) ? 'bg-primary' : 'bg-secondary'}`;
        };
        aCont.appendChild(badge);
    });
    document.getElementById('imgPreview').innerHTML = '';

    new bootstrap.Modal(document.getElementById('taskModal')).show();
};

const openTaskModal = (task) => {
    currentModalTask = task;
    document.getElementById('modalTitle').textContent = 'Tâche';
    document.getElementById('taskPoleGroup').style.display = 'none';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title || '';
    document.getElementById('taskDesc').value = task.desc || '';
    document.getElementById('taskDate').value = task.dueDate || '';
    document.getElementById('taskStatus').value = task.status || 'todo';

    const pSelect = document.getElementById('taskPartie');
    pSelect.innerHTML = '<option value="">-- Aucune --</option>';
    const sprint = getSprint();
    const traverse = (p, level=0) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = '\u00A0'.repeat(level*3) + p.name;
        if(task.partieId === p.id) opt.selected = true;
        pSelect.appendChild(opt);
        if(p.children) p.children.forEach(c => traverse(c, level+1));
    };
    if(sprint?.parties) sprint.parties.forEach(p => traverse(p));

    const aCont = document.getElementById('assigneesContainer');
    aCont.innerHTML = '';
    ['Alice', 'Bob', 'Charlie', 'David'].forEach(u => {
        const badge = document.createElement('span');
        badge.className = `badge ${task.assignees?.includes(u) ? 'bg-primary' : 'bg-secondary'}`;
        badge.style.cursor = 'pointer';
        badge.textContent = u;
        badge.onclick = () => {
            if(!task.assignees) task.assignees = [];
            if(task.assignees.includes(u)) task.assignees = task.assignees.filter(x => x!==u);
            else task.assignees.push(u);
            badge.className = `badge ${task.assignees.includes(u) ? 'bg-primary' : 'bg-secondary'}`;
        };
        aCont.appendChild(badge);
    });

    document.getElementById('imgPreview').innerHTML = (task.images || []).map(src => `<img src="${src}" style="height:60px; border-radius:4px; border:1px solid #555">`).join('');

    new bootstrap.Modal(document.getElementById('taskModal')).show();
};

const generateTaskId = () => 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);

const saveTask = () => {
    const title = (document.getElementById('taskTitle').value || '').trim();
    if (!title) {
        alert('Le titre est obligatoire.');
        return;
    }
    const taskId = document.getElementById('taskId').value;
    const isNew = !taskId;

    if (isNew) {
        const sprint = getSprint();
        if (!sprint) return;
        const poleId = document.getElementById('taskPole').value;
        if (!poleId) {
            alert('Veuillez choisir un pôle.');
            return;
        }
        const pole = sprint.poles?.find(p => p.id === poleId);
        if (!pole) return;
        if (!pole.tasks) pole.tasks = [];
        const newTask = {
            id: generateTaskId(),
            title,
            desc: document.getElementById('taskDesc').value || '',
            status: document.getElementById('taskStatus').value || 'todo',
            partieId: document.getElementById('taskPartie').value || '',
            dueDate: document.getElementById('taskDate').value || '',
            assignees: currentModalTask?.assignees || [],
            images: currentModalTask?.images || []
        };
        pole.tasks.push(newTask);
    } else {
        if (!currentModalTask) return;
        currentModalTask.title = title;
        currentModalTask.desc = document.getElementById('taskDesc').value || '';
        currentModalTask.status = document.getElementById('taskStatus').value || 'todo';
        currentModalTask.partieId = document.getElementById('taskPartie').value || '';
        currentModalTask.dueDate = document.getElementById('taskDate').value || '';
    }
    bootstrap.Modal.getInstance(document.getElementById('taskModal'))?.hide();
    render();
};

const handleImageUpload = (e) => {
    if(!currentModalTask.images) currentModalTask.images = [];
    Array.from(e.target.files).forEach(f => {
        const r = new FileReader();
        r.onload = ev => {
            currentModalTask.images.push(ev.target.result);
            document.getElementById('imgPreview').innerHTML += `<img src="${ev.target.result}" style="height:60px; border-radius:4px">`;
        };
        r.readAsDataURL(f);
    });
};

const showTeamModal = () => {
    const tasks = getFilteredTasks();
    const workload = {};
    tasks.forEach(t => (t.assignees||[]).forEach(u => workload[u] = (workload[u]||0) + 1));
    const maxTasks = Math.max(1, ...Object.values(workload));
    const body = document.getElementById('teamWorkloadBody');
    body.innerHTML = Object.entries(workload).map(([name, count]) => {
        const pct = Math.min((count / maxTasks) * 100, 100);
        const color = pct > 80 ? '#dc3545' : pct > 50 ? '#fd7e14' : '#28a745';
        return `
            <div class="mb-3">
                <div class="d-flex justify-content-between mb-1">
                    <span><img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}" class="avatar me-2">${name}</span>
                    <small class="text-muted">${count} tâche(s)</small>
                </div>
                <div class="workload-bar-bg">
                    <div class="workload-bar-fill" style="width:${pct}%; background:${color}"></div>
                </div>
            </div>
        `;
    }).join('') || '<div class="text-center text-muted p-4">Aucune affectation active</div>';
    new bootstrap.Modal(document.getElementById('teamWorkloadModal')).show();
};

const fireConfetti = (x, y) => {
    const colors = ['#36B4A9', '#fd7e14', '#e83e8c'];

    const pieces = 40; // number of confetti pieces
    for (let i = 0; i < pieces; i++) {
        const c = document.createElement('div');
        c.className = 'confetti';

        // position at drop point
        c.style.left = `${x}px`;
        c.style.top = `${y}px`;

        // size variability
        const w = Math.round(Math.random() * 8) + 6; // 6 - 14px
        const h = Math.round(Math.random() * 10) + 6; // 6 - 16px
        c.style.setProperty('--w', `${w}px`);
        c.style.setProperty('--h', `${h}px`);

        // random direction & distance (explode in all directions)
        const angle = Math.random() * Math.PI * 2; // 0..2PI
        const distance = Math.random() * 220 + 40; // 40..260px
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance; // can be negative (up) or positive (down)
        c.style.setProperty('--dx', `${dx.toFixed(2)}px`);
        c.style.setProperty('--dy', `${dy.toFixed(2)}px`);

        // rotation
        const rot = ((Math.random() * 720) + 360) * (Math.random() < 0.5 ? -1 : 1);
        c.style.setProperty('--rot', `${rot.toFixed(0)}deg`);

        // color
        c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];

        // duration & stagger
        const dur = (Math.random() * 0.8) + 0.9; // 0.9 - 1.7s for snappier explosion
        c.style.setProperty('--duration', `${dur}s`);
        c.style.animationDelay = `${(Math.random() * 120)}ms`;

        document.getElementById('confetti-container').appendChild(c);

        // remove after animation finishes
        setTimeout(() => c.remove(), (dur * 1000) + 600 + Math.random() * 200);
    }
};

const exportJSON = () => {
    const a = document.createElement('a');
    a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(boardData));
    a.download = 'synapsis_export.json';
    a.click();
};

const importJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = e => {
        const file = e.target.files?.[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = ev => {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed || !Array.isArray(parsed.sprints)) {
                    alert('JSON invalide : structure attendue { "sprints": [ ... ] }');
                    return;
                }
                boardData = parsed;
                viewState.sprintId = parsed.sprints.length > 0 ? parsed.sprints[0].id : null;
                render();
            } catch (err) {
                alert('JSON invalide : ' + (err.message || 'erreur de parsing'));
            }
        };
        r.readAsText(file);
    };
    input.click();
};

// Start
window.onload = init;