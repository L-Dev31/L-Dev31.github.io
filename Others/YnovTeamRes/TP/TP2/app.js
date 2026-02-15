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
        board.appendChild(col);
    });
    container.appendChild(board);
};

// --- KANBAN drag placeholder helpers ---

let kanbanDragRaf = null;
let kanbanLastDrag = null;

const removePlaceholder = (body) => {
    if (!body) return;
    // hide overlay if present
    if (body.__overlay) {
        body.__overlay.style.opacity = '0';
        body.__overlay.style.transform = 'translateY(-10000px)';
        delete body.__lastOverlayPos;
    }
    body.classList.remove('drag-over');
    // cancel any pending RAF for this body
    kanbanLastDrag = null;
    if (kanbanDragRaf) {
        cancelAnimationFrame(kanbanDragRaf);
        kanbanDragRaf = null;
    }
};

const removeAllPlaceholders = () => {
    // hide overlays and remove classes
    document.querySelectorAll('.kanban-body').forEach(b => {
        if (b.__overlay) {
            b.__overlay.style.opacity = '0';
            b.__overlay.style.transform = 'translateY(-10000px)';
            delete b.__lastOverlayPos;
        }
        b.classList.remove('drag-over');
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

const processKanbanDragOver = () => {
    kanbanDragRaf = null;
    const args = kanbanLastDrag;
    if (!args || !args.body) return;
    const { clientY, body } = args;

    body.classList.add('drag-over');

    // Prefer cached positions (built on dragstart) to avoid layout reads during drag
    const cached = body.__kanbanCardPos;
    let insertBeforeTid = '';

    if (Array.isArray(cached) && cached.length) {
        for (const pos of cached) {
            if (clientY < pos.mid) { insertBeforeTid = pos.tid; break; }
        }
    } else {
        // fallback: measure live DOM
        const cards = Array.from(body.querySelectorAll('.kanban-card:not(.dragging)'));
        for (const card of cards) {
            const r = card.getBoundingClientRect();
            if (clientY < r.top + r.height / 2) { insertBeforeTid = card.dataset.tid; break; }
        }
    }

    const existingPh = body.querySelector('.kanban-placeholder');
    const existingBefore = existingPh ? existingPh.dataset.insertBefore || '' : '';

    // If placeholder already at the correct spot, do nothing (prevents flicker)
    if (existingPh && existingBefore === (insertBeforeTid || '')) return;

    // Remove existing placeholder before inserting a new one
    if (existingPh) existingPh.remove();

    const ph = document.createElement('div');
    ph.className = 'kanban-placeholder';
    ph.dataset.insertBefore = insertBeforeTid || '';

    if (insertBeforeTid) {
        const insertBeforeCard = body.querySelector(`.kanban-card[data-tid="${insertBeforeTid}"]`);
        const height = insertBeforeCard ? Math.max(insertBeforeCard.getBoundingClientRect().height, 48) : 56;
        ph.style.height = height + 'px';
        body.insertBefore(ph, insertBeforeCard);
    } else {
        ph.style.height = '56px';
        body.appendChild(ph);
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
    const tasks = getFilteredTasks().filter(t => t.dueDate);
    if(tasks.length === 0) { container.innerHTML = '<div class="text-center mt-5 text-muted">Aucune tâche datée</div>'; return; }
    
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

const handleDrop = (e, status, body) => {
    e.preventDefault();
    const data = JSON.parse(e.dataTransfer.getData('text/json'));
    const sprint = getSprint();
    const pole = sprint.poles.find(p => p.id === data.pid);
    const taskIndex = pole.tasks.findIndex(t => t.id === data.tid);
    if (taskIndex === -1) return;

    // Remove the task from its current position
    const [task] = pole.tasks.splice(taskIndex, 1);
    task.status = status;

    // Determine insertion index based on placeholder (if any)
    const ph = body.querySelector('.kanban-placeholder');
    let insertAt = -1; // -1 means append at end
    if (ph) {
        const beforeTid = ph.dataset.insertBefore;
        if (beforeTid) {
            insertAt = pole.tasks.findIndex(t => t.id === beforeTid);
            if (insertAt === -1) insertAt = pole.tasks.length; // fallback
        } else {
            // append after last task with matching status
            let lastIdx = -1;
            for (let i = 0; i < pole.tasks.length; i++) {
                if (pole.tasks[i].status === status) lastIdx = i;
            }
            insertAt = lastIdx + 1;
        }
    } else {
        // no placeholder — append at end of same-status tasks
        let lastIdx = -1;
        for (let i = 0; i < pole.tasks.length; i++) {
            if (pole.tasks[i].status === status) lastIdx = i;
        }
        insertAt = lastIdx + 1;
    }

    // Insert task at computed index within pole.tasks
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
    document.getElementById('previewTitle').textContent = task.title || 'Aperçu tâche';
    document.getElementById('previewDescription').textContent = task.desc || '';
    // Put status badge next to title in header
    const headerStatusEl = document.getElementById('previewHeaderStatus');
    if(headerStatusEl) headerStatusEl.innerHTML = `<span class="status-badge badge-${task.status}">${task.status}</span>`;
    document.getElementById('previewAssignees').innerHTML = (task.assignees || []).map(a => `<img src="https://ui-avatars.com/api/?name=${encodeURIComponent(a)}" class="avatar" title="${a}">`).join('');
    const poleDef = getPoleDef(task._poleId) || { icon: 'fa-circle', name: 'Non défini', color: '#888' };
    document.getElementById('previewPole').innerHTML = `<i class="fa-solid ${poleDef.icon}" style="color:${poleDef.color}"></i> <span style="color:${poleDef.color}">${poleDef.name}</span>`;
    const partiePath = findPartyPath(getSprint().parties, task.partieId);
    document.getElementById('previewPartie').textContent = partiePath ? `${partiePath.code} — ${partiePath.namePath}` : '';
    document.getElementById('previewDueDate').textContent = task.dueDate || '';
    document.getElementById('previewImages').innerHTML = (task.images || []).map(src => `<img src="${src}" alt="preview">`).join('');

    // Hide sections if no content
    document.getElementById('previewImagesSection').style.display = (task.images && task.images.length > 0) ? 'block' : 'none';
    document.getElementById('previewDescriptionSection').style.display = task.desc ? 'block' : 'none';
    document.getElementById('previewAssigneesSection').style.display = (task.assignees && task.assignees.length > 0) ? 'block' : 'none';
    document.getElementById('previewDueDateSection').style.display = task.dueDate ? 'block' : 'none';
    document.getElementById('previewPartieSection').style.display = partiePath ? 'block' : 'none';

    new bootstrap.Modal(document.getElementById('previewModal')).show();
};

const openTaskModal = (task) => {
    currentModalTask = task;
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDesc').value = task.desc || '';
    document.getElementById('taskDate').value = task.dueDate || '';
    
    // Populate Parties Select
    const pSelect = document.getElementById('taskPartie');
    pSelect.innerHTML = '<option value="">-- Aucune --</option>';
    const traverse = (p, level=0) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = '\u00A0'.repeat(level*3) + p.name;
        if(task.partieId === p.id) opt.selected = true;
        pSelect.appendChild(opt);
        if(p.children) p.children.forEach(c => traverse(c, level+1));
    };
    if(getSprint().parties) getSprint().parties.forEach(p => traverse(p));
    
    // Assignees
    const aCont = document.getElementById('assigneesContainer');
    aCont.innerHTML = '';
    // Mock assignees
    const users = ['Alice', 'Bob', 'Charlie', 'David'];
    users.forEach(u => {
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

    // Images
    const imgPrev = document.getElementById('imgPreview');
    imgPrev.innerHTML = (task.images || []).map(src => `<img src="${src}" style="height:60px; border-radius:4px; border:1px solid #555">`).join('');

    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();
};

const saveTask = () => {
    if(!currentModalTask) return;
    currentModalTask.title = document.getElementById('taskTitle').value;
    currentModalTask.desc = document.getElementById('taskDesc').value;
    currentModalTask.partieId = document.getElementById('taskPartie').value;
    currentModalTask.dueDate = document.getElementById('taskDate').value;
    bootstrap.Modal.getInstance(document.getElementById('taskModal')).hide();
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
    
    const body = document.querySelector('#taskModal .modal-body'); // Reuse modal for simplicity or create new
    const originalContent = body.innerHTML;
    const originalTitle = document.getElementById('modalTitle').textContent;
    const originalFooter = document.querySelector('#taskModal .modal-footer').innerHTML;
    
    // Quick switch to team view in same modal container
    document.getElementById('modalTitle').textContent = "Charge de Travail";
    document.querySelector('#taskModal .modal-footer').innerHTML = '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fermer</button>';
    
    body.innerHTML = Object.entries(workload).map(([name, count]) => {
        const pct = Math.min((count / 5) * 100, 100); // 5 tasks = 100%
        const color = pct > 80 ? '#dc3545' : pct > 50 ? '#fd7e14' : '#28a745';
        return `
            <div class="mb-3">
                <div class="d-flex justify-content-between mb-1">
                    <span><img src="https://ui-avatars.com/api/?name=${name}" class="avatar me-2">${name}</span>
                    <small class="text-muted">${count} tâches</small>
                </div>
                <div class="workload-bar-bg">
                    <div class="workload-bar-fill" style="width:${pct}%; background:${color}"></div>
                </div>
            </div>
        `;
    }).join('') || '<div class="text-center text-muted p-4">Aucune affectation active</div>';
    
    const modalEl = document.getElementById('taskModal');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
    
    modalEl.addEventListener('hidden.bs.modal', () => {
        // Restore modal for tasks
        setTimeout(() => {
            body.innerHTML = originalContent;
            document.getElementById('modalTitle').textContent = originalTitle;
            document.querySelector('#taskModal .modal-footer').innerHTML = originalFooter;
            document.getElementById('saveTaskBtn').onclick = saveTask; // rebind
        }, 200);
    }, {once:true});
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
    input.onchange = e => {
        const r = new FileReader();
        r.onload = ev => {
            try { boardData = JSON.parse(ev.target.result); viewState.sprintId = boardData.sprints[0].id; render(); }
            catch(err) { alert('JSON Invalide'); }
        };
        r.readAsText(e.target.files[0]);
    };
    input.click();
};

// Start
window.onload = init;