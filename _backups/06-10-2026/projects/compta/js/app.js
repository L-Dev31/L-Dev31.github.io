import { $, avatar, debounce, download, fmtDate, fmtPrice, isoDate, loadImage, round2, titleCase, uid } from './utils.js';
import { db, save, loadCompany, loadCatalog, setCompany, saveCompany, nextInvoice, compareInvoices, serviceOptions, normalize, taxSummary, catalog, fieldsOf, professionsOf } from './store.js';
import { buildInvoice, loadPdfLib, pdfName } from './pdf.js';
import { canSend, hasMailUrl, sendInvoice } from './mail.js';
import { exportXlsx, parseFile } from './io.js';
import { attachPhoneInput, getPhoneValue, setPhoneValue } from './phone.js';
import { locateCity } from './geo.js';
import { hasPaUrl, sendToPA } from './pa.js';
import { resolveTheme, THEME_PRESETS } from './color.js';

const OTHER = '__other';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SORT_KEY = 'compta_sort';
const SEND_BTN_TITLE = 'Envoie le PDF puis ajoute la ligne au tableau';

const form = $('rowForm'), f = form.elements;
const lines = $('services'), cardsList = $('cardsList'), sortSel = $('sortOrder');
const lineTpl = $('lineTpl').content.firstElementChild, cardTpl = $('cardTpl').content.firstElementChild;
let editingId = null;
let svcPrices = new Map();

const accountTpl = $('accountTpl').content.firstElementChild;
document.querySelectorAll('.account-slot').forEach(slot => slot.append(accountTpl.cloneNode(true)));

const setDirty = (form, dirty) => {
  form.querySelector('[type=submit]').disabled = !dirty;
  form.querySelector('.account-cancel').disabled = !dirty;
};
let filling = false;

const phoneReady = Promise.all([...document.querySelectorAll('.account-form [data-field="phone"]')].map(async input => {
  await attachPhoneInput(input);
  input.addEventListener('countrychange', () => { if (!filling) setDirty(input.closest('.account-form'), true); });
})).catch(e => console.error('phone input:', e));

const toastEl = document.querySelector('.toast');
function toast(text, ms = 2000) {
  toastEl.textContent = text;
  toastEl.showPopover?.();
  toastEl.classList.add('show');
  clearTimeout(toastEl._t); clearTimeout(toastEl._t2);
  toastEl._t = setTimeout(() => {
    toastEl.classList.remove('show');
    toastEl._t2 = setTimeout(() => toastEl.hidePopover?.(), 300);
  }, ms);
}

async function busy(btn, fn, errMsg) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  try { await fn(); }
  catch (e) { console.error(e); alert(e.message || errMsg); }
  finally { btn.innerHTML = html; btn.disabled = false; refresh(); }
}

function addLine(s = {}) {
  const line = lineTpl.cloneNode(true);
  const [sel, desc, price, qty] = line.querySelectorAll('select, input');
  sel.append(...[...svcPrices].map(([label, p]) => new Option(`${label} — ${p}€`, label)), new Option('Autre…', OTHER));
  const serviceType = s.service_type || svcPrices.keys().next().value;
  if (serviceType) {
    if (svcPrices.has(serviceType)) sel.value = serviceType;
    else { sel.value = OTHER; desc.value = serviceType; price.value = s.unit_price ?? ''; }
  }
  qty.value = s.quantity || 1;
  lines.append(line);
  return line;
}

function setLines(services = []) {
  svcPrices = serviceOptions();
  lines.replaceChildren();
  services.length ? services.forEach(addLine) : addLine();
}

