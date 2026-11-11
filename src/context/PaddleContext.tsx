// src/context/PaddleContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';

interface PaddleContextType {
  paddle: Paddle | undefined;
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

const PaddleContext = createContext<PaddleContextType>({
  paddle: undefined,
  isReady: false,
  isLoading: true,
  error: null,
  retry: () => {},
});

export const usePaddle = () => useContext(PaddleContext);

export const PaddleProvider = ({ children }: { children: ReactNode }) => {
  const [paddle, setPaddle] = useState<Paddle | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const initPaddle = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;
    const env = import.meta.env.VITE_PADDLE_ENVIRONMENT || 'sandbox';

    if (!token) {
      const errMsg = "La variable VITE_PADDLE_CLIENT_TOKEN est manquante dans le fichier .env";
      console.error('❌', errMsg);
      setError(errMsg);
      setIsLoading(false);
      return;
    }

    console.log('🔍 Tentative d\'initialisation de Paddle...');

    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Délai d'attente dépassé (10s). Un bloqueur empêche la connexion à Paddle.")), 10000)
      );

      const paddleInstance = await Promise.race([
        initializePaddle({
          environment: env as 'sandbox' | 'production',
          token: token,
          eventCallback: (event) => console.log('🎯 Paddle event:', event.name),
        }),
        timeoutPromise
      ]) as Paddle | undefined;

      if (paddleInstance) {
        console.log('✅ Paddle initialisé avec succès !');
        setPaddle(paddleInstance);
        setIsReady(true);
      } else {
        throw new Error("L'instance Paddle est undefined");
      }
    } catch (err: any) {
      console.error('❌ Échec de l\'initialisation de Paddle:', err);
      setError(err.message || 'Erreur inconnue.');
      setPaddle(undefined);
      setIsReady(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initPaddle();
  }, [initPaddle]);

  return (
    <PaddleContext.Provider value={{ paddle, isReady, isLoading, error, retry: initPaddle }}>
      {children}
    </PaddleContext.Provider>
  );
};