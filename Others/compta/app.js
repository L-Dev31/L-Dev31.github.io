const STORAGE_ROWS = 'compta_rows';
const STORAGE_SORT = 'compta_sort';
let rows = JSON.parse(localStorage.getItem(STORAGE_ROWS) || '[]');
try{ rows = (rows||[]).map(r => { if(r && r.client_name) r.client_name = toTitleCase(r.client_name); return r; }); }catch(e){}
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

function parseInvoiceKey(inv){
  const s = (inv||'').toString().trim();
  const m = s.match(/^(\d{4})-(\d+)$/);
  if(m){ return { year: parseInt(m[1],10), num: parseInt(m[2],10), raw: s }; }
  const m2 = s.match(/^(\d{4})/);
  if(m2){ return { year: parseInt(m2[1],10), num: NaN, raw: s }; }
  return { year: NaN, num: NaN, raw: s };
}

function invoiceCompare(a,b){
  const ai = parseInvoiceKey((a&&a.invoice_number)||'');
  const bi = parseInvoiceKey((b&&b.invoice_number)||'');
  const aiValid = Number.isFinite(ai.year) && Number.isFinite(ai.num);
  const biValid = Number.isFinite(bi.year) && Number.isFinite(bi.num);
  if(aiValid && biValid){ if(ai.year !== bi.year) return ai.year - bi.year; return ai.num - bi.num; }
  if(aiValid && !biValid) return -1; if(!aiValid && biValid) return 1;
  return (ai.raw||'').localeCompare(bi.raw||'');
}
function formatPrice(n){ return (Number(n||0).toFixed(2)).replace('.',',') + ' €' }
function initials(name){ if(!name) return '?'; const parts = name.trim().split(/\s+/).filter(Boolean); if(parts.length===0) return '?'; if(parts.length===1) return parts[0].slice(0,2).toUpperCase(); return (parts[0][0]+(parts[1][0]||'')).toUpperCase(); }
function toTitleCase(s){ if(!s) return ''; return s.toString().trim().split(/\s+/).map(part => part.split('-').map(p => p ? (p[0].toUpperCase() + p.slice(1).toLowerCase()) : '').join('-')).join(' '); }
function hashString(s){ let h=5381; for(let i=0;i<s.length;i++) h = ((h<<5)+h) + s.charCodeAt(i); return h >>> 0 }
function nameToPastel(name){ const key=(name||'').toString(); const h=hashString(key||String(Math.random())); const hue=h%360; const sat = 20 + (h%16); const light = 72 + (h%16); return { bg: `hsl(${hue}, ${sat}%, ${light}%)`, light}; }
function setPfpInitials(el, name){ if(!el) return; const info = nameToPastel(name||''); el.style.backgroundImage=''; el.style.background = info.bg; el.textContent = initials(name||''); const textColor = (info.light && info.light > 70) ? '#072010' : '#ffffff'; el.style.color = textColor; el.style.fontWeight = '700'; }
function getFormData(){ const select = document.getElementById('service_type'); let unitPrice=0; let prestationLabel=''; if(select){ if(select.value === 'autre'){ unitPrice = parseFloat((document.getElementById('autre_seance_prix')||{value:'0'}).value || '0') || 0; prestationLabel = (document.getElementById('autre_seance_desc')||{value:''}).value.trim() || 'Autre séance'; } else { unitPrice = parseFloat(select.value || '0') || 0; const opt = select.options[select.selectedIndex] || null; prestationLabel = (select.value && select.value !== '') ? (opt && opt.text ? opt.text.split('—')[0].trim() : '') : ''; } }
  const pm = (document.getElementById('payment_method')||{value:''}).value.trim(); const paymentMethodFinal = (pm === 'Autre') ? (document.getElementById('payment_method_other')||{value:''}).value.trim() : pm;
  const invoice = (document.getElementById('invoice_number')||{value:''}).value.trim(); const invoice_date = (document.getElementById('invoice_date')||{value:todayIso()}).value || todayIso();
  const quantity = parseInt((document.getElementById('service_quantity')||{value:'1'}).value || '1',10) || 1;
  return {
    invoice_number: invoice,
    invoice_date: invoice_date,
    client_name: toTitleCase((document.getElementById('client_name')||{value:''}).value.trim()),
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
  if(pfp){
    if(d.client_name && d.client_name.trim()){
      pfp.textContent = initials(d.client_name);
      setPfpInitials(pfp, d.client_name);
    } else {
      pfp.textContent = '?';
      pfp.style.background = 'linear-gradient(135deg,#e6f2ea,#dff4e6)';
      pfp.style.color = 'var(--accent)';
      pfp.style.fontWeight = '700';
    }
  }
  if(clientEl) clientEl.textContent = d.client_name || 'Nom Prénom';
  const qtyPart = (d.quantity != null) ? (' • x' + d.quantity) : '';
  if(serviceEl) serviceEl.textContent = (d.service_type && d.service_type.trim()) ? (d.service_type + qtyPart) : ('[type de seance]' + (qtyPart || ' • x1'));
  const emailEl = document.getElementById('previewEmail');
  if(emailEl){ emailEl.textContent = d.client_email || ''; emailEl.className = d.client_email ? 'meta email' : 'meta'; }
  if(totalEl) totalEl.textContent = (d.total_amount ? d.total_amount.toFixed(2) : '0.00') + ' €';
  if(invoiceEl) invoiceEl.textContent = `N° ${d.invoice_number || computeNextInvoiceFromRows(getCurrentYear())} • ${d.invoice_date || todayIso()}`;
  if(paymentEl) paymentEl.textContent = d.payment_method || 'Mode paiement';
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
  const downloadBtn = document.getElementById('downloadBtn');
  if(downloadBtn){ downloadBtn.disabled = !canEnter; }
  const sendBtn = document.getElementById('sendBtn');
  if(sendBtn){ sendBtn.disabled = !(formOk && emailProvided && emailValid); }
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
  const meta = document.createElement('div'); meta.className='meta'; meta.innerHTML = escapeHtml(r.service_type || 'Type de séance') + (r.quantity ? (' • x' + escapeHtml(String(r.quantity))) : '');
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
    const cardDownloadBtn = document.createElement('button'); cardDownloadBtn.type='button'; cardDownloadBtn.className='secondary'; cardDownloadBtn.title='Télécharger cette facture'; cardDownloadBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
    cardDownloadBtn.addEventListener('click', function(e){ e.stopPropagation(); (async function(){ try{ const doc = await buildInvoiceDoc(r); const filename = `facture_${(r.invoice_number||'facture').replace(/[^0-9A-Za-z-_\.]/g,'_')}.pdf`; doc.save(filename); showToast('Téléchargement facture...'); }catch(ex){ console.error(ex); alert('Erreur génération PDF'); } })(); });
    const cardSendBtn = document.createElement('button'); cardSendBtn.type='button'; cardSendBtn.className='secondary'; cardSendBtn.title='Envoyer par e-mail'; cardSendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
    cardSendBtn.addEventListener('click', function(e){ e.stopPropagation(); (async function(){ try{
        let email = (r.client_email||'').toString().trim();
        if(!email){ email = prompt('Adresse e-mail du destinataire :'); if(!email) { showToast('Envoi annulé'); return; } }
        const doc = await buildInvoiceDoc(r);
        const pdfBase64 = doc.output('datauristring');
        const meta = {
          subject: `Votre facture N° ${r.invoice_number}`,
          message: `Bonjour ${r.client_name || ''},\n\nVeuillez trouver votre facture n° ${r.invoice_number} en pièce jointe.\n\nCordialement,`,
          footer: '<small style="color:#777;font-size:10px">Mail envoyé par Axonis — Léo Tosku</small>'
        };
        await sendPdfToAppsScript(email, pdfBase64, cardSendBtn, meta);
      }catch(ex){ console.error(ex); alert('Erreur envoi PDF'); } })(); });
    try{
      if(!(r.client_email && r.client_email.toString().trim())){
        cardSendBtn.disabled = true;
        cardSendBtn.title = "Aucune adresse e-mail";
        cardSendBtn.style.opacity = '0.6';
        cardSendBtn.style.cursor = 'not-allowed';
      }
    }catch(e){}
    const editBtn = document.createElement('button'); editBtn.type='button'; editBtn.className='secondary'; editBtn.title='Modifier'; editBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    editBtn.addEventListener('click', function(e){ e.stopPropagation(); if(r && r._id) startEdit(r._id); });
    const delBtn = document.createElement('button'); delBtn.type='button'; delBtn.className='secondary'; delBtn.title='Supprimer'; delBtn.style.borderColor = '#e76b6b'; delBtn.style.color = '#b30000'; delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    delBtn.addEventListener('click', function(e){ e.stopPropagation(); if(r && r._id) deleteRow(r._id); });
    actionsDiv.appendChild(cardDownloadBtn);
    actionsDiv.appendChild(cardSendBtn);
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);
    row2.appendChild(actionsDiv);
  }catch(e){}
  info.appendChild(row1); info.appendChild(row2); card.appendChild(pfp); card.appendChild(info); return card }

