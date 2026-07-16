// Rakoun — câblage de l'interface web.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const elInput = $("input"), elOutput = $("output"), elSwap = $("swap"),
        elStatus = $("status"), elTranslator = $("translator"),
        elLangSrc = $("lang-src"), elLangTgt = $("lang-tgt"),
        elLangSrcNative = $("lang-src-native"), elLangTgtNative = $("lang-tgt-native"),
        elFlagSrc = $("flag-src"), elFlagTgt = $("flag-tgt"),
        elListenSrc = $("listen"), elListenTgt = $("listen-tgt"),
        elClear = $("clear");

  // Pas de voix créole native disponible : on désactive l'écoute côté créole.
  const NO_VOICE = { gp: true };

  const NAMES = { fr: "Français", gp: "Kréyòl Gwadloup" };
  const NAMES_NATIVE = { fr: "Fwansé", gp: "créole guadeloupéen" };
  const FLAG_URLS = {
    fr: "images/flags/fr.png",
    gp: "images/flags/gp.png"
  };
  let src = "fr", tgt = "gp";
  let engine = null;

  function majLangues() {
    elLangSrc.textContent = NAMES[src];
    elLangTgt.textContent = NAMES[tgt];
    elLangSrcNative.textContent = NAMES_NATIVE[src];
    elLangTgtNative.textContent = NAMES_NATIVE[tgt];
    elFlagSrc.src = FLAG_URLS[src];
    elFlagTgt.src = FLAG_URLS[tgt];
    elInput.placeholder = src === "fr" ? "Écrivez en français…" : "Maké an kréyòl…";
    elListenSrc.disabled = !!NO_VOICE[src];
    elListenTgt.disabled = !!NO_VOICE[tgt];
  }

  const BASE_FONT_PX = 32; // doit correspondre à font-size: 2rem dans style.css
  const MIN_FONT_PX = 24;
  const BASE_HEIGHT_PX = 220; // doit correspondre à min-height dans style.css

  function autosize(el) {
    let fontSize = BASE_FONT_PX;
    el.style.fontSize = fontSize + "px";
    el.style.height = BASE_HEIGHT_PX + "px";
    while (el.scrollHeight > el.clientHeight && fontSize > MIN_FONT_PX) {
      fontSize -= 1;
      el.style.fontSize = fontSize + "px";
    }
    if (el.scrollHeight > el.clientHeight) {
      el.style.height = el.scrollHeight + "px";
    }
  }

  function traduire() {
    elClear.classList.toggle("is-collapsed", !elInput.value.trim());
    if (!engine) return;
    const txt = elInput.value;
    elOutput.value = txt.trim() ? engine.traduire(txt, src, tgt) : "";
    autosize(elInput);
    autosize(elOutput);
  }

  function panelAction(el, action) {
    el.addEventListener("click", action);
    el.addEventListener("touchstart", (e) => {
      e.preventDefault();
      action();
    });
  }

  // ── Panel source ─────────────────────────────────────────────────────────
  panelAction($("listen"), () => {
    const txt = elInput.value;
    if (!txt.trim()) return;
    window.RakounListen.parler(txt, src);
  });

  panelAction($("copy"), () => {
    navigator.clipboard.writeText(elInput.value);
  });

  panelAction($("clear"), () => {
    elInput.value = "";
    traduire();
    elInput.focus();
  });

  // ── Panel cible ───────────────────────────────────────────────────────────
  panelAction($("listen-tgt"), () => {
    const txt = elOutput.value;
    if (!txt.trim()) return;
    window.RakounListen.parler(txt, tgt);
  });

  panelAction($("copy-tgt"), () => {
    navigator.clipboard.writeText(elOutput.value);
  });

  elInput.addEventListener("input", traduire);

  let swapping = false;
  const elSectionSrc = document.getElementById("section-src");
  const elSectionTgt = document.getElementById("section-tgt");

  elSwap.addEventListener("click", () => {
    if (swapping) return;
    swapping = true;
    elSwap.style.pointerEvents = "none";

    elSectionSrc.classList.add("slide-out-right");
    elSectionTgt.classList.add("slide-out-left");

    setTimeout(() => {
      elSectionSrc.classList.remove("slide-out-right");
      elSectionTgt.classList.remove("slide-out-left");

      [src, tgt] = [tgt, src];
      const o = elOutput.value;
      if (o) { elInput.value = o; }
      majLangues();
      traduire();

      elSectionSrc.classList.add("slide-in-left");
      elSectionTgt.classList.add("slide-in-right");

      setTimeout(() => {
        elSectionSrc.classList.remove("slide-in-left");
        elSectionTgt.classList.remove("slide-in-right");
        elSwap.style.pointerEvents = "";
        swapping = false;
        elInput.focus();
      }, 160);
    }, 160);
  });

  async function init() {
    try {
      const files = ["Grammar", "Verbs", "Nouns", "Adjectives", "Adverbs", "Misc"];
      const loaded = await Promise.all(
        files.map((f) => fetch("dict/" + f + ".json").then((r) => {
          if (!r.ok) throw new Error(f + ".json (" + r.status + ")");
          return r.json();
        }))
      );
      const dicts = {};
      files.forEach((f, i) => { dicts[f] = loaded[i]; });
      engine = window.RakounCore.createEngine(dicts);
      elTranslator.setAttribute("aria-busy", "false");
      majLangues();
      traduire();
    } catch (err) {
      elStatus.textContent = "Erreur de chargement : " + err.message +
        " — servez le dossier via un serveur HTTP (ex. python -m http.server).";
      elStatus.classList.add("error");
    }
  }

  majLangues();
  init();
})();

yearEl = document.getElementById("year");
yearEl.textContent = new Date().getFullYear();

// ── PWA : enregistrement du service worker ─────────────────────────────────
// Chemin relatif volontaire : le site est servi depuis un sous-dossier
// (/projects/Rakoun/). La portée du SW se limite donc à ce dossier.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.error("[Rakoun] Échec d'enregistrement du service worker :", err);
    });
  });
}