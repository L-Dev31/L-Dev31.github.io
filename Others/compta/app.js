const STORAGE_ROWS = 'compta_rows';
const STORAGE_LAST = 'compta_last';
const STORAGE_SORT = 'compta_sort';
let rows = JSON.parse(localStorage.getItem(STORAGE_ROWS) || '[]');
const $ = (s, r = document) => r.querySelector(s);
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }
function todayIso(){ const d=new Date(); const mm=('0'+(d.getMonth()+1)).slice(-2); const dd=('0'+d.getDate()).slice(-2); return `${d.getFullYear()}-${mm}-${dd}` }
function getCurrentYear(){ return String((new Date()).getFullYear()); }
function computeNextInvoiceFromRows(year){
  let max = 0;
  (rows||[]).forEach(r=>{
    try{
      const inv = (r.invoice_number||'').toString().trim();
      const m = inv.match(new RegExp('^' + year + '-(\\d+)$'));
      if(m && m[1]){
        const n = parseInt(m[1],10);
        if(!isNaN(n)) max = Math.max(max, n);
      }
    }catch(e){}
  });
  return `${year}-${max+1}`
}
function formatPrice(n){ return (Number(n||0).toFixed(2)).replace('.',',') + ' €' }
function initials(name){ if(!name) return '?'; const parts = name.trim().split(/\s+/).filter(Boolean); if(parts.length===0) return '?'; if(parts.length===1) return parts[0].slice(0,2).toUpperCase(); return (parts[0][0]+(parts[1][0]||'')).toUpperCase(); }
function hashString(s){ let h=5381; for(let i=0;i<s.length;i++) h = ((h<<5)+h) + s.charCodeAt(i); return h >>> 0 }
function nameToPastel(name){ const key=(name||'').toString(); const h=hashString(key||String(Math.random())); const hue=h%360; const sat = 20 + (h%16); const light = 72 + (h%16); return { bg: `hsl(${hue}, ${sat}%, ${light}%)`, light}; }
function setPfpInitials(el, name){ if(!el) return; const info = nameToPastel(name||''); el.style.backgroundImage=''; el.style.background = info.bg; el.textContent = initials(name||''); const textColor = (info.light && info.light > 70) ? '#072010' : '#ffffff'; el.style.color = textColor; el.style.fontWeight = '700'; }
function getFormData(){ const select = document.getElementById('service_type'); let unitPrice=0; let prestationLabel=''; if(select){ if(select.value === 'autre'){ unitPrice = parseFloat((document.getElementById('autre_seance_prix')||{value:'0'}).value || '0') || 0; prestationLabel = (document.getElementById('autre_seance_desc')||{value:''}).value.trim() || 'Autre séance'; } else { unitPrice = parseFloat(select.value || '0') || 0; const opt = select.options[select.selectedIndex] || null; prestationLabel = opt && opt.text ? opt.text.split('—')[0].trim() : ''; } }
  const pm = (document.getElementById('payment_method')||{value:''}).value.trim(); const paymentMethodFinal = (pm === 'Autre') ? (document.getElementById('payment_method_other')||{value:''}).value.trim() : pm;
  const invoice = (document.getElementById('invoice_number')||{value:''}).value.trim(); const invoice_date = (document.getElementById('invoice_date')||{value:todayIso()}).value || todayIso();
  const quantity = parseInt((document.getElementById('service_quantity')||{value:'1'}).value || '1',10) || 1;
  return {
    invoice_number: invoice,
    invoice_date: invoice_date,
    client_name: (document.getElementById('client_name')||{value:''}).value.trim(),
    client_email: (document.getElementById('client_email')||{value:''}).value.trim(),
    service_type: prestationLabel,
    payment_method: paymentMethodFinal,
    payment_note: (document.getElementById('payment_note')||{value:''}).value.trim(),
    unit_price: parseFloat(unitPrice.toFixed(2)),
    quantity: quantity,
    total_amount: parseFloat((unitPrice * quantity).toFixed(2))
  } }
