// src/pages/RefundPolicy.tsx
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function RefundPolicy() {
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
          Politique de remboursement
        </h1>

        <div className="space-y-8 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Période d'essai gratuite</h2>
            <p>
              RelancePro propose une période d'essai gratuite de 14 jours pour le plan Professionnel. 
              Aucune carte bancaire n'est requise pour démarrer. À l'issue de cette période, vous pouvez 
              choisir de souscrire à un abonnement payant ou de rester sur le plan Starter gratuit.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Garantie "Satisfait ou remboursé"</h2>
            <p>
              Si vous souscrivez à un abonnement payant (mensuel ou annuel), vous bénéficiez d'un délai 
              de rétractation de 14 jours à compter de la date de facturation. Si vous n'êtes pas satisfait 
              du service, vous pouvez demander un remboursement intégral en contactant notre support. 
              Passé ce délai de 14 jours, les paiements sont définitifs et non remboursables.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Annulation de l'abonnement</h2>
            <p>
              Vous pouvez annuler votre abonnement à tout moment depuis votre espace client. 
              L'annulation prend effet à la fin de la période de facturation en cours. Vous conserverez 
              l'accès aux fonctionnalités payantes jusqu'à la date d'échéance de votre période actuelle. 
              Aucune facturation supplémentaire ne sera effectuée après l'annulation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Comment demander un remboursement</h2>
            <p>
              Pour demander un remboursement dans le délai légal, veuillez contacter notre équipe support 
              à l'adresse <a href="mailto:support@relancepro.fr" className="text-indigo-400 hover:underline">support@relancepro.fr</a> en 
              précisant votre adresse email de compte et le motif de votre demande. 
              Les remboursements seront traités sous 5 à 10 jours ouvrés via le même moyen de paiement utilisé lors de l'achat.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Modifications de la politique</h2>
            <p>
              Nous nous réservons le droit de modifier cette politique de remboursement à tout moment. 
              Les modifications prendront effet dès leur publication sur cette page. Nous vous encourageons 
              à consulter cette page régulièrement.
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