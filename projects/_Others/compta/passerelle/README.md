# Passerelle vers votre plateforme agréée

Axonis ne transmet pas directement aux impôts : la loi impose de passer par une **plateforme agréée (PA)** immatriculée par la DGFiP. Chaque entreprise choisit la sienne et y ouvre un accès API. Cette passerelle Google Apps Script garde vos identifiants côté serveur (jamais dans le navigateur ni sur GitHub) et dépose les factures Factur-X générées par Axonis sur votre PA.

## Installation

1. Créez un projet sur [script.google.com](https://script.google.com) et collez le contenu de `passerelle-pa.gs`.
2. **Paramètres du projet → Propriétés du script**, ajoutez :

   | Propriété | Valeur |
   |---|---|
   | `PA_TOKEN_URL` | URL OAuth2 de votre PA (ex. `https://…/oauth2/token`) |
   | `PA_INVOICES_URL` | URL de dépôt des factures de votre PA (ex. `https://…/v1.beta/invoices`) |
   | `PA_CLIENT_ID` | Identifiant client API fourni par votre PA |
   | `PA_CLIENT_SECRET` | Secret client API fourni par votre PA |
   | `RELAY_KEY` | Un mot de passe long de votre choix |

3. **Déployer → Nouveau déploiement → Application web**, exécuter en tant que *moi*, accès *Tout le monde*. Copiez l'URL `…/exec`.
4. Dans Axonis → **Compte** : collez cette URL dans « URL de la passerelle PA » et le même mot de passe dans « Clé de la passerelle ».

Le script suit le schéma le plus courant (OAuth2 *client credentials*, dépôt du PDF Factur-X en binaire). Si votre PA expose une route différente (norme AFNOR XP Z12-013 ou API propre), adaptez uniquement l'appel `UrlFetchApp.fetch(url, …)` selon sa documentation.
