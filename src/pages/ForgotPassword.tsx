// src/pages/ForgotPassword.tsx
// 🔐 Récupération de mot de passe — envoi du lien de réinitialisation
// 🛡️ Protections : reCAPTCHA v3 + rate limiting + anti-énumération
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2, AlertCircle, Shield, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { account } from '../appwrite';
import { AppwriteException } from 'appwrite';
import { useRecaptcha } from '../hooks/useRecaptcha';
import { validateRecaptchaToken } from '../services/recaptchaService';

// ============================================================
// ⏱️ RATE LIMIT LOCAL (anti-spam emails de récupération)
// ============================================================
const RATE_LIMIT_KEY = 'forgot_password_rate_limit';
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const getRateLimitState = () => {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return { attempts: [] as number[] };
    const data = JSON.parse(raw);
    const now = Date.now();
    const recent = (data.attempts || []).filter((t: number) => now - t < WINDOW_MS);
    return { attempts: recent };
  } catch {
    return { attempts: [] as number[] };
  }
};

const isRateLimited = (): boolean => {
  return getRateLimitState().attempts.length >= MAX_ATTEMPTS;
};

const consumeAttempt = (): { allowed: boolean; remainingAttempts: number; remainingTimeFormatted: string } => {
  const state = getRateLimitState();
  if (state.attempts.length >= MAX_ATTEMPTS) {
    const oldest = state.attempts[0];
    const remainingMs = WINDOW_MS - (Date.now() - oldest);
    const minutes = Math.ceil(remainingMs / 60000);
    return { allowed: false, remainingAttempts: 0, remainingTimeFormatted: `${minutes} minute(s)` };
  }
  const newAttempts = [...state.attempts, Date.now()];
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({ attempts: newAttempts }));
  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - newAttempts.length, remainingTimeFormatted: '' };
};

const resetRateLimit = () => {
  localStorage.removeItem(RATE_LIMIT_KEY);
};

const getRemainingAttempts = (): number => {
  return Math.max(0, MAX_ATTEMPTS - getRateLimitState().attempts.length);
};

const getRemainingTime = (): string => {
  const state = getRateLimitState();
  if (state.attempts.length === 0) return '';
  const oldest = state.attempts[0];
  const remainingMs = WINDOW_MS - (Date.now() - oldest);
  return `${Math.ceil(remainingMs / 60000)} minute(s)`;
};

