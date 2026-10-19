// src/pages/LegalNotices.tsx
// 🌍 Version internationale neutre — adaptable à tous les pays
import { Link } from 'react-router-dom';
import { ArrowLeft, Scale, FileText } from 'lucide-react';

export default function LegalNotices() {
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
            <Scale size={24} className="text-purple-600" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Mentions légales
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
              1. Éditeur du site
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              La plateforme <strong>RelancePro</strong> est éditée par :<br /><br />
              <strong>COMREDACTION</strong><br />
              Siège social : <strong>Cotonou — République du Bénin</strong><br />
              Registre du Commerce : <strong>RB/COT/22 A 77165</strong><br />
              Téléphone : <strong>+229 01 97 18 11 23</strong><br />
              E-mail : <a href="mailto:contact@coachemploipro.com" className="text-purple-600 dark:text-purple-400 hover:underline">
                contact@coachemploipro.com
              </a>
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              2. Directeur de la publication
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Le directeur de la publication est le <strong>représentant légal de COMREDACTION</strong>.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              3. Hébergement web
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Le site est hébergé par :<br /><br />
              <strong>Vercel Inc.</strong><br />
              Adresse : 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis<br />
              Site web : <a href="https://vercel.com" target="_blank" rel="noopener" className="text-purple-600 dark:text-purple-400 hover:underline">vercel.com</a>
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              4. Infrastructure de base de données et stockage
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              <strong>Appwrite</strong> (Open Source Backend) — hébergé sur des serveurs cloud sécurisés.<br />
              Site web : <a href="https://appwrite.io" target="_blank" rel="noopener" className="text-purple-600 dark:text-purple-400 hover:underline">appwrite.io</a>
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              5. Propriété intellectuelle
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              L'ensemble du contenu de la plateforme RelancePro (textes, graphismes, logiciels, photographies,
              images, vidéos, sons, plans, noms, logos, marques, créations et œuvres protégeables diverses,
              bases de données, etc.) ainsi que la plateforme elle-même, relèvent des législations nationales
              et internationales sur le droit d'auteur et sur le droit des marques.
            </p>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Toute reproduction, représentation, diffusion ou rediffusion, totale ou partielle, du contenu
              de la plateforme sur quelque procédé que ce soit est interdite sans autorisation écrite préalable
              de COMREDACTION.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              6. Limitation de responsabilité
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              COMREDACTION s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées
              sur la plateforme, dont elle se réserve le droit de corriger le contenu à tout moment et sans préavis.
            </p>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Toutefois, COMREDACTION ne peut garantir l'exactitude, la précision ou l'exhaustivité des
              informations mises à disposition. COMREDACTION décline toute responsabilité pour
              toute interruption de la plateforme, toute survenance de bogues ou toute inexactitude ou omission
              portant sur les informations disponibles, dans la limite prévue par la législation applicable.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              7. Liens hypertextes
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              La plateforme peut contenir des liens hypertextes vers d'autres sites internet. COMREDACTION
              ne peut être tenue responsable du contenu de ces sites externes, ni de leurs pratiques
              en matière de collecte de données personnelles.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              8. Droit applicable et résolution des litiges
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Les présentes mentions légales sont régies par la législation applicable en vigueur.
              En cas de litige, et à défaut de résolution amiable, les tribunaux compétents seront
              ceux du lieu de résidence du défendeur ou du siège social de COMREDACTION,
              selon les règles de compétence applicables.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              9. Médiation et réclamation
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Conformément à la législation applicable en matière de protection des consommateurs,
              vous avez le droit de recourir à un médiateur en vue de la résolution amiable
              d'un litige vous opposant à COMREDACTION.
            </p>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Pour toute réclamation, contactez-nous d'abord à :
              <strong> contact@coachemploipro.com</strong>. Nous nous engageons à vous répondre
              dans un délai de 15 jours ouvrés et à traiter votre demande dans les meilleurs délais.
            </p>

            <h2 className="text-2xl font-bold mb-4 mt-8 text-slate-900 dark:text-white">
              10. Crédits
            </h2>
            <p className="text-slate-700 dark:text-slate-300 mb-4">
              Conception et développement : <strong>COMREDACTION</strong><br />
              Technologies utilisées : React, TypeScript, Tailwind CSS, Appwrite, Vercel
            </p>

            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center flex-wrap gap-3">
              <Link
                to="/privacy"
                className="text-purple-600 dark:text-purple-400 hover:underline text-sm font-medium"
              >
                ← Voir la politique de confidentialité
              </Link>
              <Link
                to="/"
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-sm"
              >
                Retour à l'accueil
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}