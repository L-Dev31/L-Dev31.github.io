// Rakoun — pupilles qui suivent le curseur.
(function () {
  "use strict";
  const yeux = document.querySelectorAll(".eye-pupil");
  if (!yeux.length || matchMedia("(prefers-reduced-motion:reduce)").matches) return;

  const AMPL = 5, LISSAGE = 0.1, SEUIL = 0.05, n = yeux.length;
  const etat = new Float64Array(n * 4); // [x, y, centreX, centreY] par pupille
  let mx = innerWidth / 2, my = innerHeight / 2, mesure = false, anim = 0;

  function frame() {
    anim = 0;
    // offsetParent null = logo en display:none (mobile) : rien à animer.
    if (yeux[0].offsetParent === null) return;
    if (!mesure) {
      for (let i = 0; i < n; i++) {
        const r = yeux[i].getBoundingClientRect();
        etat[i * 4 + 2] = r.left + r.width * 0.5;
        etat[i * 4 + 3] = r.top + r.height * 0.5;
      }
      mesure = true;
    }
    let encore = false;
    for (let i = 0; i < n; i++) {
      const b = i * 4, dx = mx - etat[b + 2], dy = my - etat[b + 3];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d < AMPL * 10 ? d * 0.1 : AMPL) / d;
      const px = etat[b], py = etat[b + 1];
      const x = px + (dx * f - px) * LISSAGE, y = py + (dy * f - py) * LISSAGE;
      if (Math.abs(x - px) > SEUIL || Math.abs(y - py) > SEUIL) encore = true;
      else if (x === px && y === py) continue; // pas de réécriture inutile
      etat[b] = x; etat[b + 1] = y;
      yeux[i].style.transform = "translate(" + x + "px," + y + "px)";
    }
    if (encore) anim = requestAnimationFrame(frame);
  }

  // Une seule frame planifiée à la fois : throttle naturel de rAF. Inutile de
  // gérer visibilitychange, le navigateur suspend déjà rAF onglet caché.
  const relancer = () => { if (!anim) anim = requestAnimationFrame(frame); };
  const invalider = () => { mesure = false; relancer(); };

  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; relancer(); }, { passive: true });
  for (const ev of ["resize", "scroll"]) addEventListener(ev, invalider, { passive: true });
  relancer();
})();
