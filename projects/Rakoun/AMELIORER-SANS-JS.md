# Améliorer Rakoun sans toucher au JavaScript

Le moteur (`js/engine.js`) est une **logique générique et robuste**. Il ne doit
**jamais** être modifié pour un cas particulier. Tout le savoir linguistique —
vocabulaire, exceptions, expressions, désambiguïsation — vit dans les **données**
(`dict/*.json`). Règle d'or :

> Si tu crois devoir éditer le JS pour UN mot ou UNE phrase, c'est une erreur :
> c'est une **donnée**. Le JS ne change que pour une règle *générale* qui vaut
> pour toute une classe de mots.

---

## Où mettre quoi

| Fichier | Contenu | `type_fr` attribué |
|---|---|---|
| `dict/Nouns.json` | noms communs et propres | `nom` |
| `dict/Verbs.json` | verbes (clé `entries`) + règles de conjugaison (clé `rules`) | `verbe` |
| `dict/Adjectives.json` | adjectifs | `adj` |
| `dict/Adverbs.json` | adverbes | `adv` |
| `dict/Misc.json` | mots-outils, prépositions, relatifs, **expressions figées** | `misc` |
| `dict/Grammar.json` | particules, marqueurs, pronoms, tables grammaticales | — |

Le **fichier détermine la nature du mot**. C'est le levier central : pour qu'un
mot soit traité comme un nom, il suffit qu'il soit dans `Nouns.json`.

---

## Format d'une entrée

```json
{ "fr": "tracteur", "gp": "traktè" }
```

Variantes (pluriel, féminin, graphies) → `fr` en **liste**, `gp` peut aussi être
une liste (la 1re forme est le défaut) :

```json
{ "fr": ["différent", "différente", "différents", "différentes"], "gp": "diféran" }
{ "fr": "noir", "gp": ["nwè", "nwa"] }
```

---

## Recettes par type de problème

### 1. Un mot n'est pas traduit (reste en français)
→ Ajoute-le dans le bon fichier selon sa nature. C'est tout.

### 2. Un mot est mal traduit
→ Corrige le `gp` de son entrée. (Ex. `plastique` disait `tôl` = tôle métallique,
corrigé en `["plastik", "tôl"]`.)

### 3. Homographe nom/verbe mal interprété (« mon **lit** », « le vent **joue** »)
Le moteur désambiguïse **déjà** par le contexte (déterminant devant → nom ;
sujet devant → verbe). Il faut juste que le mot **existe dans les deux fichiers** :
- le sens nom dans `Nouns.json` (`lit` → `kabann`),
- le sens verbe via son infinitif dans `Verbs.json` (`lire` → `li`).

Si un homographe est mal lu, vérifie qu'il n'est pas **rangé au mauvais endroit**
(ex. `rapide` était par erreur dans `Nouns.json` → classé « nom » → il manquait
comme adjectif ; `ombre` n'existait que comme verbe → manquait comme nom).

### 4. Idiome ou expression figée (« froid de canard », « barbe à papa », « en fait »)
→ Entrée **multi-mots** : mets plusieurs mots dans `fr`. Le moteur cherche les
segments de **6 mots → 1 mot** et prend le plus long qui matche, avant toute autre
règle.

```json
{ "fr": "barbe à papa", "gp": "sirèt", "type": "misc" }
{ "fr": "froid de canard", "gp": "fwèt kon chyen", "type": "misc" }
{ "fr": "en fait", "gp": "an réyalité", "type": "misc" }
```

C'est le mécanisme le plus puissant : **n'importe quelle traduction sur-mesure,
sensible au contexte, se fait en ajoutant l'expression complète en données.**

### 5. Mot-outil, relatif, préposition (« dont », « par »…)
→ Entrée simple dans `Misc.json`. (Ex. `dont` → `ki`, `par` → `pa`. Ce sont des
données, plus du code — l'ancien cas « dont » codé en dur a été retiré du JS.)

### 6. Marqueur / pronom / table grammaticale
→ `dict/Grammar.json` (structures existantes : `pronoms_sujets`, `possessifs`,
`interrogatifs`, `marqueur_present`…).

---

## Vérifier un changement (aucune compilation)

```bash
# 1. Aucune régression sur le corpus curé (doit rester à 0 parasite)
node test/run.cjs

# 2. Score contre les références humaines
node test/gold.cjs gold.fr-cr.json
node test/gold.cjs gold2.fr-cr.json

# 3. Indice de publication (doit rester >= 90, RELEASABLE)
node test/releasability.cjs

# 4. Trouver les prochains trous à combler (lot prêt à remplir)
node test/releasability.cjs --batch 40   # -> dict/_candidates.todo.json
```

Boucle idéale : tu écris un jeu de phrases FR + leur créole correct dans un
`gold*.fr-cr.json`, tu lances `gold.cjs`, tu combles les trous **en données**, tu
relances. Le score monte, le JS ne bouge jamais.

---

## Quand (rarement) toucher au JS

Uniquement pour une règle **générale** valant pour toute une classe :
p. ex. « après un verbe gouverneur, le verbe suivant est un infinitif nu » —
ça vaut pour *tous* les verbes, ce n'est pas un cas particulier. Si ta règle
nomme un mot précis, ce n'est pas une règle : c'est une donnée.
