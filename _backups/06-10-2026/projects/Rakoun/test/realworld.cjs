#!/usr/bin/env node
// Boucle de test « monde réel » — passe des articles entiers au traducteur et
// classe les parasites pour en faire une todo de réparation exploitable.
//
// Dépose un fichier dans test/samples/ :
//   *.fr.txt  → testé FR→GP     (défaut si pas de .gp/.fr)
//   *.gp.txt  → testé GP→FR
//
//   node test/realworld.cjs                 → rapport classé + fréquences
//   node test/realworld.cjs <fichier>       → un seul fichier
//   node test/realworld.cjs --context       → montre une phrase d'exemple par parasite
//
// Classement des parasites :
//   ⛔ LOGIQUE  : mot de la langue source CONNU du dico mais laissé tel quel
//                 (le moteur savait le traduire → bug de logique/homographe)
//   📖 DICO     : mot inconnu, en minuscule → trou de dictionnaire (à ajouter)
//   🔤 PROPRE   : mot capitalisé inconnu → nom propre présumé (ignoré du score)

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

// ── Vocabulaires (repris de run.cjs, condensés) ───────────────────────────────
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
// Clitique enclitique attaché (-w/-y/-m/-nou/-ou/-li/-yo/-zot ou a-w/an-mwen) :
// "repozé-w", "ba-w", "santi-w" sont du créole correct → on teste la base.
const knownGP = (l) => gpBase(l) || /^(an|a)-\w+$/.test(l) ||
  (l.includes("-") && gpBase(l.replace(/-(w|y|m|nou|ou|li|yo|zot|la)$/, "")));
const frOk = (l) => frKnown.has(l) || frGrammar.has(l) || frKnown.has(normalize_token(l)) || isFrench(l);

function words(text) {
  return text.split(/[\s   ]+/).map((t) => t.replace(/^[^\p{L}\p{N}'’-]+|[^\p{L}\p{N}'’-]+$/gu, "")).filter(Boolean);
}
const isNum = (w) => /^\d/.test(w) || /^[+\-]?\d/.test(w);
const isCap = (w) => /^\p{Lu}/u.test(w);

// ── Analyse d'un texte ────────────────────────────────────────────────────────
function analyse(text, dir) {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());
  const hits = []; // {token, cls, suggest, sentence}
  for (const sent of sentences) {
    if (!sent.trim()) continue;
    const out = engine.traduire(sent, dir[0], dir[1]);
    const outWords = words(out);
    for (let idx = 0; idx < outWords.length; idx++) {
      const w = outWords[idx];
      if (!est_mot(w) || isNum(w) || w.length === 1) continue; // ignore fragments d'élision (j', s', m')
      const l = w.toLowerCase();
      if (dir[1] === "gp") {
        if (knownGP(l)) continue;
        // nom propre : capitalisé, non-initial, inconnu du FR
        if (isCap(w) && idx > 0 && !isFrench(l)) { hits.push({ token: w, cls: "PROPRE", suggest: "", sentence: sent }); continue; }
        if (isFrench(w)) hits.push({ token: w, cls: "LOGIQUE", suggest: ctx.index_fr[l] || ctx.index_fr[normalize_token(l)] || "?", sentence: sent });
        else hits.push({ token: w, cls: "DICO", suggest: "", sentence: sent });
      } else {
        if (frOk(l)) continue;
        // Élisions françaises (l'eau, n'a, d'aubes, j'ai, qu'il) : on retire le
        // préfixe élidé et on juge le reste — sinon faux positifs sur du français correct.
        const elis = l.match(/^(l|d|n|j|m|t|s|c|qu)['’](.+)$/);
        if (elis) { const rest = elis[2]; if (frOk(rest) || knownGP(rest)) continue; }
        if (isCap(w) && idx > 0) { hits.push({ token: w, cls: "PROPRE", suggest: "", sentence: sent }); continue; }
        if (gpKnown.has(l) || gpKnown.has(normalize_token(l))) hits.push({ token: w, cls: "LOGIQUE", suggest: ctx.index_gp[l] || "?", sentence: sent });
        else hits.push({ token: w, cls: "DICO", suggest: "", sentence: sent });
      }
    }
  }
  return hits;
}

// ── Exécution ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const showCtx = args.includes("--context");
const fileArgs = args.filter((a) => !a.startsWith("--"));
const dir = (name) => name.includes(".gp.") ? ["gp", "fr"] : ["fr", "gp"];

let files;
if (fileArgs.length) files = fileArgs;
else {
  const dirSamp = path.join(__dirname, "samples");
  files = fs.existsSync(dirSamp) ? fs.readdirSync(dirSamp).filter((f) => f.endsWith(".txt")).map((f) => path.join(dirSamp, f)) : [];
}
if (!files.length) { console.log("Aucun échantillon. Dépose un .txt dans test/samples/ (*.fr.txt ou *.gp.txt)."); process.exit(0); }

const agg = new Map(); // token → {cls, count, suggest, sentence}
let totalWords = 0;
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const d = dir(path.basename(file));
  totalWords += words(text).length;
  console.log(`\n📄 ${path.basename(file)}  [${d[0]}→${d[1]}]`);
  for (const h of analyse(text, d)) {
    const key = h.cls + "|" + h.token.toLowerCase();
    const e = agg.get(key) || { token: h.token, cls: h.cls, count: 0, suggest: h.suggest, sentence: h.sentence };
    e.count++; agg.set(key, e);
  }
}

