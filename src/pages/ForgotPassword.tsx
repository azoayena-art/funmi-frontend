// src/pages/ForgotPassword.tsx
// Récupération de mot de passe — envoi du lien de réinitialisation
// Protections : reCAPTCHA v3 + rate limiting + anti-énumération

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Shield,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { account } from '../appwrite';
import { AppwriteException } from 'appwrite';
import { useRecaptcha } from '../hooks/useRecaptcha';
import { validateRecaptchaToken } from '../services/recaptchaService';
import { BRAND } from '../config/brand';

// ============================================================
// RATE LIMIT LOCAL (anti-spam emails de récupération)
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

const consumeAttempt = (): {
  allowed: boolean;
  remainingAttempts: number;
  remainingTimeFormatted: string
} => {
  const state = getRateLimitState();

  if (state.attempts.length >= MAX_ATTEMPTS) {
    const oldest = state.attempts[0];
    const remainingMs = WINDOW_MS - (Date.now() - oldest);
    const minutes = Math.ceil(remainingMs / 60000);

    return {
      allowed: false,
      remainingAttempts: 0,
      remainingTimeFormatted: `${minutes} minute(s)`
    };
  }

  const newAttempts = [...state.attempts, Date.now()];
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify({ attempts: newAttempts }));

  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS - newAttempts.length,
    remainingTimeFormatted: ''
  };
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
// VALIDATION EMAIL
// ============================================================

