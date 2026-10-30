// src/pages/TermsOfService.tsx
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={18} /> Retour à l'accueil
        </button>

        <h1 className="text-3xl sm:text-4xl font-bold mb-8 bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
          Conditions Générales d'Utilisation (CGU)
        </h1>

        <div className="space-y-8 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Acceptation des conditions</h2>
            <p>
              En accédant et en utilisant la plateforme RelancePro, vous acceptez sans réserve les présentes 
              Conditions Générales d'Utilisation. Si vous n'acceptez pas ces conditions, veuillez ne pas utiliser notre service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Description du service</h2>
            <p>
              RelancePro est un logiciel en mode SaaS (Software as a Service) destiné aux professionnels, 
              permettant la gestion de devis, de factures, l'automatisation des relances clients et le suivi de trésorerie. 
              Nous nous engageons à maintenir le service disponible 24h/24 et 7j/7, sous réserve des opérations de maintenance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Compte utilisateur et sécurité</h2>
            <p>
              Pour utiliser certaines fonctionnalités, vous devez créer un compte en fournissant des informations exactes et à jour. 
              Vous êtes seul responsable de la confidentialité de vos identifiants et de toutes les activités effectuées sous votre compte. 
              Vous vous engagez à nous informer immédiatement de toute utilisation non autorisée.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Utilisation acceptable</h2>
            <p>
              Vous vous engagez à utiliser RelancePro de manière légale et conforme aux bonnes pratiques. 
              Il est strictement interdit d'utiliser le service pour : envoyer des spams, violer la propriété intellectuelle d'un tiers, 
              tenter de pirater ou de perturber le fonctionnement de la plateforme, ou stocker des données illicites.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Propriété intellectuelle</h2>
            <p>
              RelancePro et l'ensemble de son contenu (code, design, logos, textes) sont la propriété exclusive de notre société 
              ou de ses concédants de licence. Aucune reproduction, distribution ou modification n'est autorisée sans notre accord écrit préalable. 
              Les données que vous importez dans la plateforme restent votre propriété exclusive.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Limitation de responsabilité</h2>
            <p>
              RelancePro est fourni "en l'état". Bien que nous fassions tout notre possible pour garantir l'exactitude des données et la disponibilité du service, 
              nous ne saurions être tenus responsables des dommages indirects (perte de données, perte de chiffre d'affaires, interruption d'activité) 
              résultant de l'utilisation ou de l'impossibilité d'utiliser le service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Droit applicable et juridiction</h2>
            <p>
              Les présentes conditions sont régies par le droit français. En cas de litige, et après tentative de résolution amiable, 
              les tribunaux compétents seront ceux du ressort du siège social de notre entreprise.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 text-sm text-slate-500">
          Dernière mise à jour : {new Date().toLocaleDateString('fr-FR')}
        </div>
      </div>
    </div>
  );
}