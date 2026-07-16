# Boucles de vérification Rakoun

Trois boucles complémentaires (lancer depuis `Rakoun/`) :

```
node test_node.cjs           # GOLD : correction exacte, 308 cas — doit rester 100%
node test/run.cjs            # PARASITES : corpus curé, 0 mot non traduit
node test/realworld.cjs      # MONDE RÉEL : articles entiers → parasites classés
```

## Boucle monde réel (`realworld.cjs`) — test + classification + réparation

Dépose un article dans `test/samples/` (`*.fr.txt` → FR→GP, `*.gp.txt` → GP→FR),
puis lance `node test/realworld.cjs`. Chaque mot non traduit est **classé** :

- **⛔ LOGIQUE** — mot source connu du dico mais laissé tel quel → bug de
  logique/homographe (le moteur savait le traduire).
- **📖 DICO** — mot inconnu en minuscule → trou de dictionnaire à combler.
- **🔤 PROPRE** — mot capitalisé inconnu → nom propre présumé (ignoré du score).

Les parasites sont **dédupliqués et triés par fréquence** = todo de réparation.
`--todo` sort un squelette JSON prêt à remplir (`gp` à compléter) puis à coller
dans le bon `dict/*.json`. `--context` montre une phrase d'exemple par parasite.

## Boucle parasites (`run.cjs`)

```
node test/run.cjs            # rapport + code de sortie (0 = aucun parasite)
```

## Principe

La logique du moteur (`js/engine.js`) est un **interpréteur stable** : idéalement,
les corrections futures se font dans les **JSON de `dict/`**, pas dans le code.
Cette boucle vérifie objectivement qu'il ne reste **aucun parasite** — c.-à-d.
aucun mot de la langue **source** laissé non traduit dans la sortie.

Il n'y a **pas de traduction « gold »** à maintenir à la main. Le contrôle
interroge directement les index du moteur (`ctx.index_fr`, `ctx.index_gp`) et sa
classification (`classer_fr`, `trouver_infinitif`, exposés par `createEngine`) :

- **FR→GP** : un token de sortie qui est encore un mot **français** reconnu (ou
  recopié tel quel depuis la phrase source) et qui n'est pas un mot créole
  légitime = parasite.
- **GP→FR** : un token de sortie qui est encore un mot **créole** connu et qui
  n'est pas un mot/forme française = parasite.

Les noms propres, nombres, et composants de formes multi-mots du dico sont
ignorés. Deux catégories sont distinguées dans le rapport :

- `RÉSIDU` : mot de la langue source **connu** laissé non traduit → souvent un
  bug de logique ou une entrée mal typée.
- `NON TRADUIT` : mot recopié de la source **hors dico** → trou de dictionnaire
  (à combler dans `dict/`).

## Corpus

`test/corpus.json` = 100 phrases (50 FR→GP, 50 GP→FR). En ajouter y renforce la
couverture sans exiger de référence humaine.

## Invariant

`node test/run.cjs` doit rester à **0 parasite**. Toute régression (nouveau mot
non traduit) le fait repasser au rouge.