function updatePreview(){
  const d = getFormData();
  const pfp = document.getElementById('previewPfp');
  const clientEl = document.getElementById('previewClient');
  const serviceEl = document.getElementById('previewService');
  const totalEl = document.getElementById('previewTotal');
  const invoiceEl = document.getElementById('previewInvoice');
  const paymentEl = document.getElementById('previewPayment');
  if(pfp) pfp.textContent = initials(d.client_name);
  setPfpInitials(pfp, d.client_name);
  if(clientEl) clientEl.textContent = d.client_name || '—';
  if(serviceEl) serviceEl.textContent = (d.service_type || '—') + (d.quantity ? (' • x' + d.quantity) : '');
  const emailEl = document.getElementById('previewEmail');
  if(emailEl){ emailEl.textContent = d.client_email || ''; emailEl.className = d.client_email ? 'meta email' : 'meta'; }
  if(totalEl) totalEl.textContent = (d.total_amount ? d.total_amount.toFixed(2) : '0.00') + ' €';
  if(invoiceEl) invoiceEl.textContent = `N° ${d.invoice_number || '—'} • ${d.invoice_date || '—'}`;
  if(paymentEl) paymentEl.textContent = d.payment_method || '—';
  document.getElementById('priceBig').textContent = (d.total_amount ? d.total_amount.toFixed(2) : '0.00') + ' €';
  updateControls();
}
function validateEmailValue(val){ if(!val) return false; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val); }
function isFormValid(){
  const invoice = (document.getElementById('invoice_number')||{value:''}).value.trim();
  const date = (document.getElementById('invoice_date')||{value:''}).value;
  const client = (document.getElementById('client_name')||{value:''}).value.trim();
  const service = (document.getElementById('service_type')||{value:''}).value;
  if(!invoice || !date || !client) return false;
  if(!service) return false;
  if(service === 'autre'){
    const desc = (document.getElementById('autre_seance_desc')||{value:''}).value.trim();
    const prix = parseFloat((document.getElementById('autre_seance_prix')||{value:'0'}).value || '0');
    if(!desc || isNaN(prix) || prix <= 0) return false;
  }
  // require payment method to be selected and if 'Autre' then require the other field
  const pm = (document.getElementById('payment_method')||{value:''}).value;
  if(!pm) return false;
  if(pm === 'Autre'){
    const other = (document.getElementById('payment_method_other')||{value:''}).value.trim();
    if(!other) return false;
  }
  return true
}
function updateControls(){
  const addBtn = document.getElementById('addBtn');
  const emailVal = (document.getElementById('client_email')||{value:''}).value.trim();
  const emailProvided = !!emailVal;
  const emailValid = validateEmailValue(emailVal);
  const emailInput = document.getElementById('client_email');
  const emailError = document.getElementById('client_email_error');

  if(emailProvided && !emailValid){
    if(emailInput) emailInput.classList.add('invalid');
    if(emailError) emailError.style.display = '';
  } else {
    if(emailInput) emailInput.classList.remove('invalid');
    if(emailError) emailError.style.display = 'none';
  }

  const formOk = isFormValid();
  const canEnter = formOk && !(emailProvided && !emailValid);
  if(addBtn) addBtn.disabled = !canEnter;

  // send button removed from UI — no action here
  // enable/disable the download button: same conditions as Entrer (form valid)
  const downloadBtn = document.getElementById('downloadBtn');
  if(downloadBtn){
    downloadBtn.disabled = !canEnter;
  }
}
function createCardElement(r){
  const card = document.createElement('div');
  card.className = 'card';
  try{ card.dataset.invoice = (r.invoice_number||'').toString(); card.dataset.client = (r.client_name||'').toString(); card.dataset.date = (r.invoice_date||'').toString(); }catch(e){}
  try{ if(r._id) card.dataset.id = r._id; }catch(e){}
  const pfp = document.createElement('div'); pfp.className='pfp'; pfp.textContent = initials(r.client_name); setPfpInitials(pfp, r.client_name);
  const info = document.createElement('div'); info.className='info';
  const row1 = document.createElement('div'); row1.className='row';
  const left = document.createElement('div');
  const strong = document.createElement('strong'); strong.innerHTML = escapeHtml(r.client_name || '—');
  const meta = document.createElement('div'); meta.className='meta'; meta.innerHTML = escapeHtml(r.service_type || '—') + (r.quantity ? (' • x' + escapeHtml(String(r.quantity))) : '');
  const emailMeta = document.createElement('div'); emailMeta.className='meta email'; emailMeta.innerHTML = escapeHtml(r.client_email || '');
  left.appendChild(strong); left.appendChild(meta); if(emailMeta && emailMeta.innerHTML) left.appendChild(emailMeta);
  const amount = document.createElement('div'); amount.className='amount'; amount.textContent = ((parseFloat(r.total_amount)||0).toFixed(2)) + ' €';
  row1.appendChild(left); row1.appendChild(amount);
  const row2 = document.createElement('div'); row2.className='row';
  const inv = document.createElement('div'); inv.className='meta'; inv.textContent = `N° ${r.invoice_number || '—'} • ${r.invoice_date || '—'}`;
  const pay = document.createElement('div'); pay.className='meta'; pay.textContent = (r.payment_method || '') + (r.payment_note ? ' • ' + r.payment_note : '');
  row2.appendChild(inv); row2.appendChild(pay);
  try{
    const actionsDiv = document.createElement('div'); actionsDiv.className = 'actions';
    // per-card Download
    const cardDownloadBtn = document.createElement('button'); cardDownloadBtn.type='button'; cardDownloadBtn.className='secondary'; cardDownloadBtn.title='Télécharger cette facture'; cardDownloadBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
    cardDownloadBtn.addEventListener('click', function(e){ e.stopPropagation(); (async function(){ try{ const doc = await buildInvoiceDoc(r); const filename = `facture_${(r.invoice_number||'facture').replace(/[^0-9A-Za-z-_\.]/g,'_')}.pdf`; doc.save(filename); showToast('Téléchargement facture...'); }catch(ex){ console.error(ex); alert('Erreur génération PDF'); } })(); });
    // per-card Send removed (button omitted)
    const editBtn = document.createElement('button'); editBtn.type='button'; editBtn.className='secondary'; editBtn.title='Modifier'; editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    editBtn.addEventListener('click', function(e){ e.stopPropagation(); if(r && r._id) startEdit(r._id); });
    const delBtn = document.createElement('button'); delBtn.type='button'; delBtn.className='secondary'; delBtn.title='Supprimer'; delBtn.style.borderColor = '#e76b6b'; delBtn.style.color = '#b30000'; delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    delBtn.addEventListener('click', function(e){ e.stopPropagation(); if(r && r._id) deleteRow(r._id); });
    // append in chosen order: download, edit, delete
    actionsDiv.appendChild(cardDownloadBtn); actionsDiv.appendChild(editBtn); actionsDiv.appendChild(delBtn);
    row2.appendChild(actionsDiv);
  }catch(e){}
  info.appendChild(row1); info.appendChild(row2); card.appendChild(pfp); card.appendChild(info); return card }

