// src/pages/Register.tsx
import { useRecaptcha } from '../hooks/useRecaptcha';
import { validateRecaptchaToken } from '../services/recaptchaService';
import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { account, databases, DATABASE_ID } from '../appwrite';
import { ID, Permission, Role, AppwriteException } from 'appwrite';
import { toast } from 'sonner';
import { UserPlus, Mail, Lock, User, Building2, Loader2, Users, AlertCircle, Shield, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useRegisterRateLimit } from '../hooks/useRateLimit';

// ============================================================
// 🛡️ VALIDATIONS
// ============================================================
const validateEmail = (email: string): boolean => {
  const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return re.test(email) && email.length <= 254;
};

const validatePassword = (password: string): { valid: boolean; message: string } => {
  if (password.length < 8) return { valid: false, message: 'Le mot de passe doit contenir au moins 8 caractères.' };
  if (!/[A-Z]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins une majuscule.' };
  if (!/[a-z]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins une minuscule.' };
  if (!/[0-9]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins un chiffre.' };
  return { valid: true, message: '' };
};

const sanitizeParam = (value: string | null): string => {
  if (!value) return '';
  return value.replace(/[<>'"]/g, '').trim().substring(0, 254);
};

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

  // 🛡️ Hook reCAPTCHA v3
  const { getToken } = useRecaptcha();

  const emailParam = sanitizeParam(searchParams.get('email'));
  const nameParam = sanitizeParam(searchParams.get('name'));
  const membershipIdParam = sanitizeParam(searchParams.get('membershipId'));
  const secretParam = sanitizeParam(searchParams.get('secret'));
  const appwriteTeamIdParam = sanitizeParam(searchParams.get('appwriteTeamId'));
  const customTeamIdParam = sanitizeParam(searchParams.get('customTeamId'));
  const fromInvitationParam = searchParams.get('fromInvitation') === 'true';

  const isInvitation = fromInvitationParam || (!!emailParam && !!membershipIdParam);

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
  // 📤 GESTION DE L'INSCRIPTION
  // ============================================================
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecaptchaDegraded(false);

    // ✅ GARDE 1 : Empêche les soumissions multiples (anti-doublon)
    if (loading) return;

    if (isBlocked) {
      toast.error('Inscription temporairement bloquée', {
        description: `Trop de tentatives. Réessayez dans ${remainingTimeFormatted}.`,
        duration: 5000,
      });
      return;
    }

    if (!validateEmail(email)) {
      toast.error('Email invalide', { description: 'Veuillez saisir une adresse email valide.' });
      return;
    }

    if (!name.trim() || !email.trim() || !password) {
      toast.error('Champs requis', { description: 'Veuillez remplir tous les champs obligatoires.' });
      return;
    }

    if (!isInvitation && !companyName.trim()) {
      toast.error('Nom entreprise requis', { description: 'Veuillez renseigner le nom de votre entreprise.' });
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setPasswordError(passwordValidation.message);
      toast.error('Mot de passe trop faible', { description: passwordValidation.message });
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
    let createdDocs: Array<{ collection: string; id: string }> = [];

    try {
      // 🛡️ ÉTAPE 1 : Vérification reCAPTCHA (Rétablie)
      const recaptchaToken = await getToken('register');
      if (!recaptchaToken) {
        toast.error('Vérification anti-bot impossible', {
          description: 'Rechargez la page et réessayez.',
        });
        setLoading(false);
        return;
      }

      const validation = await validateRecaptchaToken(recaptchaToken, 'register', 0.5);

      if (validation.degraded) {
        console.warn('⚠️ [MODE DÉGRADÉ] reCAPTCHA non validé côté serveur:', validation.error);
        setRecaptchaDegraded(true);
        toast.warning('⚠️ Vérification anti-bot désactivée', {
          description: `La fonction serveur n'est pas configurée (${validation.error}). L'inscription fonctionne mais sans protection reCAPTCHA.`,
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

      // 🛡️ ÉTAPE 2 : Créer le compte Appwrite
      try {
        const currentSession = await account.getSession('current');
        if (currentSession) await account.deleteSession('current');
      } catch { /* Pas de session active */ }

      const newUserId = ID.unique();
      createdAccount = await account.create(newUserId, email, password, name);
      await account.createEmailPasswordSession(email, password);
      reset();

      const nameParts = name.trim().split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      const userPerms = [
        Permission.read(Role.user(createdAccount.$id)),
        Permission.update(Role.user(createdAccount.$id)),
        Permission.delete(Role.user(createdAccount.$id)),
      ];

      // 🛡️ ÉTAPE 3 : Créer le document users
      await databases.createDocument(
        DATABASE_ID,
        'users',
        createdAccount.$id,
        {
          userId: createdAccount.$id,
          firstName: firstName,
          lastName: lastName,
          email: email,
          companyName: isInvitation ? '' : companyName, // ✅ FIX : on garde le nom si ce n'est pas une invitation
          createdAt: new Date().toISOString(),
        },
        userPerms
      );
      createdDocs.push({ collection: 'users', id: createdAccount.$id });

      // 🛡️ ÉTAPE 4 : Stocker les données pending pour après vérification
      const pendingData = {
        email,
        name,
        companyName: isInvitation ? '' : companyName,
        isInvitation,
        membershipId: membershipIdParam,
        secret: secretParam,
        appwriteTeamId: appwriteTeamIdParam,
        customTeamId: customTeamIdParam,
        timestamp: Date.now(),
      };
      localStorage.setItem('relancepro_pending_registration', JSON.stringify(pendingData));

      // 🛡️ ÉTAPE 5 : Envoyer l'email de vérification
      const verifyUrl = `${window.location.origin}/confirm-email`;
      try {
        await account.createVerification(verifyUrl);
        console.log('📧 Email de vérification envoyé');
      } catch (verifyError: any) {
        console.warn('⚠️ Email de vérification non envoyé (SMTP non configuré ?):', verifyError);
        toast.warning('Email de vérification non envoyé', {
          description: 'Le SMTP n\'est peut-être pas configuré. Contactez le support.',
          duration: 8000,
        });
      }

      // 🛡️ ÉTAPE 6 : Rediriger vers la page d'attente de vérification
      toast.success('Compte créé !', {
        description: `Un email de vérification a été envoyé à ${email}`,
        duration: 5000,
      });

      const verifyParams = new URLSearchParams({ email });
      setTimeout(() => {
        navigate(`/verify-email?${verifyParams.toString()}`, { replace: true });
      }, 500);

    } catch (error: any) {
      console.error('Erreur inscription:', error);

      if (error instanceof AppwriteException) {
        if (error.code === 409) {
          try {
            await account.createEmailPasswordSession(email, password);
            reset();
            toast.success('Connexion réussie', {
              description: 'Votre compte existant a été utilisé.',
              duration: 3000,
            });
            setTimeout(() => {
              if (isInvitation) {
                const joinParams = new URLSearchParams();
                if (membershipIdParam) joinParams.set('membershipId', membershipIdParam);
                if (secretParam) joinParams.set('secret', secretParam);
                if (emailParam) joinParams.set('email', emailParam);
                if (nameParam) joinParams.set('name', nameParam);
                if (appwriteTeamIdParam) joinParams.set('appwriteTeamId', appwriteTeamIdParam);
                if (customTeamIdParam) joinParams.set('customTeamId', customTeamIdParam);
                window.location.href = `/join-team?${joinParams.toString()}`;
              } else {
                navigate('/dashboard', { replace: true });
              }
            }, 500);
            return;
          } catch (loginError: any) {
            toast.error('Compte existant', {
              description: 'Un compte existe déjà avec cet email. Veuillez vous connecter.',
              duration: 5000,
            });
            const loginParams = new URLSearchParams();
            if (email) loginParams.set('email', email);
            if (isInvitation) {
              if (membershipIdParam) loginParams.set('membershipId', membershipIdParam);
              if (secretParam) loginParams.set('secret', secretParam);
              if (nameParam) loginParams.set('name', nameParam);
              if (appwriteTeamIdParam) loginParams.set('appwriteTeamId', appwriteTeamIdParam);
              if (customTeamIdParam) loginParams.set('customTeamId', customTeamIdParam);
              loginParams.set('fromInvitation', 'true');
            }
            navigate(`/login?${loginParams.toString()}`, { replace: true });
            return;
          }
        }

        if (error.code === 400) {
          toast.error('Données invalides', { description: 'Vérifiez les informations saisies.' });
        } else if (error.code === 429) {
          toast.error('Trop de tentatives', { description: 'Veuillez réessayer dans quelques minutes.', duration: 5000 });
        } else {
          toast.error('Erreur d\'inscription', { description: error.message || 'Une erreur est survenue.' });
        }
      } else {
        toast.error('Erreur inattendue', { description: 'Vérifiez votre connexion internet et réessayez.' });
      }

      // 🛡️ Rollback en cas d'erreur
      for (const doc of createdDocs.reverse()) {
        try {
          await databases.deleteDocument(DATABASE_ID, doc.collection, doc.id);
        } catch (e) {
          console.warn(`Rollback échoué pour ${doc.collection}/${doc.id}:`, e);
        }
      }

      if (createdAccount) {
        try { await account.deleteSession('current'); } catch {}
        try { await account.delete(); } catch (e) { console.warn('Rollback compte échoué:', e); }
      }
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

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/30">
            {isInvitation ? <Users size={32} className="text-white" /> : <UserPlus size={32} className="text-white" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isInvitation ? 'Rejoindre une équipe' : 'Créer votre compte'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {isInvitation
              ? 'Créez votre compte pour accepter l\'invitation'
              : 'Vérifiez votre email pour activer votre espace'}
          </p>
        </div>

        {isInvitation && (
          <div className="mb-6 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Mail size={20} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-1">Vous avez été invité(e)</p>
                <p className="text-xs text-purple-700 dark:text-purple-300">Un administrateur vous a invité à rejoindre son équipe avec l'adresse :</p>
                <p className="text-sm font-mono font-bold text-purple-900 dark:text-purple-100 mt-2">{emailParam}</p>
              </div>
            </div>
          </div>
        )}

        {recaptchaDegraded && (
          <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Mode développement</p>
              <p className="text-xs mt-1">La vérification anti-bot serveur n'est pas configurée.</p>
            </div>
          </div>
        )}

        {isBlocked && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <Clock size={18} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Inscription temporairement bloquée</p>
              <p className="text-xs mt-1">Trop de tentatives. Réessayez dans <strong>{remainingTimeFormatted}</strong>.</p>
            </div>
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nom complet</label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jean Dupont"
                className="w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                required
                autoFocus={!isInvitation}
                disabled={loading || isBlocked}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className={`w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed ${
                  isInvitation ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed' : ''
                }`}
                required
                disabled={loading || isInvitation || isBlocked}
              />
            </div>
            {isInvitation && (
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1.5 flex items-center gap-1">🔒 Email verrouillé (invitation)</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Mot de passe</label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Minimum 8 caractères"
                className={`w-full pl-11 pr-4 py-3 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed ${
                  passwordError ? 'border-red-300 dark:border-red-700' : 'border-slate-300 dark:border-slate-600'
                }`}
                required
                minLength={8}
                disabled={loading || isBlocked}
                autoFocus={isInvitation}
              />
            </div>
            {passwordError && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> {passwordError}
              </p>
            )}
            {!passwordError && password.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-1 text-xs">
                  {password.length >= 8 ? <CheckCircle2 size={12} className="text-green-500" /> : <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />}
                  <span className={password.length >= 8 ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>8 caractères minimum</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {/[A-Z]/.test(password) ? <CheckCircle2 size={12} className="text-green-500" /> : <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />}
                  <span className={/[A-Z]/.test(password) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>Une majuscule</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {/[a-z]/.test(password) ? <CheckCircle2 size={12} className="text-green-500" /> : <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />}
                  <span className={/[a-z]/.test(password) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>Une minuscule</span>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  {/[0-9]/.test(password) ? <CheckCircle2 size={12} className="text-green-500" /> : <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />}
                  <span className={/[0-9]/.test(password) ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}>Un chiffre</span>
                </div>
              </div>
            )}
          </div>

          {!isInvitation && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Nom de votre entreprise</label>
              <div className="relative">
                <Building2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Mon Entreprise SARL"
                  className="w-full pl-11 pr-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 transition-shadow disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                  disabled={loading || isBlocked}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || isBlocked}
            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-purple-500/30"
          >
            {loading ? (
              <><Loader2 size={18} className="animate-spin" /><span>Création en cours...</span></>
            ) : isBlocked ? (
              <><Clock size={18} /><span>Réessayez dans {remainingTimeFormatted}</span></>
            ) : (
              <>{isInvitation ? <Users size={18} /> : <UserPlus size={18} />}<span>{isInvitation ? 'Créer mon compte et accepter l\'invitation' : 'Créer mon compte'}</span></>
            )}
          </button>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
            Ce site est protégé par reCAPTCHA v3.{' '}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener" className="underline">Politique de confidentialité Google</a>
            {' · '}
            <a href="https://policies.google.com/terms" target="_blank" rel="noopener" className="underline">Conditions d'utilisation</a>
          </p>

          {!isBlocked && remainingAttempts < 3 && !loading && (
            <div className="flex items-center justify-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <Shield size={12} />
              <span>{remainingAttempts} tentative(s) restante(s) avant blocage temporaire</span>
            </div>
          )}

          <div className="text-center pt-2">
            <Link
              to={isInvitation
                ? `/login?email=${encodeURIComponent(emailParam)}&membershipId=${encodeURIComponent(membershipIdParam)}&secret=${encodeURIComponent(secretParam)}&name=${encodeURIComponent(nameParam)}&appwriteTeamId=${encodeURIComponent(appwriteTeamIdParam)}&customTeamId=${encodeURIComponent(customTeamIdParam)}&fromInvitation=true`
                : '/login'}
              className="text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium"
            >
              {isInvitation ? 'J\'ai déjà un compte — Me connecter' : 'Déjà un compte ? Se connecter'}
            </Link>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
            <Shield size={12} /> Inscription sécurisée • Vérification email requise
          </p>
        </div>
      </div>
    </div>
  );
}