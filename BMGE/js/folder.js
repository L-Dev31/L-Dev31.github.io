import { state, els } from './state.js';
import { parseBmg } from './bmg-format.js';
import { buildBmg } from './build-bmg.js';
import { renderEntries, updateMeta, showMessage, updateSaveButton } from './ui.js';

let folderFiles = [], folderName = '', activeFile = null, ctxMenu = null;
const byId = i => document.getElementById(i);

// --- Open/Load ---
export const openFolder = () => { const i = byId('folder-input'); if(i) { i.value=''; i.click(); } };

export async function handleFolderSelection(e) {
  const files = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.bmg'));
  if (!files.length) return showMessage('No .bmg files found', 'warning');

  folderFiles = files.map(f => ({ name: f.name, path: f.webkitRelativePath||f.name, file: f, scroll: 0 }))
                     .sort((a, b) => a.name.localeCompare(b.name));

  const path = folderFiles[0].path;
  folderName = path.includes('/') ? path.split('/')[0] : 'folder';

  document.body.classList.add('sidebar-open');
  renderSidebar();
  await loadBmgFromFolder(0);
}

async function loadBmgFromFolder(idx) {
  saveCurrentToMemory();
  const entry = folderFiles[idx];
  if (!entry) return;

  try {
    showMessage('Loading...', 'info');
    state.bmgFile = parseBmg(await entry.file.arrayBuffer());
    Object.assign(state, { fileName: entry.name, undoStack: [], redoStack: [] });

    els.fileLabel.textContent = entry.name;
    ['search', 'exportJson', 'importJson'].forEach(k => els[k].disabled = false);

    activeFile = idx;
    updateActiveItem();
    renderEntries(); updateMeta(); updateSaveButton();
    setTimeout(() => window.scrollTo(0, entry.scroll || 0), 0);
    showMessage(`Loaded ${state.bmgFile.messages.length} messages`, 'info');
  } catch (err) {
    console.error(err); showMessage(`Error: ${err.message}`, 'error');
  }
}

function saveCurrentToMemory() {
  if (activeFile === null || !state.bmgFile) return;
  folderFiles[activeFile].scroll = window.scrollY;
  try {
    const blob = new Blob([buildBmg(state.bmgFile)], { type: 'application/octet-stream' });
    folderFiles[activeFile].file = new File([blob], folderFiles[activeFile].name, { type: 'application/octet-stream' });
  } catch {}
}

const renderSidebar = () => {
  const list = byId('folder-file-list'), t = byId('folder-name');
  if (!list) return;
  if (t) t.textContent = folderName;
  list.innerHTML = '';
  
  folderFiles.forEach((f, i) => {
    const btn = document.createElement('button');
    btn.className = 'folder-item' + (i === activeFile ? ' active' : '');
    btn.textContent = f.path.split('/').pop();
    btn.onclick = () => loadBmgFromFolder(i);
    
    // Context events
    btn.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); showCtxMenu(e.clientX, e.clientY, i); };
    let tm; // Long press
    btn.onpointerdown = e => { if(!e.button) tm = setTimeout(() => showCtxMenu(e.clientX, e.clientY, i), 500); };
    btn.onpointerup = btn.onpointercancel = btn.onpointermove = () => clearTimeout(tm);
    list.appendChild(btn);
  });
};

const updateActiveItem = () => document.querySelectorAll('.folder-item').forEach((el, i) => el.classList.toggle('active', i === activeFile));

export function closeFolder() {
  saveCurrentToMemory();
  document.body.classList.remove('sidebar-open', 'sidebar-minimized');
  folderFiles = []; activeFile = null;
}

// --- ZIP ---
export async function downloadFolderZip() {
  if (!folderFiles.length) return showMessage('No folder loaded', 'warning');
  saveCurrentToMemory(); showMessage('Building ZIP...', 'info');
  try {
    const { zipSync } = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm');
    const data = {};
    for (const f of folderFiles) data[f.name] = new Uint8Array(await f.file.arrayBuffer());
    
    const url = URL.createObjectURL(new Blob([zipSync(data)], { type: 'application/zip' }));
    const a = document.createElement('a'); a.href = url; a.download = `${folderName}.zip`; a.click();
    URL.revokeObjectURL(url); showMessage('ZIP downloaded', 'info');
  } catch (e) { showMessage(`ZIP failed: ${e.message}`, 'error'); }
}