// ensure every row has a stable _id used for editing/deleting
function ensureRowIds(){ try{ rows = (rows||[]).map(r => { if(r._id) return r; r._id = 'id_' + (hashString(JSON.stringify(r) + String(Math.random()))); return r; }); }catch(e){} }

function startEdit(id){ try{ const idx = rows.findIndex(r=>r && r._id === id); if(idx === -1) return; const r = rows[idx]; // populate form
    document.getElementById('invoice_number').value = r.invoice_number || '';
    document.getElementById('invoice_date').value = r.invoice_date || todayIso();
    document.getElementById('client_name').value = r.client_name || '';
    document.getElementById('client_email').value = r.client_email || '';
    // payment method: try to match existing option, otherwise set to Autre and fill other field
    const pm = document.getElementById('payment_method'); const pmOther = document.getElementById('payment_method_other'); const pmOtherLabel = document.getElementById('payment_method_other_label'); if(pm){ let found=false; for(let i=0;i<pm.options.length;i++){ if(pm.options[i].value === r.payment_method){ pm.value = pm.options[i].value; found = true; break; } } if(!found){ pm.value = 'Autre'; if(pmOther) pmOther.style.display = ''; if(pmOtherLabel) pmOtherLabel.style.display = ''; pmOther.value = r.payment_method || ''; } else { if(pmOther) pmOther.style.display = 'none'; if(pmOtherLabel) pmOtherLabel.style.display = 'none'; pmOther.value = ''; } }
    document.getElementById('payment_note').value = r.payment_note || '';
    // service type: try to match by label text; fallback to 'autre'
    const st = document.getElementById('service_type'); if(st){ let matched=false; for(let i=0;i<st.options.length;i++){ const optLabel = (st.options[i].text || '').split('—')[0].trim(); if(optLabel === r.service_type){ st.value = st.options[i].value; document.getElementById('autre_seance_zone').style.display = 'none'; matched=true; break; } } if(!matched){ st.value = 'autre'; document.getElementById('autre_seance_zone').style.display = 'flex'; document.getElementById('autre_seance_desc').value = r.service_type || ''; document.getElementById('autre_seance_prix').value = (r.unit_price != null)? r.unit_price : ''; } }
    // mark editing state
    window._editingId = id;
    const addBtn = document.getElementById('addBtn'); if(addBtn) addBtn.innerHTML = '<i class="fa-solid fa-save" aria-hidden="true"></i>Mettre à jour';
    const cancelBtn = document.getElementById('cancelEditBtn'); if(cancelBtn) cancelBtn.style.display='';
    try{ document.querySelectorAll('.card.editing').forEach(el=>el.classList.remove('editing')); const cardEl = document.querySelector('[data-id="'+id+'"]'); if(cardEl) cardEl.classList.add('editing'); }catch(e){}
    try{ updateFormTitle(); }catch(e){}
    updatePreview(); updateControls(); document.getElementById('client_name').focus();
  }catch(e){}
}

function updateFormTitle(){ try{ const t = document.getElementById('formTitle'); if(!t) return; if(window._editingId){ const r = (rows||[]).find(x=>x && x._id === window._editingId) || null; const inv = r ? (r.invoice_number || '—') : (document.getElementById('invoice_number')||{value:'—'}).value || '—'; t.textContent = `Mettre à jour la facture N° ${inv}`; } else { t.textContent = 'Nouvelle facture'; } }catch(e){} }

