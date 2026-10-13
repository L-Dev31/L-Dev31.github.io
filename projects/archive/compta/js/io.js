import { download, loadScript, pad } from './utils.js';

const EXCELJS = 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js';
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const COLS = [
  ['NUMÉRO DE FACTURE', 'invoice_number'],
  ['DATE', 'invoice_date', 'dd/mm/yyyy'],
  ['CLIENT', 'client_name'],
  ['EMAIL', 'client_email'],
  ['PRESTATION', 'service_type'],
  ['PRIX UNITAIRE', 'unit_price', '#,##0.00 €'],
  ['QUANTITÉ', 'quantity', '0'],
  ['MODE DE PAIEMENT', 'payment_method'],
  ['NOTE DE PAIEMENT', 'payment_note'],
  ['MONTANT TOTAL', 'total_amount', '#,##0.00 €']
];

async function excel() {
  await loadScript(EXCELJS);
  return new window.ExcelJS.Workbook();
}

export async function exportXlsx(rows) {
  const flat = rows.map(r => {
    const s = r.services[0] || {};
    return { ...r, service_type: s.service_type || '', unit_price: +s.unit_price || 0, quantity: +s.quantity || 0, total_amount: +r.total_amount || 0 };
  });

  const wb = await excel();
  wb.creator = 'Compta'; wb.created = new Date();
  const ws = wb.addWorksheet('Compta');
  ws.columns = COLS.map(([header, key]) => ({
    header, key,
    width: Math.min(50, Math.max(header.length, ...flat.map(r => String(r[key] ?? '').length)) + 2)
  }));
  flat.forEach(r => {
    const [y, m, d] = String(r.invoice_date || '').split('-').map(Number);
    ws.addRow({ ...r, invoice_date: y && m && d ? new Date(Date.UTC(y, m - 1, d)) : '' });
  });
  COLS.forEach(([, key, fmt]) => { if (fmt) ws.getColumn(key).numFmt = fmt; });

  const side = { style: 'thin', color: { argb: 'FFE6F3EC' } };
  const border = { top: side, left: side, bottom: side, right: side };
  ws.getRow(1).height = 22;
  ws.eachRow((row, n) => row.eachCell({ includeEmpty: true }, cell => {
    cell.border = border;
    if (n === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    } else if (n % 2 === 0) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3FFF3' } };
    }
  }));

  download(new Blob([await wb.xlsx.writeBuffer()], { type: XLSX_TYPE }),
    'compta_' + new Date().toISOString().replace(/[:.]/g, '-') + '.xlsx');
}

function toNum(v) {
  let s = String(v ?? '').replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function toIso(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const p = s.split('/');
  if (p.length === 3) return `${p[2]}-${pad(+p[1])}-${pad(+p[0])}`;
  const d = new Date(s);
  return isNaN(d) ? s : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toRow(raw) {
  const o = Object.fromEntries(COLS.map(([h, k]) => [k, String(raw[h] ?? '').trim()]));
  o.invoice_date = toIso(o.invoice_date);
  o.quantity = parseInt(o.quantity, 10) || 1;
  o.unit_price = toNum(o.unit_price);
  o.total_amount = toNum(o.total_amount) || o.unit_price * o.quantity;
  if (!o.unit_price) o.unit_price = o.total_amount / o.quantity;
  return o;
}

function cellValue(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v && typeof v === 'object') return v.text || v.richText?.map(t => t.text).join('') || v.result || '';
  return v ?? '';
}

export async function parseFile(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    const wb = await excel();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const headers = ws.getRow(1).values.slice(1).map(h => String(cellValue(h)).trim().toUpperCase());
    const out = [];
    ws.eachRow((row, n) => {
      if (n > 1) out.push(toRow(Object.fromEntries(headers.map((h, i) => [h, cellValue(row.getCell(i + 1).value)]))));
    });
    return out;
  }
  const lines = (await file.text()).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const split = l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  const headers = split(lines[0]).map(h => h.toUpperCase());
  return lines.slice(1).map(l => { const c = split(l); return toRow(Object.fromEntries(headers.map((h, i) => [h, c[i]]))); });
}