function readForm() {
  let valid = true;
  const services = [...lines.children].map(line => {
    const [sel, desc, price, qty] = line.querySelectorAll('select, input');
    const other = sel.value === OTHER;
    line.classList.toggle('other', other);
    if (!other) desc.value = price.value = '';
    const service_type = other ? desc.value.trim() : sel.value;
    const unit_price = round2(other ? price.value : svcPrices.get(sel.value));
    const quantity = parseInt(qty.value, 10) || 0;
    const total_amount = round2(unit_price * quantity);
    valid &&= !!service_type && quantity > 0 && (!other || unit_price > 0);
    return { service_type, unit_price, quantity, total_amount };
  });

  const pmOther = f.payment_method.value === 'Autre';
  $('pmOther').hidden = !pmOther;
  if (!pmOther) f.payment_method_other.value = '';

  const b2b = f.client_type.value === 'b2b';
  const d = {
    invoice_number: f.invoice_number.value.trim(),
    invoice_date: f.invoice_date.value || isoDate(),
    client_type: b2b ? 'b2b' : 'b2c',
    client_name: b2b ? f.client_name.value.trim() : titleCase(f.client_name.value),
    client_siren: b2b ? f.client_siren.value.replace(/\D/g, '') : '',
    client_email: f.client_email.value.trim(),
    client_address: f.client_address.value.trim(),
    client_postal_code: f.client_postal_code.value.trim(),
    client_city: f.client_city.value.trim(),
    services,
    payment_method: pmOther ? f.payment_method_other.value.trim() : f.payment_method.value,
    payment_note: f.payment_note.value.trim(),
    total_amount: taxSummary(services).ttc
  };
  valid &&= !!(d.invoice_number && f.invoice_date.value && d.client_name && services.length && d.payment_method);
  if (b2b) valid &&= /^\d{9}$/.test(d.client_siren) && !!(d.client_address && d.client_postal_code && d.client_city);
  return { d, valid };
}

function refresh() {
  const { d, valid } = readForm();
  const b2b = d.client_type === 'b2b';
  $('clientSirenField').hidden = !b2b;
  $('clientAddressOpt').hidden = b2b;
  $('clientNameLabel').textContent = b2b ? 'Raison sociale du client' : 'Nom et prénom du client';
  f.client_name.placeholder = b2b ? 'Nom de l\'entreprise' : 'Nom Prénom';

  const logo = f.payment_method.selectedOptions[0]?.dataset.logo;
  $('payLogo').hidden = !logo;
  if (logo) $('payLogo').src = logo;

  avatar($('previewPfp'), d.client_name);
  $('previewClient').textContent = d.client_name || 'Nom Prénom';
  $('previewService').textContent = d.services
    .map(s => (s.service_type || '[type de séance]') + (s.quantity > 1 ? ` • x${s.quantity}` : '')).join('\n');
  $('previewEmail').textContent = d.client_email;
  $('previewEmail').hidden = !d.client_email;
  $('previewInvoice').textContent = `N° ${d.invoice_number || nextInvoice()} • ${fmtDate(d.invoice_date)}`;
  $('previewPayment').textContent = d.payment_method || 'Mode paiement';
  $('previewTotal').textContent = $('priceBig').textContent = fmtPrice(d.total_amount);

  const emailOk = !d.client_email || EMAIL_RE.test(d.client_email);
  f.client_email.classList.toggle('invalid', !emailOk);
  $('emailError').hidden = emailOk;
  $('addBtn').disabled = $('downloadBtn').disabled = !(valid && emailOk);
  $('sendBtn').disabled = !(valid && d.client_email && emailOk && hasMailUrl());
  $('sendBtn').title = hasMailUrl() ? SEND_BTN_TITLE : "Configurez l'URL d'envoi dans Compte";
  return d;
}

function setEditing(id) {
  editingId = id;
  $('form-container').classList.toggle('editing-mode', !!id);
  $('formTitle').textContent = id ? `Mettre à jour la facture N° ${db.rows.find(r => r._id === id)?.invoice_number || '—'}` : 'Nouvelle facture';
  for (const c of cardsList.children) c.classList.toggle('editing', c.dataset.id === id);
}

function resetForm() {
  setEditing(null);
  form.reset();
  f.invoice_date.value = isoDate();
  f.invoice_number.value = nextInvoice();
  setLines();
  refresh();
  f.client_name.focus();
}

function isDuplicate(d) {
  if (!db.rows.some(r => r._id !== editingId && String(r.invoice_number).trim() === d.invoice_number)) return false;
  alert('Impossible : ce numéro de facture existe déjà.');
  return true;
}

function commit(d) {
  if (isDuplicate(d)) return false;
  const i = db.rows.findIndex(r => r._id === editingId);
  if (i >= 0) db.rows[i] = { ...d, _id: editingId };
  else db.rows.push({ ...d, _id: uid() });
  save();
  toast(i >= 0 ? 'Entrée mise à jour' : 'Ajouté');
  renderList();
  resetForm();
  return true;
}