function cancelEdit(){ try{ window._editingId = null; const addBtn = document.getElementById('addBtn'); if(addBtn) addBtn.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>Entrer'; const cancelBtn = document.getElementById('cancelEditBtn'); if(cancelBtn) cancelBtn.style.display='none'; // reset form partially
    try{ document.querySelectorAll('.card.editing').forEach(el=>el.classList.remove('editing')); }catch(e){}
    document.getElementById('rowForm').reset(); document.getElementById('autre_seance_zone').style.display='none'; document.getElementById('payment_method_other').style.display='none'; updateFormTitle(); updatePreview(); updateControls(); }catch(e){}
}
try{ updateFormTitle(); }catch(e){}


function deleteRow(id){ try{ if(!confirm('Confirmer : supprimer cette entrée ?')) return; const idx = rows.findIndex(r=>r && r._id === id); if(idx === -1) return; rows.splice(idx,1); saveRows(); updateListPreview(); try{ document.getElementById('invoice_number').value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){} showToast('Entrée supprimée'); if(window._editingId === id) cancelEdit(); }catch(e){} }
function saveRows(){ try{ localStorage.setItem(STORAGE_ROWS, JSON.stringify(rows)); }catch(e){} try{ sessionStorage.setItem(STORAGE_ROWS + '_cache', JSON.stringify(rows)); }catch(e){} }

function performImport(imported){
  if(!imported || imported.length === 0) return false;
  try{
  if((rows||[]).length > 0){
    const proceed = confirm('Attention : l\'import va remplacer le tableau actuel. Continuer ?');
    if(!proceed) return;
    const downloadBefore = confirm('Voulez-vous télécharger le tableau actuel avant d\'importer ? OK = Télécharger puis importer, Annuler = Importer sans télécharger.');
    if(downloadBefore){ try{ downloadCSVRows(rows); }catch(e){} }
    rows = [];
    try{ localStorage.removeItem(STORAGE_ROWS); sessionStorage.removeItem(STORAGE_ROWS + '_cache'); }catch(e){}
  }
  imported.forEach(r=>rows.push(r)); try{ ensureRowIds(); }catch(e){}
    saveRows(); updateListPreview(); updatePreview();
    return true;
  }catch(e){ return false; }
}
function updateTotals() {
  const totals = document.getElementById('cardsTotals');
  if (!totals) return;

  const totalAmount = rows.reduce((sum, row) => sum + (row.total_amount || 0), 0);

  if (rows.length > 0) {
    // Render the total as a styled card to match the other entries (no pfp)
    totals.innerHTML = `
      <div class="card total-card">
        <div class="info">
          <div class="row">
            <div>
              <strong>Total</strong>
            </div>
            <div class="amount">${formatPrice(totalAmount)}</div>
          </div>
        </div>
      </div>
    `;
    totals.style.display = 'block';
  } else {
    totals.innerHTML = '';
    totals.style.display = 'none';
  }
}

function updateListPreview() {
  const container = document.getElementById('cardsList');
  if (!container) return;

  container.innerHTML = '';
  const sort = localStorage.getItem(STORAGE_SORT) || 'desc';
  let list = rows.slice();

  if (sort === 'desc') {
    list.reverse();
  }

  const frag = document.createDocumentFragment();
  list.forEach(r => {
    frag.appendChild(createCardElement(r));
  });
  container.appendChild(frag);

  const header = document.getElementById('cardsHeader');
  if (header) {
    if (rows.length > 0) {
      header.style.display = 'block';
      header.textContent = rows.length + (rows.length > 1 ? ' lignes en mémoire' : ' ligne en mémoire');
    } else {
      header.style.display = 'none';
      header.textContent = '';
    }
  }

  updateTotals();
  updateClientsCount();
}
function updateClientsCount(){ const set = new Set((rows||[]).map(r=>r.client_name).filter(Boolean)); const clientsCountEl = document.getElementById('clientsCount'); if(clientsCountEl){ const size = set.size || 0; if(size === 0) clientsCountEl.textContent = '0 clients enregistrés'; else if(size === 1) clientsCountEl.textContent = '1 client enregistré'; else clientsCountEl.textContent = size + ' clients enregistrés'; } }
function addCurrentToList() {
  const d = getFormData();
  if (!d.invoice_number || !d.invoice_date || !d.client_name) {
    alert('Remplissez: Numéro, Date et Nom');
    return false;
  }
  const editingId = window._editingId || null;

  try {
    const newInv = (d.invoice_number || '').toString().trim();
    if (newInv) {
      if (editingId) {
        const conflict = rows.some(r => r && r._id !== editingId && (r.invoice_number || '').toString().trim() === newInv);
        if (conflict) {
          alert('Impossible : ce numéro de facture existe déjà pour une autre ligne.');
          return false;
        }
      } else {
        const conflict = rows.some(r => (r.invoice_number || '').toString().trim() === newInv);
        if (conflict) {
          alert('Impossible : ce numéro de facture existe déjà.');
          return false;
        }
      }
    }
  } catch (e) {}

    const idx = rows.findIndex(r => r && r._id === editingId);
    if (idx !== -1) {
      d._id = editingId;
      rows[idx] = d;
      saveRows();
      showToast('Entrée mise à jour ✅');
      cancelEdit();
    } else {
      d._id = 'id_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      rows.push(d);
      saveRows();
      showToast('Ajouté ✅');
    }

  updateListPreview();
  updatePreview();
  document.getElementById('invoice_number').value = computeNextInvoiceFromRows(getCurrentYear());
  return true;
}
// Generate a cleaned CSV string with French uppercase headers and formatted values
function generateCleanCSV(rowsToExport){
  if(!rowsToExport || rowsToExport.length===0) return null;
  // French headers (MAJUSCULES)
  const headers = ['NUMÉRO DE FACTURE','DATE','CLIENT','EMAIL','PRESTATION','PRIX UNITAIRE','QUANTITÉ','MODE DE PAIEMENT','NOTE DE PAIEMENT','MONTANT TOTAL'];

  const keys = ['invoice_number','invoice_date','client_name','client_email','service_type','unit_price','quantity','payment_method','payment_note','total_amount'];

  const lines = [headers.join(';')];
  rowsToExport.forEach(r => {
    // Clean and format each field
    const vals = keys.map(k => {
      let v = (r[k] ?? '').toString().trim();
      if(k === 'invoice_date' && v){
        try{ const dt = new Date(v); if(!isNaN(dt)) v = ('0'+dt.getDate()).slice(-2) + '/' + ('0'+(dt.getMonth()+1)).slice(-2) + '/' + dt.getFullYear(); }catch(e){}
      }
      if(k === 'unit_price' || k === 'total_amount'){
        let n = parseFloat(String(v).replace(/[€ ]/g,''));
        if(isNaN(n)) n = 0;
        // French formatting: comma decimal separator
        v = n.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2});
      }
      if(k === 'quantity'){
        v = (v === '') ? '' : Number(v).toString();
      }
      // replace any semicolons (CSV delimiter) with commas to avoid breaking CSV
      v = v.replace(/;/g, ',');
      return v;
    });
    lines.push(vals.join(';'));
  });
  return lines.join('\n') + '\n';
}