// ============================================================
// ✅ VALIDATION EMAIL
// ============================================================
const validateEmail = (email: string): boolean => {
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return re.test(email) && email.length <= 254;
};

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================
export default function ForgotPassword() {
  const navigate = useNavigate();
  const { getToken } = useRecaptcha();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [recaptchaDegraded, setRecaptchaDegraded] = useState(false);

  const blocked = isRateLimited();
  const remainingAttempts = getRemainingAttempts();
  const remainingTimeFormatted = getRemainingTime();

  // ============================================================
  // 📤 SOUMISSION DU FORMULAIRE
  // ============================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRecaptchaDegraded(false);

    // ⏱️ Rate limit
    if (isRateLimited()) {
      toast.error('Trop de demandes', {
        description: `Réessayez dans ${getRemainingTime()}.`,
        duration: 5000,
      });
      return;
    }

    // ✅ Validation email
    if (!email.trim()) {
      toast.error('Email requis', {
        description: 'Veuillez saisir votre adresse email.',
      });
      return;
    }

    if (!validateEmail(email)) {
      toast.error('Email invalide', {
        description: 'Veuillez saisir une adresse email valide.',
      });
      return;
    }

    // ⏱️ Consommer une tentative
    const rateCheck = consumeAttempt();
    if (!rateCheck.allowed) {
      toast.error('Trop de demandes', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de réessayer.`,
        duration: 5000,
      });
      return;
    }

    setLoading(true);

    try {
      // 🛡️ ÉTAPE 1 : Token reCAPTCHA v3
      const recaptchaToken = await getToken('reset_password');
      if (!recaptchaToken) {
        toast.error('Vérification anti-bot impossible', {
          description: 'Rechargez la page et réessayez.',
        });
        setLoading(false);
        return;
      }

      // 🛡️ ÉTAPE 2 : Validation serveur (seuil permissif 0.3)
      const validation = await validateRecaptchaToken(recaptchaToken, 'reset_password', 0.3);

      if (validation.degraded) {
        console.warn('⚠️ [MODE DÉGRADÉ] reCAPTCHA non validé:', validation.error);
        setRecaptchaDegraded(true);
        toast.warning('⚠️ Vérification anti-bot désactivée', {
          description: `Mode développement actif (${validation.error}).`,
          duration: 8000,
        });
      } else if (!validation.success) {
        console.warn('🛡️ reCAPTCHA v3 rejeté:', validation);
        toast.error('Vérification anti-bot échouée', {
          description: validation.score !== undefined
            ? `Score: ${validation.score.toFixed(2)} — comportement suspect détecté.`
            : validation.error || 'Réessayez.',
          duration: 6000,
        });
        setLoading(false);
        return;
      } else {
        console.log(`✅ reCAPTCHA v3 OK (score: ${validation.score?.toFixed(2)})`);
      }

      // 🛡️ ÉTAPE 3 : Envoi de l'email de récupération via Appwrite
      // Appwrite ajoutera automatiquement ?userId=xxx&secret=yyy à cette URL
      const resetUrl = `${window.location.origin}/reset-password`;

      await account.createRecovery(email, resetUrl);

      resetRateLimit();
      setSent(true);

      toast.success('Email de récupération envoyé', {
        description: 'Vérifiez votre boîte de réception (et les spams).',
        duration: 5000,
      });
    } catch (err: unknown) {
      console.error('Erreur récupération mot de passe:', err);

      // 🔒 ANTI-ÉNUMÉRATION : message identique que l'email existe ou non
      if (err instanceof AppwriteException) {
        switch (err.code) {
          case 400:
          case 404:
            // On affiche quand même le succès pour ne pas révéler si l'email existe
            setSent(true);
            break;
          case 429:
            setError('Trop de demandes. Veuillez réessayer plus tard.');
            toast.error('Trop de demandes', {
              description: 'Veuillez patienter quelques minutes.',
              duration: 6000,
            });
            break;
          case 503:
            setError('Service temporairement indisponible.');
            toast.error('Service indisponible', {
              description: 'Réessayez dans quelques instants.',
            });
            break;
          default:
            setError('Une erreur est survenue. Veuillez réessayer.');
        }
      } else {
        setError('Vérifiez votre connexion internet et réessayez.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 🎨 ÉCRAN DE SUCCÈS (après envoi)
  // ============================================================
  if (sent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8 animate-fadeIn">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Email envoyé !
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Si un compte existe avec l'adresse{' '}
              <strong className="text-slate-900 dark:text-white">{email}</strong>, vous
              recevrez un email contenant un lien pour réinitialiser votre mot de passe.
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 text-left">
              <p className="text-xs text-blue-900 dark:text-blue-200 font-semibold mb-2">
                💡 Conseils
              </p>
              <ul className="text-xs text-blue-800 dark:text-blue-300 space-y-1">
                <li>• Vérifiez votre dossier <strong>Spam</strong> ou <strong>Courrier indésirable</strong></li>
                <li>• Le lien expire dans <strong>1 heure</strong></li>
                <li>• Si vous ne recevez rien, réessayez dans quelques minutes</li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  setSent(false);
                  setEmail('');
                }}
                className="w-full py-2.5 px-4 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Envoyer un nouvel email
              </button>
              <Link
                to="/login"
                className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft size={16} />
                Retour à la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 🎨 ÉCRAN DE SAISIE
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8 animate-fadeIn">

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            <KeyRound size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Mot de passe oublié ?
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Saisissez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
          </p>
        </div>

        {/* ⚠️ Alerte mode dégradé reCAPTCHA */}
        {recaptchaDegraded && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Mode développement</p>
              <p className="text-xs mt-1">
                La vérification anti-bot serveur n'est pas configurée.
              </p>
            </div>
          </div>
        )}

        {/* ✅ Alerte de blocage rate limit */}
        {blocked && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Trop de demandes</p>
              <p className="text-xs mt-1">
                Réessayez dans <strong>{remainingTimeFormatted}</strong>.
              </p>
            </div>
          </div>
        )}

        {/* ✅ Erreur inline */}
        {error && !blocked && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Adresse email
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="votre@email.com"
                className="w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                required
                autoComplete="email"
                autoFocus
                disabled={loading || blocked}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || blocked || !email.trim()}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-500/30"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Vérification et envoi...</span>
              </>
            ) : blocked ? (
              <span>Réessayez dans {remainingTimeFormatted}</span>
            ) : (
              <>
                <Mail size={18} />
                <span>Envoyer le lien de récupération</span>
              </>
            )}
          </button>

          {/* ✅ Mention légale Google reCAPTCHA v3 */}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
            Ce site est protégé par reCAPTCHA v3.{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener" className="underline">
              Politique de confidentialité Google
            </a>
            {' · '}
            <a href="https://policies.google.com/terms" target="_blank" rel="noopener" className="underline">
              Conditions d'utilisation
            </a>
          </p>

          {!blocked && remainingAttempts < MAX_ATTEMPTS && !loading && (
            <div className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <Shield size={12} />
              <span>{remainingAttempts} tentative(s) restante(s)</span>
            </div>
          )}

          <div className="text-center pt-2">
            <Link
              to="/login"
              className="text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium inline-flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              Retour à la connexion
            </Link>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
            <Shield size={12} /> Récupération sécurisée • Protection anti-spam et reCAPTCHA v3 actives
          </p>
        </div>
      </div>
    </div>
  );
}