function startEdit(id) {
  const r = db.rows.find(r => r._id === id);
  if (!r) return;
  if (r.pa) return alert('Cette facture a déjà été transmise à la plateforme agréée : elle ne peut plus être modifiée. Il faut émettre un avoir puis une nouvelle facture.');
  for (const k of ['invoice_number', 'client_name', 'client_siren', 'client_email', 'client_address', 'client_postal_code', 'client_city', 'payment_note']) f[k].value = r[k] || '';
  f.client_type.value = r.client_type === 'b2b' ? 'b2b' : 'b2c';
  f.invoice_date.value = r.invoice_date || isoDate();
  const pm = r.payment_method || '';
  f.payment_method.value = pm;
  if (f.payment_method.value !== pm) {
    f.payment_method.value = 'Autre';
    f.payment_method_other.value = pm;
  }
  setLines(r.services);
  setEditing(id);
  setTab('form');
  refresh();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  f.client_name.focus();
}

function deleteRow(id) {
  if (!confirm('Confirmer : supprimer cette entrée ?')) return;
  db.rows = db.rows.filter(r => r._id !== id);
  save();
  renderList();
  if (editingId === id) resetForm();
  else if (!editingId) { f.invoice_number.value = nextInvoice(); refresh(); }
  toast('Entrée supprimée');
}

function wipe() {
  if (!confirm('Confirmer : vider la table en mémoire ?')) return;
  db.rows = [];
  save();
  renderList();
  resetForm();
  toast('Table vidée');
}

async function importFile(file) {
  try {
    const valid = (await parseFile(file)).filter(r => r.client_name && r.invoice_number);
    if (!valid.length) return toast('Aucun enregistrement valide trouvé');
    if (!confirm(`Importer ${valid.length} ligne(s) ? Les doublons seront ignorés.`)) return;
    const known = new Set(db.rows.map(r => r.invoice_number));
    const added = valid.filter(r => !known.has(r.invoice_number) && known.add(r.invoice_number)).map(normalize);
    db.rows.push(...added);
    save();
    renderList();
    if (!editingId) { f.invoice_number.value = nextInvoice(); refresh(); }
    toast(`${added.length} ligne(s) importée(s)`);
  } catch (e) { console.error(e); toast("Erreur lors de l'import"); }
}

function card(r) {
  const el = cardTpl.cloneNode(true), q = s => el.querySelector(s);
  const [s0 = {}] = r.services, n = r.services.length;
  el.dataset.id = r._id;
  el.classList.toggle('editing', r._id === editingId);
  avatar(q('.pfp'), r.client_name);
  q('.c-name').textContent = r.client_name || '—';
  q('.c-svc').textContent = (s0.service_type || 'Prestation') + (n > 1 ? ` +${n - 1} autres` : s0.quantity > 1 ? ` • x${s0.quantity}` : '');
  q('.c-email').textContent = r.client_email || '';
  q('.c-email').hidden = !r.client_email;
  q('.c-total').textContent = fmtPrice(r.total_amount);
  q('.c-inv').textContent = `N° ${r.invoice_number || '—'} • ${fmtDate(r.invoice_date)}` + (r.pa ? ` • Transmise PA le ${fmtDate(r.pa.sentAt.slice(0, 10))}` : '');
  q('.c-pay').textContent = (r.payment_method || '') + (r.payment_note ? ' • ' + r.payment_note : '');
  if (!r.client_email) Object.assign(q('[data-act=send]'), { disabled: true, title: 'Aucune adresse e-mail' });
  else if (!hasMailUrl()) Object.assign(q('[data-act=send]'), { disabled: true, title: "Configurez l'URL d'envoi dans Compte" });
  if (r.pa) Object.assign(q('[data-act=pa]'), { disabled: true, title: 'Déjà transmise à la plateforme agréée' });
  else if (!hasPaUrl()) Object.assign(q('[data-act=pa]'), { disabled: true, title: 'Configurez la passerelle PA dans Compte' });
  if (r.pa) Object.assign(q('[data-act=edit]'), { disabled: true, title: 'Facture transmise : non modifiable' });
  return el;
}

function renderList() {
  const q = $('searchInput').value.toLowerCase().trim();
  const list = (q ? db.rows.filter(r => r.client_name.toLowerCase().includes(q) || String(r.invoice_number).toLowerCase().includes(q)) : db.rows.slice())
    .sort(compareInvoices);
  if (sortSel.value === 'desc') list.reverse();
  cardsList.replaceChildren(...list.map(card));
  $('listTotal').textContent = fmtPrice(list.reduce((s, r) => s + (+r.total_amount || 0), 0));
  const n = new Set(db.rows.map(r => r.client_name).filter(Boolean)).size;
  const s = n === 1 ? '' : 's';
  $('clientsCount').textContent = `${n} client${s} enregistré${s}`;
}

