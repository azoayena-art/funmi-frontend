// src/pages/VerifyEmail.tsx
// ✉️ Page d'attente de vérification d'email
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Loader2, RefreshCw, CheckCircle2, AlertCircle, Shield, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { account } from '../appwrite';
import { useRecaptcha } from '../hooks/useRecaptcha';
import { validateRecaptchaToken } from '../services/recaptchaService';

// ============================================================
// ⏱️ RATE LIMIT RENVOI EMAIL (1 renvoi / 60 secondes)
// ============================================================
const RESEND_KEY = 'verify_email_resend';
const RESEND_COOLDOWN_MS = 60 * 1000;

const getRemainingCooldown = (): number => {
  try {
    const last = parseInt(localStorage.getItem(RESEND_KEY) || '0', 10);
    const elapsed = Date.now() - last;
    return Math.max(0, RESEND_COOLDOWN_MS - elapsed);
  } catch {
    return 0;
  }
};

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================
export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getToken } = useRecaptcha();

  const email = searchParams.get('email') || '';
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(getRemainingCooldown());

  // ✅ Décompte du cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(getRemainingCooldown()), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // ============================================================
  // 📧 RENVOYER L'EMAIL DE VÉRIFICATION
  // ============================================================
  const handleResend = async () => {
    if (cooldown > 0) {
      toast.error('Patientez un instant', {
        description: `Vous pouvez renvoyer un email dans ${Math.ceil(cooldown / 1000)}s.`,
      });
      return;
    }

    setResending(true);
    try {
      // 🛡️ reCAPTCHA v3
      const recaptchaToken = await getToken('verify_email');
      if (!recaptchaToken) {
        toast.error('Vérification anti-bot impossible');
        setResending(false);
        return;
      }

      const validation = await validateRecaptchaToken(recaptchaToken, 'verify_email', 0.3);
      if (!validation.success && !validation.degraded) {
        toast.error('Vérification anti-bot échouée');
        setResending(false);
        return;
      }

      // 📧 Envoi de l'email
      const verifyUrl = `${window.location.origin}/confirm-email`;
      await account.createVerification(verifyUrl);

      localStorage.setItem(RESEND_KEY, Date.now().toString());
      setCooldown(RESEND_COOLDOWN_MS);

      toast.success('Email de vérification renvoyé', {
        description: 'Vérifiez votre boîte de réception (et les spams).',
        duration: 5000,
      });
    } catch (e: any) {
      console.error('Erreur renvoi email:', e);
      toast.error('Erreur lors du renvoi', {
        description: e.message || 'Réessayez dans quelques instants.',
      });
    } finally {
      setResending(false);
    }
  };

  // ============================================================
  // ✅ VÉRIFIER SI L'EMAIL EST VALIDÉ
  // ============================================================
  const handleCheckStatus = async () => {
    setLoading(true);
    try {
      const user = await account.get();
      if (user.emailVerification) {
        toast.success('Email vérifié !', {
          description: 'Redirection vers votre espace...',
        });
        setTimeout(() => navigate('/dashboard', { replace: true }), 800);
      } else {
        toast.warning('Email non vérifié', {
          description: 'Cliquez sur le lien reçu par email pour valider votre compte.',
        });
      }
    } catch (e: any) {
      console.error('Erreur vérification statut:', e);
      toast.error('Impossible de vérifier le statut', {
        description: 'Rechargez la page et réessayez.',
      });
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8 animate-fadeIn">

        {/* En-tête */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full blur-md opacity-50" />
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg">
              <Inbox size={32} className="text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Vérifiez votre email
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Nous avons envoyé un lien de confirmation à<br />
            <strong className="text-slate-900 dark:text-white">{email}</strong>
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-2 flex items-center gap-1">
            <Mail size={14} />
            Étapes à suivre
          </p>
          <ol className="text-xs text-blue-800 dark:text-blue-300 space-y-1.5">
            <li className="flex gap-2"><span className="font-bold">1.</span> Ouvrez votre boîte mail</li>
            <li className="flex gap-2"><span className="font-bold">2.</span> Cliquez sur le lien <strong>"Confirmer mon email"</strong></li>
            <li className="flex gap-2"><span className="font-bold">3.</span> Revenez ici pour finaliser</li>
          </ol>
        </div>

        {/* Alertes */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-6">
          <p className="text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              Votre compte sera pleinement activé après vérification.
              Le lien expire dans <strong>7 jours</strong>.
            </span>
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={handleCheckStatus}
            disabled={loading}
            className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 active:scale-95"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Vérification en cours...
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                J'ai vérifié mon email
              </>
            )}
          </button>

          <button
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            className="w-full py-2.5 px-4 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {resending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Envoi en cours...
              </>
            ) : cooldown > 0 ? (
              <>
                <RefreshCw size={16} />
                Renvoyer dans {Math.ceil(cooldown / 1000)}s
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                Renvoyer l'email
              </>
            )}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
          <Link
            to="/login"
            className="text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium"
          >
            Annuler et retourner à la connexion
          </Link>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
            <Shield size={12} /> Compte sécurisé • Protection reCAPTCHA v3 active
          </p>
        </div>
      </div>
    </div>
  );
}