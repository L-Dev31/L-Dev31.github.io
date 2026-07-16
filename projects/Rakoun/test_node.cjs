// Oracle Node : exécute les 308 cas de régression contre le moteur JS Rakoun.
const fs = require("fs");
const path = require("path");
const { RakounCore } = require("./js/engine.js");

const dictDir = path.join(__dirname, "dict");
const load = (f) => JSON.parse(fs.readFileSync(path.join(dictDir, f), "utf8"));
const dicts = {
  Grammar: load("Grammar.json"), Verbs: load("Verbs.json"), Nouns: load("Nouns.json"),
  Adjectives: load("Adjectives.json"), Adverbs: load("Adverbs.json"), Misc: load("Misc.json"),
};

const engine = RakounCore.createEngine(dicts);
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "test_cases.json"), "utf8"));

let pass = 0;
const fails = [];
for (const c of cases) {
  let got;
  try { got = engine.traduire(c.input, c.src, c.tgt); }
  catch (err) { got = "‹EXCEPTION: " + err.message + "›"; }
  if (got === c.expected) pass++;
  else fails.push({ ...c, got });
}

const showAll = process.argv.includes("-v");
const limit = showAll ? fails.length : 30;
for (const f of fails.slice(0, limit)) {
  console.log(`✗ [${f.src}>${f.tgt}] ${f.input}`);
  console.log(`     got:  ${f.got}`);
  console.log(`    want:  ${f.expected}`);
}
console.log("\n" + "─".repeat(60));
console.log(`  ${pass}/${cases.length} passés — ${fails.length} échec(s)`);
process.exit(fails.length ? 1 : 0);