const byCls = { LOGIQUE: [], DICO: [], PROPRE: [] };
for (const e of agg.values()) byCls[e.cls].push(e);
for (const k in byCls) byCls[k].sort((a, b) => b.count - a.count);

const line = "─".repeat(72);
function section(title, arr, withSuggest) {
  console.log("\n" + line + "\n" + title + " (" + arr.reduce((s, e) => s + e.count, 0) + " occurrences, " + arr.length + " uniques)\n" + line);
  for (const e of arr) {
    console.log(`  ${String(e.count).padStart(3)}×  ${e.token}${withSuggest && e.suggest ? "   → dico: " + e.suggest : ""}`);
    if (showCtx) console.log(`        « …${e.sentence.trim().slice(0, 90)}… »`);
  }
}
section("⛔ LOGIQUE — mot connu non traduit (bug logique/homographe)", byCls.LOGIQUE, true);
section("📖 DICO — trou de dictionnaire (à ajouter)", byCls.DICO, false);
if (showCtx) section("🔤 PROPRE — noms propres présumés (ignorés)", byCls.PROPRE, false);

// --todo : squelette JSON prêt à remplir (le sens GP est à compléter), trié par
// fréquence. On copie-colle dans le bon dict/*.json après avoir rempli "gp".
if (args.includes("--todo")) {
  const skel = byCls.DICO.map((e) => `  { "fr": ${JSON.stringify(e.token.toLowerCase())}, "gp": "" },`);
  console.log("\n" + line + "\n📋 TODO dico (remplis \"gp\" puis colle dans dict/*.json)\n" + line);
  console.log("[\n" + skel.join("\n") + "\n]");
}

const scoreable = byCls.LOGIQUE.reduce((s, e) => s + e.count, 0) + byCls.DICO.reduce((s, e) => s + e.count, 0);
console.log("\n" + line);
console.log(`Mots traités: ${totalWords} | Parasites réparables: ${scoreable}  (logique: ${byCls.LOGIQUE.reduce((s,e)=>s+e.count,0)}, dico: ${byCls.DICO.reduce((s,e)=>s+e.count,0)}) | Noms propres ignorés: ${byCls.PROPRE.reduce((s,e)=>s+e.count,0)}`);
console.log(line);
process.exit(0);
