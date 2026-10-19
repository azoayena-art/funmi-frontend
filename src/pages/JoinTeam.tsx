import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { databases, account, functions, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { Query } from 'appwrite';
import { toast } from 'sonner';
import {
  Loader2, CheckCircle2, AlertCircle, Users, LogIn, UserPlus,
  LogOut, Clock, Shield, ShieldAlert
} from 'lucide-react';
import {
  consumeRateLimit,
  RATE_LIMITS,
} from '../services/rateLimitService';
import { useRateLimit } from '../hooks/useRateLimit';

const FUNCTION_ID = 'accept-invitation';
const INVITATION_EXPIRY_DAYS = 7;

const isValidAppwriteId = (value: string): boolean => {
  if (!value || value.length < 5 || value.length > 100) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const appwriteIdRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]{4,63}$/;
  return uuidRegex.test(value) || appwriteIdRegex.test(value);
};

const isValidEmail = (email: string): boolean => {
  if (!email || email.length > 254) return false;
  try {
    const decoded = decodeURIComponent(email);
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return re.test(decoded);
  } catch {
    return false;
  }
};

const isValidSecret = (secret: string): boolean => {
  if (!secret || secret.length < 8 || secret.length > 256) return false;
  const dangerousChars = /[<>'"`\\\/\s]/;
  if (dangerousChars.test(secret)) return false;
  return /^[\x21-\x7E]+$/.test(secret);
};

const sanitizeParam = (value: string | null, maxLength: number = 254): string => {
  if (!value) return '';
  try {
    const decoded = decodeURIComponent(value);
    return decoded.replace(/[<>]/g, '').trim().substring(0, maxLength);
  } catch {
    return value.replace(/[<>]/g, '').trim().substring(0, maxLength);
  }
};

export default function JoinTeam() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const {
    tryConsume: tryConsumeProcess,
    isBlocked: isBlockedForProcess,
    remainingTimeFormatted: processRemainingTime,
    remainingAttempts: processRemainingAttempts,
    reset: resetProcessLimit,
  } = useRateLimit({
    key: 'join_team_process',
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
  });

  const {
    isBlocked: isBlockedForFailed,
    remainingTimeFormatted: failedRemainingTime,
  } = useRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);

  const rawMembershipId = searchParams.get('membershipId') || '';
  const rawSecret = searchParams.get('secret') || '';
  const rawEmail = searchParams.get('email') || '';
  const rawName = searchParams.get('name') || '';
  const rawAppwriteTeamId = searchParams.get('appwriteTeamId') || '';
  const rawCustomTeamId = searchParams.get('customTeamId') || '';

  const membershipId = sanitizeParam(rawMembershipId, 64);
  const secret = sanitizeParam(rawSecret, 256);
  const email = sanitizeParam(rawEmail, 254).toLowerCase();
  const name = sanitizeParam(rawName, 100);
  const appwriteTeamId = sanitizeParam(rawAppwriteTeamId, 64);
  const customTeamId = sanitizeParam(rawCustomTeamId, 64);

  const hasValidMembershipId = isValidAppwriteId(membershipId);
  const hasValidSecret = isValidSecret(secret);
  const hasValidEmail = isValidEmail(email);
  const hasValidAppwriteTeamId = isValidAppwriteId(appwriteTeamId);
  const hasValidCustomTeamId = isValidAppwriteId(customTeamId);

  useEffect(() => {
    console.log('🔍 JoinTeam - Diagnostic des paramètres:', {
      membershipId: { raw: rawMembershipId, sanitized: membershipId, length: membershipId.length, valid: hasValidMembershipId },
      secret: { raw: rawSecret.substring(0, 10) + '...', sanitized: secret.substring(0, 10) + '...', length: secret.length, valid: hasValidSecret },
      email: { raw: rawEmail, sanitized: email, valid: hasValidEmail },
      appwriteTeamId: { raw: rawAppwriteTeamId, sanitized: appwriteTeamId, valid: hasValidAppwriteTeamId },
      customTeamId: { raw: rawCustomTeamId, sanitized: customTeamId, valid: hasValidCustomTeamId },
      isBlockedForFailed,
    });
  }, [rawMembershipId, rawSecret, rawEmail, rawAppwriteTeamId, rawCustomTeamId]);

  const isValidLink = hasValidMembershipId && hasValidSecret && hasValidEmail
    && hasValidAppwriteTeamId && hasValidCustomTeamId;

  const [status, setStatus] = useState<
    'auth_loading' | 'validating' | 'loading' | 'success' |
    'error' | 'not_found' | 'expired' | 'need_login' | 'email_mismatch' | 'invalid_link'
  >('auth_loading');

  const [errorMessage, setErrorMessage] = useState('');
  const [teamName, setTeamName] = useState('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [invalidDetails, setInvalidDetails] = useState<string[]>([]);

  const processedRef = useRef(false);

  // Filet de sécurité : détecte les sessions orphelines
  useEffect(() => {
    if (authLoading || user) return;
    
    let cancelled = false;
    (async () => {
      try {
        const realUser = await account.get();
        if (!cancelled && realUser) {
          console.log('🔄 Session Appwrite détectée mais contexte périmé → rechargement propre');
          window.location.reload();
        }
      } catch {
        // Pas de session réelle
      }
    })();

    return () => { cancelled = true; };
  }, [authLoading, user]);

  const validateLinkParams = (): { valid: boolean; reason?: string; details?: string[] } => {
    if (isBlockedForFailed) {
      return { valid: false, reason: 'rate_limited' };
    }

    const details: string[] = [];

    if (!membershipId) details.push('membershipId manquant');
    if (!secret) details.push('secret manquant');
    if (!email) details.push('email manquant');
    if (!appwriteTeamId) details.push('appwriteTeamId manquant');
    if (!customTeamId) details.push('customTeamId manquant');

    if (details.length > 0) {
      return { valid: false, reason: 'missing_params', details };
    }

    if (!hasValidMembershipId) details.push(`membershipId invalide (longueur: ${membershipId.length})`);
    if (!hasValidAppwriteTeamId) details.push(`appwriteTeamId invalide (longueur: ${appwriteTeamId.length})`);
    if (!hasValidCustomTeamId) details.push(`customTeamId invalide (longueur: ${customTeamId.length})`);
    if (!hasValidSecret) details.push(`secret invalide (longueur: ${secret.length})`);
    if (!hasValidEmail) details.push(`email invalide`);

    if (details.length > 0) {
      consumeRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
      return { valid: false, reason: 'invalid_format', details };
    }

    return { valid: true };
  };

  const processInvitation = useCallback(async () => {
    const rateCheck = tryConsumeProcess();
    if (!rateCheck.allowed) {
      setStatus('error');
      setErrorMessage(`Trop de tentatives. Veuillez réessayer dans ${rateCheck.remainingTimeFormatted}.`);
      return;
    }

    try {
      setStatus('loading');
      setAttemptCount(prev => prev + 1);

      const normalizedEmail = email.toLowerCase().trim();

      if (user?.email?.toLowerCase() !== normalizedEmail) {
        setStatus('email_mismatch');
        resetProcessLimit();
        return;
      }

      const invitations = await databases.listDocuments(DATABASE_ID, 'team_members', [
        Query.equal('membershipId', membershipId),
        Query.limit(1),
      ]);

      if (invitations.documents.length === 0) {
        setStatus('not_found');
        setErrorMessage('Cette invitation n\'existe pas ou a été supprimée.');
        return;
      }

      const invitation = invitations.documents[0] as any;

      if (invitation.teamId !== customTeamId) {
        setStatus('error');
        setErrorMessage('Violation de sécurité détectée. Veuillez contacter le support.');
        return;
      }

      if (invitation.userId === user?.$id && invitation.status === 'active') {
        toast.info('Invitation déjà acceptée', {
          description: 'Vous faites déjà partie de cette équipe.',
        });
        setStatus('success');
        setTeamName(invitation.teamName || 'votre équipe');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
        return;
      }

      if (invitation.userId && invitation.userId !== 'pending') {
        setStatus('error');
        setErrorMessage('Cette invitation a déjà été utilisée par un autre compte.');
        return;
      }

      if (invitation.invitationSecret !== secret) {
        setStatus('error');
        setErrorMessage('Le lien d\'invitation est invalide. Demandez un nouveau lien.');
        return;
      }

      if (invitation.invitedAt) {
        const invitedDate = new Date(invitation.invitedAt);
        const expiryDate = new Date(invitedDate.getTime() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        if (new Date() > expiryDate) {
          setStatus('expired');
          setErrorMessage(`Cette invitation a expiré le ${expiryDate.toLocaleDateString('fr-FR')}. Demandez un nouveau lien.`);
          return;
        }
      }

      try {
        const teamDoc = await databases.getDocument(DATABASE_ID, 'teams', customTeamId);
        setTeamName(teamDoc.name || 'votre équipe');
      } catch {
        setTeamName('votre équipe');
      }

      // ✅ APPEL FUNCTION avec debug détaillé
      const requestBody = JSON.stringify({
        membershipId,
        userId: user!.$id,
        customTeamId,
      });
      console.log('📤 Appel function accept-invitation:', requestBody);

            // ✅ Appel REST direct via client.call (contourne les bugs de signature du SDK)
            let funcResponse: any;
      try {
        funcResponse = await functions.createExecution(
          FUNCTION_ID,
          requestBody,          // ← position 2 = body (string JSON)
          false,                // ← position 3 = async (false = synchrone)
          '/',                  // ← position 4 = path
          'POST',               // ← position 5 = method
          { 'content-type': 'application/json' }  // ← position 6 = headers
          // PAS de position 7 (scheduledAt) → évite le bug précédent
        );
      } catch (execError: any) {
        console.error('❌ Erreur appel function:', execError);
        throw new Error(`Appel function échoué: ${execError.message}`);
      }

      // ✅ Debug détaillé de la réponse
      console.log('📥 Réponse function:', {
        $id: funcResponse.$id,
        status: funcResponse.status,
        responseStatusCode: funcResponse.responseStatusCode,
        responseBody: funcResponse.responseBody,
        errors: funcResponse.errors,
        logs: funcResponse.logs?.substring(0, 500),
      });

      if (funcResponse.status !== 'completed') {
        const details = [
          `Status: ${funcResponse.status}`,
          `HTTP Code: ${funcResponse.responseStatusCode || 'N/A'}`,
          `Errors: ${funcResponse.errors || 'aucune'}`,
          `Body: ${funcResponse.responseBody || 'vide'}`,
        ].join('\n');
        throw new Error(`Exécution échouée: ${funcResponse.status}\n\n${details}`);
      }

      let result: any = null;
      try {
        result = funcResponse.responseBody ? JSON.parse(funcResponse.responseBody) : null;
      } catch {
        throw new Error(`Réponse non-JSON: ${funcResponse.responseBody}`);
      }

      if (!result || !result.ok) {
        throw new Error(result?.message || 'Erreur lors du traitement de l\'invitation');
      }

      setStatus('success');
      resetProcessLimit();

      toast.success(`Bienvenue dans ${teamName} !`, {
        description: 'Vous avez rejoint l\'équipe avec succès.',
        duration: 5000,
      });

      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', 'unique()', {
          teamId: customTeamId,
          data: JSON.stringify({
            type: 'team_member_joined',
            userId: user?.$id,
            userEmail: user?.email,
            membershipId,
            eventDate: new Date().toISOString(),
            note: `Nouveau membre a rejoint l'équipe via invitation`
          })
        });
      } catch (auditErr) {
        console.warn('Audit log non critique:', auditErr);
      }

      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);

    } catch (err: any) {
      setStatus('error');
      const message = err.message || 'Erreur lors du traitement de l\'invitation.';
      setErrorMessage(message);
      processedRef.current = false;
      console.error('❌ Erreur processInvitation:', err);
    }
  }, [email, membershipId, secret, customTeamId, user, navigate, tryConsumeProcess, resetProcessLimit]);

  useEffect(() => {
    if (authLoading) {
      setStatus('auth_loading');
      return;
    }

    const validation = validateLinkParams();

    if (!validation.valid) {
      if (validation.reason === 'rate_limited') {
        setStatus('error');
        setErrorMessage(`Trop de tentatives. Réessayez dans ${failedRemainingTime}.`);
      } else if (validation.reason === 'missing_params') {
        setStatus('invalid_link');
        setErrorMessage('Lien d\'invitation incomplet. Demandez un nouveau lien.');
        setInvalidDetails(validation.details || []);
      } else {
        setStatus('invalid_link');
        setErrorMessage('Lien d\'invitation invalide. Demandez un nouveau lien à l\'administrateur.');
        setInvalidDetails(validation.details || []);
      }
      return;
    }

    if (!user) {
      setStatus('need_login');
      return;
    }

    if (processedRef.current) return;
    processedRef.current = true;

    processInvitation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const handleLogin = () => {
    const params = new URLSearchParams();
    if (email) params.set('email', email);
    if (membershipId) params.set('membershipId', membershipId);
    if (secret) params.set('secret', secret);
    if (name) params.set('name', name);
    if (appwriteTeamId) params.set('appwriteTeamId', appwriteTeamId);
    if (customTeamId) params.set('customTeamId', customTeamId);
    params.set('fromInvitation', 'true');
    navigate(`/login?${params.toString()}`);
  };

  const handleRegister = () => {
    const params = new URLSearchParams();
    if (email) params.set('email', email);
    if (name) params.set('name', name);
    if (membershipId) params.set('membershipId', membershipId);
    if (secret) params.set('secret', secret);
    if (appwriteTeamId) params.set('appwriteTeamId', appwriteTeamId);
    if (customTeamId) params.set('customTeamId', customTeamId);
    params.set('fromInvitation', 'true');
    navigate(`/register?${params.toString()}`);
  };

  const handleLogoutAndSwitch = async () => {
    try {
      await account.deleteSession('current');
      toast.success('Déconnecté avec succès');
    } catch {}
    finally {
      const params = new URLSearchParams();
      if (email) params.set('email', email);
      if (membershipId) params.set('membershipId', membershipId);
      if (secret) params.set('secret', secret);
      if (name) params.set('name', name);
      if (appwriteTeamId) params.set('appwriteTeamId', appwriteTeamId);
      if (customTeamId) params.set('customTeamId', customTeamId);
      params.set('fromInvitation', 'true');
      window.location.href = `/login?${params.toString()}`;
    }
  };

  const handleRetry = () => {
    processedRef.current = false;
    setErrorMessage('');
    setStatus('loading');
    processInvitation();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 mb-4">
            <Users size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Rejoindre une équipe
          </h1>
          {email && hasValidEmail && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-mono">{email}</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-6">

          {status === 'auth_loading' && (
            <div className="flex flex-col items-center py-8">
              <Loader2 size={40} className="text-purple-600 animate-spin mb-4" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Vérification de votre session...</p>
            </div>
          )}

          {status === 'validating' && (
            <div className="flex flex-col items-center py-8">
              <Loader2 size={40} className="text-purple-600 animate-spin mb-4" />
              <p className="text-sm text-slate-600 dark:text-slate-400">Validation du lien...</p>
            </div>
          )}

          {status === 'invalid_link' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
                <ShieldAlert size={32} className="text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Lien d'invitation invalide
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 whitespace-pre-line">
                {errorMessage}
              </p>

              {invalidDetails.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4 w-full text-left">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">
                    🔍 Problèmes détectés :
                  </p>
                  <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                    {invalidDetails.map((detail, idx) => (
                      <li key={idx}>{detail}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4 w-full text-left">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">💡 Vérifiez que :</p>
                <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
                  <li>Le lien n'a pas été modifié</li>
                  <li>Vous avez copié le lien complet</li>
                  <li>L'invitation est récente</li>
                </ul>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
              >
                Retour à la connexion
              </button>
            </div>
          )}

          {status === 'need_login' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
                <Users size={32} className="text-blue-600 dark:text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Invitation à rejoindre une équipe
              </h2>
              {name && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                  Bonjour <strong>{name}</strong> !
                </p>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
                Vous avez été invité(e) avec l'adresse<br />
                <strong className="text-purple-600 dark:text-purple-400">{email}</strong>
              </p>
              <div className="w-full space-y-3">
                <button
                  onClick={handleRegister}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <UserPlus size={16} />
                  Créer mon compte et accepter
                </button>
                <button
                  onClick={handleLogin}
                  className="w-full px-4 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <LogIn size={16} />
                  J'ai déjà un compte
                </button>
              </div>
            </div>
          )}

          {status === 'email_mismatch' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={32} className="text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                Mauvais compte connecté
              </h2>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6 w-full">
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                  Vous êtes actuellement connecté avec :
                </p>
                <p className="text-sm font-mono font-bold text-amber-900 dark:text-amber-100 mb-3 break-all">
                  {user?.email}
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                  Mais cette invitation est destinée à :
                </p>
                <p className="text-sm font-mono font-bold text-purple-700 dark:text-purple-300 break-all">
                  {email}
                </p>
              </div>
              <div className="w-full space-y-3">
                <button
                  onClick={handleLogoutAndSwitch}
                  className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <LogOut size={16} />
                  Se déconnecter et changer de compte
                </button>
                <button
                  onClick={() => navigate('/dashboard')}
                  className="w-full px-4 py-2.5 text-slate-500 dark:text-slate-400 text-sm hover:underline"
                >
                  Retour au tableau de bord
                </button>
              </div>
            </div>
          )}

          {status === 'loading' && (
            <div className="flex flex-col items-center py-8">
              <Loader2 size={40} className="text-purple-600 animate-spin mb-4" />
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Traitement de l'invitation...</p>
              {attemptCount > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Tentative {attemptCount} • {processRemainingAttempts} restante(s)
                </p>
              )}
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 size={32} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                Invitation acceptée !
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Vous avez rejoint <strong className="text-purple-600 dark:text-purple-400">{teamName}</strong>.
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-3">
                <Loader2 size={12} className="animate-spin" />
                <span>Redirection vers le tableau de bord...</span>
              </div>
            </div>
          )}

          {status === 'expired' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                <Clock size={32} className="text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Invitation expirée</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 whitespace-pre-line">{errorMessage}</p>
              <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mb-4 w-full">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  💡 Les invitations expirent après <strong>{INVITATION_EXPIRY_DAYS} jours</strong> pour des raisons de sécurité.
                  Demandez à l'administrateur de vous renvoyer une nouvelle invitation.
                </p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
              >
                Retour à la connexion
              </button>
            </div>
          )}

          {status === 'not_found' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={32} className="text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Invitation introuvable</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 whitespace-pre-line">{errorMessage}</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
              >
                Retour à la connexion
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-full flex items-center justify-center mb-4">
                <AlertCircle size={32} className="text-rose-600 dark:text-rose-400" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Une erreur est survenue</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 whitespace-pre-line">{errorMessage}</p>

              {isBlockedForProcess && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4 w-full">
                  <p className="text-xs text-red-700 dark:text-red-300">
                    <strong>Temporairement bloqué.</strong> Réessayez dans {processRemainingTime}.
                  </p>
                </div>
              )}

              <div className="flex gap-2 w-full">
                <button
                  onClick={() => navigate('/login')}
                  className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition-all"
                >
                  Connexion
                </button>
                <button
                  onClick={handleRetry}
                  disabled={isBlockedForProcess}
                  className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                >
                  Réessayer
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
            <Shield size={12} /> Invitation sécurisée • Protection anti-abus active
          </p>
          {processRemainingAttempts < 5 && status !== 'success' && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {processRemainingAttempts} tentative(s) restante(s) cette session
            </p>
          )}
        </div>
      </div>
    </div>
  );
}