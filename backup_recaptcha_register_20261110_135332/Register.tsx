import { useRecaptcha } from '../hooks/useRecaptcha';
import { validateRecaptchaToken } from '../services/recaptchaService';
import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { account, databases, DATABASE_ID } from '../appwrite';
import { ID, Permission, Role, AppwriteException } from 'appwrite';
import { toast } from 'sonner';
import {
  UserPlus,
  Mail,
  Lock,
  User,
  Building2,
  Loader2,
  Users,
  AlertCircle,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Wallet,
  ArrowRight,
} from 'lucide-react';
import { useRegisterRateLimit } from '../hooks/useRateLimit';
import { BRAND } from '../config/brand';

// ============================================================
// VALIDATIONS
// ============================================================

const validateEmail = (email: string): boolean => {
  const normalizedEmail = email.trim();

  return (
    normalizedEmail.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  );
};

const validatePassword = (
  password: string
): { valid: boolean; message: string } => {
  if (password.length < 8) {
    return {
      valid: false,
      message: 'Le mot de passe doit contenir au moins 8 caractères.',
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: 'Le mot de passe doit contenir au moins une majuscule.',
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: 'Le mot de passe doit contenir au moins une minuscule.',
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: 'Le mot de passe doit contenir au moins un chiffre.',
    };
  }

  return { valid: true, message: '' };
};

