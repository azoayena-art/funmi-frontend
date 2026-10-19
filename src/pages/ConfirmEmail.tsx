// src/pages/ConfirmEmail.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, ArrowRight, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { account, databases, teams, DATABASE_ID } from '../appwrite';
import { ID, Permission, Role, AppwriteException } from 'appwrite';

const ADMIN_PERMISSIONS = [
  'dashboard',
  'prospects.view', 'prospects.create', 'prospects.edit', 'prospects.delete', 'prospects.convert',
  'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
  'products.view', 'products.create', 'products.edit', 'products.delete', 'products.import',
  'quotes.view', 'quotes.create', 'quotes.edit', 'quotes.delete', 'quotes.send', 'quotes.download', 'quotes.convert',
  'invoices.view', 'invoices.create', 'invoices.edit', 'invoices.delete',
  'invoices.mark_paid', 'invoices.download', 'invoices.credit', 'invoices.reconcile', 'invoices.archive', 'invoices.einvoice',
  'received_invoices.view', 'received_invoices.import', 'received_invoices.download',
  'payments.view', 'payments.create', 'payments.export', 'payments.reconcile',
  'receipts.view', 'receipts.download', 'receipts.archive',
  'reminders.view', 'reminders.send', 'reminders.batch', 'reminders.history',
  'settings.view', 'settings.edit', 'settings.logo', 'settings.tva',
  'team.view', 'team.invite', 'team.manage_roles', 'team.remove_member', 'team.edit', 'team.members',
  'reports.view', 'reports.export', 'reports.audit',
  'billing.view', 'billing.manage',
];

const PENDING_KEY = 'relancepro_pending_registration';

type Status = 'loading' | 'success' | 'error';