const validateEmail = (email: string): boolean => {
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return re.test(email) && email.length <= 254;
};

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function ForgotPassword() {
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
  // SOUMISSION DU FORMULAIRE
  // ============================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRecaptchaDegraded(false);

    // Rate limit
    if (isRateLimited()) {
      toast.error('Trop de demandes', {
        description: `Réessayez dans ${getRemainingTime()}.`,
        duration: 5000,
      });
      return;
    }

    // Validation email
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

    // Consommer une tentative
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
      // ÉTAPE 1 : Token reCAPTCHA v3
      const recaptchaToken = await getToken('reset_password');

      if (!recaptchaToken) {
        toast.error('Vérification anti-bot impossible', {
          description: 'Rechargez la page et réessayez.',
        });
        setLoading(false);
        return;
      }

      // ÉTAPE 2 : Validation serveur (seuil permissif 0.3)
      const validation = await validateRecaptchaToken(
        recaptchaToken,
        'reset_password',
        0.3
      );

      if (validation.degraded) {
        console.warn('MODE DÉGRADÉ reCAPTCHA non validé:', validation.error);
        setRecaptchaDegraded(true);

        toast.warning('Vérification anti-bot désactivée', {
          description: `Mode développement actif (${validation.error}).`,
          duration: 8000,
        });
      } else if (!validation.success) {
        console.warn('reCAPTCHA v3 rejeté:', validation);

        toast.error('Vérification anti-bot échouée', {
          description: validation.score !== undefined
            ? `Score: ${validation.score.toFixed(2)} — comportement suspect détecté.`
            : validation.error || 'Réessayez.',
          duration: 6000,
        });

        setLoading(false);
        return;
      } else {
        console.log(`reCAPTCHA v3 OK (score: ${validation.score?.toFixed(2)})`);
      }

      // ÉTAPE 3 : Envoi de l'email de récupération via Appwrite
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

      // ANTI-ÉNUMÉRATION : message identique que l'email existe ou non
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
  // RENDU : ÉCRAN DE SUCCÈS
  // ============================================================

  if (sent) {
    return (
      <div className="min-h-screen bg-[#f2f1e9] px-2 py-2 font-sans text-slate-900 sm:px-4 sm:py-4 lg:px-6">
        <div className="max-w-[1440px] mx-auto mb-3 flex items-center">
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
          >
            <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
            Retour à la connexion
          </Link>
        </div>

        <div className="relative mx-auto max-w-[1440px] overflow-hidden rounded-[24px] bg-white shadow-[0_20px_80px_-30px_rgba(15,23,42,0.18)] sm:rounded-[30px]">
          <div className="flex min-h-8 items-center justify-center bg-slate-950 px-4 py-2 text-center text-[10px] font-medium tracking-wide text-white sm:text-xs">
            {BRAND.tagline}
          </div>

          <div className="grid min-h-[calc(100vh-6rem)] lg:grid-cols-[1.1fr_1fr]">
            {/* Partie gauche - Hero editorial (visible sur desktop) */}
            <div className="relative hidden overflow-hidden bg-[#fafaf6] px-12 py-20 lg:flex lg:flex-col lg:justify-between">
              <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-emerald-100/50 blur-3xl" />
              <div className="pointer-events-none absolute -right-40 bottom-10 h-96 w-96 rounded-full bg-indigo-100/50 blur-3xl" />

              <div className="relative z-10">
                <Link to="/" className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                    <Wallet size={19} strokeWidth={2.2} />
                  </div>
                  <span className="text-xl font-bold tracking-tight text-slate-950">
                    {BRAND.name}
                  </span>
                </Link>
              </div>

              <div className="relative z-10 max-w-lg">
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  Récupération de compte
                </p>
                <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-slate-950">
                  Retrouvez l'accès
                  <br />
                  <span className="text-indigo-600">à votre espace.</span>
                </h1>
                <p className="mt-6 text-base leading-8 text-slate-600">
                  Un lien sécurisé a été envoyé à votre adresse email pour réinitialiser votre mot de passe en toute sécurité.
                </p>
              </div>

              <div className="relative z-10">
                <div className="rounded-2xl border border-slate-200 bg-white/60 p-5 backdrop-blur-sm">
                  <p className="text-sm leading-7 text-slate-700 italic">
                    "La procédure de récupération est simple et rapide. J'ai pu retrouver l'accès à ma facturation en moins de 2 minutes."
                  </p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                      LC
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Laura C.</p>
                      <p className="text-[10px] text-slate-500">Indépendante</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Partie droite - Succès */}
            <div className="flex items-center justify-center px-5 py-12 sm:px-8 lg:px-12">
              <div className="w-full max-w-md">
                <div className="mb-8 flex items-center gap-2.5 lg:hidden">
                  <Link to="/" className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                      <Wallet size={19} strokeWidth={2.2} />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-950">
                      {BRAND.name}
                    </span>
                  </Link>
                </div>

                <div className="text-center mb-8">
                  <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                    <CheckCircle2 size={32} className="text-emerald-600" />
                  </div>
                  <h1 className="mb-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    Email envoyé !
                  </h1>
                  <p className="text-sm leading-7 text-slate-600">
                    Si un compte existe avec l'adresse{' '}
                    <strong className="font-semibold text-slate-900">{email}</strong>,
                    vous recevrez un lien pour réinitialiser votre mot de passe.
                  </p>
                </div>

                <div className="mb-8 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5">
                  <p className="mb-3 text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Shield size={14} className="text-indigo-600" />
                    Quelques conseils
                  </p>
                  <ul className="space-y-3 text-xs leading-6 text-slate-600">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-indigo-600" />
                      Vérifiez votre dossier Spam ou Courrier indésirable.
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-indigo-600" />
                      Le lien expire dans 1 heure pour des raisons de sécurité.
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-indigo-600" />
                      Si vous ne recevez rien, réessayez dans quelques minutes.
                    </li>
                  </ul>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => {
                      setSent(false);
                      setEmail('');
                    }}
                    className="w-full rounded-full border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Renvoyer un email
                  </button>

                  <Link
                    to="/login"
                    className="group flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
                  >
                    <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
                    Retour à la connexion
                  </Link>
                </div>

                <div className="mt-8 flex items-center justify-center gap-4 text-[10px] text-slate-400">
                  <Link to={BRAND.legal.terms} className="hover:text-slate-600 transition-colors">
                    Conditions
                  </Link>
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  <Link to={BRAND.legal.privacy} className="hover:text-slate-600 transition-colors">
                    Confidentialité
                  </Link>
                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                  <div className="flex items-center gap-1.5">
                    <Shield size={10} className="text-emerald-500" />
                    Sécurisé
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDU : ÉCRAN DE SAISIE
  // ============================================================

  return (
    <div className="min-h-screen bg-[#f2f1e9] px-2 py-2 font-sans text-slate-900 sm:px-4 sm:py-4 lg:px-6">
      {/* Bouton retour */}
      <div className="max-w-[1440px] mx-auto mb-3 flex items-center">
        <Link
          to="/login"
          className="group inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
          Retour à la connexion
        </Link>
      </div>

      <div className="relative mx-auto max-w-[1440px] overflow-hidden rounded-[24px] bg-white shadow-[0_20px_80px_-30px_rgba(15,23,42,0.18)] sm:rounded-[30px]">
        {/* Bandeau supérieur */}
        <div className="flex min-h-8 items-center justify-center bg-slate-950 px-4 py-2 text-center text-[10px] font-medium tracking-wide text-white sm:text-xs">
          {BRAND.tagline}
        </div>

        <div className="grid min-h-[calc(100vh-6rem)] lg:grid-cols-[1.1fr_1fr]">
          {/* Partie gauche - Hero editorial (visible sur desktop) */}
          <div className="relative hidden overflow-hidden bg-[#fafaf6] px-12 py-20 lg:flex lg:flex-col lg:justify-between">
            <div className="pointer-events-none absolute -left-40 top-10 h-96 w-96 rounded-full bg-emerald-100/50 blur-3xl" />
            <div className="pointer-events-none absolute -right-40 bottom-10 h-96 w-96 rounded-full bg-indigo-100/50 blur-3xl" />

            <div className="relative z-10">
              <Link to="/" className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                  <Wallet size={19} strokeWidth={2.2} />
                </div>
                <span className="text-xl font-bold tracking-tight text-slate-950">
                  {BRAND.name}
                </span>
              </Link>
            </div>

            <div className="relative z-10 max-w-lg">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                Récupération de compte
              </p>
              <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-slate-950">
                Mot de passe
                <br />
                <span className="text-indigo-600">oublié ?</span>
              </h1>
              <p className="mt-6 text-base leading-8 text-slate-600">
                Pas de panique. Saisissez votre adresse email et nous vous enverrons un lien sécurisé pour réinitialiser votre accès.
              </p>
            </div>

            <div className="relative z-10">
              <div className="rounded-2xl border border-slate-200 bg-white/60 p-5 backdrop-blur-sm">
                <p className="text-sm leading-7 text-slate-700 italic">
                  "J'avais oublié mes identifiants après quelques mois. Le processus de récupération est clair, rapide et sécurisé."
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                    MP
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Marc P.</p>
                    <p className="text-[10px] text-slate-500">Gérant, Atelier Bois</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Partie droite - Formulaire */}
          <div className="flex items-center justify-center px-5 py-12 sm:px-8 lg:px-12">
            <div className="w-full max-w-md">
              {/* Logo mobile */}
              <div className="mb-8 flex items-center gap-2.5 lg:hidden">
                <Link to="/" className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                    <Wallet size={19} strokeWidth={2.2} />
                  </div>
                  <span className="text-xl font-bold tracking-tight text-slate-950">
                    {BRAND.name}
                  </span>
                </Link>
              </div>

              {/* Présentation */}
              <div className="mb-8 text-center lg:text-left">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 lg:mx-0">
                  <KeyRound size={26} className="text-indigo-600" />
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  Réinitialisation
                </h1>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  Saisissez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
                </p>
              </div>

              {/* Alerte mode dégradé reCAPTCHA */}
              {recaptchaDegraded && (
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Mode développement</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        La vérification anti-bot serveur n'est pas configurée.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Alerte de blocage rate limit */}
              {blocked && (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-700" />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Trop de demandes</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Réessayez dans <strong>{remainingTimeFormatted}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Erreur inline */}
              {error && !blocked && (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-700" />
                    <p className="text-xs text-slate-700">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Adresse email
                  </label>

                  <div className="relative">
                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                      }}
                      placeholder="votre@email.com"
                      className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Vérification et envoi...
                    </>
                  ) : blocked ? (
                    <>
                      <AlertCircle size={16} />
                      Réessayez dans {remainingTimeFormatted}
                    </>
                  ) : (
                    <>
                      Envoyer le lien de récupération
                      <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>

                {!blocked && remainingAttempts < MAX_ATTEMPTS && !loading && (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-amber-700">
                    <Shield size={12} />
                    <span>{remainingAttempts} tentative(s) restante(s)</span>
                  </div>
                )}
              </form>

              <div className="mt-8 border-t border-slate-100 pt-6 text-center">
                <Link
                  to="/login"
                  className="group inline-flex items-center gap-2 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
                >
                  <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-1" />
                  Retour à la connexion
                </Link>
              </div>

              {/* Liens légaux */}
              <div className="mt-6 flex items-center justify-center gap-4 text-[10px] text-slate-400">
                <Link to={BRAND.legal.terms} className="hover:text-slate-600 transition-colors">
                  Conditions
                </Link>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <Link to={BRAND.legal.privacy} className="hover:text-slate-600 transition-colors">
                  Confidentialité
                </Link>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <div className="flex items-center gap-1.5">
                  <Shield size={10} className="text-emerald-500" />
                  Sécurisé
                </div>
              </div>

              {/* Mention reCAPTCHA */}
              <p className="mt-4 text-center text-[11px] leading-6 text-slate-400">
                Ce site est protégé par reCAPTCHA v3.{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-600"
                >
                  Politique de confidentialité Google
                </a>
                {' · '}
                <a
                  href="https://policies.google.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-slate-600"
                >
                  Conditions d'utilisation
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}