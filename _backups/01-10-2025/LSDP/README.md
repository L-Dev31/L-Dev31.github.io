# Les Saveurs de Provence - Restaurant Website

Un site web élégant pour le restaurant 5 étoiles "Les Saveurs de Provence".

## Fichiers requis

Pour que le site fonctionne correctement, vous devez ajouter les fichiers suivants :

### 1. Vidéo Hero (obligatoire)
- **Fichier** : `hero-bg.mp4`
- **Emplacement** : À la racine du projet
- **Description** : Vidéo de fond pour la section hero (recommandé : 1920x1080, format MP4)

### 2. Drapeaux pour les langues (optionnel mais recommandé)
Ajoutez les images de drapeaux dans le dossier `flags/` :

- `fr.png` - Drapeau français
- `es.png` - Drapeau espagnol  
- `it.png` - Drapeau italien
- `de.png` - Drapeau allemand
- `ru.png` - Drapeau russe
- `ua.png` - Drapeau ukrainien
- `pt.png` - Drapeau portugais
- `cn.png` - Drapeau chinois
- `jp.png` - Drapeau japonais

**Taille recommandée** : 24x18px ou 32x24px (format PNG avec transparence)

## Fonctionnalités

### ✅ Implémentées
- Hero section en plein écran (100vh)
- Vidéo de fond avec effet d'assombrissement (brightness: 0.8)
- Effet de noise animé en overlay
- Navbar transparente avec effet de flou
- Menu hamburger (2 lignes) à gauche
- Sélecteur de langue à droite avec drapeaux
- Support de 9 langues : FR, ES, IT, DE, RU, UA, PT, CN, JP
- Design responsive
- Animations et transitions fluides

### 🔄 À venir
- Menu de navigation fonctionnel
- Sections de contenu (menu, à propos, contact, etc.)
- Système de traduction complet
- Galerie d'images
- Formulaire de réservation

## Structure des fichiers

```
LSDP/
├── index.html          # Page principale
├── styles.css          # Styles CSS
├── script.js           # JavaScript
├── hero-bg.mp4         # Vidéo hero (à ajouter)
├── flags/              # Dossier des drapeaux
│   ├── fr.png
│   ├── es.png
│   ├── it.png
│   ├── de.png
│   ├── ru.png
│   ├── ua.png
│   ├── pt.png
│   ├── cn.png
│   └── jp.png
└── README.md           # Ce fichier
```

## Lancement

Ouvrez simplement `index.html` dans votre navigateur web ou utilisez un serveur local pour un meilleur rendu.

## Notes techniques

- Le site utilise du CSS moderne avec backdrop-filter
- Les animations sont optimisées pour les performances
- Le design est entièrement responsive
- Fallback prévu si la vidéo ne charge pas
- Support des préférences de langue sauvegardées
