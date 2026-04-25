// ─── Config ───────────────────────────────────────────────────────────────────
const STORAGE_ROWS   = 'compta_rows';
const STORAGE_SORT   = 'compta_sort';
// NOTE: This URL is publicly visible in client JS. Consider a proxy or token if abuse is a concern.
const SEND_SCRIPT_URL  = 'https://script.google.com/macros/s/AKfycbwKaQ3er-DSLx5r9pBePb3s40p-gDlI1dbebpDrg3NMx1CN7Bsuvr57gwQLrLqiBNiZ/exec';
const EMAIL_COOLDOWN_MS = 5000;

const PAYMENT_LOGOS = {
  'Espèces':          'images/payments/especes.png',
  'Chèque':           'images/payments/cheque.png',
  'Virement bancaire':'images/payments/virement.png',
  'Carte bancaire':   'images/payments/carte.png',
  'Wero':             'images/payments/wero.png',
  'SumUp':            'images/payments/sumup.png'
};

// ─── State ────────────────────────────────────────────────────────────────────
let company      = {};
let configuredServices = [];
let rows         = [];
let editingId    = null;
let lineSeq      = 0;
let lastSentAt   = 0;
const imgCache   = new Map();

// Safe localStorage load
try {
  const stored = localStorage.getItem(STORAGE_ROWS);
  rows = stored ? JSON.parse(stored) : [];
  rows = rows.map(r => r ? { ...r, client_name: toTitleCase(r.client_name) } : null).filter(Boolean);
} catch(e) {
  console.error('localStorage load failed:', e);
  rows = [];
}

// ─── Pure utils ───────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
}

function pad(n) { return ('0' + n).slice(-2); }

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function getCurrentYear() { return String(new Date().getFullYear()); }

// FIX: parse date parts directly to avoid UTC-vs-local timezone offset bug
function parseIsoDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).split('-').map(Number);
  return (y && m && d) ? new Date(y, m-1, d) : null;
}

function formatDateShort(iso) {
  const dt = parseIsoDate(iso);
  return dt ? `${pad(dt.getDate())}/${pad(dt.getMonth()+1)}/${dt.getFullYear()}` : (iso || '');
}

function formatPrice(n) {
  return Number(n || 0).toFixed(2).replace('.', ',') + ' €';
}

function toTitleCase(s) {
  if (!s) return '';
  return String(s).trim().split(/\s+/)
    .map(p => p.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join('-'))
    .join(' ');
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return h >>> 0;
}

function nameToPastel(name) {
  const h   = hashString(name || String(Math.random()));
  const hue = h % 360, sat = 20 + (h % 16), light = 72 + (h % 16);
  return { bg: `hsl(${hue},${sat}%,${light}%)`, light };
}

function initials(name) {
  const p = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return p.length === 1 ? p[0].slice(0,2).toUpperCase() : (p[0][0] + p[1][0]).toUpperCase();
}

function setPfpInitials(el, name) {
  if (!el) return;
  const info = nameToPastel(name || '');
  el.style.backgroundImage = '';
  el.style.background  = info.bg;
  el.textContent       = initials(name || '');
  el.style.color       = info.light > 70 ? '#072010' : '#ffffff';
  el.style.fontWeight  = '700';
}

