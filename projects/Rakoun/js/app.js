// Rakoun — câblage de l'interface web.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const elInput = $("input"), elOutput = $("output"), elSwap = $("swap"),
        elTranslator = $("translator"),
        elSectionSrc = $("section-src"), elSectionTgt = $("section-tgt"),
        elLangSrc = $("lang-src"), elLangTgt = $("lang-tgt"),
        elLangSrcNative = $("lang-src-native"), elLangTgtNative = $("lang-tgt-native"),
        elLangSrcAbbr = $("lang-src-abbr"), elLangTgtAbbr = $("lang-tgt-abbr"),
        elFlagSrc = $("flag-src"), elFlagTgt = $("flag-tgt"),
        elFlagSrcMobile = $("flag-src-mobile"), elFlagTgtMobile = $("flag-tgt-mobile"),
        elListenSrc = $("listen"), elListenTgt = $("listen-tgt"),
        elCopySrc = $("copy"), elCopyTgt = $("copy-tgt"),
        elClear = $("clear"), elCharCount = $("char-count");

  const CHAR_LIMIT = 1500;
  const OVER_LIMIT_MSG =
    "Texte trop long : réduisez-le à 1500 caractères.\n" +
    "Tèks two long : fè’y pli kout ki 1500 karaktè.";

  // Pas de voix créole native disponible : on désactive l'écoute côté créole.
  const NO_VOICE = { gp: true };

  const NAMES = { fr: "Français", gp: "Kréyòl Gwadloup" };
  const NAMES_NATIVE = { fr: "Fwansé", gp: "créole guadeloupéen" };
  const NAMES_ABBR = { fr: "FR", gp: "GP" };
  const FLAG_URLS = { fr: "images/flags/fr.png", gp: "images/flags/gp.png" };
  // Version carrée : se recadre proprement en cercle sur le pill mobile.
  const FLAG_URLS_SQUARE = { fr: "images/flags/fr_square.png", gp: "images/flags/gp_square.png" };

  let src = "fr", tgt = "gp";
  let engine = null;
  let appEnPanne = false;

  function updateLanguages() {
    elLangSrc.textContent = NAMES[src];
    elLangTgt.textContent = NAMES[tgt];
    elLangSrcNative.textContent = NAMES_NATIVE[src];
    elLangTgtNative.textContent = NAMES_NATIVE[tgt];
    elLangSrcAbbr.textContent = NAMES_ABBR[src];
    elLangTgtAbbr.textContent = NAMES_ABBR[tgt];
    elFlagSrc.src = FLAG_URLS[src];
    elFlagTgt.src = FLAG_URLS[tgt];
    elFlagSrcMobile.srcset = FLAG_URLS_SQUARE[src];
    elFlagTgtMobile.srcset = FLAG_URLS_SQUARE[tgt];
    elInput.placeholder = src === "fr" ? "Écrivez en français…" : "Maké an kréyòl…";
    elListenSrc.disabled = !!NO_VOICE[src];
    elListenTgt.disabled = !!NO_VOICE[tgt];
  }

  const BASE_FONT_PX = 32;    // doit correspondre à font-size: 2rem dans style.css
  const MIN_FONT_PX = 24;
  const BASE_HEIGHT_PX = 140; // doit correspondre à min-height dans style.css

  // L'original descendait de 1 px en relisant scrollHeight à chaque pas : 11
  // calculs de mise en page synchrones par frappe. Ici : mémoïsation (même
  // texte ⇒ 0 mesure), sortie anticipée (texte court = 1 lecture), et
  // dichotomie au lieu du pas de 1 px (5 lectures au pire au lieu de 11).
  const memo = new WeakMap();
  let generation = 0; // invalide tous les caches quand la mise en page change
  addEventListener("resize", () => { generation++; }, { passive: true });

  function autosize(el) {
    const valeur = el.value;
    const cache = memo.get(el);
    if (cache && cache.valeur === valeur && cache.generation === generation) return;

    el.style.fontSize = BASE_FONT_PX + "px";
    el.style.height = BASE_HEIGHT_PX + "px";
    const dispo = el.clientHeight; // invariant tant que la hauteur est figée

    if (el.scrollHeight > dispo) {
      let bas = MIN_FONT_PX, haut = BASE_FONT_PX - 1, meilleur = MIN_FONT_PX;
      while (bas <= haut) {
        const milieu = (bas + haut) >> 1;
        el.style.fontSize = milieu + "px";
        if (el.scrollHeight <= dispo) { meilleur = milieu; bas = milieu + 1; }
        else haut = milieu - 1;
      }
      el.style.fontSize = meilleur + "px";
      const debord = el.scrollHeight;
      if (debord > dispo) el.style.height = debord + "px";
    }
    memo.set(el, { valeur, generation });
  }

  let lastCharCount = -1;

  function translate() {
    if (appEnPanne) return;

    const txt = elInput.value;
    const vide = !txt.trim();
    elClear.classList.toggle("is-collapsed", vide);

    // Écriture DOM évitée quand la valeur n'a pas changé.
    if (txt.length !== lastCharCount) {
      lastCharCount = txt.length;
      elCharCount.textContent = txt.length + " / " + CHAR_LIMIT;
      elCharCount.classList.toggle("over-limit", txt.length > CHAR_LIMIT);
    }

    if (txt.length > CHAR_LIMIT) {
      elOutput.value = OVER_LIMIT_MSG;
    } else {
      elOutput.value = vide ? "" : engine.traduire(txt, src, tgt);
    }

    autosize(elInput);
    autosize(elOutput);
  }

