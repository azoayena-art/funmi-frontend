import { account } from '../appwrite';
import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Users,
  Loader2,
  Shield,
  Clock,
  AlertTriangle,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { AppwriteException } from 'appwrite';
import { useLoginRateLimit } from '../hooks/useRateLimit';
import { useRecaptcha } from '../hooks/useRecaptcha';
import { validateRecaptchaToken } from '../services/recaptchaService';
import { BRAND } from '../config/brand';

export default function Login() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  const {
    tryConsume,
    isBlocked,
    remainingAttempts,
    remainingTimeFormatted,
    reset,
  } = useLoginRateLimit();

  const { getToken } = useRecaptcha();

  // Paramètres d'URL
  const emailParam = searchParams.get('email') || '';
  const membershipIdParam = searchParams.get('membershipId') || '';
  const secretParam = searchParams.get('secret') || '';
  const nameParam = searchParams.get('name') || '';
  const appwriteTeamIdParam = searchParams.get('appwriteTeamId') || '';
  const customTeamIdParam = searchParams.get('customTeamId') || '';
  const fromInvitationParam = searchParams.get('fromInvitation') === 'true';
  const redirectParam = searchParams.get('redirect') || '/dashboard';

  const isInvitation =
    fromInvitationParam || (!!emailParam && !!membershipIdParam);

  // États
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recaptchaDegraded, setRecaptchaDegraded] = useState(false);

  useEffect(() => {
    if (emailParam && !email) {
      setEmail(emailParam);
    }
  }, [emailParam, email]);

  // Validation email
  const validateEmail = (value: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value) && value.length <= 254;
  };

  // Routes autorisées après connexion
  const ALLOWED_ROUTES = [
    '/dashboard',
    '/prospects',
    '/clients',
    '/quotes',
    '/invoices',
    '/received-invoices',
    '/receipts',
    '/payments',
    '/reminders',
    '/catalogue',
    '/statistics',
    '/team-settings',
    '/company-settings',
    '/account-mapping',
    '/import-export',
    '/export-comptable',
  ];

  // Redirection sécurisée
  const getRedirectUrl = (): string => {
    if (isInvitation) {
      const joinParams = new URLSearchParams();

      if (membershipIdParam) joinParams.set('membershipId', membershipIdParam);
      if (secretParam) joinParams.set('secret', secretParam);
      if (emailParam) joinParams.set('email', emailParam);
      if (nameParam) joinParams.set('name', nameParam);
      if (appwriteTeamIdParam) {
        joinParams.set('appwriteTeamId', appwriteTeamIdParam);
      }
      if (customTeamIdParam) {
        joinParams.set('customTeamId', customTeamIdParam);
      }

      return `/join-team?${joinParams.toString()}`;
    }

    if (
      !redirectParam ||
      !redirectParam.startsWith('/') ||
      redirectParam.startsWith('//')
    ) {
      return '/dashboard';
    }

    const basePath = redirectParam.split('?')[0];

    const isAllowed = ALLOWED_ROUTES.some(
      route => basePath === route || basePath.startsWith(route + '/')
    );

    return isAllowed ? redirectParam : '/dashboard';
  };

  // Connexion
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError('');
    setRecaptchaDegraded(false);

    if (isBlocked) {
      toast.error('Compte temporairement bloqué', {
        description: `Trop de tentatives échouées. Réessayez dans ${remainingTimeFormatted}.`,
        duration: 5000,
      });
      return;
    }

    if (!validateEmail(email)) {
      toast.error('Email invalide', {
        description: 'Veuillez saisir une adresse email valide.',
      });
      return;
    }

    if (!password || password.length < 8) {
      toast.error('Mot de passe requis', {
        description: 'Le mot de passe doit contenir au moins 8 caractères.',
      });
      return;
    }

    const rateCheck = tryConsume();

    if (!rateCheck.allowed) {
      toast.error('Trop de tentatives', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de réessayer.`,
        duration: 5000,
      });
      return;
    }

    setLoading(true);

    try {
      // Récupération du token reCAPTCHA
      const recaptchaToken = await getToken('login');

      if (!recaptchaToken) {
        toast.error('Vérification anti-bot impossible', {
          description: 'Rechargez la page et réessayez.',
        });
        return;
      }

      const isDev =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      let validation: any;

      if (isDev) {
        console.warn('[DEV MODE] reCAPTCHA bypassed for local development');

        validation = {
          success: true,
          score: 0.9,
          action: 'login',
          degraded: true,
        };
      } else {
        validation = await validateRecaptchaToken(
          recaptchaToken,
          'login',
          0.5
        );
      }

      if (validation.degraded) {
        console.warn(
          '[DEGRADED MODE] reCAPTCHA server validation failed:',
          validation.error
        );

        setRecaptchaDegraded(true);

        toast.warning('Vérification anti-bot désactivée', {
          description:
            'Mode développement ou erreur serveur. La connexion est autorisée.',
          duration: 8000,
        });
      } else if (!validation.success) {
        console.warn('reCAPTCHA v3 rejected:', validation);

        toast.error('Vérification anti-bot échouée', {
          description:
            validation.score !== undefined
              ? `Score : ${validation.score.toFixed(2)} - comportement suspect.`
              : validation.error || 'Réessayez.',
          duration: 6000,
        });

        return;
      } else {
        console.log(
          `reCAPTCHA v3 OK (score: ${validation.score?.toFixed(2)})`
        );
      }

      // Authentification Appwrite
      await login(email, password);

      reset();

      const safeRedirect = getRedirectUrl();

      console.log('Login successful, redirecting to:', safeRedirect);

      toast.success('Connexion réussie', {
        description: isInvitation
          ? 'Vous allez être redirigé vers votre équipe.'
          : `Bienvenue sur ${BRAND.name} !`,
        duration: 3000,
      });

      window.setTimeout(() => {
        window.location.href = safeRedirect;
      }, 500);

    } catch (err: unknown) {
      console.error('Login error:', err);

      const errorMessage = (err as any)?.message || '';

      const isCSPError =
        errorMessage.includes('Content Security Policy') ||
        errorMessage.includes('Refused to connect') ||
        errorMessage.includes('Failed to fetch');

      // Vérification d'une éventuelle session créée malgré l'erreur CSP
      if (isCSPError) {
        console.warn('CSP error detected, checking session...');

        try {
          await new Promise(resolve => window.setTimeout(resolve, 500));

          const currentSession = await account.get();

          if (currentSession && currentSession.$id) {
            console.log('Session created despite CSP error');

            reset();

            const safeRedirect = getRedirectUrl();

            toast.success('Connexion réussie !', {
              description: 'Redirection en cours...',
              duration: 2000,
            });

            window.setTimeout(() => {
              window.location.href = safeRedirect;
            }, 500);

            return;
          }
        } catch {
          console.log('No active session, error is real');
        }
      }

      if (err instanceof AppwriteException) {
        switch (err.code) {
          case 401:
            setError('Email ou mot de passe incorrect.');

            toast.error('Identifiants invalides', {
              description: `${remainingAttempts} tentative(s) restante(s) avant blocage.`,
              duration: 4000,
            });
            break;

          case 429:
            setError(
              'Trop de tentatives. Veuillez réessayer dans quelques minutes.'
            );

            toast.error('Compte temporairement bloqué', {
              description:
                'Trop de tentatives depuis cette adresse IP. Réessayez plus tard.',
              duration: 6000,
            });
            break;

          case 400:
            setError('Données invalides. Vérifiez votre email.');

            toast.error('Données invalides', {
              description: 'Vérifiez le format de votre adresse email.',
            });
            break;

          case 403:
            setError(
              "Domaine non autorisé. Contactez l'administrateur."
            );

            toast.error('Accès refusé', {
              description:
                "Ce domaine n'est pas autorisé. Vérifiez Settings -> Platforms.",
              duration: 6000,
            });
            break;

          case 503:
            setError('Service temporairement indisponible.');

            toast.error('Service indisponible', {
              description:
                'Nos serveurs sont en maintenance. Réessayez dans quelques instants.',
            });
            break;

          default:
            setError(`Erreur de connexion : ${err.message}`);

            toast.error('Erreur de connexion', {
              description: err.message || 'Une erreur est survenue.',
            });
        }
      } else if (isCSPError) {
        setError(
          'Problème de sécurité détecté. Actualisez la page (Ctrl+Shift+R) et réessayez.'
        );

        toast.error('Erreur de configuration', {
          description:
            'Si le problème persiste après actualisation, contactez le support.',
          duration: 6000,
        });
      } else {
        setError(
          'Une erreur inattendue est survenue. Veuillez réessayer.'
        );

        toast.error('Erreur inattendue', {
          description:
            'Vérifiez votre connexion internet et réessayez.',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // URL d'inscription, y compris pour les invitations
  const getRegisterUrl = (): string => {
    if (isInvitation) {
      const registerParams = new URLSearchParams();

      registerParams.set('email', emailParam);

      if (nameParam) registerParams.set('name', nameParam);
      if (membershipIdParam) {
        registerParams.set('membershipId', membershipIdParam);
      }
      if (secretParam) registerParams.set('secret', secretParam);
      if (appwriteTeamIdParam) {
        registerParams.set('appwriteTeamId', appwriteTeamIdParam);
      }
      if (customTeamIdParam) {
        registerParams.set('customTeamId', customTeamIdParam);
      }

      registerParams.set('fromInvitation', 'true');

      return `/register?${registerParams.toString()}`;
    }

    return '/register';
  };

  return (
    <div className="min-h-screen bg-[#f2f1e9] px-2 py-2 font-sans text-slate-900 sm:px-4 sm:py-4 lg:px-6">
      {/* Bouton retour vers la landing */}
      <div className="max-w-[1440px] mx-auto mb-3 flex items-center">
        <Link
          to="/"
          className="group inline-flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-0.5" />
          Retour à l'accueil
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

            {/* Logo */}
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

            {/* Contenu principal */}
            <div className="relative z-10 max-w-lg">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                {isInvitation ? 'Invitation équipe' : 'Connexion sécurisée'}
              </p>
              <h1 className="text-5xl font-semibold leading-[1.04] tracking-[-0.055em] text-slate-950">
                {isInvitation ? (
                  <>
                    Rejoignez votre
                    <br />
                    <span className="text-indigo-600">équipe.</span>
                  </>
                ) : (
                  <>
                    Bon retour
                    <br />
                    <span className="text-indigo-600">sur {BRAND.name}.</span>
                  </>
                )}
              </h1>
              <p className="mt-6 text-base leading-8 text-slate-600">
                Retrouvez vos devis, factures, relances clients et votre suivi de trésorerie depuis votre espace de gestion.
              </p>
            </div>

            {/* Témoignage */}
            <div className="relative z-10">
              <div className="rounded-2xl border border-slate-200 bg-white/60 p-5 backdrop-blur-sm">
                <p className="text-sm leading-7 text-slate-700 italic">
                  "Depuis que j'utilise {BRAND.name}, mes délais de paiement ont été divisés par deux. Un outil indispensable."
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                    SM
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Sophie Martin</p>
                    <p className="text-[10px] text-slate-500">Gérante, Martin Rénovation</p>
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
              <div className="mb-8">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-600">
                  {isInvitation ? 'Invitation équipe' : 'Connexion'}
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  {isInvitation ? 'Accepter l\'invitation' : 'Connectez-vous à votre espace'}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {isInvitation
                    ? 'Connectez-vous pour rejoindre votre équipe.'
                    : `Entrez vos identifiants pour accéder à votre espace ${BRAND.name}.`}
                </p>
              </div>

              {/* Bannière d'invitation */}
              {isInvitation && (
                <div className="mb-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <Users size={16} className="mt-0.5 shrink-0 text-indigo-600" />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Invitation à rejoindre une équipe</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Connectez-vous avec : <strong className="font-mono">{emailParam}</strong>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Bannière de redirection */}
              {!isInvitation && redirectParam !== '/dashboard' && (
                <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] text-slate-600 flex items-center gap-2">
                    <ArrowRight size={12} />
                    Après connexion, redirection vers votre destination.
                  </p>
                </div>
              )}

              {/* reCAPTCHA dégradé */}
              {recaptchaDegraded && (
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Mode développement</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Vérification anti-bot serveur non configurée.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Blocage rate limit */}
              {isBlocked && (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <Clock size={16} className="mt-0.5 shrink-0 text-rose-700" />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Compte temporairement bloqué</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Réessayez dans <strong>{remainingTimeFormatted}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Erreur inline */}
              {error && !isBlocked && (
                <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-700" />
                    <p className="text-xs text-slate-700">{error}</p>
                  </div>
                </div>
              )}

              {/* Formulaire */}
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email */}
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
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      disabled={loading || isBlocked}
                      readOnly={isInvitation}
                      placeholder="nom@entreprise.com"
                      className={`block w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                        isInvitation ? 'bg-slate-50' : ''
                      }`}
                    />
                  </div>

                  {isInvitation && (
                    <p className="mt-1.5 flex items-center gap-1 text-[10px] text-indigo-600">
                      <Lock size={10} /> Email verrouillé pour cette invitation
                    </p>
                  )}
                </div>

                {/* Mot de passe */}
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Mot de passe
                    </label>

                    <Link
                      to="/forgot-password"
                      className="text-[11px] font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>

                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                    <input
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      disabled={loading || isBlocked}
                      placeholder="Votre mot de passe"
                      autoFocus={!isInvitation}
                      className="block w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                </div>

                {/* Bouton de soumission */}
                <button
                  type="submit"
                  disabled={loading || isBlocked || !email || !password}
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Vérification en cours...
                    </>
                  ) : isBlocked ? (
                    <>
                      <Clock size={16} />
                      Réessayez dans {remainingTimeFormatted}
                    </>
                  ) : (
                    <>
                      {isInvitation ? 'Accepter l\'invitation' : 'Se connecter'}
                      <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>

                {/* Tentatives restantes */}
                {!isBlocked && remainingAttempts < 5 && !loading && (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-amber-700">
                    <Shield size={12} />
                    <span>{remainingAttempts} tentative(s) restante(s) avant blocage</span>
                  </div>
                )}
              </form>

              {/* Inscription */}
              <div className="mt-8 border-t border-slate-100 pt-6 text-center">
                <p className="text-sm text-slate-600">
                  Pas encore de compte ?{' '}
                  <Link
                    to={getRegisterUrl()}
                    className="font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
                  >
                    Créer un compte
                  </Link>
                </p>
              </div>

              {/* Mention reCAPTCHA */}
              <p className="mt-6 text-center text-[11px] leading-6 text-slate-400">
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

              {/* Liens légaux */}
              <div className="mt-6 flex items-center justify-center gap-4 text-[10px] text-slate-400">
                <Link to="/terms" className="hover:text-slate-600 transition-colors">
                  Conditions
                </Link>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <Link to="/privacy" className="hover:text-slate-600 transition-colors">
                  Confidentialité
                </Link>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <div className="flex items-center gap-1.5">
                  <Shield size={10} className="text-emerald-500" />
                  Connexion sécurisée
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}