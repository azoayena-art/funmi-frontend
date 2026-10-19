import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { teams } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const membershipId = searchParams.get('membershipId');
  const userId = searchParams.get('userId');
  const secret = searchParams.get('secret');

  useEffect(() => {
    const acceptInvitation = async () => {
      if (!membershipId || !userId || !secret) {
        setStatus('error');
        setMessage('Lien d\'invitation invalide.');
        return;
      }

      if (!user) {
        setStatus('error');
        setMessage('Vous devez être connecté pour accepter cette invitation.');
        return;
      }

      try {
        // Accepter l'invitation dans l'équipe Appwrite native
        await teams.updateMembership(
          membershipId,
          userId,
          secret
        );

        setStatus('success');
        setMessage('Invitation acceptée ! Vous êtes maintenant membre de l\'équipe.');
        
        setTimeout(() => {
          navigate('/dashboard');
        }, 2000);
      } catch (error: any) {
        console.error('Erreur acceptation:', error);
        setStatus('error');
        setMessage(error.message || 'Erreur lors de l\'acceptation.');
      }
    };

    acceptInvitation();
  }, [membershipId, userId, secret, user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 size={48} className="mx-auto text-purple-600 animate-spin mb-4" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Traitement de l'invitation...
            </h2>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 size={48} className="mx-auto text-green-600 mb-4" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Invitation acceptée ! 🎉
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">{message}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={48} className="mx-auto text-red-600 mb-4" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Erreur
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-4">{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Retour à la connexion
            </button>
          </>
        )}
      </div>
    </div>
  );
}