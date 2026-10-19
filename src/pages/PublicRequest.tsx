import { useState, useEffect } from 'react';
import { Query, ID as AppwriteID } from 'appwrite';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { Building2, CheckCircle2, AlertCircle, Send, Briefcase, User, Shield, Phone, Mail, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  consumeRateLimit,
  RATE_LIMITS,
} from '../services/rateLimitService';
import { useRateLimit } from '../hooks/useRateLimit';

// ============================================================
// 📋 INTERFACES
// ============================================================

interface CompanySettings {
  $id: string;
  teamId: string;
  name: string;
  legalForm?: string;
  address?: string;
  phone?: string;
  publicSlug: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  needs: string;
  companyName: string;
  siren: string;
  siret: string;
  vatNumber: string;
}

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function PublicRequest() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [isProfessional, setIsProfessional] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  // ✅ Rate limiters pour les différentes actions
  const {
    isBlocked: isBlockedForFailed,
    remainingTimeFormatted: failedRemainingTime,
  } = useRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);

  // ✅ APRÈS : config inline
  const {
    tryConsume: tryConsumeSubmit,
    isBlocked: isBlockedForSubmit,
    remainingTimeFormatted: submitRemainingTime,
    remainingAttempts: submitRemainingAttempts,
  } = useRateLimit({
    key: 'public_request_submit',
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000,
  });

  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: '',
    needs: '',
    companyName: '',
    siren: '',
    siret: '',
    vatNumber: '',
  });
  const [rgpdAccepted, setRgpdAccepted] = useState(false);

  // ============================================================
  // ✅ VALIDATION DU FORMAT DU SLUG
  // ============================================================
  const isValidSlugFormat = (s: string): boolean => {
    // Alphanumérique + tirets, 3-64 caractères, pas de tiret au début/fin
    return /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/i.test(s);
  };

  // ============================================================
  // 📥 CHARGEMENT DE L'ENTREPRISE
  // ============================================================
  useEffect(() => {
    const fetchCompany = async () => {
      // ✅ Vérification rate limit des slugs invalides
      if (isBlockedForFailed) {
        setError(`Trop de tentatives. Réessayez dans ${failedRemainingTime}.`);
        setLoading(false);
        return;
      }

      // ✅ Validation du format du slug
      if (!slug || !isValidSlugFormat(slug)) {
        const failedCheck = consumeRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
        if (!failedCheck.allowed) {
          setError(`Trop de tentatives avec des liens invalides. Accès bloqué pour ${failedCheck.remainingTimeFormatted}.`);
        } else {
          setError('Lien invalide.');
        }
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const response = await databases.listDocuments(
          DATABASE_ID,
          'company_settings',
          [
            Query.equal('publicSlug', slug),
            Query.limit(1)
          ]
        );

        if (response.documents.length === 0) {
          // ✅ Incrémenter le compteur de slugs invalides
          const failedCheck = consumeRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
          if (!failedCheck.allowed) {
            setError(`Trop de tentatives avec des liens invalides. Accès bloqué pour ${failedCheck.remainingTimeFormatted}.`);
          } else {
            setError('Cette page de demande n\'existe pas ou a été supprimée.');
          }
          return;
        }

        const doc = response.documents[0] as unknown as CompanySettings;

        // ✅ Vérification de sécurité : teamId valide
        if (!doc.teamId) {
          console.error('Sécurité : company_settings sans teamId');
          setError('Configuration de l\'entreprise invalide.');
          return;
        }

        setCompany(doc);
      } catch (err: any) {
        console.error('Erreur chargement entreprise:', err);
        setError('Impossible de charger les informations de l\'entreprise.');
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [slug, isBlockedForFailed, failedRemainingTime]);

  // ============================================================
  // ✅ VALIDATION ROBUSTE DES CHAMPS
  // ============================================================

  const validateEmail = (email: string): boolean => {
    if (!email) return true;
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return re.test(email) && email.length <= 254;
  };

  const validatePhone = (phone: string): boolean => {
    const re = /^(?:(?:\+|00)33[\s.-]{0,3}(?:\(0\)[\s.-]{0,3})?|0)[1-9](?:[\s.-]?\d{2}){4}$/;
    return re.test(phone.replace(/\s/g, ''));
  };

  const validateSiren = (siren: string): boolean => {
    if (!siren) return true;
    return /^\d{9}$/.test(siren);
  };

  const validateSiret = (siret: string): boolean => {
    if (!siret) return true;
    return /^\d{14}$/.test(siret);
  };

  const validateVatNumber = (vatNumber: string): boolean => {
    if (!vatNumber) return true;
    return /^FR[0-9A-Z]{2}\d{9}$/.test(vatNumber.toUpperCase());
  };

  const validateField = (field: keyof FormData, value: string): string | null => {
    switch (field) {
      case 'firstName':
        return value.trim().length < 2 ? 'Le prénom doit contenir au moins 2 caractères.' : null;
      case 'lastName':
        return value.trim().length < 2 ? 'Le nom doit contenir au moins 2 caractères.' : null;
      case 'phone':
        return !validatePhone(value) ? 'Numéro de téléphone invalide.' : null;
      case 'email':
        return !validateEmail(value) ? 'Adresse email invalide.' : null;
      case 'companyName':
        if (isProfessional && !value.trim()) return 'La raison sociale est obligatoire pour les professionnels.';
        return null;
      case 'siren':
        return !validateSiren(value) ? 'Le SIREN doit contenir exactement 9 chiffres.' : null;
      case 'siret':
        return !validateSiret(value) ? 'Le SIRET doit contenir exactement 14 chiffres.' : null;
      case 'vatNumber':
        return !validateVatNumber(value) ? 'Le numéro de TVA doit être au format FR + 2 caractères + 9 chiffres.' : null;
      default:
        return null;
    }
  };

  const handleFieldChange = (field: keyof FormData, value: string) => {
    setForm({ ...form, [field]: value });
    const error = validateField(field, value);
    setFieldErrors({ ...fieldErrors, [field]: error || undefined });
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {};
    let hasErrors = false;

    if (!form.firstName.trim()) {
      errors.firstName = 'Le prénom est obligatoire.';
      hasErrors = true;
    }
    if (!form.lastName.trim()) {
      errors.lastName = 'Le nom est obligatoire.';
      hasErrors = true;
    }
    if (!form.phone.trim()) {
      errors.phone = 'Le téléphone est obligatoire.';
      hasErrors = true;
    } else if (!validatePhone(form.phone)) {
      errors.phone = 'Numéro de téléphone invalide.';
      hasErrors = true;
    }

    if (form.email && !validateEmail(form.email)) {
      errors.email = 'Adresse email invalide.';
      hasErrors = true;
    }

    if (isProfessional) {
      if (!form.companyName.trim()) {
        errors.companyName = 'La raison sociale est obligatoire pour les professionnels.';
        hasErrors = true;
      }
      if (form.siren && !validateSiren(form.siren)) {
        errors.siren = 'Le SIREN doit contenir exactement 9 chiffres.';
        hasErrors = true;
      }
      if (form.siret && !validateSiret(form.siret)) {
        errors.siret = 'Le SIRET doit contenir exactement 14 chiffres.';
        hasErrors = true;
      }
      if (form.vatNumber && !validateVatNumber(form.vatNumber)) {
        errors.vatNumber = 'Le numéro de TVA doit être au format FR + 2 caractères + 9 chiffres.';
        hasErrors = true;
      }
    }

    setFieldErrors(errors);
    return !hasErrors;
  };

  // ============================================================
  // 📤 SOUMISSION DU FORMULAIRE
  // ============================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Rate limit soumission
    const rateCheck = tryConsumeSubmit();
    if (!rateCheck.allowed) {
      toast.error('Trop de demandes', {
        description: `Veuillez patienter ${rateCheck.remainingTimeFormatted} avant de soumettre à nouveau.`,
        duration: 5000,
      });
      return;
    }

    if (!rgpdAccepted) {
      toast.error('Consentement requis', {
        description: 'Vous devez accepter les conditions pour être recontacté.',
      });
      return;
    }

    if (!validateForm()) {
      toast.error('Formulaire invalide', {
        description: 'Veuillez corriger les erreurs dans le formulaire.',
      });
      return;
    }

    if (!company || !company.teamId) {
      toast.error('Configuration invalide', {
        description: 'L\'entreprise n\'est pas correctement configurée.',
      });
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let existingProspect = null;

      // ✅ Recherche de doublons optimisée
      if (form.email || form.phone) {
        try {
          const queries = [];
          if (form.email) queries.push(Query.equal('email', form.email.toLowerCase().trim()));
          if (form.phone) queries.push(Query.equal('phone', form.phone.replace(/\s/g, '')));

          if (queries.length > 0) {
            const response = await databases.listDocuments(DATABASE_ID, 'prospects', [
              Query.equal('teamId', company.teamId),
              Query.or(queries),
              Query.limit(5)
            ]);

            existingProspect = response.documents.find((p: any) =>
              (form.email && p.email === form.email.toLowerCase().trim()) ||
              (form.phone && p.phone === form.phone.replace(/\s/g, ''))
            );

            // ✅ Vérification de sécurité multi-tenant
            if (existingProspect && existingProspect.teamId !== company.teamId) {
              console.warn('⚠️ Tentative de mise à jour inter-tenant bloquée');
              existingProspect = null;
            }
          }
        } catch (checkErr) {
          console.warn('⚠️ Vérification des doublons ignorée:', checkErr);
        }
      }

      // ✅ Données e-facturation
      const professionalData = isProfessional ? {
        companyName: form.companyName,
        siren: form.siren,
        siret: form.siret,
        vatNumber: form.vatNumber.toUpperCase(),
        country: 'FR',
      } : {
        companyName: '',
        siren: '',
        siret: '',
        vatNumber: '',
        country: 'FR',
      };

      if (existingProspect) {
        // ✅ Mise à jour (permissions par défaut de la collection)
        const newData = {
          firstName: form.firstName.trim() || existingProspect.firstName,
          lastName: form.lastName.trim() || existingProspect.lastName,
          phone: form.phone.replace(/\s/g, '') || existingProspect.phone,
          email: form.email.toLowerCase().trim() || existingProspect.email,
          address: form.address.trim() || existingProspect.address,
          needs: form.needs
            ? `[${new Date().toLocaleDateString('fr-FR')}] ${form.needs.trim()}\n---\n${existingProspect.needs || ''}`
            : existingProspect.needs,
          source: 'website',
          status: 'new',
          teamId: company.teamId,
          ...(isProfessional && form.companyName ? professionalData : {}),
        };

        await databases.updateDocument(DATABASE_ID, 'prospects', existingProspect.$id, newData);
      } else {
        // ✅ Création (permissions par défaut de la collection)
        const newData = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.replace(/\s/g, ''),
          email: form.email.toLowerCase().trim(),
          address: form.address.trim(),
          needs: form.needs.trim(),
          source: 'website',
          status: 'new',
          teamId: company.teamId,
          ...professionalData,
        };

        await databases.createDocument(
          DATABASE_ID,
          'prospects',
          AppwriteID.unique(),
          newData
        );
      }

      // ✅ Log d'audit de la soumission (non bloquant)
      try {
        await databases.createDocument(DATABASE_ID, 'accounting_events', AppwriteID.unique(), {
          teamId: company.teamId,
          data: JSON.stringify({
            type: 'public_request_submitted',
            documentType: 'prospect',
            prospectName: `${form.firstName} ${form.lastName}`.trim(),
            isProfessional,
            companyName: isProfessional ? form.companyName : null,
            eventDate: new Date().toISOString(),
            userAgent: navigator.userAgent.substring(0, 200),
            note: existingProspect
              ? 'Demande publique reçue - prospect existant mis à jour'
              : 'Demande publique reçue - nouveau prospect créé',
          })
        });
      } catch (auditErr) {
        console.warn('Audit log non critique:', auditErr);
      }

      setSuccess(true);
      toast.success('Demande envoyée avec succès !', {
        description: `${company.name} vous recontactera prochainement.`,
        duration: 5000,
      });
    } catch (err: any) {
      console.error('❌ Erreur soumission:', err);
      const message = err.message || 'Une erreur est survenue lors de l\'envoi.';
      toast.error('Erreur de soumission', { description: message });
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-blue-600" />
          <div className="text-slate-500 dark:text-slate-400 text-sm">Chargement...</div>
        </div>
      </div>
    );
  }

  // ✅ Écran de blocage suite à abus
  if (isBlockedForFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 max-w-md text-center border border-red-200 dark:border-red-800">
          <ShieldAlert size={48} className="text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Accès temporairement bloqué
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Trop de tentatives avec des liens invalides ont été détectées.
          </p>
          <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
            Réessayez dans {failedRemainingTime}
          </p>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg text-center max-w-md border border-slate-200 dark:border-slate-700">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            {error?.includes('Trop de tentatives') ? 'Accès bloqué' : 'Lien invalide'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            {error || "Cette page de demande n'existe pas ou a été supprimée."}
          </p>
          <button onClick={() => navigate('/')} className="mt-6 text-blue-600 dark:text-blue-400 font-medium hover:underline">
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-lg text-center max-w-md border border-slate-200 dark:border-slate-700">
          <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Demande envoyée !</h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            Merci {form.firstName}{isProfessional && form.companyName ? ` de ${form.companyName}` : ''}.{' '}
            <strong>{company.name}</strong> a bien reçu votre demande et vous recontactera très prochainement au {form.phone}.
          </p>
          <button onClick={() => window.location.reload()} className="text-blue-600 dark:text-blue-400 font-medium hover:underline">
            Envoyer une autre demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="bg-blue-600 p-6 text-center text-white">
          <Building2 size={48} className="mx-auto mb-3 opacity-80" />
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <p className="text-blue-100 mt-1">{company.legalForm} • {company.address}</p>
          {company.phone && <p className="text-blue-100 text-sm mt-1">📞 {company.phone}</p>}
        </div>

        <div className="p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6 text-center">
            Demandez votre devis gratuit
          </h2>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {/* ✅ Alerte de rate limit actif */}
          {isBlockedForSubmit && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
              <Shield size={16} />
              <span>
                Trop de demandes envoyées. Veuillez patienter <strong>{submitRemainingTime}</strong> avant de soumettre à nouveau.
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Toggle Particulier / Professionnel */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-700 rounded-lg">
              <button
                type="button"
                onClick={() => setIsProfessional(false)}
                disabled={submitting}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all disabled:opacity-50 ${
                  !isProfessional
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <User size={16} />
                Particulier
              </button>
              <button
                type="button"
                onClick={() => setIsProfessional(true)}
                disabled={submitting}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all disabled:opacity-50 ${
                  isProfessional
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Briefcase size={16} />
                Professionnel
              </button>
            </div>

            {/* Champs entreprise (si professionnel) */}
            {isProfessional && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-2 text-xs text-blue-800 dark:text-blue-300">
                  <Shield size={14} className="flex-shrink-0 mt-0.5" />
                  <p>
                    <strong>Demande professionnelle :</strong> renseignez votre raison sociale.
                    Le SIREN/SIRET est <strong>recommandé</strong> pour accélérer le traitement
                    (obligatoire pour la facturation électronique B2B en France).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Raison sociale *
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={e => handleFieldChange('companyName', e.target.value)}
                    disabled={submitting}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 ${
                      fieldErrors.companyName
                        ? 'border-red-300 dark:border-red-700'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    placeholder="Ex : Dupont Plomberie SARL"
                  />
                  {fieldErrors.companyName && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.companyName}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      SIREN <span className="text-xs text-slate-400 font-normal">(9 chiffres)</span>
                    </label>
                    <input
                      type="text"
                      value={form.siren}
                      onChange={e => handleFieldChange('siren', e.target.value.replace(/\D/g, '').slice(0, 9))}
                      disabled={submitting}
                      maxLength={9}
                      className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono disabled:opacity-50 ${
                        fieldErrors.siren
                          ? 'border-red-300 dark:border-red-700'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                      placeholder="123456789"
                    />
                    {fieldErrors.siren && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.siren}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      SIRET <span className="text-xs text-slate-400 font-normal">(14 chiffres)</span>
                    </label>
                    <input
                      type="text"
                      value={form.siret}
                      onChange={e => handleFieldChange('siret', e.target.value.replace(/\D/g, '').slice(0, 14))}
                      disabled={submitting}
                      maxLength={14}
                      className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono disabled:opacity-50 ${
                        fieldErrors.siret
                          ? 'border-red-300 dark:border-red-700'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                      placeholder="12345678901234"
                    />
                    {fieldErrors.siret && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.siret}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    N° TVA intracommunautaire <span className="text-xs text-slate-400 font-normal">(optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={form.vatNumber}
                    onChange={e => handleFieldChange('vatNumber', e.target.value.toUpperCase())}
                    disabled={submitting}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono disabled:opacity-50 ${
                      fieldErrors.vatNumber
                        ? 'border-red-300 dark:border-red-700'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    placeholder="FR12345678901"
                  />
                  {fieldErrors.vatNumber && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.vatNumber}</p>
                  )}
                </div>
              </div>
            )}

            {/* Coordonnées du contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Prénom *</label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={e => handleFieldChange('firstName', e.target.value)}
                  disabled={submitting}
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 ${
                    fieldErrors.firstName
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                />
                {fieldErrors.firstName && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.firstName}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {isProfessional ? 'Nom du contact' : 'Nom'} *
                </label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={e => handleFieldChange('lastName', e.target.value)}
                  disabled={submitting}
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 ${
                    fieldErrors.lastName
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                />
                {fieldErrors.lastName && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.lastName}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Phone size={14} /> Téléphone *
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => handleFieldChange('phone', e.target.value)}
                disabled={submitting}
                className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 ${
                  fieldErrors.phone
                    ? 'border-red-300 dark:border-red-700'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                placeholder="06 12 34 56 78"
              />
              {fieldErrors.phone && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.phone}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Mail size={14} /> Email
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => handleFieldChange('email', e.target.value)}
                disabled={submitting}
                className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 ${
                  fieldErrors.email
                    ? 'border-red-300 dark:border-red-700'
                    : 'border-slate-300 dark:border-slate-600'
                }`}
                placeholder="votre@email.com"
              />
              {fieldErrors.email && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.email}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {isProfessional ? "Adresse de l'entreprise" : 'Adresse du chantier'} (optionnel)
              </label>
              <input
                type="text"
                value={form.address}
                onChange={e => handleFieldChange('address', e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Décrivez votre besoin
              </label>
              <textarea
                value={form.needs}
                onChange={e => handleFieldChange('needs', e.target.value)}
                disabled={submitting}
                rows={4}
                className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50"
                placeholder="Ex: Rénovation complète de la salle de bain, environ 5m²..."
              />
            </div>

            <div className="flex items-start gap-3 pt-2">
              <input
                type="checkbox"
                id="rgpd"
                checked={rgpdAccepted}
                onChange={e => setRgpdAccepted(e.target.checked)}
                disabled={submitting}
                className="mt-1 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-50"
              />
              <label htmlFor="rgpd" className="text-xs text-slate-600 dark:text-slate-400">
                J'accepte que mes données soient traitées par <strong>{company.name}</strong> afin d'être recontacté pour ma demande de devis, conformément à la politique de confidentialité. *
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting || isBlockedForSubmit}
              title={isBlockedForSubmit ? `Réessayez dans ${submitRemainingTime}` : `${submitRemainingAttempts} demande(s) restante(s) cette heure`}
              className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><Loader2 size={18} className="animate-spin" /> Envoi en cours...</>
              ) : isBlockedForSubmit ? (
                <>Bloqué - Réessayez dans {submitRemainingTime}</>
              ) : (
                <><Send size={18} /> Envoyer ma demande</>
              )}
            </button>

            {/* ✅ Compteur de demandes restantes */}
            {!isBlockedForSubmit && submitRemainingAttempts < 5 && (
              <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                ⚠️ {submitRemainingAttempts} demande(s) restante(s) cette heure
              </p>
            )}
          </form>
        </div>

        {/* ✅ Pied de page sécurité */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1">
            <Shield size={12} /> Formulaire sécurisé • Protection anti-spam active
          </p>
        </div>
      </div>
    </div>
  );
}