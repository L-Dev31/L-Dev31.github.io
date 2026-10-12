import { catalog, db, fieldsOf, sirenOf, taxSummary } from './store.js';
import { download, fmtDate, fmtPrice, isoDate, loadImage, loadScript } from './utils.js';
import { buildCII, toFacturX } from './facturx.js';
import { contrastRatio, ensureContrast, hexToRgb, mixHex, resolveTheme } from './color.js';

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/';
const FONT = 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-';
const B2B_MENTION = 'Pénalités de retard : trois fois le taux d\'intérêt légal. Indemnité forfaitaire pour frais de recouvrement : 40 €. Pas d\'escompte pour paiement anticipé.';

const THEME_DEFAULTS = { accent: '#0f766e', bg: '#faf9f6', bg2: '#f3faf4', text: '#0D0C22' };

export async function loadPdfLib() {
  await loadScript(CDN + 'jspdf/2.5.1/jspdf.umd.min.js');
  await loadScript(CDN + 'jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js');
  return window.jspdf.jsPDF;
}

export const pdfName = d => `facture_${String(d.invoice_number || 'facture').replace(/[^\w.-]/g, '_')}.pdf`;

const toBase64 = bytes => {
  const b = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

let fonts;
function loadFonts() {
  fonts ??= Promise.all(['400', '700'].map(w => fetch(`${FONT}${w}-normal.ttf`).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('Police indisponible')))))
    .then(files => files.map(toBase64))
    .catch(e => { fonts = null; throw e; });
  return fonts;
}

