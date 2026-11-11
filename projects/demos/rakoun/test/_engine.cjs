// Chargement commun du moteur et des dictionnaires pour tous les scripts de test.
// Un seul endroit sait où sont les fichiers : changer ici suffit si l'arborescence bouge.
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FILES = ["Grammar", "Verbs", "Nouns", "Adjectives", "Adverbs", "Misc"];
const { RakounCore } = require(path.join(ROOT, "js", "engine.js"));
const dicts = {};
for (const f of FILES) dicts[f] = JSON.parse(fs.readFileSync(path.join(ROOT, "dict", f + ".json"), "utf8"));
module.exports = { ROOT, FILES, dicts, RakounCore, engine: RakounCore.createEngine(dicts) };
