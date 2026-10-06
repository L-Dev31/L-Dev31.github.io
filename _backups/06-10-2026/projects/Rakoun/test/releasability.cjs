#!/usr/bin/env node
// ============================================================================
// Rakoun — INDICE DE RELEASABILITY + boucle d'action.
//
// Objectif : donner un chiffre unique, reproductible, qui dit si le traducteur
// est « bon à publier » — et une boucle mesure → répare → re-mesure pour l'y
// amener SANS jamais injecter de traduction inventée.
//
// L'indice (0–100) combine trois propriétés, chacune vérifiée objectivement en
// interrogeant les index du moteur (aucune traduction « gold » à maintenir) :
//
//   • COUVERTURE  (poids 0.55) — part des mots de contenu effectivement rendus
//                  dans la langue cible (dico + grammaire), hors noms propres.
//   • CORRECTION  (poids 0.30) — part des mots rendus qui ne sont PAS un résidu
//                  de la langue source (un mot source CONNU laissé tel quel = bug).
//   • ROBUSTESSE  (poids 0.15) — le corpus curé reste à 0 parasite (non-régression)
//                  et aucun plantage.
//
// PORTES DURES (bloquent la publication quel que soit le score) :
//   corpus curé == 0 parasite   ET   0 résidu logique sur le monde réel.
//
// SEUIL MINIMUM RELEASABLE :  indice >= 90  ET  portes dures OK.
//
// Usage :
//   node test/releasability.cjs               → score + verdict
//   node test/releasability.cjs --context     → montre une phrase par trou
//   node test/releasability.cjs --batch 40    → exporte les 40 trous les plus
//                                               fréquents en JSON prêt à remplir
//                                               (dict/_candidates.todo.json)
//   node test/releasability.cjs --json         → sortie machine (CI)
// ============================================================================
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

// ── Vocabulaires (repris tels quels de la logique validée de run.cjs) ─────────
function vocab(index) {
  const s = new Set();
  for (const k of Object.keys(index)) { const l = k.toLowerCase(); s.add(l); if (l.includes(" ")) for (const p of l.split(/\s+/)) if (p) s.add(p); }
  return s;
}
const gpKnown = vocab(ctx.index_gp);
const frKnown = vocab(ctx.index_fr);
function collect(...bits) { const s = new Set(); for (const b of bits) { if (!b) continue; if (b instanceof Set || Array.isArray(b)) for (const v of b) s.add(String(v).toLowerCase()); else if (typeof b === "object") for (const k in b) { s.add(String(k).toLowerCase()); s.add(String(b[k]).toLowerCase()); } else s.add(String(b).toLowerCase()); } return s; }
const gpGrammar = collect(rules.marqueurs, rules.pronoms_gp, Object.values(R.pronoms_sujets), R.pronoms_creole_francais,
  Object.values(R.possessifs), R.demonstratifs, R.particule_demonstrative, Object.values(R.interrogatifs),
  Object.values(R.clitiques_objets), R.clitiques_postposes, R.pronoms_objet_gp, Object.values(R.traductions_fr_gp || {}));
for (const w of ["la","a","an","on","yo","sé","lé","sa","lasa","é","è","ka","té","kay","ké","pa","ni","ba","o","i","ou","mwen","nou","zot","li","kon","pou","adan","asou","anba","èvè","épi","dèpi","avan","vè","dèyè","douvan"]) gpGrammar.add(w);
const frGrammar = collect(Object.keys(R.pronoms_sujets), Object.keys(R.possessifs), Object.keys(R.interrogatifs),
  Object.keys(R.clitiques_objets), R.negation_ne, R.negation_pas, R.articles_supprimes, Object.keys(R.elision || {}),
  R.determinants_feminins, R.determinants_masculins, rules.determinants_fr, rules.mots_fonctionnels_fr,
  rules.prepositions_contexte, rules.stop_np, rules.coordinateurs, rules.mots_negatifs_fr, rules.adverbes_quantite_fr, rules.nombres_fr);
for (const w of ["le","la","les","un","une","des","de","du","d","l","à","au","aux","en","et","ou","mais","je","tu","il","elle","on","nous","vous","ils","elles","ce","cet","cette","ces","c","ça","son","sa","ses","mon","ma","mes","ton","ta","tes","notre","nos","votre","vos","leur","leurs","qui","que","dont","où","ne","pas","plus","y","se","est","sont"]) frGrammar.add(w);

