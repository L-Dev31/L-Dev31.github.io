// Rakoun — synthèse vocale via Web Speech API.
(function (root) {
  "use strict";

  // Pas de voix créole native : on utilise le français comme approximation phonétique.
  const LANG_MAP = { fr: "fr-FR", gp: "fr-FR" };

  let speaking = false;

  function parler(texte, lang) {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      return;
    }
    const utt = new SpeechSynthesisUtterance(texte);
    utt.lang = LANG_MAP[lang] || "fr-FR";
    utt.rate = 0.85;
    utt.onstart = () => {
      speaking = true;
      const btn = document.getElementById("listen");
      if (btn) btn.setAttribute("aria-pressed", "true");
    };
    utt.onend = utt.onerror = () => {
      speaking = false;
      const btn = document.getElementById("listen");
      if (btn) btn.removeAttribute("aria-pressed");
    };
    window.speechSynthesis.speak(utt);
  }

  root.RakounListen = { parler };
})(typeof window !== "undefined" ? window : globalThis);
