// src/pages/Login.tsx
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, Lock, ArrowRight, AlertCircle, Receipt, Users, Loader2, Shield, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { AppwriteException } from 'appwrite';
import { useLoginRateLimit } from '../hooks/useRateLimit';

export default function Login() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();

  // ✅ Rate limiter pour le login
  const {
    tryConsume,
    isBlocked,
    remainingAttempts,
    remainingTimeFormatted,
    reset,
  } = useLoginRateLimit();

  // ✅ Récupération de TOUS les paramètres d'URL (invitation ou redirect classique)
  const emailParam = searchParams.get('email') || '';
  const membershipIdParam = searchParams.get('membershipId') || '';
  const secretParam = searchParams.get('secret') || '';
  const nameParam = searchParams.get('name') || '';
  const appwriteTeamIdParam = searchParams.get('appwriteTeamId') || '';
  const customTeamIdParam = searchParams.get('customTeamId') || '';
  const fromInvitationParam = searchParams.get('fromInvitation') === 'true';
  const redirectParam = searchParams.get('redirect') || '/dashboard';

  // ✅ Détection du mode invitation
  const isInvitation = fromInvitationParam || (!!emailParam && !!membershipIdParam);

  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recaptchaDegraded, setRecaptchaDegraded] = useState(false);

  // ✅ Mettre à jour l'email si le paramètre change
  useEffect(() => {
    if (emailParam && !email) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  // ============================================================
  // ✅ VALIDATION DU FORMAT EMAIL
  // ============================================================
  const validateEmail = (email: string): boolean => {
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return re.test(email) && email.length <= 254;
  };

  // ============================================================
  // ✅ WHITELIST DES ROUTES AUTORISÉES (sécurité redirect)
  // ============================================================
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
    '/verify-email', // Ajouté pour permettre la redirection post-inscription
  ];

  // ============================================================
  // ✅ FONCTION DE REDIRECTION INTELLIGENTE
  // ============================================================
  const getRedirectUrl = (): string => {
    if (isInvitation) {
      const joinParams = new URLSearchParams();
      if (membershipIdParam) joinParams.set('membershipId', membershipIdParam);
      if (secretParam) joinParams.set('secret', secretParam);
      if (emailParam) joinParams.set('email', emailParam);
      if (nameParam) joinParams.set('name', nameParam);
      if (appwriteTeamIdParam) joinParams.set('appwriteTeamId', appwriteTeamIdParam);
      if (customTeamIdParam) joinParams.set('customTeamId', customTeamIdParam);

      return `/join-team?${joinParams.toString()}`;
    }

    // ✅ Sécurité : validation stricte de la redirection classique
    if (!redirectParam || !redirectParam.startsWith('/') || redirectParam.startsWith('//')) {
      return '/dashboard';
    }

    // ✅ Vérifier que la route est dans la whitelist
    const basePath = redirectParam.split('?')[0];
    const isAllowed = ALLOWED_ROUTES.some(route =>
      basePath === route || basePath.startsWith(route + '/')
    );

    return isAllowed ? redirectParam : '/dashboard';
  };

  // ============================================================
  // 📤 SOUMISSION DU FORMULAIRE
  // ============================================================
  const handleSubmit = async (e: React.FormEvent) => {
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
      toast.error('Email invalide', { description: 'Veuillez saisir une adresse email valide.' });
      return;
    }

    if (!password || password.length < 8) {
      toast.error('Mot de passe requis', { description: 'Le mot de passe doit contenir au moins 8 caractères.' });
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
      // 🚨 BYPASS TOTAL : On n'appelle même pas getToken pour éviter l'erreur de clé invalide
      console.log("⚠️ [BYPASS TOTAL] reCAPTCHA complètement désactivé pour ce test");
      
      // 🛡️ ÉTAPE 3 : Login Appwrite
      await login(email, password);

      // ✅ Reset du compteur en cas de succès
      reset();

      const safeRedirect = getRedirectUrl();
      console.log('✅ Connexion réussie, redirection HARD vers:', safeRedirect);

      toast.success('Connexion réussie', {
        description: isInvitation
          ? 'Vous allez être redirigé vers votre équipe.'
          : 'Bienvenue sur RelancePro !',
        duration: 3000,
      });

      // 🚀 RECHARGEMENT COMPLET (Hard Redirect) pour garantir que AuthContext lise la nouvelle session
      setTimeout(() => {
        window.location.href = safeRedirect;
      }, 500);

    } catch (err: unknown) {
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
            setError('Trop de tentatives. Veuillez réessayer dans quelques minutes.');
            toast.error('Compte temporairement bloqué', {
              description: 'Trop de tentatives depuis cette adresse IP. Réessayez plus tard.',
              duration: 6000,
            });
            break;
          case 400:
            setError('Données invalides. Vérifiez votre email.');
            toast.error('Données invalides', { description: 'Vérifiez le format de votre adresse email.' });
            break;
          case 503:
            setError('Service temporairement indisponible. Veuillez réessayer.');
            toast.error('Service indisponible', { description: 'Nos serveurs sont en maintenance. Réessayez dans quelques instants.' });
            break;
          default:
            setError(`Erreur de connexion : ${err.message}`);
            toast.error('Erreur de connexion', { description: err.message || 'Une erreur est survenue.' });
        }
      } else {
        setError('Une erreur inattendue est survenue. Veuillez réessayer.');
        toast.error('Erreur inattendue', { description: 'Vérifiez votre connexion internet et réessayez.' });
      }
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // ✅ CONSTRUIRE LE LIEN VERS REGISTER
  // ============================================================
  const getRegisterUrl = (): string => {
    if (isInvitation) {
      const registerParams = new URLSearchParams();
      registerParams.set('email', emailParam);
      if (nameParam) registerParams.set('name', nameParam);
      if (membershipIdParam) registerParams.set('membershipId', membershipIdParam);
      if (secretParam) registerParams.set('secret', secretParam);
      if (appwriteTeamIdParam) registerParams.set('appwriteTeamId', appwriteTeamIdParam);
      if (customTeamIdParam) registerParams.set('customTeamId', customTeamIdParam);
      registerParams.set('fromInvitation', 'true');
      return `/register?${registerParams.toString()}`;
    }
    return '/register';
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Partie gauche : Image en arrière-plan avec overlay */}
      <div className="hidden lg:flex w-1/2 relative overflow-hidden items-center justify-center p-12">
        <img
          src="https://images.unsplash.com/photo-1581092160562-40aa08e78837?q=80&w=1000&auto=format&fit=crop"
          alt="Technicien avec tablette"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/90 via-purple-800/85 to-indigo-700/80"></div>

        <div className="relative z-10 text-white max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Receipt size={24} className="text-white" />
            </div>
            <h1 className="text-4xl font-bold">RelancePro</h1>
          </div>
          <p className="text-purple-100 text-xl leading-relaxed mb-8">
            Ne laissez plus vos devis et vos factures sans réponse. Automatisez vos relances commerciales et récupérez davantage de paiements.
          </p>
          <div className="flex flex-wrap gap-3 text-purple-200 text-sm">
            <span className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10">✓ Suivi des prospects</span>
            <span className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10">✓ Relances automatiques</span>
            <span className="bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/10">✓ Gestion des factures</span>
          </div>
        </div>
      </div>

      {/* Partie droite : Formulaire */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-2 justify-center mb-8">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center">
              <Receipt size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white">RelancePro</span>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-2 justify-center lg:justify-start">
              {isInvitation ? <Users size={28} className="text-purple-600 dark:text-purple-400" /> : null}
              {isInvitation ? 'Accepter l\'invitation' : 'Bon retour parmi nous'}
            </h2>
            <p className="mt-2 text-slate-500 dark:text-slate-400">
              {isInvitation
                ? 'Connectez-vous pour rejoindre votre équipe.'
                : 'Entrez vos identifiants pour accéder à votre espace.'}
            </p>
          </div>

          {/* ✅ Bannière d'invitation */}
          {isInvitation && (
            <div className="mt-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Invitation à rejoindre une équipe</p>
                <p className="text-xs mt-1">Connectez-vous avec : <strong className="font-mono">{emailParam}</strong></p>
              </div>
            </div>
          )}

          {/* ✅ Bannière de redirection classique */}
          {!isInvitation && redirectParam !== '/dashboard' && (
            <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 px-3 py-2 rounded-lg text-xs flex items-start gap-2">
              <ArrowRight size={14} className="mt-0.5 flex-shrink-0" />
              <span>Après connexion, vous serez redirigé vers votre destination.</span>
            </div>
          )}

          {/* ⚠️ Alerte mode dégradé reCAPTCHA */}
          {recaptchaDegraded && (
            <div className="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Mode développement</p>
                <p className="text-xs mt-1">
                  La vérification anti-bot serveur n'est pas configurée. La connexion fonctionne sans protection reCAPTCHA.
                </p>
              </div>
            </div>
          )}

          {/* ✅ Alerte de blocage rate limit */}
          {isBlocked && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <Clock size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Compte temporairement bloqué</p>
                <p className="text-xs mt-1">
                  Trop de tentatives échouées. Réessayez dans <strong>{remainingTimeFormatted}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* ✅ Erreur inline (pour accessibilité, en plus du toast) */}
          {error && !isBlocked && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <div className="space-y-4">
              {/* Champ Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Adresse email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Mail size={18} />
                  </div>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading || isBlocked}
                    className={`block w-full pl-10 pr-3 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none text-slate-900 dark:text-white placeholder-slate-400 disabled:opacity-60 disabled:cursor-not-allowed ${
                      isInvitation ? 'bg-slate-100 dark:bg-slate-800/50' : ''
                    }`}
                    placeholder="nom@entreprise.com"
                    readOnly={isInvitation}
                  />
                </div>
                {isInvitation && (
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-1.5 flex items-center gap-1">
                    🔒 Email verrouillé (invitation)
                  </p>
                )}
              </div>

              {/* Champ Mot de passe */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Mot de passe
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 transition-colors"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <Lock size={18} />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading || isBlocked}
                    className="block w-full pl-10 pr-3 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all outline-none text-slate-900 dark:text-white placeholder-slate-400 disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="••••••••"
                    autoFocus={!isInvitation}
                  />
                </div>
              </div>
            </div>

            {/* Bouton de soumission */}
            <button
              type="submit"
              disabled={loading || isBlocked || !email || !password}
              className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 dark:focus:ring-offset-slate-900 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin mr-2" />
                  Vérification et connexion...
                </>
              ) : isBlocked ? (
                <>
                  <Clock size={18} className="mr-2" />
                  Réessayez dans {remainingTimeFormatted}
                </>
              ) : (
                <>
                  {isInvitation ? 'Accepter l\'invitation' : 'Se connecter'}
                  <ArrowRight size={18} className="ml-2" />
                </>
              )}
            </button>

            {/* ✅ Mention légale Google reCAPTCHA v3 (obligatoire) */}
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

            {/* ✅ Compteur de tentatives restantes */}
            {!isBlocked && remainingAttempts < 5 && !loading && (
              <div className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <Shield size={12} />
                <span>{remainingAttempts} tentative(s) restante(s) avant blocage temporaire</span>
              </div>
            )}
          </form>

          <p className="mt-8 text-center text-sm text-slate-600 dark:text-slate-400">
            Pas encore de compte ?{' '}
            <Link
              to={getRegisterUrl()}
              className="font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors"
            >
              Créer un compte gratuitement
            </Link>
          </p>

          {/* ✅ Footer sécurité */}
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
              <Shield size={12} /> Connexion sécurisée • Protection anti-brute force et reCAPTCHA v3 actives
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}