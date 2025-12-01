# Trello-style Resources (Simple)

Petit site statique de style Trello pour afficher des ressources organisées en listes (pôles).

Fonctionnalités :

- 5 colonnes prédéfinies : Créatif (vert), Système Dev (bleu), AMC (orange), 3D Animation (violet), Administration (gris)
- Chargement des ressources depuis `resources.json` (ou localStorage si modifié)
- Glisser-déposer simple pour déplacer les cartes entre les colonnes
- Modal pour ajouter une ressource
- CLIQUEZ sur une carte pour voir les détails (titre, description et pôle)
- Exporter l'état actuel en JSON
- Réinitialiser (supprime le localStorage et recharge `resources.json`)

Installation & test local :

1. Pour servir les fichiers localement (recommandé) :

- Option 1: Python 3 (dans PowerShell) :
```
python -m http.server 8000
```

- Option 2: npm `serve` :
```
npx serve .
```

Puis ouvrez `http://localhost:8000` (ou le port approprié) dans votre navigateur.

2. Contribuer / développer :
- Modifiez `resources.json` ou modifiez via l'UI et exportez si vous souhaitez sauvegarder une copie.

Notes :
- L'application utilise `localStorage` pour persister les changements sur votre machine; si vous voulez réinitialiser la vue, utilisez le bouton `Réinitialiser`.
- Pas d'édition des ressources en ligne : pour modifier, supprimez et recréez, ou réinitialisez puis modifiez `resources.json`.
 - Les couleurs des pôles sont indiquées par une bordure gauche colorée pour chaque colonne.
- Si vous ouvrez `index.html` en `file://` directement, la requête fetch vers `resources.json` risque d'échouer — servez les fichiers via HTTP pour de meilleurs résultats.

Améliorations possibles :
- Ajout d'une sauvegarde côté serveur (API)
- Drag-n-drop avec position précise et ré-ordonnancement
- Ajout d'étiquette / priorité / date / membre

