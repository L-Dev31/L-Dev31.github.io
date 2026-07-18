// Mega stress-test Rakoun : crash-fuzzing + invariants de sortie.
const fs = require("fs");
const path = require("path");
const ROOT = require("path").resolve(__dirname, "..");
const { RakounCore } = require(path.join(ROOT, "js", "engine.js"));
const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "dict", f + ".json"), "utf8"));
const dicts = {
  Grammar: load("Grammar"), Verbs: load("Verbs"), Nouns: load("Nouns"),
  Adjectives: load("Adjectives"), Adverbs: load("Adverbs"), Misc: load("Misc"),
};
const engine = RakounCore.createEngine(dicts);

const gpWords = Object.keys(engine.ctx.index_gp);
const frWords = Object.keys(engine.ctx.index_fr);

let fails = [];
const SENTINEL_RE = /[-]/;
function check(input, src, tgt, label) {
  let out;
  try { out = engine.traduire(input, src, tgt); }
  catch (err) { fails.push([label, input, "EXCEPTION: " + err.message]); return; }
  if (typeof out !== "string") { fails.push([label, input, "NON-STRING: " + typeof out]); return; }
  if (SENTINEL_RE.test(out)) fails.push([label, input, "SENTINELLE FUITEE: " + JSON.stringify(out)]);
  if (/\bundefined\b|\bnull\b|\[object/.test(out)) fails.push([label, input, "UNDEFINED/NULL: " + out]);
  if (/  /.test(out)) fails.push([label, input, "DOUBLE ESPACE: " + JSON.stringify(out)]);
  // Déterminisme : deux appels identiques → même sortie.
  let out2;
  try { out2 = engine.traduire(input, src, tgt); } catch { out2 = "<exc>"; }
  if (out2 !== out) fails.push([label, input, "NON-DETERMINISTE: " + JSON.stringify(out) + " vs " + JSON.stringify(out2)]);
  return out;
}

// 1. Chaque mot du dico, seul, dans les deux sens.
console.error("1/5 mots isolés GP→FR (" + gpWords.length + ")…");
for (const w of gpWords) check(w, "gp", "fr", "mot-gp");
console.error("    mots isolés FR→GP (" + frWords.length + ")…");
for (const w of frWords) check(w, "fr", "gp", "mot-fr");

// 2. Combinaisons aléatoires (seed déterministe, LCG).
console.error("2/5 combinaisons aléatoires…");
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const pronoms = ["mwen", "an", "ou", "i", "nou", "zot", "yo"];
const marqueurs = ["ka", "té", "ké", "té ka", "kay", "sòti"];
for (let k = 0; k < 3000; k++) {
  const parts = [];
  if (rnd() < 0.5) parts.push(pick(pronoms));
  if (rnd() < 0.4) parts.push("pa");
  if (rnd() < 0.6) parts.push(pick(marqueurs));
  const nb = 1 + Math.floor(rnd() * 4);
  for (let j = 0; j < nb; j++) parts.push(pick(gpWords));
  if (rnd() < 0.3) parts.push(pick(["la", "lan", "a", "?", "!", "."]));
  check(parts.join(" "), "gp", "fr", "combo-gp");
}
for (let k = 0; k < 2000; k++) {
  const parts = [];
  if (rnd() < 0.5) parts.push(pick(["je", "tu", "il", "elle", "nous", "vous", "ils", "on"]));
  if (rnd() < 0.3) parts.push("ne");
  const nb = 1 + Math.floor(rnd() * 4);
  for (let j = 0; j < nb; j++) parts.push(pick(frWords));
  check(parts.join(" "), "fr", "gp", "combo-fr");
}

// 3. Entrées hostiles.
console.error("3/5 entrées hostiles…");
const hostiles = [
  "", " ", "   ", ".", "???", "!!!", "…", ",,,", "-", "--", "'", "''", "\"", "()", "[]",
  "123", "3.14", "1/2", "n°5", "50%", "10€", "$100",
  "😀", "🇬🇵 🌴", "a😀b", "mwen 😀 ka manjé",
  "MWEN KA MANJÉ", "MwEn Ka MaNjÉ", "mwen\tka\tmanjé", "mwen\nka\nmanjé",
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "mwen ka manjé mwen ka manjé mwen ka manjé mwen ka manjé mwen ka manjé mwen ka manjé mwen ka manjé mwen ka manjé mwen ka manjé mwen ka manjé",
  "l'l'l'l'", "-w -y -m", "a-y a-w a-yo", "kòn-ay", "an't'y'w",
  "Jan é Mari ka jwé.", "«Bonjou», i di.", "“ka”", "mwen ka manjé; ou ka bwè: nou kontan!",
  "1 2 3 4 5", "premye dezyèm twazyèm", "Pointe-à-Pitre", "Marie-Galante",
  "sé sé sé", "ka ka ka", "la la la", "pa pa pa", "ni ni ni", "yé yé yé",
];
for (const h of hostiles) { check(h, "gp", "fr", "hostile-gp"); check(h, "fr", "gp", "hostile-fr"); }

// 4. Phrases longues mixtes (chaque motif de ponctuation).
console.error("4/5 multi-phrases…");
for (let k = 0; k < 500; k++) {
  const nbPhrases = 2 + Math.floor(rnd() * 3);
  const phrases = [];
  for (let p = 0; p < nbPhrases; p++) {
    const parts = [pick(pronoms), pick(marqueurs)];
    for (let j = 0; j < 1 + Math.floor(rnd() * 3); j++) parts.push(pick(gpWords));
    phrases.push(parts.join(" ") + pick([".", "!", "?", ",", ";"]));
  }
  check(phrases.join(" "), "gp", "fr", "multi");
}

// 5. Aller-retour sans crash (pas d'égalité exigée).
console.error("5/5 aller-retour…");
for (let k = 0; k < 300; k++) {
  const parts = [pick(pronoms), pick(marqueurs), pick(gpWords), pick(gpWords)];
  const fr = check(parts.join(" "), "gp", "fr", "rt-1");
  if (typeof fr === "string" && fr) check(fr, "fr", "gp", "rt-2");
}

const uniq = new Map();
for (const [label, input, why] of fails) {
  const key = why.slice(0, 60);
  if (!uniq.has(key)) uniq.set(key, [label, input, why, 1]);
  else uniq.get(key)[3]++;
}
console.log("\n" + "═".repeat(70));
console.log("ÉCHECS: " + fails.length + " (" + uniq.size + " uniques)");
let shown = 0;
for (const [, [label, input, why, count]] of uniq) {
  if (shown++ >= 25) { console.log("  …"); break; }
  console.log("  [" + label + "] ×" + count + "  " + JSON.stringify(input.slice(0, 60)));
  console.log("      → " + why.slice(0, 150));
}
process.exit(fails.length ? 1 : 0);