function ensureRowIds(){ try{ rows = (rows||[]).map(r => { if(r._id) return r; r._id = 'id_' + (hashString(JSON.stringify(r) + String(Math.random()))); return r; }); }catch(e){} }

function startEdit(id){ try{ const idx = rows.findIndex(r=>r && r._id === id); if(idx === -1) return; const r = rows[idx];
    document.getElementById('invoice_number').value = r.invoice_number || '';
    document.getElementById('invoice_date').value = r.invoice_date || todayIso();
    document.getElementById('client_name').value = r.client_name || '';
    document.getElementById('client_email').value = r.client_email || '';
    document.getElementById('service_quantity').value = r.quantity || '1';


    const pm = document.getElementById('payment_method'); const pmOther = document.getElementById('payment_method_other'); const pmOtherLabel = document.getElementById('payment_method_other_label'); if(pm){ let found=false; for(let i=0;i<pm.options.length;i++){ if(pm.options[i].value === r.payment_method){ pm.value = pm.options[i].value; found = true; break; } } if(!found){ pm.value = 'Autre'; if(pmOther) pmOther.style.display = ''; if(pmOtherLabel) pmOtherLabel.style.display = ''; pmOther.value = r.payment_method || ''; } else { if(pmOther) pmOther.style.display = 'none'; if(pmOtherLabel) pmOtherLabel.style.display = 'none'; pmOther.value = ''; } }
    document.getElementById('payment_note').value = r.payment_note || '';

    const st = document.getElementById('service_type'); if(st){ let matched=false; for(let i=0;i<st.options.length;i++){ const optLabel = (st.options[i].text || '').split('—')[0].trim(); if(optLabel === r.service_type){ st.value = st.options[i].value; document.getElementById('autre_seance_zone').style.display = 'none'; matched=true; break; } } if(!matched){ st.value = 'autre'; document.getElementById('autre_seance_zone').style.display = 'flex'; document.getElementById('autre_seance_desc').value = r.service_type || ''; document.getElementById('autre_seance_prix').value = (r.unit_price != null)? r.unit_price : ''; } }

    window._editingId = id;
    const addBtn = document.getElementById('addBtn'); if(addBtn) addBtn.innerHTML = '<i class="fa-solid fa-save" aria-hidden="true"></i>Mettre à jour';
    const cancelBtn = document.getElementById('cancelEditBtn'); if(cancelBtn) cancelBtn.style.display='';
    try{ document.querySelectorAll('.card.editing').forEach(el=>el.classList.remove('editing')); const cardEl = document.querySelector('[data-id="'+id+'"]'); if(cardEl) cardEl.classList.add('editing'); }catch(e){}
    try{ 
      const formContainer = document.getElementById('form-container');
      if (formContainer) formContainer.classList.add('editing-mode');
    }catch(e){}
    try{

      const tabBtnForm = document.getElementById('tab-btn-form');
      if (tabBtnForm && window.getComputedStyle(tabBtnForm.parentElement).display !== 'none') {
        tabBtnForm.click();
      }
    } catch(e){}
    try{ updateFormTitle(); }catch(e){}
    updatePreview(); updateControls();
    

    setTimeout(() => {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.getElementById('client_name').focus();
      } catch(e) {}
    }, 50);

  }catch(e){}
}

