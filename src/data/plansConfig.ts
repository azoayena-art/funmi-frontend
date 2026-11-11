// src/data/plansConfig.ts

export const DEFAULT_PLANS = [
  {
    id: 'essentiel',
    name: 'Essentiel',
    description: 'Pour les indépendants qui débutent.',
    monthlyPrice: 9,
    yearlyPrice: 90,
    features: [
      'Tableau de bord & Statistiques', 
      'Devis illimités', 
      'Factures clients (20/mois)', 
      '1 utilisateur', 
      'Sauvegardes hebdomadaires'
    ],
    limitations: [
      'Pas de relances automatiques',
      'Pas de module comptabilité'
    ],
    isPopular: false,
    isLifetime: false,
    priceIdMonthly: 'pri_01m6xqashfmhx7jnrx66qqxdak',
    priceIdYearly: 'pri_01m6xqkxvzn5es7y2p8jzmj098',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Le plus choisi pour automatiser la trésorerie.',
    monthlyPrice: 29,
    yearlyPrice: 290,
    features: [
      'Tout du plan Essentiel, +', 
      'Facturation clients & fournisseurs ILLIMITÉE', 
      'Relances automatiques', 
      'Trésorerie en temps réel', 
      'Jusqu\'à 3 utilisateurs', 
      'Sauvegardes quotidiennes'
    ],
    limitations: [],
    isPopular: true,
    isLifetime: false,
    priceIdMonthly: 'pri_01m6xqc302s020qax9p6d6yb98',
    priceIdYearly: 'pri_01m6xqn0h0naknrjctge2199dt',
  },
  {
    id: 'business',
    name: 'Business',
    description: 'L\'armure comptable pour les PME établies.',
    monthlyPrice: 59,
    yearlyPrice: 590,
    features: [
      'Tout du plan Pro, +', 
      'Journal, Grand Livre & Balance', 
      'Export FEC & OHADA', 
      'Utilisateurs illimités', 
      'Historique & Audit complet', 
      'Marque blanche'
    ],
    limitations: [],
    isPopular: false,
    isLifetime: false,
    priceIdMonthly: 'pri_01m6xqd47xqjwkht605t71fmt5',
    priceIdYearly: 'pri_01m6xqpavmybf2wkx2frpbyvmp',
  },
  {
    id: 'legende',
    name: 'Légende',
    description: 'Payez une fois, utilisez pour toujours.',
    monthlyPrice: 1490,
    yearlyPrice: 1490,
    features: [
      'TOUTES les fonctionnalités Business', 
      'Mises à jour du logiciel à vie', 
      'Support prioritaire à vie', 
      '1 entreprise / 1 entité juridique'
    ],
    limitations: [],
    isPopular: false,
    isLifetime: true,
    priceIdMonthly: 'pri_01m6xqfmgqzmgt9p46mgewxhpe',
    priceIdYearly: null,
  }
];