// Débouncing : on attend 90 ms après la dernière frappe avant de traduire.
  let debounceId = 0;
  function translateDebounced() {
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(() => { debounceId = 0; translate(); }, 90);
  }


  const addClickListener = (el, action) => el.addEventListener("click", action);

  const handleListenClick = (element, lang, listenButton) => {
    const txt = element.value;
    if (txt.trim()) window.RakounListen.parler(txt, lang, listenButton);
  };

  const handleCopyClick = (element) => {
    navigator.clipboard.writeText(element.value);
  };

  addClickListener(elListenSrc, () => handleListenClick(elInput, src, elListenSrc));
  addClickListener(elListenTgt, () => handleListenClick(elOutput, tgt, elListenTgt));
  addClickListener(elCopySrc, () => handleCopyClick(elInput));
  addClickListener(elCopyTgt, () => handleCopyClick(elOutput));
  addClickListener(elClear, () => { elInput.value = ""; translate(); elInput.focus(); });

  elInput.addEventListener("input", translateDebounced);

  const DUREE_ANIM = 160; // doit correspondre aux keyframes de style.css
  let permute = false;

  elSwap.addEventListener("click", () => {
    if (permute) return;
    permute = true;
    elSwap.style.pointerEvents = "none";

    elSectionSrc.classList.add("slide-out-right");
    elSectionTgt.classList.add("slide-out-left");

    setTimeout(() => {
      elSectionSrc.classList.remove("slide-out-right");
      elSectionTgt.classList.remove("slide-out-left");

      const tmp = src; src = tgt; tgt = tmp;
      if (elOutput.value) elInput.value = elOutput.value;
      updateLanguages();
      translate();

      elSectionSrc.classList.add("slide-in-left");
      elSectionTgt.classList.add("slide-in-right");

      setTimeout(() => {
        elSectionSrc.classList.remove("slide-in-left");
        elSectionTgt.classList.remove("slide-in-right");
        elSwap.style.pointerEvents = "";
        permute = false;
        elInput.focus();
      }, DUREE_ANIM);
    }, DUREE_ANIM);
  });

  // JSON files 
  const DICTIONARY_FILES = ["Grammar", "Verbs", "Nouns", "Adjectives", "Adverbs", "Misc"];

  async function init() {
    try {
      const charges = await Promise.all(DICTIONARY_FILES.map((f) =>
        fetch("dict/" + f + ".json").then((r) => {
          if (!r.ok) throw new Error(f + ".json (" + r.status + ")");
          return r.json();
        })));
      const dicts = {};
      for (let i = 0; i < DICTIONARY_FILES.length; i++) dicts[DICTIONARY_FILES[i]] = charges[i];
      engine = window.RakounCore.createEngine(dicts);
      elTranslator.setAttribute("aria-busy", "false");
      updateLanguages();
      translate();
    } catch (err) {
      console.error("[Rakoun] Échec de chargement du dictionnaire :", err);
      appEnPanne = true;
      elTranslator.setAttribute("aria-busy", "false");
      elInput.disabled = true;
      elListenSrc.disabled = true;
      elListenTgt.disabled = true;
      elSwap.style.pointerEvents = "none";
      elCopySrc.disabled = true;
      elCopyTgt.disabled = true;
      elClear.disabled = true;
      elOutput.value = "Erreur de chargement. Essayez de rafraîchir la page.\n" +
                       "Awa fòt o chajman. Éséyé rafwéchi paj-la.";
    }
  }

  updateLanguages();
  init();

  // Get Current Year
  const elYear = $("year");
  if (elYear) elYear.textContent = new Date().getFullYear();


  // Service worker pour le cache hors-ligne. 
  if ("serviceWorker" in navigator) {
    addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => {
        console.error("[Rakoun] Échec d'enregistrement du service worker :", err);
      });
    });
  }
})();