function updateFormTitle(){ try{ const t = document.getElementById('formTitle'); if(!t) return; if(window._editingId){ const r = (rows||[]).find(x=>x && x._id === window._editingId) || null; const inv = r ? (r.invoice_number || '—') : (document.getElementById('invoice_number')||{value:'—'}).value || '—'; t.textContent = `Mettre à jour la facture N° ${inv}`; } else { t.textContent = 'Nouvelle facture'; } }catch(e){} }

function cancelEdit(){ try{ window._editingId = null; const addBtn = document.getElementById('addBtn'); if(addBtn) addBtn.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>Entrer'; const cancelBtn = document.getElementById('cancelEditBtn'); if(cancelBtn) cancelBtn.style.display='none';
  try{ document.querySelectorAll('.card.editing').forEach(el=>el.classList.remove('editing')); }catch(e){}
  try{ 
    const formContainer = document.getElementById('form-container');
    if (formContainer) formContainer.classList.remove('editing-mode');
  }catch(e){}

  try{ document.getElementById('rowForm').reset(); }catch(e){}
  try{ const dateEl = document.getElementById('invoice_date'); if(dateEl) dateEl.value = todayIso(); }catch(e){}
  try{ const numEl = document.getElementById('invoice_number'); if(numEl) numEl.value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){}
  try{ document.getElementById('autre_seance_zone').style.display='none'; document.getElementById('payment_method_other').style.display='none'; }catch(e){}
  updateFormTitle(); updatePreview(); updateControls(); }catch(e){}
}
try{ updateFormTitle(); }catch(e){}


function deleteRow(id){ try{ if(!confirm('Confirmer : supprimer cette entrée ?')) return; const idx = rows.findIndex(r=>r && r._id === id); if(idx === -1) return; rows.splice(idx,1); saveRows(); updateListPreview(); try{ document.getElementById('invoice_number').value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){} showToast('Entrée supprimée'); if(window._editingId === id) cancelEdit(); }catch(e){} }
function saveRows(){ try{ localStorage.setItem(STORAGE_ROWS, JSON.stringify(rows)); }catch(e){} try{ sessionStorage.setItem(STORAGE_ROWS + '_cache', JSON.stringify(rows)); }catch(e){} }

