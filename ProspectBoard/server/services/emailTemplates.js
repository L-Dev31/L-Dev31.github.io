/**
 * Templates d'emails prédéfinis pour ProspectBoard
 */

export const emailTemplates = {
  // Template de prospection générale
  general_prospection: {
    name: 'Prospection Générale',
    description: 'Template polyvalent pour tout type d\'entreprise',
    subject: 'Services numériques pour {{NOM_ENTREPRISE}} - {{VILLE}}',
    template: `Bonjour,

Je me présente, {{SENDER_NAME}}, spécialisé dans l'accompagnement numérique des entreprises locales.

J'ai remarqué {{NOM_ENTREPRISE}} dans ma recherche d'entreprises de {{CATEGORIE}} sur {{VILLE}}, et je pense pouvoir vous aider à développer votre présence en ligne.

Voici ce que je peux vous apporter :
• Création/refonte de site web moderne et responsive
• Optimisation de votre référencement local (SEO)
• Gestion de vos réseaux sociaux
• Campagnes publicitaires ciblées

Seriez-vous disponible pour un échange rapide de 15 minutes cette semaine ? Je peux vous présenter des exemples concrets de résultats obtenus avec d'autres {{CATEGORIE}} de la région.

Cordialement,
{{SENDER_NAME}}

P.S. : Vous pouvez voir quelques réalisations sur mon portfolio : [votre-site.com]`
  },

  // Template pour restaurants
  restaurant: {
    name: 'Spécial Restaurants',
    description: 'Template optimisé pour les restaurants et établissements de restauration',
    subject: 'Attirer plus de clients pour {{NOM_ENTREPRISE}} - Solutions digitales',
    template: `Bonjour,

En tant que spécialiste du marketing digital pour les restaurants, j'accompagne les établissements de {{VILLE}} à attirer plus de clients et augmenter leur chiffre d'affaires.

{{NOM_ENTREPRISE}} a attiré mon attention et je pense pouvoir vous aider à :

🍽️ **Développer votre visibilité locale** :
• Optimisation Google My Business et avis clients
• Référencement local "restaurant {{VILLE}}"
• Présence sur les plateformes de livraison

📱 **Moderniser votre présence en ligne** :
• Site web avec menu interactif et réservation en ligne
• Photos professionnelles de vos plats
• Stories et posts Instagram qui font saliver

📊 **Mesurer vos résultats** :
Mes derniers clients restaurateurs ont vu une augmentation moyenne de 30% de leur fréquentation en 3 mois.

Pourriez-vous me consacrer 15 minutes cette semaine pour discuter de vos objectifs ?

Bien à vous,
{{SENDER_NAME}}

P.S. : Je connais bien le secteur de la restauration à {{VILLE}} et je peux vous donner des conseils personnalisés même si nous ne travaillons pas ensemble.`
  },

  // Template pour commerces de proximité
  local_business: {
    name: 'Commerces Locaux',
    description: 'Pour magasins, boutiques et commerces de proximité',
    subject: 'Booster la visibilité de {{NOM_ENTREPRISE}} sur {{VILLE}}',
    template: `Bonjour,

En parcourant les {{CATEGORIE}} de {{VILLE}}, j'ai découvert {{NOM_ENTREPRISE}} et je souhaitais vous présenter comment nous aidons les commerces locaux à attirer plus de clients.

**Votre situation actuelle :**
Vous avez un excellent {{CATEGORIE}} mais peut-être que votre visibilité en ligne ne reflète pas la qualité de vos services ?

**Ce que nous pouvons faire ensemble :**
✅ Améliorer votre positionnement sur Google Maps
✅ Créer du contenu qui attire vos clients idéaux
✅ Optimiser vos horaires d'ouverture et informations en ligne
✅ Développer une stratégie de communication locale

**Résultats concrets :**
Nos clients commerces ont constaté en moyenne +40% de nouveaux contacts en 2 mois.

Seriez-vous disponible pour un appel de 15 minutes ? Je peux vous montrer des exemples de réussites d'autres {{CATEGORIE}} de la région.

À très bientôt,
{{SENDER_NAME}}

📞 Vous préférez qu'on se parle ? Appelez-moi directement : [votre-numéro]`
  },

  // Template pour services B2B
  b2b_services: {
    name: 'Services B2B',
    description: 'Pour les entreprises de services aux entreprises',
    subject: 'Développement commercial pour {{NOM_ENTREPRISE}} - {{VILLE}}',
    template: `Bonjour,

{{SENDER_NAME}}, spécialisé dans l'accompagnement digital des entreprises de services.

En recherchant des {{CATEGORIE}} performantes sur {{VILLE}}, {{NOM_ENTREPRISE}} a retenu mon attention par son positionnement.

**Votre défi :**
Comment générer régulièrement de nouveaux prospects qualifiés sans dépendre uniquement du bouche-à-oreille ?

**Notre approche :**
• Stratégie de contenu qui démontre votre expertise
• Optimisation de votre profil LinkedIn et site web
• Campagnes ciblées vers vos clients idéaux
• Système de suivi et conversion des prospects

**Pourquoi nous choisir :**
Nous ne travaillons qu'avec des entreprises de services B2B et comprenons vos enjeux spécifiques.

Accepteriez-vous un échange de 20 minutes pour analyser votre situation actuelle et identifier des opportunités de croissance ?

Cordialement,
{{SENDER_NAME}}

P.S. : Je peux vous partager une étude de cas d'un autre {{CATEGORIE}} qui a multiplié ses prospects par 3 en 6 mois.`
  },

  // Template de suivi
  follow_up: {
    name: 'Email de Suivi',
    description: 'Pour relancer après un premier contact',
    subject: 'Suite à notre échange - Solutions pour {{NOM_ENTREPRISE}}',
    template: `Bonjour,

J'espère que vous allez bien depuis notre dernier échange concernant le développement numérique de {{NOM_ENTREPRISE}}.

Je reviens vers vous car j'ai travaillé sur votre situation et j'ai quelques idées concrètes qui pourraient vous intéresser.

**Ce que j'ai identifié pour {{NOM_ENTREPRISE}} :**
• Opportunités d'amélioration de votre visibilité locale
• Stratégies adaptées aux {{CATEGORIE}} de {{VILLE}}
• Solutions rapides à mettre en œuvre

**Nouvelle proposition :**
Que diriez-vous d'un audit gratuit de 30 minutes de votre présence en ligne ? 
Je peux vous montrer précisément où sont les opportunités et vous donner des conseils actionnables, même si nous ne travaillons pas ensemble.

Êtes-vous disponible cette semaine ou la suivante ?

Bien à vous,
{{SENDER_NAME}}

P.S. : Si ce n'est plus d'actualité pour vous, n'hésitez pas à me le dire, je comprendrai parfaitement.`
  },

  // Template de remerciement
  thank_you: {
    name: 'Remerciement',
    description: 'Pour remercier après un entretien ou une présentation',
    subject: 'Merci pour votre temps - {{NOM_ENTREPRISE}}',
    template: `Bonjour,

Un grand merci pour le temps que vous m'avez accordé aujourd'hui pour discuter des enjeux numériques de {{NOM_ENTREPRISE}}.

**Récapitulatif de nos échanges :**
• Vos objectifs : [à personnaliser selon l'échange]
• Les solutions identifiées : [à personnaliser]
• Les prochaines étapes : [à personnaliser]

**Documents promis :**
Vous trouverez en pièce jointe la proposition personnalisée dont nous avons parlé.

**Suite de notre collaboration :**
Je reste à votre disposition pour toute question complémentaire. N'hésitez pas à m'appeler directement si vous souhaitez préciser certains points.

Encore merci pour votre confiance et j'espère pouvoir accompagner {{NOM_ENTREPRISE}} dans son développement.

Cordialement,
{{SENDER_NAME}}`
  }
};

/**
 * Récupère un template par son ID
 */
export function getTemplate(templateId) {
  return emailTemplates[templateId] || null;
}

/**
 * Récupère la liste de tous les templates
 */
export function getAllTemplates() {
  return Object.entries(emailTemplates).map(([id, template]) => ({
    id,
    ...template
  }));
}

/**
 * Récupère les templates par catégorie
 */
export function getTemplatesByCategory() {
  return {
    prospection: [
      'general_prospection',
      'restaurant', 
      'local_business',
      'b2b_services'
    ],
    suivi: [
      'follow_up',
      'thank_you'
    ]
  };
}

/**
 * Variables disponibles pour tous les templates
 */
export const templateVariables = {
  nom_entreprise: 'Nom de l\'entreprise',
  categorie: 'Catégorie de l\'entreprise', 
  ville: 'Ville de recherche',
  email: 'Email du prospect',
  telephone: 'Numéro de téléphone',
  adresse: 'Adresse complète',
  sender_name: 'Nom de l\'expéditeur',
  site_web: 'URL du site web',
  sender_phone: 'Téléphone de l\'expéditeur',
  sender_website: 'Site web de l\'expéditeur'
};

export default emailTemplates;