export default function ConfirmEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // 🔧 EXTRACTION ROBUSTE DES PARAMÈTRES
  const extractParams = () => {
    const userId = searchParams.get('userId');
    const secret = searchParams.get('secret');
    
    if (userId && secret) {
      return { userId, secret };
    }

    const url = window.location.href;
    const match = url.match(/[?&]userId=([^&]+).*?[?&]secret=([^&]+)/);
    if (match) {
      return { 
        userId: decodeURIComponent(match[1]), 
        secret: decodeURIComponent(match[2]) 
      };
    }

    if (window.location.hash) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const hashUserId = hashParams.get('userId');
      const hashSecret = hashParams.get('secret');
      if (hashUserId && hashSecret) {
        return { userId: hashUserId, secret: hashSecret };
      }
    }

    return { userId: null, secret: null };
  };

  const { userId, secret } = extractParams();

  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // 🔍 DEBUG : Afficher les paramètres dans la console
  useEffect(() => {
    console.log('🔍 ConfirmEmail - URL complète:', window.location.href);
    console.log('🔍 ConfirmEmail - userId:', userId);
    console.log(' ConfirmEmail - secret:', secret ? `${secret.substring(0, 10)}...` : 'null');
    console.log('🔍 ConfirmEmail - searchParams:', searchParams.toString());
  }, [userId, secret, searchParams]);

  // ============================================================
  // 🔄 TRAITEMENT AUTOMATIQUE AU MONTAGE
  // ============================================================
  useEffect(() => {
    const processVerification = async () => {
      // ✅ Vérifier les paramètres
      if (!userId || !secret) {
        console.error('❌ Paramètres manquants dans l\'URL');
        console.error('URL actuelle:', window.location.href);
        setErrorMessage('Lien invalide : paramètres manquants. Veuillez demander un nouveau lien.');
        setStatus('error');
        return;
      }

      try {
        // 🛡️ ÉTAPE 1 : Confirmer la vérification auprès d'Appwrite
        console.log('🔄 Appel account.updateVerification...');
        await account.updateVerification(userId, secret);
        console.log('✅ Email confirmé auprès d\'Appwrite');

        // 🛡️ ÉTAPE 2 : Récupérer l'utilisateur
        const user = await account.get();
        console.log('✅ Utilisateur récupéré:', user.email);

        // 🛡️ ÉTAPE 3 : Lire les données d'inscription en attente
        let pendingData: any = null;
        try {
          const raw = localStorage.getItem(PENDING_KEY);
          if (raw) pendingData = JSON.parse(raw);
        } catch {
          console.warn('⚠️ Pas de données pending trouvées');
        }

        // 🛡️ ÉTAPE 4 : Créer l'équipe si nécessaire (pas en mode invitation)
        if (pendingData && !pendingData.isInvitation && pendingData.companyName) {
          await createTeamAndWorkspace(user.$id, pendingData);
        }

        // ✅ Nettoyer les données pending
        localStorage.removeItem(PENDING_KEY);

        setStatus('success');
        toast.success('Email vérifié !', {
          description: 'Votre compte est maintenant actif.',
          duration: 3000,
        });

        // 🛡️ ÉTAPE 5 : Rediriger AVEC RECHARGEMENT COMPLET
        setTimeout(() => {
          if (pendingData?.isInvitation) {
            const joinParams = new URLSearchParams();
            if (pendingData.membershipId) joinParams.set('membershipId', pendingData.membershipId);
            if (pendingData.secret) joinParams.set('secret', pendingData.secret);
            if (pendingData.email) joinParams.set('email', pendingData.email);
            if (pendingData.name) joinParams.set('name', pendingData.name);
            if (pendingData.appwriteTeamId) joinParams.set('appwriteTeamId', pendingData.appwriteTeamId);
            if (pendingData.customTeamId) joinParams.set('customTeamId', pendingData.customTeamId);
            window.location.href = `/join-team?${joinParams.toString()}`;
          } else {
            // ✅ RECHARGEMENT COMPLET pour forcer AuthContext à relire la session
            console.log(' Redirection vers dashboard avec rechargement complet');
            window.location.href = '/dashboard';
          }
        }, 2000);
      } catch (err: any) {
        console.error(' Erreur confirmation email:', err);
        console.error('❌ Code erreur:', err.code);
        console.error('❌ Message erreur:', err.message);

        if (err instanceof AppwriteException) {
          switch (err.code) {
            case 401:
              setErrorMessage('Lien expiré ou invalide. Demandez un nouveau lien depuis votre boîte mail.');
              break;
            case 404:
              setErrorMessage('Ce lien de vérification n\'est plus valide.');
              break;
            default:
              setErrorMessage(err.message || 'Une erreur est survenue.');
          }
        } else {
          setErrorMessage('Erreur inattendue. Réessayez.');
        }
        setStatus('error');
      }
    };

    processVerification();
  }, [userId, secret]);

  // ============================================================
  //  CRÉATION DE L'ÉQUIPE ET DES DOCUMENTS ASSOCIÉS
  // ============================================================
  const createTeamAndWorkspace = async (userId: string, pendingData: any) => {
    const companyName = pendingData.companyName;
    const userPerms = [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
    ];

    try {
      await databases.updateDocument(DATABASE_ID, 'users', userId, {
        companyName: companyName,
      }, userPerms);
    } catch (e) {
      console.warn('⚠️ Mise à jour users échouée:', e);
    }

    const nativeTeam = await teams.create(ID.unique(), companyName);
    const appwriteTeamId = nativeTeam.$id;

    const teamPerms = [
      Permission.read(Role.user(userId)),
      Permission.update(Role.user(userId)),
      Permission.delete(Role.user(userId)),
      Permission.read(Role.team(appwriteTeamId)),
      Permission.update(Role.team(appwriteTeamId)),
      Permission.delete(Role.team(appwriteTeamId)),
    ];

    const teamDoc = await databases.createDocument(
      DATABASE_ID,
      'teams',
      ID.unique(),
      {
        ownerId: userId,
        name: companyName,
        appwriteTeamId: appwriteTeamId,
        createdAt: new Date().toISOString(),
      },
      teamPerms
    );
    const teamId = teamDoc.$id;

    const rolePerms = [
      Permission.read(Role.team(appwriteTeamId)),
      Permission.update(Role.team(appwriteTeamId)),
      Permission.delete(Role.team(appwriteTeamId)),
    ];

    const adminRole = await databases.createDocument(
      DATABASE_ID,
      'roles',
      ID.unique(),
      {
        name: 'Administrateur',
        teamId: teamId,
        permissions: JSON.stringify(ADMIN_PERMISSIONS),
        isDefault: true,
        createdAt: new Date().toISOString(),
      },
      rolePerms
    );

    await databases.createDocument(
      DATABASE_ID,
      'team_members',
      ID.unique(),
      {
        userId: userId,
        teamId: teamId,
        roleId: adminRole.$id,
        email: pendingData.email,
        name: pendingData.name,
        status: 'active',
        joinedAt: new Date().toISOString(),
        invitedBy: userId,
      },
      rolePerms
    );

    // ✅ CRÉATION DES PARAMÈTRES ENTREPRISE AVEC GESTION currencyConfig
    try {
      const settingsData: any = {
        userId: userId,
        teamId: teamId,
        name: companyName,
        currency: 'EUR',
        defaultTvaRate: '20',
        createdAt: new Date().toISOString(),
      };

      // Essayer d'abord avec currencyConfig
      try {
        await databases.createDocument(
          DATABASE_ID,
          'company_settings',
          ID.unique(),
          {
            ...settingsData,
            currencyConfig: JSON.stringify({ symbol: '€', code: 'EUR' }),
          },
          rolePerms
        );
        console.log('✅ Paramètres entreprise créés avec currencyConfig');
      } catch (configError: any) {
        // Si currencyConfig n'existe pas, créer sans
        if (configError.message?.includes('currencyConfig') || configError.message?.includes('Unknown attribute')) {
          console.warn('⚠️ currencyConfig non supporté, création sans...');
          await databases.createDocument(
            DATABASE_ID,
            'company_settings',
            ID.unique(),
            settingsData,
            rolePerms
          );
          console.log('✅ Paramètres entreprise créés (sans currencyConfig)');
        } else {
          throw configError;
        }
      }
    } catch (e) {
      console.warn('️ Paramètres entreprise non créés:', e);
    }

    console.log('✅ Équipe et workspace créés avec succès');
  };

  // ============================================================
  // 🎨 RENDU : CHARGEMENT
  // ============================================================
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-purple-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-700 dark:text-slate-300 font-medium">
            Confirmation de votre email en cours...
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Cela ne prend que quelques secondes.
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // 🎨 RENDU : ERREUR
  // ============================================================
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-red-500/30">
              <XCircle size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Vérification échouée
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex items-center justify-center gap-2">
              <AlertCircle size={16} className="text-red-500" />
              {errorMessage}
            </p>

            <div className="flex flex-col gap-2">
              <Link
                to="/login"
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-sm font-semibold hover:from-purple-700 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
              >
                Retour à la connexion
                <ArrowRight size={16} />
              </Link>
              <button
                onClick={() => navigate('/forgot-password', { replace: true })}
                className="w-full py-2.5 px-4 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                Mot de passe oublié ?
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // 🎨 RENDU : SUCCÈS
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 sm:p-8 animate-fadeIn">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
            <CheckCircle2 size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Email vérifié !
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Votre compte est maintenant actif.<br />
            Redirection vers votre espace...
          </p>

          <div className="flex items-center justify-center gap-2 text-sm text-purple-600 dark:text-purple-400">
            <Loader2 size={16} className="animate-spin" />
            <span>Chargement...</span>
          </div>
        </div>
      </div>
    </div>
  );
}