function performImport(imported){
  if(!imported || imported.length === 0) return false;
  try{
  if((rows||[]).length > 0){
    const proceed = confirm('Attention : cela va remplacer le tableau actuel. Continuer ?');
    if(!proceed) return;
    rows = [];
    try{ localStorage.removeItem(STORAGE_ROWS); sessionStorage.removeItem(STORAGE_ROWS + '_cache'); }catch(e){}
  }
  imported.forEach(r=>{ if(r && r.client_name) r.client_name = toTitleCase(r.client_name); rows.push(r); }); try{ ensureRowIds(); }catch(e){}
    saveRows(); updateListPreview(); updatePreview();
    return true;
  }catch(e){ return false; }
}
function updateTotals() {
  const totals = document.getElementById('cardsTotals');
  if (!totals) return;

  const totalAmount = rows.reduce((sum, row) => sum + (row.total_amount || 0), 0);

  if (rows.length > 0) {
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
  const raw = (rows||[]).slice();
  const searchVal = ((document.getElementById('searchInput')||{value:''}).value || '').toString().trim().toLowerCase();
  let filtered = raw;
  if(searchVal){
    filtered = raw.filter(r => {
      try{
        return ((r.client_name||'').toString().toLowerCase().indexOf(searchVal) !== -1) || ((r.invoice_number||'').toString().toLowerCase().indexOf(searchVal) !== -1);
      }catch(e){return false}
    });
  }

  let list = filtered.sort(invoiceCompare);

  if (sort === 'desc') {
    list.reverse();
  }

  const frag = document.createDocumentFragment();
  list.forEach(r => {
    frag.appendChild(createCardElement(r));
  });
  container.appendChild(frag);

  updateTotals();
  updateClientsCount();
}
function updateClientsCount(){ const set = new Set((rows||[]).map(r=>r.client_name).filter(Boolean)); const clientsCountEl = document.getElementById('clientsCount'); if(clientsCountEl){ const size = set.size || 0; if(size === 0) clientsCountEl.textContent = '0 clients enregistrés'; else if(size === 1) clientsCountEl.textContent = '1 client enregistré'; else clientsCountEl.textContent = size + ' clients enregistrés'; } }
function addCurrentToList() {
  const d = getFormData();
  if (!d.invoice_number || !d.invoice_date || !d.client_name || !d.service_type) {
    alert('Remplissez : Numéro, Date, Nom et Type de séance');
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
async function downloadXLSXRows(rowsToExport){
  if(!rowsToExport || rowsToExport.length===0){ alert('Aucune ligne à exporter'); return; }

  const headers = ['NUMÉRO DE FACTURE','DATE','CLIENT','EMAIL','PRESTATION','PRIX UNITAIRE','QUANTITÉ','MODE DE PAIEMENT','NOTE DE PAIEMENT','MONTANT TOTAL'];
  const keys = ['invoice_number','invoice_date','client_name','client_email','service_type','unit_price','quantity','payment_method','payment_note','total_amount'];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Compta';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Compta');

  sheet.columns = headers.map((h, idx) => ({ header: h, key: keys[idx] }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; 
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  rowsToExport.forEach(r => {
    const rowObj = {};
    keys.forEach(k => {
      let v = r[k] ?? '';
      if(k === 'invoice_date' && v){
        const dt = new Date(v);
        if(!isNaN(dt)) v = dt;
      }
      if(k === 'unit_price' || k === 'total_amount'){
        let n = parseFloat(String(v).replace(/[€ ]/g,'').replace(',','.'));
        if(isNaN(n)) n = 0;
        v = n;
      }
      if(k === 'quantity'){
        v = Number(v) || 0;
      }
      rowObj[k] = v;
    });
    sheet.addRow(rowObj);
  });

  sheet.getColumn('unit_price').numFmt = '#,##0.00 €';
  sheet.getColumn('total_amount').numFmt = '#,##0.00 €';
  sheet.getColumn('quantity').numFmt = '0';
  sheet.getColumn('invoice_date').numFmt = 'dd/mm/yyyy';

  const minWidth = 8;
  const maxWidth = 50;
  const paddingChars = 2;

  const maxLens = headers.map(h => Math.min(Math.max(String(h).length + paddingChars, minWidth), maxWidth));

  rowsToExport.forEach(r => {
    keys.forEach((k, j) => {
      let v = r[k] ?? '';
      if(k === 'invoice_date' && v){ const dt = new Date(v); if(!isNaN(dt)) v = ('0'+dt.getDate()).slice(-2) + '/' + ('0'+(dt.getMonth()+1)).slice(-2) + '/' + dt.getFullYear(); }
      if(k === 'unit_price' || k === 'total_amount'){ let n = parseFloat(String(v).replace(/[€ ]/g,'').replace(',','.')); if(isNaN(n)) n = 0; v = n.toFixed(2) + ' €'; }
      const len = Math.min(Math.max(String(v).length + paddingChars, minWidth), maxWidth);
      if(len > maxLens[j]) maxLens[j] = len;
    });
  });

  maxLens.forEach((w, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = w;
  });

  sheet.eachRow({ includeEmpty:false }, function(row, rowNumber){
    if(rowNumber >= 1){
      row.eachCell({ includeEmpty:true }, function(cell){
        cell.border = { top: {style:'thin', color:{argb:'FFE6F3EC'} }, left:{style:'thin', color:{argb:'FFE6F3EC'} }, bottom:{style:'thin', color:{argb:'FFE6F3EC'} }, right:{style:'thin', color:{argb:'FFE6F3EC'} } };
      });
      if(rowNumber > 1){
        if(rowNumber % 2 === 0){
          row.eachCell({ includeEmpty:true }, function(cell){
            cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: 'FFF3FFF3' } }; 
          });
        } else {
          row.eachCell({ includeEmpty:true }, function(cell){
            cell.fill = null;
          });
        }
      }
    }
  });

  const filename = 'compta_rows_' + new Date().toISOString().replace(/[:.]/g,'-') + '.xlsx';
  const buf = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buf], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  saveAs(blob, filename);
}

let toastTimeout;
function showToast(text, duration = 2000){
  const t = document.querySelector('.toast');
  if(!t) return;
  t.textContent = text;

  if (toastTimeout) {
    clearTimeout(toastTimeout);
    t.classList.remove('hide');
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  } else {
    if (t.classList.contains('hide')) t.classList.remove('hide');
    t.classList.add('show');
  }

  toastTimeout = setTimeout(() => {
    if (t.classList.contains('hide')) { toastTimeout = null; return; }
    t.classList.add('hide');
    const onAnimEnd = (ev) => {
      if (ev && ev.animationName && ev.animationName.indexOf('fadeOut') === -1) return;
      try { t.classList.remove('show'); } catch(e) {}
      try { t.classList.remove('hide'); } catch(e) {}
      t.removeEventListener('animationend', onAnimEnd);
    };
    t.addEventListener('animationend', onAnimEnd);
    toastTimeout = null;
  }, duration);
}
document.getElementById('rowForm').addEventListener('input', function(){ updatePreview(); updateControls(); });
const sortSel = document.getElementById('sortOrder'); if(sortSel){ sortSel.addEventListener('change', function(){ localStorage.setItem(STORAGE_SORT, this.value); updateListPreview(); }); }
const searchInput = document.getElementById('searchInput'); if(searchInput){ searchInput.addEventListener('input', function(){ updateListPreview(); }); }
document.getElementById('service_type').addEventListener('change', function(){ const zone = document.getElementById('autre_seance_zone'); if(this.value === 'autre'){ zone.style.display = 'flex'; } else { zone.style.display = 'none'; document.getElementById('autre_seance_desc').value = ''; document.getElementById('autre_seance_prix').value = ''; } updatePreview(); updateControls(); });
document.getElementById('payment_method').addEventListener('change', function(){ var ta = document.getElementById('payment_method_other'); if(this.value === 'Autre'){ ta.style.display = ''; } else { ta.style.display = 'none'; ta.value = ''; } updatePreview(); updateControls(); });
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
    try{ const dateEl = document.getElementById('invoice_date'); if(dateEl) dateEl.value = todayIso(); }catch(e){}
    try{ const numEl = document.getElementById('invoice_number'); if(numEl) numEl.value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){}
    document.getElementById('client_name').focus();
    updatePreview(); updateControls();
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
      try{ const dateEl = document.getElementById('invoice_date'); if(dateEl) dateEl.value = todayIso(); }catch(e){}
      try{ const numEl = document.getElementById('invoice_number'); if(numEl) numEl.value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){}
      document.getElementById('client_name').focus();
      updatePreview(); updateControls();
    }
  }
});
const downloadBtn = document.getElementById('downloadBtn');
function formatDateShort(iso){ if(!iso) return ''; try{ const dt = new Date(iso); const dd = ('0'+dt.getDate()).slice(-2); const mm = ('0'+(dt.getMonth()+1)).slice(-2); const yyyy = dt.getFullYear(); return `${dd}/${mm}/${yyyy}`; }catch(e){ return iso; } }
async function loadImageDataURL(url, options = {}){
  const { compress = false, compressionQuality = 0.75 } = options;
  try{
    if(!url) return null;
    if(url.startsWith('#file:')) url = url.slice(6);
    let res = await fetch(url);
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
    const img = await new Promise((resolve)=>{ const im = new Image(); im.onload = ()=> resolve(im); im.onerror = ()=> resolve(null); im.src = dataUrl; });
    if(!img) return { dataUrl };
    if (compress) {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
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
  doc.setTextColor('#0D0C22');
  const logoImg = await loadImageDataURL('images/logo.png', { compress: true });
  const stampImg = await loadImageDataURL('/images/stamp.png', { compress: true });
  let headerBottom = y;
  let rightX = left;
  if(logoImg && logoImg.dataUrl){
    const lw = logoImg.width || 80; const lh = logoImg.height || 80;
    const maxW = 200; const maxH = 120;
    const ratio = Math.min(1, maxW / lw, maxH / lh);
    const drawW = (lw * ratio);
    const drawH = (lh * ratio);
    const imgType = logoImg.isJpeg ? 'JPEG' : (logoImg.dataUrl.indexOf('image/png') >= 0 ? 'PNG' : 'JPEG');
    doc.addImage(logoImg.dataUrl, imgType, left, y, drawW, drawH);
    rightX = left + drawW + 18;
    headerBottom = y + drawH;
  } else {
    rightX = left;
    headerBottom = y;
  }
  const titleTop = y + 2;
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor('#0D0C22');
  doc.text('Viviane de Vries', rightX, titleTop);
  doc.setFontSize(11); doc.setTextColor('#5A55D9'); doc.setFont('helvetica','normal');
  doc.text('Ostéopathe Exclusif', rightX, titleTop + 18);
  doc.setFontSize(10); doc.setTextColor('#6E6D7A');
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
  y = headerBottom + 18;
  doc.setTextColor('#0D0C22');

  const ref = 'G.' + (d.invoice_number || '—');
  doc.setFontSize(12); doc.setFont('helvetica','normal');

  const tableStartY = Math.max(y + 100, 360);
  doc.setFontSize(14); doc.setFont('helvetica','bold');
  const titleY = tableStartY - 36;
  doc.text("Note d’honoraire", pageWidth / 2, titleY, { align: 'center' });
  doc.setFontSize(11); doc.setFont('helvetica','normal');
  const refY = titleY + 14; 
  doc.setTextColor('#5A55D9');
  doc.text(ref, pageWidth / 2, refY, { align: 'center' });
  doc.setTextColor('#0D0C22');
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
    tableLineColor: [90,85,217],
    tableLineWidth: 0.6,
    didParseCell: function(data){
      if(data.row.index % 2 === 1){ data.cell.styles.fillColor = [247,247,253]; }
    }
  });

  const afterY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY : (tableStartY + (body.length * 18) + 20);

  if (stampImg && stampImg.dataUrl) {
    try {
      const sw = stampImg.width || 120; const sh = stampImg.height || 120;
      const maxW = 120; const maxH = 120;
      const ratio = Math.min(1, maxW / sw, maxH / sh);
      const drawW = sw * ratio; const drawH = sh * ratio;
      const imgType = stampImg.isJpeg ? 'JPEG' : (stampImg.dataUrl.indexOf('image/png') >= 0 ? 'PNG' : 'JPEG');
      doc.addImage(stampImg.dataUrl, imgType, pageWidth - left - drawW, afterY + 20, drawW, drawH);
    } catch(e) {}
  }

  try {
    doc.setFontSize(10);
    doc.setTextColor('#6E6D7A');
    doc.text('Merci de votre confiance.', left, afterY + 40);
  } catch(e){}

  return doc;
}

