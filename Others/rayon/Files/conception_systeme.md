# Système de Points et Récompenses - Projet Rayon

## Introduction

Ce document présente la conception détaillée du système de points et récompenses de la plateforme Rayon. Ce mécanisme de fidélisation constitue un élément différenciateur clé pour la plateforme, visant à encourager l'engagement régulier des utilisateurs et à renforcer leur fidélité dans les territoires d'Outre-mer français.

## Objectifs stratégiques

Le système de points et récompenses de Rayon poursuit plusieurs objectifs stratégiques :

1. **Stimuler l'engagement quotidien** : Encourager les utilisateurs à se connecter régulièrement à la plateforme
2. **Favoriser les comportements vertueux** : Récompenser les actions qui contribuent à la qualité et au dynamisme de la plateforme
3. **Renforcer la rétention** : Réduire le taux d'attrition en créant une valeur ajoutée exclusive
4. **Créer un avantage concurrentiel** : Se différencier des plateformes généralistes non adaptées aux Outre-mer
5. **Développer l'écosystème local** : Favoriser les partenariats avec des acteurs économiques ultramarins
6. **Générer des données comportementales** : Mieux comprendre les habitudes des utilisateurs pour optimiser la plateforme

## Architecture du système

### Principes fondamentaux

- **Simplicité** : Règles claires et faciles à comprendre
- **Transparence** : Visibilité totale sur l'accumulation et l'utilisation des points
- **Équité** : Accessibilité à tous les utilisateurs, quelle que soit leur activité
- **Pertinence locale** : Adaptation aux spécificités des territoires ultramarins
- **Équilibre économique** : Coût maîtrisé pour assurer la pérennité du système

### Types de points

Le système repose sur un type unique de points, les "Rayons", qui présentent les caractéristiques suivantes :

- **Unité de base** : 1 Rayon
- **Valeur indicative** : 1 Rayon ≈ 0,01€ en pouvoir d'achat de récompenses
- **Durée de validité** : 6 mois pour les points gagnés par les actions (hors connexion quotidienne)
- **Spécificité** : Les points de connexion quotidienne doivent être récoltés le jour même (non cumulables)

## Mécanismes d'acquisition des points

### Actions récompensées

| Action | Points attribués | Fréquence | Justification |
|--------|------------------|-----------|---------------|
| **Connexion quotidienne** | 5 points | 1 fois/jour | Encourage l'habitude d'utilisation quotidienne |
| **Publication d'une annonce** | 10 points | Par annonce | Stimule l'enrichissement du catalogue |
| **Vente réalisée** | 15 points + 1 point/€ | Par transaction | Récompense les vendeurs actifs |
| **Achat réalisé** | 5 points + 0,5 point/€ | Par transaction | Encourage les achats sur la plateforme |
| **Évaluation laissée** | 5 points | Après transaction | Améliore la confiance dans l'écosystème |
| **Parrainage** | 50 points | Par filleul actif | Accélère la croissance organique |
| **Première transaction du mois** | 20 points | 1 fois/mois | Encourage l'activité mensuelle minimale |
| **Complétion du profil** | 30 points | Unique | Améliore la qualité des profils utilisateurs |
| **Vérification d'identité** | 50 points | Unique | Renforce la sécurité et la confiance |
| **Anniversaire d'inscription** | 100 points | Annuel | Célèbre la fidélité à long terme |

### Système de "streak" (séries)

Le système de streak multiplie les points de connexion quotidienne selon la durée de la série de connexions consécutives :

| Durée du streak | Multiplicateur | Points quotidiens | Justification |
|-----------------|----------------|-------------------|---------------|
| 1-2 jours | x1 | 5 points | Base de référence |
| 3-6 jours | x1,2 | 6 points | Encouragement initial |
| 7-14 jours | x1,5 | 7,5 points | Renforcement de l'habitude |
| 15-29 jours | x2 | 10 points | Récompense de la constance |
| 30+ jours | x3 | 15 points | Valorisation de la fidélité exceptionnelle |

**Règles spécifiques :**
- Le compteur de streak est réinitialisé après un jour d'absence
- Un joker hebdomadaire est accordé après 14 jours de streak consécutifs (permet de manquer un jour sans perdre le streak)
- Les points quotidiens doivent être récoltés activement via une action spécifique dans l'application
- Une notification quotidienne rappelle à l'utilisateur de collecter ses points

