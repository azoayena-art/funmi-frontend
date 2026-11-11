// src/pages/PaddleCheckout.tsx
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { initializePaddle } from '@paddle/paddle-js';
import { Loader2, AlertCircle } from 'lucide-react';

export default function PaddleCheckout() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const transactionId = searchParams.get('_ptxn');
  const [error, setError] = useState<string | null>(null);
  const openedRef = useRef(false);

  useEffect(() => {
    if (!transactionId) {
      setError('Aucune transaction à payer. Reprenez depuis la page Tarifs.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const paddle = await initializePaddle({
          environment: 'sandbox',
          token: import.meta.env.VITE_PADDLE_CLIENT_TOKEN,
          eventCallback: (event) => {
            if (event.name === 'checkout.completed') {
              navigate('/billing?success=true');
            }
            if (event.name === 'checkout.failed') {
              setError('Le paiement a échoué. Veuillez réessayer.');
            }
          },
        });

        if (!paddle || cancelled || openedRef.current) return;
        openedRef.current = true;

        paddle.Checkout.open({
          transactionId,
          displayMode: 'inline',
          frameTarget: 'paddle-checkout-frame',
          frameInitialHeight: 650,
          theme: 'light',
          locale: 'fr',
        });
      } catch (e) {
        console.error('❌ Erreur Paddle.js:', e);
        setError('Impossible de charger le module de paiement. Désactivez votre bloqueur de publicité et réessayez.');
      }
    })();

    return () => { cancelled = true; };
  }, [transactionId, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 text-center">
          Paiement sécurisé
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 text-center">
          Complétez vos informations de paiement ci-dessous.
        </p>

        {error ? (
          <div className="p-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
            <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
          </div>
        ) : (
          <div id="paddle-checkout-frame" className="min-h-[650px] flex items-center justify-center">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}
      </div>
    </div>
  );
}