async function generateInvoicePDF(d){
  const doc = await buildInvoiceDoc(d);
  const filename = `facture_${(d.invoice_number||'facture').replace(/[^0-9A-Za-z-_\.]/g,'_')}.pdf`;
  doc.save(filename);
  return filename;
}

const SEND_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwKaQ3er-DSLx5r9pBePb3s40p-gDlI1dbebpDrg3NMx1CN7Bsuvr57gwQLrLqiBNiZ/exec';

async function sendPdfToAppsScript(email, pdfDataUri, btn, meta = {}){
  if(!email) throw new Error('Email manquant');
  const el = btn || document.getElementById('sendBtn');
  if(el && el.dataset && el.dataset.sending === '1'){ showToast('Envoi déjà en cours...'); return; }
  let originalHtml = null; let success = false;
  try{
    if(el){
      el.dataset.sending = '1';
      originalHtml = el.innerHTML;
      el.disabled = true;
      el.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoi...';
    }

    const payload = Object.assign({ email: email, pdf: pdfDataUri }, meta);
    await fetch(SEND_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      body: JSON.stringify(payload)
    });

    showToast('E-mail envoyé avec succès !');
    success = true;
  }catch(e){
    console.error('Erreur envoi PDF', e);
    showToast('Erreur : impossible d\'envoyer le message');
    success = false;
  }finally{
    if(el){
      el.disabled = false;
      try{ el.dataset.sending = '0'; }catch(e){}
      if(originalHtml !== null) el.innerHTML = originalHtml;
    }
    return success;
  }
}

