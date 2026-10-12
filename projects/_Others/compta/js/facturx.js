import { sirenOf, taxSummary, vatFor } from './store.js';
import { loadScript, round2 } from './utils.js';

const PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
const SRGB_ICC = 'https://cdn.jsdelivr.net/gh/saucecontrol/Compact-ICC-Profiles@master/profiles/sRGB-v2-micro.icc';
const FX_NS = 'urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#';

const PAYMENT_CODES = { 'Espèces': '10', 'Chèque': '20', 'Carte bancaire': '48', 'SumUp': '48' };
const B2B_NOTES = [
  ['PMD', 'Pénalités de retard : trois fois le taux d\'intérêt légal.'],
  ['PMT', 'Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.'],
  ['AAB', 'Pas d\'escompte pour paiement anticipé.']
];

const esc = s => String(s ?? '').replace(/[<>&"']/g, ch => `&#${ch.charCodeAt(0)};`);
const amt = n => (+n || 0).toFixed(2);
const day = iso => String(iso || '').replace(/-/g, '');
const tag = (name, value, attrs = '') => value === '' || value == null ? '' : `<ram:${name}${attrs}>${esc(value)}</ram:${name}>`;

function address(line1, line2, postcode, city) {
  return `<ram:PostalTradeAddress>${tag('PostcodeCode', postcode)}${tag('LineOne', line1)}${tag('LineTwo', line2)}${tag('CityName', city)}<ram:CountryID>FR</ram:CountryID></ram:PostalTradeAddress>`;
}

export function buildCII(d, c) {
  const siren = sirenOf(c), b2b = d.client_type === 'b2b';
  const lines = d.services.map((s, i) => ({ ...s, vat: vatFor(s.service_type, c), total: round2((+s.unit_price || 0) * (+s.quantity || 0)), n: i + 1 }));
  const { groups, ht, tva, ttc } = taxSummary(d.services, c);
  const headerTaxes = groups.map(g => `<ram:ApplicableTradeTax><ram:CalculatedAmount>${amt(g.amount)}</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode>${tag('ExemptionReason', g.mentions.join(' ; '))}<ram:BasisAmount>${amt(g.base)}</ram:BasisAmount><ram:CategoryCode>${g.category}</ram:CategoryCode>${g.code ? `<ram:ExemptionReasonCode>${g.code}</ram:ExemptionReasonCode>` : ''}<ram:RateApplicablePercent>${amt(g.rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>`).join('\n');
  const taxRegistration = c.vatNumber
    ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(c.vatNumber.replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>`
    : `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(siren)}</ram:ID></ram:SpecifiedTaxRegistration>`;
  const paymentCode = PAYMENT_CODES[d.payment_method] || 'ZZZ';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
<rsm:ExchangedDocumentContext>
<ram:BusinessProcessSpecifiedDocumentContextParameter><ram:ID>S1</ram:ID></ram:BusinessProcessSpecifiedDocumentContextParameter>
<ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
</rsm:ExchangedDocumentContext>
<rsm:ExchangedDocument>
<ram:ID>${esc(d.invoice_number)}</ram:ID>
<ram:TypeCode>380</ram:TypeCode>
<ram:IssueDateTime><udt:DateTimeString format="102">${day(d.invoice_date)}</udt:DateTimeString></ram:IssueDateTime>
${b2b ? B2B_NOTES.map(([code, text]) => `<ram:IncludedNote><ram:Content>${esc(text)}</ram:Content><ram:SubjectCode>${code}</ram:SubjectCode></ram:IncludedNote>`).join('\n') : ''}
</rsm:ExchangedDocument>
<rsm:SupplyChainTradeTransaction>
${lines.map(l => `<ram:IncludedSupplyChainTradeLineItem>
<ram:AssociatedDocumentLineDocument><ram:LineID>${l.n}</ram:LineID></ram:AssociatedDocumentLineDocument>
<ram:SpecifiedTradeProduct><ram:Name>${esc(l.service_type || 'Prestation')}</ram:Name></ram:SpecifiedTradeProduct>
<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>${amt(l.unit_price)}</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
<ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${+l.quantity || 0}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
<ram:SpecifiedLineTradeSettlement>
<ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${l.vat.category}</ram:CategoryCode><ram:RateApplicablePercent>${amt(l.vat.rate)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
<ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${amt(l.total)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
</ram:SpecifiedLineTradeSettlement>
</ram:IncludedSupplyChainTradeLineItem>`).join('\n')}
<ram:ApplicableHeaderTradeAgreement>
<ram:SellerTradeParty>
<ram:Name>${esc(c.name)}</ram:Name>
<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(siren)}</ram:ID></ram:SpecifiedLegalOrganization>
${address(c.addressLines?.[0], c.addressLines?.[1], c.postalCode, c.city)}
<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${esc(siren)}</ram:URIID></ram:URIUniversalCommunication>
${taxRegistration}
</ram:SellerTradeParty>
<ram:BuyerTradeParty>
<ram:Name>${esc(d.client_name)}</ram:Name>
${b2b ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(d.client_siren)}</ram:ID></ram:SpecifiedLegalOrganization>` : ''}
${address(d.client_address, '', d.client_postal_code, d.client_city)}
${b2b ? `<ram:URIUniversalCommunication><ram:URIID schemeID="0225">${esc(d.client_siren)}</ram:URIID></ram:URIUniversalCommunication>` : ''}
</ram:BuyerTradeParty>
</ram:ApplicableHeaderTradeAgreement>
<ram:ApplicableHeaderTradeDelivery>
<ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${day(d.invoice_date)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
</ram:ApplicableHeaderTradeDelivery>
<ram:ApplicableHeaderTradeSettlement>
<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>${paymentCode}</ram:TypeCode>${tag('Information', d.payment_method)}</ram:SpecifiedTradeSettlementPaymentMeans>
${headerTaxes}
<ram:SpecifiedTradeSettlementHeaderMonetarySummation>
<ram:LineTotalAmount>${amt(ht)}</ram:LineTotalAmount>
<ram:TaxBasisTotalAmount>${amt(ht)}</ram:TaxBasisTotalAmount>
<ram:TaxTotalAmount currencyID="EUR">${amt(tva)}</ram:TaxTotalAmount>
<ram:GrandTotalAmount>${amt(ttc)}</ram:GrandTotalAmount>
<ram:TotalPrepaidAmount>${amt(ttc)}</ram:TotalPrepaidAmount>
<ram:DuePayableAmount>0.00</ram:DuePayableAmount>
</ram:SpecifiedTradeSettlementHeaderMonetarySummation>
</ram:ApplicableHeaderTradeSettlement>
</rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`.replace(/\n{2,}/g, '\n');
}

const xmpDate = d => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

function xmp({ title, author, date }) {
  const prop = (name, description) => `<rdf:li rdf:parseType="Resource"><pdfaProperty:name>${name}</pdfaProperty:name><pdfaProperty:valueType>Text</pdfaProperty:valueType><pdfaProperty:category>external</pdfaProperty:category><pdfaProperty:description>${description}</pdfaProperty:description></rdf:li>`;
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"><pdfaid:part>3</pdfaid:part><pdfaid:conformance>B</pdfaid:conformance></rdf:Description>
<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:format>application/pdf</dc:format><dc:title><rdf:Alt><rdf:li xml:lang="x-default">${esc(title)}</rdf:li></rdf:Alt></dc:title><dc:creator><rdf:Seq><rdf:li>${esc(author)}</rdf:li></rdf:Seq></dc:creator></rdf:Description>
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>Axonis</xmp:CreatorTool><xmp:CreateDate>${xmpDate(date)}</xmp:CreateDate><xmp:ModifyDate>${xmpDate(date)}</xmp:ModifyDate></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/"><pdf:Producer>Axonis</pdf:Producer></rdf:Description>
<rdf:Description rdf:about="" xmlns:fx="${FX_NS}"><fx:DocumentType>INVOICE</fx:DocumentType><fx:DocumentFileName>factur-x.xml</fx:DocumentFileName><fx:Version>1.0</fx:Version><fx:ConformanceLevel>EN 16931</fx:ConformanceLevel></rdf:Description>
<rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#"><pdfaExtension:schemas><rdf:Bag><rdf:li rdf:parseType="Resource">
<pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema><pdfaSchema:namespaceURI>${FX_NS}</pdfaSchema:namespaceURI><pdfaSchema:prefix>fx</pdfaSchema:prefix>
<pdfaSchema:property><rdf:Seq>${prop('DocumentFileName', 'The name of the embedded XML document')}${prop('DocumentType', 'The type of the hybrid document in capital letters, e.g. INVOICE or ORDER')}${prop('Version', 'The actual version of the standard applying to the embedded XML document')}${prop('ConformanceLevel', 'The conformance level of the embedded XML document')}</rdf:Seq></pdfaSchema:property>
</rdf:li></rdf:Bag></pdfaExtension:schemas></rdf:Description>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`;
}

let icc;
export async function toFacturX(pdfBytes, xml, { title, author }) {
  await loadScript(PDF_LIB);
  icc ??= fetch(SRGB_ICC).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('Profil sRGB indisponible')));
  const iccBytes = new Uint8Array(await icc);
  const { PDFDocument, PDFName, PDFString, PDFHexString } = window.PDFLib;
  const pdf = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const ctx = pdf.context, date = new Date(), enc = new TextEncoder();
  const xmlBytes = enc.encode(xml);

  const xmlRef = ctx.register(ctx.stream(xmlBytes, {
    Type: 'EmbeddedFile', Subtype: 'text/xml',
    Params: { ModDate: PDFString.fromDate(date), Size: xmlBytes.length }
  }));
  const fileSpec = ctx.register(ctx.obj({
    Type: 'Filespec', F: PDFString.of('factur-x.xml'), UF: PDFHexString.fromText('factur-x.xml'),
    EF: { F: xmlRef, UF: xmlRef }, Desc: PDFString.of('Factur-X'), AFRelationship: 'Alternative'
  }));
  pdf.catalog.set(PDFName.of('Names'), ctx.obj({ EmbeddedFiles: { Names: [PDFString.of('factur-x.xml'), fileSpec] } }));
  pdf.catalog.set(PDFName.of('AF'), ctx.obj([fileSpec]));

  const metadata = enc.encode(xmp({ title, author, date }));
  pdf.catalog.set(PDFName.of('Metadata'), ctx.register(ctx.stream(metadata, { Type: 'Metadata', Subtype: 'XML', Length: metadata.length })));

  const profile = ctx.register(ctx.stream(iccBytes, { N: 3, Length: iccBytes.length }));
  pdf.catalog.set(PDFName.of('OutputIntents'), ctx.obj([ctx.obj({
    Type: 'OutputIntent', S: 'GTS_PDFA1', OutputConditionIdentifier: PDFString.of('sRGB'),
    Info: PDFString.of('sRGB IEC61966-2.1'), DestOutputProfile: profile
  })]));

  pdf.setTitle(title, { showInWindowTitleBar: true });
  pdf.setAuthor(author);
  pdf.setCreator('Axonis');
  pdf.setProducer('Axonis');
  pdf.setCreationDate(date);
  pdf.setModificationDate(date);

  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(id), PDFHexString.of(id)]);

  return pdf.save({ useObjectStreams: false });
}