### Bonus territoriaux

Pour tenir compte des spécificités ultramarines, des bonus territoriaux sont appliqués :

| Territoire | Événement | Bonus | Période |
|------------|-----------|-------|---------|
| La Réunion | Grand Raid | x2 sur les points de connexion | Octobre (1 semaine) |
| Antilles | Carnaval | x2 sur les points de connexion | Février (2 semaines) |
| Polynésie | Heiva | x2 sur les points de connexion | Juillet (1 semaine) |
| Nouvelle-Calédonie | Festival des Arts | x2 sur les points de connexion | Août (1 semaine) |
| Tous territoires | Fêtes de fin d'année | x2 sur toutes les actions | 24 déc. - 1er jan. |
| Tous territoires | Anniversaire Rayon | x3 sur toutes les actions | Date de lancement (3 jours) |

## Catalogue de récompenses

### Catégories de récompenses

| Catégorie | Description | Exemples | Valeur moyenne (points) |
|-----------|-------------|----------|-------------------------|
| **Avantages plateforme** | Fonctionnalités premium temporaires | Mise en avant d'annonces, badge spécial | 300-500 |
| **Réductions commerciales** | Bons de réduction chez des partenaires | 10% dans une enseigne locale, 5€ de réduction | 500-1000 |
| **Produits locaux** | Articles de producteurs ultramarins | Café, rhum, artisanat local | 1000-2000 |
| **Loisirs et culture** | Activités récréatives | Places de cinéma, entrées musée | 800-1500 |
| **Services** | Prestations utilitaires | Livraison gratuite, service photo pro | 500-1200 |
| **Expériences** | Moments exclusifs | Visite privée, atelier créatif | 2000-5000 |
| **Dons caritatifs** | Soutien à des associations locales | Don à une association environnementale | 500+ |

### Exemples de récompenses par territoire

| Territoire | Récompense | Coût (points) | Partenaire potentiel |
|------------|------------|---------------|----------------------|
| La Réunion | Place de cinéma | 1000 | Réseau Mauréfilms |
| La Réunion | Bon d'achat 10€ | 1200 | Supermarchés Score |
| Guadeloupe | Traversée inter-îles | 1500 | Express des Îles |
| Martinique | Bouteille de rhum | 2000 | Distilleries locales |
| Guyane | Visite guidée | 1800 | Office de tourisme |
| Polynésie | Collier de coquillages | 1500 | Artisans locaux |
| Nouvelle-Calédonie | Initiation plongée | 3000 | Clubs nautiques |
| Mayotte | Crédit téléphonique | 800 | Opérateurs locaux |
| Tous territoires | Mise en avant 7 jours | 300 | Interne Rayon |
| Tous territoires | Commission réduite (-50%) | 500 | Interne Rayon |

### Stratégie de partenariats

La stratégie de développement des partenariats pour le catalogue de récompenses s'articule autour de plusieurs axes :

1. **Partenariats locaux prioritaires** : Privilégier les acteurs économiques ultramarins pour renforcer l'ancrage territorial
2. **Diversité des offres** : Assurer une variété de récompenses adaptées aux différents profils d'utilisateurs
3. **Exclusivité** : Négocier des offres exclusives non disponibles par d'autres canaux
4. **Rotation** : Renouveler régulièrement le catalogue pour maintenir l'intérêt
5. **Saisonnalité** : Adapter les offres aux périodes de l'année et aux événements locaux
6. **Accessibilité** : Proposer des récompenses à différents niveaux de points pour satisfaire tous les utilisateurs

## Interface utilisateur et expérience

### Éléments d'interface

| Élément | Fonction | Emplacement | Caractéristiques |
|---------|----------|-------------|------------------|
| Compteur de points | Afficher le solde actuel | En-tête de l'application | Mise à jour en temps réel, animation lors de gains |
| Indicateur de streak | Visualiser la série en cours | Tableau de bord utilisateur | Design ludique, compte à rebours pour la collecte |
| Historique des points | Consulter les mouvements | Section "Mes points" | Filtrable, exportable, détaillé |
| Catalogue de récompenses | Explorer les offres disponibles | Section "Récompenses" | Filtres par catégorie, territoire, coût |
| Notifications | Alerter sur les opportunités | Push et in-app | Personnalisées, non intrusives |
| Progression | Visualiser les objectifs | Tableau de bord utilisateur | Objectifs quotidiens, hebdomadaires, mensuels |

