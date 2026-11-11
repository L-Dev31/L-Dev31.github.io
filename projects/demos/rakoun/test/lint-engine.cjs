// Garde-fou « aucun mot dans le moteur ».
//
// js/engine.js ne doit contenir AUCUN mot français ou créole : tout le savoir
// linguistique vit dans dict/*.json. Ce contrôle vérifie :
//   1. qu'aucune chaîne de caractères du moteur n'est un mot (hors identifiants
//      techniques : noms de types, de temps, de clés JSON) ;
//   2. que chaque table de mots lue par le moteur (F.… = Grammar.json > fr,
//      G.… = Grammar.json > gp, rules.R.… = clé de Grammar.json ou de
//      Verbs.json > rules) existe bien dans les données ;
//   3. (information) les clés de fr / gp que le moteur ne lit pas.
//
//   node test/lint-engine.cjs            rapport ; code de sortie 1 s'il y a une erreur
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "js", "engine.js"), "utf8");
const grammar = JSON.parse(fs.readFileSync(path.join(ROOT, "dict", "Grammar.json"), "utf8"));
const verbRules = JSON.parse(fs.readFileSync(path.join(ROOT, "dict", "Verbs.json"), "utf8")).rules || {};

// Identifiants techniques admis dans le code (ce ne sont pas des mots à traduire).
const TECHNIQUE = new Set(("fr gp nom verbe adj adv lieu num prep pron pronom conj expr interj misc article excl " +
  "present imparfait futur conditionnel subjonctif subjonctif_present passe imperatif futur_proche futur_proche_passe " +
  "m f string object undefined function number fonctionnel inconnu brut pluraliser boundaries " +
  "Grammar Verbs Nouns Adjectives Adverbs Misc NFD g u i gi gu giu").split(/\s+/));

// 1. Chaînes littérales du moteur (commentaires ignorés).
const litteraux = [];
{
  let i = 0, ligne = 1; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === "\n") { ligne++; i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") { while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") ligne++; i++; } i += 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1, s = "";
      while (j < n && src[j] !== c) { if (src[j] === "\\") { s += src[j] + src[j + 1]; j += 2; continue; } if (src[j] === "\n") ligne++; s += src[j]; j++; }
      litteraux.push({ ligne, texte: s }); i = j + 1; continue;
    }
    // Expression régulière littérale : sautée (elle peut contenir des guillemets).
    if (c === "/" && /[=(,:!&|?{};\[]\s*$/.test(src.slice(Math.max(0, i - 6), i))) {
      let j = i + 1, classe = false;
      while (j < n && (src[j] !== "/" || classe) && src[j] !== "\n") { if (src[j] === "\\") { j += 2; continue; } if (src[j] === "[") classe = true; if (src[j] === "]") classe = false; j++; }
      if (src[j] === "/") { i = j + 1; continue; }
    }
    i++;
  }
}
const estMot = (t) => /\p{L}/u.test(t) && !TECHNIQUE.has(t) &&
  !/^[a-z_0-9]+$/.test(t.includes("_") ? t : "\u0000") &&           // clés_de_données
  !/^(use strict|HF|HG|PIPE|COPULE|in$|->|tok\[|sortie)/.test(t) && // traces de débogage
  !/\\[bpsdu]|\(\?|\[\^?\\/.test(t) &&                              // morceaux d'expressions régulières
  !/^\$\d$/.test(t) && !/^[01]?\\u/.test(t);
const mots = litteraux.filter((l) => estMot(l.texte));

// 2. Tables lues par le moteur.
const existe = (obj, chemin) => { let o = obj; for (const k of chemin) { if (o === null || typeof o !== "object" || !(k in o)) return false; o = o[k]; } return true; };
const manquants = new Set(), lusFG = new Set();
for (const m of src.matchAll(/(?<![\w.])([FG])((?:\.[A-Za-z_][A-Za-z_0-9]*)+)/g)) {
  const bloc = m[1] === "F" ? "fr" : "gp";
  let chemin = m[2].slice(1).split(".");
  // Une méthode en bout de chaîne (includes, some, map, length…) n'est pas une clé.
  while (chemin.length && !existe(grammar[bloc], chemin) && /^(includes|some|map|find|length|slice|join|every|filter|has|startsWith|endsWith|toLowerCase|concat|forEach)$/.test(chemin[chemin.length - 1])) chemin = chemin.slice(0, -1);
  if (!existe(grammar[bloc], chemin)) manquants.add(bloc + "." + chemin.join("."));
  else lusFG.add(bloc + "." + chemin.join("."));
}
const donnees = Object.assign({}, grammar, verbRules);
for (const m of src.matchAll(/rules\.R\.([A-Za-z_][A-Za-z_0-9]*)/g)) if (!(m[1] in donnees)) manquants.add("(Grammar.json ou Verbs.json > rules) " + m[1]);

// 3. Clés de fr / gp jamais lues.
const inutiles = [];
const parcourir = (o, prefixe) => { for (const k of Object.keys(o)) { if (k.startsWith("_")) continue; const p = prefixe + "." + k;
  const lu = [...lusFG].some((x) => x === p || x.startsWith(p + ".") || p.startsWith(x + "."));
  if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) && ![...lusFG].some((x) => x === p)) parcourir(o[k], p); else if (!lu) inutiles.push(p); } };
parcourir(grammar.fr || {}, "fr"); parcourir(grammar.gp || {}, "gp");

console.log("Mots codés en dur dans js/engine.js : " + mots.length);
for (const l of mots) console.log("   ligne " + l.ligne + " : " + JSON.stringify(l.texte));
console.log("Tables lues par le moteur mais absentes des données : " + manquants.size);
for (const k of manquants) console.log("   " + k);
console.log("Clés de fr / gp non lues par le moteur : " + inutiles.length + (inutiles.length ? " (" + inutiles.join(", ") + ")" : ""));
process.exitCode = (mots.length || manquants.size) ? 1 : 0;
