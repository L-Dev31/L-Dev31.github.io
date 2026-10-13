# projects/ — conventions

- `cases/<id>.html` — fragment HTML injecté dans `project.html?id=<id>`.
  Images via `assets/images/projects/<id>/…`, vignette grille : `assets/images/projects/<id>.png`.
- `cases/files/<id>-*.pdf` — pièces jointes des case studies (liens `ctas` dans `projects.json`).
- `demos/<id>/` — site statique autonome lié à un projet visible (`bmge`, `lsdp`, `bgaw`).
- `archive/<slug>/` — vieux projets / expérimentations, hors portfolio.
- `assets/data/projects.json` — projets **visibles** uniquement (grille + sitemap).
- `assets/data/disabled-projects.json` — projets **en pause** : pour réactiver, déplacer l'entrée
  vers `projects.json` (pas de flag `disabled`, le fichier fait foi).

Règles : tout en minuscules (GitHub Pages est sensible à la casse), un dossier = un `id`,
chemins relatifs à l'intérieur des démos.