const isFrench = (t) => classer_fr(t) !== "inconnu" || trouver_infinitif(t) !== null;
const gpBase = (l) => gpKnown.has(l) || gpGrammar.has(l) || gpKnown.has(normalize_token(l));
const knownGP = (l) => gpBase(l) || /^(an|a)-\w+$/.test(l) || (l.includes("-") && gpBase(l.replace(/-(w|y|m|nou|ou|li|yo|zot|la)$/, "")));
const frOk = (l) => frKnown.has(l) || frGrammar.has(l) || frKnown.has(normalize_token(l)) || isFrench(l);

function words(text) { return text.split(/[\s   ]+/).map((t) => t.replace(/^[^\p{L}\p{N}'’-]+|[^\p{L}\p{N}'’-]+$/gu, "")).filter(Boolean); }
const isNum = (w) => /^[+\-]?\d/.test(w);
const isCap = (w) => /^\p{Lu}/u.test(w);

// ── Classe chaque mot de sortie : COVERED / LOGIC / DICO / PROPER ─────────────
function analyse(text, dir) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
  const hits = [];
  for (const sent of sentences) {
    if (!sent.trim()) continue;
    const out = engine.traduire(sent, dir[0], dir[1]);
    const outWords = words(out);
    for (let idx = 0; idx < outWords.length; idx++) {
      const w = outWords[idx]; if (!est_mot(w) || isNum(w) || w.length === 1) continue;
      const l = w.toLowerCase();
      if (dir[1] === "gp") {
        if (knownGP(l)) { hits.push({ cls: "COVERED" }); continue; }
        if (isCap(w) && idx > 0 && !isFrench(l)) { hits.push({ cls: "PROPER" }); continue; }
        if (isFrench(w)) hits.push({ cls: "LOGIC", token: w, sentence: sent });
        else hits.push({ cls: "DICO", token: w, sentence: sent });
      } else {
        if (frOk(l)) { hits.push({ cls: "COVERED" }); continue; }
        const elis = l.match(/^(l|d|n|j|m|t|s|c|qu)['’](.+)$/);
        if (elis && (frOk(elis[2]) || knownGP(elis[2]))) { hits.push({ cls: "COVERED" }); continue; }
        if (isCap(w) && idx > 0) { hits.push({ cls: "PROPER" }); continue; }
        if (gpKnown.has(l) || gpKnown.has(normalize_token(l))) hits.push({ cls: "LOGIC", token: w, sentence: sent });
        else hits.push({ cls: "DICO", token: w, sentence: sent });
      }
    }
  }
  return hits;
}

// ── Corpus curé : porte de non-régression (réutilise corpus.json) ─────────────
function corpusParasites() {
  const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, "corpus.json"), "utf8"));
  let bad = 0;
  const scan = (list, d) => { for (const s of list) for (const h of analyse(s, d)) if (h.cls === "LOGIC") bad++; };
  scan(corpus.fr_gp || [], ["fr", "gp"]); scan(corpus.gp_fr || [], ["gp", "fr"]);
  return bad;
}

// ── Échantillons monde réel ───────────────────────────────────────────────────
const args = process.argv.slice(2);
const showCtx = args.includes("--context");
const asJson = args.includes("--json");
const batchN = args.includes("--batch") ? parseInt(args[args.indexOf("--batch") + 1] || "40", 10) : 0;
const dirOf = (name) => name.includes(".gp.") ? ["gp", "fr"] : ["fr", "gp"];
const sampDir = path.join(__dirname, "samples");
const sampleFiles = fs.existsSync(sampDir) ? fs.readdirSync(sampDir).filter((f) => f.endsWith(".txt")).map((f) => path.join(sampDir, f)) : [];

let COVERED = 0, LOGIC = 0, DICO = 0, PROPER = 0;
const gapAgg = new Map();
for (const file of sampleFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const h of analyse(text, dirOf(path.basename(file)))) {
    if (h.cls === "COVERED") COVERED++;
    else if (h.cls === "PROPER") PROPER++;
    else {
      if (h.cls === "LOGIC") LOGIC++; else DICO++;
      const key = h.token.toLowerCase();
      const e = gapAgg.get(key) || { token: h.token, cls: h.cls, count: 0, sentence: h.sentence };
      e.count++; gapAgg.set(key, e);
    }
  }
}

