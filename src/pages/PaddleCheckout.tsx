// src/pages/PaddleCheckout.tsx
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { initializePaddle, Paddle } from '@paddle/paddle-js';
import { Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

export default function PaddleCheckout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const transactionId = searchParams.get('_ptxn');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!transactionId) {
      setError('Aucune transaction à payer. Veuillez reprendre depuis la page Tarifs.');
      setLoading(false);
      return;
    }

    const clientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;

    if (!clientToken) {
      setError('Configuration manquante : VITE_PADDLE_CLIENT_TOKEN n\'est pas défini dans le fichier .env');
      setLoading(false);
      return;
    }

    console.log('🔍 [Checkout] Initialisation Paddle avec transactionId:', transactionId);

    let cancelled = false;

    (async () => {
      try {
        const paddle: Paddle = await initializePaddle({
          environment: 'sandbox',
          token: clientToken,
          eventCallback: (event) => {
            console.log('📡 [Checkout] Paddle event:', event.name);
            if (event.name === 'checkout.completed') {
              console.log('✅ Paiement réussi !');
              navigate('/billing?success=true');
            }
            if (event.name === 'checkout.failed') {
              setError('Le paiement a échoué. Veuillez réessayer.');
            }
            if (event.name === 'checkout.loaded') {
              setLoading(false);
            }
          },
        });

        if (cancelled || initializedRef.current) return;
        initializedRef.current = true;

        console.log('✅ [Checkout] Paddle initialisé, ouverture du formulaire...');

        paddle.Checkout.open({
          transactionId: transactionId,
          displayMode: 'inline',
          frameTarget: 'paddle-checkout-frame',
          frameInitialHeight: 650,
          frameStyle: 'width: 100%; min-height: 650px; border: none;',
          theme: 'light',
          locale: 'fr',
        });
      } catch (e: any) {
        console.error('❌ [Checkout] Erreur Paddle.js:', e);
        setError(`Impossible de charger le module de paiement : ${e.message}. Désactivez votre bloqueur de publicité et réessayez.`);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [transactionId, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate('/pricing')}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          Retour aux tarifs
        </button>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 lg:p-8">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 text-center">
            Finaliser votre paiement
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 text-center">
            Complétez vos informations de paiement ci-dessous de manière sécurisée.
          </p>

          {error ? (
            <div className="p-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
              <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Erreur de chargement</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">{error}</p>
              </div>
            </div>
          ) : (
            <div className="relative">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-indigo-600" size={32} />
                    <p className="text-sm text-slate-600 dark:text-slate-400">Chargement du formulaire de paiement...</p>
                  </div>
                </div>
              )}
              <div id="paddle-checkout-frame" className="min-h-[650px]" />
            </div>
          )}
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-6 flex items-center justify-center gap-2">
          🔒 Paiement 100% sécurisé par Paddle. Vos données bancaires ne transitent jamais par nos serveurs.
        </p>
      </div>
    </div>
  );
}