const cardActions = {
  async download(r) { (await buildInvoice(r)).save(pdfName(r)); toast('Téléchargement…'); },
  async send(r) {
    if (!canSend()) return toast('Veuillez patienter avant de renvoyer.');
    await sendInvoice(r, r.client_email);
    toast('E-mail envoyé');
  },
  async pa(r) {
    if (!confirm(`Transmettre la facture N° ${r.invoice_number} à la plateforme agréée ? Une fois transmise, elle ne pourra plus être modifiée.`)) return;
    const res = await sendToPA(r);
    r.pa = { sentAt: new Date().toISOString(), id: res.id || '', status: res.status || '' };
    save();
    renderList();
    toast('Facture transmise à la plateforme agréée');
  }
};

function setPfpImage(pfp, src) {
  pfp.classList.remove('has-logo');
  if (!src) return;
  const img = new Image();
  img.alt = '';
  img.onload = () => { pfp.replaceChildren(img); pfp.classList.add('has-logo'); pfp.style.cssText = ''; };
  img.src = src;
}

function renderProfile() {
  const c = db.company, all = s => document.querySelectorAll(s);
  applyTheme(c.theme);
  all('.company-only').forEach(el => el.hidden = !c.name);
  all('.guest-only').forEach(el => el.hidden = !!c.name);
  if (!c.name) return;
  all('.company-name').forEach(el => el.textContent = c.name);
  all('.company-job').forEach(el => el.textContent = c.profession || '');
  const info = [...(c.addressLines || []), [c.postalCode, c.city].filter(Boolean).join(' '), c.phone && 'Tél : ' + c.phone, c.siret && 'SIRET : ' + c.siret].filter(Boolean).join('\n');
  all('.company-info').forEach(el => el.textContent = info);
  all('.company-pfp').forEach(p => { avatar(p, c.name); setPfpImage(p, c.logo); });
  fillAccountForm();
}

const field = (form, name) => form.querySelector(`[data-field="${name}"]`);

const THEME_VARS = { accent: '--accent', bg: '--bg', bg2: '--bg2', text: '--text' };
const rootCss = getComputedStyle(document.documentElement);
const THEME_DEFAULTS = Object.fromEntries(Object.entries(THEME_VARS).map(([k, v]) => [k, rootCss.getPropertyValue(v).trim()]));

function applyTheme(theme = {}) {
  const root = document.documentElement.style;
  const { bg, bg2, accent, text, onAccent } = resolveTheme(theme, THEME_DEFAULTS);
  root.setProperty('--bg', bg);
  root.setProperty('--bg2', bg2);
  root.setProperty('--accent', accent);
  root.setProperty('--text', text);
  root.setProperty('--on-accent', onAccent);
  const activeId = theme.id || 'default';
  document.querySelectorAll('.theme-preset').forEach(b => b.setAttribute('aria-pressed', b.dataset.presetId === activeId));
}

function renderThemePresets() {
  const html = THEME_PRESETS.map(p =>
    `<button type="button" class="theme-preset" data-preset-id="${p.id}" style="--sw-accent:${p.accent};--sw-bg2:${p.bg2}" title="${p.label}"><span class="theme-preset-swatch"></span><span>${p.label}</span></button>`
  ).join('');
  document.querySelectorAll('.theme-presets').forEach(el => { el.innerHTML = html; });
}

const saveThemeSoon = debounce(saveCompany, 300);
function setTheme(theme) {
  db.company.theme = theme;
  applyTheme(theme);
  saveThemeSoon();
}

function buildProPickers() {
  const groups = new Map();
  for (const p of catalog.professions) groups.set(p.group, [...(groups.get(p.group) || []), p]);
  const html = [...groups].map(([group, pros]) => `<fieldset class="pro-group"><legend>${group}</legend>${
    pros.map(p => `<label class="pro-option"><input type="checkbox" value="${p.id}">${p.label}</label>`).join('')
  }</fieldset>`).join('');
  document.querySelectorAll('.account-form .pro-options').forEach(el => { el.innerHTML = html; });
}