async function genererEtEnvoyerPDFFromForm(){
  const d = getFormData();
  if(!d || !d.invoice_number){ alert('Numéro de facture requis pour envoyer'); return; }
  const email = (d.client_email||'').toString().trim();
  if(!email){ alert('Veuillez entrer l\'email du destinataire'); return; }
  try{
    const doc = await buildInvoiceDoc(d);
    const pdfBase64 = doc.output('datauristring');
    const btn = document.getElementById('sendBtn');
    const meta = {
      subject: `Votre facture N° ${d.invoice_number}`,
      message: `Bonjour ${d.client_name || ''},\n\nVeuillez trouver votre facture n° ${d.invoice_number} en pièce jointe.\n\nCordialement,`,
      footer: '<small style="color:#777;font-size:10px">Mail envoyé par Axonis — Léo Tosku</small>'
    };
    const ok = await sendPdfToAppsScript(email, pdfBase64, btn, meta);
    if(ok){
      try{
        if(!window._editingId){
          addCurrentToList();
          try{ document.getElementById('rowForm').reset(); }catch(e){}
          try{ const dateEl = document.getElementById('invoice_date'); if(dateEl) dateEl.value = todayIso(); }catch(e){}
          try{ const numEl = document.getElementById('invoice_number'); if(numEl) numEl.value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){}
          try{ document.getElementById('client_name').focus(); }catch(e){}
          updatePreview(); updateControls();
          showToast('Envoyé et enregistré ✅');
        } else {
          addCurrentToList();
          cancelEdit();
          showToast('Envoyé et mise à jour enregistrée ✅');
        }
      }catch(e){ console.error('Erreur ajout/après envoi', e); }
    }
  }catch(e){ console.error(e); alert('Erreur lors de la génération/envoi'); }
}
async function genererEtEnvoyerPDF(){ return genererEtEnvoyerPDFFromForm(); }

