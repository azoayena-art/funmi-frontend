// src/pages/ResetPassword.tsx
import { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Loader2, AlertCircle, Shield, CheckCircle2, KeyRound, AlertTriangle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { account } from '../appwrite';
import { AppwriteException } from 'appwrite';
import { useRecaptcha } from '../hooks/useRecaptcha';
import { validateRecaptchaToken } from '../services/recaptchaService';

// ============================================================
// 🛡️ VALIDATION MOT DE PASSE (identique à Register)
// ============================================================
const validatePassword = (password: string): { valid: boolean; message: string } => {
  if (password.length < 8) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins 8 caractères.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins une majuscule.' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins une minuscule.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Le mot de passe doit contenir au moins un chiffre.' };
  }
  return { valid: true, message: '' };
};

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getToken } = useRecaptcha();

  // ✅ Lecture des paramètres ajoutés par Appwrite dans le lien
  const userId = searchParams.get('userId') || '';
  const secret = searchParams.get('secret') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [recaptchaDegraded, setRecaptchaDegraded] = useState(false);

  // ✅ Vérifier si le lien est valide (paramètres présents)
  const isLinkValid = useMemo(() => {
    return userId.length > 0 && secret.length > 0;
  }, [userId, secret]);

  // ============================================================
  // 📤 SOUMISSION DU FORMULAIRE
  // ============================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setConfirmError('');
    setRecaptchaDegraded(false);

    // ✅ Vérification du lien
    if (!isLinkValid) {
      toast.error('Lien invalide', {
        description: 'Ce lien de réinitialisation est invalide ou incomplet.',
      });
      return;
    }

    // ✅ Validation mot de passe
    if (!password) {
      setPasswordError('Veuillez saisir un mot de passe.');
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setPasswordError(passwordValidation.message);
      toast.error('Mot de passe trop faible', {
        description: passwordValidation.message,
      });
      return;
    }

    // ✅ Vérification confirmation
    if (password !== confirmPassword) {
      setConfirmError('Les mots de passe ne correspondent pas.');
      toast.error('Confirmation incorrecte', {
        description: 'Les deux mots de passe doivent être identiques.',
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

      // 🛡️ ÉTAPE 3 : Mise à jour du mot de passe via Appwrite
      await account.updateRecovery(userId, secret, password);

      setSuccess(true);

      toast.success('Mot de passe réinitialisé', {
        description: 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.',
        duration: 5000,
      });

      // Redirection vers login après 3 secondes
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
    } catch (err: unknown) {
      console.error('Erreur réinitialisation mot de passe:', err);

      if (err instanceof AppwriteException) {
        switch (err.code) {
          case 401:
            setPasswordError('Lien expiré ou invalide.');
            toast.error('Lien expiré', {
              description: 'Ce lien de réinitialisation a expiré. Demandez-en un nouveau.',
              duration: 6000,
            });
            break;
          case 404:
            setPasswordError('Lien invalide.');
            toast.error('Lien invalide', {
              description: 'Ce lien de réinitialisation n\'est plus valide.',
              duration: 6000,
            });
            break;
          case 400:
            setPasswordError('Données invalides.');
            toast.error('Données invalides', {
              description: 'Vérifiez les informations saisies.',
            });
            break;
          case 409:
            setPasswordError('Ce mot de passe a déjà été utilisé récemment.');
            toast.error('Mot de passe déjà utilisé', {
              description: 'Choisissez un mot de passe différent.',
            });
            break;
          case 429:
            toast.error('Trop de tentatives', {
              description: 'Veuillez patienter quelques minutes.',
              duration: 6000,
            });
            break;
          default:
            toast.error('Erreur de réinitialisation', {
              description: err.message || 'Une erreur est survenue.',
            });
        }
      } else {
        toast.error('Erreur inattendue', {
          description: 'Vérifiez votre connexion internet et réessayez.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // 🎨 ÉCRAN DE SUCCÈS
  // ============================================================
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8 animate-fadeIn">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
              <CheckCircle2 size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Mot de passe réinitialisé !
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Votre mot de passe a été mis à jour avec succès.
              Vous allez être redirigé vers la page de connexion.
            </p>

            <div className="flex flex-col gap-2">
              <Link
                to="/login"
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
              >
                Se connecter maintenant
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 🎨 ÉCRAN LIEN INVALIDE
  // ============================================================
  if (!isLinkValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8 animate-fadeIn">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
              <AlertCircle size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Lien invalide
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Ce lien de réinitialisation est invalide, incomplet ou a expiré.
              Les liens sont valides pendant 1 heure.
            </p>

            <div className="flex flex-col gap-2">
              <Link
                to="/forgot-password"
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
              >
                Demander un nouveau lien
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/login"
                className="w-full py-2.5 px-4 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Retour à la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 🎨 ÉCRAN DE SAISIE DU NOUVEAU MOT DE PASSE
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8 animate-fadeIn">

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            <KeyRound size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Nouveau mot de passe
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Choisissez un nouveau mot de passe sécurisé pour votre compte.
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

        {/* ✅ Erreur mot de passe */}
        {passwordError && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Nouveau mot de passe */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Nouveau mot de passe
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Minimum 8 caractères"
                className={`w-full pl-11 pr-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed ${
                  passwordError
                    ? 'border-red-300 dark:border-red-700'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                required
                minLength={8}
                disabled={loading}
                autoFocus
                autoComplete="new-password"
              />
            </div>

            {/* Indicateur de force du mot de passe */}
            {password.length > 0 && !passwordError && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1 text-xs">
                  {password.length >= 8 ? (
                    <CheckCircle2 size={12} className="text-green-500" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />
                  )}
                  <span className={password.length >= 8 ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>
                    8 caractères minimum
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {/[A-Z]/.test(password) ? (
                    <CheckCircle2 size={12} className="text-green-500" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />
                  )}
                  <span className={/[A-Z]/.test(password) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>
                    Une majuscule
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {/[a-z]/.test(password) ? (
                    <CheckCircle2 size={12} className="text-green-500" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />
                  )}
                  <span className={/[a-z]/.test(password) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>
                    Une minuscule
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {/[0-9]/.test(password) ? (
                    <CheckCircle2 size={12} className="text-green-500" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />
                  )}
                  <span className={/[0-9]/.test(password) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>
                    Un chiffre
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Confirmation */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setConfirmError('');
                }}
                placeholder="Répétez le mot de passe"
                className={`w-full pl-11 pr-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed ${
                  confirmError
                    ? 'border-red-300 dark:border-red-700'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                required
                disabled={loading}
                autoComplete="new-password"
              />
            </div>
            {confirmError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} />
                {confirmError}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-500/30"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Vérification et mise à jour...</span>
              </>
            ) : (
              <>
                <KeyRound size={18} />
                <span>Réinitialiser mon mot de passe</span>
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

          <div className="text-center pt-2">
            <Link
              to="/login"
              className="text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium"
            >
              Je me souviens de mon mot de passe — Me connecter
            </Link>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
            <Shield size={12} /> Réinitialisation sécurisée • Protection reCAPTCHA v3 active
          </p>
        </div>
      </div>
    </div>
  );
}