function updateProUI(form, values) {
  const selected = { professions: [...form.querySelectorAll('.pro-options input:checked')].map(i => i.value) };
  form.querySelector('.pro-summary').textContent = professionsOf(selected).map(p => p.label).join(', ') || 'Sélectionner…';
  const box = form.querySelector('.pro-fields');
  const current = Object.fromEntries([...box.querySelectorAll('[data-field]')].map(i => [i.dataset.field, i.value]));
  box.replaceChildren(...fieldsOf(selected).map(key => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'text', value: (values ? values[key] : current[key]) ?? '' });
    wrap.className = 'field';
    input.dataset.field = key;
    label.append(catalog.fields[key].label, input);
    wrap.append(label);
    return wrap;
  }));
}

function fillAccountForm() {
  const c = db.company;
  filling = true;
  document.querySelectorAll('.account-form').forEach(form => {
    field(form, 'name').value = c.name || '';
    field(form, 'profession').value = c.profession || '';
    field(form, 'addressLine1').value = c.addressLines?.[0] || '';
    field(form, 'addressLine2').value = c.addressLines?.[1] || '';
    field(form, 'postalCode').value = c.postalCode || '';
    field(form, 'city').value = c.city || '';
    setPhoneValue(field(form, 'phone'), c.phone);
    field(form, 'siret').value = c.siret || '';
    field(form, 'siren').value = c.siren || '';
    field(form, 'mailUrl').value = c.mailUrl || '';
    field(form, 'vatNumber').value = c.vatNumber || '';
    field(form, 'vatRegime').value = c.vatRegime || 'franchise';
    field(form, 'vatRate').value = c.vatRate || '';
    form.querySelector('.vat-rate-field').hidden = field(form, 'vatRegime').value !== 'taxable';
    for (const k of ['paUrl', 'paKey']) field(form, k).value = c[k] || '';
    form.querySelectorAll('.pro-options input').forEach(i => { i.checked = (c.professions || []).includes(i.value); });
    updateProUI(form, c);
    delete form.dataset.logo; delete form.dataset.stamp;
    const stampPreview = form.querySelector('.stamp-preview');
    if (c.stamp) stampPreview.src = c.stamp;
    else stampPreview.removeAttribute('src');
    setDirty(form, false);
  });
  filling = false;
}

function setTab(tab) {
  document.body.dataset.tab = tab;
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab));
}

function toggleMenu(open = !document.body.classList.contains('menu-open')) {
  document.body.classList.toggle('menu-open', open);
  $('menuBtn').setAttribute('aria-expanded', open);
}

const accountDialog = $('accountDialog');
const openAccountDialog = () => accountDialog.showModal();

const servicesDialog = $('servicesDialog');
const servicesList = servicesDialog.querySelector('.services-list');
const serviceRowTpl = $('serviceRowTpl').content.firstElementChild;

function addServiceRow(s = {}) {
  const row = serviceRowTpl.cloneNode(true);
  const [label, price] = row.querySelectorAll('input');
  const pros = professionsOf();
  const pro = row.querySelector('.svc-cfg-pro');
  label.value = s.label || '';
  price.value = s.price ?? '';
  pro.append(...pros.map(p => new Option(p.label, p.id)));
  pro.value = pros.some(p => p.id === s.profession) ? s.profession : pros[0]?.id || '';
  row.querySelector('.svc-cfg-pro-field').hidden = pros.length < 2;
  servicesList.append(row);
  return row;
}

const servicesSaveBtn = servicesDialog.querySelector('[type=submit]');
const setServicesDirty = dirty => { servicesSaveBtn.disabled = !dirty; };

function renderServicesList() {
  servicesList.replaceChildren();
  (db.company.services || []).forEach(s => addServiceRow(typeof s === 'string' ? { label: s, price: 0 } : s));
  setServicesDirty(false);
}

let cameFromAccountDialog = false;
function openServicesDialog() {
  cameFromAccountDialog = accountDialog.open;
  if (cameFromAccountDialog) accountDialog.close();
  renderServicesList();
  servicesDialog.showModal();
}
servicesDialog.addEventListener('close', () => { if (cameFromAccountDialog) accountDialog.showModal(); });

const slug = s => String(s || '').trim().replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '');

async function embedImage(src) {
  if (!src || src.startsWith('data:')) return src;
  const img = await loadImage(src);
  return img?.data || src;
}

