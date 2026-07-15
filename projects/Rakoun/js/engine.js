// Rakoun — moteur de traduction Français <-> Créole guadeloupéen (port JS fidèle
// du moteur Python GPTranslator). Tout est dans une closure createEngine(dicts)
// pour reproduire les `rules`/`ctx` globaux du module Python.
//
// `dicts` = { Grammar, Verbs, Nouns, Adjectives, Adverbs, Misc } (JSON parsés).
// Renvoie { traduire(text, src, tgt) }.

(function (root) {
  "use strict";

  // ── Utilitaires (port de utils.py) ───────────────────────────────────────
  const RE_MOT = /^[\p{L}\p{N}_][\p{L}\p{N}_'-]*$/u;
  const RE_C_SOFT = /c(?=[eiy])/g;
  const RE_DOUBLE = /(.)\1+/gu;

  function est_mot(token) { return typeof token === "string" && RE_MOT.test(token); }
  // Jeton sentinelle d'une phrase extraite (zone privée Unicode) : à ne jamais
  // enjamber ni avaler par un handler — il porte une traduction déjà résolue.
  function est_sentinelle(token) { return typeof token === "string" && token.length === 1 && token.charCodeAt(0) >= 0xE000 && token.charCodeAt(0) <= 0xF8FF; }

  function reporter_casse(source, traduction) {
    if (!source || !traduction) return traduction;
    if (source === source.toUpperCase() && source.length > 1 &&
        source.toLowerCase() !== source) return traduction.toUpperCase();
    if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase())
      return traduction.length > 1
        ? traduction[0].toUpperCase() + traduction.slice(1)
        : traduction.toUpperCase();
    return traduction;
  }

  function normalize_token(word) {
    if (!word) return "";
    word = word.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();
    for (const ch of ["'", "’", "-"]) word = word.split(ch).join("");
    word = word.replace(/ph/g, "f").replace(/qu/g, "k").replace(/gu/g, "g")
               .replace(/ç/g, "s").replace(/c/g, "k").replace(/q/g, "k")
               .replace(/ou/g, "w").replace(/y/g, "i");
    word = word.replace(RE_C_SOFT, "s");
    return word.replace(RE_DOUBLE, "$1");
  }

  // Helpers génériques
  const lower = (s) => s.toLowerCase();
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function endsWithAny(s, arr) { for (const a of arr) if (a && s.endsWith(a)) return true; return false; }
  function isDigits(s) { return s.length > 0 && /^\d+$/.test(s); }
  const last = (a) => a[a.length - 1];
  const majuscule = (m) => (m ? m[0].toUpperCase() + m.slice(1) : m);
  const minuscule = (m) => (m ? m[0].toLowerCase() + m.slice(1) : m);

  function createEngine(dicts) {
    // ── Contexte lexical ────────────────────────────────────────────────────
    const ctx = { index_fr: {}, index_gp: {}, index_gp_nom: {}, index_fr_nom: {}, index_fr_verbe: {}, type_fr: {}, genre_fr: {}, norm_fr: {}, norm_gp: {}, phrases_fr_gp: {}, phrases_gp_fr: {} };

    // ── Objet rules (port de GrammarRules) ────────────────────────────────────
    const rules = {
      suffixes_feminins: [], fins_participe: [], suffixes_adjectifs: [], autres_fins_participe: [],
      avoir_attributs: new Set(), determinants_genre: {}, adjectifs_feminins: {},
      tonique_de_sujet: {}, objet_imperatif: {}, determinants_fr: new Set(), pluriel_map: {},
      refl_pronoms: {}, strict_objects: new Set(), ambiguous_objects: new Set(),
      boundaries: new Set(), aller_imparfait: new Set(), venir_present: new Set(),
      statives_fr: new Set(), possessifs_toniques: {}, toniques_lakay: {},
      subjonctif_present_terminaisons: {}, present_3e_groupe_re: {}, accords_adjectifs_suffixes: {},
      masculin_de_feminin: {}, verbes_declencheurs_que: new Set(), faut_declencheurs_que: new Set(),
      clitiques_toujours: new Set(), clitiques_contexte: new Set(), determinants_restituer_exclus: new Set(),
      determinants_pluriels: new Set(), indefinis_singuliers: new Set(), quantificateurs_pluriel: new Set(),
      interrogatifs_exclus: new Set(),
      pluriel_invariables_al: new Set(), demonstratifs_gp: new Set(), bloqueurs_verbe_nu: new Set(),
      pronoms_fr: new Set(), mots_fonctionnels_fr: new Set(), clitiques_objet_fr: new Set(),
      intensifieurs_fr: new Set(), materiaux_fr: new Set(), articles_definis_fr: new Set(),
      pronoms_sujet_fr: new Set(), contractions_fr: new Map(),
      R: {},
      inverse_irreguliers: {}, participes_inverse: {}, possessifs_gp: {}, interrogatifs_inverse: {},
      toniques_gp: {}, pronoms_gp: new Set(), marqueurs: new Set(),
      etre_formes: new Set(), etre_imparfait: new Set(), etre_futur: new Set(),
      etre_conditionnel: new Set(), avoir_formes: new Set(),
      avoir_imparfait: new Set(), avoir_futur: new Set(), avoir_conditionnel: new Set(),
      voyelles_set: new Set(), h_muet_set: new Set(), inversion_sujets: new Set(),
      inversion_objets: new Set(), restituer_determinants: new Set(),
      que_sujets: new Set(), que_declencheurs: new Set(),
    };

    // ── Moteur de conjugaison (port) ──────────────────────────────────────────
    function conjuguer(infinitif, pronom, temps = "present") {
      let inf = infinitif.toLowerCase();
      if (inf.startsWith("se ") || inf.startsWith("s'")) {
        const base = inf.startsWith("se ") ? inf.slice(3) : inf.slice(2);
        const formeBase = conjuguer(base, pronom, temps);
        const refl = rules.refl_pronoms[pronom] || "se";
        return refl + " " + formeBase;
      }
      if (temps === "present" || temps === "subjonctif")
        return _conjuguer_present(inf, pronom) || infinitif;
      if (temps === "imperatif") {
        let forme = _conjuguer_present(inf, "tu") || infinitif;
        if (inf.endsWith("er") && forme.endsWith("es")) forme = forme.slice(0, -1);
        return forme;
      }
      if (temps === "subjonctif_present") {
        if (pronom === "nous" || pronom === "vous") return conjuguer(inf, pronom, "imparfait");
        const ils = _conjuguer_present(inf, "ils") || "";
        if (ils.endsWith("ent")) {
          const radical = ils.slice(0, -3);
          return radical + (rules.subjonctif_present_terminaisons[pronom] || "e");
        }
        return infinitif;
      }
      let radical;
      if (temps === "futur" || temps === "conditionnel") {
        radical = (rules.R.futur_radicaux && rules.R.futur_radicaux[inf]) ||
                  (inf.endsWith("e") ? inf.slice(0, -1) : inf);
      } else {
        radical = _radical_imparfait(inf);
        if (radical === null) return infinitif;
      }
      const table = temps === "futur" ? "futur_terminaisons" : "imparfait_terminaisons";
      const fin = rules.R[table][pronom];
      if (fin === undefined) return infinitif;
      if (fin.startsWith("i")) {
        if (radical.endsWith("ge")) radical = radical.slice(0, -1);
        else if (radical.endsWith("ç")) radical = radical.slice(0, -1) + "c";
      }
      return radical + fin;
    }

    function _conjuguer_present(inf, pronom) {
      const irreg = rules.R.verbes_irreguliers[inf];
      if (irreg) return irreg[pronom] !== undefined ? irreg[pronom] : null;
      if (inf.endsWith("er") && inf.length >= 3) {
        let racine = inf.slice(0, -2);
        const fin = rules.R.present_1er_groupe[pronom] !== undefined ? rules.R.present_1er_groupe[pronom] : "e";
        if (fin === "ons") {
          if (racine.endsWith("g")) return racine + "eons";
          if (racine.endsWith("c")) return racine.slice(0, -1) + "çons";
        }
        if ((fin === "e" || fin === "es" || fin === "ent") && racine.length >= 2 &&
            "eé".includes(racine[racine.length - 2]) &&
            !"aeiouyéèêAEIOUY".includes(racine[racine.length - 1])) {
          racine = racine.slice(0, -2) + "è" + racine[racine.length - 1];
        }
        return racine + fin;
      }
      if (inf.endsWith("ir") && inf.length >= 3)
        return inf.slice(0, -2) + (rules.R.present_2e_groupe[pronom] !== undefined ? rules.R.present_2e_groupe[pronom] : "it");
      if (inf.endsWith("re") && inf.length >= 4) {
        const racine = inf.slice(0, -2);
        if (racine.endsWith("d")) return racine + (rules.present_3e_groupe_re[pronom] !== undefined ? rules.present_3e_groupe_re[pronom] : "");
      }
      return null;
    }

    function _radical_imparfait(inf) {
      if (inf === "être") return rules.R.radical_etre_imparfait;
      const nous = _conjuguer_present(inf, "nous");
      if (nous && nous.endsWith("ons")) return nous.slice(0, -3);
      return null;
    }

    function participe_passe(infinitif) {
      const inf = infinitif.toLowerCase();
      const connu = rules.R.participes_passes[inf];
      if (connu) return connu;
      if (inf.endsWith("er")) return inf.slice(0, -2) + "é";
      if (inf.endsWith("ir")) return inf.slice(0, -1);
      return inf;
    }

    function marqueurs_aspect(temps) {
      const ka = rules.R.marqueur_present, te = rules.R.marqueur_passe, ke = rules.R.marqueur_futur;
      return { present: [ka], imparfait: [te, ka], futur: [ke], conditionnel: [te, ke], subjonctif: [] }[temps];
    }

    function accorder_pp_etre(pp, pronom) {
      const p = pronom.toLowerCase();
      const feminin = p === "elle" || p === "elles";
      const pluriel = ["nous", "vous", "ils", "elles"].includes(p);
      let base = pp;
      if (feminin && !base.endsWith("e")) base += "e";
      if (pluriel && !base.endsWith("s")) base += "s";
      return base;
    }

    function conjuguer_consigne(mot, consigne) {
      const [pronom, temps, nie, adverbe] = consigne;
      let cle = mot.toLowerCase();
      // Si on reçoit un participe (ex. "mangé") mais qu'un temps simple est
      // requis (présent/futur/imparfait/conditionnel), on repart de l'infinitif
      // pour conjuguer correctement — sinon le participe ressortait tel quel.
      if (temps !== "passe" && ctx.type_fr[cle] !== "verbe" && has(rules.participes_inverse, cle)) {
        mot = rules.participes_inverse[cle]; cle = mot.toLowerCase();
      }
      const temps_simple = (temps === "imparfait" || temps === "futur" || temps === "conditionnel") ? temps : "present";
      const temps_etat = temps === "passe" ? "imparfait" : temps_simple;

      if (rules.avoir_attributs.has(cle)) {
        let aux = conjuguer("avoir", pronom, temps_etat);
        if (nie) aux += " pas";
        if (adverbe) return [aux + " " + adverbe + " " + mot, null];
        return [aux + " " + mot, null];
      }
      const categorie = ctx.type_fr[cle];
      if (categorie === "adj" || has(rules.R.adverbes_degre, cle) || rules.R.adverbes_degre.includes?.(cle)) {
        // adverbes_degre est une liste
      }
      if (categorie === "adj" || (Array.isArray(rules.R.adverbes_degre) && rules.R.adverbes_degre.includes(cle))) {
        let copule = conjuguer("être", pronom, temps_etat);
        if (nie) copule += " pas";
        if (adverbe) return [copule + " " + adverbe + " " + mot, null];
        return [copule + " " + mot, null];
      }
      if (categorie === "verbe") {
        if (temps === "passe") {
          const aux_inf = rules.R.verbes_aux_etre.includes(cle) ? "être" : "avoir";
          const morceaux = [conjuguer(aux_inf, pronom)];
          if (nie) morceaux.push("pas");
          if (adverbe) morceaux.push(adverbe);
          let pp = participe_passe(cle);
          if (aux_inf === "être") pp = accorder_pp_etre(pp, pronom);
          morceaux.push(pp);
          return [morceaux.join(" "), null];
        }
        const conjugated = conjuguer(mot, pronom, temps);
        if (nie) {
          if (adverbe) return [conjugated + " pas " + adverbe, null];
          return [conjugated, "pas"];
        } else {
          if (adverbe) return [conjugated + " " + adverbe, null];
          return [conjugated, null];
        }
      }
      return [mot, nie ? "pas" : null];
    }

    // ── Élision & genre ───────────────────────────────────────────────────────
    function appliquer_elision(texte) {
      const elision = rules.R.elision;
      const tokens = texte.split(" ");
      const sortie = [];
      let i = 0; const n = tokens.length;
      while (i < n) {
        const tok = tokens[i]; const bas = tok.toLowerCase();
        const suiv = i + 1 < n ? tokens[i + 1] : null;
        if (suiv) {
          const contraction = rules.contractions_fr.get(bas + "\u0000" + suiv.toLowerCase());
          if (contraction) {
            let c = contraction;
            if (tok[0] && tok[0] === tok[0].toUpperCase() && tok[0] !== tok[0].toLowerCase()) c = majuscule(c);
            sortie.push(c); i += 2; continue;
          }
        }
        if (suiv && has(elision, bas) && commence_par_voyelle(suiv)) {
          let forme = elision[bas];
          if (tok[0] && tok[0] === tok[0].toUpperCase() && tok[0] !== tok[0].toLowerCase()) forme = majuscule(forme);
          sortie.push(forme + suiv); i += 2; continue;
        }
        // Possessif féminin devant voyelle : "ma/ta/sa âme" → "mon/ton/son âme".
        if (suiv && ["ma", "ta", "sa"].includes(bas) && commence_par_voyelle(suiv) && est_mot(suiv) &&
            ["nom", "lieu"].includes(classer_fr(suiv))) {
          let forme = { ma: "mon", ta: "ton", sa: "son" }[bas];
          if (tok[0] === tok[0].toUpperCase() && tok[0] !== tok[0].toLowerCase()) forme = majuscule(forme);
          sortie.push(forme); i += 1; continue;
        }
        if (suiv && bas === "si" && (suiv.toLowerCase() === "il" || suiv.toLowerCase() === "ils")) {
          const forme = (tok[0] === tok[0].toUpperCase() && tok[0] !== tok[0].toLowerCase() ? "S'" : "s'") + suiv;
          sortie.push(forme); i += 2; continue;
        }
        if (sortie.length && bas === last(sortie).toLowerCase() &&
            ["le", "la", "les", "un", "une", "des"].includes(bas)) { i += 1; continue; }
        sortie.push(tok); i += 1;
      }
      return sortie.join(" ");
    }

    function commence_par_voyelle(mot) {
      if (!mot) return false;
      const p = mot[0].toLowerCase();
      if (rules.voyelles_set.has(p)) return true;
      if (p === "h") return rules.h_muet_set.has(mot.toLowerCase().replace(/^[.,!?;:»«"']+|[.,!?;:»«"']+$/g, ""));
      return false;
    }

    function genre_nom(mot) {
      const cle = mot.toLowerCase();
      const g = ctx.genre_fr[cle];
      if (g) return g;
      return endsWithAny(cle, rules.suffixes_feminins) ? "f" : "m";
    }

    function pluriel_fr(mot) {
      const bas = mot.toLowerCase();
      if (endsWithAny(bas, ["s", "x", "z"])) return mot;
      if (endsWithAny(bas, ["eau", "au", "eu"])) return mot + "x";
      if (bas.endsWith("al") && !rules.pluriel_invariables_al.has(bas)) return mot.slice(0, -2) + "aux";
      return mot + "s";
    }

    function accorder_adjectif(adjectif, genre) {
      const cle = adjectif.toLowerCase();
      if (genre !== "f") {
        const masc = rules.masculin_de_feminin[cle];
        return masc ? reporter_casse(adjectif, masc) : adjectif;
      }
      if (has(rules.adjectifs_feminins, cle)) return rules.adjectifs_feminins[cle];
      for (const suf in rules.accords_adjectifs_suffixes) {
        if (cle.endsWith(suf)) return adjectif.slice(0, -suf.length) + rules.accords_adjectifs_suffixes[suf];
      }
      if (cle.endsWith("e")) return adjectif;
      return adjectif + "e";
    }

    function resoudre_genre(mot, determinant) {
      if (!determinant) return null;
      const det = determinant.toLowerCase();
      let cible;
      if (rules.R.determinants_feminins.includes(det)) cible = "f";
      else if (rules.R.determinants_masculins.includes(det)) cible = "m";
      else return null;
      const cle = mot.toLowerCase();
      const g = ctx.genre_fr[cle];
      if (g === undefined || g === cible) return null;
      const base = cle.endsWith("e") ? cle.slice(0, -1) : cle;
      for (const cand in ctx.genre_fr) {
        if (ctx.genre_fr[cand] !== cible) continue;
        const candBase = cand.endsWith("e") ? cand.slice(0, -1) : cand;
        if (candBase.startsWith(base.slice(0, 4)) || base.startsWith(candBase.slice(0, 4)))
          return ctx.index_fr[cand];
      }
      return null;
    }

    // ── Classification ────────────────────────────────────────────────────────
    function trouver_infinitif(token, force) {
      const index_fr = ctx.index_fr, norm_fr = ctx.norm_fr;
      const cle = token.toLowerCase();
      // Les irréguliers sont vérifiés avant le type : une forme comme "court" (il/elle de courir)
      // peut être typée "adj" dans le dict mais reste une forme verbale connue.
      const irreg0 = rules.inverse_irreguliers[cle];
      if (irreg0 && has(index_fr, irreg0[0])) return irreg0[0];
      const known = ctx.type_fr[cle];
      // `force` : un contexte grammatical fort (ex. participe après avoir) peut
      // outrepasser un type homographe non-verbe ("mangé" nom-repas vs participe).
      if (!force && known !== undefined && known !== "verbe") return null;
      const verifier = (cand) => {
        if (has(index_fr, cand)) return cand;
        if (Object.keys(norm_fr).length) {
          const m = norm_fr[normalize_token(cand)];
          if (m && has(index_fr, m)) return m;
        }
        return null;
      };
      const irreg = rules.inverse_irreguliers[cle];
      if (irreg) { const r = verifier(irreg[0]); if (r) return r; }
      const inf0 = rules.participes_inverse[cle];
      if (inf0) { const r = verifier(inf0); if (r) return r; }
      if (cle.length < 4) return null;
      for (const fin of rules.R.desinences_1er_groupe) {
        if (cle.endsWith(fin)) {
          const racine = cle.slice(0, cle.length - fin.length);
          if (racine.length < 2) continue;
          for (const inf of [racine + "er", racine + "ger", racine + "cer", racine + "re"]) {
            const r = verifier(inf); if (r) return r;
          }
        }
      }
      if (cle.endsWith("i") || cle.endsWith("u")) { const r = verifier(cle + "r"); if (r) return r; }
      if (cle.endsWith("ds")) { const r = verifier(cle.slice(0, -1) + "re"); if (r) return r; }
      if (cle.endsWith("d")) { const r = verifier(cle + "re"); if (r) return r; }
      if (cle.endsWith("ent") && cle.length > 5) {
        const racine = cle.slice(0, -3);
        for (const inf of [racine + "re", racine + "dre"]) { const r = verifier(inf); if (r) return r; }
      }
      const FE = ["erons","eront","erez","eras","erai","erait","erais","eraient","era"];
      const FI = ["irons","iront","irez","iras","irai","irait","irais","iraient","ira"];
      const FR = ["rons","ront","rez","ras","rai","rait","rais","raient","ra"];
      for (const fin of FE) if (cle.endsWith(fin) && cle.length - fin.length >= 2) { const r = verifier(cle.slice(0, -fin.length) + "er"); if (r) return r; }
      for (const fin of FI) if (cle.endsWith(fin) && cle.length - fin.length >= 2) { const r = verifier(cle.slice(0, -fin.length) + "ir"); if (r) return r; }
      for (const fin of FR) if (cle.endsWith(fin) && cle.length - fin.length >= 2) {
        const racine = cle.slice(0, -fin.length);
        for (const suf of ["ir", "er", "re"]) { const r = verifier(racine + suf); if (r) return r; }
      }
      return null;
    }

    function classer_fr(word) {
      const cle = word.toLowerCase();
      if (rules.mots_fonctionnels_fr.has(cle)) return "fonctionnel";
      if (trouver_infinitif(word) !== null) return "verbe";
      const t = ctx.type_fr[cle];
      if (t !== undefined) return t;
      if (cle.endsWith("s") && ["nom", "lieu"].includes(ctx.type_fr[cle.slice(0, -1)])) return ctx.type_fr[cle.slice(0, -1)];
      return "inconnu";
    }

    function est_adjectif(token) {
      const cle = token.toLowerCase();
      if (classer_fr(token) === "adj") return true;
      if (trouver_infinitif(token) !== null) return false;
      for (const suffix of rules.suffixes_adjectifs) {
        if (cle.endsWith(suffix)) {
          const base = cle.slice(0, cle.length - suffix.length);
          if (base && ctx.type_fr[base] === "adj") return true;
        }
      }
      if (cle.endsWith("ées")) { if (ctx.type_fr[cle.slice(0, -3) + "é"] === "adj") return true; }
      if (cle.endsWith("ée")) { if (ctx.type_fr[cle.slice(0, -2) + "é"] === "adj") return true; }
      if (cle.endsWith("és")) { if (ctx.type_fr[cle.slice(0, -1)] === "adj") return true; }
      return false;
    }

    function est_verbe(token) {
      const cle = token.toLowerCase();
      if (has(rules.R.pronoms_sujets, cle) || rules.R.articles_supprimes.includes(cle)) return false;
      if (ctx.type_fr[cle] === "verbe") return true;
      const inf = trouver_infinitif(token);
      return inf !== null && ctx.type_fr[inf] === "verbe";
    }

    function fr_de_gp(token) {
      let fr = ctx.index_gp[token.toLowerCase()];
      if (fr === undefined && Object.keys(ctx.norm_gp).length) {
        const actual = ctx.norm_gp[normalize_token(token.toLowerCase())];
        if (actual) fr = ctx.index_gp[actual];
      }
      return fr === undefined ? null : fr;
    }
    function type_gp(token) { const fr = fr_de_gp(token); return fr !== null ? ctx.type_fr[fr.toLowerCase()] : undefined; }
    function est_lieu_gp(token) { return type_gp(token) === "lieu"; }
    function est_verbe_gp(token) { return type_gp(token) === "verbe"; }
    function est_adverbe_gp(token) { return type_gp(token) === "adv"; }
    function est_adjectif_gp(token) {
      const fr = fr_de_gp(token);
      return fr !== null && (ctx.type_fr[fr.toLowerCase()] === "adj" || est_adjectif(fr));
    }

    function detecter_temps(cle) {
      const irreg = rules.inverse_irreguliers[cle];
      if (irreg) return irreg[1];
      for (const temps in rules.R.terminaisons_temps) {
        if (endsWithAny(cle, rules.R.terminaisons_temps[temps])) return temps;
      }
      return "present";
    }

    // ── Chargement des règles (port de charger) ───────────────────────────────
    function charger(bloc) {
      const arr = (k) => bloc[k] || [];
      rules.suffixes_feminins = arr("suffixes_feminins").slice();
      rules.fins_participe = arr("fins_participe").slice();
      rules.suffixes_adjectifs = arr("suffixes_adjectifs").slice();
      rules.autres_fins_participe = arr("autres_fins_participe").slice();
      rules.avoir_attributs = new Set(arr("avoir_attributs"));
      rules.determinants_genre = {};
      for (const k in (bloc.determinants_genre || {})) rules.determinants_genre[k] = bloc.determinants_genre[k].slice();
      rules.adjectifs_feminins = Object.assign({}, bloc.adjectifs_feminins || {});
      rules.tonique_de_sujet = Object.assign({}, bloc.tonique_de_sujet || {});
      rules.objet_imperatif = Object.assign({}, bloc.objet_imperatif || {});
      rules.determinants_fr = new Set(arr("determinants_fr"));
      rules.pluriel_map = Object.assign({}, bloc.pluriel_determinants || {});
      rules.refl_pronoms = Object.assign({}, bloc.refl_pronoms || {});
      rules.strict_objects = new Set(arr("strict_objects"));
      rules.ambiguous_objects = new Set(arr("ambiguous_objects"));
      rules.boundaries = new Set(arr("boundaries"));
      rules.aller_imparfait = new Set(arr("aller_imparfait"));
      rules.venir_present = new Set(arr("venir_present"));
      rules.statives_fr = new Set(arr("statives_fr"));
      rules.possessifs_toniques = Object.assign({}, bloc.possessifs_toniques || {});
      rules.toniques_lakay = {}; for (const k in rules.possessifs_toniques) rules.toniques_lakay[rules.possessifs_toniques[k]] = k;
      rules.subjonctif_present_terminaisons = Object.assign({}, bloc.subjonctif_present_terminaisons || {});
      rules.present_3e_groupe_re = Object.assign({}, bloc.present_3e_groupe_re || {});
      rules.accords_adjectifs_suffixes = Object.assign({}, bloc.accords_adjectifs_suffixes || {});
      rules.masculin_de_feminin = {}; for (const k in rules.adjectifs_feminins) rules.masculin_de_feminin[rules.adjectifs_feminins[k]] = k;
      rules.verbes_declencheurs_que = new Set(arr("verbes_declencheurs_que"));
      rules.faut_declencheurs_que = new Set(arr("faut_declencheurs_que"));
      rules.clitiques_toujours = new Set(arr("clitiques_toujours"));
      rules.clitiques_contexte = new Set(arr("clitiques_contexte"));
      rules.determinants_restituer_exclus = new Set(arr("determinants_restituer_exclus"));
      rules.determinants_pluriels = new Set(arr("determinants_pluriels"));
      rules.indefinis_singuliers = new Set(arr("indefinis_singuliers"));
      rules.quantificateurs_pluriel = new Set(arr("quantificateurs_pluriel"));
      rules.interrogatifs_exclus = new Set(arr("interrogatifs_exclus"));

      rules.R = Object.assign({}, bloc);

      const ens = bloc.ensembles_lexicaux || {};
      rules.pluriel_invariables_al = new Set(ens.pluriel_invariables_al || []);
      rules.demonstratifs_gp = new Set(ens.demonstratifs_gp || []);
      rules.bloqueurs_verbe_nu = new Set(ens.bloqueurs_verbe_nu || []);
      rules.pronoms_fr = new Set(ens.pronoms_fr || []);
      rules.mots_fonctionnels_fr = new Set(ens.mots_fonctionnels_fr || []);
      rules.clitiques_objet_fr = new Set(ens.clitiques_objet_fr || []);
      rules.intensifieurs_fr = new Set(ens.intensifieurs_fr || []);
      rules.materiaux_fr = new Set(ens.materiaux_fr || []);
      rules.articles_definis_fr = new Set(ens.articles_definis_fr || []);
      rules.pronoms_sujet_fr = new Set(ens.pronoms_sujet_fr || []);
      // Listes externalisées : Grammar.json prioritaire, défaut de sécurité si clé absente.
      rules.stop_np = new Set(ens.stop_groupe_nominal || [
        "et","ou","mais","que","car","donc","or","ni",
        "à","de","dans","sur","sous","pour","avec","sans","vers","chez","en","par","entre","dès","depuis","pendant","malgré","selon","dont","où"
      ]);
      rules.prepositions_contexte = new Set(ens.prepositions_contexte || [
        "sur","dans","avec","sous","pour","sans","vers","chez","à","de","derrière","devant","près"
      ]);
      rules.nombres_fr = new Set(ens.nombres_fr || [
        "dix","vingt","trente","quarante","cinquante","soixante","cent","mille","deux","trois","quatre","cinq","six","sept","huit","neuf","onze","douze","treize","quatorze","quinze","seize"
      ]);
      rules.articles_clause = new Set(ens.articles_clause || ["le","la","les","un","une","des"]);
      rules.coordinateurs = new Set(ens.coordinateurs || ["et","ou","mais"]);
      rules.mots_negatifs_fr = new Set(ens.mots_negatifs_fr || ["rien","personne","jamais","aucun","aucune","nulle","nul","guère"]);
      rules.adverbes_quantite_fr = new Set(ens.adverbes_quantite_fr || ["beaucoup","peu","trop","assez","moins","tant","autant","plein"]);
      rules.prepositions_locatives = new Set(ens.prepositions_locatives || ["sur","sous","dans","derrière","devant","entre","chez"]);
      // Verbes de PROVENANCE : leur complément de lieu prend "de/d'" (origine),
      // pas "à" (destination) — "je viens DE France", pas "à France".
      rules.verbes_origine_lieu = new Set(ens.verbes_origine_lieu || ["venir","revenir","sortir","provenir"]);
      rules.noms_masse_fr = new Set(ens.noms_masse_fr || [
        "eau","argent","pain","riz","lait","sang","sel","sucre","farine","beurre","miel",
        "café","thé","jus","huile","viande","air","sable","pluie","vent","musique",
        "courage","force","chance","patience","respect","soleil","chaleur","fumée","boue","herbe"
      ]);
      rules.contractions_fr = new Map();
      for (const trip of (bloc.contractions_fr || [])) rules.contractions_fr.set(trip[0] + "\u0000" + trip[1], trip[2]);

      // Index dynamiques
      rules.inverse_irreguliers = {}; rules.participes_inverse = {}; rules.possessifs_gp = {};
      rules.interrogatifs_inverse = {}; rules.toniques_gp = {};
      rules.pronoms_gp = new Set(); rules.marqueurs = new Set();
      rules.etre_formes = new Set(); rules.etre_imparfait = new Set(); rules.etre_futur = new Set();
      rules.etre_conditionnel = new Set(); rules.avoir_formes = new Set();
      rules.avoir_imparfait = new Set(); rules.avoir_futur = new Set(); rules.avoir_conditionnel = new Set();

      const R = rules.R;
      for (const v of Object.values(R.verbes_irreguliers["être"])) rules.etre_formes.add(v);
      for (const p in R.imparfait_terminaisons) rules.etre_imparfait.add(conjuguer("être", p, "imparfait"));
      for (const v of (R.etre_futur || [])) rules.etre_futur.add(v);
      for (const v of (R.etre_conditionnel || [])) rules.etre_conditionnel.add(v);
      for (const v of Object.values(R.verbes_irreguliers["avoir"])) rules.avoir_formes.add(v);
      // Symétrie avec être : les formes d'avoir aux temps non-présents doivent
      // aussi être reconnues (sinon "j'avais faim" laisse "avais" non traduit).
      for (const p in R.imparfait_terminaisons) rules.avoir_imparfait.add(conjuguer("avoir", p, "imparfait"));
      for (const p in (R.futur_terminaisons || {})) rules.avoir_futur.add(conjuguer("avoir", p, "futur"));
      for (const p in (R.imparfait_terminaisons)) rules.avoir_conditionnel.add(conjuguer("avoir", p, "conditionnel"));
      for (const v of Object.values(R.pronoms_sujets)) rules.pronoms_gp.add(v);
      for (const k in R.pronoms_creole_francais) rules.pronoms_gp.add(k);
      for (const m of [R.marqueur_present, R.marqueur_passe, R.marqueur_futur, R.marqueur_futur_proche]) rules.marqueurs.add(m);
      for (const m of (R.marqueurs_supplementaires || [])) rules.marqueurs.add(m);
      const excl = new Set([normalize_token(R.marqueur_futur)]);
      for (const m of Array.from(rules.marqueurs)) {
        const norm = normalize_token(m);
        if (norm !== m && !excl.has(norm)) rules.marqueurs.add(norm);
      }
      for (const inf in R.participes_passes) rules.participes_inverse[R.participes_passes[inf]] = inf;
      for (const inf in R.participes_passes) {
        const p = R.participes_passes[inf];
        for (const d of [p + "e", p + "s", p + "es"]) if (!has(rules.participes_inverse, d)) rules.participes_inverse[d] = inf;
        const norm = normalize_token(p);
        if (norm !== p && !has(rules.participes_inverse, norm)) rules.participes_inverse[norm] = inf;
        for (const d of [norm + "e", norm + "s", norm + "es"]) if (!has(rules.participes_inverse, d)) rules.participes_inverse[d] = inf;
      }
      for (const cle in R.pronoms_creole_francais) {
        const fr = R.pronoms_creole_francais[cle];
        rules.toniques_gp[cle] = rules.tonique_de_sujet[fr] !== undefined ? rules.tonique_de_sujet[fr] : fr;
      }
      for (const f of rules.aller_imparfait) if (!has(rules.inverse_irreguliers, f)) rules.inverse_irreguliers[f] = ["aller", "imparfait"];
      for (const inf in R.verbes_irreguliers) {
        if (inf === "être" || inf === "avoir" || inf === "aller") continue;
        const formes = R.verbes_irreguliers[inf];
        for (const temps of ["present", "imparfait", "futur", "conditionnel"]) {
          for (const pronom in R.imparfait_terminaisons) {
            const forme = conjuguer(inf, pronom, temps).toLowerCase();
            if (!has(rules.inverse_irreguliers, forme)) rules.inverse_irreguliers[forme] = [inf, temps];
          }
        }
        const ils = formes.ils || "";
        if (ils.endsWith("ent")) {
          const radical = ils.slice(0, -3);
          for (const fin of ["e", "es", "ent"]) if (!has(rules.inverse_irreguliers, radical + fin)) rules.inverse_irreguliers[radical + fin] = [inf, "subjonctif"];
        }
      }
      const futRad = R.futur_radicaux || {};
      for (const inf in futRad) {
        const radical = futRad[inf];
        for (const pronom in (R.futur_terminaisons || {})) {
          const f = (radical + R.futur_terminaisons[pronom]).toLowerCase();
          if (!has(rules.inverse_irreguliers, f)) rules.inverse_irreguliers[f] = [inf, "futur"];
        }
        const condT = R.conditionnel_terminaisons || R.imparfait_terminaisons || {};
        for (const pronom in condT) {
          const f = (radical + condT[pronom]).toLowerCase();
          if (!has(rules.inverse_irreguliers, f)) rules.inverse_irreguliers[f] = [inf, "conditionnel"];
        }
      }
      const possM = new Set(bloc.possessifs_masculins || []);
      const possF = new Set(bloc.possessifs_feminins || []);
      for (const fr in R.possessifs) {
        const gp = R.possessifs[fr];
        if (!has(rules.possessifs_gp, gp)) rules.possessifs_gp[gp] = {};
        if (possM.has(fr) && !has(rules.possessifs_gp[gp], "m")) rules.possessifs_gp[gp].m = fr;
        if (possF.has(fr) && !has(rules.possessifs_gp[gp], "f")) rules.possessifs_gp[gp].f = fr;
      }
      for (const fr in R.interrogatifs) {
        const gp = R.interrogatifs[fr];
        if (!gp.includes(" ") && !rules.interrogatifs_exclus.has(gp) && !has(rules.interrogatifs_inverse, gp))
          rules.interrogatifs_inverse[gp] = fr;
      }
      rules.voyelles_set = new Set(R.voyelles);
      rules.h_muet_set = new Set(R.h_muet);
      rules.inversion_sujets = new Set(Object.keys(R.pronoms_sujets));
      rules.inversion_objets = new Set([...R.pronoms_toniques ? Object.keys(R.pronoms_toniques) : [], ...Object.keys(R.clitiques_objets)]);
      rules.restituer_determinants = new Set([
        ...Object.keys(rules.determinants_genre), ...rules.determinants_fr,
        ...Object.keys(R.possessifs), ...R.demonstratifs,
        ...rules.determinants_restituer_exclus, ...Object.keys(R.interrogatifs),
      ]);
      rules.que_sujets = new Set(Object.keys(rules.tonique_de_sujet));
      rules.que_declencheurs = new Set(rules.faut_declencheurs_que);
      for (const verbe of rules.verbes_declencheurs_que)
        for (const pronom of rules.que_sujets) rules.que_declencheurs.add(conjuguer(verbe, pronom));
    }

    // ── Accès R hétérogène (objet ou liste selon le champ) ────────────────────
    const R = () => rules.R;
    const Rin = (field, k) => { const v = rules.R[field]; return Array.isArray(v) ? v.includes(k) : (v ? has(v, k) : false); };
    const Rget = (field, k, d) => { const v = rules.R[field]; if (!v) return d; const r = v[k]; return r === undefined ? d : r; };

    // ── État partagé par les gestionnaires ────────────────────────────────────
    function makeEtat(tokens) {
      const e = {
        tokens, ctx, i: 0, sortie: [], deja: [], conj: {}, state: { pluriel: false, nie_attente: false },
        get n() { return this.tokens.length; },
        get tok() { return this.tokens[this.i]; },
        get cle() { return this.tokens[this.i].toLowerCase(); },
        get suiv() { return this.i + 1 < this.tokens.length ? this.tokens[this.i + 1] : null; },
        emettre(mot, traduit = true) { this.sortie.push(mot); this.deja.push(traduit); },
        debut_de_phrase() { return !this.sortie.length || rules.R.ponctuation_fin_phrase.includes(last(this.sortie)); },
      };
      return e;
    }

    // ── FR→GP helpers ─────────────────────────────────────────────────────────
    function separer_inversions(tokens) {
      const sortie = [];
      for (const tok of tokens) {
        if (tok.includes("-")) {
          // Un mot à trait d'union qui est lui-même dans le lexique (ex.
          // "dépêche-toi", "grand-mère") n'est pas une inversion : on le garde
          // intact pour que le lookup dico le traduise tel quel.
          if (has(ctx.index_fr, tok.toLowerCase())) { sortie.push(tok); continue; }
          const parts = tok.split("-").filter((p) => p && p.toLowerCase() !== "t");
          if (parts.length === 2) {
            if (rules.inversion_sujets.has(parts[1].toLowerCase())) { sortie.push(parts[1], parts[0]); continue; }
            if (rules.inversion_objets.has(parts[1].toLowerCase())) { sortie.push(parts[0], parts[1]); continue; }
          }
        }
        sortie.push(tok);
      }
      return sortie;
    }

    function sujet_nominal_devant(sortie) {
      if (!sortie.length || !est_mot(last(sortie))) return false;
      const dernier = last(sortie).toLowerCase();
      if (rules.pronoms_gp.has(dernier) || rules.marqueurs.has(dernier)) return false;
      if (dernier === rules.R.marqueur_negation)
        return sortie.length >= 2 && est_mot(sortie[sortie.length - 2]) && !rules.pronoms_gp.has(sortie[sortie.length - 2].toLowerCase());
      return true;
    }

    function postposition(cle) {
      if (has(rules.R.possessifs, cle)) return rules.R.possessifs[cle];
      if (rules.R.demonstratifs.includes(cle)) return rules.R.particule_demonstrative;
      return null;
    }

    function verbe_gp(token) {
      const cle = token.toLowerCase();
      if (ctx.type_fr[cle] === "verbe" && has(ctx.index_fr, cle)) return ctx.index_fr[cle];
      const inf = trouver_infinitif(token);
      if (inf && ctx.type_fr[inf] === "verbe") return ctx.index_fr[inf];
      return null;
    }

    function participe(token) {
      const cle = token.toLowerCase();
      const inf = rules.participes_inverse[cle];
      if (inf) return has(ctx.index_fr, inf) ? inf : null;
      if (endsWithAny(cle, rules.fins_participe) || endsWithAny(cle, rules.autres_fins_participe)) {
        // force=true : la terminaison participiale prime sur un type homographe
        // non-verbe ("mangé" repas vs participe de manger).
        const i2 = trouver_infinitif(token, true);
        if (i2 && ctx.type_fr[i2] === "verbe") return i2;
      }
      // Fallback normalisé (graphies créolisées) : jamais sur un "-e" nu — une
      // forme française en "-e" (chante, travaille) est un PRÉSENT, pas un
      // participe ; les vrais participes ("-é/-ée") sont déjà captés ci-dessus.
      const norm = normalize_token(cle);
      if (norm && norm !== cle && !cle.endsWith("e") && (norm.endsWith("i") || norm.endsWith("u") || norm.endsWith("is"))) {
        const i2 = trouver_infinitif(token);
        if (i2 && ctx.type_fr[i2] === "verbe") return i2;
      }
      return null;
    }

    function emettre_verbe(verbe_tok, clitiques, sortie, deja, k) {
      const traduction = verbe_gp(verbe_tok);
      const verb_gp = traduction !== null ? traduction : verbe_tok;
      const processed = [];
      const regle = rules.R.clitique_te_gp || {};
      const cible = regle.cible, voyelles_gp = regle.voyelles_gp || "";
      for (const clitique of clitiques) {
        if (cible && clitique === cible) {
          const vl = verb_gp.toLowerCase(); let lastc = "";
          for (let z = vl.length - 1; z >= 0; z--) { const c = vl[z]; if (/[a-zà-ÿ]/i.test(c) || voyelles_gp.includes(c)) { lastc = c; break; } }
          processed.push(voyelles_gp.includes(lastc) ? (regle.apres_voyelle || clitique) : (regle.apres_consonne || clitique));
        } else processed.push(clitique);
      }
      if (traduction !== null) { sortie.push(reporter_casse(verbe_tok, traduction)); deja.push(true); }
      else { sortie.push(verbe_tok); deja.push(false); }
      // Un clitique élidé/attaché ("-w", "'w") se colle au verbe en UN token, pour
      // que le GP→FR le ré-éclate (réversibilité "wè-w" ↔ "te voit").
      for (const c of processed) {
        if (/^[-']/.test(c) && sortie.length) sortie[sortie.length - 1] = sortie[sortie.length - 1] + c;
        else { sortie.push(c); deja.push(true); }
      }
      return k + 1;
    }

    function traiter_avoir(tokens, k, n, sortie, deja, nie) {
      let marqueur_ja = false, pas_encore = false;
      while (k < n) {
        const tok = tokens[k];
        if (!est_mot(tok)) { k++; continue; }
        const bas = tok.toLowerCase();
        if (rules.R.negation_pas.includes(bas)) {
          if (k + 1 < n && tokens[k + 1].toLowerCase() === "encore") { pas_encore = true; k += 2; }
          else k++;
          continue;
        }
        if (bas === "déjà") { marqueur_ja = true; k++; continue; }
        if (bas === "encore") { pas_encore = nie; k++; continue; }
        break;
      }
      if (k >= n || participe(tokens[k]) === null) return null;
      if (pas_encore && sortie.length && last(sortie) === rules.R.marqueur_negation) {
        sortie[sortie.length - 1] = rules.R.marqueurs_supplementaires[1];
      } else if (marqueur_ja) {
        sortie.push(rules.R.marqueurs_supplementaires[0]); deja.push(true);
      }
      return k;
    }

    function traiter_etre(tok, cle, tokens, j, n, sortie, deja) {
      if (j + 3 < n && tokens[j + 1].toLowerCase() === "en" && tokens[j + 2].toLowerCase() === "train" &&
          (tokens[j + 3].toLowerCase() === "de" || tokens[j + 3].toLowerCase() === "d")) {
        const k = j + 4;
        if (k < n && est_verbe(tokens[k])) {
          if (rules.etre_imparfait.has(cle)) { sortie.push(rules.R.marqueur_passe); deja.push(true); }
          sortie.push(rules.R.marqueur_present); deja.push(true);
          return k;
        }
      }
      const suiv = j + 1 < n ? tokens[j + 1] : null;
      if (suiv === null || !est_mot(suiv)) { sortie.push("yé"); deja.push(true); return j + 1; }
      const locatifs = rules.R.locatifs_fr || ["là", "ici"];
      let kloc = j + 1;
      while (kloc < n && ["plus", "jamais", "encore", "déjà"].includes(tokens[kloc].toLowerCase())) kloc++;
      // Copule + locatif (là/ici) OU préposition locative (sur/sous/dans…) : le
      // créole n'a pas de copule ici ("le livre EST sur la table" = "liv la asou
      // tab la"). On garde juste le marqueur de temps.
      if (kloc < n && (locatifs.includes(tokens[kloc].toLowerCase()) || rules.prepositions_locatives.has(tokens[kloc].toLowerCase()))) {
        if (rules.etre_imparfait.has(cle)) { sortie.push(rules.R.marqueur_passe); deja.push(true); }
        else if (rules.etre_futur.has(cle)) { sortie.push(rules.R.marqueur_futur); deja.push(true); }
        else if (rules.etre_conditionnel.has(cle)) { sortie.push(rules.R.marqueur_passe); deja.push(true); sortie.push(rules.R.marqueur_futur); deja.push(true); }
        return j + 1;
      }
      if (rules.etre_imparfait.has(cle) && participe(suiv) !== null) { sortie.push(rules.R.marqueur_passe); deja.push(true); return j + 1; }
      if (rules.etre_formes.has(cle)) {
        let inf = participe(suiv);
        if (inf === null) {
          const i2 = trouver_infinitif(suiv);
          if (i2 && rules.R.verbes_aux_etre.includes(i2)) inf = i2;
        }
        if (inf !== null && rules.R.verbes_aux_etre.includes(inf)) {
          const gp = ctx.index_fr[inf];
          if (gp) { sortie.push(reporter_casse(suiv, gp)); deja.push(true); return j + 2; }
          return j + 1;
        }
      }
      if (Rin("possessifs", suiv.toLowerCase()) || Rin("pronoms_toniques", suiv.toLowerCase())) return j + 1;
      let k = j + 1;
      if (k < n && rules.R.adverbes_degre.includes(tokens[k].toLowerCase())) k++;
      let adj = (k < n && est_adjectif(tokens[k]));
      if (!adj && k + 1 < n) {
        const bi = tokens[k].toLowerCase() + " " + tokens[k + 1].toLowerCase();
        adj = ctx.type_fr[bi] === "adj";
      }
      if (adj) {
        if (rules.etre_imparfait.has(cle)) { sortie.push(rules.R.marqueur_passe); deja.push(true); }
        else if (rules.etre_futur.has(cle)) { sortie.push(rules.R.marqueur_futur); deja.push(true); }
        else if (rules.etre_conditionnel.has(cle)) { sortie.push(rules.R.marqueur_passe); deja.push(true); sortie.push(rules.R.marqueur_futur); deja.push(true); }
        return j + 1;
      }
      return null;
    }

    function traiter_pronom(tok, cle, tokens, i, n, sortie, deja) {
      let j = i + 1, nie = false;
      while (j < n && rules.R.negation_ne.includes(tokens[j].toLowerCase())) { nie = true; j++; }
      if (cle === "il" && j + 1 < n && tokens[j].toLowerCase() === "y" && rules.avoir_formes.has(tokens[j + 1].toLowerCase())) {
        if (nie) { sortie.push(rules.R.marqueur_negation); deja.push(true); }
        sortie.push(rules.R.traductions_fr_gp.il_y_a); deja.push(true);
        return j + 2;
      }
      if (cle === "il" && j < n && tokens[j].toLowerCase() === "faut") {
        sortie.push(reporter_casse(tok, rules.R.traductions_fr_gp.il_faut)); deja.push(true);
        return j + 1;
      }
      sortie.push(reporter_casse(tok, rules.R.pronoms_sujets[cle])); deja.push(true);
      if (nie) { sortie.push(rules.R.marqueur_negation); deja.push(true); }
      const clitiques = [], objets = rules.R.clitiques_objets;
      while (j < n && (has(objets, tokens[j].toLowerCase()) || tokens[j].toLowerCase() === "s")) {
        const bas = tokens[j].toLowerCase();
        if (bas === "se" || bas === "s") { j++; continue; }
        if ((bas === "me" && (cle === "je" || cle === "j")) || (bas === "te" && cle === "tu")) {
          let k2 = j + 1; while (k2 < n && !est_mot(tokens[k2])) k2++;
          const apres2 = k2 < n ? tokens[k2] : null;
          if (apres2 !== null && est_verbe(apres2)) { j++; continue; }
        }
        let kAfter = j + 1; while (kAfter < n && !est_mot(tokens[kAfter])) kAfter++;
        const apres = kAfter < n ? tokens[kAfter] : null;
        if (apres === null || !(est_verbe(apres) || has(objets, apres.toLowerCase()))) break;
        const forme = objets[bas]; if (forme) clitiques.push(forme);
        j = kAfter;
      }
      if (j >= n) return j;
      const suivant = tokens[j], cle_suiv = suivant.toLowerCase();
      if (rules.R.verbes_futur.includes(cle_suiv)) {
        let k = j + 1;
        while (k < n && (!est_mot(tokens[k]) || rules.R.negation_pas.includes(tokens[k].toLowerCase()) || has(objets, tokens[k].toLowerCase()))) {
          if (has(objets, tokens[k].toLowerCase()) && objets[tokens[k].toLowerCase()]) clitiques.push(objets[tokens[k].toLowerCase()]);
          k++;
        }
        if (k < n && est_verbe(tokens[k])) {
          if (rules.aller_imparfait.has(cle_suiv)) { sortie.push(rules.R.marqueur_passe); deja.push(true); }
          sortie.push(rules.R.marqueur_futur_proche); deja.push(true);
          if (clitiques.length) return emettre_verbe(tokens[k], clitiques, sortie, deja, k);
          return k;
        }
        if (rules.aller_imparfait.has(cle_suiv)) {
          for (const m of marqueurs_aspect("imparfait")) { sortie.push(m); deja.push(true); }
          sortie.push(ctx.index_fr.aller || "alé"); deja.push(true);
          return j + 1;
        }
        return j;
      }
      if (rules.venir_present.has(cle_suiv) && j + 2 < n && (tokens[j + 1].toLowerCase() === "de" || tokens[j + 1].toLowerCase() === "d") && est_verbe(tokens[j + 2])) {
        sortie.push(rules.R.traductions_fr_gp.venir_de); deja.push(true);
        return j + 2;
      }
      const avoirImp = rules.avoir_imparfait.has(cle_suiv), avoirFut = rules.avoir_futur.has(cle_suiv),
            avoirCond = rules.avoir_conditionnel.has(cle_suiv);
      if (rules.avoir_formes.has(cle_suiv) || avoirImp || avoirFut || avoirCond) {
        // Temps de l'auxiliaire avoir : on préfixe le marqueur d'aspect créole
        // (té/ké/té ké) puis on traite comme le présent (attribut/possession/
        // participe). Le présent n'ajoute aucun marqueur.
        if (avoirImp) { sortie.push(rules.R.marqueur_passe); deja.push(true); }
        else if (avoirFut) { sortie.push(rules.R.marqueur_futur); deja.push(true); }
        else if (avoirCond) { sortie.push(rules.R.marqueur_passe); deja.push(true); sortie.push(rules.R.marqueur_futur); deja.push(true); }
        let kAttr = j + 1; while (kAttr < n && !est_mot(tokens[kAttr])) kAttr++;
        if (kAttr < n && rules.avoir_attributs.has(tokens[kAttr].toLowerCase())) {
          const attr_fr = tokens[kAttr].toLowerCase();
          if (!rules.statives_fr.has(attr_fr)) { sortie.push(rules.R.traductions_fr_gp.il_y_a); deja.push(true); }
          return kAttr;
        }
        const inew = traiter_avoir(tokens, j + 1, n, sortie, deja, nie);
        if (inew !== null) return inew;
        return j;
      }
      if (rules.etre_formes.has(cle_suiv) || rules.etre_imparfait.has(cle_suiv) || rules.etre_futur.has(cle_suiv) || rules.etre_conditionnel.has(cle_suiv)) {
        const inew = traiter_etre(suivant, cle_suiv, tokens, j, n, sortie, deja);
        if (inew !== null) return inew;
        if (nie) return j + 1;
        return j;
      }
      if (est_mot(suivant) && est_verbe(suivant) && rules.R.verbes_sans_ka.includes(cle_suiv))
        return emettre_verbe(suivant, clitiques, sortie, deja, j);
      if (est_mot(suivant) && est_verbe(suivant)) {
        const irreg = rules.inverse_irreguliers[cle_suiv];
        const temps = irreg ? irreg[1] : detecter_temps(cle_suiv);
        for (const m of marqueurs_aspect(temps)) { sortie.push(m); deja.push(true); }
        if (clitiques.length) return emettre_verbe(suivant, clitiques, sortie, deja, j);
        if (ctx.type_fr[cle_suiv] !== "verbe") {
          const inf = trouver_infinitif(suivant);
          if (inf && ctx.type_fr[inf] === "verbe") { sortie.push(reporter_casse(suivant, ctx.index_fr[inf])); deja.push(true); return j + 1; }
        }
        return j;
      }
      if (clitiques.length) return emettre_verbe(suivant, clitiques, sortie, deja, j);
      return j;
    }

    // ── Gestionnaires FR→GP ───────────────────────────────────────────────────
    const HF = [];
    HF.push(function hf_flush_article(e) {
      if (!e.state.post_la || e.sortie.length <= (e.state.post_la_min || 0)) return null;
      const tok = e.tok;
      if (est_mot(tok)) {
        const t = ctx.type_fr[tok.toLowerCase()];
        if (["adj", "nom", "lieu", "num"].includes(t) || est_adjectif(tok)) return null;
      }
      e.emettre(e.state.post_la); delete e.state.post_la; delete e.state.post_la_min;
      return null;
    });
    HF.push(function hf_article_defini(e) {
      const { tokens, i, n } = e; const cle = tokens[i].toLowerCase();
      if (!rules.articles_definis_fr.has(cle)) return null;
      let j = i + 1; while (j < n && !est_mot(tokens[j])) j++;
      if (j >= n) return null;
      const suiv = tokens[j];
      if (suiv.toLowerCase() === "monde" || est_verbe(suiv) || trouver_infinitif(suiv) !== null) return null;
      if (cle === "les") { e.emettre("sé"); return i + 1; }
      // Partitif "de la / de l'" + nom de masse ("de l'eau", "de la farine") :
      // nom NU en créole ("dlo", "farin") — pas d'article postposé.
      const prevTok = i > 0 ? tokens[i - 1].toLowerCase() : null;
      if ((prevTok === "de" || prevTok === "d") && rules.noms_masse_fr.has(suiv.toLowerCase())) return i + 1;
      e.state.post_la = "la"; e.state.post_la_min = e.sortie.length;
      return i + 1;
    });
    HF.push(function hf_articles_et_est_ce(e) {
      const { tokens, i, n } = e; const cle = tokens[i].toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1].toLowerCase() : null;
      if (["le", "la", "les", "du", "de", "d", "d'"].includes(cle) && suiv === "monde") return null;
      if (rules.R.articles_supprimes.includes(cle)) {
        if (cle === "à" || cle === "en" || cle === "au") {
          if (i + 1 < n && tokens[i + 1][0] === tokens[i + 1][0].toUpperCase() && tokens[i + 1][0] !== tokens[i + 1][0].toLowerCase()) return null;
          let j = i + 1; while (j < n && rules.R.articles_supprimes.includes(tokens[j].toLowerCase())) j++;
          if (j < n && est_mot(tokens[j]) && ctx.type_fr[tokens[j].toLowerCase()] === "lieu") return null;
        }
        return i + 1;
      }
      if (cle === "est-ce" && (suiv === "que" || suiv === "qu" || suiv === "qui")) return i + 2;
      return null;
    });
    HF.push(function hf_cest(e) {
      const { tokens, i, n } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1].toLowerCase() : null;
      if (cle === "c" && suiv && rules.etre_formes.has(suiv)) {
        const apres = i + 2 < n ? tokens[i + 2] : null;
        const trad = rules.R.traductions_fr_gp;
        const isFin = apres === null || !est_mot(apres);
        e.emettre(reporter_casse(tok, isFin ? trad.c_est_fin : trad.c_est_suite));
        return i + 2;
      }
      return null;
    });
    HF.push(function hf_interrogatifs(e) {
      const { tokens, i, n, sortie } = e; const tok = tokens[i], cle = tok.toLowerCase();
      if (cle === "que" || cle === "qu" || cle === "quoi") {
        if (cle === "quoi" || !sortie.length) e.emettre(reporter_casse(tok, rules.R.interrogatifs.quoi));
        else if (i > 0 && ctx.type_fr[tokens[i - 1].toLowerCase()] === "adj") e.emettre("ki");
        return i + 1;
      }
      if (cle === "qui") { e.emettre(reporter_casse(tok, !sortie.length ? rules.R.interrogatifs.qui : "ki")); return i + 1; }
      if (cle === "quand") {
        const question = tokens.slice(i + 1).includes("?");
        e.emettre(reporter_casse(tok, question ? rules.R.interrogatifs.quand : "lè"));
        return i + 1;
      }
      if (cle === "si") { e.emettre(reporter_casse(tok, rules.R.traductions_fr_gp.si)); return i + 1; }
      if (has(rules.R.interrogatifs, cle)) { e.emettre(reporter_casse(tok, rules.R.interrogatifs[cle])); return i + 1; }
      return null;
    });
    HF.push(function hf_pronoms_toniques(e) {
      const { tokens, i, n, sortie } = e; const tok = tokens[i], cle = tok.toLowerCase();
      if (i > 0 && tokens[i - 1].toLowerCase() === "chez") return null;
      if (Rin("pronoms_toniques", cle) && (i + 1 >= n || !est_verbe(tokens[i + 1]))) {
        const comp = rules.R.comp_remplacement;
        if (sortie.length && last(sortie) === "ki" && has(comp, cle)) e.emettre(reporter_casse(tok, comp[cle]));
        else e.emettre(reporter_casse(tok, rules.R.pronoms_toniques[cle]));
        return i + 1;
      }
      return null;
    });
    HF.push(function hf_postposition(e) {
      const { tokens, i, n } = e; const cle = tokens[i].toLowerCase();
      const pp = postposition(cle);
      if (pp === null) return null;
      const STOP_NP = rules.stop_np;
      const group = [];
      let j = i + 1;
      while (j < n) {
        if (!est_mot(tokens[j])) break;
        const tl = tokens[j].toLowerCase();
        if (STOP_NP.has(tl)) break;
        if (est_verbe(tokens[j])) break;
        if (has(rules.R.pronoms_sujets, tl)) break;
        if (postposition(tl) !== null) break;
        if (rules.R.articles_supprimes && rules.R.articles_supprimes.includes(tl)) break;
        group.push(tokens[j]);
        j++;
      }
      // Le déterminant/possessif est postposé : la casse initiale (ex. "Ta"
      // en début de phrase) doit passer au nom qui devient premier, pas rester
      // sur le possessif. Si le groupe est vide, le possessif garde la casse.
      group.forEach((t, gi) => e.emettre(gi === 0 ? reporter_casse(tokens[i], t) : t, false));
      e.emettre(group.length ? pp : reporter_casse(tokens[i], pp));
      return j;
    });
    HF.push(function hf_pronom_sujet(e) {
      if (has(rules.R.pronoms_sujets, e.cle)) return traiter_pronom(e.tok, e.cle, e.tokens, e.i, e.n, e.sortie, e.deja);
      return null;
    });
    HF.push(function hf_etre(e) {
      if (rules.etre_formes.has(e.cle) || rules.etre_imparfait.has(e.cle) || rules.etre_futur.has(e.cle) || rules.etre_conditionnel.has(e.cle))
        return traiter_etre(e.tok, e.cle, e.tokens, e.i, e.n, e.sortie, e.deja);
      return null;
    });
    HF.push(function hf_avoir(e) {
      if (rules.avoir_formes.has(e.cle)) return traiter_avoir(e.tokens, e.i + 1, e.n, e.sortie, e.deja, false);
      return null;
    });
    HF.push(function hf_negation(e) {
      const { tokens, i, sortie } = e; const tok = tokens[i], cle = tok.toLowerCase();
      if (rules.R.negation_ne.includes(cle)) {
        // n'est-ce pas → pa vré (absorbe les 3 tokens)
        const { n } = e;
        let j = i + 1; while (j < n && !est_mot(tokens[j])) j++;
        if (j < n && tokens[j].toLowerCase() === "est-ce") {
          let k = j + 1; while (k < n && !est_mot(tokens[k])) k++;
          if (k < n && tokens[k].toLowerCase() === "pas") {
            e.emettre(reporter_casse(tok, "pa vré")); return k + 1;
          }
        }
        e.emettre(rules.R.marqueur_negation); return i + 1;
      }
      if (rules.R.negation_pas.includes(cle) && sortie.includes(rules.R.marqueur_negation)) {
        const gp = (rules.R.negation_mots_gp || {})[cle];
        if (gp) e.emettre(reporter_casse(tok, gp));
        return i + 1;
      }
      return null;
    });
    HF.push(function hf_comparatif_allons(e) {
      const { tokens, i, n, sortie } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1].toLowerCase() : null;
      if (cle === "aussi" && suiv && est_adjectif(suiv)) { e.emettre(reporter_casse(tok, rules.R.traductions_fr_gp.aussi_comparatif)); return i + 1; }
      if (cle === "plus" && suiv && est_adjectif(suiv)) { e.emettre(reporter_casse(tok, rules.R.traductions_fr_gp.plus_comparatif)); return i + 1; }
      if (cle === "allons" && !sortie.length) {
        if (suiv && est_verbe(tokens[i + 1])) { e.emettre(reporter_casse(tok, rules.R.traductions_fr_gp.allons)); return i + 1; }
        if (["à", "a", "au", "aux", "à la", "en"].includes(suiv)) {
          e.emettre(reporter_casse(tok, rules.R.traductions_fr_gp.allons));
          e.emettre(rules.R.traductions_fr_gp.aller);
          return i + 1;
        }
      }
      return null;
    });
    HF.push(function hf_verbe_futur(e) {
      const { tokens, i, n, sortie } = e; const cle = tokens[i].toLowerCase();
      if (rules.R.verbes_futur.includes(cle) && sortie.length && est_mot(last(sortie))) {
        let k = i + 1;
        while (k < n && (!est_mot(tokens[k]) || rules.R.negation_pas.includes(tokens[k].toLowerCase()))) k++;
        if (k < n && est_verbe(tokens[k])) { e.emettre(rules.R.marqueur_futur_proche); return k; }
      }
      return null;
    });
    HF.push(function hf_clitiques_objets(e) {
      const { tokens, i, n, sortie, deja } = e; const cle = tokens[i].toLowerCase();
      const is_strict = rules.strict_objects.has(cle), is_amb = rules.ambiguous_objects.has(cle);
      const is_pre = sujet_nominal_devant(sortie) || (sortie.length && rules.pronoms_gp.has(last(sortie).toLowerCase()));
      if (is_strict || (is_amb && is_pre)) {
        const clitiques = []; let j = i; const objets = rules.R.clitiques_objets;
        while (j < n && (has(objets, tokens[j].toLowerCase()) || tokens[j].toLowerCase() === "s")) {
          const bas = tokens[j].toLowerCase();
          if (bas === "se" || bas === "s") { j++; continue; }
          let kAfter = j + 1; while (kAfter < n && !est_mot(tokens[kAfter])) kAfter++;
          const apres = kAfter < n ? tokens[kAfter] : null;
          if (apres === null || !(est_verbe(apres) || has(objets, apres.toLowerCase()) || apres.toLowerCase() === "s")) break;
          const forme = objets[bas]; if (forme) clitiques.push(forme);
          j = kAfter;
        }
        if (j < n && est_verbe(tokens[j])) {
          const verbe_tok = tokens[j], cle_verb = verbe_tok.toLowerCase();
          if (sujet_nominal_devant(sortie) && !rules.R.verbes_sans_ka.includes(cle_verb) &&
              !endsWithAny(cle_verb, rules.fins_participe) && participe(verbe_tok) === null) {
            for (const m of marqueurs_aspect(detecter_temps(cle_verb))) e.emettre(m);
          }
          return emettre_verbe(verbe_tok, clitiques, sortie, deja, j);
        }
      }
      return null;
    });
    HF.push(function hf_se_verbe(e) {
      const { tokens, i, n } = e; const cle = tokens[i].toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      if (["se", "s", "me", "te", "m", "t"].includes(cle) && suiv !== null && est_mot(suiv)) {
        if (est_verbe(suiv)) return i + 1;
        const st = ctx.type_fr[suiv.toLowerCase()];
        if (!["nom", "lieu", "adj", "num", "prep", "adv"].includes(st)) return i + 1;
      }
      return null;
    });
    // Clitique réfléchi devant verbe ("mon père SE nomme", "l'enfant S'endort") :
    // le créole n'a pas de réfléchi ici — on saute le clitique, le verbe suit.
    HF.push(function hf_clitique_reflechi(e) {
      const { tokens, i, n } = e; const cle = tokens[i].toLowerCase();
      if ((cle === "se" || cle === "s") && i + 1 < n && est_mot(tokens[i + 1]) && est_verbe(tokens[i + 1])) return i + 1;
      return null;
    });
    HF.push(function hf_sujet_nominal_devant(e) {
      const { tokens, i, sortie } = e; const tok = tokens[i], cle = tok.toLowerCase();
      if (sujet_nominal_devant(sortie) && est_mot(tok) && !rules.R.verbes_sans_ka.includes(cle) &&
          !endsWithAny(cle, rules.fins_participe) && participe(tok) === null) {
        const inf = trouver_infinitif(tok);
        if (inf && ctx.type_fr[inf] === "verbe") {
          const irreg = rules.inverse_irreguliers[cle];
          const temps = irreg ? irreg[1] : detecter_temps(cle);
          for (const m of marqueurs_aspect(temps)) e.emettre(m);
          e.emettre(reporter_casse(tok, ctx.index_fr[inf]));
          return i + 1;
        }
      }
      return null;
    });

    // Extraction des phrases multiword sur tokens BRUTS (avant toute chirurgie
    // de tokens comme separer_inversions / eclater_traits_union). Chaque phrase
    // reconnue est remplacée par un jeton sentinelle (zone privée Unicode) qui
    // traverse les transformations intact ; sa traduction est stockée dans phMap
    // et émise telle quelle (déjà traduite) par le handler prioritaire.
    // Normalisation des clés de phrase : apostrophes unifiées, trait d'union
    // traité comme une espace (donc "comment vas-tu" == "comment vas tu" : une
    // seule entrée JSON suffit), espaces multiples réduits.
    const normAposFn = (s) => s.replace(/['']/g, "'").replace(/-/g, " ").replace(/\s+/g, " ").trim();
    function extraire_phrases(tokens, index) {
      const phMap = new Map(); const sortie = []; const n = tokens.length;
      let i = 0, ph = 0;
      while (i < n) {
        let hit = false;
        for (let len = Math.min(6, n - i); len >= 2; len--) {
          // Un span de phrase ne contient que des mots : s'il finit par une
          // ponctuation (ex. "?"), on l'exclut du span pour que le "?" reste
          // disponible à la détection interrogative ci-dessous (et en sortie).
          if (!est_mot(tokens[i + len - 1])) continue;
          const base = normAposFn(tokens.slice(i, i + len).join(" ").toLowerCase());
          const after = i + len < n ? tokens[i + len] : null;
          // Forme interrogative : si le groupe est suivi de "?", on tente d'abord
          // la clé "… ?" (plus spécifique) → permet de distinguer question et
          // réponse pour une même expression (ex. "ça va ?" vs "ça va").
          const key = (after === "?" && has(index, base + " ?")) ? base + " ?"
                    : has(index, base) ? base : null;
          // Si la clé finit par un article (la/le/les/l') et qu'un mot suit,
          // l'article appartient au nom suivant ("ferme la porte" ≠ "ferme-la").
          if (key !== null && after !== null && est_mot(after)) {
            const dernier = key.split(" ").pop();
            if (["la", "le", "les", "l'"].includes(dernier)) continue;
          }
          if (key !== null) {
            const sentinelle = String.fromCharCode(0xE000 + ph++);
            phMap.set(sentinelle, reporter_casse(tokens[i], index[key]));
            sortie.push(sentinelle); i += len; hit = true; break;
          }
        }
        if (!hit) { sortie.push(tokens[i]); i++; }
      }
      return [sortie, phMap];
    }

    // Handler prioritaire : émet la phrase pré-traduite stockée sous la sentinelle
    HF.unshift(function hf_phrase_fr(e) {
      if (e.phMap && e.phMap.has(e.tok)) { e.emettre(e.phMap.get(e.tok)); return e.i + 1; }
      return null;
    });

    // Désambiguïsation générale nom/verbe (FR→GP) : un homographe (mot ayant à la
    // fois une entrée nom ET une entrée verbe dans le dico) en contexte nominal
    // (après déterminant, préposition, nombre ou adjectif) est forcé au sens NOM.
    // En contexte verbal (après pronom sujet / négation), on laisse le pipeline
    // verbe conjuguer. Aucune règle par mot : il suffit des deux entrées dico.
    HF.splice(1, 0, function hf_homographe_fr(e) {
      const { tokens, i } = e; const cle = tokens[i].toLowerCase();
      if (!has(ctx.index_fr_nom, cle) || !has(ctx.index_fr_verbe, cle)) return null;
      const prev = i > 0 ? tokens[i - 1].toLowerCase() : null;
      if (prev === null) return null;
      if (has(rules.R.pronoms_sujets, prev) || rules.R.negation_ne.includes(prev)) return null; // verbal → pipeline verbe
      const prevType = ctx.type_fr[prev];
      const nominal = rules.restituer_determinants.has(prev) || rules.determinants_fr.has(prev) ||
        rules.prepositions_contexte.has(prev) || rules.articles_clause.has(prev) ||
        rules.nombres_fr.has(prev) || prevType === "adj" || prevType === "num";
      if (nominal) { e.emettre(reporter_casse(tokens[i], ctx.index_fr_nom[cle])); return i + 1; }
      return null;
    });

    // "un/une" article indéfini (devant nom ou adjectif) → "on" ; sinon (nombre,
    // pronom) → traduction par défaut "yonn". Ex. "un chien" = "on chyen".
    HF.splice(2, 0, function hf_un_article(e) {
      const { tokens, i, n } = e; const cle = tokens[i].toLowerCase();
      if (cle !== "un" && cle !== "une") return null;
      let j = i + 1; while (j < n && !est_mot(tokens[j])) j++;
      if (j >= n) return null;
      if (["nom", "lieu"].includes(classer_fr(tokens[j])) || est_adjectif(tokens[j])) {
        e.emettre(reporter_casse(tokens[i], rules.R.traductions_fr_gp.article_indefini || "on")); return i + 1;
      }
      return null;
    });

    function grammaire_fr_vers_gp(tokens) {
      const [bruts, phMap] = extraire_phrases(tokens, ctx.phrases_fr_gp);
      const e = makeEtat(separer_inversions(bruts));
      e.phMap = phMap;
      while (e.i < e.n) {
        let matched = false;
        for (const h of HF) { const r = h(e); if (r !== null && r !== undefined) { e.i = r; matched = true; break; } }
        if (!matched) { e.emettre(e.tok, false); e.i += 1; }
      }
      if (e.state.post_la) { e.emettre(e.state.post_la); delete e.state.post_la; }
      // Réorganisation "ankò"
      const sortie = e.sortie, deja = e.deja; let iAnk = 0; const nAnk = sortie.length;
      while (iAnk < nAnk) {
        if (sortie[iAnk].toLowerCase() === "ankò") {
          let target = iAnk;
          while (target + 1 < nAnk) {
            const nxt = sortie[target + 1];
            if (rules.boundaries.has(nxt.toLowerCase()) || /^[^\p{L}\p{N}_]+$/u.test(nxt)) break;
            target++;
          }
          if (target > iAnk) {
            const at = sortie[iAnk], ad = deja[iAnk];
            for (let idx = iAnk; idx < target; idx++) { sortie[idx] = sortie[idx + 1]; deja[idx] = deja[idx + 1]; }
            sortie[target] = at; deja[target] = ad; iAnk = target;
          }
        }
        iAnk++;
      }
      return [sortie, deja];
    }

    // ── GP→FR helpers & handlers ──────────────────────────────────────────────
    function etre_formes_gp() { return new Set(rules.R.etre_formes_gp || []); }

    function lire_marqueurs(tokens, j, n) {
      let passe = false; const mp = normalize_token(rules.R.marqueur_passe);
      if (j < n && normalize_token(tokens[j].toLowerCase()) === mp) { passe = true; j++; }
      const marqueur = j < n ? normalize_token(tokens[j].toLowerCase()) : null;
      if (marqueur === normalize_token(rules.R.marqueur_futur_proche)) return [passe ? "futur_proche_passe" : "futur_proche", null, j + 1];
      if (marqueur === normalize_token(rules.R.marqueur_present)) return [passe ? "imparfait" : "present", null, j + 1];
      if (marqueur === normalize_token(rules.R.marqueur_futur)) return [passe ? "conditionnel" : "futur", null, j + 1];
      if (marqueur === "ja") return ["passe", "déjà", j + 1];
      if (passe) return ["passe", null, j];
      return [null, null, j];
    }

    function eclater_traits_union(tokens) {
      const poss2 = rules.R.possessifs_deux_mots || {};
      const fus = []; let i = 0; const n = tokens.length;
      while (i < n) {
        if (i + 1 < n) {
          const paire = tokens[i].toLowerCase() + " " + tokens[i + 1].toLowerCase();
          if (has(poss2, paire)) {
            let f = poss2[paire];
            if (tokens[i][0] === tokens[i][0].toUpperCase() && tokens[i][0] !== tokens[i][0].toLowerCase()) f = majuscule(f);
            fus.push(f); i += 2; continue;
          }
        }
        fus.push(tokens[i]); i++;
      }
      const particules = new Set([rules.R.particule_demonstrative, "la", "lan"]);
      const clitiques = new Set(rules.R.clitiques_postposes ? Object.keys(rules.R.clitiques_postposes) : []);
      const sortie = [];
      for (const tok of fus) {
        if (tok.toLowerCase() === "pani") {
          const ec = rules.R.eclat_pani;
          const pPart = (tok[0] === tok[0].toUpperCase() && tok[0] !== tok[0].toLowerCase())
            ? ec.prefixe.charAt(0).toUpperCase() + ec.prefixe.slice(1).toLowerCase() : ec.prefixe;
          sortie.push(pPart, ec.suffixe); continue;
        }
        if (tok.includes("-") && !rules.possessifs_gp[tok.toLowerCase()]) {
          const idx = tok.lastIndexOf("-");
          const base = tok.slice(0, idx), fin = tok.slice(idx + 1);
          if (base && particules.has(fin.toLowerCase())) { sortie.push(base, fin); continue; }
          if (base && clitiques.has(fin.toLowerCase())) { sortie.push(base, "-" + fin.toLowerCase()); continue; }
          // Suffixe possessif contracté ("kòn-ay" = "kòn a-y" = sa corne).
          // On rétablit la forme espacée que gère déjà la postposition possessive.
          const possSuff = { ay: "a-y", aw: "a-w", ayo: "a-yo", anou: "a-nou", "azòt": "a-zòt", azot: "a-zòt" };
          if (base && has(possSuff, fin.toLowerCase())) { sortie.push(base, possSuff[fin.toLowerCase()]); continue; }
          // Possessif contracté générique "a-<mot>" (ex. "bòdaj a-route" = "bòdaj
          // a route" = bord de route) : la particule possessive "a" collée à un
          // mot. On rétablit la forme espacée, mais seulement si le tout n'est
          // pas déjà un mot GP connu (les possessifs a-y/a-w sont traités plus haut).
          if (base.toLowerCase() === "a" && fin && !has(ctx.index_gp, tok.toLowerCase())) {
            sortie.push(base, fin); continue;
          }
        }
        sortie.push(tok);
      }
      return sortie;
    }

    function traiter_pronom_gp(tok, cle, tokens, i, n, sortie, deja, conj) {
      const pronom_fr = rules.R.pronoms_creole_francais[cle];
      let j = i + 1; while (j < n && !est_mot(tokens[j]) && !est_sentinelle(tokens[j])) j++;
      // Phrase pré-traduite juste après le pronom : pronom emphatique → forme
      // TONIQUE ("Mwen [kanta mwen…]" = "Moi pour ma part…"), puis on rend la
      // main pour que le handler prioritaire de phrases émette la sentinelle.
      if (j < n && est_sentinelle(tokens[j])) {
        const ton = rules.toniques_gp[cle] || pronom_fr;
        sortie.push(reporter_casse(tok, ton)); deja.push(true);
        return j;
      }
      sortie.push(reporter_casse(tok, pronom_fr)); deja.push(true);
      let nie = false;
      if (j < n && tokens[j].toLowerCase() === rules.R.marqueur_negation) {
        nie = true; sortie.push("ne"); deja.push(true); j++;
        while (j < n && !est_mot(tokens[j])) j++;
      }
      const isPoko = () => j < n && (rules.R.poko_formes.includes(tokens[j].toLowerCase()) ||
        (rules.R.poko_prefixes.includes(tokens[j].toLowerCase()) && j + 1 < n && rules.R.poko_suffixes.includes(tokens[j + 1].toLowerCase())));
      if (isPoko()) {
        j += rules.R.poko_formes.includes(tokens[j].toLowerCase()) ? 1 : 2;
        if (!nie) { sortie.push("ne"); deja.push(true); }
        if (j < n && est_mot(tokens[j])) {
          let skipped = null;
          if (est_adverbe_gp(tokens[j])) {
            const advGp = tokens[j].toLowerCase(); const advFr = ctx.index_gp[advGp] !== undefined ? ctx.index_gp[advGp] : advGp;
            skipped = reporter_casse(tokens[j], advFr); j++; while (j < n && !est_mot(tokens[j])) j++;
          }
          if (j < n && est_mot(tokens[j])) conj[sortie.length] = [pronom_fr, "passe", true, skipped ? "encore " + skipped : "encore"];
        }
        return j;
      }
      if (j + 1 < n && tokens[j].toLowerCase() === rules.R.traductions_fr_gp.venir_de && est_verbe_gp(tokens[j + 1])) {
        sortie.push(conjuguer("venir", pronom_fr)); deja.push(true); sortie.push("de"); deja.push(true); return j + 1;
      }
      if (j + 1 < n && (tokens[j].toLowerCase() === "fèk" || tokens[j].toLowerCase() === "fek") && est_verbe_gp(tokens[j + 1])) {
        sortie.push(conjuguer("venir", pronom_fr)); deja.push(true); sortie.push("de"); deja.push(true); return j + 1;
      }
      if (j < n && ctx.index_gp[tokens[j].toLowerCase()] === "avoir") {
        let k = j + 1; while (k < n && !est_mot(tokens[k])) k++;
        if (k < n && est_verbe_gp(tokens[k])) { conj[sortie.length] = [pronom_fr, "passe", nie, null]; return k; }
      }
      let temps, adverbe; [temps, adverbe, j] = lire_marqueurs(tokens, j, n);
      if (isPoko()) {
        j += rules.R.poko_formes.includes(tokens[j].toLowerCase()) ? 1 : 2;
        if (!nie) { sortie.push("ne"); deja.push(true); }
        if (j < n && est_mot(tokens[j])) {
          let skipped = null;
          if (est_adverbe_gp(tokens[j])) {
            const advGp = tokens[j].toLowerCase(); const advFr = ctx.index_gp[advGp] !== undefined ? ctx.index_gp[advGp] : advGp;
            skipped = reporter_casse(tokens[j], advFr); j++; while (j < n && !est_mot(tokens[j])) j++;
          }
          if (j < n && est_mot(tokens[j])) conj[sortie.length] = [pronom_fr, temps || "passe", true, skipped ? "encore " + skipped : "encore"];
        }
        return j;
      }
      if (temps === "futur_proche" || temps === "futur_proche_passe") {
        const aller = conjuguer("aller", pronom_fr, temps === "futur_proche_passe" ? "imparfait" : "present");
        sortie.push(aller); deja.push(true);
        if (nie) { sortie.push("pas"); deja.push(true); }
        return j;
      }
      if (j < n && (tokens[j].toLowerCase() === "la" || tokens[j].toLowerCase() === "lan") && (j + 1 >= n || !est_mot(tokens[j + 1]) || temps !== null)) {
        sortie.push(conjuguer("être", pronom_fr, temps || "present")); deja.push(true);
        if (nie) { sortie.push("pas"); deja.push(true); }
        if (adverbe) { sortie.push(adverbe); deja.push(true); }
        sortie.push("là"); deja.push(true); return j + 1;
      }
      if (temps === null && sortie.length >= 2 && sortie[sortie.length - 2].toLowerCase() === "que") temps = "subjonctif_present";
      let skipped_adverb = null;
      if (j < n && est_mot(tokens[j]) && est_adverbe_gp(tokens[j])) {
        const advGp = tokens[j].toLowerCase(); const advFr = ctx.index_gp[advGp] !== undefined ? ctx.index_gp[advGp] : advGp;
        skipped_adverb = reporter_casse(tokens[j], advFr); j++; while (j < n && !est_mot(tokens[j])) j++;
        if (j < n && rules.marqueurs.has(tokens[j].toLowerCase())) {
          let t2, a2; [t2, a2, j] = lire_marqueurs(tokens, j, n);
          if (t2) temps = t2; if (a2) adverbe = a2;
        }
      }
      if (j < n && est_mot(tokens[j])) {
        if (tokens[j].toLowerCase() === "an" && j + 1 < n && est_mot(tokens[j + 1])) {
          const bi = "an " + tokens[j + 1].toLowerCase();
          let etat = ctx.index_gp[bi];
          if (etat === undefined && j + 2 < n && est_mot(tokens[j + 2])) {
            const tri = bi + " " + tokens[j + 2].toLowerCase();
            etat = (rules.R.locutions_gp_fr || {})[tri];
          }
          if (etat && etat.startsWith("en ")) {
            sortie.push(conjuguer("être", pronom_fr, temps || "present")); deja.push(true);
            if (nie) { sortie.push("pas"); deja.push(true); }
            return j;
          }
        }
        const attr_fr = ctx.index_gp[tokens[j].toLowerCase()];
        if (attr_fr && rules.avoir_attributs.has(attr_fr.toLowerCase()) && !est_verbe_gp(tokens[j])) {
          sortie.push(conjuguer("avoir", pronom_fr, temps || "present")); deja.push(true);
          if (nie) { sortie.push("pas"); deja.push(true); }
          sortie.push(reporter_casse(tokens[j], attr_fr)); deja.push(true);
          return j + 1;
        }
        if (est_verbe_gp(tokens[j])) {
          const conjSub = ["que", "qu'il", "qu'elle", "qu'on", "si", "quoi", "ke", "k"];
          const enSub = sortie.length >= 2 && (conjSub.includes(last(sortie).toLowerCase()) || conjSub.includes(sortie[sortie.length - 2].toLowerCase()));
          if (temps === null && !enSub) {
            const infNu = ctx.index_gp[tokens[j].toLowerCase()];
            if (infNu && (rules.R.verbes_aux_etre || []).includes(infNu)) temps = "passe";
            else if (sortie.length && last(sortie).toLowerCase() === "quand") temps = "passe";
          }
          conj[sortie.length] = [pronom_fr, temps || "present", nie, skipped_adverb || adverbe];
        } else if (temps === "present") {
          conj[sortie.length] = [pronom_fr, temps, nie, skipped_adverb || adverbe];
        } else if (skipped_adverb !== null) {
          sortie.push(conjuguer("être", pronom_fr, "present")); deja.push(true);
          if (nie) { sortie.push("pas"); deja.push(true); }
          sortie.push(skipped_adverb); deja.push(true);
        } else if (temps !== null) {
          sortie.push(conjuguer("être", pronom_fr, temps)); deja.push(true);
          if (nie) { sortie.push("pas"); deja.push(true); }
        }
      } else if (nie) { sortie.push("pas"); deja.push(true); }
      return j;
    }

    const HG = [];
    HG.push(function h_locutions(e) {
      if (e.suiv === null) return null;
      const loc = rules.R.locutions_gp_fr || {};
      if (e.i + 2 < e.n && est_mot(e.tokens[e.i + 2])) {
        const tri = e.cle + " " + e.suiv.toLowerCase() + " " + e.tokens[e.i + 2].toLowerCase();
        if (has(loc, tri)) { e.emettre(loc[tri]); return e.i + 3; }
      }
      const bi = e.cle + " " + e.suiv.toLowerCase();
      if (has(loc, bi)) { e.emettre(loc[bi]); return e.i + 2; }
      return null;
    });
    HG.push(function h_ponctuation(e) {
      if (e.cle === "." || e.cle === "!" || e.cle === "?") e.state.pluriel = false;
      if (e.cle === "dem") { e.state.pluriel = true; e.emettre(e.tok, false); return e.i + 1; }
      return null;
    });
    HG.push(function h_clitiques_post(e) {
      const cle = e.cle;
      if (cle.startsWith("-") && has(rules.R.clitiques_postposes, cle.slice(1))) { e.emettre(rules.R.clitiques_postposes[cle.slice(1)]); return e.i + 1; }
      return null;
    });
    HG.push(function h_article_la_lan(e) {
      const { tokens, i, sortie } = e; const cle = tokens[i].toLowerCase();
      const aIsArticle = (cle === "a" && (e.suiv === null || !est_verbe_gp(e.suiv) || !est_mot(e.suiv)));
      if ((cle === "la" || cle === "lan" || aIsArticle) && sortie.length && est_mot(last(sortie))) {
        const prec = last(sortie).toLowerCase();
        const emisEstNom = ["nom", "lieu"].includes(classer_fr(prec));
        if (rules.etre_formes.has(prec) || rules.etre_imparfait.has(prec) || (i > 0 && est_verbe_gp(tokens[i - 1]) && !emisEstNom)) { e.emettre("là"); return i + 1; }
        const precIsNom = rules.marqueurs.has(prec) && ["nom", "lieu"].includes(type_gp(prec));
        if (!Rin("pronoms_creole_francais", prec) && (!rules.marqueurs.has(prec) || precIsNom)) {
          if (aIsArticle && ctx.type_fr[prec] === "adv") return i + 1;
          const dejaDet = sortie.length >= 2 && (rules.determinants_fr.has(sortie[sortie.length - 2].toLowerCase()) || ["aucun", "aucune", "un"].includes(sortie[sortie.length - 2].toLowerCase()));
          if (!dejaDet) e.emettre(cle === "a" ? "la" : cle);
          return i + 1;
        }
      }
      return null;
    });
    // "san" homographe : après un nombre = "cent(s)" ("twa san moun" = trois
    // cents gens), sinon "sang"/"sans" via le dico.
    HG.push(function h_san_cent(e) {
      const { tokens, i, n } = e; if (tokens[i].toLowerCase() !== "san" || i === 0) return null;
      const prevFr = (fr_de_gp(tokens[i - 1]) || "").toLowerCase();
      if (!rules.nombres_fr.has(prevFr) && !/^\d+$/.test(tokens[i - 1])) return null;
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      const suivNombre = suiv && (rules.nombres_fr.has((fr_de_gp(suiv) || "").toLowerCase()) || /^\d+$/.test(suiv));
      e.emettre(reporter_casse(tokens[i], suivNombre ? "cent" : "cents"));
      return i + 1;
    });
    HG.push(function h_interrogatifs(e) {
      const { tokens, i, n, state } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      // "Ka" en tête de phrase suivi d'un pronom sujet = interrogatif ("Ka ou
      // vlé ?" = qu'est-ce que tu veux ?) — ailleurs "ka" reste le marqueur
      // d'aspect, d'où son exclusion de l'inverse général.
      if (cle === "ka" && e.debut_de_phrase() && suiv !== null && rules.pronoms_gp.has(suiv.toLowerCase())) {
        e.emettre(reporter_casse(tok, "qu'est-ce que"));
        return i + 1;
      }
      if (has(rules.interrogatifs_inverse, cle)) {
        e.emettre(reporter_casse(tok, rules.interrogatifs_inverse[cle]));
        // "combien de" seulement devant un nom — pas devant un pronom ("konmen
        // i kout" = combien il coûte, pas "combien de il").
        if (rules.interrogatifs_inverse[cle] === "combien" && suiv !== null && est_mot(suiv) &&
            !est_verbe_gp(suiv) && !rules.pronoms_gp.has(suiv.toLowerCase())) { e.emettre("de"); state.pluriel = true; }
        return i + 1;
      }
      return null;
    });
    HG.push(function h_comparatif(e) {
      const { tokens, i, sortie, deja } = e; const cle = tokens[i].toLowerCase();
      if (cle === "pasé" && sortie.length && est_mot(last(sortie)) && est_adjectif_gp(last(sortie))) {
        const adjPos = sortie.length - 1;
        const dejaCmp = adjPos > 0 && ["plus", "pli", "moins"].includes(sortie[adjPos - 1].toLowerCase());
        if (!dejaCmp) { sortie.splice(adjPos, 0, "plus"); deja.splice(adjPos, 0, true); }
        e.emettre("que"); return i + 1;
      }
      return null;
    });
    HG.push(function h_demonstratif_possessif(e) {
      const { tokens, i } = e; const cle = tokens[i].toLowerCase();
      if (i > 0 && tokens[i - 1].toLowerCase() === "lakay") return null;
      if (has(rules.possessifs_gp, cle) || cle === rules.R.particule_demonstrative) { e.emettre(cle); return i + 1; }
      return null;
    });
    HG.push(function h_se(e) {
      const { tokens, i, n, state, sortie } = e; const tok = tokens[i], cle = tok.toLowerCase();
      if (cle !== "sé") return null;
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      if (suiv === null || !est_mot(suiv)) return null;
      const suivL = suiv.toLowerCase();
      const estPronom = Rin("pronoms_creole_francais", suivL);
      // "sé" précédé d'un pronom sujet ("ou sé…", "an sé…") = copule (est), jamais pluriel
      let prevSrc = null; for (let k = i - 1; k >= 0; k--) { if (est_mot(tokens[k])) { prevSrc = tokens[k].toLowerCase(); break; } }
      const copuleApresPronom = prevSrc !== null && rules.pronoms_gp.has(prevSrc);
      // Marqueur de pluriel "sé" (= les) : groupe nominal (noms + adjectifs)
      // fermé plus loin par "la"/"lan", même avec adjectif/composé intercalé
      // (ex. "sé ti moun la", "sé tèt kaz wouj la"). On s'arrête au premier mot
      // qui n'appartient pas au groupe nominal (verbe, pronom, marqueur, "ki").
      let pluriel = false;
      if (!estPronom && !copuleApresPronom) {
        let nomVu = false;
        for (let j = i + 1, vus = 0; j < n && vus < 6; j++) {
          const t = tokens[j]; if (!est_mot(t)) continue;
          const tl = t.toLowerCase();
          if (tl === "pi" || tl === "pli") break; // comparatif → superlatif prédicatif ("sé pi bèl la" = c'est le plus beau), pas pluriel
          // "sé [adjectif] la" sans nom = superlatif prédicatif ("sé miyò la" =
          // c'est le meilleur), pas un pluriel.
          if (tl === "la" || tl === "lan") { pluriel = nomVu; break; }
          if (est_adjectif_gp(t) && !["nom", "lieu"].includes(type_gp(t))) { vus++; continue; }
          nomVu = true;
          // "sé" + nom(s) + marqueur d'aspect : groupe nominal sujet pluriel
          // ("sé pwason ka najé" = LES poissons nagent, pas "c'est des poissons").
          if (vus > 0 && rules.marqueurs.has(tl)) { pluriel = true; break; }
          if (est_verbe_gp(t) || rules.pronoms_gp.has(tl) || rules.marqueurs.has(tl) || tl === "ki") break;
          vus++;
        }
      }
      // "sé" précédé d'une préposition française déjà émise (asou/adan/èvè…) => pluriel
      const PREP_FR = rules.prepositions_contexte;
      const prevFr = sortie.length ? last(sortie).toLowerCase() : null;
      if (!estPronom && (pluriel || (prevFr && PREP_FR.has(prevFr)))) {
        e.emettre(reporter_casse(tok, rules.R.traductions_gp_fr.se_les)); state.pluriel = true; return i + 1;
      }
      if (e.debut_de_phrase()) {
        e.emettre(reporter_casse(tok, rules.R.traductions_gp_fr.se_cest));
        if (estPronom) {
          const ton = rules.toniques_gp[suivL];
          if (ton) { e.emettre(ton); return i + 2; }
        }
        return i + 1;
      }
      return null;
    });
    HG.push(function h_tout(e) {
      const { tokens, i, n, state, conj, sortie } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      if ((cle === "tout" || cle === "tou") && suiv !== null && est_mot(suiv) && !est_verbe_gp(suiv)) {
        if (suiv.toLowerCase() === "moun" || suiv.toLowerCase() === "monn") {
          e.emettre(reporter_casse(tok, "tout le monde")); state.pluriel = false;
          let j = i + 2; while (j < n && !est_mot(tokens[j])) j++;
          let temps, adverbe, j2; [temps, adverbe, j2] = lire_marqueurs(tokens, j, n);
          if (j2 < n && est_verbe_gp(tokens[j2])) { conj[sortie.length] = ["il", temps || "present", false, adverbe]; return j2; }
          if (temps !== null) { e.emettre(conjuguer("être", "il", temps)); return j2; }
          return i + 2;
        }
        if (rules.demonstratifs_gp.has(suiv.toLowerCase())) { e.emettre(reporter_casse(tok, "tout")); return i + 1; }
        e.emettre(reporter_casse(tok, rules.R.traductions_gp_fr.tout));
        e.emettre(rules.R.traductions_gp_fr.se_les); state.pluriel = true; return i + 1;
      }
      return null;
    });
    HG.push(function h_nom_avant_la(e) {
      // Désambiguïsation nom/verbe : un mot suivi de l'article "la"/"lan" est un nom
      // défini (ex. "maché la" = le marché, pas "marche/marcher"). On n'intervient
      // que si le sens courant est verbal mais qu'un sens nominal existe, et pas
      // après un marqueur d'aspect (ka/ké/té…) ou un pronom (là c'est un vrai verbe).
      const { tokens, i, n } = e; const tok = tokens[i], cle = tok.toLowerCase();
      if (!est_mot(tok) || !has(ctx.index_gp_nom, cle) || !est_verbe_gp(tok)) return null;
      let prev = null; for (let k = i - 1; k >= 0; k--) { if (est_mot(tokens[k])) { prev = tokens[k].toLowerCase(); break; } }
      if (prev !== null && (rules.marqueurs.has(prev) || rules.pronoms_gp.has(prev))) return null;
      let j = i + 1; while (j < n && !est_mot(tokens[j])) j++;
      if (j >= n) return null;
      const sl = tokens[j].toLowerCase();
      if (sl !== "la" && sl !== "lan") return null;
      e.emettre(reporter_casse(tok, ctx.index_gp_nom[cle]));
      return i + 1;
    });
    HG.push(function h_negation_debut(e) {
      const { tokens, i, n, conj, sortie } = e; const cle = tokens[i].toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null; const neg = rules.R.marqueur_negation;
      if ((cle === neg || cle === "pas") && e.debut_de_phrase() && suiv !== null && suiv.toLowerCase() !== "ni" && est_mot(suiv) && est_verbe_gp(suiv)) {
        e.emettre("ne"); conj[sortie.length] = ["tu", "imperatif", true, null]; return i + 1;
      }
      return null;
    });
    HG.push(function h_ni(e) {
      const { tokens, i, n } = e; const cle = tokens[i].toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null; const neg = rules.R.marqueur_negation;
      if (e.debut_de_phrase() && (cle === "ni" || (cle === neg && suiv !== null && suiv.toLowerCase() === "ni"))) {
        const ni = rules.R.patterns_ni_gp; const nie = cle === neg; let idx = nie ? i + 2 : i + 1;
        if (nie && idx < n && tokens[idx].toLowerCase() === "pon") { for (const m of ni.pa_ni_pon) e.emettre(m); return idx + 1; }
        for (const m of (nie ? ni.pa_ni : ni.ni)) e.emettre(m);
        // Pas de "du" forcé ici : la restitution d'articles générale choisit le
        // bon déterminant (des/du/de l'/beaucoup de…) selon le nom qui suit.
        return idx;
      }
      return null;
    });
    HG.push(function h_il_faut(e) {
      const { tokens, i, n } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      const formes = [rules.R.traductions_fr_gp.il_faut, "fok", "fo"];
      if (formes.includes(cle) && e.debut_de_phrase() && suiv !== null) {
        const t = rules.R.traductions_gp_fr;
        e.emettre(reporter_casse(tok, t.fo_il)); e.emettre(t.fo_faut);
        if (Rin("pronoms_creole_francais", suiv.toLowerCase())) e.emettre(t.fo_que);
        return i + 1;
      }
      return null;
    });
    HG.push(function h_qui(e) {
      const { tokens, i, n, sortie, conj, state } = e; const cle = tokens[i].toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      if (cle === "ki" && sortie.length) {
        if (suiv !== null && has(rules.toniques_gp, suiv.toLowerCase())) { e.emettre("que"); e.emettre(rules.toniques_gp[suiv.toLowerCase()]); return i + 2; }
        else if (suiv !== null && etre_formes_gp().has(suiv.toLowerCase())) {
          if (last(sortie).toLowerCase() !== "qui") e.emettre("qui");
          e.emettre("est");
          return (suiv.toLowerCase() === "yé" || suiv.toLowerCase() === "sé") ? i + 2 : i + 1;
        } else {
          e.emettre("qui");
          if (suiv !== null && est_mot(suiv) && est_verbe_gp(suiv)) {
            const pronom = state.pluriel ? "ils" : "il";
            const [, , jRel] = lire_marqueurs(tokens, i + 1, n);
            if (jRel > i + 1) { /* marqueur géré par h_marqueurs_aspect */ }
            else conj[sortie.length] = [pronom, "present", false, null];
          }
          return i + 1;
        }
      }
      return null;
    });
    HG.push(function h_ba(e) {
      const { tokens, i, n, sortie } = e; const cle = tokens[i].toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      if (rules.R.declencheurs_ba.includes(cle) && suiv !== null && Rin("pronoms_creole_francais", suiv.toLowerCase())) {
        const ton = rules.toniques_gp[suiv.toLowerCase()]; let pv = false;
        if (sortie.length) { const lw = last(sortie); if (est_verbe(lw) || est_verbe_gp(lw)) pv = true; }
        if (pv) { e.emettre("à"); e.emettre(ton); return i + 2; }
        if (e.debut_de_phrase()) { e.emettre(rules.R.traductions_gp_fr.ba_donner); e.emettre(ton); return i + 2; }
      }
      if (rules.R.declencheurs_ba.includes(cle) && suiv !== null && est_mot(suiv) && !est_verbe_gp(suiv) &&
          !rules.marqueurs.has(suiv.toLowerCase()) && sortie.length && est_mot(last(sortie)) &&
          (est_verbe(last(sortie)) || est_verbe_gp(last(sortie)))) { e.emettre("à"); return i + 1; }
      return null;
    });
    HG.push(function h_particule_a(e) {
      const { tokens, i, n, sortie, deja, conj } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      if (cle === "a" && sortie.length && est_mot(last(sortie))) {
        const prevGp = last(sortie).toLowerCase();
        const prevIsNoun = ["nom", "lieu"].includes(type_gp(prevGp));
        if (suiv === null || !est_mot(suiv)) { if (prevIsNoun) { e.emettre("la"); return i + 1; } }
        else {
          const sl = suiv.toLowerCase();
          const st = ctx.type_fr[ctx.index_gp[sl] !== undefined ? ctx.index_gp[sl] : sl];
          const isPrepVerb = st === "prep" || st === "verbe" || est_verbe_gp(suiv);
          const isMarq = rules.marqueurs.has(sl);
          const isDet = st === "adj" || st === "num" || (rules.R.determinants_gp || []).includes(sl);
          const isAdv = st === "adv" || est_adverbe_gp(suiv);
          if (prevIsNoun && (isPrepVerb || isMarq || isDet || isAdv)) { e.emettre("la"); return i + 1; }
          if (isMarq) { e.emettre("la"); return i + 1; }
          if ((suiv[0] === suiv[0].toUpperCase() && suiv[0] !== suiv[0].toLowerCase()) || est_lieu_gp(suiv)) e.emettre("à");
          else e.emettre(rules.R.traductions_gp_fr.a_de);
          return i + 1;
        }
      }
      const suivPred = suiv !== null && est_mot(suiv) && (rules.marqueurs.has(suiv.toLowerCase()) || est_verbe_gp(suiv));
      if (has(rules.R.clitiques_postposes, cle) && !suivPred && i > 0 && est_verbe_gp(tokens[i - 1])) {
        const clitique = reporter_casse(tok, rules.R.clitiques_postposes[cle]);
        if (deja && sortie.length && est_mot(last(sortie)) && est_verbe_gp(last(sortie))) {
          const insertPos = sortie.length - 1;
          sortie.splice(insertPos, 0, clitique); deja.splice(insertPos, 0, true);
          if (conj) {
            const ks = Object.keys(conj).map(Number).filter((k) => k >= insertPos).sort((a, b) => b - a);
            for (const k of ks) { conj[k + 1] = conj[k]; delete conj[k]; }
          }
        } else e.emettre(clitique);
        return i + 1;
      }
      if (rules.R.article_indefini_gp.includes(cle) && i > 0 && est_verbe_gp(tokens[i - 1]) &&
          suiv !== null && est_mot(suiv) && !est_verbe_gp(suiv) && !rules.marqueurs.has(suiv.toLowerCase())) {
        if ((suiv[0] === suiv[0].toUpperCase() && suiv[0] !== suiv[0].toLowerCase()) || est_lieu_gp(suiv)) return null;
        e.emettre(rules.R.traductions_gp_fr.article_indefini); return i + 1;
      }
      return null;
    });
    HG.push(function h_imperatif(e) {
      const { tokens, i, sortie, conj } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const notPron = !Rin("pronoms_creole_francais", cle);
      const clauseImp = tokens.slice(i).includes("!") || (!sortie.length && notPron) || (sortie.length && (last(sortie) === "," || last(sortie) === ";"));
      if (e.debut_de_phrase() && est_mot(tok) && est_verbe_gp(tok) && clauseImp) {
        conj[sortie.length] = ["tu", "imperatif", false, null]; e.emettre(tok, false); return i + 1;
      }
      return null;
    });
    HG.push(function h_possessif_mwen(e) {
      if (e.cle !== "mwen" || !e.sortie.length || !est_mot(last(e.sortie))) return null;
      const prev = last(e.sortie).toLowerCase();
      let nomFr;
      if (e.deja.length && last(e.deja)) nomFr = prev;
      else nomFr = fr_de_gp(prev);
      if (nomFr === null || !["nom", "lieu"].includes(ctx.type_fr[nomFr])) return null;
      const tokGp = e.sortie.pop(); e.deja.pop();
      const genre = ctx.genre_fr[nomFr] !== undefined ? ctx.genre_fr[nomFr] : "m";
      let det = genre === "f" ? "ma" : "mon";
      if (tokGp[0] === tokGp[0].toUpperCase() && tokGp[0] !== tokGp[0].toLowerCase()) det = majuscule(det);
      e.emettre(det); e.emettre(nomFr); return e.i + 1;
    });
    HG.push(function h_pronoms(e) {
      const { tokens, i, n, sortie, deja, conj } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      // Pronom directement APRÈS un verbe (et pas sujet d'une sous-proposition) :
      // position OBJET → clitique français ("chyen varé mwen" = le chien M'attrape,
      // pas "attrape je"). placer_clitiques le remettra devant le verbe.
      if (Rin("pronoms_creole_francais", cle) && i > 0 && est_mot(tokens[i - 1]) && est_verbe_gp(tokens[i - 1]) &&
          (suiv === null || !est_mot(suiv) || !(rules.marqueurs.has(suiv.toLowerCase()) || est_verbe_gp(suiv) || rules.pronoms_gp.has(suiv.toLowerCase())))) {
        const objet = rules.R.clitiques_postposes[cle] || ({ ou: "te", i: "le" })[cle];
        if (objet) { e.emettre(objet); return i + 1; }
      }
      if (Rin("pronoms_creole_francais", cle)) {
        if (cle === "yo" && sortie.length && est_mot(last(sortie))) {
          const prev = last(sortie).toLowerCase();
          const prevFr = ctx.index_gp[prev] !== undefined ? ctx.index_gp[prev] : prev;
          if (!rules.pronoms_gp.has(prev) && !rules.marqueurs.has(prev) && !rules.demonstratifs_gp.has(prev) &&
              !est_verbe_gp(last(sortie)) && !["adv", "prep", "conj"].includes(ctx.type_fr[prev]) && !["adv", "prep", "conj"].includes(ctx.type_fr[prevFr])) {
            sortie.push("dem"); deja.push(true); e.state.pluriel = true;
            let [temps, adverbe, j] = lire_marqueurs(tokens, i + 1, n);
            if (j < n && est_verbe_gp(tokens[j])) conj[sortie.length] = ["ils", temps || "present", false, adverbe];
            return j > i + 1 ? j : i + 1;
          }
        }
        if (cle === "an" && sortie.length && est_mot(last(sortie))) {
          const prevGp = i > 0 ? tokens[i - 1].toLowerCase() : "";
          const prevFrAn = ctx.index_gp[prevGp] !== undefined ? ctx.index_gp[prevGp] : "";
          let isNum = (["adj", "nom"].includes(ctx.type_fr[prevFrAn]) && !isDigits(prevFrAn) && isDigits(prevGp));
          if (!isNum) {
            isNum = rules.nombres_fr.has(prevFrAn) || (suiv === null && isDigits(prevFrAn));
          }
          if (isNum) return null;
        }
        if (cle === "an" && i > 0 && est_mot(tokens[i - 1])) {
          const prevGpTok = tokens[i - 1].toLowerCase();
          const prevFrTok = ctx.index_gp[prevGpTok] !== undefined ? ctx.index_gp[prevGpTok] : prevGpTok;
          if (["nom", "lieu"].includes(ctx.type_fr[prevFrTok]) && !est_verbe_gp(tokens[i - 1])) {
            const dejaDet = sortie.length >= 2 && rules.determinants_fr.has(sortie[sortie.length - 2].toLowerCase());
            if (!dejaDet) e.emettre("la");
            return i + 1;
          }
        }
        if (cle === "an" && suiv !== null && est_mot(suiv)) {
          const atStart = !sortie.length || rules.R.ponctuation_fin_phrase.includes(last(sortie));
          if (!atStart) {
            if (suiv[0] === suiv[0].toUpperCase() && suiv[0] !== suiv[0].toLowerCase()) { sortie.push("en"); deja.push(true); return i + 1; }
            // Lieu : soit typé directement, soit via le sens nominal d'un
            // homographe ("maché" = marcher OU marché-lieu).
            const suivNom = ctx.index_gp_nom[suiv.toLowerCase()];
            if (est_lieu_gp(suiv) || (suivNom && ctx.type_fr[suivNom.toLowerCase()] === "lieu")) { sortie.push("dans"); deja.push(true); return i + 1; }
            if (rules.materiaux_fr.has(ctx.index_gp[suiv.toLowerCase()] !== undefined ? ctx.index_gp[suiv.toLowerCase()] : "")) { sortie.push("en"); deja.push(true); return i + 1; }
          }
        }
        const prevLower = sortie.length ? last(sortie).toLowerCase() : "";
        const prevFr = ctx.index_gp[prevLower] !== undefined ? ctx.index_gp[prevLower] : prevLower;
        if (sortie.length && (Rin("prepositions_toniques", prevLower) || Rin("prepositions_toniques", prevFr)) && (suiv === null || !est_mot(suiv))) {
          sortie.push(reporter_casse(tok, rules.toniques_gp[cle])); deja.push(true); return i + 1;
        }
        if (sortie.length && Object.values(rules.R.pronoms_creole_francais).includes(last(sortie).toLowerCase())) { sortie.push(tok); deja.push(false); return i + 1; }
        const suivPred = suiv !== null && est_mot(suiv) && (rules.marqueurs.has(suiv.toLowerCase()) || est_verbe_gp(suiv));
        const objMap = rules.R.pronoms_objet_gp || {};
        if (has(objMap, cle) && !suivPred && sortie.length && est_mot(last(sortie)) && est_verbe_gp(last(sortie))) {
          const clitique = reporter_casse(tok, objMap[cle]); const insertPos = sortie.length - 1;
          sortie.splice(insertPos, 0, clitique); deja.splice(insertPos, 0, true);
          const ks = Object.keys(conj).map(Number).filter((k) => k >= insertPos).sort((a, b) => b - a);
          for (const k of ks) { conj[k + 1] = conj[k]; delete conj[k]; }
          return i + 1;
        }
        return traiter_pronom_gp(tok, cle, tokens, i, n, sortie, deja, conj);
      }
      return null;
    });
    HG.push(function h_relatif_pli(e) {
      if ((e.cle !== "pli" && e.cle !== "pi") || !e.sortie.length) return null;
      if (last(e.sortie).toLowerCase() !== "qui") return null;
      if (e.suiv === null || !est_adjectif_gp(e.suiv)) return null;
      e.emettre("est"); e.emettre("plus"); return e.i + 1;
    });
    HG.push(function h_fek_standalone(e) {
      if (e.cle !== "fèk" && e.cle !== "fek") return null;
      e.emettre("vient"); e.emettre("de"); return e.i + 1;
    });
    HG.push(function h_imperatif_objet(e) {
      const { tokens, i, n, sortie, conj } = e; const tok = tokens[i];
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      if (e.debut_de_phrase() && est_mot(tok) && suiv !== null && suiv.startsWith("-") && has(rules.objet_imperatif, suiv.slice(1).toLowerCase())) {
        conj[sortie.length] = ["tu", "imperatif", false, null]; e.emettre(tok, false); e.emettre(rules.objet_imperatif[suiv.slice(1).toLowerCase()]); return i + 2;
      }
      return null;
    });
    HG.push(function h_negation_milieu(e) {
      const { tokens, i, sortie, state } = e; const cle = tokens[i].toLowerCase(); const neg = rules.R.marqueur_negation;
      if (cle === neg && sortie.length && (est_mot(last(sortie)) || [...last(sortie)].some((c) => /\p{L}/u.test(c)))) {
        e.emettre("ne"); state.nie_attente = true; return i + 1;
      }
      return null;
    });
    HG.push(function h_marqueurs_aspect(e) {
      const { tokens, i, n, sortie, conj, state } = e; const cle = tokens[i].toLowerCase();
      const prevConj = has(conj, String(sortie.length - 1));
      if (rules.marqueurs.has(cle) && sortie.length && est_mot(last(sortie)) && !prevConj && classer_fr(last(sortie)) !== "verbe") {
        let [temps, adverbe, j] = lire_marqueurs(tokens, i, n);
        const nie = state.nie_attente; state.nie_attente = false;
        const pronom = state.pluriel ? "ils" : "il";
        if (temps === "futur_proche" || temps === "futur_proche_passe") {
          e.emettre(conjuguer("aller", pronom, temps === "futur_proche_passe" ? "imparfait" : "present"));
          if (nie) e.emettre("pas");
        } else if (j < n && (tokens[j].toLowerCase() === "la" || tokens[j].toLowerCase() === "lan") && (j + 1 >= n || !est_mot(tokens[j + 1]))) {
          e.emettre(conjuguer("être", pronom, temps || "present")); if (nie) e.emettre("pas"); e.emettre("là"); j++;
        } else if (j < n && est_mot(tokens[j]) && est_verbe_gp(tokens[j])) {
          conj[sortie.length] = [pronom, temps, nie, adverbe];
        } else if (j < n && est_mot(tokens[j]) && temps === "present") {
          conj[sortie.length] = [pronom, temps, nie, adverbe];
        } else if (j < n && est_mot(tokens[j]) && (est_adjectif(tokens[j]) || ctx.index_gp[tokens[j].toLowerCase()] !== undefined)) {
          conj[sortie.length] = [pronom, temps, nie, adverbe];
        } else if (temps !== null) {
          e.emettre(conjuguer("être", pronom, temps)); if (nie) e.emettre("pas");
        }
        return j;
      }
      return null;
    });
    HG.push(function h_etre_ye(e) {
      const { tokens, i, sortie, state } = e; const cle = tokens[i].toLowerCase();
      if (cle === "yé" && sortie.length && est_mot(last(sortie)) && !state.nie_attente && tokens[i - 1].toLowerCase() !== "sa" && tokens[i - 1].toLowerCase() !== "ka") {
        const pl = last(sortie).toLowerCase(); let sujet;
        if (pl === "tu") sujet = "tu"; else if (pl === "je" || pl === "j") sujet = "je";
        else if (pl === "nous") sujet = "nous"; else if (pl === "vous") sujet = "vous";
        else sujet = state.pluriel ? "ils" : "il";
        e.emettre(conjuguer("être", sujet)); return i + 1;
      }
      return null;
    });
    // Homographe nom/verbe (ex. "kaka" = caca OU chier) : s'il a un sens nominal
    // ET qu'il suit un adjectif ou un nombre (contexte nominal : "twa ti kaka"),
    // on émet le nom — sinon h_verbe_nu le prendrait pour un verbe. Après un
    // marqueur (ka/ké/té) ou un pronom, le contexte reste verbal → non déclenché.
    HG.push(function h_nom_homographe(e) {
      const { tokens, i } = e; const tok = tokens[i], cle = tok.toLowerCase();
      if (!est_mot(tok) || !has(ctx.index_gp_nom, cle) || !est_verbe_gp(tok)) return null;
      const prev = i > 0 ? tokens[i - 1] : null;
      if (!prev || !est_mot(prev)) return null;
      const prevCle = prev.toLowerCase();
      // Après un marqueur d'aspect (ka/ké/té) ou un pronom : contexte VERBAL, le
      // mot est un vrai verbe → ne pas forcer le nom (sinon "An ké manjé" casse).
      if (rules.marqueurs.has(prevCle) || rules.pronoms_gp.has(prevCle)) return null;
      const tp = type_gp(prev);
      const prevFr = (fr_de_gp(prev) || "").toLowerCase();
      const contexteNominal = tp === "adj" || tp === "num" ||
        rules.nombres_fr.has(prevFr) || /^\d+$/.test(prev) ||
        (prevFr && (rules.articles_clause.has(prevFr) || rules.restituer_determinants.has(prevFr)));
      if (!contexteNominal) return null;
      e.emettre(reporter_casse(tok, ctx.index_gp_nom[cle]));
      return i + 1;
    });
    HG.push(function h_verbe_nu(e) {
      const { tokens, i, n, sortie, conj, state } = e; const tok = tokens[i], cle = tok.toLowerCase();
      const suiv = i + 1 < n ? tokens[i + 1] : null;
      if (state.nie_attente && est_mot(tok)) {
        conj[sortie.length] = [state.pluriel ? "ils" : "il", "present", true, null]; state.nie_attente = false; return null;
      }
      if (est_mot(tok) && est_verbe_gp(tok) && !has(conj, String(sortie.length)) && sortie.length &&
          ["é", "et", "oben", "ou"].includes(last(sortie).toLowerCase()) && Object.keys(conj).length) {
        const maxK = Math.max(...Object.keys(conj).map(Number));
        const [pron, temps, nie] = conj[maxK];
        conj[sortie.length] = [pron, temps, nie, null]; return null;
      }
      const pronom = state.pluriel ? "ils" : "il";
      const ctxSujetNom = (!has(conj, String(sortie.length)) && sortie.length && est_mot(last(sortie)) &&
        !rules.marqueurs.has(tokens[i - 1].toLowerCase()) && !est_verbe_gp(tokens[i - 1]) &&
        !contient_verbe(last(sortie)) && !rules.bloqueurs_verbe_nu.has(last(sortie).toLowerCase()) &&
        !has(rules.tonique_de_sujet, last(sortie).toLowerCase()));
      if (est_mot(tok) && (rules.R.verbes_statifs_gp || []).includes(cle) && est_verbe_gp(tok) && ctxSujetNom) {
        conj[sortie.length] = [pronom, "present", false, null]; return null;
      }
      if (est_mot(tok) && est_verbe_gp(tok) && ctxSujetNom) {
        const tn = (suiv === null || !est_mot(suiv)) ? "passe" : "present";
        conj[sortie.length] = [pronom, tn, false, null];
      }
      return null;
    });

    // Handler prioritaire : émet la phrase pré-traduite stockée sous la sentinelle
    HG.unshift(function hg_phrase_gp(e) {
      if (e.phMap && e.phMap.has(e.tok)) { e.emettre(e.phMap.get(e.tok)); return e.i + 1; }
      return null;
    });

    function grammaire_gp_vers_fr(tokens) {
      const [bruts, phMap] = extraire_phrases(tokens, ctx.phrases_gp_fr);
      const e = makeEtat(eclater_traits_union(bruts));
      e.phMap = phMap;
      while (e.i < e.n) {
        let matched = false;
        for (const h of HG) { const r = h(e); if (r !== null && r !== undefined) { e.i = r; matched = true; break; } }
        if (!matched) { e.emettre(e.tok, false); e.i += 1; }
      }
      return [e.sortie, e.deja, e.conj];
    }

    // ── Post-traitement GP→FR ─────────────────────────────────────────────────
    function est_nom(word) { return ["nom", "lieu"].includes(classer_fr(word)); }

    function determinant_devant(formes, nom) {
      let determinant = formes[genre_nom(nom)] || formes.m;
      if (nom[0] === nom[0].toUpperCase() && nom[0] !== nom[0].toLowerCase()) { determinant = majuscule(determinant); nom = minuscule(nom); }
      return [determinant, nom];
    }

    function porte_verbe(mot) {
      const cle = mot.toLowerCase();
      return mot.includes(" ") || rules.etre_formes.has(cle) || rules.avoir_formes.has(cle) ||
        rules.etre_formes.has(cle.split("'").pop()) || Object.values(rules.R.verbes_irreguliers.aller).includes(cle) ||
        has(rules.inverse_irreguliers, cle) || trouver_infinitif(mot) !== null;
    }
    function contient_verbe(mot) {
      for (const part of mot.split(" ")) {
        const p = part.toLowerCase();
        if (rules.etre_formes.has(p) || rules.avoir_formes.has(p) || rules.etre_formes.has(p.split("'").pop()) ||
            Object.values(rules.R.verbes_irreguliers.aller).includes(p) || has(rules.inverse_irreguliers, p) || trouver_infinitif(part) !== null) return true;
      }
      return false;
    }

    function reordonner_groupe_nominal(mots) {
      let sortie = [];
      for (const mot of mots) {
        const cle = mot.toLowerCase(); let processed = false;
        if (sortie.length && est_mot(last(sortie))) {
          const isPoss = has(rules.possessifs_gp, cle);
          const isDem = cle === rules.R.particule_demonstrative;
          const isArt = cle === "la" || cle === "lan";
          const isDemMark = cle === "dem";
          if (isPoss || isDem || isArt || isDemMark) {
            let idxNom = -1, repli = -1;
            for (let j = sortie.length - 1; j >= 0; j--) {
              if (!est_mot(sortie[j])) break;
              if (est_nom(sortie[j])) { idxNom = j; break; }
              const cand = sortie[j].toLowerCase();
              if (repli === -1 && !rules.determinants_fr.has(cand) && !rules.pronoms_fr.has(cand) &&
                  ["nom", "lieu", "inconnu"].includes(classer_fr(sortie[j])) && !est_adjectif(sortie[j])) repli = j;
            }
            if (idxNom === -1) idxNom = repli;
            if (idxNom !== -1) {
              let idxStart = idxNom;
              while (idxStart > 0) {
                const prevWord = sortie[idxStart - 1];
                if (!est_mot(prevWord)) break;
                if (est_adjectif(prevWord) || ctx.type_fr[prevWord.toLowerCase()] === "adv") idxStart--; else break;
              }
              const npWords = sortie.slice(idxStart);
              let hasDet = false;
              if (idxStart > 0 && rules.determinants_fr.has(sortie[idxStart - 1].toLowerCase())) hasDet = true;
              if (npWords.length && rules.determinants_fr.has(npWords[0].toLowerCase())) hasDet = true;
              if (isDemMark) {
                sortie.length = idxStart;
                const idxNomInNp = idxNom - idxStart;
                const nom = npWords[idxNomInNp];
                const modBefore = npWords.slice(0, idxNomInNp);
                const modAfter = npWords.slice(idxNomInNp + 1);
                if (modBefore.length && has(rules.pluriel_map, modBefore[0].toLowerCase())) {
                  let pd = rules.pluriel_map[modBefore[0].toLowerCase()];
                  if (modBefore[0][0] === modBefore[0][0].toUpperCase() && modBefore[0][0] !== modBefore[0][0].toLowerCase()) pd = majuscule(pd);
                  modBefore[0] = pd;
                  sortie.push(...modBefore, nom, ...modAfter);
                } else if (idxStart > 0 && sortie.length && has(rules.pluriel_map, last(sortie).toLowerCase())) {
                  let pd = rules.pluriel_map[last(sortie).toLowerCase()];
                  if (last(sortie)[0] === last(sortie)[0].toUpperCase() && last(sortie)[0] !== last(sortie)[0].toLowerCase()) pd = majuscule(pd);
                  sortie[sortie.length - 1] = pd;
                  sortie.push(...npWords);
                } else {
                  let det = "les"; const fw = npWords[0];
                  if (fw[0] === fw[0].toUpperCase() && fw[0] !== fw[0].toLowerCase()) { det = "Les"; npWords[0] = minuscule(fw); }
                  sortie.push(det); sortie.push(...npWords);
                }
                processed = true;
              } else if (hasDet && isArt) {
                processed = true;
              } else if (!hasDet) {
                sortie.length = idxStart;
                const idxNomInNp = idxNom - idxStart;
                let nom = npWords[idxNomInNp];
                const modBefore = npWords.slice(0, idxNomInNp);
                const modAfter = npWords.slice(idxNomInNp + 1);
                let formes;
                if (isPoss) formes = rules.possessifs_gp[cle];
                else if (isDem) formes = { m: commence_par_voyelle(nom) ? "cet" : "ce", f: "cette" };
                else formes = { m: "le", f: "la" };
                let det = formes[genre_nom(nom)] || formes.m;
                const firstWord = modBefore.length ? modBefore[0] : nom;
                if (firstWord && firstWord[0] === firstWord[0].toUpperCase() && firstWord[0] !== firstWord[0].toLowerCase()) {
                  det = majuscule(det);
                  if (modBefore.length) modBefore[0] = minuscule(modBefore[0]); else nom = minuscule(nom);
                }
                sortie.push(det, ...modBefore, nom, ...modAfter);
                processed = true;
              }
            }
            if (!processed && isArt && idxNom === -1) processed = true;
          }
        }
        if (!processed) sortie.push(mot);
      }
      sortie = placer_clitiques(sortie);
      sortie = restituer_articles(sortie);
      sortie = pluraliser(sortie);
      sortie = accorder_adjectifs(sortie);
      sortie = accorder_determinants(sortie);
      sortie = inserer_que(sortie);
      sortie = inserer_qui_cleft(sortie);
      sortie = nettoyer_negation(sortie);
      sortie = participe_apres_etre(sortie);
      return inserer_copule(sortie);
    }

    // Négation française : "ne … pas" devient "ne … rien/personne/jamais/aucun"
    // dès qu'un mot négatif est présent dans la même proposition → on retire le
    // "pas" redondant ("je n'ai pas rien" → "je n'ai rien"). Général, data-driven
    // via la liste rules.mots_negatifs_fr (défaut de sécurité si absente).
    function nettoyer_negation(mots) {
      const NEG = rules.mots_negatifs_fr;
      const FIN = rules.R.ponctuation_fin_phrase || [".", "!", "?"];
      const remove = new Array(mots.length).fill(false);
      let i = 0;
      while (i < mots.length) {
        let j = i; while (j < mots.length && !FIN.includes(mots[j])) j++;
        for (let p = i; p < j; p++) {
          if (mots[p] && mots[p].toLowerCase() === "pas") {
            for (let k = p + 1; k < j; k++) {
              if (mots[k] && NEG.has(mots[k].toLowerCase())) { remove[p] = true; break; }
            }
          }
        }
        i = j + 1;
      }
      mots = mots.filter((_, idx) => !remove[idx]);
      // Partitif nié : "pas du/de la/des X" → "pas de X", "pas de l'X" → "pas d'X".
      const out = [];
      for (let k = 0; k < mots.length; k++) {
        const m = mots[k];
        if (out.length && out[out.length - 1].toLowerCase() === "pas") {
          const ml = m.toLowerCase();
          if (ml === "du" || ml === "des") { out.push("de"); continue; }
          if (ml === "de" && k + 1 < mots.length) {
            const nx = mots[k + 1];
            if (nx.toLowerCase() === "la" && k + 2 < mots.length && est_mot(mots[k + 2])) { out.push("de"); k++; continue; }
            if (nx.toLowerCase().startsWith("l'")) { out.push("d'" + nx.slice(2)); k++; continue; }
          }
        }
        out.push(m);
      }
      return out;
    }

    // Après une forme d'être, un infinitif est un participe ("est finir" →
    // "est fini") : le dico rend l'infinitif, le contexte copule le corrige.
    function participe_apres_etre(mots) {
      for (let i = 1; i < mots.length; i++) {
        const prev = mots[i - 1].toLowerCase();
        if (!rules.etre_formes.has(prev) && !rules.etre_imparfait.has(prev)) continue;
        const cle = mots[i].toLowerCase();
        if (ctx.type_fr[cle] === "verbe" && /(er|ir|re)$/.test(cle)) {
          mots[i] = reporter_casse(mots[i], participe_passe(cle));
        }
      }
      return mots;
    }

    function inserer_qui_cleft(mots) {
      if (!mots.length || mots[0].toLowerCase() !== "c'est") return mots;
      for (let i = 1; i < mots.length; i++) {
        const cle = mots[i].toLowerCase();
        if (!est_mot(mots[i])) break;
        if (cle === "qui" || cle === "que") return mots;
        if (trouver_infinitif(mots[i]) !== null && ctx.type_fr[cle] === undefined) return mots.slice(0, i).concat(["qui"], mots.slice(i));
      }
      return mots;
    }

    function inserer_que(mots) {
      const sortie = [];
      const ART_CLAUSE = rules.articles_clause;
      for (let i = 0; i < mots.length; i++) {
        const mot = mots[i];
        if (sortie.length && rules.que_declencheurs.has(last(sortie).toLowerCase())) {
          const motL = mot.toLowerCase();
          if (rules.que_sujets.has(motL)) {
            sortie.push("que");
          } else if (ART_CLAUSE.has(motL) && i + 2 < mots.length) {
            // article + nom + verbe conjugué → complétive nominale
            const t1 = ctx.type_fr[mots[i + 1].toLowerCase()];
            if ((t1 === "nom" || t1 === "lieu") && contient_verbe(mots[i + 2])) sortie.push("que");
          }
        }
        sortie.push(mot);
      }
      return sortie;
    }

    function placer_clitiques(mots) {
      let i = 1;
      while (i < mots.length) {
        const cle = mots[i].toLowerCase(); const prec = mots[i - 1];
        const estClit = rules.clitiques_toujours.has(cle) || (rules.clitiques_contexte.has(cle) && (i + 1 >= mots.length || !est_mot(mots[i + 1])));
        if (estClit && est_mot(prec) && !prec.includes(" ") && classer_fr(prec) === "verbe") {
          const t = mots[i - 1]; mots[i - 1] = mots[i]; mots[i] = t;
        }
        i++;
      }
      return mots;
    }

    function restituer_articles(mots) {
      const sortie = [];
      for (let i = 0; i < mots.length; i++) {
        let mot = mots[i];
        if (est_mot(mot) && !rules.restituer_determinants.has(mot.toLowerCase()) &&
            !rules.etre_formes.has(mot.toLowerCase()) && !rules.avoir_formes.has(mot.toLowerCase()) &&
            !rules.etre_imparfait.has(mot.toLowerCase()) && ["nom", "lieu"].includes(classer_fr(mot))) {
          const prec = i > 0 ? mots[i - 1].toLowerCase() : null;
          const precType = prec ? ctx.type_fr[prec] : null;
          // "avoir faim/soif/peur…" sans article, y compris à la forme négative
          // ("je n'ai pas faim") où le mot suit "pas" et l'avoir est deux crans avant.
          const stripNeg = w => (w || "").replace(/^n['’]/, "");
          const avoirDevant = prec && (rules.avoir_formes.has(prec) || rules.avoir_formes.has(stripNeg(prec)) ||
            (prec === "pas" && i >= 2 && rules.avoir_formes.has(stripNeg(mots[i - 2].toLowerCase()))));
          if (rules.avoir_attributs.has(mot.toLowerCase()) && avoirDevant) { sortie.push(mot); continue; }
          if (mot[0] === mot[0].toUpperCase() && mot[0] !== mot[0].toLowerCase()) {
            const atStart = !sortie.length || rules.R.ponctuation_fin_phrase.includes(last(sortie));
            if (atStart && ["nom", "lieu"].includes(ctx.type_fr[mot.toLowerCase()])) {
              mot = minuscule(mot);
            } else {
              if (!atStart && prec !== null && est_mot(mots[i - 1]) && !["prep", "conj"].includes(precType) && !rules.restituer_determinants.has(prec)) {
                // Provenance ("je viens DE France") vs destination/lieu ("je vais À Paris").
                const infPrec = trouver_infinitif(mots[i - 1]);
                if (infPrec && rules.verbes_origine_lieu.has(infPrec)) {
                  if (commence_par_voyelle(mot)) { sortie.push("d'" + mot); continue; }
                  sortie.push("de");
                } else sortie.push("à");
              }
              sortie.push(mot); continue;
            }
          }
          // Mot négatif (rien/personne/jamais…) : jamais d'article.
          if (rules.mots_negatifs_fr.has(mot.toLowerCase())) { sortie.push(mot); continue; }
          // Adverbe de quantité + nom nu → "de" ("beaucoup de gens", "trop de bruit").
          if (prec !== null && rules.adverbes_quantite_fr.has(prec)) {
            if (commence_par_voyelle(mot) || mot.toLowerCase()[0] === "h") sortie.push("d'" + mot);
            else sortie.push("de", mot);
            continue;
          }
          const afterNum = prec !== null && (/^\d+$/.test(prec) || rules.nombres_fr.has(prec) || rules.nombres_fr.has(prec.replace(/s$/, "")));
          const prepContr = ["au", "aux", "du", "des"].includes(prec);
          const apresClit = rules.clitiques_objet_fr.has(prec);
          const apresPronSujet = rules.pronoms_sujet_fr.has(prec) || (prec !== null && prec.endsWith("'") && ["j", "c", "m", "t", "s", "l", "n"].includes(prec.slice(0, -1)));
          const nu = (!afterNum && !prepContr && !apresClit && !apresPronSujet &&
            (prec === null || !est_mot(mots[i - 1]) || (!rules.restituer_determinants.has(prec) && !["adj", "nom", "num", "adv"].includes(precType))));
          if (nu) {
            if (precType === "prep") sortie.push(...determinant_devant({ m: "le", f: "la" }, mot));
            else if (prec !== null && rules.etre_formes.has(prec)) sortie.push(...determinant_devant({ m: "un", f: "une" }, mot));
            else if (ctx.type_fr[mot.toLowerCase()] === "lieu") {
              if (commence_par_voyelle(mot) || mot.toLowerCase()[0] === "h") sortie.push("à", "l'" + mot.toLowerCase());
              else { sortie.push("à"); sortie.push(...determinant_devant({ m: "le", f: "la" }, mot)); }
            } else if (prec === null) sortie.push(...determinant_devant({ m: "le", f: "la" }, mot));
            else if (rules.noms_masse_fr.has(mot.toLowerCase())) {
              // Nom de masse (indénombrable) nu : partitif français, jamais "des"
              // ("ban mwen dlo" = donne-moi DE L'eau, "an ni lajan" = j'ai DE L'argent).
              if (commence_par_voyelle(mot) || mot.toLowerCase()[0] === "h") sortie.push("de", "l'" + mot);
              else sortie.push(...determinant_devant({ m: "du", f: "de la" }, mot));
            }
            else sortie.push("des", mot);
            continue;
          }
          if (prec !== null && ctx.type_fr[prec] === "nom") {
            const precPrec = i >= 2 && est_mot(mots[i - 2]) ? mots[i - 2].toLowerCase() : null;
            // [déterminant N1 N2] : l'enchaînement nom+nom créole est un génitif
            // ("on fanmiy jardinyé" = "une famille de jardiniers") → français "de".
            if (precPrec && rules.restituer_determinants.has(precPrec)) {
              if (commence_par_voyelle(mot) || mot.toLowerCase()[0] === "h") sortie.push("d'" + mot);
              else sortie.push("de", mot);
              continue;
            }
          }
          if (prec !== null && est_adjectif(mots[i - 1])) {
            let j = sortie.length - 1;
            while (j >= 0 && est_mot(sortie[j]) && est_adjectif(sortie[j]) && !rules.restituer_determinants.has(sortie[j].toLowerCase())) j--;
            const beforeAdj = j >= 0 && est_mot(sortie[j]) ? sortie[j].toLowerCase() : null;
            const isNum = beforeAdj !== null && /^\d+$/.test(beforeAdj);
            const noDet = (!isNum && (beforeAdj === null || (!rules.restituer_determinants.has(beforeAdj) && !["nom", "num", "adv"].includes(ctx.type_fr[beforeAdj]))));
            if (noDet) {
              const adjStart = j + 1;
              let det = determinant_devant({ m: "un", f: "une" }, mot)[0];
              if (adjStart < sortie.length && sortie[adjStart][0] === sortie[adjStart][0].toUpperCase() && sortie[adjStart][0] !== sortie[adjStart][0].toLowerCase()) {
                det = majuscule(det); sortie[adjStart] = minuscule(sortie[adjStart]);
              }
              sortie.splice(adjStart, 0, det);
            }
          }
        }
        sortie.push(mot);
      }
      return sortie;
    }

    function est_adj_accordable(mot) { return ctx.type_fr[mot.toLowerCase()] === "adj" || est_adjectif(mot); }
    function genre_nom_suivant(mots, start, defaut = "m") {
      for (let k = start; k < mots.length; k++) if (est_nom(mots[k])) return genre_nom(mots[k]);
      return defaut;
    }

    function pluraliser(mots) {
      for (let i = 0; i < mots.length - 1; i++) {
        const mot = mots[i];
        if (mot.toLowerCase() === "de" && i > 0 && rules.quantificateurs_pluriel.has(mots[i - 1].toLowerCase())) {
          const nom = mots[i + 1]; if (est_nom(nom)) mots[i + 1] = pluriel_fr(nom); continue;
        }
        let nomGenre, j2;
        if ((ctx.type_fr[mot.toLowerCase()] === "num" || /^\d+$/.test(mot)) && !rules.indefinis_singuliers.has(mot.toLowerCase())) {
          nomGenre = genre_nom_suivant(mots, i + 1); j2 = i + 1;
        } else if (rules.determinants_pluriels.has(mot.toLowerCase())) {
          nomGenre = genre_nom_suivant(mots, i + 1); j2 = i + 1;
        } else continue;
        while (j2 < mots.length && est_mot(mots[j2])) {
          if (est_adj_accordable(mots[j2])) { mots[j2] = reporter_casse(mots[j2], pluriel_fr(accorder_adjectif(mots[j2].toLowerCase(), nomGenre))); j2++; }
          else if (est_nom(mots[j2])) { mots[j2] = pluriel_fr(mots[j2]); break; }
          else break;
        }
      }
      return mots;
    }

    function accorder_determinants(mots) {
      const n = mots.length;
      for (let i = 0; i < n; i++) {
        const mot = mots[i];
        if ((mot.toLowerCase() === "tous" || mot.toLowerCase() === "toutes") && i + 2 < n && mots[i + 1].toLowerCase() === "les" && est_mot(mots[i + 2])) {
          const genre = genre_nom(mots[i + 2].replace(/s+$/, "")); mots[i] = reporter_casse(mot, genre === "m" ? "tous" : "toutes"); continue;
        }
        const formes = rules.determinants_genre[mot.toLowerCase()];
        if (!formes) continue;
        let j = i + 1;
        while (j < n && est_mot(mots[j]) && est_adj_accordable(mots[j])) j++;
        if (j < n && est_mot(mots[j])) mots[i] = reporter_casse(mot, genre_nom(mots[j]) === "m" ? formes[0] : formes[1]);
      }
      return mots;
    }

    function accorder_adjectifs(mots) {
      for (let i = 0; i < mots.length - 1; i++) {
        if (ctx.type_fr[mots[i].toLowerCase()] === "adj" && ctx.type_fr[mots[i + 1].toLowerCase()] === "nom") {
          mots[i] = reporter_casse(mots[i], accorder_adjectif(mots[i].toLowerCase(), genre_nom(mots[i + 1])));
        } else if (ctx.type_fr[mots[i].toLowerCase()] === "nom" && ctx.type_fr[mots[i + 1].toLowerCase()] === "adj") {
          mots[i + 1] = reporter_casse(mots[i + 1], accorder_adjectif(mots[i + 1].toLowerCase(), genre_nom(mots[i])));
        } else if (i + 2 < mots.length && ["nom", "lieu"].includes(ctx.type_fr[mots[i].toLowerCase()]) && porte_verbe(mots[i + 1]) && est_adj_accordable(mots[i + 2])) {
          mots[i + 2] = reporter_casse(mots[i + 2], accorder_adjectif(mots[i + 2].toLowerCase(), genre_nom(mots[i])));
        } else if (["nom", "lieu"].includes(ctx.type_fr[mots[i].toLowerCase()]) && mots[i + 1].includes(" ")) {
          const parts = mots[i + 1].split(" "); const lst = parts[parts.length - 1];
          if (est_adj_accordable(lst)) { parts[parts.length - 1] = reporter_casse(lst, accorder_adjectif(lst.toLowerCase(), genre_nom(mots[i]))); mots[i + 1] = parts.join(" "); }
        }
      }
      return mots;
    }

    function inserer_copule(mots) {
      const COORD = rules.coordinateurs;
      const sentences = []; let cur = [];
      for (const mot of mots) { cur.push(mot); if (mot === "." || mot === "!" || mot === "?") { sentences.push(cur); cur = []; } }
      if (cur.length) sentences.push(cur);
      const newMots = [];
      for (const sentence of sentences) {
        // Découper en clauses sur les coordinateurs pour traiter chaque clause indépendamment
        const clauseBounds = [0];
        sentence.forEach((m, idx) => { if (est_mot(m) && COORD.has(m.toLowerCase())) clauseBounds.push(idx + 1); });
        clauseBounds.push(sentence.length);
        const insertions = []; // {idx, word} à insérer, appliquées en ordre inverse
        for (let ci = 0; ci + 1 < clauseBounds.length; ci++) {
          const cStart = clauseBounds[ci], cEnd = clauseBounds[ci + 1];
          // Copule déjà présente dans la proposition ("c'était très bon") → rien à
          // insérer. Les tokens peuvent être composites ("était très") : on scanne
          // chaque mot de chaque token de la clause.
          const dejaCopule = sentence.slice(cStart, cEnd).some(tok =>
            String(tok).toLowerCase().split(" ").some(w =>
              rules.etre_formes.has(w) || rules.etre_imparfait.has(w) || w === "c'est" || w === "c'était"));
          if (dejaCopule) continue;
          const words = [];
          for (let idx = cStart; idx < cEnd; idx++) { if (est_mot(sentence[idx])) words.push([idx, sentence[idx]]); }
          if (words.length < 2) continue;
          let subjSeen = false, subjGenre = "m", subjPronom = "il", copuleIdx = null, plur = false;
          for (let pos = 0; pos < words.length; pos++) {
            const [idx, m] = words[pos]; const cle = m.toLowerCase(); const t = ctx.type_fr[cle];
            if (contient_verbe(m)) break;
            if (Object.values(rules.pluriel_map).includes(cle) || ["les", "des", "ces"].includes(cle)) plur = true;
            if (rules.determinants_fr.has(cle) || t === "article") continue;
            // Le pronom sujet se teste AVANT la branche "type inconnu", sinon
            // "nous/tu/…" y tombent et la copule reste conjuguée à "il".
            if (rules.pronoms_sujet_fr.has(cle)) { subjSeen = true; subjGenre = ["elle", "elles"].includes(cle) ? "f" : "m"; subjPronom = cle === "ça" || cle === "cela" ? "il" : cle; }
            else if (t === "nom" || t === "lieu") { subjSeen = true; subjGenre = genre_nom(m); subjPronom = plur ? "ils" : "il"; }
            else if (t === undefined && !subjSeen) { subjSeen = true; }
            else if (subjSeen && (t === "adj" || est_adjectif(m))) { copuleIdx = [pos, idx]; break; }
            else if (!["adv", "conj", "interj", undefined].includes(t)) break;
          }
          if (copuleIdx !== null) {
            let [startPos, startIdx] = copuleIdx;
            const genreAccord = ["elle", "elles"].includes(subjPronom) ? "f" : subjGenre;
            for (let pos = startPos; pos < words.length; pos++) {
              const [idx, m] = words[pos]; const cle = m.toLowerCase();
              if (ctx.type_fr[cle] === "adj" || est_adjectif(m)) {
                const accorde = accorder_adjectif(cle, genreAccord);
                sentence[idx] = reporter_casse(m, ["ils", "elles", "nous", "vous"].includes(subjPronom) ? pluriel_fr(accorde) : accorde);
              } else if (COORD.has(cle) || cle === "," || m === ",") continue;
              else break;
            }
            while (startIdx > 0 && rules.intensifieurs_fr.has(sentence[startIdx - 1].toLowerCase())) startIdx--;
            insertions.push({ idx: startIdx, word: conjuguer("être", subjPronom, "present") });
          }
        }
        for (let k = insertions.length - 1; k >= 0; k--) sentence.splice(insertions[k].idx, 0, insertions[k].word);
        newMots.push(...sentence);
      }
      return newMots;
    }

    // ── Chargement dictionnaire (port de traduction._load_dictionary) ─────────
    const CATEGORY = { verbe: "Verbs", nom: "Nouns", adj: "Adjectives", adv: "Adverbs", misc: "Misc" };
    function asList(v) { if (Array.isArray(v)) return v.filter((x) => x); return v ? [v] : []; }

    function loadDicts(d) {
      const grammar = Object.assign({}, d.Grammar);
      if (d.Verbs && d.Verbs.rules) Object.assign(grammar, d.Verbs.rules);
      charger(grammar);
      const allEntries = [];
      for (const wt in CATEGORY) {
        const raw = d[CATEGORY[wt]];
        if (!raw) continue;
        const entries = (raw && !Array.isArray(raw) && raw.entries) ? raw.entries : raw;
        for (const entry of entries) allEntries.push([entry, entry.type || wt]);
      }
      for (const [entry, wt] of allEntries) {
        const frForms = asList(entry.fr), gpForms = asList(entry.gp);
        if (!frForms.length || !gpForms.length) continue;
        const wordGenre = entry.genre, canonFr = frForms[0], canonGp = gpForms[0];
        for (const f of frForms) {
          const key = f.toLowerCase();
          if (!has(ctx.index_fr, key)) ctx.index_fr[key] = canonGp;
          // Index séparés nom/verbe : permettent de désambiguïser un homographe
          // (mot ayant une entrée nom ET une entrée verbe) selon le contexte.
          if (wt === "verbe" && !has(ctx.index_fr_verbe, key)) ctx.index_fr_verbe[key] = canonGp;
          if ((wt === "nom" || wt === "lieu") && !has(ctx.index_fr_nom, key)) ctx.index_fr_nom[key] = canonGp;
          if (wt && ctx.type_fr[key] !== "verbe") ctx.type_fr[key] = wt;
          if (wordGenre === "m" || wordGenre === "f") ctx.genre_fr[key] = wordGenre;
          if (!key.includes(" ")) { const nk = normalize_token(key); if (!has(ctx.norm_fr, nk)) ctx.norm_fr[nk] = key; }
        }
        for (const g of gpForms) {
          const key = g.toLowerCase(); const existing = ctx.index_gp[key];
          if (entry.secondaire) { /* skip index_gp */ }
          else if (existing === undefined) ctx.index_gp[key] = canonFr;
          else if (wt === "verbe") { if (!(existing.endsWith("er") || existing.endsWith("ir") || existing.endsWith("re"))) ctx.index_gp[key] = canonFr; }
          if (!key.includes(" ") && has(ctx.index_gp, key)) { const nk = normalize_token(key); if (!has(ctx.norm_gp, nk)) ctx.norm_gp[nk] = key; }
          // Sens nominal (nom/lieu) gardé à part : sert à désambiguïser "X la"
          // quand le sens verbe a gagné dans index_gp (ex. maché=marcher / marché).
          if (!entry.secondaire && (wt === "nom" || wt === "lieu") && !has(ctx.index_gp_nom, key)) {
            ctx.index_gp_nom[key] = canonFr;
            if (wordGenre === "m" || wordGenre === "f") ctx.genre_fr[canonFr.toLowerCase()] = wordGenre;
          }
        }
      }
      // Index de phrases (entrées multiword) pour lookup prioritaire dans les handlers
      // Doit rester identique à normAposFn (trait d'union == espace).
      const normApos = (s) => s.replace(/['']/g, "'").replace(/-/g, " ").replace(/\s+/g, " ").trim();
      const multi = (s) => s.includes(" ") || s.includes("-"); // phrase = plusieurs mots (espace ou trait d'union)
      for (const [entry] of allEntries) {
        const frForms = asList(entry.fr), gpForms = asList(entry.gp);
        if (!frForms.length || !gpForms.length) continue;
        const canonGp = gpForms[0], canonFr = frForms[0];
        for (const f of frForms) if (multi(f)) ctx.phrases_fr_gp[normApos(f.toLowerCase())] = canonGp;
        for (const g of gpForms) if (multi(g)) ctx.phrases_gp_fr[normApos(g.toLowerCase())] = canonFr;
      }
    }

    // ── Pipeline de traduction (port de traduire_texte) ───────────────────────
    function tokenize(text) {
      const re = /(?:[jlcdnmts]|qu)'|[\p{L}\p{N}_]+(?:[-'][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_]/giu;
      const out = []; let m;
      while ((m = re.exec(text)) !== null) {
        let t = m[0];
        if (t.endsWith("'") && t.length > 1) t = t.slice(0, -1);
        out.push(t);
      }
      return out;
    }

    function deflexions_fr(key) {
      const c = [];
      const seen = new Set();
      const push = (x) => { if (x && x.length > 1 && x !== key && !seen.has(x)) { seen.add(x); c.push(x); } };
      // Dé-pluralisation
      if (key.endsWith("aux") && key.length > 4) push(key.slice(0, -3) + "al");
      if ((key.endsWith("eaux") || key.endsWith("eux")) && key.length > 4) push(key.slice(0, -1));
      if ((key.endsWith("s") || key.endsWith("x")) && key.length > 2) push(key.slice(0, -1));
      // Féminin -> masculin : appliqué à la clé et aux formes déjà dé-pluralisées
      // (ex. "froide" -> "froid", "vertes" -> "verte" -> "vert", "heureuse" -> "heureux").
      const bases = [key, ...c];
      for (const b of bases) {
        if (has(rules.masculin_de_feminin, b)) push(rules.masculin_de_feminin[b]);
        for (const masc in rules.accords_adjectifs_suffixes) {
          const fem = rules.accords_adjectifs_suffixes[masc];
          if (b.endsWith(fem) && b.length > fem.length + 1) push(b.slice(0, -fem.length) + masc);
        }
        if (b.endsWith("e")) push(b.slice(0, -1));
      }
      return c;
    }

    function fuzzy_lookup(word, indexExact, indexNorm) {
      const key = word.toLowerCase();
      if (has(indexExact, key)) return indexExact[key];
      const keyNorm = normalize_token(key);
      if (keyNorm && has(indexNorm, keyNorm)) { const ck = indexNorm[keyNorm]; if (has(indexExact, ck)) return indexExact[ck]; }
      for (const cand of deflexions_fr(key)) {
        if (has(indexExact, cand)) return indexExact[cand];
        const cn = normalize_token(cand);
        if (has(indexNorm, cn) && has(indexExact, indexNorm[cn])) return indexExact[indexNorm[cn]];
      }
      return null;
    }

    function assemble(tokens) {
      if (!tokens.length) return "";
      const res = [];
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        // Pas d'espace avant : ponctuation isolée, ou clitique élidé collé
        // ("wè" + "'w" → "wè'w", pas "wè 'w").
        if (i === 0 || /^[^\p{L}\p{N}_]$/u.test(token) || /^['']/.test(token)) res.push(token);
        else res.push(" " + token);
      }
      return res.join("");
    }

    function sourceStartsUpper(source) {
      for (const ch of source.trim()) if (/\p{L}/u.test(ch)) return ch === ch.toUpperCase() && ch !== ch.toLowerCase();
      return false;
    }

    function capitaliser(texte, source) {
      if (!texte) return texte;
      const chars = [...texte];
      let capNext = true;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];
        if (capNext && /\p{L}/u.test(ch)) { chars[i] = ch.toUpperCase(); capNext = false; }
        else if (ch === "." || ch === "!" || ch === "?") capNext = true;
      }
      return chars.join("");
    }

    const SUBS = [
      [/\bpas\s+du\s+tout\b/gi, "ditou"], [/\btout\s+de\s+suite\b/gi, "tousit"],
      [/\bau\s+revoir\b/gi, "orevwa"], [/\bs'?\s*il\s+(?:vous|te)\s+pla[iî]t\b/gi, "souplé"],
      [/\bbon\s+anniversaire\b/gi, "bon fèt"], [/\bvenir\s+de\b/gi, "fèk"],
      [/à\s+cause\s+d[eu']?\b/gi, "akoz"], [/\bparce\s+que\b/gi, "paski"],
      [/\b(?:me|te|se)\s+souvien\w*/gi, "sonjé"], [/\bnous\s+souveno\w*/gi, "sonjé"],
      [/\bpendant\s+que\b/gi, "pandan"],
      [/\bgrand(s)?\s+m[èe]res?\b/gi, "grand$1-mère"], [/\bgrand(s)?\s+p[èe]res?\b/gi, "grand$1-père"],
      [/\bbeau(x)?\s+p[èe]res?\b/gi, "beau$1-père"], [/\bbelle(s)?\s+m[èe]res?\b/gi, "belle$1-mère"],
    ];

    function traduire(text, source_lang = "fr", target_lang = "gp") {
      if (!text || !text.trim()) return "";
      if (!["fr", "gp"].includes(source_lang) || !["fr", "gp"].includes(target_lang)) return text.trim();
      if (source_lang === target_lang) return text.trim();
      // Préserver les retours à la ligne de la source : on traduit ligne par ligne
      // et on réinsère les séparateurs (\n, \r\n, \r) tels quels.
      if (/[\r\n]/.test(text)) {
        return text.split(/(\r\n|\r|\n)/)
          .map((seg) => (/^(\r\n|\r|\n)$/.test(seg) || !seg.trim()
            ? seg : traduire(seg, source_lang, target_lang)))
          .join("");
      }
      if (source_lang === "fr") for (const [re, rep] of SUBS) text = text.replace(re, rep);
      // Créole : pronom objet enclitique attaché par apostrophe (enmé'w, tjwé'y,
      // wè'm) → on le détache en forme pleine, qui suit ensuite le chemin normal.
      if (source_lang === "gp") text = text.replace(/(\p{L})['’](w|y|m)(?![\p{L}\p{N}])/gu,
        (_, a, p) => a + " " + (p === "w" ? "ou" : p === "y" ? "li" : "mwen"));

      const db = target_lang === "gp" ? ctx.index_fr : ctx.index_gp;
      const dbNorm = target_lang === "gp" ? ctx.norm_fr : ctx.norm_gp;
      if (!Object.keys(db).length) return text;

      let tokens = tokenize(text);
      let already, conjMap = {};
      if (target_lang === "gp") { [tokens, already] = grammaire_fr_vers_gp(tokens); }
      else { [tokens, already, conjMap] = grammaire_gp_vers_fr(tokens); }

      const translation = []; let index = 0; const n = tokens.length; const MAX = 6;
      while (index < n) {
        let current = tokens[index];
        if (already[index]) {
          let negSuffix = null;
          if (has(conjMap, String(index))) [current, negSuffix] = conjuguer_consigne(current, conjMap[index]);
          translation.push(current); if (negSuffix) translation.push(negSuffix); index++; continue;
        }
        if (/^[^\p{L}\p{N}_]+$/u.test(current)) { translation.push(current); index++; continue; }
        let found = false;
        let maxLen = Math.min(MAX, n - index);
        while (maxLen > 1 && already[index + maxLen - 1]) maxLen--;
        for (let length = maxLen; length >= 1; length--) {
          const segment = tokens.slice(index, index + length);
          const expr = segment.join(" ").toLowerCase();
          if (has(db, expr)) {
            let translated = db[expr];
            if (target_lang === "gp" && length === 1) {
              const det = index > 0 ? tokens[index - 1] : null;
              const variant = resoudre_genre(expr, det);
              if (variant !== null) translated = variant;
            }
            let negSuffix = null;
            if (length === 1 && has(conjMap, String(index))) [translated, negSuffix] = conjuguer_consigne(translated, conjMap[index]);
            translation.push(reporter_casse(segment[0], translated));
            if (negSuffix) translation.push(negSuffix);
            index += length; found = true; break;
          }
        }
        if (!found) {
          const word = tokens[index]; let translated = null;
          if (target_lang === "gp") { const inf = trouver_infinitif(word); if (inf !== null) translated = db[inf]; }
          if (translated === null || translated === undefined) translated = fuzzy_lookup(word, db, dbNorm);
          if (translated !== null && translated !== undefined) {
            let negSuffix = null;
            if (has(conjMap, String(index))) [translated, negSuffix] = conjuguer_consigne(translated, conjMap[index]);
            translation.push(reporter_casse(word, translated)); if (negSuffix) translation.push(negSuffix);
          } else translation.push(word);
          index++;
        }
      }

      if (target_lang !== "gp") {
        const reordered = reordonner_groupe_nominal(translation);
        return capitaliser(appliquer_elision(assemble(reordered)), text);
      }
      return capitaliser(assemble(translation), text);
    }

    loadDicts(dicts);
    // `classer_fr`/`trouver_infinitif` sont exposés pour l'outillage de
    // vérification (détection de résidus français), pas pour l'UI.
    return { traduire, ctx, rules, classer_fr, trouver_infinitif, est_verbe, est_adjectif };
  }

  root.RakounCore = { createEngine, est_mot, reporter_casse, normalize_token };
})(typeof module !== "undefined" && module.exports ? module.exports : (typeof window !== "undefined" ? window : globalThis));