// --- Init & UI ---
export function initFolder() {
  const ev = (id, fn, t='click') => { const el = byId(id); if(el) el.addEventListener(t, fn); };
  
  ev('folder-input', handleFolderSelection, 'change');
  ev('open-folder-btn', openFolder);
  ev('folder-close-btn', closeFolder);
  ev('folder-zip-btn', downloadFolderZip);
  ev('folder-minimize-btn', () => document.body.classList.add('sidebar-minimized'));
  ev('folder-reopen-btn', () => document.body.classList.remove('sidebar-minimized'));
  
  // Resize logic
  const sb = byId('folder-sidebar');
  if (sb) {
    const h = document.createElement('div'); h.className = 'folder-resize-handle'; sb.appendChild(h);
    h.onmousedown = e => {
      e.preventDefault(); const sX = e.clientX, sW = sb.offsetWidth;
      document.body.classList.add('resizing');
      const mv = ev => document.documentElement.style.setProperty('--sidebar-w', Math.max(180, Math.min(600, sW + ev.clientX - sX)) + 'px');
      const up = () => { document.body.classList.remove('resizing'); removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    };
  }

  // Delete modal
  ev('delete-file-cancel', closeDelModal);
  ev('delete-file-confirm', confirmDelete);
  const ov = byId('delete-file-modal');
  if(ov) ov.onclick = e => e.target === ov && closeDelModal();
}

// --- Context ---
function showCtxMenu(x, y, idx) {
  if (!ctxMenu) {
    ctxMenu = document.createElement('div'); ctxMenu.className = 'folder-ctx-menu';
    ctxMenu.innerHTML = `<button data-a="r" class="ctx-item"><i class="fas fa-pen"></i> Rename</button><button data-a="d" class="ctx-item danger"><i class="fas fa-trash-alt"></i> Delete</button>`;
    document.body.appendChild(ctxMenu);
    ctxMenu.onclick = e => {
      const a = e.target.closest('button')?.dataset.a;
      if (a) { hideCtx(); a === 'r' ? startRename(ctxMenu.idx) : openDelModal(ctxMenu.idx); }
    };
    window.addEventListener('scroll', hideCtx, true);
    document.addEventListener('mousedown', e => ctxMenu.classList.contains('open') && !ctxMenu.contains(e.target) && hideCtx());
  }
  ctxMenu.idx = idx;
  ctxMenu.style.left = x + 'px'; ctxMenu.style.top = y + 'px';
  ctxMenu.classList.add('open');
  
  const l = byId('folder-file-list');
  if(l?.children[idx]) l.children[idx].classList.add('ctx-target');
  
  requestAnimationFrame(() => {
    const r = ctxMenu.getBoundingClientRect();
    if (r.right > innerWidth) ctxMenu.style.left = (innerWidth - r.width - 6) + 'px';
    if (r.bottom > innerHeight) ctxMenu.style.top = (innerHeight - r.height - 6) + 'px';
  });
}
const hideCtx = () => { if(ctxMenu) ctxMenu.classList.remove('open'); document.querySelectorAll('.ctx-target').forEach(e=>e.classList.remove('ctx-target')); };

// --- Rename ---
function startRename(idx) {
  const l = byId('folder-file-list'), ent = folderFiles[idx];
  if (!l?.children[idx] || !ent) return;
  
  const inp = document.createElement('input');
  inp.className='folder-rename-input'; inp.value = ent.name.replace(/\.bmg$/i, '');
  l.children[idx].textContent=''; l.children[idx].appendChild(inp);
  inp.select();

  const save = () => {
    const val = inp.value.trim(), name = val ? (val.toLowerCase().endsWith('.bmg') ? val : val+'.bmg') : ent.name;
    ent.name = name; ent.file = new File([ent.file], name, {type: ent.file.type});
    ent.path = ent.path.includes('/') ? ent.path.replace(/[^/]+$/, name) : name;
    if (activeFile === idx) { state.fileName = name; els.fileLabel.textContent = name; }
    renderSidebar();
  };
  inp.onblur = save;
  inp.onkeydown = e => { if(e.key === 'Enter') inp.blur(); if(e.key === 'Escape') renderSidebar(); };
}

// --- Delete ---
let delIdx = null;
const openDelModal = i => { delIdx = i; const m = byId('delete-file-modal'); if(m) { byId('delete-file-desc').textContent=`Delete "${folderFiles[i].name}"?`; m.classList.add('open'); }};
const closeDelModal = () => { delIdx = null; byId('delete-file-modal')?.classList.remove('open'); };
const confirmDelete = () => {
  if (delIdx === null) return closeDelModal();
  const wasAct = activeFile === delIdx;
  folderFiles.splice(delIdx, 1);
  if (!folderFiles.length) return closeFolder(), showMessage('Folder closed', 'info');
  
  if (wasAct) { activeFile = null; loadBmgFromFolder(Math.min(delIdx, folderFiles.length-1)); }
  else { if (activeFile > delIdx) activeFile--; renderSidebar(); updateActiveItem(); }
  closeDelModal(); showMessage('File deleted', 'info');
};
