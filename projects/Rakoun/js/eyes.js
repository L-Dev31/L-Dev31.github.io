// Rakoun — pupilles qui suivent le curseur avec une latence (effet "yeux écarquillés").
(function () {
  "use strict";

  const eyes = document.querySelectorAll(".eye-pupil");
  if (!eyes.length) return;

  const MAX_OFFSET = 5; // px, amplitude max du mouvement de la pupille
  const EASE = 0.1; // plus petit = plus de latence

  const state = Array.from(eyes).map(() => ({ x: 0, y: 0, tx: 0, ty: 0 }));
  let mouseX = window.innerWidth / 2, mouseY = window.innerHeight / 2;

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function updateTargets() {
    eyes.forEach((eye, i) => {
      const rect = eye.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = mouseX - cx, dy = mouseY - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const offset = Math.min(MAX_OFFSET, dist / 10);
      state[i].tx = (dx / dist) * offset;
      state[i].ty = (dy / dist) * offset;
    });
  }

  function animate() {
    updateTargets();
    eyes.forEach((eye, i) => {
      const s = state[i];
      s.x += (s.tx - s.x) * EASE;
      s.y += (s.ty - s.y) * EASE;
      eye.style.transform = "translate(" + s.x.toFixed(2) + "px, " + s.y.toFixed(2) + "px)";
    });
    requestAnimationFrame(animate);
  }

  animate();
})();
