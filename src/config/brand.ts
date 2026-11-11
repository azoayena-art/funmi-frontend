// ============================================================
// CONFIGURATION CENTRALISÉE DE LA MARQUE
// Modifier ce fichier met à jour toute l'application.
// ============================================================

export const BRAND = {
  name: 'FUNMI',
  tagline: 'Une gestion plus claire pour votre activité',
  description:
    'Devis, factures, relances clients et suivi de trésorerie dans un seul espace.',
  primaryColor: 'indigo',
  legal: {
    privacy: '/privacy',
    terms: '/terms',
    refund: '/refund',
    legal: '/legal',
  },
  social: {
    linkedin:
      'https://www.linkedin.com/in/cr%C3%A9pin-azo-ayena-400a281a2/',
    facebook:
      'https://www.facebook.com/profile.php?id=61589421927981',
    instagram: 'https://www.instagram.com/comlanviayena/',
    comeup:
      'https://comeup.com/fr/service/525747/creer-votre-application-excel-professionnelle-avec-formules-et-macros-vba',
  },
  app: {
    dashboardPath: '/dashboard',
    loginPath: '/login',
    registerPath: '/register',
    forgotPasswordPath: '/forgot-password',
  },
} as const;

export type Brand = typeof BRAND;