const sanitizeParam = (value: string | null): string => {
  if (!value) return '';

  return value.replace(/[<>'"]/g, '').trim().substring(0, 254);
};

// ============================================================
// COMPOSANT REGISTER
// ============================================================

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    tryConsume,
    isBlocked,
    remainingAttempts,
    remainingTimeFormatted,
    reset,
  } = useRegisterRateLimit();

  const { getToken } = useRecaptcha();

  // Paramètres d'invitation
  const emailParam = sanitizeParam(searchParams.get('email'));
  const nameParam = sanitizeParam(searchParams.get('name'));
  const membershipIdParam = sanitizeParam(searchParams.get('membershipId'));
  const secretParam = sanitizeParam(searchParams.get('secret'));
  const appwriteTeamIdParam = sanitizeParam(
    searchParams.get('appwriteTeamId')
  );
  const customTeamIdParam = sanitizeParam(
    searchParams.get('customTeamId')
  );
  const fromInvitationParam =
    searchParams.get('fromInvitation') === 'true';

  const isInvitation =
    fromInvitationParam || (!!emailParam && !!membershipIdParam);

  // États
  const [name, setName] = useState(nameParam);
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recaptchaDegraded, setRecaptchaDegraded] = useState(false);

  useEffect(() => {
    if (emailParam) setEmail(emailParam);
    if (nameParam) setName(nameParam);
  }, [emailParam, nameParam]);

  // ============================================================
  // GESTION DE L'INSCRIPTION
  // ============================================================

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setRecaptchaDegraded(false);

    if (loading) return;

    if (isBlocked) {
      toast.error('Inscription temporairement bloquée', {
        description: `Trop de tentatives. Réessayez dans ${remainingTimeFormatted}.`,
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

    if (!name.trim() || !email.trim() || !password) {
      toast.error('Champs requis', {
        description: 'Veuillez remplir tous les champs obligatoires.',
      });
      return;
    }

    if (!isInvitation && !companyName.trim()) {
      toast.error('Nom entreprise requis', {
        description: 'Veuillez renseigner le nom de votre entreprise.',
      });
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

    const rateCheck = tryConsume();

    if (!rateCheck.allowed) {
      toast.error('Trop de tentatives', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de réessayer.`,
        duration: 5000,
      });
      return;
    }

    setLoading(true);

    let createdAccount: any = null;
    const createdDocs: Array<{ collection: string; id: string }> = [];

    try {
      // Vérification reCAPTCHA
      const recaptchaToken = await getToken('register');

      if (!recaptchaToken) {
        toast.error('Vérification anti-bot impossible', {
          description: 'Rechargez la page et réessayez.',
        });
        return;
      }

      const validation = await validateRecaptchaToken(
        recaptchaToken,
        'register',
        0.5
      );

      if (validation.degraded) {
        console.warn(
          '[DEGRADED MODE] reCAPTCHA server validation failed:',
          validation.error
        );

        setRecaptchaDegraded(true);

        toast.warning('Vérification anti-bot désactivée', {
          description: `La fonction serveur n'est pas configurée (${validation.error}). L'inscription fonctionne mais sans protection reCAPTCHA serveur.`,
          duration: 8000,
        });
      } else if (!validation.success) {
        console.warn('reCAPTCHA v3 rejected:', validation);

        toast.error('Vérification anti-bot échouée', {
          description:
            validation.score !== undefined
              ? `Score : ${validation.score.toFixed(2)} - comportement suspect détecté.`
              : validation.error || 'Réessayez.',
          duration: 6000,
        });

        return;
      } else {
        console.log(
          `reCAPTCHA v3 OK (score: ${validation.score?.toFixed(2)})`
        );
      }

      // Suppression d'une éventuelle session précédente
      try {
        const currentSession = await account.getSession('current');

        if (currentSession) {
          await account.deleteSession('current');
        }
      } catch {
        // Aucune session active
      }

      // Création du compte Appwrite
      const newUserId = ID.unique();

      createdAccount = await account.create(
        newUserId,
        email.trim(),
        password,
        name.trim()
      );

      // Connexion immédiate
      await account.createEmailPasswordSession(email.trim(), password);

      reset();

      // Séparation prénom / nom
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      // Permissions du document utilisateur
      const userPerms = [
        Permission.read(Role.user(createdAccount.$id)),
        Permission.update(Role.user(createdAccount.$id)),
        Permission.delete(Role.user(createdAccount.$id)),
      ];

      // Création du profil utilisateur
      await databases.createDocument(
        DATABASE_ID,
        'users',
        createdAccount.$id,
        {
          userId: createdAccount.$id,
          firstName,
          lastName,
          email: email.trim(),
          companyName: isInvitation ? '' : companyName.trim(),
          createdAt: new Date().toISOString(),
        },
        userPerms
      );

      createdDocs.push({
        collection: 'users',
        id: createdAccount.$id,
      });

      // Conservation des informations nécessaires après inscription
      const pendingData = {
        email: email.trim(),
        name: name.trim(),
        companyName: isInvitation ? '' : companyName.trim(),
        isInvitation,
        membershipId: membershipIdParam,
        secret: secretParam,
        appwriteTeamId: appwriteTeamIdParam,
        customTeamId: customTeamIdParam,
        timestamp: Date.now(),
      };

      localStorage.setItem(
        'relancepro_pending_registration',
        JSON.stringify(pendingData)
      );

      // Envoi de l'email de vérification
      const verifyUrl = `${window.location.origin}/confirm-email`;

      try {
        await account.createVerification(verifyUrl);
        console.log('Verification email sent');
      } catch (verifyError: any) {
        console.warn(
          'Verification email not sent (SMTP not configured?):',
          verifyError
        );

        toast.warning('Email de vérification non envoyé', {
          description:
            "Le SMTP n'est peut-être pas configuré. Contactez le support.",
          duration: 8000,
        });
      }

      toast.success('Compte créé !', {
        description: `Un email de vérification a été envoyé à ${email.trim()}`,
        duration: 5000,
      });

      const verifyParams = new URLSearchParams({
        email: email.trim(),
      });

      setTimeout(() => {
        navigate(`/verify-email?${verifyParams.toString()}`, {
          replace: true,
        });
      }, 500);

    } catch (error: any) {
      console.error('Registration error:', error);

      if (error instanceof AppwriteException) {
        // Compte déjà existant
        if (error.code === 409) {
          try {
            await account.createEmailPasswordSession(
              email.trim(),
              password
            );

            reset();

            toast.success('Connexion réussie', {
              description: 'Votre compte existant a été utilisé.',
              duration: 3000,
            });

            setTimeout(() => {
              if (isInvitation) {
                const joinParams = new URLSearchParams();

                if (membershipIdParam) {
                  joinParams.set('membershipId', membershipIdParam);
                }

                if (secretParam) {
                  joinParams.set('secret', secretParam);
                }

                if (emailParam) {
                  joinParams.set('email', emailParam);
                }

                if (nameParam) {
                  joinParams.set('name', nameParam);
                }

                if (appwriteTeamIdParam) {
                  joinParams.set('appwriteTeamId', appwriteTeamIdParam);
                }

                if (customTeamIdParam) {
                  joinParams.set('customTeamId', customTeamIdParam);
                }

                window.location.href = `/join-team?${joinParams.toString()}`;
              } else {
                navigate('/dashboard', { replace: true });
              }
            }, 500);

            return;
          } catch (loginError: any) {
            toast.error('Compte existant', {
              description:
                'Un compte existe déjà avec cet email. Veuillez vous connecter.',
              duration: 5000,
            });

            const loginParams = new URLSearchParams();

            if (email) loginParams.set('email', email);

            if (isInvitation) {
              if (membershipIdParam) {
                loginParams.set('membershipId', membershipIdParam);
              }

              if (secretParam) {
                loginParams.set('secret', secretParam);
              }

              if (nameParam) {
                loginParams.set('name', nameParam);
              }

              if (appwriteTeamIdParam) {
                loginParams.set('appwriteTeamId', appwriteTeamIdParam);
              }

              if (customTeamIdParam) {
                loginParams.set('customTeamId', customTeamIdParam);
              }

              loginParams.set('fromInvitation', 'true');
            }

            navigate(`/login?${loginParams.toString()}`, {
              replace: true,
            });

            return;
          }
        }

        if (error.code === 400) {
          toast.error('Données invalides', {
            description: 'Vérifiez les informations saisies.',
          });
        } else if (error.code === 429) {
          toast.error('Trop de tentatives', {
            description: 'Veuillez réessayer dans quelques minutes.',
            duration: 5000,
          });
        } else {
          toast.error("Erreur d'inscription", {
            description: error.message || 'Une erreur est survenue.',
          });
        }
      } else {
        toast.error('Erreur inattendue', {
          description:
            'Vérifiez votre connexion internet et réessayez.',
        });
      }

      // Rollback des documents créés
      for (const doc of createdDocs.reverse()) {
        try {
          await databases.deleteDocument(
            DATABASE_ID,
            doc.collection,
            doc.id
          );
        } catch (rollbackError) {
          console.warn(
            `Rollback failed for ${doc.collection}/${doc.id}:`,
            rollbackError
          );
        }
      }

      // Tentative de rollback du compte
      if (createdAccount) {
        try {
          await account.deleteSession('current');
        } catch {
          // Session déjà absente
        }

        try {
          await account.delete();
        } catch (rollbackError) {
          console.warn('Account rollback failed:', rollbackError);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LIEN DE CONNEXION
  // ============================================================

  const loginUrl = (() => {
    if (!isInvitation) return '/login';

    const params = new URLSearchParams();

    if (emailParam) params.set('email', emailParam);
    if (membershipIdParam) params.set('membershipId', membershipIdParam);
    if (secretParam) params.set('secret', secretParam);
    if (nameParam) params.set('name', nameParam);
    if (appwriteTeamIdParam) {
      params.set('appwriteTeamId', appwriteTeamIdParam);
    }
    if (customTeamIdParam) {
      params.set('customTeamId', customTeamIdParam);
    }

    params.set('fromInvitation', 'true');

    return `/login?${params.toString()}`;
  })();

  // ============================================================
  // RENDU
  // ============================================================

  return (
    <main className="min-h-screen bg-[#f2f1e9] px-2 py-2 font-sans text-slate-900 sm:px-4 sm:py-4 lg:px-6">
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
                {isInvitation ? 'Invitation équipe' : 'Inscription'}
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
                    Créez votre
                    <br />
                    <span className="text-indigo-600">espace {BRAND.name}.</span>
                  </>
                )}
              </h1>
              <p className="mt-6 text-base leading-8 text-slate-600">
                {BRAND.description}
              </p>
            </div>

            {/* Témoignage */}
            <div className="relative z-10">
              <div className="rounded-2xl border border-slate-200 bg-white/60 p-5 backdrop-blur-sm">
                <p className="text-sm leading-7 text-slate-700 italic">
                  "L'inscription a pris 2 minutes. Depuis, je gère toute ma facturation et ma trésorerie sans stress."
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                    TD
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">Thomas Dubois</p>
                    <p className="text-[10px] text-slate-500">Fondateur, Dubois Consulting</p>
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
                  {isInvitation ? 'Invitation équipe' : 'Inscription'}
                </p>
                <h2 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  {isInvitation ? 'Accepter l\'invitation' : 'Créez votre compte'}
                </h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                  {isInvitation
                    ? 'Créez votre compte pour rejoindre votre équipe.'
                    : 'Renseignez vos informations pour commencer à utiliser ' + BRAND.name + '.'}
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
                        Un administrateur vous invite avec l'adresse : <strong className="font-mono">{emailParam}</strong>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* reCAPTCHA dégradé */}
              {recaptchaDegraded && (
                <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">Vérification anti-bot indisponible</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        La validation reCAPTCHA côté serveur n'est pas configurée.
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
                      <p className="text-xs font-semibold text-slate-900">Inscription temporairement bloquée</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        Trop de tentatives. Réessayez dans <strong>{remainingTimeFormatted}</strong>.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Formulaire */}
              <form onSubmit={handleRegister} className="space-y-5">
                {/* Nom complet */}
                <div>
                  <label
                    htmlFor="register-name"
                    className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Nom complet
                  </label>

                  <div className="relative">
                    <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                    <input
                      id="register-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Jean Dupont"
                      autoComplete="name"
                      className="block w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                      required
                      autoFocus={!isInvitation}
                      disabled={loading || isBlocked}
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label
                    htmlFor="register-email"
                    className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Adresse email
                  </label>

                  <div className="relative">
                    <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                    <input
                      id="register-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre@email.com"
                      autoComplete="email"
                      className={`block w-full rounded-xl border py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                        isInvitation ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'
                      }`}
                      required
                      disabled={loading || isInvitation || isBlocked}
                    />
                  </div>

                  {isInvitation && (
                    <p className="mt-1.5 flex items-center gap-1 text-[10px] text-indigo-600">
                      <Lock size={10} /> Adresse email verrouillée pour cette invitation
                    </p>
                  )}
                </div>

                {/* Mot de passe */}
                <div>
                  <label
                    htmlFor="register-password"
                    className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Mot de passe
                  </label>

                  <div className="relative">
                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                    <input
                      id="register-password"
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setPasswordError('');
                      }}
                      placeholder="Minimum 8 caractères"
                      autoComplete="new-password"
                      className={`block w-full rounded-xl border bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                        passwordError ? 'border-rose-300' : 'border-slate-200'
                      }`}
                      required
                      minLength={8}
                      disabled={loading || isBlocked}
                      autoFocus={isInvitation}
                    />
                  </div>

                  {passwordError && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-rose-600">
                      <AlertCircle size={12} />
                      {passwordError}
                    </p>
                  )}

                  {!passwordError && password.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                      <div className="flex items-center gap-2 text-[11px]">
                        {password.length >= 8 ? (
                          <CheckCircle2 size={14} className="text-emerald-600" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-slate-300" />
                        )}
                        <span className={password.length >= 8 ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
                          8 caractères
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        {/[A-Z]/.test(password) ? (
                          <CheckCircle2 size={14} className="text-emerald-600" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-slate-300" />
                        )}
                        <span className={/[A-Z]/.test(password) ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
                          Une majuscule
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        {/[a-z]/.test(password) ? (
                          <CheckCircle2 size={14} className="text-emerald-600" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-slate-300" />
                        )}
                        <span className={/[a-z]/.test(password) ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
                          Une minuscule
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[11px]">
                        {/[0-9]/.test(password) ? (
                          <CheckCircle2 size={14} className="text-emerald-600" />
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-slate-300" />
                        )}
                        <span className={/[0-9]/.test(password) ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
                          Un chiffre
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Entreprise */}
                {!isInvitation && (
                  <div>
                    <label
                      htmlFor="register-company"
                      className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                    >
                      Nom de votre entreprise
                    </label>

                    <div className="relative">
                      <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

                      <input
                        id="register-company"
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Mon entreprise"
                        autoComplete="organization"
                        className="block w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                        required
                        disabled={loading || isBlocked}
                      />
                    </div>
                  </div>
                )}

                {/* Bouton de soumission */}
                <button
                  type="submit"
                  disabled={loading || isBlocked}
                  className="group flex w-full items-center justify-center gap-2 rounded-full bg-slate-950 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Création en cours...
                    </>
                  ) : isBlocked ? (
                    <>
                      <Clock size={16} />
                      Réessayez dans {remainingTimeFormatted}
                    </>
                  ) : (
                    <>
                      {isInvitation ? 'Créer mon compte et accepter' : 'Créer mon compte'}
                      <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>

                {/* Tentatives restantes */}
                {!isBlocked && remainingAttempts < 3 && !loading && (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-amber-700">
                    <Shield size={12} />
                    <span>{remainingAttempts} tentative(s) restante(s) avant blocage temporaire</span>
                  </div>
                )}
              </form>

              {/* Lien connexion */}
              <div className="mt-8 border-t border-slate-100 pt-6 text-center">
                <p className="text-sm text-slate-600">
                  {isInvitation ? 'Vous avez déjà un compte ? ' : 'Vous avez déjà un compte ? '}
                  <Link
                    to={loginUrl}
                    className="font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
                  >
                    Se connecter
                  </Link>
                </p>
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
                  Inscription sécurisée
                </div>
              </div>

              {/* Mention reCAPTCHA */}
              <p className="mt-4 text-center text-[11px] leading-6 text-slate-400">
                Ce site est protégé par reCAPTCHA.{' '}
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
    </main>
  );
}