async function handleMainSend(){
  const data = getFormData();
  if(!data.client_email || !validateEmailValue(data.client_email)){
    alert("Veuillez entrer une adresse email valide.");
    return;
  }
  try{
    const doc = await buildInvoiceDoc(data);
    const pdfBase64 = doc.output('datauristring');
    const sendBtn = document.getElementById('sendBtn');
    const meta = {
      subject: `Votre facture N° ${data.invoice_number}`,
      message: `Bonjour ${data.client_name || ''},\n\nVeuillez trouver votre facture n° ${data.invoice_number} en pièce jointe.\n\nCordialement,`,
      footer: '<small style="color:#777;font-size:10px">Mail envoyé par Axonis — Léo Tosku</small>'
    };
    const ok = await sendPdfToAppsScript(data.client_email, pdfBase64, sendBtn, meta);
    if(ok){
      try{
        if(!window._editingId){
          addCurrentToList();
          try{ document.getElementById('rowForm').reset(); }catch(e){}
          try{ const dateEl = document.getElementById('invoice_date'); if(dateEl) dateEl.value = todayIso(); }catch(e){}
          try{ const numEl = document.getElementById('invoice_number'); if(numEl) numEl.value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){}
          try{ document.getElementById('client_name').focus(); }catch(e){}
          updatePreview(); updateControls();
          showToast('Envoyé et enregistré ✅');
        } else {
          addCurrentToList();
          cancelEdit();
          showToast('Envoyé et mise à jour enregistrée ✅');
        }
      }catch(e){ console.error('Erreur ajout après envoi', e); }
    }
  }catch(e){ console.error(e); alert('Erreur lors de la génération ou de l\'envoi.'); }
}
window.handleMainSend = handleMainSend;

if(downloadBtn){
  downloadBtn.addEventListener('click', function(){
    const d = getFormData();
    if(!d || !d.invoice_number){ alert('Numéro de facture requis pour télécharger'); return; }
    generateInvoicePDF(d);
    showToast('Facture PDF générée');
  });
} 

const sendBtnEl = document.getElementById('sendBtn');
if(sendBtnEl){ sendBtnEl.addEventListener('click', handleMainSend); }

const importBtn = document.getElementById('importCsvBtn');
const importInput = document.getElementById('importCsvInput');
const exportBtn = document.getElementById('exportCsvBtn');

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
    const filename = (f.name || '').toLowerCase();

    const handleImportedArray = function(imported){
      if(imported.length === 0){ showToast('Aucun enregistrement trouvé'); return; }
      if (performImport(imported)) {
        showToast(`Importation réussie: ${imported.length} lignes chargées.`);
      }
    };

    const headerMapping = {
        'NUMÉRO DE FACTURE': 'invoice_number',
        'DATE': 'invoice_date',
        'CLIENT': 'client_name',
        'EMAIL': 'client_email',
        'PRESTATION': 'service_type',
        'PRIX UNITAIRE': 'unit_price',
        'QUANTITÉ': 'quantity',
        'MODE DE PAIEMENT': 'payment_method',
        'NOTE DE PAIEMENT': 'payment_note',
        'MONTANT TOTAL': 'total_amount'
    };

    const priceStringToFloat = (s) => {
        if (typeof s !== 'string') s = String(s || '0');
        return parseFloat(s.replace(/[^0-9,-]+/g, '').replace(',', '.'));
    };

    if(filename.endsWith('.xlsx') || filename.endsWith('.xls')){
      const reader = new FileReader();
      reader.onload = async function(){
        try{
          const arrayBuffer = reader.result;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(arrayBuffer);
          const ws = workbook.worksheets[0];
          if(!ws){ showToast('Aucune feuille trouvée'); return; }

          const headers = (ws.getRow(1).values || []).slice(1).map(h => String(h||'').trim().toUpperCase());
          const imported = [];

          for(let i = 2; i <= ws.rowCount; i++){
            const row = ws.getRow(i);
            if(!row || row.actualCellCount === 0) continue;
            const rawObj = {};
            headers.forEach((h, idx)=>{
              const cell = row.getCell(idx+1);
              let v = cell.value;
              if(v && typeof v === 'object'){
                if(v.text) v = v.text;
                else if(v.richText) v = v.richText.map(t=>t.text).join('');
                else if(v.result) v = v.result;
              }
              rawObj[h] = v !== undefined && v !== null ? String(v).trim() : '';
            });

            const obj = {};
            for (const frenchHeader in headerMapping) {
                const jsKey = headerMapping[frenchHeader];
                obj[jsKey] = rawObj[frenchHeader] || '';
            }

            if (obj.invoice_date) {
                const parsed = Date.parse(obj.invoice_date);
                if(!isNaN(parsed)){
                  const dt = new Date(parsed);
                  obj.invoice_date = `${dt.getFullYear()}-${('0'+(dt.getMonth()+1)).slice(-2)}-${('0'+dt.getDate()).slice(-2)}`;
                } else {
                  const parts = String(obj.invoice_date).split('/');
                  if(parts.length === 3){ const [dd, mm, yyyy] = parts; if(dd && mm && yyyy) obj.invoice_date = `${yyyy}-${mm}-${dd}`; }
                }
            }

            obj.unit_price = priceStringToFloat(obj.unit_price);
            if (isNaN(obj.unit_price)) obj.unit_price = 0;

            obj.total_amount = priceStringToFloat(obj.total_amount);
            if (isNaN(obj.total_amount)) obj.total_amount = 0;

            obj.quantity = parseInt(obj.quantity || '1', 10) || 1;

            if (obj.total_amount === 0 && obj.unit_price > 0) {
                obj.total_amount = obj.unit_price * obj.quantity;
            } else if (obj.unit_price === 0 && obj.total_amount > 0) {
                obj.unit_price = obj.total_amount / obj.quantity;
            }

            imported.push(obj);
          }

          handleImportedArray(imported);
        }catch(ex){ showToast('Erreur import XLSX'); console.error(ex); }
      };
      reader.readAsArrayBuffer(f);
      importInput.value='';
      return;
    }

    const reader = new FileReader();
    reader.onload = function(){
      try{
        const text = reader.result || '';
        const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
        if(lines.length < 1){ showToast('Fichier vide'); return; }

        const headerLine = lines[0];
        const separator = headerLine.includes(';') ? ';' : ',';
        const headers = headerLine.split(separator).map(h=>h.trim().toUpperCase());

        const imported = [];
        for(let i = 1; i < lines.length; i++){
          const cols = lines[i].split(separator).map(c=>c.trim());
          if(cols.length < headers.length) continue;

          const rawObj = {};
          headers.forEach((h,idx)=>{ rawObj[h]=cols[idx]||''; });

          const obj = {};
          for (const frenchHeader in headerMapping) {
              const jsKey = headerMapping[frenchHeader];
              obj[jsKey] = rawObj[frenchHeader] || '';
          }

          if (obj.invoice_date) {
              const parts = obj.invoice_date.split('/');
              if (parts.length === 3) {
                  const [dd, mm, yyyy] = parts;
                  if (dd && mm && yyyy && dd.length === 2 && mm.length === 2 && yyyy.length === 4) {
                      obj.invoice_date = `${yyyy}-${mm}-${dd}`;
                  }
              }
          }

          obj.unit_price = priceStringToFloat(obj.unit_price);
          if (isNaN(obj.unit_price)) obj.unit_price = 0;

          obj.total_amount = priceStringToFloat(obj.total_amount);
          if (isNaN(obj.total_amount)) obj.total_amount = 0;

          obj.quantity = parseInt(obj.quantity || '1', 10) || 1;

          if (obj.total_amount === 0 && obj.unit_price > 0) {
              obj.total_amount = obj.unit_price * obj.quantity;
          } else if (obj.unit_price === 0 && obj.total_amount > 0) {
              obj.unit_price = obj.total_amount / obj.quantity;
          }

          imported.push(obj);
        }

        handleImportedArray(imported);
      }catch(ex){ showToast('Erreur import CSV'); console.error(ex); }
    };
    reader.readAsText(f,'utf-8'); importInput.value='';
  });
}
if(exportBtn){ exportBtn.addEventListener('click', function(){ if((rows||[]).length===0){ alert('Aucune ligne à exporter'); return } downloadXLSXRows(rows); }); }
if(wipeBtn){ wipeBtn.addEventListener('click', function(){ if(!confirm('Confirmer : vider la table en mémoire ?')) return; rows = []; try{ localStorage.removeItem(STORAGE_ROWS); sessionStorage.removeItem(STORAGE_ROWS + '_cache'); }catch(e){} updateListPreview(); try{ document.getElementById('invoice_number').value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){} showToast('Table vidée ✅'); }); }

