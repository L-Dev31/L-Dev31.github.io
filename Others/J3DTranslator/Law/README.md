# Code Pénal Quiz

Un jeu de quiz interactif sur le code pénal français avec un design dark corporate style Microsoft.

## Fonctionnalités

### 4 Modes de Jeu
1. **Numéro → Description** : Devinez la description à partir du numéro de l'article
2. **Description → Numéro** : Trouvez le numéro de l'article correspondant à la description
3. **Situation → Numéro** : Identifiez l'article applicable à une situation réelle
4. **Numéro → Situation** : Trouvez la situation correspondant à l'article

### Système de Niveaux
- 11 niveaux de difficulté (0 à 10)
- Titres progressifs : de "Novice" à "Maître du barreau suprême"
- Articles du code pénal français répartis par niveau de difficulté

### Gamification
- Système de 3 cœurs de vie
- Timer de 30 secondes par question
- Système d'étoiles basé sur les cœurs restants (3 cœurs = 3 étoiles)
- Sauvegarde de la progression dans le localStorage
- Affichage des étoiles obtenues pour chaque niveau

### Design
- Thème dark corporate style Microsoft
- Interface responsive (desktop et mobile)
- Animations et transitions fluides
- Icônes avec gradients à 45 degrés
- Design clean et professionnel

## Installation et Utilisation

### Méthode 1 : Serveur HTTP local (Recommandée)
```bash
cd code_penal_quiz
python3 -m http.server 8000
```
Puis ouvrez http://localhost:8000 dans votre navigateur.

### Méthode 2 : Serveur web
Uploadez tous les fichiers sur votre serveur web et accédez au fichier index.html.

## Structure des Fichiers

```
code_penal_quiz/
├── index.html          # Page principale
├── css/
│   └── style.css       # Styles CSS
├── js/
│   └── script.js       # Logique JavaScript
├── data/
│   └── data.json       # Base de données des articles
└── README.md           # Ce fichier
```

## Base de Données

Le fichier `data/data.json` contient :
- Plus de 40 articles du code pénal français
- Descriptions officielles des articles
- Situations réelles d'application
- Classification par niveau de difficulté

## Compatibilité

- Navigateurs modernes (Chrome, Firefox, Safari, Edge)
- Responsive design pour mobile et desktop
- Pas de dépendances externes

## Fonctionnalités Techniques

- Chargement asynchrone des données JSON
- Sauvegarde locale de la progression
- Génération dynamique des questions
- Mélange aléatoire des options de réponse
- Timer en temps réel
- Animations CSS avancées

## Personnalisation

Pour ajouter des articles :
1. Modifiez le fichier `data/data.json`
2. Ajoutez vos articles avec les champs : `number`, `description`, `situation`, `level`
3. Le jeu s'adaptera automatiquement au nouveau contenu

Profitez de votre apprentissage du droit pénal français !

