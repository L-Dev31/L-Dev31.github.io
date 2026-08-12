(function (root) {
  "use strict";

  const synth = root.speechSynthesis;
  if (!synth) { root.RakounListen = { parler() {} }; return; }

  // Pas de voix créole native : le français sert d'approximation phonétique.
  const LANGUES = { fr: "fr-FR", gp: "fr-FR" };

  let bouton = null;   // bouton en cours de lecture, sinon null

  function relacher() {
    if (bouton) { bouton.removeAttribute("aria-pressed"); bouton = null; }
  }

  function parler(texte, langue, declencheur) {
    // Deuxième appui = arrêt.
    if (bouton) { synth.cancel(); relacher(); return; }

    const utt = new SpeechSynthesisUtterance(texte);
    utt.lang = LANGUES[langue] || "fr-FR";
    utt.rate = 0.85;
    utt.onstart = () => {
      bouton = declencheur || null;
      if (bouton) bouton.setAttribute("aria-pressed", "true");
    };
    utt.onend = utt.onerror = relacher;
    synth.speak(utt);
  }

  // Une lecture en cours survit à la navigation : on la coupe explicitement.
  addEventListener("pagehide", () => { synth.cancel(); relacher(); });

  root.RakounListen = { parler };
})(window);