function uid() {
  return 'id_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Company ──────────────────────────────────────────────────────────────────
async function loadCompany() {
  try {
    const r = await fetch('../../company.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    company = (data && typeof data === 'object') ? data : {};
    const rawServices = Array.isArray(company.services) ? company.services : [];
    configuredServices = rawServices
      .map(s => {
        if (typeof s === 'string') {
          return { label: s.trim(), price: 0 };
        }
        return {
          label: String(s?.label || '').trim(),
          price: Number(s?.price) || 0
        };
      })
      .filter(s => s.label);
  } catch(e) {
    console.error('Failed to load ../../company.json:', e);
    company = {};
    configuredServices = [];
  }
  return company;
}
window.loadCompany = loadCompany; // expose for debugging

// ─── Persistence ─────────────────────────────────────────────────────────────
function saveRows() {
  try { localStorage.setItem(STORAGE_ROWS, JSON.stringify(rows)); }
  catch(e) { console.error('saveRows failed:', e); }
}

function ensureRowIds() {
  rows = rows.map(r => r._id ? r : { ...r, _id: uid() });
}

// ─── Invoice numbering ───────────────────────────────────────────────────────
function computeNextInvoice(year) {
  let max = 0;
  rows.forEach(r => {
    const m = String(r.invoice_number || '').match(new RegExp(`^${year}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${year}-${max + 1}`;
}

function parseInvoiceKey(inv) {
  const s  = String(inv || '').trim();
  const m  = s.match(/^(\d{4})-(\d+)$/);
  if (m)  return { year: +m[1], num: +m[2], raw: s };
  const m2 = s.match(/^(\d{4})/);
  if (m2) return { year: +m2[1], num: NaN, raw: s };
  return { year: NaN, num: NaN, raw: s };
}

function invoiceCompare(a, b) {
  const ai = parseInvoiceKey(a?.invoice_number);
  const bi = parseInvoiceKey(b?.invoice_number);
  const av = isFinite(ai.year) && isFinite(ai.num);
  const bv = isFinite(bi.year) && isFinite(bi.num);
  if (av && bv) return ai.year !== bi.year ? ai.year - bi.year : ai.num - bi.num;
  if (av) return -1; if (bv) return 1;
  return ai.raw.localeCompare(bi.raw);
}

// ─── Service options ─────────────────────────────────────────────────────────
function getServiceOptions() {
  const map = new Map(configuredServices.map(o => [o.label, o.price]));
  rows.forEach(r => {
    const svcs = r.services?.length ? r.services : [{ service_type: r.service_type, unit_price: r.unit_price }];
    svcs.forEach(svc => {
      const label = svc?.service_type?.trim();
      if (label && !map.has(label)) map.set(label, parseFloat(svc.unit_price) || 0);
    });
  });
  return Array.from(map.entries()).map(([label, price]) => ({ label, price }));
}

// ─── Service lines ────────────────────────────────────────────────────────────
function updateTrashVisibility() {
  const lines = document.querySelectorAll('.service-line');
  const show  = lines.length > 1;
  lines.forEach(line => {
    const btn = line.querySelector('.remove-service-line-btn');
    if (btn) btn.style.display = show ? 'inline-flex' : 'none';
  });
}

function addServiceLine(data = {}) {
  const container = document.getElementById('servicesContainer');
  if (!container) return null;
  const id   = ++lineSeq;
  const opts = getServiceOptions();
  const optsHtml = opts.map(o =>
    `<option value="${o.price}">${escapeHtml(o.label)} — ${o.price}€</option>`
  ).join('');

  const div = document.createElement('div');
  div.className  = 'service-line';
  div.dataset.id = id;
  div.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;padding:8px;background:#f8fafa;border:1px solid #e2e8f0;border-radius:8px;position:relative';
  div.innerHTML = `
    <div style="display:flex;gap:12px;align-items:end;flex-wrap:wrap;">
      <div style="flex:1;min-width:210px;display:flex;flex-direction:column;gap:6px;">
        <label for="svc_type_${id}">Prestation</label>
        <select id="svc_type_${id}" required>
          <option value="" disabled selected>Sélectionner une prestation…</option>
          ${optsHtml}
          <option value="autre">Autre…</option>
        </select>
        <div id="svc_autre_${id}" style="display:none;margin-top:8px;gap:8px;align-items:end;">
          <input type="text" id="svc_desc_${id}" placeholder="Description" style="flex:2"/>
          <input type="number" id="svc_prix_${id}" placeholder="Prix (€)" min="0" step="0.01" style="flex:1"/>
        </div>
      </div>
      <div style="width:100px;display:flex;flex-direction:column;gap:6px;">
        <label for="svc_qty_${id}">Qté</label>
        <input type="number" id="svc_qty_${id}" min="1" step="1" value="1" required
          style="padding:10px;border:1px solid #e6efe6;border-radius:6px;width:100%;box-sizing:border-box"/>
      </div>
      <button type="button" class="secondary remove-service-line-btn" title="Retirer"
        style="margin-bottom:0;padding:0;border-radius:6px;width:44px;min-width:44px;height:44px;display:inline-flex;justify-content:center;align-items:center;border-color:#e76b6b;color:#b30000;">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`;

  container.appendChild(div);

  const sel      = div.querySelector(`#svc_type_${id}`);
  const autreZone= div.querySelector(`#svc_autre_${id}`);
  const descEl   = div.querySelector(`#svc_desc_${id}`);
  const prixEl   = div.querySelector(`#svc_prix_${id}`);
  const qtyEl    = div.querySelector(`#svc_qty_${id}`);
  const rmBtn    = div.querySelector('.remove-service-line-btn');

  if (data.service_type) {
    const match = opts.find(o => o.label === data.service_type);
    if (match) {
      sel.value = String(match.price);
    } else {
      sel.value           = 'autre';
      autreZone.style.display = 'flex';
      descEl.value        = data.service_type;
      prixEl.value        = data.unit_price ?? '';
    }
  }
  if (data.quantity != null) qtyEl.value = data.quantity;

  sel.addEventListener('change', () => {
    const isAutre = sel.value === 'autre';
    autreZone.style.display = isAutre ? 'flex' : 'none';
    if (!isAutre) { descEl.value = ''; prixEl.value = ''; }
    else descEl.focus();
    updatePreview();
  });
  [descEl, prixEl, qtyEl].forEach(el => el.addEventListener('input', updatePreview));
  rmBtn.addEventListener('click', e => {
    e.stopPropagation();
    div.remove();
    updateTrashVisibility();
    updatePreview();
  });

  updateTrashVisibility();
  return div;
}

function rebuildServiceLines(services) {
  const container = document.getElementById('servicesContainer');
  if (!container) return;
  container.innerHTML = '';
  lineSeq = 0;
  if (services?.length) services.forEach(s => addServiceLine(s));
  else addServiceLine({ quantity: 1 });
}

// ─── Form data ────────────────────────────────────────────────────────────────
function getFormData() {
  let total    = 0;
  const services = [];

  document.querySelectorAll('.service-line').forEach(line => {
    const id  = line.dataset.id;
    const sel = document.getElementById(`svc_type_${id}`);
    if (!sel) return;

    let label = '', price = 0;
    if (sel.value === 'autre') {
      label = document.getElementById(`svc_desc_${id}`)?.value?.trim() || 'Autre séance';
      price = parseFloat(document.getElementById(`svc_prix_${id}`)?.value || '0') || 0;
    } else {
      price = parseFloat(sel.value || '0') || 0;
      label = sel.options[sel.selectedIndex]?.text?.split('—')[0].trim() || '';
    }

    const qty       = parseInt(document.getElementById(`svc_qty_${id}`)?.value || '1', 10) || 1;
    const lineTotal = parseFloat((price * qty).toFixed(2));
    total += lineTotal;
    services.push({ service_type: label, unit_price: parseFloat(price.toFixed(2)), quantity: qty, total_amount: lineTotal });
  });

  const pmVal = document.getElementById('payment_method')?.value?.trim() || '';
  const paymentMethod = pmVal === 'Autre'
    ? document.getElementById('payment_method_other')?.value?.trim() || ''
    : pmVal;

  return {
    invoice_number: document.getElementById('invoice_number')?.value?.trim() || '',
    invoice_date:   document.getElementById('invoice_date')?.value || todayIso(),
    client_name:    toTitleCase(document.getElementById('client_name')?.value?.trim() || ''),
    client_email:   document.getElementById('client_email')?.value?.trim() || '',
    services,
    service_type:   services[0]?.service_type || '',
    unit_price:     services[0]?.unit_price   || 0,
    quantity:       services[0]?.quantity     || 1,
    payment_method: paymentMethod,
    payment_note:   document.getElementById('payment_note')?.value?.trim() || '',
    total_amount:   parseFloat(total.toFixed(2))
  };
}

// ─── Validation ───────────────────────────────────────────────────────────────
function isEmailValid(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

function isFormValid() {
  const d = getFormData();
  if (!d.invoice_number || !d.invoice_date || !d.client_name) return false;

  const lines = document.querySelectorAll('.service-line');
  if (!lines.length) return false;
  for (const line of lines) {
    const id  = line.dataset.id;
    const sel = document.getElementById(`svc_type_${id}`);
    if (!sel?.value) return false;
    if (sel.value === 'autre') {
      const desc = document.getElementById(`svc_desc_${id}`)?.value?.trim();
      const prix = parseFloat(document.getElementById(`svc_prix_${id}`)?.value || '0');
      if (!desc || !prix || prix <= 0) return false;
    }
    const qty = parseInt(document.getElementById(`svc_qty_${id}`)?.value || '0', 10);
    if (!Number.isFinite(qty) || qty <= 0) return false;
  }

  if (!d.payment_method) return false;
  return true;
}

// ─── UI updates ───────────────────────────────────────────────────────────────
function updatePaymentLogo() {
  const sel  = document.getElementById('payment_method');
  const logo = document.getElementById('payment_method_logo');
  if (!sel || !logo) return;
  const src = PAYMENT_LOGOS[sel.value];
  if (src) { logo.src = src; logo.hidden = false; }
  else logo.hidden = true;
}

function updatePreview() {
  updatePaymentLogo();
  const d = getFormData();

  const pfp = document.getElementById('previewPfp');
  if (pfp) {
    if (d.client_name) setPfpInitials(pfp, d.client_name);
    else { pfp.textContent = '?'; pfp.style.background = 'linear-gradient(135deg,#e6f2ea,#dff4e6)'; pfp.style.color = 'var(--accent)'; pfp.style.fontWeight = '700'; }
  }

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('previewClient',  d.client_name || 'Nom Prénom');
  setText('previewTotal',   (d.total_amount || 0).toFixed(2) + ' €');
  setText('previewInvoice', `N° ${d.invoice_number || computeNextInvoice(getCurrentYear())} • ${formatDateShort(d.invoice_date)}`);
  setText('previewPayment', d.payment_method || 'Mode paiement');
  setText('priceBig',       (d.total_amount || 0).toFixed(2) + ' €');

  const serviceEl = document.getElementById('previewService');
  if (serviceEl) {
    const lines = (d.services.length ? d.services : [{ service_type: '[type de seance]', quantity: 1 }])
      .map(s => escapeHtml((s.service_type || '[type de seance]').trim()) + (s.quantity > 1 ? ` • x${s.quantity}` : ''));
    serviceEl.innerHTML = lines.join('<br>');
  }

  const emailEl = document.getElementById('previewEmail');
  if (emailEl) { emailEl.textContent = d.client_email || ''; emailEl.className = d.client_email ? 'meta email' : 'meta'; }

  updateControls();
}

function updateControls() {
  const emailVal      = document.getElementById('client_email')?.value?.trim() || '';
  const emailProvided = !!emailVal;
  const emailOk       = !emailProvided || isEmailValid(emailVal);

  document.getElementById('client_email')?.classList.toggle('invalid', emailProvided && !emailOk);
  const errEl = document.getElementById('client_email_error');
  if (errEl) errEl.style.display = (emailProvided && !emailOk) ? '' : 'none';

  const formOk = isFormValid() && emailOk;
  const addBtn = document.getElementById('addBtn');
  if (addBtn) addBtn.disabled = !formOk;
  const dlBtn = document.getElementById('downloadBtn');
  if (dlBtn) dlBtn.disabled = !formOk;
  const sndBtn = document.getElementById('sendBtn');
  if (sndBtn) sndBtn.disabled = !(isFormValid() && emailProvided && isEmailValid(emailVal));
}

function updateFormTitle() {
  const t = document.getElementById('formTitle');
  if (!t) return;
  if (editingId) {
    const r   = rows.find(x => x._id === editingId);
    const inv = r?.invoice_number || document.getElementById('invoice_number')?.value || '—';
    t.textContent = `Mettre à jour la facture N° ${inv}`;
  } else {
    t.textContent = 'Nouvelle facture';
  }
}

function showToast(text, duration = 2000) {
  const t = document.querySelector('.toast');
  if (!t) return;
  t.textContent = text;
  clearTimeout(t._timer);
  t.classList.remove('hide');
  t.classList.add('show');
  t._timer = setTimeout(() => {
    t.classList.add('hide');
    t.addEventListener('animationend', () => t.classList.remove('show', 'hide'), { once: true });
  }, duration);
}

// ─── List rendering ───────────────────────────────────────────────────────────
function makeBtn(icon, title, onClick, style = '') {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'secondary'; btn.title = title;
  btn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  if (style) btn.style.cssText = style;
  btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return btn;
}

function createCard(r) {
  const services = r.services?.length ? r.services : [{ service_type: r.service_type, quantity: r.quantity }];
  const svcText  = services.length > 1
    ? escapeHtml(services[0]?.service_type || 'Prestation') + ` +${services.length - 1} autres`
    : escapeHtml(services[0]?.service_type || 'Type de séance') + (services[0]?.quantity > 1 ? ` • x${services[0].quantity}` : '');
  const payText = (r.payment_method || '') + (r.payment_note ? ' • ' + r.payment_note : '');

  const card = document.createElement('div');
  card.className = 'card';
  Object.assign(card.dataset, { invoice: r.invoice_number || '', client: r.client_name || '', date: r.invoice_date || '', id: r._id || '' });

  const pfp = document.createElement('div');
  pfp.className = 'pfp';
  setPfpInitials(pfp, r.client_name);

  const info = document.createElement('div');
  info.className = 'info';
  info.innerHTML = `
    <div class="row">
      <div>
        <strong>${escapeHtml(r.client_name || '—')}</strong>
        <div class="meta">${svcText}</div>
        ${r.client_email ? `<div class="meta email">${escapeHtml(r.client_email)}</div>` : ''}
      </div>
      <div class="amount">${escapeHtml((parseFloat(r.total_amount) || 0).toFixed(2) + ' €')}</div>
    </div>
    <div class="row" id="card_row2_${r._id}">
      <div class="meta">N° ${escapeHtml(r.invoice_number || '—')} • ${escapeHtml(formatDateShort(r.invoice_date))}</div>
      <div class="meta">${escapeHtml(payText)}</div>
    </div>`;

  const row2    = info.querySelector(`#card_row2_${r._id}`);
  const actions = document.createElement('div');
  actions.className = 'actions';

  const dlBtn = makeBtn('fa-download', 'Télécharger', async () => {
    try {
      const doc = await buildInvoiceDoc(r);
      doc.save(`facture_${(r.invoice_number || 'facture').replace(/[^0-9A-Za-z\-_.]/g, '_')}.pdf`);
      showToast('Téléchargement…');
    } catch(e) { console.error(e); alert('Erreur génération PDF'); }
  });

  const sndBtn = makeBtn('fa-paper-plane', 'Envoyer', async () => {
    // FIX: prompt() kept as fallback only (no stored email). Consider a proper modal in future.
    const email = r.client_email?.trim() || prompt('Adresse e-mail du destinataire :');
    if (!email) { showToast('Envoi annulé'); return; }
    try {
      const doc = await buildInvoiceDoc(r);
      await sendPdf(email, doc.output('datauristring'), sndBtn, buildEmailMeta(r));
    } catch(e) { console.error(e); alert('Erreur envoi PDF'); }
  });
  if (!r.client_email) { sndBtn.disabled = true; sndBtn.title = 'Aucune adresse e-mail'; sndBtn.style.opacity = '0.6'; }

  const editBtn = makeBtn('fa-pen',   'Modifier',   () => startEdit(r._id));
  const delBtn  = makeBtn('fa-trash', 'Supprimer',  () => deleteRow(r._id), 'border-color:#e76b6b;color:#b30000');

  actions.append(dlBtn, sndBtn, editBtn, delBtn);
  row2.appendChild(actions);
  card.append(pfp, info);
  return card;
}

function buildEmailMeta(r) {
  return {
    subject: `Votre facture N° ${r.invoice_number}`,
    message: `Bonjour ${r.client_name || ''},\n\nVeuillez trouver votre facture n° ${r.invoice_number} en pièce jointe.\n\nCordialement,`,
    footer:  '<small style="color:#777;font-size:10px">Mail envoyé par Axonis — Léo Tosku</small>'
  };
}

const debouncedUpdateList = debounce(updateList, 200);

function updateList() {
  const container = document.getElementById('cardsList');
  if (!container) return;

  const sort   = localStorage.getItem(STORAGE_SORT) || 'desc';
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

  let list = rows.slice();
  if (search) list = list.filter(r =>
    (r.client_name    || '').toLowerCase().includes(search) ||
    (r.invoice_number || '').toLowerCase().includes(search)
  );
  list.sort(invoiceCompare);
  if (sort === 'desc') list.reverse();

  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  list.forEach(r => frag.appendChild(createCard(r)));
  container.appendChild(frag);

  updateTotals(list);
  updateClientsCount();
}

function updateTotals(list) {
  const el = document.getElementById('cardsTotals');
  if (!el) return;
  const sum = list.reduce((s, r) => s + (parseFloat(r?.total_amount) || 0), 0);
  el.innerHTML = `<div class="total-line"><span>Total</span><strong class="total-amount">${formatPrice(sum)}</strong></div>`;
}

function updateClientsCount() {
  const el = document.getElementById('clientsCount');
  if (!el) return;
  const n = new Set(rows.map(r => r.client_name).filter(Boolean)).size;
  el.textContent = n === 0 ? '0 clients enregistrés' : n === 1 ? '1 client enregistré' : `${n} clients enregistrés`;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────
function resetFormAfterAdd() {
  document.getElementById('rowForm')?.reset();
  document.getElementById('invoice_date').value   = todayIso();
  document.getElementById('invoice_number').value = computeNextInvoice(getCurrentYear());
  rebuildServiceLines([]);
  document.getElementById('client_name')?.focus();
  updatePreview(); updateControls();
}

function addCurrentToList() {
  const d = getFormData();
  if (!d.invoice_number || !d.invoice_date || !d.client_name || !d.services.length) {
    alert('Remplissez : Numéro, Date, Nom et Type de séance');
    return false;
  }
  if (rows.some(r => r._id !== editingId && String(r.invoice_number).trim() === d.invoice_number)) {
    alert('Impossible : ce numéro de facture existe déjà.');
    return false;
  }

  if (editingId) {
    const idx = rows.findIndex(r => r._id === editingId);
    if (idx !== -1) rows[idx] = { ...d, _id: editingId };
    saveRows(); showToast('Entrée mise à jour ✅'); cancelEdit();
  } else {
    rows.push({ ...d, _id: uid() });
    saveRows(); showToast('Ajouté ✅');
  }

  updateList();
  updatePreview();
  document.getElementById('invoice_number').value = computeNextInvoice(getCurrentYear());
  rebuildServiceLines([]);
  return true;
}

function deleteRow(id) {
  if (!confirm('Confirmer : supprimer cette entrée ?')) return;
  rows = rows.filter(r => r._id !== id);
  saveRows(); updateList();
  document.getElementById('invoice_number').value = computeNextInvoice(getCurrentYear());
  showToast('Entrée supprimée');
  if (editingId === id) cancelEdit();
}

function startEdit(id) {
  const r = rows.find(r => r._id === id);
  if (!r) return;

  document.getElementById('invoice_number').value = r.invoice_number || '';
  document.getElementById('invoice_date').value   = r.invoice_date   || todayIso();
  document.getElementById('client_name').value    = r.client_name    || '';
  document.getElementById('client_email').value   = r.client_email   || '';
  document.getElementById('payment_note').value   = r.payment_note   || '';

  rebuildServiceLines(r.services?.length ? r.services : [{
    service_type: r.service_type, unit_price: r.unit_price,
    quantity: r.quantity, total_amount: r.total_amount
  }]);

  const pmSel   = document.getElementById('payment_method');
  const pmOther = document.getElementById('payment_method_other');
  if (pmSel) {
    const known = Array.from(pmSel.options).some(o => o.value === r.payment_method);
    if (known) {
      pmSel.value = r.payment_method;
      if (pmOther) { pmOther.style.display = 'none'; pmOther.value = ''; }
    } else {
      pmSel.value = 'Autre';
      if (pmOther) { pmOther.style.display = ''; pmOther.value = r.payment_method || ''; }
    }
  }

  updatePaymentLogo();
  editingId = id;

  const addBtn = document.getElementById('addBtn');
  if (addBtn) addBtn.innerHTML = '<i class="fa-solid fa-save" aria-hidden="true"></i>Mettre à jour';
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.style.display = '';
  document.getElementById('form-container')?.classList.add('editing-mode');
  document.querySelectorAll('.card.editing').forEach(el => el.classList.remove('editing'));
  document.querySelector(`.card[data-id="${id}"]`)?.classList.add('editing');

  const tabBtn = document.getElementById('tab-btn-form');
  if (tabBtn && getComputedStyle(tabBtn.parentElement).display !== 'none') tabBtn.click();

  updateFormTitle(); updatePreview(); updateControls();
  setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); document.getElementById('client_name')?.focus(); }, 50);
}

function cancelEdit() {
  editingId = null;
  const addBtn = document.getElementById('addBtn');
  if (addBtn) addBtn.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i>Entrer';
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.style.display = 'none';
  document.getElementById('form-container')?.classList.remove('editing-mode');
  document.querySelectorAll('.card.editing').forEach(el => el.classList.remove('editing'));

  try { document.getElementById('rowForm')?.reset(); } catch(e) { console.error(e); }
  document.getElementById('invoice_date').value         = todayIso();
  document.getElementById('invoice_number').value       = computeNextInvoice(getCurrentYear());
  const pmOther = document.getElementById('payment_method_other');
  if (pmOther) { pmOther.style.display = 'none'; pmOther.value = ''; }

  rebuildServiceLines([]);
  updateFormTitle(); updatePreview(); updateControls();
}

// ─── Image cache ──────────────────────────────────────────────────────────────
async function loadImage(url) {
  if (!url) return null;
  if (imgCache.has(url)) return imgCache.get(url);

  const candidates = [url, 'images/' + url, './' + url];
  try {
    let res = null;
    for (const p of candidates) {
      try { const r = await fetch(p); if (r.ok) { res = r; break; } } catch(e) { /* try next */ }
    }
    if (!res) { imgCache.set(url, null); return null; }

    const blob   = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload  = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    const img = await new Promise(resolve => {
      const im = new Image();
      im.onload  = () => resolve(im);
      im.onerror = () => resolve(null);
      im.src = dataUrl;
    });
    const result = { dataUrl, width: img?.naturalWidth || 80, height: img?.naturalHeight || 80 };
    imgCache.set(url, result);
    return result;
  } catch(e) {
    console.error('loadImage failed:', url, e);
    imgCache.set(url, null);
    return null;
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
function imgFmt(img) {
  return img?.dataUrl?.includes('image/png') ? 'PNG' : 'JPEG';
}

async function buildInvoiceDoc(d) {
  if (!window.jspdf?.jsPDF) throw new Error('Bibliothèque PDF non chargée');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 40, pw = doc.internal.pageSize.getWidth();

  const [logoImg, stampImg, axImg] = await Promise.all([
    loadImage(company.logo),
    loadImage(company.stamp),
    loadImage('images/axonis.png')
  ]);

  const services     = d.services?.length ? d.services : [{ service_type: d.service_type, unit_price: d.unit_price, quantity: d.quantity, total_amount: d.total_amount }];
  const invoiceTotal = d.total_amount ?? services.reduce((s, x) => s + (x.unit_price || 0) * (x.quantity || 1), 0);

  function drawHeader() {
    let y = 40, rx = left, hBottom = y;
    if (logoImg?.dataUrl) {
      const ratio = Math.min(1, 200 / logoImg.width, 120 / logoImg.height);
      const w = logoImg.width * ratio, h = logoImg.height * ratio;
      doc.addImage(logoImg.dataUrl, imgFmt(logoImg), left, y, w, h);
      rx = left + w + 18; hBottom = y + h;
    }
    doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor('#0D0C22');
    doc.text(company.name || '—', rx, y + 2);
    doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor('#0f766e');
    doc.text(company.profession || '—', rx, y + 20);
    doc.setFontSize(10); doc.setTextColor('#6E6D7A');
    let ay = y + 38;
    const addrLines = [
      ...(company.addressLines || []), '',
      ...(company.phone ? ['Tél : ' + company.phone] : []),
      ...(company.siret ? ['N° SIRET : ' + company.siret] : []),
      ...(company.rpps  ? ['Identifiant RPPS : ' + company.rpps] : [])
    ];
    addrLines.forEach(l => { doc.text(l, rx, ay); ay += 12; });
    return Math.max(hBottom, ay) + 18;
  }

  services.forEach((svc, idx) => {
    if (idx > 0) doc.addPage();
    const y      = drawHeader();
    const tableY = Math.max(y + 100, 360);
    const ref    = 'G.' + (d.invoice_number || '—');
    const lineTotal = svc?.total_amount ?? ((svc?.unit_price || 0) * (svc?.quantity || 1));

    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor('#0D0C22');
    doc.text("Note d'honoraire", pw / 2, tableY - 36, { align: 'center' });
    doc.setFont('helvetica','normal'); doc.setFontSize(11); doc.setTextColor('#0f766e');
    doc.text(ref, pw / 2, tableY - 22, { align: 'center' });
    doc.setTextColor('#0D0C22');

    doc.autoTable({
      startY: tableY, head: [],
      body: [
        ['Nom Prénom',        d.client_name || '—'],
        ['Date',              formatDateShort(d.invoice_date || todayIso())],
        ['Prestation',        svc?.service_type || '—'],
        ['Prix unitaire',     formatPrice(svc?.unit_price ?? 0)],
        ['Quantité',          String(svc?.quantity ?? 1)],
        ['Mode de règlement', d.payment_method + (d.payment_note ? ' • ' + d.payment_note : '')],
        ['Total prestation',  formatPrice(lineTotal)],
        ['Total facture',     formatPrice(invoiceTotal)]
      ],
      theme: 'grid',
      styles: { halign: 'left', valign: 'middle', font: 'helvetica', fontSize: 13, textColor: '#000' },
      columnStyles: { 0: { cellWidth: 140, fillColor: [255,255,255] }, 1: { cellWidth: pw - left*2 - 140 } },
      tableLineColor: [15,118,110], tableLineWidth: 0.6,
      didParseCell: ({ section, row, cell }) => {
        if (section === 'body') cell.styles.fillColor = row.index % 2 === 1 ? [243,255,243] : [255,255,255];
      }
    });

    const afterY = doc.lastAutoTable?.finalY ?? (tableY + 160);

    if (stampImg?.dataUrl) {
      const ratio = Math.min(1, 120 / stampImg.width, 120 / stampImg.height);
      const w = stampImg.width * ratio, h = stampImg.height * ratio;
      doc.addImage(stampImg.dataUrl, imgFmt(stampImg), pw - left - w, afterY + 20, w, h);
    }

    doc.setFontSize(10); doc.setTextColor('#6E6D7A');
    doc.text(`Fait à Deshaies le ${formatDateShort(d.invoice_date || todayIso())}`, left, afterY + 40);
    doc.setFontSize(9);
    doc.text('«TVA non applicable, Article 293 B du CGI»', left, afterY + 56);

    if (axImg?.dataUrl) {
      const credit = 'Facture générée avec';
      doc.setFontSize(8); doc.setTextColor('#0D0C22');
      const bottomY = doc.internal.pageSize.getHeight() - 36;
      const tw = doc.getTextWidth(credit);
      const iw = 32, ih = Math.round(iw * (axImg.height / axImg.width));
      const sx = Math.round((pw / 2) - (tw + iw + 4) / 2);
      doc.text(credit, sx, bottomY);
      doc.addImage(axImg.dataUrl, imgFmt(axImg), sx + tw + 4, bottomY - ih/2 - 4 + 2, iw, ih);
    }
  });

  return doc;
}

async function generateInvoicePDF(d) {
  const doc = await buildInvoiceDoc(d);
  doc.save(`facture_${(d.invoice_number || 'facture').replace(/[^0-9A-Za-z\-_.]/g, '_')}.pdf`);
}

// ─── Email ────────────────────────────────────────────────────────────────────
async function sendPdf(email, pdfDataUri, btn, meta = {}) {
  // Client-side rate limit
  if (Date.now() - lastSentAt < EMAIL_COOLDOWN_MS) {
    showToast('Veuillez patienter avant de renvoyer.'); return false;
  }
  const origHtml = btn?.innerHTML;
  try {
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Envoi…'; }
    // NOTE: mode:'no-cors' means we cannot read the server response.
    // Success toast is best-effort — verify via Google Apps Script logs.
    await fetch(SEND_SCRIPT_URL, {
      method: 'POST', mode: 'no-cors', cache: 'no-cache',
      body: JSON.stringify({ email, pdf: pdfDataUri, ...meta })
    });
    lastSentAt = Date.now();
    showToast('E-mail envoyé ✅');
    return true;
  } catch(e) {
    console.error('sendPdf error:', e);
    showToast("Erreur : impossible d'envoyer le message");
    return false;
  } finally {
    if (btn) { btn.disabled = false; if (origHtml) btn.innerHTML = origHtml; }
  }
}

async function handleMainSend() {
  const d = getFormData();
  if (!d.client_email || !isEmailValid(d.client_email)) { alert('Adresse email invalide.'); return; }
  try {
    const doc = await buildInvoiceDoc(d);
    const ok  = await sendPdf(d.client_email, doc.output('datauristring'), document.getElementById('sendBtn'), buildEmailMeta(d));
    if (ok) {
      if (!editingId) { addCurrentToList(); resetFormAfterAdd(); }
      else            { addCurrentToList(); cancelEdit(); }
      showToast('Envoyé et enregistré ✅');
    }
  } catch(e) { console.error(e); alert("Erreur lors de la génération ou de l'envoi."); }
}
window.handleMainSend = handleMainSend;

// ─── Import / Export ──────────────────────────────────────────────────────────
// FIX: performImport was referenced but never defined — now defined
function performImport(imported) {
  if (!imported?.length) { showToast('Aucun enregistrement trouvé'); return false; }
  const valid = imported.filter(r => r?.client_name && r?.invoice_number);
  if (!valid.length) { showToast('Aucun enregistrement valide trouvé'); return false; }
  if (!confirm(`Importer ${valid.length} ligne(s) ? Les doublons seront ignorés.`)) return false;

  let added = 0;
  valid.forEach(r => {
    r.client_name = toTitleCase(r.client_name);
    if (!r._id) r._id = uid();
    if (!r.services?.length) r.services = [{ service_type: r.service_type || '', unit_price: r.unit_price || 0, quantity: r.quantity || 1, total_amount: r.total_amount || 0 }];
    if (!rows.some(e => e.invoice_number === r.invoice_number)) { rows.push(r); added++; }
  });

  saveRows(); updateList();
  showToast(`${added} ligne(s) importée(s)`);
  return true;
}

async function downloadXLSX() {
  if (!rows.length) { alert('Aucune ligne à exporter'); return; }
  const headers = ['NUMÉRO DE FACTURE','DATE','CLIENT','EMAIL','PRESTATION','PRIX UNITAIRE','QUANTITÉ','MODE DE PAIEMENT','NOTE DE PAIEMENT','MONTANT TOTAL'];
  const keys    = ['invoice_number','invoice_date','client_name','client_email','service_type','unit_price','quantity','payment_method','payment_note','total_amount'];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Compta'; wb.created = new Date();
  const ws = wb.addWorksheet('Compta');
  ws.columns = headers.map((h, i) => ({ header: h, key: keys[i] }));

  ws.getRow(1).height = 22;
  ws.getRow(1).eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  rows.forEach(r => {
    const row = {};
    keys.forEach(k => {
      let v = r[k] ?? '';
      if (k === 'invoice_date' && v) { const dt = parseIsoDate(v); if (dt) v = dt; }
      if (k === 'unit_price' || k === 'total_amount') v = parseFloat(String(v).replace(/[€ ]/g,'').replace(',','.')) || 0;
      if (k === 'quantity') v = Number(v) || 0;
      row[k] = v;
    });
    ws.addRow(row);
  });

  ws.getColumn('unit_price').numFmt   = '#,##0.00 €';
  ws.getColumn('total_amount').numFmt = '#,##0.00 €';
  ws.getColumn('quantity').numFmt     = '0';
  ws.getColumn('invoice_date').numFmt = 'dd/mm/yyyy';

  const widths = headers.map(h => h.length + 2);
  rows.forEach(r => keys.forEach((k, j) => { widths[j] = Math.min(50, Math.max(widths[j], String(r[k] ?? '').length + 2)); }));
  widths.forEach((w, i) => ws.getColumn(i + 1).width = w);

  ws.eachRow({ includeEmpty: false }, (row, rn) => {
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = { top:{style:'thin',color:{argb:'FFE6F3EC'}}, left:{style:'thin',color:{argb:'FFE6F3EC'}}, bottom:{style:'thin',color:{argb:'FFE6F3EC'}}, right:{style:'thin',color:{argb:'FFE6F3EC'}} };
      if (rn > 1 && rn % 2 === 0) cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FFF3FFF3' } };
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    'compta_' + new Date().toISOString().replace(/[:.]/g, '-') + '.xlsx');
}

function handleImportFile(file) {
  if (!file) return;
  const name    = file.name.toLowerCase();
  const HEADERS = { 'NUMÉRO DE FACTURE':'invoice_number','DATE':'invoice_date','CLIENT':'client_name','EMAIL':'client_email','PRESTATION':'service_type','PRIX UNITAIRE':'unit_price','QUANTITÉ':'quantity','MODE DE PAIEMENT':'payment_method','NOTE DE PAIEMENT':'payment_note','MONTANT TOTAL':'total_amount' };

  const toFloat = s => parseFloat(String(s||'0').replace(/[^0-9,-]/g,'').replace(',','.')) || 0;

  function mapRaw(rawObj) {
    const obj = {};
    Object.entries(HEADERS).forEach(([fr, en]) => obj[en] = rawObj[fr.toUpperCase()] || '');
    if (obj.invoice_date) {
      const parts = String(obj.invoice_date).split('/');
      if (parts.length === 3) obj.invoice_date = `${parts[2]}-${pad(+parts[1])}-${pad(+parts[0])}`;
      else { const dt = new Date(obj.invoice_date); if (!isNaN(dt)) obj.invoice_date = `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}`; }
    }
    obj.unit_price   = toFloat(obj.unit_price);
    obj.total_amount = toFloat(obj.total_amount);
    obj.quantity     = parseInt(obj.quantity || '1', 10) || 1;
    if (!obj.total_amount && obj.unit_price) obj.total_amount = obj.unit_price * obj.quantity;
    else if (!obj.unit_price && obj.total_amount) obj.unit_price = obj.total_amount / obj.quantity;
    return obj;
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(reader.result);
        const ws = wb.worksheets[0];
        if (!ws) { showToast('Aucune feuille trouvée'); return; }
        const hdrs = (ws.getRow(1).values || []).slice(1).map(h => String(h||'').trim().toUpperCase());
        const imported = [];
        for (let i = 2; i <= ws.rowCount; i++) {
          const row = ws.getRow(i);
          if (!row.actualCellCount) continue;
          const raw = {};
          hdrs.forEach((h, idx) => {
            let v = row.getCell(idx+1).value;
            if (v && typeof v === 'object') v = v.text || v.richText?.map(t=>t.text).join('') || v.result || '';
            raw[h] = v != null ? String(v).trim() : '';
          });
          imported.push(mapRaw(raw));
        }
        performImport(imported);
      } catch(e) { console.error(e); showToast('Erreur import XLSX'); }
    };
    reader.readAsArrayBuffer(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const lines = (reader.result || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { showToast('Fichier vide'); return; }
      const sep  = lines[0].includes(';') ? ';' : ',';
      const hdrs = lines[0].split(sep).map(h => h.trim().toUpperCase());
      const imported = lines.slice(1).map(line => {
        const raw = {};
        line.split(sep).forEach((c, i) => raw[hdrs[i]] = c.trim());
        return mapRaw(raw);
      });
      performImport(imported);
    } catch(e) { console.error(e); showToast('Erreur import CSV'); }
  };
  reader.readAsText(file, 'utf-8');
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
function closeAllMenus() {
  const fileBtn   = document.getElementById('fileMenuBtn');
  const fileMenu  = document.getElementById('fileMenu');
  const mobileNav = document.getElementById('mobileNavPanel');
  const mobToggle = document.getElementById('mobileNavToggle');
  const backdrop  = document.getElementById('backdrop');
  fileBtn?.classList.remove('open'); fileBtn?.setAttribute('aria-expanded','false');
  fileMenu?.setAttribute('aria-hidden','true');
  mobileNav?.classList.remove('open'); mobileNav?.setAttribute('aria-hidden','true');
  mobToggle?.setAttribute('aria-expanded','false');
  backdrop?.classList.remove('open'); backdrop?.setAttribute('aria-hidden','true');
}

function wipeRows() {
  if (!confirm('Confirmer : vider la table en mémoire ?')) return;
  rows = [];
  try { localStorage.removeItem(STORAGE_ROWS); } catch(e) { console.error(e); }
  updateList();
  document.getElementById('invoice_number').value = computeNextInvoice(getCurrentYear());
  showToast('Table vidée ✅');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadCompany();
  ensureRowIds();

  const dateEl = document.getElementById('invoice_date');
  if (dateEl && !dateEl.value) dateEl.value = todayIso();
  const numEl = document.getElementById('invoice_number');
  if (numEl && !numEl.value) numEl.value = computeNextInvoice(getCurrentYear());

  const pmOther = document.getElementById('payment_method_other');
  if (pmOther) pmOther.style.display = 'none';
  if (!localStorage.getItem(STORAGE_SORT)) localStorage.setItem(STORAGE_SORT, 'desc');

  rebuildServiceLines([]);
  updateList(); updatePreview(); updateControls(); updateFormTitle();
  document.getElementById('client_name')?.focus();
  window.addEventListener('beforeunload', saveRows);

  // Bottom-shadow scroll helper
  const controls = document.querySelector('.controls');
  if (controls) {
    const checkShadow = () => controls.classList.toggle('no-shadow',
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8);
    ['scroll','resize','orientationchange'].forEach(ev => window.addEventListener(ev, checkShadow, { passive: true }));
    setTimeout(checkShadow, 40);
  }

  // ── Form events ─────────────────────────────────────────────────────────────
  document.getElementById('rowForm')?.addEventListener('input', updatePreview);

  document.getElementById('rowForm')?.addEventListener('submit', e => {
    e.preventDefault();
    if (document.getElementById('addBtn')?.disabled) return;
    const wasEditing = !!editingId;
    if (addCurrentToList() && !wasEditing) resetFormAfterAdd();
  });

  document.getElementById('client_name')?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    const wasEditing = !!editingId;
    if (addCurrentToList() && !wasEditing) resetFormAfterAdd();
  });

  // Single payment_method change handler (FIX: was registered twice)
  document.getElementById('payment_method')?.addEventListener('change', function() {
    const other   = document.getElementById('payment_method_other');
    const isOther = this.value === 'Autre';
    if (other) { other.style.display = isOther ? '' : 'none'; if (!isOther) other.value = ''; }
    updatePaymentLogo(); updatePreview(); updateControls();
  });

  document.getElementById('payment_method_other')?.addEventListener('input', () => { updatePreview(); updateControls(); });
  document.getElementById('invoice_date')?.addEventListener('change', () => { updatePreview(); updateControls(); });
  document.getElementById('cancelEditBtn')?.addEventListener('click', cancelEdit);

  document.getElementById('addServiceLineBtn')?.addEventListener('click', () => {
    const line = addServiceLine({ quantity: 1 });
    line?.querySelector('select')?.focus();
  });

  document.getElementById('sortOrder')?.addEventListener('change', function() {
    localStorage.setItem(STORAGE_SORT, this.value); updateList();
  });

  document.getElementById('searchInput')?.addEventListener('input', debouncedUpdateList);

  document.getElementById('downloadBtn')?.addEventListener('click', async function() {
    const d = getFormData();
    if (!d.invoice_number) { alert('Numéro de facture requis'); return; }
    const origHtml = this.innerHTML;
    try {
      this.disabled = true; this.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      await generateInvoicePDF(d);
      showToast('Facture PDF générée');
    } catch(e) { console.error(e); alert('Erreur génération PDF'); }
    finally { this.disabled = false; this.innerHTML = origHtml; }
  });

  document.getElementById('sendBtn')?.addEventListener('click', handleMainSend);
  document.getElementById('exportCsvBtn')?.addEventListener('click', downloadXLSX);
  document.getElementById('wipeBtn')?.addEventListener('click', wipeRows);

  const importInput = document.getElementById('importCsvInput');
  document.getElementById('importCsvBtn')?.addEventListener('click', () => importInput?.click());
  importInput?.addEventListener('change', e => { handleImportFile(e.target.files?.[0]); importInput.value = ''; });

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const tabForm    = document.getElementById('tab-btn-form');
  const tabPreview = document.getElementById('tab-btn-preview');
  const formCont   = document.getElementById('form-container');
  const prevCont   = document.getElementById('preview-container');
  if (tabForm && tabPreview) {
    tabPreview.addEventListener('click', () => {
      tabPreview.classList.add('active'); tabPreview.setAttribute('aria-selected','true');
      tabForm.classList.remove('active'); tabForm.setAttribute('aria-selected','false');
      if (prevCont) prevCont.style.display = 'block';
      if (formCont) formCont.style.display = 'none';
    });
    tabForm.addEventListener('click', () => {
      tabForm.classList.add('active'); tabForm.setAttribute('aria-selected','true');
      tabPreview.classList.remove('active'); tabPreview.setAttribute('aria-selected','false');
      if (formCont) formCont.style.display = 'block';
      if (prevCont) prevCont.style.display = 'none';
    });
  }

  // ── Desktop File menu ───────────────────────────────────────────────────────
  const fileBtn  = document.getElementById('fileMenuBtn');
  const fileMenu = document.getElementById('fileMenu');
  const backdrop = document.getElementById('backdrop');
  if (fileBtn && fileMenu) {
    fileBtn.addEventListener('click', e => {
      e.stopPropagation();
      const open = fileBtn.classList.toggle('open');
      fileBtn.setAttribute('aria-expanded', String(open));
      fileMenu.setAttribute('aria-hidden', String(!open));
      backdrop?.classList.toggle('open', open); backdrop?.setAttribute('aria-hidden', String(!open));
    });
    document.getElementById('menuExport')?.addEventListener('click', () => { downloadXLSX(); closeAllMenus(); });
    document.getElementById('menuImport')?.addEventListener('click', () => { importInput?.click(); closeAllMenus(); });
    document.getElementById('menuWipe')?.addEventListener('click',   () => { wipeRows(); closeAllMenus(); });
  }

  // ── Mobile nav ──────────────────────────────────────────────────────────────
  const mobToggle = document.getElementById('mobileNavToggle');
  const mobPanel  = document.getElementById('mobileNavPanel');
  if (mobToggle && mobPanel) {
    mobToggle.addEventListener('click', e => {
      e.stopPropagation();
      const open = mobPanel.classList.toggle('open');
      mobPanel.setAttribute('aria-hidden', String(!open));
      mobToggle.setAttribute('aria-expanded', String(open));
      backdrop?.classList.toggle('open', open); backdrop?.setAttribute('aria-hidden', String(!open));
    });
    document.getElementById('mobileImportBtn')?.addEventListener('click', () => { importInput?.click(); closeAllMenus(); });
    document.getElementById('mobileExportBtn')?.addEventListener('click', () => { downloadXLSX(); closeAllMenus(); });
    document.getElementById('mobileWipeBtn')?.addEventListener('click',   () => { wipeRows(); closeAllMenus(); });
  }

  backdrop?.addEventListener('click', closeAllMenus);
  document.addEventListener('click', e => {
    if (!fileBtn?.contains(e.target) && !mobPanel?.contains(e.target) && !mobToggle?.contains(e.target)) closeAllMenus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllMenus(); });
}

init();