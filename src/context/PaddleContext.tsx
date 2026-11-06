// src/context/PaddleContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Assurez-vous d'avoir installé @paddle/paddle-js : npm install @paddle/paddle-js
import { initializePaddle, Paddle } from '@paddle/paddle-js';

interface PaddleContextType {
  paddle: Paddle | undefined;
  isReady: boolean;
}

const PaddleContext = createContext<PaddleContextType>({ paddle: undefined, isReady: false });

export const usePaddle = () => useContext(PaddleContext);

export const PaddleProvider = ({ children }: { children: ReactNode }) => {
  const [paddle, setPaddle] = useState<Paddle | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const env = import.meta.env.VITE_PADDLE_ENVIRONMENT;
    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN;

    if (!token) {
      console.warn("Paddle Client Token manquant dans .env");
      return;
    }

    initializePaddle({
      environment: env === 'production' ? 'production' : 'sandbox',
      token: token,
      eventCallback: (data) => {
        // Ici on pourra écouter les événements checkout.completed plus tard
        console.log('Paddle Event:', data);
      },
    }).then((paddleInstance) => {
      if (paddleInstance) {
        setPaddle(paddleInstance);
        setIsReady(true);
      }
    });
  }, []);

  return (
    <PaddleContext.Provider value={{ paddle, isReady }}>
      {children}
    </PaddleContext.Provider>
  );
};