### Parcours utilisateur

1. **Découverte du système**
   - Présentation lors de l'onboarding
   - Tutoriel interactif
   - Première récompense facile à obtenir (50 points offerts à l'inscription)

2. **Engagement quotidien**
   - Notification quotidienne pour la collecte des points
   - Animation de collecte ludique
   - Félicitations pour les streaks atteints

3. **Progression et objectifs**
   - Objectifs personnalisés selon le profil
   - Défis hebdomadaires avec bonus
   - Célébration des paliers atteints

4. **Échange de points**
   - Processus simple en 3 clics maximum
   - Confirmation visuelle
   - Suivi de l'utilisation des récompenses

5. **Fidélisation à long terme**
   - Statuts de fidélité débloqués progressivement
   - Avantages exclusifs pour les utilisateurs fidèles
   - Reconnaissance des anniversaires d'inscription

## Modélisation économique

### Coûts du système

| Composante | Coût unitaire | Volume estimé (an 1) | Coût total (an 1) |
|------------|---------------|----------------------|-------------------|
| Points de connexion | 0,05€/jour/utilisateur actif | 5 256 000 jours-utilisateurs | 26 280€ |
| Points d'action | 0,15€/transaction | 168 480 transactions | 25 272€ |
| Développement technique | Forfait | - | 15 000€ |
| Gestion des partenariats | Forfait | - | 20 000€ |
| Marketing du programme | 10% du budget marketing | - | 14 418€ |
| **Total** | | | **100 970€** |

*Note: Le coût total représente environ 21% du chiffre d'affaires en année 1, 10% en année 2, et 10% en année 3.*

### Retour sur investissement

| Indicateur | Sans système de points | Avec système de points | Amélioration | Impact financier (an 3) |
|------------|------------------------|------------------------|-------------|-------------------------|
| Rétention à 90 jours | 25% | 35% | +40% | +490 000€ |
| Fréquence d'utilisation | 8 sessions/mois | 12 sessions/mois | +50% | +370 000€ |
| Taux de conversion | 25% | 30% | +20% | +420 000€ |
| Taux d'utilisateurs pro | 3% | 5% | +67% | +65 000€ |
| **Impact total** | | | | **+1 345 000€** |

*Note: L'impact financier est calculé sur la base de l'année 3, en comparant les scénarios avec et sans système de points.*

### Équilibre du système

Pour assurer la pérennité économique du système, plusieurs mécanismes d'équilibrage sont prévus :

1. **Ajustement dynamique** : Modification des barèmes d'attribution selon les métriques d'utilisation
2. **Plafonnement** : Limite quotidienne/mensuelle de points gagnés par certaines actions
3. **Dévaluation contrôlée** : Augmentation progressive du coût des récompenses (5% par an)
4. **Expiration** : Points non utilisés expirés après 6 mois (hors statuts privilégiés)
5. **Offres flash** : Récompenses temporaires pour encourager l'utilisation des points accumulés

## Évolution et personnalisation

### Statuts de fidélité

Le système intègre des statuts de fidélité qui débloquent des avantages supplémentaires :

| Statut | Condition d'obtention | Avantages exclusifs |
|--------|----------------------|---------------------|
| **Débutant** | Inscription | Fonctionnalités de base |
| **Régulier** | 500 points cumulés | +10% sur les points gagnés, 1 mise en avant gratuite/mois |
| **Habitué** | 2 000 points cumulés | +20% sur les points gagnés, 2 mises en avant gratuites/mois |
| **Expert** | 5 000 points cumulés | +30% sur les points gagnés, commission réduite de 1% |
| **Ambassadeur** | 10 000 points cumulés | +50% sur les points gagnés, commission réduite de 2%, points valables 1 an |

### Personnalisation territoriale

Le système sera adapté aux spécificités de chaque territoire :

| Territoire | Adaptation des points | Récompenses spécifiques | Partenaires privilégiés |
|------------|----------------------|-------------------------|-------------------------|
| La Réunion | Bonus sur sports et électroménager | Activités outdoor, événements culturels | Enseignes locales, associations sportives |
| Antilles | Bonus sur électronique et puériculture | Transport inter-îles, événements | Compagnies maritimes, commerces |
| Guyane | Bonus sur bricolage et auto | Produits locaux, services | Artisans, commerces spécialisés |
| Polynésie | Bonus sur nautisme et électronique | Transport inter-îles, artisanat | Transporteurs, artisans |
| Nouvelle-Calédonie | Bonus sur outdoor et bricolage | Activités nature, produits culturels | Associations, centres culturels |
| Mayotte | Bonus sur électroménager et mobilier | Produits alimentaires, téléphonie | Commerces, opérateurs télécom |

### Évolutions futures planifiées

| Phase | Timing | Nouvelles fonctionnalités |
|-------|--------|---------------------------|
| **1.0** | Lancement | Système de base (points, streaks, récompenses) |
| **1.5** | M+3 | Défis hebdomadaires, objectifs personnalisés |
| **2.0** | M+6 | Statuts de fidélité, avantages exclusifs |
| **2.5** | M+12 | Événements saisonniers, récompenses limitées |
| **3.0** | M+18 | Personnalisation avancée, gamification |
| **3.5** | M+24 | Communautés d'intérêt, défis collectifs |

## Mesure de performance

### KPIs spécifiques

| KPI | Objectif année 1 | Objectif année 3 | Méthode de mesure |
|-----|------------------|------------------|-------------------|
| Taux d'activation | 70% | 85% | % d'utilisateurs ayant collecté au moins une fois des points |
| Taux de collecte quotidienne | 25% | 45% | % d'utilisateurs actifs collectant leurs points quotidiens |
| Longueur moyenne des streaks | 3 jours | 5 jours | Moyenne des séries de connexions consécutives |
| Taux d'utilisation des points | 60% | 80% | % des points gagnés qui sont échangés contre des récompenses |
| Impact sur la rétention | +10pts | +15pts | Différence de rétention entre utilisateurs engagés/non engagés |
| Satisfaction utilisateur | 8/10 | 9/10 | Enquêtes de satisfaction spécifiques au programme |
| ROI du programme | 1,5 | 5,0 | Valeur générée / coût du programme |

### Tableau de bord de suivi

Un tableau de bord dédié permettra de suivre en temps réel les performances du système :

1. **Métriques d'acquisition** : Points distribués, actions récompensées, utilisateurs actifs
2. **Métriques d'engagement** : Streaks moyens, fréquence de collecte, taux de participation
3. **Métriques d'échange** : Récompenses les plus populaires, taux d'utilisation, délai d'échange
4. **Métriques d'impact** : Corrélation avec la rétention, l'activité et les revenus
5. **Métriques économiques** : Coût par utilisateur, ROI, projections

## Stratégies de communication

### Messages clés

| Public | Message principal | Canaux privilégiés | Fréquence |
|--------|------------------|-------------------|-----------|
| Nouveaux utilisateurs | "Gagnez des récompenses dès votre première connexion" | Onboarding, emails de bienvenue | À l'inscription |
| Utilisateurs occasionnels | "Ne manquez pas vos points quotidiens" | Notifications push, emails | Hebdomadaire |
| Utilisateurs réguliers | "Augmentez votre streak pour multiplier vos gains" | In-app, emails personnalisés | Bi-hebdomadaire |
| Utilisateurs inactifs | "Vos points vous attendent, ne les laissez pas expirer" | Emails, SMS | Mensuelle |
| Utilisateurs fidèles | "Découvrez vos avantages exclusifs" | Emails VIP, section dédiée | Mensuelle |

### Campagnes spécifiques

| Campagne | Objectif | Timing | Mécaniques |
|----------|----------|--------|------------|
| Lancement | Faire connaître le système | J-30 à J+30 | Points doublés, récompenses exclusives |
| Boost saisonnier | Stimuler l'activité en période creuse | Périodes identifiées | Points triplés sur certaines act<response clipped><NOTE>To save on context only part of this file has been shown to you. You should retry this tool after you have searched inside the file with `grep -n` in order to find the line numbers of what you are looking for.</NOTE>