function downloadCSVRows(rowsToExport){
  const csv = generateCleanCSV(rowsToExport);
  if(!csv){ alert('Aucune ligne à exporter'); return; }
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  const filename = 'compta_rows_' + new Date().toISOString().replace(/[:.]/g,'-') + '.csv';
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); link.remove();
}

// Show a styled CSV preview (in French, uppercase headers)
function showCSVPreview(rowsToExport){
  const container = document.getElementById('csvPreviewContainer');
  const preview = document.getElementById('csvPreview');
  if(!container || !preview) return;
  const csv = generateCleanCSV(rowsToExport);
  if(!csv){ alert('Aucune ligne à prévisualiser'); return; }

  // Build table
  const lines = csv.trim().split(/\n/);
  const headers = lines.shift().split(';');
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  headers.forEach(h => { const th = document.createElement('th'); th.textContent = h.toUpperCase(); trh.appendChild(th); });
  thead.appendChild(trh); table.appendChild(thead);
  const tbody = document.createElement('tbody');
  lines.forEach((ln, idx) => {
    const tr = document.createElement('tr');
    const cols = ln.split(';');
    cols.forEach(c => { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  preview.innerHTML = '';
  preview.appendChild(table);
  container.style.display = '';

  // hook download and close
  const dl = document.getElementById('csvDownloadBtn');
  const closeBtn = document.getElementById('csvCloseBtn');
  if(dl){ dl.onclick = ()=> downloadCSVRows(rowsToExport); }
  if(closeBtn){ closeBtn.onclick = ()=> { container.style.display='none'; preview.innerHTML=''; } }
}
function showToast(text){ const t=document.querySelector('.toast'); if(!t) return; t.textContent=text; t.style.display='block'; setTimeout(()=>t.style.display='none',1400); }
document.getElementById('rowForm').addEventListener('input', function(){ updatePreview(); updateControls(); });
const sortSel = document.getElementById('sortOrder'); if(sortSel){ sortSel.addEventListener('change', function(){ localStorage.setItem(STORAGE_SORT, this.value); updateListPreview(); }); }
document.getElementById('service_type').addEventListener('change', function(){ const zone = document.getElementById('autre_seance_zone'); if(this.value === 'autre'){ zone.style.display = 'flex'; } else { zone.style.display = 'none'; document.getElementById('autre_seance_desc').value = ''; document.getElementById('autre_seance_prix').value = ''; } updatePreview(); updateControls(); });
document.getElementById('payment_method').addEventListener('change', function(){ var ta = document.getElementById('payment_method_other'); if(this.value === 'Autre'){ ta.style.display = ''; } else { ta.style.display = 'none'; ta.value = ''; } updatePreview(); updateControls(); });
// re-evaluate controls when the 'other' payment method field is edited
var _pmOther = document.getElementById('payment_method_other'); if(_pmOther){ _pmOther.addEventListener('input', function(){ updatePreview(); updateControls(); }); }
document.getElementById('invoice_date').addEventListener('change', function(){ updatePreview(); updateControls(); });
document.getElementById('rowForm').addEventListener('submit', function(e){
  e.preventDefault();
  const addBtn = document.getElementById('addBtn');
  if (addBtn && addBtn.disabled) return;
  const wasEditing = !!window._editingId;
  const ok = addCurrentToList();
  if (ok && !wasEditing) {
    document.getElementById('rowForm').reset();
    document.getElementById('client_name').focus();
  }
});
document.getElementById('client_name').addEventListener('keydown', function(e){
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    const wasEditing = !!window._editingId;
    const ok = addCurrentToList();
    if (ok && !wasEditing) {
      document.getElementById('rowForm').reset();
      document.getElementById('client_name').focus();
    }
  }
});

// send test email to client using mailto: (opens user's mail client) -- removed

// Initialize EmailJS
// Email sending functionality removed from UI per request.

// NOTE FOR EMAILJS USERS:
// EmailJS free plans have a size limit for API calls (around 2-3MB).
// If the generated PDF (including images) is too large, EmailJS will return a 413 "Payload Too Large" error.
// To fix this, you can either:
// 1. Reduce the size of the PDF by using smaller images or less complex content.
// 2. Upgrade your EmailJS plan to allow for larger attachments.
// EmailJS sending helper removed — sending via UI disabled per request.

// Send via UI has been removed; use Download to get the PDF and send manually.

// Download the current invoice as an HTML file
const downloadBtn = document.getElementById('downloadBtn');
function formatDateShort(iso){ if(!iso) return ''; try{ const dt = new Date(iso); const dd = ('0'+dt.getDate()).slice(-2); const mm = ('0'+(dt.getMonth()+1)).slice(-2); const yyyy = dt.getFullYear(); return `${dd}/${mm}/${yyyy}`; }catch(e){ return iso; } }

async function loadImageDataURL(url, options = {}){
  const { compress = false, compressionQuality = 0.75 } = options;
  try{
    if(!url) return null;
    // support special #file: prefix meaning local file path (strip prefix)
    if(url.startsWith('#file:')) url = url.slice(6);
    let res = await fetch(url);
    // if not found, try common fallback locations (images/ subfolder, root, etc.)
    if(!res.ok){
      const fallbacks = [];
      if(!url.includes('/')){
        fallbacks.push('images/' + url);
        fallbacks.push('./images/' + url);
        fallbacks.push('/images/' + url);
      }
      fallbacks.push('./' + url);
      fallbacks.push('/' + url);
      for(const fb of fallbacks){
        try{ const r2 = await fetch(fb); if(r2 && r2.ok){ res = r2; url = fb; break; } }catch(e){}
      }
      if(!res.ok) return null;
    }
    const blob = await res.blob();
    let dataUrl = await new Promise((resolve)=>{ const fr = new FileReader(); fr.onload = ()=> resolve(fr.result); fr.onerror = ()=> resolve(null); fr.readAsDataURL(blob); });
    if(!dataUrl) return null;
    // create image to obtain natural dimensions
    const img = await new Promise((resolve)=>{ const im = new Image(); im.onload = ()=> resolve(im); im.onerror = ()=> resolve(null); im.src = dataUrl; });
    if(!img) return { dataUrl };

    if (compress) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      // Fill background with white since JPEG doesn't support transparency
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      dataUrl = canvas.toDataURL('image/jpeg', compressionQuality);
    }

    return { dataUrl, width: img.naturalWidth || null, height: img.naturalHeight || null, isJpeg: compress };
  }catch(e){ return null; }
}

async function buildInvoiceDoc(d){
  if(!window.jspdf || !window.jspdf.jsPDF){ throw new Error('Bibliothèque PDF non chargée'); }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit: 'pt', format: 'a4'});
  const left = 40; let y = 40; const pageWidth = doc.internal.pageSize.getWidth();

  // Header area (logo left, business title to the right)
  doc.setTextColor('#072010');

  // try to load logo (local file: logo.png) and stamp (/images/stamp.png)
  const logoImg = await loadImageDataURL('images/logo.png', { compress: true });
  const stampImg = await loadImageDataURL('/images/stamp.png', { compress: true });

  // Top-left: logo (if available) and business title to the right
  let headerBottom = y;
  let rightX = left;
  if(logoImg && logoImg.dataUrl){
    const lw = logoImg.width || 80; const lh = logoImg.height || 80;
    const maxW = 200; const maxH = 120; // allow larger logo
    const ratio = Math.min(1, maxW / lw, maxH / lh);
    const drawW = (lw * ratio);
    const drawH = (lh * ratio);
    const imgType = logoImg.isJpeg ? 'JPEG' : (logoImg.dataUrl.indexOf('image/png') >= 0 ? 'PNG' : 'JPEG');
    doc.addImage(logoImg.dataUrl, imgType, left, y, drawW, drawH);
    rightX = left + drawW + 18; // start text to the right of logo
    headerBottom = y + drawH;
  } else {
    rightX = left;
    headerBottom = y;
  }

  // Business title to the right of logo
  const titleTop = y + 2;
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor('#072010');
  doc.text('Viviane de Vries', rightX, titleTop);
  doc.setFontSize(11); doc.setTextColor('#0b6b3a'); doc.setFont('helvetica','normal');
  doc.text('Ostéopathe Exclusif', rightX, titleTop + 18);

  // Business address block under the title (use muted color)
  doc.setFontSize(10); doc.setTextColor('#6b7b6b');
  let addrY = titleTop + 36;
  const lines = [
    'Cabinet « Villa DREAM »',
    '156 chemin de la Batterie',
    '97126 DESHAIES',
    '',
    'Tél : 06.20.76.70.80',
    'N° SIRET : 53900011700041',
    'Identifiant RPPS : 10010075736'
  ];
  lines.forEach(l => { doc.text(l, rightX, addrY); addrY += 12; });
  headerBottom = Math.max(headerBottom, addrY);
  y = headerBottom + 18; // add extra vertical spacing after header
  doc.setTextColor('#072010');

  // Reference value (will be placed under the centered title above the table)
  const ref = 'G.' + (d.invoice_number || '—');
  doc.setFontSize(12); doc.setFont('helvetica','normal');

  // Table with green outline and alternating row backgrounds
  // ensure extra spacing above the table so the centered title and left ref fit cleanly
  const tableStartY = Math.max(y + 100, 360);
  // place the title centered horizontally above the table with a generous gap
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  const titleY = tableStartY - 36;
  doc.text("Note d’honoraire", pageWidth / 2, titleY, { align: 'center' });
  // put the reference centered just below the title and style it in the same green as the subtitle
  doc.setFontSize(11); doc.setFont('helvetica','normal');
  const refY = titleY + 14; // center under the title
  doc.setTextColor('#0b6b3a');
  doc.text(ref, pageWidth / 2, refY, { align: 'center' });
  doc.setTextColor('#072010');
  const body = [
    ['Nom Prénom', d.client_name || '—'],
    ['Date', formatDateShort(d.invoice_date || todayIso())],
    ['Prix', (d.unit_price != null) ? formatPrice(d.unit_price) : formatPrice(d.total_amount)],
    ['Quantité', d.quantity != null ? String(d.quantity) : '1'],
    ['Mode de règlement', d.payment_method + (d.payment_note ? ' • ' + d.payment_note : '')],
    ['Total', formatPrice(d.total_amount)]
  ];

  doc.autoTable({
    startY: tableStartY,
    head: [],
    body: body,
    theme: 'grid',
    styles: { halign: 'left', valign: 'middle', font: 'helvetica', fontSize: 13, textColor: '#000' },
    columnStyles: { 0: {cellWidth: 140, fillColor: [255,255,255]}, 1: {cellWidth: pageWidth - left*2 - 140} },
    tableLineColor: [11,107,58],
    tableLineWidth: 0.6,
    didParseCell: function(data){
      if(data.row.index % 2 === 1){ data.cell.styles.fillColor = [243,255,243]; }
    }
  });

  // After table: place/date and notes
  const afterY = (doc.lastAutoTable && doc.lastAutoTable.finalY ? doc.lastAutoTable.finalY : (tableStartY + 140)) + 30;
  doc.setFontSize(11); doc.setFont('helvetica','normal');
  doc.text(`A Deshaies, le ${formatDateShort(d.invoice_date || todayIso())}`, left, afterY);

  // stamp image on the right if available (height auto / maintain aspect ratio)
  if(stampImg && stampImg.dataUrl){
    const sw = stampImg.width || 90; const sh = stampImg.height || 90;
    const targetW = 110; // target width; height will be auto
    const ratioS = targetW / sw;
    const drawW = sw * ratioS;
    const drawH = sh * ratioS;
    const imgType = stampImg.isJpeg ? 'JPEG' : (stampImg.dataUrl.indexOf('image/png') >= 0 ? 'PNG' : 'JPEG');
    doc.addImage(stampImg.dataUrl, imgType, pageWidth - left - drawW, afterY - 8, drawW, drawH);
  }

  // Footer: center TVA note and signature at bottom of page
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 56; // 56pt above bottom
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor('#6b7b6b');
  doc.text('« TVA non applicable, Article 293 B du CGI »', pageWidth / 2, footerY, { align: 'center' });

  return doc;
}

