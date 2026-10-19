// src/pages/PrivacyPolicy.tsx
// 🌍 Version internationale neutre — adaptable à tous les pays
import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, FileText } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center gap-3">
          <Link
            to="/"
            className="text-slate-500 hover:text-purple-600 transition-colors flex items-center gap-1 text-sm"
          >
            <ArrowLeft size={16} />
            Retour
          </Link>
          <div className="flex items-center gap-2 ml-4">
            <Shield size={24} className="text-purple-600" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Politique de confidentialité
            </h1>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 sm:p-10">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            <FileText size={14} className="inline mr-1" />
            Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          <div className="prose dark:prose-invert max-w-none prose-slate prose-headings:text-slate-900 dark:prose-headings:text-white prose-a:text-purple-600">
            <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-white">
              1. Introduction
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              <strong>COMREDACTION</strong> (ci-après « nous ») s'engage à protéger la vie privée de ses utilisateurs
              conformément à la législation applicable en matière de protection des données personnelles.
              Cette politique de confidentialité explique comment nous collectons, utilisons et protégeons
              vos données lorsque vous utilisez notre plateforme <strong>RelancePro</strong> de gestion commerciale
              et de relance automatique.
            </p>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              En utilisant notre plateforme, vous acceptez les pratiques décrites dans cette politique.
              Si vous n'êtes pas d'accord avec ces pratiques, nous vous invitons à ne pas utiliser nos services.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              2. Données collectées
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-3">Nous collectons les données suivantes :</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700 dark:text-slate-300 mb-4">
              <li><strong>Données d'identification</strong> : nom, prénom, adresse email, mot de passe (haché)</li>
              <li><strong>Données professionnelles</strong> : nom de l'entreprise, adresse, identifiants fiscaux applicables</li>
              <li><strong>Données clients et prospects</strong> : informations que vous saisissez concernant vos propres clients</li>
              <li><strong>Données de facturation</strong> : devis, factures, avoirs, paiements</li>
              <li><strong>Données techniques</strong> : adresse IP, type de navigateur, logs de connexion</li>
              <li><strong>Données de paiement</strong> : traitées par nos prestataires de paiement certifiés</li>
            </ul>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              3. Finalités du traitement
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-3">Vos données sont utilisées pour :</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700 dark:text-slate-300 mb-4">
              <li>Fournir et améliorer nos services</li>
              <li>Gérer votre compte et votre abonnement</li>
              <li>Envoyer les relances automatiques à vos clients (avec votre consentement)</li>
              <li>Assurer la sécurité de votre compte (authentification, détection de fraude)</li>
              <li>Respecter nos obligations légales et réglementaires</li>
              <li>Vous informer des évolutions du service</li>
            </ul>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              4. Base légale du traitement
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Selon la législation applicable dans votre pays de résidence, le traitement de vos données repose sur :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700 dark:text-slate-300 mb-4">
              <li>L'<strong>exécution du contrat</strong> qui nous lie</li>
              <li>Votre <strong>consentement explicite</strong></li>
              <li>Notre <strong>intérêt légitime</strong> (sécurité du service, prévention de la fraude, amélioration)</li>
              <li>Le respect de nos <strong>obligations légales</strong> (comptables, fiscales)</li>
            </ul>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              5. Durée de conservation
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-slate-700 dark:text-slate-300 mb-4">
              <li><strong>Données de compte</strong> : conservées pendant la durée de votre abonnement + 3 ans</li>
              <li><strong>Factures</strong> : 10 ans (obligations comptables internationales standard)</li>
              <li><strong>Logs de connexion</strong> : 1 an</li>
              <li><strong>Cookies</strong> : selon votre choix (voir notre bandeau cookies)</li>
            </ul>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              6. Partage des données et transferts internationaux
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Vos données ne sont <strong>jamais vendues</strong> à des tiers. Elles peuvent être partagées
              uniquement avec nos sous-traitants techniques dans le cadre strict de l'exécution du service :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700 dark:text-slate-300 mb-4">
              <li><strong>Hébergement</strong> : Vercel Inc. (États-Unis) et Appwrite (infrastructure cloud)</li>
              <li><strong>Envoi d'emails</strong> : prestataires certifiés pour les notifications et relances</li>
              <li><strong>Paiement</strong> : prestataires de paiement sécurisés</li>
            </ul>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Lorsque des données transitent hors de votre pays de résidence, nous nous assurons que des
              garanties appropriées sont mises en place conformément à la législation applicable
              (clauses contractuelles types, certifications internationales, etc.).
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              7. Vos droits
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-3">
              Selon la législation applicable dans votre pays, vous disposez de tout ou partie des droits suivants :
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-700 dark:text-slate-300 mb-4">
              <li><strong>Droit d'accès</strong> : obtenir une copie de vos données</li>
              <li><strong>Droit de rectification</strong> : corriger des données inexactes</li>
              <li><strong>Droit à l'effacement</strong> : demander la suppression de vos données</li>
              <li><strong>Droit à la limitation</strong> : suspendre le traitement</li>
              <li><strong>Droit à la portabilité</strong> : récupérer vos données dans un format structuré</li>
              <li><strong>Droit d'opposition</strong> : vous opposer au traitement</li>
              <li><strong>Droit de retrait du consentement</strong> : à tout moment, sans justification</li>
            </ul>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Pour exercer ces droits, contactez-nous à : <strong>contact@coachemploipro.com</strong>.
              Nous vous répondrons dans un délai raisonnable, conformément à la législation applicable.
            </p>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Vous avez également le droit de saisir l'autorité de protection des données compétente
              de votre pays de résidence en cas de difficulté.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              8. Sécurité
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Nous mettons en œuvre des mesures techniques et organisationnelles pour protéger vos données :
              chiffrement HTTPS, hachage des mots de passe, sauvegardes régulières, contrôle d'accès strict,
              authentification à deux facteurs (optionnelle), protection anti-bot reCAPTCHA v3.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              9. Cookies
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Nous utilisons des cookies strictement nécessaires au fonctionnement du service, ainsi que
              des cookies de mesure d'audience et de personnalisation (avec votre consentement). Vous pouvez
              gérer vos préférences à tout moment via notre bandeau cookies ou via le lien « Gérer mes cookies »
              disponible dans le pied de page.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              10. Modifications
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Nous nous réservons le droit de modifier la présente politique à tout moment.
              Toute modification substantielle vous sera notifiée par email ou via une notification
              sur la plateforme. Nous vous encourageons à consulter régulièrement cette page.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              11. Contact
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Pour toute question relative à cette politique ou à vos données personnelles :<br />
              📧 <strong>contact@coachemploipro.com</strong><br />
              📞 <strong>+229 01 97 18 11 23</strong><br />
              🏢 <strong>COMREDACTION</strong> — Cotonou, République du Bénin
            </p>

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center flex-wrap gap-3">
              <Link
                to="/legal"
                className="text-purple-600 dark:text-purple-400 hover:underline text-sm font-medium"
              >
                Voir les mentions légales →
              </Link>
              <Link
                to="/"
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm"
              >
                ← Retour à l'accueil
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}