// src/hooks/usePaddle.ts
import { useEffect, useState } from 'react';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';

export const usePaddle = () => {
  const [paddle, setPaddle] = useState<Paddle | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const paddlePublicKey = import.meta.env.VITE_PADDLE_PUBLIC_KEY;
    
    if (!paddlePublicKey) {
      console.warn('⚠️ VITE_PADDLE_PUBLIC_KEY non configuré');
      setLoading(false);
      return;
    }

    initializePaddle({
      environment: 'sandbox',
      token: paddlePublicKey,
      eventCallback: (event) => {
        console.log('🎯 Paddle event:', event.name);
      },
    }).then((paddleInstance) => {
      if (paddleInstance) {
        setPaddle(paddleInstance);
      }
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
          theme: 'dark',
          displayMode: 'overlay',
          allowLogout: true,
        },
      });
    } catch (error) {
      console.error('❌ Erreur ouverture checkout:', error);
    }
  };

  return { paddle, loading, openCheckout };
};