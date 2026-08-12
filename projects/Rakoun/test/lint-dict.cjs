#!/usr/bin/env node
// ============================================================================
// Rakoun — LINTER DES DONNÉES (dict/*.json)
//
// Le moteur est générique : tout le savoir linguistique vit dans les données.
// Corollaire : une donnée fausse = une traduction fausse, et le moteur n'a
// aucun moyen de s'en apercevoir. Ce linter est le garde-fou correspondant.
// Il ne traduit rien : il inspecte les fichiers et signale ce qui, par
// construction, ne peut pas être correct.
//
//   node test/lint-dict.cjs              # rapport
//   node test/lint-dict.cjs --strict     # sort en code 1 s'il reste une erreur
//   node test/lint-dict.cjs --only=graphie   # une seule famille de contrôles
//
// Familles de contrôles :
//   nature   — entrée rangée dans le mauvais fichier (le fichier FAIT la nature)
//   doublon  — même clé française définie deux fois avec deux traductions
//   graphie  — le créole viole l'alphabet GEREC (c, q, x hors emprunt)
//   copie    — gp identique au fr : le mot n'est pas traduit, juste recopié
//   vide     — entrée inexploitable (fr ou gp manquant)
// ============================================================================
"use strict";
const fs = require("fs"), path = require("path");
const DICT = path.join(__dirname, "..", "dict");
const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").slice(7);
const want = (fam) => !ONLY || ONLY === fam;

const FICHIERS = ["Verbs", "Nouns", "Adjectives", "Adverbs", "Misc", "Grammar"];
const charger = (f) => {
  const raw = JSON.parse(fs.readFileSync(path.join(DICT, f + ".json"), "utf8"));
  return Array.isArray(raw) ? raw : (raw.entries || []);
};
const liste = (v) => (Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []));

// ── Alphabet GEREC : ni c, ni q, ni x isolés. « ch » est UNE lettre du créole,
// et « tj / dj / tch » sont des digrammes légitimes ; on les retire avant de
// chercher un c/q/x résiduel. Le « u » n'existe que dans le digramme « ou ».
// Voir research/GEREC-SOURCES.md §2.
const digrammes = (s) => s.replace(/tch|ch|dj|tj/gi, "");
const HORS_ALPHABET = /[cqx]/i;
const exempt = (s) => /^[A-ZÉÈÀÒ]/.test(s); // noms propres : graphie d'origine tolérée

const INF = /(er|ir|re|oir)$/i;

const probs = [];
const sig = (fam, fichier, entree, msg) =>
  probs.push({ fam, fichier, cle: liste(entree.fr)[0] || "?", msg });

const vus = new Map();      // clé fr → [{fichier, gp}]
const suspects = [];        // entrées de Verbs.json à confronter aux infinitifs
const infinitifs = [];      // tous les infinitifs déclarés dans Verbs.json

for (const f of FICHIERS) {
  if (f === "Grammar") continue; // tables, pas des entrées lexicales
  let entrees;
  try { entrees = charger(f); } catch (e) { console.error("illisible : " + f + ".json — " + e.message); process.exit(1); }

  for (const e of entrees) {
    const frs = liste(e.fr), gps = liste(e.gp);

    if (want("vide") && (!frs.length || !gps.length)) { sig("vide", f, e, "fr ou gp manquant"); continue; }

    // nature : le fichier détermine la nature du mot (cf. AMELIORER-SANS-JS.md).
    // Une forme conjuguée dans Verbs.json est VOULUE (« mange » → manjé) ; on ne
    // signale donc que les entrées dont AUCUN infinitif du fichier ne partage le
    // radical — celles-là ne sont pas des verbes du tout (« beurre », « bizarre »).
    if (want("nature") && f === "Verbs" && !e.type) {
      const base = String(frs[0]).replace(/^s[e']\s*/i, "").toLowerCase();
      if (!INF.test(base)) suspects.push({ base, entree: e });
    }

    if (f === "Verbs") for (const fr of frs) { const b = String(fr).replace(/^s[e']\s*/i, "").toLowerCase(); if (INF.test(b)) infinitifs.push(b); }

    for (const fr of frs) {
      const k = String(fr).toLowerCase();
      const prec = vus.get(k);
      if (prec) {
        if (want("doublon") && prec.some((p) => p.gp !== gps[0]))
          sig("doublon", f, e, "« " + fr + " » déjà défini dans " + prec.map((p) => p.fichier + " → " + p.gp).join(", ") + " ; ici → " + gps[0]);
        prec.push({ fichier: f, gp: gps[0] });
      } else vus.set(k, [{ fichier: f, gp: gps[0] }]);
    }

    for (const gp of gps) {
      const g = String(gp);
      if (exempt(g)) continue;
      const nu = digrammes(g);
      const hg = HORS_ALPHABET.test(nu);
      const hu = /u/i.test(nu.replace(/ou/gi, ""));
      if (want("graphie")) {
        if (hg) sig("graphie", f, e, "« " + g + " » : c/q/x hors digramme — pas de l'alphabet GEREC");
        else if (hu) sig("graphie", f, e, "« " + g + " » : « u » hors digramme « ou »");
      }
      // Une traduction identique au français n'est un problème que si elle
      // n'est PAS écrite en créole : sinon c'est un mot commun aux deux langues
      // (chat, chou, tanbou…), parfaitement légitime.
      if (want("copie") && !hg && !hu && frs.some((x) => String(x).toLowerCase() === g.toLowerCase()) && g.length > 3)
        sig("copie", f, e, "« " + g + " » identique au français (graphie créole valide — à confirmer)");
    }
  }
}

// Une forme non-infinitive n'est « mal rangée » que si aucun infinitif du
// fichier ne partage son radical (4 premières lettres).
for (const s of suspects) {
  const rad = s.base.slice(0, 4);
  if (rad.length >= 3 && infinitifs.some((i) => i.startsWith(rad))) continue;
  sig("nature", "Verbs", s.entree, "« " + [].concat(s.entree.fr)[0] + " » n'est ni un infinitif ni une forme d'un verbe du fichier — probablement pas un verbe");
}

// ── Rapport ─────────────────────────────────────────────────────────────────
const parFam = {};
for (const p of probs) (parFam[p.fam] = parFam[p.fam] || []).push(p);
const ordre = ["vide", "nature", "doublon", "graphie", "copie"];

console.log("=".repeat(72));
console.log("RAKOUN — LINTER DES DONNÉES");
console.log("=".repeat(72));
for (const fam of ordre) {
  const l = parFam[fam] || [];
  console.log("  " + fam.padEnd(9) + " : " + String(l.length).padStart(4));
}
console.log("=".repeat(72));
for (const fam of ordre) {
  const l = parFam[fam] || [];
  if (!l.length) continue;
  console.log("\n▼ " + fam.toUpperCase() + " (" + l.length + ")");
  for (const p of l.slice(0, 25)) console.log("   [" + p.fichier + "] " + p.msg);
  if (l.length > 25) console.log("   … et " + (l.length - 25) + " autres");
}
console.log(probs.length ? "\n" + probs.length + " signalement(s)." : "\n✅ Données propres.");
if (STRICT && probs.length) process.exit(1);
