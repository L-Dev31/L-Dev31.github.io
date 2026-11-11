// Jeu d'or FR→créole : compare la sortie du moteur à une référence humaine.
//   node test/gold.cjs gold4.apics.fr-cr.json           résumé (F1, phrases exactes, pires cas)
//   node test/gold.cjs gold4.apics.fr-cr.json --fails   liste TOUTES les phrases non exactes
"use strict";
const fs=require("fs"),path=require("path");
const {engine}=require("./_engine.cjs");
const args=process.argv.slice(2).filter(a=>!a.startsWith("--"));
const FAILS=process.argv.includes("--fails");
const gold=JSON.parse(fs.readFileSync(path.join(__dirname, args[0]||"gold.fr-cr.json"),"utf8")).phrases;

const stripAcc=s=>s.normalize("NFD").replace(/\p{Mn}/gu,"");
function norm(s,loose){
  s=s.toLowerCase().replace(/['’]/g," ").replace(/-/g," ");
  s=s.replace(/[.,!?;:()"]/g," ");
  if(loose)s=stripAcc(s);
  return s.split(/\s+/).filter(Boolean);
}
function f1(a,b){ // token multiset F1
  const ca={},cb={};for(const t of a)ca[t]=(ca[t]||0)+1;for(const t of b)cb[t]=(cb[t]||0)+1;
  let inter=0;for(const t in ca)inter+=Math.min(ca[t],cb[t]||0);
  const p=a.length?inter/a.length:1,r=b.length?inter/b.length:1;
  return (p+r)?2*p*r/(p+r):0;
}
let sumS=0,sumL=0,exact=0;const rows=[];
for(const {fr,cr} of gold){
  const out=engine.traduire(fr,"fr","gp");
  const s=f1(norm(out,false),norm(cr,false));
  const l=f1(norm(out,true),norm(cr,true));
  sumS+=s;sumL+=l;if(norm(out,true).join(" ")===norm(cr,true).join(" "))exact++;
  rows.push({fr,cr,out,s,l});
}
const N=gold.length;
if(FAILS){
  let k=0;
  for(const r of rows){ if(norm(r.out,true).join(" ")===norm(r.cr,true).join(" "))continue; k++; console.log(r.fr+"\n   réf : "+r.cr+"\n   out : "+r.out); }
  console.log("("+k+" non exactes sur "+N+")");
  process.exit(0);
}
rows.sort((a,b)=>a.l-b.l);
console.log("═".repeat(70));
console.log("RAKOUN — ÉVAL SUR GOLD SET ("+N+" phrases FR→GP, réf. humaine)");
console.log("═".repeat(70));
console.log(`F1 strict (accents)   : ${(100*sumS/N).toFixed(1)}%`);
console.log(`F1 tolérant (sans acc): ${(100*sumL/N).toFixed(1)}%`);
console.log(`Exact (tolérant)      : ${exact}/${N}`);
console.log("═".repeat(70));
console.log("\n▼ 18 PIRES (là où le moteur diverge le plus de la réf.) :");
for(const r of rows.slice(0,18)){
  console.log(`\n[F1 ${(100*r.l).toFixed(0)}%] ${r.fr}`);
  console.log(`  réf : ${r.cr}`);
  console.log(`  out : ${r.out}`);
}
console.log("\n▼ 6 MEILLEURES :");
for(const r of rows.slice(-6).reverse()){
  console.log(`[F1 ${(100*r.l).toFixed(0)}%] ${r.out}   ⟨réf ${r.cr}⟩`);
}
