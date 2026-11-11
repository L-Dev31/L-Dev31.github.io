// Essai rapide d'une ou plusieurs phrases, sans ouvrir le site.
//   node test/try.cjs "Je mange du pain."          FR → créole (par défaut)
//   node test/try.cjs --gp "An ka manjé pen."      créole → FR
//   node test/try.cjs --trace "…"                  détaille les règles déclenchées
"use strict";
const args = process.argv.slice(2);
const versFr = args.includes("--gp");
if (args.includes("--trace")) process.env.RAKOUN_TRACE = "1"; // lu au chargement du moteur
const { engine } = require("./_engine.cjs");
const phrases = args.filter((a) => !a.startsWith("--"));
if (!phrases.length) { console.log('Usage : node test/try.cjs [--gp] [--trace] "phrase" …'); process.exit(1); }
for (const p of phrases) console.log(p + "\n   => " + engine.traduire(p, versFr ? "gp" : "fr", versFr ? "fr" : "gp"));
