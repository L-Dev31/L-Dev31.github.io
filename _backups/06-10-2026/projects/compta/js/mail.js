import { db } from './store.js';
import { buildInvoice } from './pdf.js';

const COOLDOWN_MS = 5000;
let lastSent = 0;

export const hasMailUrl = () => !!db.company.mailUrl?.trim();
export const canSend = () => Date.now() - lastSent >= COOLDOWN_MS;

export async function sendInvoice(d, email) {
  const url = db.company.mailUrl?.trim();
  if (!url) throw new Error("Aucune adresse d'envoi configurée (Compte → URL d'envoi).");
  const invoice = await buildInvoice(d);
  await fetch(url, {
    method: 'POST', mode: 'no-cors', cache: 'no-cache',
    body: JSON.stringify({
      email,
      pdf: invoice.dataUri(),
      subject: `Votre facture N° ${d.invoice_number}`,
      message: `Bonjour ${d.client_name || ''},\n\nVeuillez trouver votre facture n° ${d.invoice_number} en pièce jointe.\n\nCordialement,`,
      footer: '<small style="color:#777;font-size:10px">Mail envoyé par Axonis — Léo Tosku</small>'
    })
  });
  lastSent = Date.now();
}