(function init(){
  document.getElementById('autre_seance_zone').style.display = 'none';
  const dateEl = document.getElementById('invoice_date'); if(!dateEl.value) dateEl.value = todayIso();
  const numEl = document.getElementById('invoice_number'); if(!numEl.value) numEl.value = computeNextInvoiceFromRows(getCurrentYear());
  try{
    const pm = document.getElementById('payment_method'); if(pm) pm.disabled = false;
    const pmOther = document.getElementById('payment_method_other'); if(pmOther) pmOther.style.display = 'none';
  }catch(e){}
  try{ if((rows||[]).length === 0){ const cache = sessionStorage.getItem(STORAGE_ROWS + '_cache'); if(cache){ rows = JSON.parse(cache || '[]'); } } }catch(e){}
    try{ ensureRowIds(); }catch(e){}
  try{ if(!localStorage.getItem(STORAGE_SORT)) localStorage.setItem(STORAGE_SORT,'desc'); }catch(e){}
  try{ document.getElementById('invoice_number').value = computeNextInvoiceFromRows(getCurrentYear()); }catch(e){}
  updateListPreview(); updatePreview(); updateControls(); document.getElementById('client_name').focus();
  try{ window.addEventListener('beforeunload', saveRows); }catch(e){}
  const cancelBtn = document.getElementById('cancelEditBtn'); if(cancelBtn){ cancelBtn.addEventListener('click', function(){ cancelEdit(); }); }

  const tabBtnPreview = document.getElementById('tab-btn-preview');
  const tabBtnForm = document.getElementById('tab-btn-form');
  const previewContainer = document.getElementById('preview-container');
  const formContainer = document.getElementById('form-container');

  if (tabBtnPreview && tabBtnForm && previewContainer && formContainer) {
    tabBtnPreview.addEventListener('click', () => {
      tabBtnPreview.classList.add('active');
      tabBtnPreview.setAttribute('aria-selected', 'true');
      tabBtnForm.classList.remove('active');
      tabBtnForm.setAttribute('aria-selected', 'false');
      previewContainer.style.display = 'block';
      formContainer.style.display = 'none';
    });

    tabBtnForm.addEventListener('click', () => {
      tabBtnForm.classList.add('active');
      tabBtnForm.setAttribute('aria-selected', 'true');
      tabBtnPreview.classList.remove('active');
      tabBtnPreview.setAttribute('aria-selected', 'false');
      formContainer.style.display = 'block';
      previewContainer.style.display = 'none';
    });
  }
})();