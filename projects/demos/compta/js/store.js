import { round2, titleCase, uid } from './utils.js';

const KEY = 'compta_rows';
const COMPANY_KEY = 'compta_company';
export const db = { rows: [], company: {}, services: [] };

export const normalize = r => ({
  ...r,
  _id: r._id || uid(),
  client_name: titleCase(r.client_name),
  services: r.services?.length ? r.services : [{
    service_type: r.service_type || '',
    unit_price: +r.unit_price || 0,
    quantity: +r.quantity || 1,
    total_amount: +r.total_amount || 0
  }]
});

try { db.rows = (JSON.parse(localStorage.getItem(KEY)) || []).filter(Boolean).map(normalize); }
catch (e) { console.error('localStorage load failed:', e); }

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db.rows)); }
  catch (e) { console.error('save failed:', e); }
}

export function setCompany(data) {
  db.company = (data && typeof data === 'object') ? data : {};
  db.services = (db.company.services || [])
    .map(s => typeof s === 'string' ? { label: s.trim(), price: 0 } : { label: String(s?.label || '').trim(), price: +s?.price || 0, profession: s?.profession || '' })
    .filter(s => s.label);
}

export function saveCompany() {
  try { localStorage.setItem(COMPANY_KEY, JSON.stringify(db.company)); }
  catch (e) { console.error('saveCompany failed:', e); }
}

export async function loadCompany() {
  try {
    const cached = JSON.parse(localStorage.getItem(COMPANY_KEY));
    if (cached && typeof cached === 'object') return setCompany(cached);
  } catch (e) { console.error('company cache load failed:', e); }
  try {
    const r = await fetch('company.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    setCompany(await r.json());
    saveCompany();
  } catch (e) { console.error('company.json:', e); }
}

export function nextInvoice(year = new Date().getFullYear()) {
  const re = new RegExp(`^${year}-(\\d+)$`);
  let max = 0;
  for (const r of db.rows) { const m = re.exec(r.invoice_number); if (m) max = Math.max(max, +m[1]); }
  return `${year}-${max + 1}`;
}

const invKey = inv => { const m = /^(\d{4})-(\d+)$/.exec(String(inv || '').trim()); return m && [+m[1], +m[2]]; };
export function compareInvoices(a, b) {
  const x = invKey(a.invoice_number), y = invKey(b.invoice_number);
  if (x && y) return x[0] - y[0] || x[1] - y[1];
  return x ? -1 : y ? 1 : String(a.invoice_number || '').localeCompare(String(b.invoice_number || ''));
}

export const catalog = { exemptions: {}, fields: {}, professions: [] };

export async function loadCatalog() {
  try { Object.assign(catalog, await (await fetch('data/professions.json')).json()); }
  catch (e) { console.error('professions.json:', e); }
}

export const professionsOf = (c = db.company) =>
  (c.professions || []).map(id => catalog.professions.find(p => p.id === id)).filter(Boolean);

export function fieldsOf(c = db.company) {
  const keys = new Set(professionsOf(c).flatMap(p => p.fields));
  return Object.keys(catalog.fields).filter(k => keys.has(k));
}

export function vatFor(serviceLabel, c = db.company) {
  const pros = professionsOf(c);
  const linked = (c.services || []).find(s => s?.label === serviceLabel)?.profession;
  const pro = pros.find(p => p.id === linked) || pros[0];
  const exemption = pro?.exemption && catalog.exemptions[pro.exemption];
  if (exemption) return { rate: 0, category: 'E', code: exemption.vatex, mention: `Exonération de TVA, ${exemption.article}` };
  if (c.vatRegime === 'taxable') return { rate: +c.vatRate || 20, category: 'S', code: '', mention: '' };
  return { rate: 0, category: 'E', code: 'VATEX-FR-FRANCHISE', mention: `TVA non applicable, ${pro?.franchiseArticle || 'art. 293 B du CGI'}` };
}

export function taxSummary(services, c = db.company) {
  const groups = new Map();
  for (const s of services) {
    const vat = vatFor(s.service_type, c), key = `${vat.category}|${vat.rate}`;
    const g = groups.get(key) || { ...vat, base: 0, mentions: [], codes: [] };
    g.base = round2(g.base + (+s.unit_price || 0) * (+s.quantity || 0));
    if (vat.mention && !g.mentions.includes(vat.mention)) g.mentions.push(vat.mention);
    if (vat.code && !g.codes.includes(vat.code)) g.codes.push(vat.code);
    groups.set(key, g);
  }
  const list = [...groups.values()].map(g => ({ ...g, amount: round2(g.base * g.rate / 100), code: g.codes[0] || '' }));
  const ht = round2(list.reduce((sum, g) => sum + g.base, 0));
  const tva = round2(list.reduce((sum, g) => sum + g.amount, 0));
  return { groups: list, ht, tva, ttc: round2(ht + tva), mentions: list.flatMap(g => g.mentions) };
}

export const sirenOf = c => String(c.siren || c.siret || '').replace(/\s/g, '').slice(0, 9);

export function serviceOptions() {
  const map = new Map(db.services.map(s => [s.label, s.price]));
  for (const r of db.rows) for (const s of r.services) {
    const label = s.service_type?.trim();
    if (label && !map.has(label)) map.set(label, +s.unit_price || 0);
  }
  return map;
}