const rendered = COVERED + LOGIC;                       // mots effectivement produits en cible
const scoreable = COVERED + LOGIC + DICO;               // hors noms propres
const Coverage    = scoreable ? COVERED / scoreable : 1;
const Correctness = rendered  ? 1 - LOGIC / rendered   : 1;
const curedBad = corpusParasites();
const Robustness  = curedBad === 0 ? 1 : 0;

const INDEX = Math.round(100 * (0.55 * Coverage + 0.30 * Correctness + 0.15 * Robustness));
const THRESHOLD = 90;
const hardGatesOk = curedBad === 0 && LOGIC === 0;
const RELEASABLE = INDEX >= THRESHOLD && hardGatesOk;

// ── Export d'un lot de validation (la boucle d'action) ───────────────────────
if (batchN) {
  const batch = [...gapAgg.values()].filter((e) => e.cls === "DICO").sort((a, b) => b.count - a.count).slice(0, batchN)
    .map((e) => ({ fr: e.token.toLowerCase(), gp: "", freq: e.count, _todo: "à valider par locuteur/dico faisant autorité" }));
  const outP = path.join(ROOT, "dict", "_candidates.todo.json");
  fs.writeFileSync(outP, JSON.stringify(batch, null, 2));
  console.log(`📋 Lot de ${batch.length} trous exporté → dict/_candidates.todo.json  (remplis "gp", puis fusionne dans le bon dict/*.json)`);
}

if (asJson) { console.log(JSON.stringify({ INDEX, THRESHOLD, RELEASABLE, Coverage, Correctness, Robustness, COVERED, LOGIC, DICO, PROPER, curedBad })); process.exit(RELEASABLE ? 0 : 1); }

// ── Rapport ───────────────────────────────────────────────────────────────────
const line = "═".repeat(64);
console.log("\n" + line + "\nRAKOUN — INDICE DE RELEASABILITY\n" + line);
console.log(`  Couverture (0.55) : ${(100 * Coverage).toFixed(1)}%   (${COVERED} rendus / ${scoreable} mots de contenu)`);
console.log(`  Correction (0.30) : ${(100 * Correctness).toFixed(1)}%   (${LOGIC} résidu(s) logique — mot source connu non traduit)`);
console.log(`  Robustesse (0.15) : ${Robustness ? "100.0%" : "0.0%"}   (corpus curé : ${curedBad} parasite)`);
console.log("  " + "─".repeat(60));
console.log(`  INDICE            : ${INDEX} / 100     (seuil release : ${THRESHOLD})`);
console.log(`  Portes dures      : corpus 0-parasite ${curedBad === 0 ? "✅" : "❌"}   |   0 résidu logique ${LOGIC === 0 ? "✅" : "❌"}`);
console.log(`  Noms propres ignorés : ${PROPER}`);
console.log(line);
console.log(RELEASABLE ? "✅ RELEASABLE — le traducteur atteint le seuil de publication."
                       : `❌ PAS ENCORE RELEASABLE — il manque ${Math.max(0, THRESHOLD - INDEX)} point(s)${hardGatesOk ? "" : " et une porte dure est fermée"}.`);
console.log(line);

// Top trous (levier n°1 pour monter la couverture) — SANS traduction inventée.
const topGaps = [...gapAgg.values()].filter((e) => e.cls === "DICO").sort((a, b) => b.count - a.count).slice(0, 15);
if (topGaps.length) {
  console.log("\nLevier n°1 — trous de vocabulaire vérifiable les plus fréquents :");
  for (const e of topGaps) { console.log(`  ${String(e.count).padStart(3)}×  ${e.token}`); if (showCtx) console.log(`        « …${e.sentence.trim().slice(0, 84)}… »`); }
  console.log("\n→ Boucle : `node test/releasability.cjs --batch 40` exporte un lot à faire valider,");
  console.log("  puis re-lance ce script après fusion pour voir l'indice monter.");
}
process.exit(RELEASABLE ? 0 : 1);
