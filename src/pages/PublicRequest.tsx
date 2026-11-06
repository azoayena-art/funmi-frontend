import { useState, useEffect, useRef } from 'react';
import { Query, ID as AppwriteID } from 'appwrite';
import { useParams, useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import {
  Building2, CheckCircle2, AlertCircle, Send, Briefcase, User, Shield,
  Phone, Mail, Loader2, ShieldAlert, Globe, Sparkles, Lock, Clock,
  FileCheck, Hash, BadgeCheck
} from 'lucide-react';
import { toast } from 'sonner';
import {
  consumeRateLimit,
  RATE_LIMITS,
} from '../services/rateLimitService';
import { useRateLimit } from '../hooks/useRateLimit';
import {
  listCountryOptions,
  getCountryConfig,
  getPrimaryIdentifier,
} from '../config/countries';

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
  email?: string;
  country?: string;
  publicSlug: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  country: string;
  needs: string;
  companyName: string;
  registrationId: string;
  secondaryId: string;
  vatNumber: string;
  honeypot: string;
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
  
  const pageLoadTimeRef = useRef<number>(Date.now());
  const MIN_SUBMIT_DELAY_MS = 3000;

  const {
    isBlocked: isBlockedForFailed,
    remainingTimeFormatted: failedRemainingTime,
  } = useRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);

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
    postalCode: '',
    city: '',
    country: '',
    needs: '',
    companyName: '',
    registrationId: '',
    secondaryId: '',
    vatNumber: '',
    honeypot: '',
  });
  const [rgpdAccepted, setRgpdAccepted] = useState(false);

  const countryOptions = listCountryOptions();

  const isValidSlugFormat = (s: string): boolean => {
    return /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/i.test(s);
  };

  const sanitize = (value: string): string => {
    return value
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim()
      .substring(0, 500);
  };

  // ============================================================
  // 📥 CHARGEMENT DE L'ENTREPRISE
  // ============================================================
  useEffect(() => {
    const fetchCompany = async () => {
      if (isBlockedForFailed) {
        setError(`Trop de tentatives. Réessayez dans ${failedRemainingTime}.`);
        setLoading(false);
        return;
      }

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
          const failedCheck = consumeRateLimit(RATE_LIMITS.TOKEN_ACCESS_FAILED);
          if (!failedCheck.allowed) {
            setError(`Trop de tentatives avec des liens invalides. Accès bloqué pour ${failedCheck.remainingTimeFormatted}.`);
          } else {
            setError('Cette page de demande n\'existe pas ou a été supprimée.');
          }
          return;
        }

        const doc = response.documents[0] as unknown as CompanySettings;

        if (!doc.teamId) {
          console.error('Sécurité : company_settings sans teamId');
          setError('Configuration de l\'entreprise invalide.');
          return;
        }

        setCompany(doc);
        setForm(prev => ({ ...prev, country: doc.country || '' }));
        pageLoadTimeRef.current = Date.now();
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
  // 🌍 CONFIGURATION PAYS DYNAMIQUE
  // ============================================================
  const countryConfig = getCountryConfig(form.country);
  const primaryIdentifier = getPrimaryIdentifier(countryConfig);
  const hasVatSystem = countryConfig.vat.enabled;
  const showFiscalSection = isProfessional && form.country && countryConfig.code !== 'XX';

  // ============================================================
  // ✅ VALIDATION
  // ============================================================

  const validateEmail = (email: string): boolean => {
    if (!email) return true;
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return re.test(email) && email.length <= 254;
  };

  const validatePhone = (phone: string): boolean => {
    if (!phone) return false;
    const re = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/;
    return re.test(phone.replace(/\s/g, '')) && phone.replace(/\D/g, '').length >= 8;
  };

  const validateRegistrationId = (value: string): boolean => {
    if (!value) return true;
    if (!primaryIdentifier.pattern) return value.trim().length > 0;
    return primaryIdentifier.pattern.test(value.trim());
  };

  const validateSecondaryId = (value: string): boolean => {
    if (!value) return true;
    const secondary = countryConfig.identifiers.find(i => !i.requiredForVat);
    if (!secondary?.pattern) return value.trim().length > 0;
    return secondary.pattern.test(value.trim());
  };

  const validateVatNumber = (vatNumber: string): boolean => {
    if (!vatNumber) return true;
    if (!countryConfig.vat.pattern) return vatNumber.trim().length > 0;
    const clean = vatNumber.replace(/\s/g, '').toUpperCase();
    const withPrefix = countryConfig.vat.prefix && !clean.startsWith(countryConfig.vat.prefix)
      ? `${countryConfig.vat.prefix}${clean}`
      : clean;
    return countryConfig.vat.pattern.test(withPrefix);
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
      case 'country':
        return !value ? 'Veuillez sélectionner un pays.' : null;
      case 'companyName':
        if (isProfessional && !value.trim()) return 'La raison sociale est obligatoire pour les professionnels.';
        return null;
      case 'registrationId':
        if (value && !validateRegistrationId(value)) {
          return `Format invalide pour ${primaryIdentifier.shortLabel}.`;
        }
        return null;
      case 'secondaryId':
        if (value && !validateSecondaryId(value)) return 'Format invalide.';
        return null;
      case 'vatNumber':
        if (value && !validateVatNumber(value)) return 'Numéro de TVA invalide.';
        return null;
      case 'honeypot':
        return value ? 'Erreur de validation.' : null;
      default:
        return null;
    }
  };

  const handleFieldChange = (field: keyof FormData, value: string) => {
    const sanitized = sanitize(value);
    setForm({ ...form, [field]: sanitized });
    const error = validateField(field, sanitized);
    setFieldErrors({ ...fieldErrors, [field]: error || undefined });
  };

  const handleCountryChange = (newCountry: string) => {
    setForm({
      ...form,
      country: newCountry,
      registrationId: '',
      secondaryId: '',
      vatNumber: '',
    });
    setFieldErrors({
      ...fieldErrors,
      country: undefined,
      registrationId: undefined,
      secondaryId: undefined,
      vatNumber: undefined,
    });
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {};
    let hasErrors = false;

    if (form.honeypot) {
      console.warn('🤖 Bot détecté via honeypot');
      toast.error('Erreur de validation', { description: 'Veuillez réessayer.' });
      return false;
    }

    const timeSinceLoad = Date.now() - pageLoadTimeRef.current;
    if (timeSinceLoad < MIN_SUBMIT_DELAY_MS) {
      toast.error('Soumission trop rapide', {
        description: 'Veuillez patienter quelques secondes avant de soumettre.',
      });
      return false;
    }

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
    if (!form.country) {
      errors.country = 'Veuillez sélectionner un pays.';
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
      if (form.registrationId && !validateRegistrationId(form.registrationId)) {
        errors.registrationId = `Format invalide pour ${primaryIdentifier.shortLabel}.`;
        hasErrors = true;
      }
      if (form.secondaryId && !validateSecondaryId(form.secondaryId)) {
        errors.secondaryId = 'Format invalide.';
        hasErrors = true;
      }
      if (form.vatNumber && !validateVatNumber(form.vatNumber)) {
        errors.vatNumber = 'Numéro de TVA invalide.';
        hasErrors = true;
      }
    }

    setFieldErrors(errors);
    return !hasErrors;
  };

  // ============================================================
  // 📤 SOUMISSION
  // ============================================================
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.honeypot) {
      console.warn('🤖 Bot détecté');
      return;
    }

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

    if (!slug || slug !== company.publicSlug) {
      toast.error('Erreur de sécurité', {
        description: 'Session expirée, veuillez recharger la page.',
      });
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      let existingProspect = null;

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

            if (existingProspect && existingProspect.teamId !== company.teamId) {
              console.warn('⚠️ Tentative de mise à jour inter-tenant bloquée');
              existingProspect = null;
            }
          }
        } catch (checkErr) {
          console.warn('⚠️ Vérification des doublons ignorée:', checkErr);
        }
      }

      const formattedVatNumber = form.vatNumber && countryConfig.vat.prefix
        ? (form.vatNumber.toUpperCase().startsWith(countryConfig.vat.prefix)
          ? form.vatNumber.toUpperCase()
          : `${countryConfig.vat.prefix}${form.vatNumber.toUpperCase()}`)
        : form.vatNumber.toUpperCase();

      // ✅ MAPPING VERS LES CHAMPS EXISTANTS DE LA COLLECTION 'prospects'
      // - siren : stocke l'identifiant principal (SIREN, NINEA, ICE, NIU, NIF...)
      // - siret : stocke l'identifiant secondaire (SIRET, RCCM, RC...)
      // - vatNumber : stocke le numéro de TVA formaté
      const professionalData = isProfessional ? {
        companyName: form.companyName,
        country: form.country,
        siren: form.registrationId || '',   // Identifiant principal du pays
        siret: form.secondaryId || '',       // Identifiant secondaire du pays
        vatNumber: formattedVatNumber || '',
      } : {
        companyName: '',
        country: form.country,
        siren: '',
        siret: '',
        vatNumber: '',
      };

      const formattedAddress = [form.address, form.postalCode, form.city]
        .filter(Boolean)
        .join(', ');

      if (existingProspect) {
        const newData = {
          firstName: form.firstName.trim() || existingProspect.firstName,
          lastName: form.lastName.trim() || existingProspect.lastName,
          phone: form.phone.replace(/\s/g, '') || existingProspect.phone,
          email: form.email.toLowerCase().trim() || existingProspect.email,
          address: formattedAddress || existingProspect.address,
          country: form.country || existingProspect.country,
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
        const newData = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.replace(/\s/g, ''),
          email: form.email.toLowerCase().trim(),
          address: formattedAddress,
          country: form.country,
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

      try {
        await databases.createDocument(DATABASE_ID, 'audit_logs', AppwriteID.unique(), {
          teamId: company.teamId,
          userId: 'public_visitor',
          action: 'public_request_submitted',
          resourceType: 'prospect',
          resourceId: existingProspect?.$id || 'new',
          severity: 'info',
          details: JSON.stringify({
            prospectName: `${form.firstName} ${form.lastName}`.trim(),
            isProfessional,
            country: form.country,
            companyName: isProfessional ? form.companyName : null,
            eventDate: new Date().toISOString(),
            userAgent: navigator.userAgent.substring(0, 200),
            note: existingProspect
              ? 'Demande publique - prospect existant mis à jour'
              : 'Demande publique - nouveau prospect créé',
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur-xl opacity-30 animate-pulse"></div>
            <Loader2 size={40} className="animate-spin text-blue-600 relative" />
          </div>
          <div className="text-slate-600 dark:text-slate-400 text-sm font-medium">
            Chargement de la page...
          </div>
        </div>
      </div>
    );
  }

  if (isBlockedForFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 dark:from-slate-950 dark:to-red-950 p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 max-w-md text-center border border-red-200 dark:border-red-800">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30">
            <ShieldAlert size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Accès temporairement bloqué
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Trop de tentatives avec des liens invalides ont été détectées.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <Clock size={16} className="text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
              Réessayez dans {failedRemainingTime}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl text-center max-w-md border border-slate-200 dark:border-slate-700">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30">
            <AlertCircle size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {error?.includes('Trop de tentatives') ? 'Accès bloqué' : 'Lien invalide'}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6">
            {error || "Cette page de demande n'existe pas ou a été supprimée."}
          </p>
          <button 
            onClick={() => navigate('/')} 
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:shadow-lg transition-all"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-emerald-950/20 dark:to-slate-900 p-4">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl text-center max-w-md border border-emerald-200 dark:border-emerald-800">
          <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce">
            <CheckCircle2 size={40} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Demande envoyée !
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            Merci <strong>{form.firstName}</strong>
            {isProfessional && form.companyName ? ` de ${form.companyName}` : ''}.{' '}
            <strong className="text-slate-900 dark:text-white">{company.name}</strong> a bien reçu votre demande et vous recontactera très prochainement au <strong className="tabular-nums">{form.phone}</strong>.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-medium rounded-lg hover:shadow-lg transition-all"
          >
            <Send size={16} />
            Envoyer une autre demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20 py-8 sm:py-12 px-4">
      <div className="max-w-2xl mx-auto">
        
        {/* Header entreprise premium */}
        <div className="relative overflow-hidden rounded-2xl shadow-2xl mb-6 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]"></div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.08),transparent_50%)]"></div>
          
          <div className="relative p-6 sm:p-8 text-center text-white">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl mb-4 ring-1 ring-white/20 shadow-lg">
              <Building2 size={32} className="text-white" />
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-sm rounded-full text-xs font-medium ring-1 ring-white/20 mb-3">
              <Sparkles size={12} />
              Page de demande officielle
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">{company.name}</h1>
            <div className="flex items-center justify-center gap-2 text-blue-100 text-sm mb-1">
              {company.legalForm && <span>{company.legalForm}</span>}
              {company.legalForm && company.address && <span>•</span>}
              {company.address && <span>{company.address}</span>}
            </div>
            {company.phone && (
              <div className="flex items-center justify-center gap-2 text-blue-100 text-sm mt-2">
                <Phone size={14} />
                <span className="tabular-nums">{company.phone}</span>
              </div>
            )}
            {company.country && (
              <div className="flex items-center justify-center gap-2 text-blue-100 text-sm mt-2">
                <Globe size={14} />
                <span>{getCountryConfig(company.country).flag} {getCountryConfig(company.country).name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Formulaire principal */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 rounded-full text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2">
                <FileCheck size={12} />
                Devis gratuit • Sans engagement
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                Demandez votre devis
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Remplissez le formulaire ci-dessous, nous vous recontactons rapidement.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
                <AlertCircle size={16} className="flex-shrink-0" /> 
                <span>{error}</span>
              </div>
            )}

            {isBlockedForSubmit && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 text-sm">
                <Shield size={16} className="flex-shrink-0" />
                <span>
                  Trop de demandes envoyées. Veuillez patienter <strong>{submitRemainingTime}</strong>.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* HONEYPOT */}
              <div className="hidden" aria-hidden="true">
                <input
                  type="text"
                  name="website_url"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.honeypot}
                  onChange={e => setForm({ ...form, honeypot: e.target.value })}
                />
              </div>

              {/* Toggle Particulier / Professionnel */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl">
                <button
                  type="button"
                  onClick={() => setIsProfessional(false)}
                  disabled={submitting}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
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
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                    isProfessional
                      ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Briefcase size={16} />
                  Professionnel
                </button>
              </div>

              {/* SECTION PROFESSIONNEL : Raison sociale */}
              {isProfessional && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Building2 size={14} className="text-blue-600 dark:text-blue-400" />
                    Raison sociale <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={e => handleFieldChange('companyName', e.target.value)}
                    disabled={submitting}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 transition-colors bg-white dark:bg-slate-800 ${
                      fieldErrors.companyName
                        ? 'border-red-300 dark:border-red-700'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    placeholder="Ex : Dupont SARL"
                  />
                  {fieldErrors.companyName && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.companyName}</p>
                  )}
                </div>
              )}

              {/* Coordonnées */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Prénom <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={e => handleFieldChange('firstName', e.target.value)}
                    disabled={submitting}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 bg-white dark:bg-slate-800 ${
                      fieldErrors.firstName
                        ? 'border-red-300 dark:border-red-700'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    placeholder="Jean"
                  />
                  {fieldErrors.firstName && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.firstName}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {isProfessional ? 'Nom du contact' : 'Nom'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={e => handleFieldChange('lastName', e.target.value)}
                    disabled={submitting}
                    className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 bg-white dark:bg-slate-800 ${
                      fieldErrors.lastName
                        ? 'border-red-300 dark:border-red-700'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                    placeholder="Dupont"
                  />
                  {fieldErrors.lastName && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.lastName}</p>
                  )}
                </div>
              </div>

              {/* CHAMP PAYS - VISIBLE POUR TOUS */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Globe size={14} className="text-blue-600 dark:text-blue-400" />
                  Pays <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.country}
                  onChange={e => handleCountryChange(e.target.value)}
                  disabled={submitting}
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 bg-white dark:bg-slate-800 ${
                    fieldErrors.country
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                >
                  <option value="">-- Sélectionner un pays --</option>
                  {countryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.country && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.country}</p>
                )}
                {company.country && form.country === company.country && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                    <Sparkles size={10} />
                    Pays par défaut : {getCountryConfig(company.country).flag} {getCountryConfig(company.country).name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Phone size={14} />
                  Téléphone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => handleFieldChange('phone', e.target.value)}
                  disabled={submitting}
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 bg-white dark:bg-slate-800 ${
                    fieldErrors.phone
                      ? 'border-red-300 dark:border-red-700'
                      : 'border-slate-300 dark:border-slate-600'
                  }`}
                  placeholder="+33 6 12 34 56 78"
                />
                {fieldErrors.phone && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.phone}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail size={14} />
                  Email <span className="text-xs text-slate-400 font-normal">(optionnel)</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => handleFieldChange('email', e.target.value)}
                  disabled={submitting}
                  className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 bg-white dark:bg-slate-800 ${
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

              {/* Adresse */}
              <div className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Building2 size={14} className="text-blue-600 dark:text-blue-400" />
                  {isProfessional ? "Adresse de l'entreprise" : 'Adresse du chantier'}
                  <span className="text-xs text-slate-400 font-normal">(optionnel)</span>
                </h4>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => handleFieldChange('address', e.target.value)}
                  disabled={submitting}
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 bg-white dark:bg-slate-800"
                  placeholder="123 rue de la Paix"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={form.postalCode}
                    onChange={e => handleFieldChange('postalCode', e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono disabled:opacity-50 bg-white dark:bg-slate-800"
                    placeholder="Code postal"
                  />
                  <input
                    type="text"
                    value={form.city}
                    onChange={e => handleFieldChange('city', e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 bg-white dark:bg-slate-800"
                    placeholder="Ville"
                  />
                </div>
              </div>

              {/* SECTION IDENTIFIANTS FISCAUX */}
              {showFiscalSection && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5 space-y-4">
                  <div className="flex items-start gap-2.5">
                    <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                      <Shield size={12} className="text-blue-600 dark:text-blue-400" />
                    </div>
                    <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed">
                      <strong>Identification fiscale</strong> pour {countryConfig.flag} <strong>{countryConfig.name}</strong> : 
                      ces informations accélèrent le traitement et sont requises pour la facturation électronique.
                    </p>
                  </div>

                  {/* Identifiant principal (stocké dans 'siren' en DB) */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                      <Hash size={14} />
                      {primaryIdentifier.label}
                      {primaryIdentifier.requiredForVat && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={form.registrationId}
                      onChange={e => handleFieldChange('registrationId', e.target.value)}
                      disabled={submitting}
                      className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono disabled:opacity-50 bg-white dark:bg-slate-800 ${
                        fieldErrors.registrationId
                          ? 'border-red-300 dark:border-red-700'
                          : 'border-slate-300 dark:border-slate-600'
                      }`}
                      placeholder={primaryIdentifier.example || primaryIdentifier.shortLabel}
                    />
                    {fieldErrors.registrationId && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.registrationId}</p>
                    )}
                    {primaryIdentifier.example && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Ex: {primaryIdentifier.example}
                      </p>
                    )}
                  </div>

                  {/* Identifiant secondaire (stocké dans 'siret' en DB) */}
                  {countryConfig.identifiers.length > 1 && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {countryConfig.identifiers[1].label}
                        <span className="text-xs text-slate-400 font-normal ml-1">(optionnel)</span>
                      </label>
                      <input
                        type="text"
                        value={form.secondaryId}
                        onChange={e => handleFieldChange('secondaryId', e.target.value)}
                        disabled={submitting}
                        className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono disabled:opacity-50 bg-white dark:bg-slate-800 ${
                          fieldErrors.secondaryId
                            ? 'border-red-300 dark:border-red-700'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                        placeholder={countryConfig.identifiers[1].example || countryConfig.identifiers[1].shortLabel}
                      />
                      {fieldErrors.secondaryId && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.secondaryId}</p>
                      )}
                    </div>
                  )}

                  {/* N° TVA (stocké dans 'vatNumber' en DB) */}
                  {hasVatSystem && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                        {countryConfig.vat.numberLabel}
                        <span className="text-xs text-slate-400 font-normal ml-1">(optionnel)</span>
                      </label>
                      <input
                        type="text"
                        value={form.vatNumber}
                        onChange={e => handleFieldChange('vatNumber', e.target.value.toUpperCase())}
                        disabled={submitting}
                        className={`w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono disabled:opacity-50 bg-white dark:bg-slate-800 ${
                          fieldErrors.vatNumber
                            ? 'border-red-300 dark:border-red-700'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                        placeholder={
                          countryConfig.vat.prefix 
                            ? `${countryConfig.vat.prefix}...` 
                            : 'Numéro de TVA'
                        }
                      />
                      {fieldErrors.vatNumber && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{fieldErrors.vatNumber}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Décrivez votre besoin
                </label>
                <textarea
                  value={form.needs}
                  onChange={e => handleFieldChange('needs', e.target.value)}
                  disabled={submitting}
                  rows={4}
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm disabled:opacity-50 bg-white dark:bg-slate-800 resize-none"
                  placeholder="Ex: Rénovation complète de la salle de bain, environ 5m²..."
                />
              </div>

              <div className="flex items-start gap-3 pt-2 bg-blue-50/50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <input
                  type="checkbox"
                  id="rgpd"
                  checked={rgpdAccepted}
                  onChange={e => setRgpdAccepted(e.target.checked)}
                  disabled={submitting}
                  className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-50"
                />
                <label htmlFor="rgpd" className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed cursor-pointer">
                  J'accepte que mes données soient traitées par <strong className="text-slate-900 dark:text-white">{company.name}</strong> afin d'être recontacté pour ma demande de devis, conformément à la politique de confidentialité. <span className="text-red-500">*</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting || isBlockedForSubmit || !rgpdAccepted}
                title={
                  isBlockedForSubmit 
                    ? `Réessayez dans ${submitRemainingTime}` 
                    : !rgpdAccepted
                    ? 'Veuillez accepter les conditions'
                    : `${submitRemainingAttempts} demande(s) restante(s) cette heure`
                }
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3.5 rounded-xl hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg hover:shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {submitting ? (
                  <><Loader2 size={18} className="animate-spin" /> Envoi en cours...</>
                ) : isBlockedForSubmit ? (
                  <>Bloqué - Réessayez dans {submitRemainingTime}</>
                ) : (
                  <><Send size={18} /> Envoyer ma demande</>
                )}
              </button>

              {!isBlockedForSubmit && submitRemainingAttempts < 5 && (
                <p className="text-xs text-center text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1.5">
                  <Clock size={12} />
                  {submitRemainingAttempts} demande(s) restante(s) cette heure
                </p>
              )}
            </form>
          </div>

          <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-blue-50/30 dark:from-slate-900/50 dark:to-blue-950/20 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Lock size={12} className="text-emerald-500" />
                <span>Chiffrement SSL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield size={12} className="text-blue-500" />
                <span>Anti-spam actif</span>
              </div>
              <div className="flex items-center gap-1.5">
                <BadgeCheck size={12} className="text-indigo-500" />
                <span>RGPD conforme</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-slate-400 dark:text-slate-500">
          <p>
            Propulsé par <span className="font-semibold">RelancePro</span> • 
            Page sécurisée pour <span className="font-semibold">{company.name}</span>
          </p>
        </div>
      </div>
    </div>
  );
}