// helper to build and save PDF
async function generateInvoicePDF(d){
  const doc = await buildInvoiceDoc(d);
  const filename = `facture_${(d.invoice_number||'facture').replace(/[^0-9A-Za-z-_\.]/g,'_')}.pdf`;
  doc.save(filename);
  return filename;
}

if(downloadBtn){
  downloadBtn.addEventListener('click', function(){
    const d = getFormData();
    if(!d || !d.invoice_number){ alert('Numéro de facture requis pour télécharger'); return; }
    generateInvoicePDF(d);
    showToast('Facture PDF générée');
  });
}

const importBtn = document.getElementById('importCsvBtn');
const importInput = document.getElementById('importCsvInput');
const exportBtn = document.getElementById('exportCsvBtn');

// Show/hide "Précisez le mode de règlement" input & label when selecting 'Autre'
const paymentMethodSelect = document.getElementById('payment_method');
const paymentMethodOtherInput = document.getElementById('payment_method_other');
const paymentMethodOtherLabel = document.getElementById('payment_method_other_label');
if(paymentMethodSelect){
  paymentMethodSelect.addEventListener('change', function(){
    if(this.value === 'Autre'){
      if(paymentMethodOtherInput) paymentMethodOtherInput.style.display = '';
      if(paymentMethodOtherLabel) paymentMethodOtherLabel.style.display = '';
    } else {
      if(paymentMethodOtherInput) paymentMethodOtherInput.style.display = 'none';
      if(paymentMethodOtherLabel) paymentMethodOtherLabel.style.display = 'none';
      if(paymentMethodOtherInput) paymentMethodOtherInput.value = '';
    }
  });
}
const wipeBtn = document.getElementById('wipeBtn');
if(importBtn && importInput){
  importBtn.addEventListener('click', function(){ importInput.click(); });
  importInput.addEventListener('change', function(e){
    const f = e.target.files && e.target.files[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = function(){
      try{
        const text = reader.result || '';
        const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
        if(lines.length < 1){ showToast('Fichier vide'); return; }
        const headers = lines[0].split(/;|,/).map(h=>h.trim());
        const imported = [];
        for(let i = 1; i < lines.length; i++){
          const cols = lines[i].split(/;|,/).map(c=>c.trim()); if(cols.length === 0) continue;
          const obj = {};
          headers.forEach((h,idx)=>{ obj[h]=cols[idx]||''; });
          obj.unit_price = parseFloat(obj.unit_price||obj.total_amount||'0')||0;
          obj.quantity = parseInt(obj.quantity||'1',10) || 1;
          obj.total_amount = parseFloat(obj.total_amount|| (obj.unit_price * obj.quantity) || '0')||0;
          imported.push(obj);
        }
        if(imported.length === 0){ showToast('Aucun enregistrement trouvé'); return; }
        performImport(imported);
      }catch(ex){ showToast('Erreur import CSV'); }
    };
    reader.readAsText(f,'utf-8'); importInput.value='';
  });
}
if(exportBtn){ exportBtn.addEventListener('click', function(){ if((rows||[]).length===0){ alert('Aucune ligne à exporter'); return } showCSVPreview(rows); }); }
const previewCsvBtn = document.getElementById('previewCsvBtn');
if(previewCsvBtn){ previewCsvBtn.addEventListener('click', function(){ if((rows||[]).length===0){ alert('Aucune ligne à prévisualiser'); return } showCSVPreview(rows); }); }
// wipe handler (see enhanced handler below that also resets invoice and totals)
if(wipeBtn){ wipeBtn.addEventListener('click', function(){ if(!confirm('Confirmer : vider la table en mémoire ?')) return; rows = []; try{ localStorage.removeItem(STORAGE_ROWS); sessionStorage.removeItem(STORAGE_ROWS + '_cache'); }catch(e){} updateListPreview(); try{ document.getElementById('invoice_number').value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){} showToast('Table vidée ✅'); }); }

(function init(){
  document.getElementById('autre_seance_zone').style.display = 'none';
  const dateEl = document.getElementById('invoice_date'); if(!dateEl.value) dateEl.value = todayIso();
  const numEl = document.getElementById('invoice_number'); if(!numEl.value) numEl.value = computeNextInvoiceFromRows(getCurrentYear());
  // Removed logic that sets payment_method and service_type from last saved values to allow HTML defaults
  // ensure payment method is enabled and hide the 'other' field by default
  try{
    const pm = document.getElementById('payment_method'); if(pm) pm.disabled = false;
    const pmOther = document.getElementById('payment_method_other'); if(pmOther) pmOther.style.display = 'none';
  }catch(e){}
  // removed logic that forced a default for service_type; now respects HTML default
  try{ if((rows||[]).length === 0){ const cache = sessionStorage.getItem(STORAGE_ROWS + '_cache'); if(cache){ rows = JSON.parse(cache || '[]'); } } }catch(e){}
    // ensure all rows have stable ids for edit/delete
    try{ ensureRowIds(); }catch(e){}
  try{ if(!localStorage.getItem(STORAGE_SORT)) localStorage.setItem(STORAGE_SORT,'desc'); }catch(e){}
  try{ document.getElementById('invoice_number').value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){}
  updateListPreview(); updatePreview(); updateControls(); document.getElementById('client_name').focus();
  try{ window.addEventListener('beforeunload', saveRows); }catch(e){}
  // attach cancel edit handler
  const cancelBtn = document.getElementById('cancelEditBtn'); if(cancelBtn){ cancelBtn.addEventListener('click', function(){ cancelEdit(); }); }
})();