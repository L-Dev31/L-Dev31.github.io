#!/usr/bin/env node
// Boucle de vérification Rakoun — détecteur de PARASITES.
//
// Un « parasite » = un token émis dans la langue cible qui n'a pas été traduit :
//   FR→GP : un mot français connu reste tel quel dans la sortie créole.
//   GP→FR : un mot créole connu survit dans la sortie française.
//
// La vérif est OBJECTIVE : pas de traduction « gold » à maintenir à la main.
// Elle interroge les index du moteur (ctx.index_fr / ctx.index_gp) pour savoir
// si un token de sortie appartient encore à la langue source.
//
//   node test/run.cjs           → rapport + code de sortie (0 = aucun parasite dur)
//   node test/run.cjs --unknown → inclut aussi les mots inconnus (trous de dico)

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const { RakounCore } = require(path.join(ROOT, "js", "engine.js"));
const { normalize_token, est_mot } = RakounCore;

const FILES = ["Grammar", "Verbs", "Nouns", "Adjectives", "Adverbs", "Misc"];
const dicts = {};
for (const f of FILES) dicts[f] = JSON.parse(fs.readFileSync(path.join(ROOT, "dict", f + ".json"), "utf8"));

const engine = RakounCore.createEngine(dicts);
const { ctx, rules, classer_fr, trouver_infinitif } = engine;
const R = rules.R;

// Classification AUTORITAIRE d'un mot comme « français » : le moteur sait
// reconnaître les conjugaisons régulières, participes et irréguliers.
function isFrench(tok) {
  const c = classer_fr(tok);
  if (c !== "inconnu") return true;
  return trouver_infinitif(tok) !== null;
}

// ── Vocabulaire grammatical GP (mots produits par la grammaire, hors dico) ────
function collect(...bits) {
  const s = new Set();
  for (const b of bits) {
    if (!b) continue;
    if (b instanceof Set) for (const v of b) s.add(String(v).toLowerCase());
    else if (Array.isArray(b)) for (const v of b) s.add(String(v).toLowerCase());
    else if (typeof b === "object") for (const k in b) { s.add(String(k).toLowerCase()); s.add(String(b[k]).toLowerCase()); }
    else s.add(String(b).toLowerCase());
  }
  return s;
}

const gpGrammar = collect(
  rules.marqueurs, rules.pronoms_gp,
  Object.values(R.pronoms_sujets), R.pronoms_creole_francais,
  R.marqueur_present, R.marqueur_passe, R.marqueur_futur, R.marqueur_futur_proche,
  R.marqueur_negation, R.negation_mots_gp, R.marqueurs_supplementaires,
  Object.values(R.possessifs), R.possessifs_deux_mots, R.demonstratifs, R.particule_demonstrative,
  Object.values(R.interrogatifs), Object.values(R.clitiques_objets), R.clitiques_postposes,
  R.pronoms_objet_gp, Object.values(R.pronoms_toniques || {}), Object.values(R.possessifs_toniques || {}),
  Object.values(R.traductions_fr_gp || {}), Object.keys(R.locutions_gp_fr || {}),
  R.verbes_statifs_gp, R.etre_formes_gp, R.article_indefini_gp, R.poko_formes,
  Object.values(rules.toniques_gp || {}), R.prepositions_toniques, R.eclat_pani,
  Object.keys(R.traductions_gp_fr || {})
);
// petit noyau d'articles/particules/pronoms créoles toujours légitimes
for (const w of ["la", "a", "an", "on", "yo", "sé", "lé", "sa", "sala", "lasa", "tala", "é", "è",
  "ka", "té", "kay", "ké", "pa", "ni", "ba", "bay", "o", "i", "ou", "mwen", "nou", "zot", "li",
  "kon", "pou", "adan", "asou", "anba", "èvè", "épi", "dèpi", "avan", "apré", "vè", "dèyè", "douvan"])
  gpGrammar.add(w);

// index GP/FR connu (clés du dico). On indexe aussi chaque MOT d'une forme
// multi-mots (ex. gp "ti bébé" ⇒ "ti" et "bébé" sont des mots GP légitimes),
// sinon le 2e mot d'une traduction correcte serait un faux parasite.
function vocab(index) {
  const s = new Set();
  for (const k of Object.keys(index)) {
    const l = k.toLowerCase();
    s.add(l);
    if (l.includes(" ")) for (const p of l.split(/\s+/)) if (p) s.add(p);
  }
  return s;
}
const gpKnown = vocab(ctx.index_gp);
const frKnown = vocab(ctx.index_fr);

// Mots grammaticaux français (déterminants, pronoms, prépositions, négation…) :
// légitimes en sortie FR, à ne PAS confondre avec un résidu créole.
const frGrammar = collect(
  Object.keys(R.pronoms_sujets), Object.keys(R.possessifs), Object.keys(R.interrogatifs),
  Object.keys(R.clitiques_objets), Object.keys(R.pronoms_toniques || {}),
  R.negation_ne, R.negation_pas, R.articles_supprimes, Object.keys(R.elision || {}),
  R.determinants_feminins, R.determinants_masculins, Object.keys(R.determinants_genre || {}),
  rules.determinants_fr, rules.mots_fonctionnels_fr, rules.pronoms_fr, rules.pronoms_sujet_fr,
  rules.articles_definis_fr, rules.clitiques_objet_fr, rules.prepositions_contexte, rules.stop_np,
  rules.coordinateurs, rules.mots_negatifs_fr, rules.adverbes_quantite_fr, rules.intensifieurs_fr,
  rules.nombres_fr, rules.prepositions_locatives
);
for (const w of ["le","la","les","un","une","des","de","du","d","l","à","au","aux","en","et","ou","mais",
  "je","tu","il","elle","on","nous","vous","ils","elles","ce","cet","cette","ces","c","ça","cela",
  "son","sa","ses","mon","ma","mes","ton","ta","tes","notre","nos","votre","vos","leur","leurs",
  "qui","que","quoi","dont","où","ne","pas","plus","jamais","rien","y","se","s","me","te","lui",
  "n","qu","est","sont","être","avoir"]) frGrammar.add(w);
