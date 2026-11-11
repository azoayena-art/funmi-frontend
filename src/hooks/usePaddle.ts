// src/hooks/usePaddle.ts
import { useEffect, useState } from 'react';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';

export const usePaddle = () => {
  const [paddle, setPaddle] = useState<Paddle | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ✅ CORRECTION : On lit maintenant VITE_PADDLE_CLIENT_TOKEN comme dans ton .env
    const paddlePublicKey = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
    const environment = import.meta.env.VITE_PADDLE_ENVIRONMENT || 'sandbox';
    
    if (!paddlePublicKey) {
      console.error('❌ VITE_PADDLE_CLIENT_TOKEN non configuré dans le fichier .env');
      setLoading(false);
      return;
    }

    console.log('🔍 Initialisation de Paddle avec l\'environnement :', environment);

    initializePaddle({
      environment: environment,
      token: paddlePublicKey,
      eventCallback: (event) => {
        console.log('🎯 Paddle event:', event.name);
      },
    }).then((paddleInstance) => {
      if (paddleInstance) {
        console.log('✅ Paddle initialisé avec succès !');
        setPaddle(paddleInstance);
      } else {
        console.error('❌ Échec de l\'initialisation de Paddle (instance undefined)');
      }
      setLoading(false);
    }).catch((error) => {
      console.error('❌ Erreur critique lors de l\'initialisation de Paddle:', error);
      setLoading(false);
    });
  }, []);

  const openCheckout = async (
    priceId: string, 
    customerEmail?: string,
    customData?: { user_id?: string; team_id?: string }
  ) => {
    if (!paddle) {
      console.error('❌ Paddle non initialisé');
      return;
    }

    console.log("🚀 Ouverture du checkout Paddle avec l'ID :", priceId);

    try {
      await paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: customerEmail ? { email: customerEmail } : undefined,
        customData: customData || {},
        settings: {
          theme: 'light', // 'light' est souvent plus fiable pour l'overlay
          displayMode: 'overlay',
          allowLogout: true,
          locale: 'fr',
        },
      });
    } catch (error) {
      console.error('❌ Erreur ouverture checkout:', error);
    }
  };

  return { paddle, loading, openCheckout };
};