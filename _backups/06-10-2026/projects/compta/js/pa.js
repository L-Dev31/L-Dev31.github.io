import { db, sirenOf, taxSummary } from './store.js';
import { buildInvoice, pdfName } from './pdf.js';

export const hasPaUrl = () => !!db.company.paUrl?.trim();

export async function sendToPA(d) {
  const c = db.company, url = c.paUrl?.trim(), siren = sirenOf(c), b2b = d.client_type === 'b2b';
  if (!url) throw new Error('Aucune passerelle de plateforme agréée configurée (Compte → URL de la passerelle PA).');
  if (!/^\d{9}$/.test(siren)) throw new Error("SIREN ou SIRET de l'entreprise manquant (Compte).");
  if (taxSummary(d.services, c).groups.some(g => g.category === 'S') && !c.vatNumber) throw new Error('N° de TVA intracommunautaire manquant (Compte).');
  if (b2b && !/^\d{9}$/.test(d.client_siren || '')) throw new Error('SIREN du client invalide (9 chiffres).');

  const invoice = await buildInvoice(d);
  const res = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      key: c.paKey || '',
      invoiceNumber: d.invoice_number,
      fileName: pdfName(d),
      b2b,
      vatRegime: c.vatRegime || 'franchise',
      sellerSiren: siren,
      buyerSiren: b2b ? d.client_siren : '',
      pdf: invoice.dataUri().split(',')[1]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `La plateforme a refusé la facture (HTTP ${res.status}).`);
  return data;
}