async function exportCompany() {
  const c = { ...db.company };
  [c.logo, c.stamp] = await Promise.all([embedImage(c.logo), embedImage(c.stamp)]);
  const name = slug(c.name) || 'company', job = slug(c.profession);
  const payload = { company: c, rows: db.rows };
  download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${job ? `${name}-${job}` : name}.axo`);
}

const menuActions = {
  export: () => db.rows.length ? exportXlsx(db.rows) : alert('Aucune ligne à exporter'),
  import: () => $('importInput').click(),
  wipe,
  companyExport: exportCompany,
  companyImport: () => $('companyImportInput').click()
};

form.addEventListener('input', e => {
  refresh();
  if (e.target.matches('.svc-type') && e.target.value === OTHER) e.target.closest('.service-line').querySelector('.svc-desc').focus();
});
form.addEventListener('submit', e => {
  e.preventDefault();
  if (!$('addBtn').disabled) commit(readForm().d);
});
lines.addEventListener('click', e => {
  if (!e.target.closest('.svc-rm')) return;
  e.target.closest('.service-line').remove();
  refresh();
});
$('addLineBtn').addEventListener('click', () => { addLine().querySelector('select').focus(); refresh(); });
$('cancelBtn').addEventListener('click', resetForm);

$('downloadBtn').addEventListener('click', e => busy(e.currentTarget, async () => {
  const d = readForm().d;
  (await buildInvoice(d)).save(pdfName(d));
  toast('Facture PDF générée');
}, 'Erreur génération PDF'));

$('sendBtn').addEventListener('click', e => busy(e.currentTarget, async () => {
  const d = readForm().d;
  if (!canSend()) return toast('Veuillez patienter avant de renvoyer.');
  if (isDuplicate(d)) return;
  await sendInvoice(d, d.client_email);
  if (commit(d)) toast('Envoyé et enregistré');
}, "Erreur lors de la génération ou de l'envoi."));

cardsList.addEventListener('click', e => {
  const btn = e.target.closest('[data-act]');
  const r = btn && db.rows.find(r => r._id === btn.closest('.card').dataset.id);
  if (!r) return;
  const act = btn.dataset.act;
  if (act === 'edit') startEdit(r._id);
  else if (act === 'delete') deleteRow(r._id);
  else busy(btn, () => cardActions[act](r), 'Erreur génération ou envoi du PDF');
});

sortSel.addEventListener('change', () => { localStorage.setItem(SORT_KEY, sortSel.value); renderList(); });
$('searchInput').addEventListener('input', debounce(renderList, 200));

document.querySelector('.tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) setTab(t.dataset.tab); });
$('menuBtn').addEventListener('click', () => toggleMenu());
document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  toggleMenu(false);
  Promise.resolve(menuActions[b.dataset.action]()).catch(err => { console.error(err); toast("Erreur lors de l'export"); });
});
$('backdrop').addEventListener('click', () => toggleMenu(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape') toggleMenu(false); });

$('profileBtn').addEventListener('click', openAccountDialog);
accountDialog.querySelector('.dialog-close').addEventListener('click', () => accountDialog.close());
accountDialog.addEventListener('click', e => { if (e.target === accountDialog) accountDialog.close(); });

document.addEventListener('click', e => { if (e.target.closest('.open-services-btn')) openServicesDialog(); });
$('addServiceBtn').addEventListener('click', () => { addServiceRow().querySelector('input').focus(); setServicesDirty(true); });
servicesList.addEventListener('click', e => {
  const rm = e.target.closest('.svc-cfg-rm');
  if (!rm) return;
  rm.closest('.service-row').remove();
  setServicesDirty(true);
});
servicesDialog.querySelector('form').addEventListener('input', () => setServicesDirty(true));
servicesDialog.querySelector('.dialog-close').addEventListener('click', () => servicesDialog.close());
servicesDialog.querySelector('.dialog-back').addEventListener('click', () => servicesDialog.close());
servicesDialog.addEventListener('click', e => { if (e.target === servicesDialog) servicesDialog.close(); });
servicesDialog.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const services = [...servicesList.children].map(row => {
    const [label, price] = row.querySelectorAll('input');
    return { label: label.value.trim(), price: round2(price.value), profession: row.querySelector('.svc-cfg-pro').value };
  }).filter(s => s.label);
  db.company.services = services;
  setCompany(db.company);
  saveCompany();
  servicesDialog.close();
  toast('Prestations enregistrées');
});
$('importInput').addEventListener('change', e => { const file = e.target.files[0]; e.target.value = ''; if (file) importFile(file); });

document.addEventListener('change', e => {
  const input = e.target.closest('.account-form [data-field="logo"], .account-form [data-field="stamp"]');
  const file = input?.files[0];
  if (!file) return;
  const form = input.closest('.account-form'), key = input.dataset.field;
  setDirty(form, true);
  const reader = new FileReader();
  reader.onload = () => {
    form.dataset[key] = reader.result;
    if (key === 'logo') setPfpImage(form.querySelector('.company-pfp'), reader.result);
    else Object.assign(form.querySelector('.stamp-preview'), { src: reader.result, hidden: false });
  };
  reader.readAsDataURL(file);
});

document.addEventListener('input', e => {
  const form = e.target.closest('.account-form');
  if (!form || e.target.matches('.iti__search-input')) return;
  setDirty(form, true);
  if (e.target.matches('[data-field="vatRegime"]')) form.querySelector('.vat-rate-field').hidden = e.target.value !== 'taxable';
  if (e.target.closest('.pro-options')) updateProUI(form);
});

document.addEventListener('click', e => { if (e.target.closest('.account-cancel')) fillAccountForm(); });
document.addEventListener('click', e => {
  const btn = e.target.closest('.theme-preset');
  const preset = btn && THEME_PRESETS.find(p => p.id === btn.dataset.presetId);
  if (!preset) return;
  setTheme(preset.id === 'default' ? {} : { id: preset.id, accent: preset.accent, bg: preset.bg, bg2: preset.bg2, text: preset.text });
  document.querySelectorAll('.account-form').forEach(form => setDirty(form, true));
  toast(`Thème « ${preset.label} » appliqué`);
});

document.addEventListener('click', e => {
  const btn = e.target.closest('.account-geoloc');
  if (!btn) return;
  const form = btn.closest('.account-form'), html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Localisation…';
  locateCity()
    .then(({ postalCode, city }) => {
      field(form, 'postalCode').value = postalCode;
      field(form, 'city').value = city;
      setDirty(form, true);
      toast('Ville détectée');
    })
    .catch(err => { console.error(err); alert(err.message || 'Erreur de géolocalisation'); })
    .finally(() => { btn.disabled = false; btn.innerHTML = html; });
});

document.addEventListener('submit', e => {
  const form = e.target.closest('.account-form');
  if (!form) return;
  e.preventDefault();
  if (!form.dataset.stamp && !db.company.stamp) {
    alert('Le tampon est obligatoire.');
    return;
  }
  const get = name => field(form, name).value.trim();
  Object.assign(db.company, {
    name: get('name'), profession: get('profession'),
    addressLines: [get('addressLine1'), get('addressLine2')].filter(Boolean),
    postalCode: get('postalCode'), city: get('city'),
    phone: getPhoneValue(field(form, 'phone')), siret: get('siret'), siren: get('siren'), mailUrl: get('mailUrl'),
    professions: [...form.querySelectorAll('.pro-options input:checked')].map(i => i.value),
    ...Object.fromEntries([...form.querySelectorAll('.pro-fields [data-field]')].map(i => [i.dataset.field, i.value.trim()])),
    vatNumber: get('vatNumber'), vatRegime: get('vatRegime'), vatRate: +get('vatRate') || 0,
    paUrl: get('paUrl'), paKey: get('paKey'),
    ...(form.dataset.logo && { logo: form.dataset.logo }),
    ...(form.dataset.stamp && { stamp: form.dataset.stamp })
  });
  saveCompany();
  renderProfile();
  renderList();
  refresh();
  toast('Modifications enregistrées');
});

$('companyImportInput').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const hasTable = Array.isArray(data.rows);
    if (hasTable && !confirm(`Ce fichier contient ${data.rows.length} facture(s) qui remplaceront la table actuelle. Continuer ?`)) return;
    setCompany(hasTable ? data.company : data);
    if (hasTable) { db.rows = data.rows.filter(Boolean).map(normalize); save(); renderList(); }
    saveCompany();
    renderProfile();
    toast(hasTable ? 'Profil et table importés' : 'Profil importé');
  } catch (err) { console.error(err); toast('Erreur : fichier JSON invalide'); }
});

sortSel.value = localStorage.getItem(SORT_KEY) === 'asc' ? 'asc' : 'desc';
await Promise.all([loadCompany(), loadCatalog(), phoneReady]);
buildProPickers();
renderThemePresets();
renderProfile();
resetForm();
renderList();
setTimeout(() => loadPdfLib().catch(() => {}), 1500);