const frOk = (l) => frKnown.has(l) || frGrammar.has(l) || frKnown.has(normalize_token(l));

// ── Découpage / nettoyage ─────────────────────────────────────────────────────
function words(text) {
  return text.split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}'’-]+|[^\p{L}\p{N}'’-]+$/gu, "")).filter(Boolean);
}
function isProper(tok, sourceTokens) {
  return /^\p{Lu}/u.test(tok) && sourceTokens.has(tok.toLowerCase());
}
function knownGP(tok) {
  const l = tok.toLowerCase();
  if (gpKnown.has(l) || gpGrammar.has(l) || gpKnown.has(normalize_token(l))) return true;
  // Possessifs/clitiques attachés créoles : an-mwen, a-y, a-yo, a-w, an-nou…
  if (/^(an|a)-\w+$/.test(l)) return true;
  // Token à trait d'union dont chaque partie est un mot GP connu (ex. pié-mango).
  if (l.includes("-")) {
    const parts = l.split("-").filter(Boolean);
    if (parts.length && parts.every((p) => gpKnown.has(p) || gpGrammar.has(p) || gpKnown.has(normalize_token(p)))) return true;
  }
  return false;
}

// Un mot est-il « encore créole » ? (sens GP→FR : parasite = créole survivant)
function stillCreole(tok) {
  const l = tok.toLowerCase();
  return (gpKnown.has(l) || gpKnown.has(normalize_token(l))) && !frOk(l);
}

// FR→GP : parasite = un token de la sortie créole qui n'est PAS un mot créole
// légitime (knownGP) alors qu'il est soit reconnu français, soit recopié tel
// quel depuis la phrase source (résidu non traduit, indépendant du dico).
//   residue = français avéré (bug de logique ou trou de dico traduisible)
//   unknown = recopié de la source mais non classé (à vérifier)
function analyseFrGp(src, out) {
  const source = new Set(words(src).map((w) => w.toLowerCase()));
  const residue = [], unknown = [];
  for (const w of words(out)) {
    if (!est_mot(w) || /^\d+$/.test(w)) continue;
    if (isProper(w, source)) continue;
    if (knownGP(w)) continue;
    const l = w.toLowerCase();
    if (isFrench(w)) residue.push(w);
    else if (source.has(l) || source.has(normalize_token(l))) unknown.push(w);
  }
  return { residue, unknown };
}

// GP→FR : parasite = un token de la sortie française qui n'est PAS français
// légitime alors qu'il est soit créole connu, soit recopié depuis la source.
function analyseGpFr(src, out) {
  const source = new Set(words(src).map((w) => w.toLowerCase()));
  const residue = [], unknown = [];
  for (const w of words(out)) {
    if (!est_mot(w) || /^\d+$/.test(w)) continue;
    if (isProper(w, source)) continue;
    const l = w.toLowerCase();
    if (isFrench(w) || frOk(l)) continue; // français OK
    if (stillCreole(w)) residue.push(w);
    else if (source.has(l) || source.has(normalize_token(l))) unknown.push(w);
  }
  return { residue, unknown };
}

// ── Exécution ─────────────────────────────────────────────────────────────────
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "corpus.json"), "utf8"));

let nResidue = 0, nUnknown = 0, nphr = 0;
const report = [];

function runDir(list, srcLang, tgtLang, analyse) {
  for (const src of list) {
    nphr++;
    const out = engine.traduire(src, srcLang, tgtLang);
    const { residue, unknown } = analyse(src, out);
    nResidue += residue.length;
    nUnknown += unknown.length;
    if (residue.length || unknown.length) report.push({ src, out, residue, unknown });
  }
}

console.log("=".repeat(72));
console.log("RAKOUN — boucle de vérification (détection de parasites)");
console.log("=".repeat(72));

runDir(corpus.fr_gp, "fr", "gp", analyseFrGp);
runDir(corpus.gp_fr, "gp", "fr", analyseGpFr);

for (const r of report) {
  console.log("\n  IN : " + r.src);
  console.log("  OUT: " + r.out);
  if (r.residue.length) console.log("  ⛔ RÉSIDU (mot langue-source connu, non traduit): " + r.residue.join(", "));
  if (r.unknown.length) console.log("  ❔ NON TRADUIT (recopié de la source, hors dico) : " + r.unknown.join(", "));
}

const total = nResidue + nUnknown;
console.log("\n" + "=".repeat(72));
console.log(`Phrases: ${nphr} | Parasites: ${total}  (résidus: ${nResidue}, hors-dico: ${nUnknown})`);
console.log("=".repeat(72));
if (total === 0) console.log("✅ AUCUN parasite — chaque mot de sortie appartient à la langue cible.");
else console.log(`❌ ${total} parasite(s) — mot(s) source laissé(s) dans la sortie.`);

process.exit(total === 0 ? 0 : 1);
