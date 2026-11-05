# projects/ — conventions

- `cases/<id>.html` — fragment HTML injecté dans `project.html?id=<id>`.
  Images via `assets/images/projects/<id>/…` .
- `cases/files/<id>-*.pdf` — pièces jointes des case studies (liens `ctas` dans `projects.json`).
- `demos/<id>/` — site statique autonome lié à un projet visible (`bmge`, `lsdp`, `bgaw`).
- `assets/data/projects.json` — projets **visibles** uniquement (grille + sitemap).
- `assets/data/disabled-projects.json` — projets **en pause** : pour réactiver, déplacer l'entrée
  vers `projects.json` (pas de flag `disabled`, le fichier fait foi).

Règles : tout en minuscules (GitHub Pages est sensible à la casse), un dossier = un `id`,
chemins relatifs à l'intérieur des démos.

Images : `.webp` pour les captures et mockups, `.jpg` (qualité 82, 2400 px max) pour les photos, `.svg` pour les icônes.
Noms en minuscules, séparés par des tirets (`street-billboard.webp`). Polices dans `assets/fonts/` en minuscules.