export async function buildInvoice(d) {
  const [jsPDF, [regular, bold], logo, stamp, axonis] = await Promise.all([
    loadPdfLib(), loadFonts(), loadImage(db.company.logo), loadImage(db.company.stamp), loadImage('images/axonis.png')
  ]);
  const c = db.company, b2b = d.client_type === 'b2b', doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const { bg2, accent, text: textColor } = resolveTheme(c.theme, THEME_DEFAULTS);
  const rowTintRgb = hexToRgb(bg2);
  const mutedColor = mixHex(textColor, '#ffffff', 0.55);
  const rowTextColor = contrastRatio(textColor, bg2) >= 4.5 ? textColor : ensureContrast(textColor, bg2, 4.5);
  doc.addFileToVFS('Inter-Regular.ttf', regular);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal');
  doc.addFileToVFS('Inter-Bold.ttf', bold);
  doc.addFont('Inter-Bold.ttf', 'Inter', 'bold');

  const L = 40, W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const date = fmtDate(d.invoice_date || isoDate());
  const payment = d.payment_method + (d.payment_note ? ' • ' + d.payment_note : '');
  const siren = sirenOf(c);
  const address = [...(c.addressLines || []), [c.postalCode, c.city].filter(Boolean).join(' ')].filter(Boolean);
  const proField = (key, place) => {
    const template = catalog.fields[key]?.[place];
    return template && c[key] ? template.replace('{v}', c[key]) : '';
  };
  const legalFields = fieldsOf(c);
  const contact = [
    c.phone && 'Tél : ' + c.phone,
    c.siret && 'N° SIRET : ' + c.siret,
    !c.siret && siren && 'N° SIREN : ' + siren,
    c.vatNumber && 'N° TVA : ' + c.vatNumber,
    ...legalFields.map(k => proField(k, 'header'))
  ].filter(Boolean);
  const info = [...address, '', ...contact];
  const clientAddress = [d.client_address, [d.client_postal_code, d.client_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const { groups, ht, ttc, mentions } = taxSummary(d.services, c);
  const taxed = groups.some(g => g.rate);
  const unit = taxed ? ' HT' : '';
  const footer = [...mentions, ...legalFields.map(k => proField(k, 'footer')), b2b && B2B_MENTION].filter(Boolean);

  const text = (s, x, y, size, color, isBold, opts) =>
    doc.setFont('Inter', isBold ? 'bold' : 'normal').setFontSize(size).setTextColor(color).text(s, x, y, opts);
  const image = (im, x, y, w, h) =>
    doc.addImage(im.data, im.data.startsWith('data:image/png') ? 'PNG' : 'JPEG', x, y, w, h, im.alias);
  const fit = (im, max) => { const k = Math.min(1, max[0] / im.w, max[1] / im.h); return [im.w * k, im.h * k]; };

  d.services.forEach((s, i) => {
    if (i) doc.addPage();

    let x = L, bottom = 40;
    if (logo) {
      const [w, h] = fit(logo, [200, 120]);
      image(logo, L, 40, w, h);
      x += w + 18; bottom += h;
    }
    text(c.name || '—', x, 42, 16, textColor, true);
    text(c.profession || '—', x, 60, 11, accent);
    doc.setFont('Inter', 'normal').setFontSize(10).setTextColor(mutedColor);
    info.forEach((line, k) => doc.text(line, x, 78 + 12 * k));
    const top = Math.max(Math.max(bottom, 78 + 12 * info.length) + 118, 360);

    text("Note d'honoraires", W / 2, top - 36, 14, textColor, true, { align: 'center' });
    text('Facture N° ' + (d.invoice_number || '—'), W / 2, top - 22, 11, accent, false, { align: 'center' });
    doc.setTextColor(textColor);

    doc.autoTable({
      startY: top,
      body: [
        [b2b ? 'Client' : 'Nom Prénom', d.client_name || '—'],
        ...(b2b ? [['SIREN client', d.client_siren || '—']] : []),
        ...(clientAddress ? [['Adresse', clientAddress]] : []),
        ['Date', date],
        ['Nature', 'Prestation de services'],
        ['Prestation', s.service_type || '—'],
        ['Prix unitaire' + unit, fmtPrice(s.unit_price)],
        ['Quantité', String(s.quantity ?? 1)],
        ['Mode de règlement', payment],
        ['Total prestation' + unit, fmtPrice((+s.unit_price || 0) * (+s.quantity || 0))],
        ...(taxed
          ? [['Total HT', fmtPrice(ht)], ...groups.filter(g => g.rate).map(g => [`TVA ${g.rate} %`, fmtPrice(g.amount)]), ['Total TTC', fmtPrice(ttc)]]
          : [['Total facture', fmtPrice(ttc)]])
      ],
      theme: 'grid',
      styles: { halign: 'left', valign: 'middle', font: 'Inter', fontSize: 12, textColor },
      columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: W - L * 2 - 140 } },
      tableLineColor: hexToRgb(accent), tableLineWidth: 0.6,
      didParseCell: ({ section, row, cell }) => {
        if (section !== 'body') return;
        const tinted = row.index % 2 === 1;
        cell.styles.fillColor = tinted ? rowTintRgb : [255, 255, 255];
        if (tinted) cell.styles.textColor = rowTextColor;
      }
    });

    const after = doc.lastAutoTable?.finalY ?? top + 160;
    let stampWidth = 0;
    if (stamp) {
      const [w, h] = fit(stamp, [120, 120]);
      image(stamp, W - L - w, after + 20, w, h);
      stampWidth = w + 16;
    }
    const mentionsWidth = W - L * 2 - stampWidth;
    doc.setFont('Inter', 'normal').setFontSize(10).setTextColor(mutedColor).text(`Fait à ${c.city || '—'} le ${date}`, L, after + 40);
    let y = after + 56;
    for (const mention of footer) {
      const wrapped = doc.setFontSize(9).splitTextToSize(mention, mentionsWidth);
      doc.text(wrapped, L, y);
      y += wrapped.length * 11 + 4;
    }

    if (axonis) {
      const credit = 'Facture générée avec', cy = H - 36, iw = 32, ih = Math.round(iw * axonis.h / axonis.w);
      doc.setFont('Inter', 'normal').setFontSize(8).setTextColor(textColor);
      const tw = doc.getTextWidth(credit), cx = Math.round(W / 2 - (tw + iw + 4) / 2);
      doc.text(credit, cx, cy);
      image(axonis, cx + tw + 4, cy - ih / 2 - 2, iw, ih);
    }
  });

  const bytes = await toFacturX(new Uint8Array(doc.output('arraybuffer')), buildCII(d, c), {
    title: `Facture ${d.invoice_number || ''}`.trim(), author: c.name || ''
  });
  return {
    bytes,
    save: name => download(new Blob([bytes], { type: 'application/pdf' }), name),
    dataUri: () => 'data:application/pdf;base64,' + toBase64(bytes)
  };
}
