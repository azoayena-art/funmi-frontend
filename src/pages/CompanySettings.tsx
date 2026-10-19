// src/pages/CompanySettings.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID, storage } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTeam } from '../context/TeamContext';
import { getFilePreviewUrl } from '../utils/storage';
import { toast } from 'sonner';
import Sidebar from '../components/Sidebar';
import Modal from '../components/ui/Modal';
import {
  PageHeader,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  Alert,
  Card,
  SectionTitle,
  Badge,
} from '../components/ui/SharedUI';
import {
  Building2, Save, AlertCircle, CheckCircle2, Upload, Image as ImageIcon,
  X, Copy, Lock, Plus, Trash2, Globe, Coins, FileText, Eye, Edit2, Target,
  Shield, Server, Zap, RefreshCw, Mail, MapPin, Hash, Home, Cookie
} from 'lucide-react';
import { ID, Query } from 'appwrite';
import { testEmailConfiguration, invalidateEmailConfigCache } from '../services/emailNotificationService';

// 🍪 GESTION DES COOKIES
import { useCookieConsent } from '../hooks/useCookieConsent';

// 🆕 REGISTRE INTERNATIONAL DES PAYS
import {
  COUNTRIES, FALLBACK_COUNTRY, getCountryConfig, getPrimaryIdentifier,
  validateIdentifier, listCountryOptions,
} from '../config/countries';

// ============================================================
// 🌍 CONFIGURATION DEVISES
// ============================================================

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  locale: string;
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  // Europe
  { code: 'EUR', symbol: '€', name: 'Euro (€)', locale: 'fr-FR' },
  { code: 'GBP', symbol: '£', name: 'Livre sterling (£)', locale: 'en-GB' },
  { code: 'CHF', symbol: 'CHF', name: 'Franc suisse (CHF)', locale: 'de-CH' },
  // Afrique — Zone CFA
  { code: 'XOF', symbol: 'FCFA', name: 'Franc CFA BCEAO (FCFA)', locale: 'fr-FR' },
  { code: 'XAF', symbol: 'FCFA', name: 'Franc CFA BEAC (FCFA)', locale: 'fr-FR' },
  // Afrique du Nord
  { code: 'MAD', symbol: 'DH', name: 'Dirham marocain (DH)', locale: 'fr-MA' },
  { code: 'TND', symbol: 'DT', name: 'Dinar tunisien (DT)', locale: 'ar-TN' },
  { code: 'DZD', symbol: 'DA', name: 'Dinar algérien (DA)', locale: 'ar-DZ' },
  // Autres pays africains
  { code: 'GNF', symbol: 'FG', name: 'Franc guinéen (FG)', locale: 'fr-FR' },
  { code: 'MGA', symbol: 'Ar', name: 'Ariary malgache (Ar)', locale: 'fr-FR' },
  { code: 'MUR', symbol: 'Rs', name: 'Roupie mauricienne (Rs)', locale: 'fr-FR' },
  // Amériques
  { code: 'USD', symbol: '$', name: 'Dollar US ($)', locale: 'en-US' },
  { code: 'CAD', symbol: '$CA', name: 'Dollar canadien ($CA)', locale: 'fr-CA' },
  { code: 'BRL', symbol: 'R$', name: 'Réal brésilien (R$)', locale: 'pt-BR' },
  { code: 'MXN', symbol: '$MX', name: 'Peso mexicain ($MX)', locale: 'es-MX' },
  // Asie
  { code: 'JPY', symbol: '¥', name: 'Yen japonais (¥)', locale: 'ja-JP' },
  { code: 'CNY', symbol: '¥', name: 'Yuan chinois (¥)', locale: 'zh-CN' },
  { code: 'INR', symbol: '₹', name: 'Roupie indienne (₹)', locale: 'hi-IN' },
  // Océanie & autres
  { code: 'AUD', symbol: '$AU', name: 'Dollar australien ($AU)', locale: 'en-AU' },
  { code: 'TRY', symbol: '₺', name: 'Livre turque (₺)', locale: 'tr-TR' },
  { code: 'PLN', symbol: 'zł', name: 'Zloty polonais (zł)', locale: 'pl-PL' },
  { code: 'SEK', symbol: 'kr', name: 'Couronne suédoise (kr)', locale: 'sv-SE' },
  { code: 'NOK', symbol: 'kr', name: 'Couronne norvégienne (kr)', locale: 'nb-NO' },
];

export const getCurrencyConfig = (code: string): Currency => {
  return SUPPORTED_CURRENCIES.find(c => c.code === code) || SUPPORTED_CURRENCIES[0];
};

export const formatMoney = (amount: number, currencyCode: string = 'EUR'): string => {
  const currency = getCurrencyConfig(currencyCode);
  try {
    return new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
      maximumFractionDigits: ['JPY', 'XOF', 'XAF', 'KRW', 'VND', 'GNF'].includes(currency.code) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency.symbol}`;
  }
};

// ============================================================
// ✅ VALIDATION SIRET (14 chiffres) — SPÉCIFIQUE FRANCE
// ============================================================

export const isValidSiret = (value: string): boolean => {
  const cleanValue = value.replace(/\s/g, '');
  if (!/^\d{14}$/.test(cleanValue)) return false;
  let sum = 0;
  let isEven = false;
  for (let i = cleanValue.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanValue.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
};

export const formatSiret = (value: string): string => {
  const clean = value.replace(/\D/g, '');
  if (clean.length === 14) return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4');
  return clean;
};

export const isValidFrenchVAT = (vat: string): boolean => {
  if (!vat) return false;
  const clean = vat.replace(/\s/g, '').toUpperCase();
  return /^FR[0-9A-Z]{2}\d{9}$/.test(clean);
};

const isValidEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// ============================================================
// 🏠 PARSER D'ADRESSE RÉTROACTIF
// ============================================================
const parseAddressRetroactive = (
  address: string | undefined,
  existingPostalCode?: string,
  existingCity?: string,
  existingCountry?: string
) => {
  if (existingPostalCode || existingCity) {
    return {
      address: address || '',
      postalCode: existingPostalCode || '',
      city: existingCity || '',
      country: existingCountry || 'FR'
    };
  }
  
  if (!address || !address.trim()) {
    return { address: '', postalCode: '', city: '', country: existingCountry || 'FR' };
  }
  
  const postalRegex = /\b(\d{5})\b/;
  const match = address.match(postalRegex);
  
  if (!match) {
    return { address, postalCode: '', city: '', country: existingCountry || 'FR' };
  }
  
  const postalCode = match[1];
  const postalIndex = match.index!;
  const line1 = address.substring(0, postalIndex).replace(/,\s*$/, '').trim();
  const afterPostal = address.substring(postalIndex + 5).trim();
  const city = afterPostal.replace(/^[,\s-]+/, '').replace(/[,\s-]+$/, '').trim();
  
  return {
    address: line1 || address,
    postalCode,
    city: city || '',
    country: existingCountry || 'FR'
  };
};

// ============================================================
// TVA & PAYS
// ============================================================

interface TvaRate {
  id: string;
  name: string;
  rate: number;
  country: string;
}

const DEFAULT_TVA_RATES: TvaRate[] = [
  { id: 'default-20', name: 'Taux normal', rate: 20, country: 'FR' },
  { id: 'default-10', name: 'Taux intermédiaire', rate: 10, country: 'FR' },
  { id: 'default-5.5', name: 'Taux réduit', rate: 5.5, country: 'FR' },
  { id: 'default-2.1', name: 'Taux super réduit', rate: 2.1, country: 'FR' },
  { id: 'default-0', name: 'Exonéré', rate: 0, country: 'FR' },
  // 🆕 Taux Afrique de l'Ouest (zone CFA)
  { id: 'default-sn-18', name: 'TVA Sénégal/UEMOA', rate: 18, country: 'SN' },
  // 🆕 Taux Afrique Centrale (zone CFA)
  { id: 'default-cm-19.25', name: 'TVA Cameroun/CEMAC', rate: 19.25, country: 'CM' },
  // 🆕 Taux Maghreb
  { id: 'default-ma-20', name: 'TVA Maroc', rate: 20, country: 'MA' },
  { id: 'default-tn-19', name: 'TVA Tunisie', rate: 19, country: 'TN' },
  { id: 'default-dz-19', name: 'TVA Algérie', rate: 19, country: 'DZ' },
];

// ============================================================
// ⚡ E-FACTURATION - CONFIG
// ============================================================

interface EInvoiceSettings {
  platform: 'simulation' | 'manual' | 'ppf' | 'pdp' | 'od';
  transmissionMode: 'simulation' | 'manual';
  platformName: string;
  platformEndpoint: string;
  platformApiKey: string;
  transmissionFormat: 'factur-x' | 'ubl' | 'cii';
  autoTransmission: boolean;
  requireElectronicForB2B: boolean;
  notifyOnRejection: boolean;
  notifyOnAcceptance: boolean;
  notifyOnTransmission: boolean;
  emailjsServiceId: string;
  emailjsTemplateId: string;
  emailjsPublicKey: string;
  emailjsFromName: string;
}

const DEFAULT_E_INVOICE: EInvoiceSettings = {
  platform: 'simulation',
  transmissionMode: 'simulation',
  platformName: '',
  platformEndpoint: '',
  platformApiKey: '',
  transmissionFormat: 'factur-x',
  autoTransmission: false,
  requireElectronicForB2B: true,
  notifyOnRejection: true,
  notifyOnAcceptance: true,
  notifyOnTransmission: true,
  emailjsServiceId: '',
  emailjsTemplateId: '',
  emailjsPublicKey: '',
  emailjsFromName: '',
};

// ============================================================
// TYPES D'ONGLETS
// ============================================================

type TabId = 'company' | 'vat' | 'currency' | 'einvoice';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  description: string;
  badge?: string;
}

const TABS: Tab[] = [
  { id: 'company', label: 'Entreprise', icon: <Building2 size={18} />, description: 'Identité, logo et coordonnées (pré-remplit devis/factures)' },
  { id: 'vat', label: 'TVA', icon: <FileText size={18} />, description: 'Taux par pays' },
  { id: 'currency', label: 'Devise', icon: <Coins size={18} />, description: 'Monnaie utilisée' },
  { id: 'einvoice', label: 'E-Facturation 2026', icon: <Zap size={18} />, description: 'Facturation électronique B2B', badge: '2026' },
];

// ============================================================
// 🎯 COMPOSANT PRINCIPAL
// ============================================================

export default function CompanySettings() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  
  const { customTeamId } = useTeam();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🍪 INTÉGRATION COOKIES
  const { preferences, consentDate } = useCookieConsent();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [existingDocId, setExistingDocId] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('company');
  const [isCheckingSiret, setIsCheckingSiret] = useState(false);
  const [siretError, setSiretError] = useState('');

  const [formData, setFormData] = useState({
    name: '', legalForm: 'Entreprise Individuelle', 
    address: '', postalCode: '', city: '', country: 'FR',
    siret: '', rcs: '',
    tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '',
    defaultTvaRate: '20', logoFileId: '', publicSlug: '', currency: 'EUR',
    monthlyGoal: 5000
  });

  const [eInvoiceSettings, setEInvoiceSettings] = useState<EInvoiceSettings>(DEFAULT_E_INVOICE);
  const [eInvoiceSettingsId, setEInvoiceSettingsId] = useState<string | null>(null);

  const [customTvaRates, setCustomTvaRates] = useState<TvaRate[]>(DEFAULT_TVA_RATES);
  const [showAddTvaModal, setShowAddTvaModal] = useState(false);
  const [editingTvaId, setEditingTvaId] = useState<string | null>(null);
  const [newTva, setNewTva] = useState<{ name: string; rate: string; country: string }>({ name: '', rate: '', country: 'FR' });
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [confirmDeleteTva, setConfirmDeleteTva] = useState<TvaRate | null>(null);

  const [testingEmail, setTestingEmail] = useState(false);
  const [showEmailjsGuide, setShowEmailjsGuide] = useState(false);

  // 🆕 CONFIGURATION DU PAYS SÉLECTIONNÉ
  const countryConfig = useMemo(() => getCountryConfig(formData.country), [formData.country]);
  const primaryIdentifier = getPrimaryIdentifier(countryConfig);
  const countryOptions = useMemo(() => listCountryOptions(), []);

  const defaultRateValid = customTvaRates.some(r => r.rate.toString() === formData.defaultTvaRate);

  // 🆕 VALIDATION DYNAMIQUE SELON LE PAYS
  const validateRegistrationId = (value: string): boolean => {
    if (!value || !value.trim()) return false;
    if (countryConfig.code === 'FR') return isValidSiret(value.replace(/\s/g, ''));
    return validateIdentifier(primaryIdentifier, value);
  };

  const hasValidRegistrationId = formData.siret && validateRegistrationId(formData.siret);
  const hasValidSiret = countryConfig.code === 'FR' && hasValidRegistrationId;
  const siren = countryConfig.code === 'FR' ? formData.siret.replace(/\s/g, '').substring(0, 9) : '';
  const nic = countryConfig.code === 'FR' ? formData.siret.replace(/\s/g, '').substring(9, 14) : '';
  const isTvaApplicable = !formData.tvaNumber.includes('non applicable') && !formData.tvaNumber.includes('Non assujetti');

  useEffect(() => {
    if (!permLoading && !hasPermission('settings.view')) {
      navigate('/dashboard');
    }
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (!customTeamId) return;
    loadSettings();
  }, [user, customTeamId]);

  // ============================================================
  // 📥 CHARGEMENT
  // ============================================================

  const loadSettings = async () => {
    try {
      if (!user?.$id) return;
      
      if (!customTeamId) {
        console.warn('⚠️ CompanySettings: customTeamId non résolu, attente...');
        setLoading(false);
        return;
      }
      
      setCurrentTeamId(customTeamId);

      let response = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('teamId', customTeamId)]);
      if (response.documents.length === 0) {
        response = await databases.listDocuments(DATABASE_ID, 'company_settings', [Query.equal('userId', user.$id)]);
      }

      const myDoc = response.documents[0];
      if (myDoc) {
        if (myDoc.teamId && myDoc.teamId !== customTeamId) {
          setExistingDocId(null);
          resetForm();
        } else {
          setExistingDocId(myDoc.$id);
          
          const addr = parseAddressRetroactive(
            myDoc.address,
            (myDoc as any).postalCode,
            (myDoc as any).city,
            (myDoc as any).country
          );
          
          setFormData({
            name: myDoc.name || '', legalForm: myDoc.legalForm || 'Entreprise Individuelle',
            address: addr.address,
            postalCode: addr.postalCode,
            city: addr.city,
            country: addr.country,
            siret: myDoc.siret || '', rcs: myDoc.rcs || '',
            tvaNumber: myDoc.tvaNumber || 'TVA non applicable, art. 293 B du CGI',
            phone: myDoc.phone || '', email: myDoc.email || '', defaultTvaRate: myDoc.defaultTvaRate || '20',
            logoFileId: myDoc.logoFileId || '', publicSlug: myDoc.publicSlug || '',
            currency: myDoc.currency || 'EUR',
            monthlyGoal: myDoc.monthlyGoal || 5000
          });
          if (myDoc.logoFileId) {
            try { setLogoPreview(getFilePreviewUrl('company_logos', myDoc.logoFileId)); } catch { setLogoPreview(''); }
          }
          if (myDoc.tvaRates) {
            try {
              const parsed = JSON.parse(myDoc.tvaRates);
              setCustomTvaRates(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_TVA_RATES);
            } catch { setCustomTvaRates(DEFAULT_TVA_RATES); }
          } else {
            setCustomTvaRates(DEFAULT_TVA_RATES);
          }
        }
      } else {
        setExistingDocId(null);
        resetForm();
      }

      try {
        const eInvoiceRes = await databases.listDocuments(
          DATABASE_ID,
          'einvoice_settings',
          [Query.equal('teamId', customTeamId), Query.limit(1)]
        );

        if (eInvoiceRes.documents.length > 0) {
          const doc = eInvoiceRes.documents[0] as any;
          setEInvoiceSettingsId(doc.$id);
          const platformValue = doc.platform || 'simulation';
          const validPlatforms = ['simulation', 'manual', 'ppf', 'pdp', 'od'];
          const modeValue = doc.transmissionMode || 'simulation';
          const validModes = ['simulation', 'manual'];
          setEInvoiceSettings({
            platform: validPlatforms.includes(platformValue) ? platformValue : 'simulation',
            transmissionMode: validModes.includes(modeValue) ? modeValue : 'simulation',
            platformName: doc.platformName || '',
            platformEndpoint: doc.platformEndpoint || '',
            platformApiKey: doc.platformApiKey || '',
            transmissionFormat: doc.transmissionFormat || 'factur-x',
            autoTransmission: doc.autoTransmission === true,
            requireElectronicForB2B: doc.requireElectronicForB2B !== false,
            notifyOnRejection: doc.notifyOnRejection !== false,
            notifyOnAcceptance: doc.notifyOnAcceptance !== false,
            notifyOnTransmission: doc.notifyOnTransmission !== false,
            emailjsServiceId: doc.emailjsServiceId || '',
            emailjsTemplateId: doc.emailjsTemplateId || '',
            emailjsPublicKey: doc.emailjsPublicKey || '',
            emailjsFromName: doc.emailjsFromName || '',
          });
        } else {
          setEInvoiceSettingsId(null);
          setEInvoiceSettings(DEFAULT_E_INVOICE);
        }
      } catch (e) {
        console.warn('Paramètres e-facturation non chargés:', e);
        setEInvoiceSettings(DEFAULT_E_INVOICE);
      }
    } catch (err) { console.error('Erreur chargement:', err); } finally { setLoading(false); }
  };

  const resetForm = () => {
    setFormData({
      name: '', legalForm: 'Entreprise Individuelle', 
      address: '', postalCode: '', city: '', country: 'FR',
      siret: '', rcs: '',
      tvaNumber: 'TVA non applicable, art. 293 B du CGI', phone: '', email: '',
      defaultTvaRate: '20', logoFileId: '', publicSlug: '', currency: 'EUR',
      monthlyGoal: 5000
    });
    setLogoPreview('');
    setCustomTvaRates(DEFAULT_TVA_RATES);
  };

  // ============================================================
  // 🔧 HANDLERS IDENTIFIANT (country-aware)
  // ============================================================

  const handleRegistrationIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (countryConfig.code === 'FR') {
      setFormData(prev => ({ ...prev, siret: formatSiret(e.target.value) }));
    } else {
      setFormData(prev => ({ ...prev, siret: e.target.value }));
    }
    setSiretError('');
  };

  const handleRegistrationIdBlur = async () => {
    const cleanValue = formData.siret.replace(/\s/g, '');
    if (!cleanValue) return;

    if (!validateRegistrationId(formData.siret)) {
      setSiretError(
        countryConfig.code === 'FR'
          ? 'Le numéro SIRET est invalide. Il doit contenir exactement 14 chiffres.'
          : `Format ${primaryIdentifier.shortLabel} invalide. ${primaryIdentifier.example ? `Ex: ${primaryIdentifier.example}` : ''}`
      );
      return;
    }

    // API gouv.fr uniquement pour la France
    if (countryConfig.code !== 'FR') return;

    setIsCheckingSiret(true);
    setSiretError('');
    try {
      const response = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${cleanValue}&per_page=1`);
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const company = data.results[0];
        const siege = company.siege;
        const uniteLegale = company.unite_legale || {};
        if (company.etat_administratif !== 'A') {
          setSiretError('Cette entreprise est fermée administrativement. Vérifiez le numéro.');
          return;
        }
        
        const fullAddress = `${siege?.libelle_voie || ''}`.trim();
        const apiPostalCode = siege?.code_postal || '';
        const apiCity = siege?.libelle_commune || '';
        const apiTvaNumber = uniteLegale.tva_intracommunautaire;
        const newTvaNumber = apiTvaNumber ? apiTvaNumber : 'TVA non applicable, art. 293 B du CGI';
        
        setFormData(prev => ({
          ...prev,
          name: company.nom_complet || prev.name,
          address: fullAddress || prev.address,
          postalCode: apiPostalCode || prev.postalCode,
          city: apiCity || prev.city,
          country: 'FR',
          tvaNumber: newTvaNumber
        }));
        toast.success('Entreprise trouvée !', { description: 'Nom, adresse et statut TVA pré-remplis.' });
      } else {
        setSiretError('Entreprise introuvable dans le registre officiel. Vous pouvez remplir manuellement.');
      }
    } catch (err) {
      console.error('Erreur vérification SIRET:', err);
      setSiretError('Erreur de connexion au registre des entreprises.');
    } finally {
      setIsCheckingSiret(false);
    }
  };

  // ============================================================
  // 🖼️ LOGO
  // ============================================================

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setUploading(true);
    try {
      if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'].includes(file.type)) throw new Error('Format non supporté.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Fichier trop volumineux (Max 5 Mo).');
      const localPreviewUrl = URL.createObjectURL(file);
      setLogoPreview(localPreviewUrl);
      if (formData.logoFileId) { try { await storage.deleteFile('company_logos', formData.logoFileId); } catch (e) { } }
      const uploadedFile = await storage.createFile('company_logos', ID.unique(), file);
      setFormData(prev => ({ ...prev, logoFileId: uploadedFile.$id }));
      toast.success('Logo téléchargé !', { description: "N'oubliez pas d'enregistrer." });
    } catch (err: any) { setError(err.message); setLogoPreview(''); } finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleRemoveLogo = async () => {
    try { if (formData.logoFileId) await storage.deleteFile('company_logos', formData.logoFileId); setFormData(p => ({ ...p, logoFileId: '' })); setLogoPreview(''); } catch (e) { }
  };

  // ============================================================
  // 💰 TVA
  // ============================================================

  const openAddTvaModal = (tva?: TvaRate) => {
    if (tva) {
      setEditingTvaId(tva.id);
      setNewTva({ name: tva.name, rate: tva.rate.toString(), country: tva.country });
    } else {
      setEditingTvaId(null);
      setNewTva({ name: '', rate: '', country: formData.country });
    }
    setShowAddTvaModal(true);
  };

  const handleSaveTva = () => {
    const rate = parseFloat(newTva.rate);
    if (!newTva.name.trim()) { toast.error('Veuillez saisir un nom pour ce taux.'); return; }
    if (isNaN(rate) || rate < 0 || rate > 100) { toast.error('Le taux doit être compris entre 0 et 100.'); return; }
    if (editingTvaId) {
      setCustomTvaRates(prev => prev.map(t => t.id === editingTvaId ? { ...t, name: newTva.name.trim(), rate, country: newTva.country } : t));
    } else {
      setCustomTvaRates(prev => [...prev, { id: `tva-${Date.now()}`, name: newTva.name.trim(), rate, country: newTva.country }]);
    }
    setShowAddTvaModal(false);
    setEditingTvaId(null);
    setNewTva({ name: '', rate: '', country: formData.country });
    toast.success('Taux de TVA mis à jour !', { description: "N'oubliez pas d'enregistrer." });
  };

  const handleDeleteTvaConfirm = () => {
    if (!confirmDeleteTva) return;
    if (customTvaRates.length <= 1) { toast.error('Vous devez conserver au moins un taux de TVA.'); setConfirmDeleteTva(null); return; }
    const rateToDelete = confirmDeleteTva;
    setCustomTvaRates(prev => prev.filter(t => t.id !== rateToDelete.id));
    if (formData.defaultTvaRate === rateToDelete.rate.toString()) {
      const remaining = customTvaRates.filter(t => t.id !== rateToDelete.id);
      if (remaining.length > 0) setFormData(prev => ({ ...prev, defaultTvaRate: remaining[0].rate.toString() }));
    }
    setConfirmDeleteTva(null);
    toast.success('Taux supprimé !', { description: "N'oubliez pas d'enregistrer." });
  };

  // ============================================================
  // 🔄 RÉINITIALISATION E-FACTURATION
  // ============================================================

  const handleResetEInvoiceSettings = async () => {
    if (!confirm('Réinitialiser les paramètres e-facturation aux valeurs par défaut ?\n\nLe mode Simulation sera activé.')) return;
    
    if (!currentTeamId) {
      toast.error('Erreur de sécurité : équipe non identifiée. Reconnectez-vous.');
      return;
    }

    try {
      if (eInvoiceSettingsId) {
        await databases.deleteDocument(DATABASE_ID, 'einvoice_settings', eInvoiceSettingsId);
        setEInvoiceSettingsId(null);
      }
      setEInvoiceSettings(DEFAULT_E_INVOICE);
      toast.success('Paramètres e-facturation réinitialisés', {
        description: 'Mode Simulation activé. N\'oubliez pas d\'enregistrer.'
      });
    } catch (e: any) {
      toast.error(`Erreur : ${e.message}`);
    }
  };

  // ============================================================
  // 💾 SAUVEGARDE
  // ============================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.$id || !currentTeamId) { 
      toast.error('Erreur de sécurité : équipe non identifiée. Reconnectez-vous.'); 
      return; 
    }

    if (formData.siret && !validateRegistrationId(formData.siret)) {
      const errorMsg = countryConfig.code === 'FR'
        ? 'Le numéro SIRET est invalide (14 chiffres attendus).'
        : `Le numéro ${primaryIdentifier.shortLabel} est invalide.`;
      toast.error(errorMsg);
      setActiveTab('company');
      return;
    }
    if (formData.email && !isValidEmail(formData.email)) {
      toast.error('L\'adresse email est invalide.');
      setActiveTab('company');
      return;
    }
    if (!defaultRateValid) {
      toast.error('Le taux de TVA par défaut n\'existe pas dans votre liste.');
      setActiveTab('vat');
      return;
    }

    if (activeTab === 'einvoice') {
      if (!hasValidSiret && eInvoiceSettings.platform !== 'simulation' && eInvoiceSettings.platform !== 'manual') {
        toast.error('Un SIRET valide (14 chiffres) est obligatoire pour activer l\'e-facturation en production.');
        setActiveTab('company');
        return;
      }
      if ((eInvoiceSettings.platform === 'pdp' || eInvoiceSettings.platform === 'od') && !eInvoiceSettings.platformName.trim()) {
        toast.error('Veuillez indiquer le nom de la plateforme PDP/OD.');
        return;
      }
    }

    setSaving(true); setError(''); setSuccess('');
    try {
      const companyPayload = {
        ...formData,
        userId: user.$id,
        teamId: currentTeamId,
        tvaRates: JSON.stringify(customTvaRates),
      };

      if (existingDocId) {
        const existingDoc = await databases.getDocument(DATABASE_ID, 'company_settings', existingDocId);
        if (existingDoc.teamId && existingDoc.teamId !== currentTeamId) throw new Error('Accès refusé');
        
        await databases.updateDocument(
          DATABASE_ID, 
          'company_settings', 
          existingDocId, 
          companyPayload
        );
      } else {
        await databases.createDocument(DATABASE_ID, 'company_settings', ID.unique(), companyPayload);
      }

      const eInvoicePayload = {
        teamId: currentTeamId,
        userId: user.$id,
        platform: eInvoiceSettings.platform,
        transmissionMode: eInvoiceSettings.transmissionMode,
        platformName: eInvoiceSettings.platformName,
        platformEndpoint: eInvoiceSettings.platformEndpoint,
        platformApiKey: eInvoiceSettings.platformApiKey,
        transmissionFormat: eInvoiceSettings.transmissionFormat,
        autoTransmission: eInvoiceSettings.autoTransmission,
        requireElectronicForB2B: eInvoiceSettings.requireElectronicForB2B,
        notifyOnRejection: eInvoiceSettings.notifyOnRejection,
        notifyOnAcceptance: eInvoiceSettings.notifyOnAcceptance,
        notifyOnTransmission: eInvoiceSettings.notifyOnTransmission,
        emailjsServiceId: eInvoiceSettings.emailjsServiceId,
        emailjsTemplateId: eInvoiceSettings.emailjsTemplateId,
        emailjsPublicKey: eInvoiceSettings.emailjsPublicKey,
        emailjsFromName: eInvoiceSettings.emailjsFromName,
      };

      try {
        if (eInvoiceSettingsId) {
          await databases.updateDocument(
            DATABASE_ID, 
            'einvoice_settings', 
            eInvoiceSettingsId, 
            eInvoicePayload
          );
        } else {
          const newDoc = await databases.createDocument(
            DATABASE_ID,
            'einvoice_settings',
            ID.unique(),
            eInvoicePayload
          );
          setEInvoiceSettingsId(newDoc.$id);
        }
      } catch (eInvoiceError: any) {
        console.error('Erreur sauvegarde e-facturation:', eInvoiceError);
        toast.warning('Paramètres entreprise enregistrés, mais les paramètres e-facturation ont échoué.');
      }

      invalidateEmailConfigCache(currentTeamId || undefined);

      toast.success('Paramètres enregistrés avec succès !', {
        description: 'Ces informations seront utilisées pour pré-remplir vos devis et factures.'
      });
      await loadSettings();
    } catch (err: any) { toast.error(`Erreur: ${err.message}`); } finally { setSaving(false); }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target as HTMLInputElement;
    const value = target.type === 'number' ? parseFloat(target.value) || 0 : target.value;
    setFormData({ ...formData, [target.name]: value });
  };

  // ============================================================
  // 🎨 RENDU
  // ============================================================

  if (permLoading) return (
    <Sidebar>
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div>
      </div>
    </Sidebar>
  );

  if (!hasPermission('settings.view')) return null;

  if (loading) return (
    <Sidebar>
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div>
      </div>
    </Sidebar>
  );

  const canEdit = hasPermission('settings.edit');
  const ratesByCountry = customTvaRates.reduce((acc, rate) => {
    const country = COUNTRIES[rate.country] || { code: rate.country, name: rate.country, flag: '🏳️', currency: 'EUR', identifiers: [], vat: { enabled: true, label: 'TVA', numberLabel: 'N° TVA', standardRates: [20], isEU: false }, retentionYears: 6, simplifiedInvoiceThreshold: 150 };
    if (!acc[country.code]) acc[country.code] = { country, rates: [] };
    acc[country.code].rates.push(rate);
    return acc;
  }, {} as Record<string, { country: any; rates: TvaRate[] }>);

  const currentCurrency = getCurrencyConfig(formData.currency);

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Building2}
          iconColor="purple"
          title="Mon Entreprise"
          description="Ces informations pré-rempliront automatiquement vos devis et factures."
        />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {!canEdit && (
            <Alert tone="warning" icon={Lock} title="Mode lecture seule" className="mb-6">
              Vous n'avez pas les permissions pour modifier ces paramètres.
            </Alert>
          )}

          {success && (
            <Alert tone="success" icon={CheckCircle2} title={success} className="mb-4" />
          )}
          {error && (
            <Alert tone="error" icon={AlertCircle} title={error} className="mb-4" />
          )}

          {/* Navigation par onglets */}
          <div className="bg-white dark:bg-slate-800 rounded-t-xl border border-slate-200 dark:border-slate-700 border-b-0 overflow-hidden">
            <div className="flex overflow-x-auto scrollbar-hide">
              {TABS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-4 text-sm font-semibold transition-all relative ${
                      isActive
                        ? 'text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-900/10'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                    }`}
                  >
                    {tab.icon}
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tab.badge && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded">
                        {tab.badge}
                      </span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 dark:bg-purple-400"></span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {TABS.find(t => t.id === activeTab)?.description}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-b-xl shadow-sm border border-slate-200 dark:border-slate-700 border-t-0 p-4 sm:p-6">
            {/* ONGLET 1 : INFORMATIONS ENTREPRISE */}
            {activeTab === 'company' && (
              <div className="space-y-6 animate-fadeIn">
                <Card>
                  <SectionTitle icon={ImageIcon} action={
                    canEdit && logoPreview ? (
                      <button type="button" onClick={handleRemoveLogo} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors active:scale-95">
                        <X size={14} /> Supprimer
                      </button>
                    ) : null
                  }>
                    Logo de l'entreprise <span className="text-sm font-normal text-slate-500 dark:text-slate-400">(optionnel)</span>
                  </SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Ajoutez votre logo pour qu'il apparaisse sur vos devis et factures.</p>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                    <div className="w-32 h-32 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg flex items-center justify-center bg-slate-50 dark:bg-slate-700/50 overflow-hidden flex-shrink-0">
                      {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" /> : <ImageIcon size={40} className="text-slate-300 dark:text-slate-500" />}
                    </div>
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                      {canEdit && (
                        <>
                          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
                          <label htmlFor="logo-upload" className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg cursor-pointer transition-colors active:scale-95 ${uploading ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700'}`}>
                            <Upload size={16} /> {uploading ? 'Upload...' : 'Choisir un logo'}
                          </label>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">PNG, JPG, SVG ou WEBP • Max 5 Mo</p>
                        </>
                      )}
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={Globe}>Lien public de demande de devis</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Partagez ce lien avec vos clients pour qu'ils puissent vous demander un devis.</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 flex items-center">
                      <span className="bg-slate-100 dark:bg-slate-700 border border-r-0 border-slate-300 dark:border-slate-600 rounded-l-lg px-3 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap hidden sm:block">/demande/</span>
                      <Input
                        type="text"
                        name="publicSlug"
                        value={formData.publicSlug}
                        onChange={(e) => setFormData({ ...formData, publicSlug: (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                        disabled={!canEdit}
                        className="flex-1 rounded-l-lg sm:rounded-l-none rounded-r-lg"
                        placeholder="mon-entreprise"
                      />
                    </div>
                    {formData.publicSlug && (
                      <button type="button" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/demande/${formData.publicSlug}`); toast.success('Lien copié !'); }} className="px-4 py-3 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center justify-center gap-2 transition-colors active:scale-95">
                        <Copy size={16} /> Copier le lien
                      </button>
                    )}
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={Building2}>
                    Informations légales
                    {countryConfig.code !== 'FR' && countryConfig.code !== 'XX' && (
                      <Badge tone="blue" className="ml-2">{countryConfig.flag} {countryConfig.name}</Badge>
                    )}
                  </SectionTitle>
                  <Alert tone="info" icon={AlertCircle} className="mb-4">
                    💡 <strong>Important :</strong> Ces informations sont automatiquement pré-remplies dans vos <strong>devis</strong> et <strong>factures</strong>.
                    {countryConfig.code !== 'FR' && countryConfig.code !== 'XX' && (
                      <span> Les identifiants ci-dessous sont spécifiques à <strong>{countryConfig.name}</strong>.</span>
                    )}
                  </Alert>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <FormField label="Nom de l'entreprise" required>
                      <Input type="text" name="name" required value={formData.name} onChange={handleChange} disabled={!canEdit} />
                    </FormField>
                    <FormField label="Forme juridique">
                      <Select name="legalForm" value={formData.legalForm} onChange={handleChange} disabled={!canEdit}>
                        <option>Entreprise Individuelle</option><option>Micro-entreprise</option><option>SASU</option><option>SARL</option><option>SAS</option><option>EURL</option>
                        <option>GmbH</option><option>AG</option><option>Ltd</option><option>LLC</option>
                        <option>SARL (Afrique)</option><option>SA (Afrique)</option><option>SAS (Afrique)</option><option>SUARL</option>
                        <option>Autre</option>
                      </Select>
                    </FormField>
                    
                    {/* 🆕 Identifiant principal adapté au pays */}
                    <FormField 
                      label={`${primaryIdentifier.shortLabel} (${primaryIdentifier.label})`} 
                      hint={siretError || (() => {
                        if (countryConfig.code === 'FR') {
                          return '💡 14 chiffres : 9 pour le SIREN + 5 pour le NIC. Obligatoire pour l\'e-facturation B2B.';
                        }
                        return primaryIdentifier.example
                          ? `💡 Format attendu : ${primaryIdentifier.example}`
                          : '💡 Identifiant fiscal officiel de votre pays';
                      })()}
                    >
                      <div className="relative">
                        <Input
                          type="text"
                          name="siret"
                          value={formData.siret}
                          onChange={handleRegistrationIdChange}
                          onBlur={handleRegistrationIdBlur}
                          disabled={!canEdit}
                          maxLength={countryConfig.code === 'FR' ? 17 : 50}
                          placeholder={primaryIdentifier.example || 'Identifiant'}
                          className={siretError ? 'border-red-500 focus:ring-red-500 pr-10' : 'pr-10'}
                        />
                        {isCheckingSiret && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <svg className="animate-spin h-5 w-5 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                          </div>
                        )}
                      </div>
                      {countryConfig.code === 'FR' && hasValidSiret && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                            <span className="font-semibold">SIREN:</span> {siren}
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-1 rounded">
                            <span className="font-semibold">NIC:</span> {nic}
                          </span>
                        </div>
                      )}
                    </FormField>
                    
                    {/* Identifiant secondaire adapté */}
                    <FormField label={
                      countryConfig.identifiers.length > 1
                        ? `${countryConfig.identifiers[1].shortLabel} / RCS`
                        : 'RCS / RM'
                    }>
                      <Input 
                        type="text" 
                        name="rcs" 
                        value={formData.rcs} 
                        onChange={handleChange} 
                        disabled={!canEdit} 
                        placeholder={
                          countryConfig.code === 'DE' ? 'HRB 12345' :
                          countryConfig.code === 'GB' ? 'Company N° 12345678' :
                          countryConfig.code === 'SN' || countryConfig.code === 'CI' || countryConfig.code === 'CM' ? 'RCCM SN-DKR-2020-B-12345' :
                          countryConfig.code === 'MA' ? 'RC 123456' :
                          'Ex: RCS Paris B 123 456 789'
                        } 
                      />
                    </FormField>
                    
                    {/* 🆕 N° TVA adapté au pays */}
                    {countryConfig.vat.enabled ? (
                      <FormField label={`${countryConfig.vat.numberLabel}${countryConfig.vat.prefix ? ` (préfixe ${countryConfig.vat.prefix})` : ''}`} className="md:col-span-2">
                        <Select name="tvaNumber" value={formData.tvaNumber.startsWith('TVA non') || formData.tvaNumber.startsWith('Non assujetti') ? formData.tvaNumber : 'Assujetti'} onChange={(e) => {
                          if ((e.target as HTMLSelectElement).value === 'Assujetti') {
                            setFormData({ ...formData, tvaNumber: 'Assujetti' });
                          } else {
                            setFormData({ ...formData, tvaNumber: (e.target as HTMLSelectElement).value });
                          }
                        }} disabled={!canEdit}>
                          <option value="TVA non applicable, art. 293 B du CGI">TVA non applicable (micro-entreprise)</option>
                          <option value="Non assujetti">Non assujetti (exonéré)</option>
                          <option value="Assujetti">Assujetti (saisir le numéro ci-dessous)</option>
                        </Select>
                        {(formData.tvaNumber === 'Assujetti' || (!formData.tvaNumber.includes('non') && !formData.tvaNumber.includes('Non'))) && (
                          <Input
                            type="text"
                            placeholder={
                              countryConfig.vat.prefix
                                ? `Ex: ${countryConfig.vat.prefix}${countryConfig.code === 'FR' ? '12345678901' : '123456789'}`
                                : countryConfig.code === 'SN' ? 'Ex: Compte fiscal 123456789' :
                                  countryConfig.code === 'CI' ? 'Ex: CC C1234567890' :
                                  countryConfig.code === 'CM' ? 'Ex: NIU P123456789' :
                                  countryConfig.code === 'MA' ? 'Ex: TVA 12345678' :
                                  countryConfig.code === 'TN' ? 'Ex: TVA 1234567ABC001' :
                                  countryConfig.code === 'DZ' ? 'Ex: TVA 123456789012345' :
                                  'Numéro de TVA'
                            }
                            value={
                              formData.tvaNumber === 'Assujetti' || formData.tvaNumber.startsWith('TVA non') || formData.tvaNumber.startsWith('Non')
                                ? ''
                                : formData.tvaNumber
                            }
                            onChange={(e) => setFormData({ ...formData, tvaNumber: (e.target as HTMLInputElement).value || 'Assujetti' })}
                            disabled={!canEdit}
                            className="mt-2 font-mono"
                          />
                        )}
                      </FormField>
                    ) : (
                      <FormField label="Numéro d'identification fiscale" hint="Pas de TVA dans ce pays. Utilisez votre identifiant fiscal local (ex: EIN aux US)." className="md:col-span-2">
                        <Input
                          type="text"
                          name="tvaNumber"
                          value={formData.tvaNumber.startsWith('TVA non') || formData.tvaNumber.startsWith('Non') || formData.tvaNumber === 'Assujetti' ? '' : formData.tvaNumber}
                          onChange={(e) => setFormData({ ...formData, tvaNumber: (e.target as HTMLInputElement).value })}
                          disabled={!canEdit}
                          placeholder={countryConfig.code === 'US' ? 'EIN 12-3456789' : 'Identifiant fiscal'}
                          className="font-mono"
                        />
                      </FormField>
                    )}
                  </div>

                  {/* 🆕 Indicateurs visuels du régime fiscal */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${
                      countryConfig.vat.enabled
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                    }`}>
                      {countryConfig.vat.enabled ? `✅ ${countryConfig.vat.label} : ${countryConfig.vat.standardRates.join('%, ')}%` : '⚠️ Pas de TVA (régime hors UE)'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      📅 Conservation : {countryConfig.retentionYears} ans
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      🧾 Seuil facture simplifiée : {countryConfig.simplifiedInvoiceThreshold > 0 ? `${countryConfig.simplifiedInvoiceThreshold.toLocaleString('fr-FR')} ${countryConfig.currency}` : 'N/A'}
                    </span>
                    {countryConfig.code !== 'XX' && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        💱 Devise : {countryConfig.currency}
                      </span>
                    )}
                  </div>
                </Card>

                {/* 🆕 BLOC ADRESSE avec sélecteur de pays dynamique */}
                <Card>
                  <SectionTitle icon={Home}>Adresse de l'entreprise</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Cette adresse apparaîtra sur tous vos devis et factures.
                  </p>
                  
                  <div className="space-y-4">
                    <FormField label="Adresse (n° et rue)">
                      <div className="relative">
                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <Input
                          type="text"
                          name="address"
                          value={formData.address}
                          onChange={handleChange}
                          disabled={!canEdit}
                          className="pl-9"
                          placeholder="123 rue de la Paix"
                        />
                      </div>
                    </FormField>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <FormField label="Code postal">
                        <div className="relative">
                          <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <Input
                            type="text"
                            name="postalCode"
                            value={formData.postalCode}
                            onChange={(e) => setFormData({
                              ...formData,
                              postalCode: formData.country === 'FR'
                                ? e.target.value.replace(/\D/g, '').slice(0, 5)
                                : e.target.value.slice(0, 10)
                            })}
                            disabled={!canEdit}
                            className="pl-9 font-mono"
                            placeholder={formData.country === 'FR' ? '75000' : formData.country === 'SN' ? '12500' : 'Code postal'}
                          />
                        </div>
                      </FormField>
                      <FormField label="Ville">
                        <Input
                          type="text"
                          name="city"
                          value={formData.city}
                          onChange={handleChange}
                          disabled={!canEdit}
                          placeholder={formData.country === 'SN' ? 'Dakar' : formData.country === 'CI' ? 'Abidjan' : formData.country === 'CM' ? 'Douala' : formData.country === 'MA' ? 'Casablanca' : 'Paris'}
                        />
                      </FormField>
                      <FormField label="Pays" hint="Détermine les identifiants fiscaux, les validations et la durée de conservation légale">
                        <div className="relative">
                          <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <Select
                            name="country"
                            value={formData.country}
                            onChange={handleChange}
                            disabled={!canEdit}
                            className="pl-9"
                          >
                            {countryOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </Select>
                        </div>
                      </FormField>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={Globe}>Coordonnées</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <FormField label="Téléphone">
                      <Input type="tel" name="phone" value={formData.phone} onChange={handleChange} disabled={!canEdit} placeholder={formData.country === 'SN' ? '+221 33 123 45 67' : formData.country === 'FR' ? '01 23 45 67 89' : 'Téléphone'} />
                    </FormField>
                    <FormField label="Email">
                      <Input type="email" name="email" value={formData.email} onChange={handleChange} disabled={!canEdit} placeholder="contact@entreprise.fr" />
                    </FormField>
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={Target}>Objectifs commerciaux</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Définissez vos objectifs mensuels pour suivre votre progression sur le tableau de bord.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <FormField label="🎯 Objectif mensuel (HT)" hint="Utilisé pour calculer votre progression sur le tableau de bord">
                      <div className="relative">
                        <Input
                          type="number"
                          name="monthlyGoal"
                          value={formData.monthlyGoal}
                          onChange={handleChange}
                          disabled={!canEdit}
                          min="0"
                          step="100"
                          placeholder="5000"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 dark:text-slate-500 pointer-events-none">
                          {currentCurrency.symbol}
                        </span>
                      </div>
                    </FormField>
                  </div>
                </Card>

                {/* 🍪 NOUVEAU : GESTION DES COOKIES */}
                <Card>
                  <SectionTitle icon={Cookie}>Préférences de confidentialité</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Gérez vos préférences concernant l'utilisation des cookies et le suivi analytique.
                  </p>

                  <div className="space-y-4">
                    {/* Statut du consentement */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm text-slate-900 dark:text-white">
                            Statut du consentement
                          </span>
                          {preferences.analytics || preferences.marketing ? (
                            <Badge tone="emerald">Complet</Badge>
                          ) : (
                            <Badge tone="slate">Essentiels uniquement</Badge>
                          )}
                        </div>
                        {consentDate ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Consentement donné le{' '}
                            <strong>{new Date(consentDate).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'long',
                              year: 'numeric'
                            })}</strong>
                          </p>
                        ) : (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Aucun consentement enregistré
                          </p>
                        )}
                      </div>
                      <button
  type="button"
  onClick={() => window.dispatchEvent(new CustomEvent('cookie-consent-open-preferences'))}
  className="px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors active:scale-95"
>
  Modifier
</button>
                    </div>

                    {/* Détail des catégories */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                          <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                            Essentiels
                          </span>
                        </div>
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                          Toujours actifs (session, sécurité)
                        </p>
                      </div>

                      <div className={`p-3 border rounded-lg ${
                        preferences.functional
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          : 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          {preferences.functional ? (
                            <CheckCircle2 size={16} className="text-blue-600 dark:text-blue-400" />
                          ) : (
                            <X size={16} className="text-slate-400 dark:text-slate-500" />
                          )}
                          <span className={`text-xs font-semibold ${
                            preferences.functional
                              ? 'text-blue-900 dark:text-blue-200'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            Fonctionnels
                          </span>
                        </div>
                        <p className={`text-[11px] ${
                          preferences.functional
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {preferences.functional ? 'Activés' : 'Désactivés'}
                        </p>
                      </div>

                      <div className={`p-3 border rounded-lg ${
                        preferences.analytics
                          ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
                          : 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          {preferences.analytics ? (
                            <CheckCircle2 size={16} className="text-purple-600 dark:text-purple-400" />
                          ) : (
                            <X size={16} className="text-slate-400 dark:text-slate-500" />
                          )}
                          <span className={`text-xs font-semibold ${
                            preferences.analytics
                              ? 'text-purple-900 dark:text-purple-200'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            Analytique
                          </span>
                        </div>
                        <p className={`text-[11px] ${
                          preferences.analytics
                            ? 'text-purple-700 dark:text-purple-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {preferences.analytics ? 'Activés' : 'Désactivés'}
                        </p>
                      </div>

                      <div className={`p-3 border rounded-lg ${
                        preferences.marketing
                          ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800'
                          : 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          {preferences.marketing ? (
                            <CheckCircle2 size={16} className="text-rose-600 dark:text-rose-400" />
                          ) : (
                            <X size={16} className="text-slate-400 dark:text-slate-500" />
                          )}
                          <span className={`text-xs font-semibold ${
                            preferences.marketing
                              ? 'text-rose-900 dark:text-rose-200'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}>
                            Marketing
                          </span>
                        </div>
                        <p className={`text-[11px] ${
                          preferences.marketing
                            ? 'text-rose-700 dark:text-rose-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {preferences.marketing ? 'Activés' : 'Désactivés'}
                        </p>
                      </div>
                    </div>

                    {/* Lien politique de confidentialité */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        📖 Consultez notre{' '}
                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-600 dark:text-purple-400 underline hover:no-underline"
                        >
                          politique de confidentialité
                        </a>
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* ONGLET 2 : TVA */}
            {activeTab === 'vat' && (
              <div className="space-y-6 animate-fadeIn">
                <Card>
                  <SectionTitle icon={FileText}>Taux de TVA par défaut</SectionTitle>
                  <Alert tone="info" icon={AlertCircle} className="mb-4">
                    Ce taux sera appliqué par défaut sur vos nouveaux devis et factures.
                  </Alert>
                  <FormField label="⭐ Taux par défaut">
                    <Select name="defaultTvaRate" value={formData.defaultTvaRate} onChange={handleChange} disabled={!canEdit} className={!defaultRateValid ? 'border-red-500' : ''}>
                      {customTvaRates.map(rate => {
                        const country = COUNTRIES[rate.country] || { code: rate.country, name: rate.country, flag: '🏳️' };
                        return <option key={rate.id} value={rate.rate.toString()}>{rate.name} — {rate.rate}% ({country.flag} {country.name})</option>;
                      })}
                    </Select>
                  </FormField>
                  {!defaultRateValid && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                      <AlertCircle size={12} /> Le taux sélectionné n'existe pas dans votre liste
                    </p>
                  )}
                </Card>

                <Card>
                  <SectionTitle icon={Globe} action={
                    canEdit ? (
                      <button type="button" onClick={() => openAddTvaModal()} className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors active:scale-95">
                        <Plus size={16} /> Ajouter un taux
                      </button>
                    ) : null
                  }>
                    Taux de TVA par pays
                  </SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Gérez vos taux de TVA pour chaque pays où vous facturez.
                  </p>
                  <div className="space-y-4">
                    {Object.values(ratesByCountry).map(({ country, rates }) => (
                      <div key={country.code} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{country.flag} {country.name}</span>
                          <Badge tone="slate">{rates.length} taux</Badge>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                          {rates.map(rate => (
                            <div key={rate.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-slate-900 dark:text-white">{rate.name}</span>
                                  <span className={`text-sm font-bold ${formData.defaultTvaRate === rate.rate.toString() ? 'text-purple-600 dark:text-purple-400' : 'text-slate-600 dark:text-slate-300'}`}>{rate.rate}%</span>
                                  {formData.defaultTvaRate === rate.rate.toString() && <Badge tone="purple">PAR DÉFAUT</Badge>}
                                </div>
                              </div>
                              {canEdit && (
                                <div className="flex gap-1 ml-2">
                                  <button type="button" onClick={() => openAddTvaModal(rate)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors" title="Modifier">
                                    <Edit2 size={16} />
                                  </button>
                                  {customTvaRates.length > 1 && (
                                    <button type="button" onClick={() => setConfirmDeleteTva(rate)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Supprimer">
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {/* ONGLET 3 : DEVISE */}
            {activeTab === 'currency' && (
              <div className="space-y-6 animate-fadeIn">
                <Card>
                  <SectionTitle icon={Coins}>Devise principale</SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Cette devise sera utilisée sur tous vos devis, factures, reçus et exports CSV.
                  </p>
                  <FormField label="Sélectionnez votre devise">
                    <Select name="currency" value={formData.currency} onChange={handleChange} disabled={!canEdit}>
                      {SUPPORTED_CURRENCIES.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.symbol} — {c.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </Card>

                <Card>
                  <SectionTitle icon={Eye}>Aperçu du rendu</SectionTitle>
                  <Alert tone="info" icon={Eye} className="mb-4">
                    Un montant de <strong>1 234,56</strong> s'affichera ainsi sur vos documents :
                  </Alert>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-purple-200 dark:border-purple-700 mb-4">
                    <span className="font-mono font-bold text-2xl text-purple-900 dark:text-purple-100">
                      {formatMoney(1234.56, formData.currency)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <div><strong>Code :</strong> {currentCurrency.code}</div>
                    <div><strong>Symbole :</strong> {currentCurrency.symbol}</div>
                    <div><strong>Locale :</strong> {currentCurrency.locale}</div>
                    <div><strong>Décimales :</strong> {['JPY', 'XOF', 'XAF', 'GNF'].includes(currentCurrency.code) ? '0' : '2'}</div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle>Autres devises disponibles</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_CURRENCIES.map(c => (
                      <span
                        key={c.code}
                        className={`text-xs px-3 py-1.5 rounded-full font-mono transition-colors ${
                          c.code === formData.currency
                            ? 'bg-purple-600 text-white font-bold'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {c.symbol} {c.code}
                      </span>
                    ))}
                  </div>
                </Card>

                <Alert tone="info" icon={AlertCircle} title="Changement de devise">
                  Si vous changez de devise, les anciens documents ne seront pas modifiés. Seuls les nouveaux documents utiliseront la devise sélectionnée.
                </Alert>
              </div>
            )}

            {/* ONGLET 4 : E-FACTURATION 2026 */}
            {activeTab === 'einvoice' && (
              <div className="space-y-6 animate-fadeIn">
                <Alert tone="info" icon={AlertCircle} title="Réforme 2026 - Facturation électronique obligatoire">
                  <p className="text-sm mt-1">
                    À partir du <strong>1er septembre 2026</strong>, toutes les entreprises françaises assujetties à la TVA
                    devront émettre et recevoir leurs factures B2B sous format électronique via une plateforme agréée (PDP)
                    ou le portail public (PPF/Chorus Pro).
                  </p>
                </Alert>

                {!hasValidSiret && eInvoiceSettings.platform !== 'simulation' && eInvoiceSettings.platform !== 'manual' ? (
                  <Alert tone="warning" icon={Shield} title="⚠️ SIRET requis pour l'e-facturation en production">
                    <p className="text-sm mt-1">
                      Pour activer l'e-facturation en mode production, vous devez d'abord renseigner un <strong>SIRET valide (14 chiffres)</strong>
                      dans l'onglet "Entreprise". Le mode Simulation reste accessible sans SIRET.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('company')}
                      className="mt-3 text-sm font-medium text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                    >
                      → Aller à l'onglet Entreprise
                    </button>
                  </Alert>
                ) : hasValidSiret ? (
                  <Alert tone="success" icon={CheckCircle2} title="✅ Données prêtes pour l'e-facturation">
                    <p className="text-sm mt-1">
                      Votre SIRET <strong className="font-mono">{formData.siret}</strong> est valide.
                      {isTvaApplicable && formData.tvaNumber && !formData.tvaNumber.includes('Assujetti') && (
                        <> TVA : <strong className="font-mono">{formData.tvaNumber}</strong></>
                      )}
                      {' '}Votre entreprise est prête pour transmettre des factures électroniques B2B.
                    </p>
                  </Alert>
                ) : null}

                <Card>
                  <SectionTitle
                    icon={Server}
                    action={
                      canEdit ? (
                        <button
                          type="button"
                          onClick={handleResetEInvoiceSettings}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        >
                          <RefreshCw size={12} />
                          Réinitialiser
                        </button>
                      ) : null
                    }
                  >
                    Mode de transmission
                  </SectionTitle>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Choisissez comment vos e-factures seront gérées.
                    <span className="font-semibold text-purple-600 dark:text-purple-400"> Nous recommandons le mode Simulation</span> pour démarrer.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => canEdit && setEInvoiceSettings({ ...eInvoiceSettings, platform: 'simulation', transmissionMode: 'simulation' })}
                      disabled={!canEdit}
                      className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                        eInvoiceSettings.platform === 'simulation'
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 shadow-lg shadow-purple-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <span className="absolute -top-2 left-3 px-2 py-0.5 text-[10px] font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow">
                        ⭐ RECOMMANDÉ
                      </span>
                      <div className="flex items-center gap-2 mb-2 mt-1">
                        <span className="text-lg">🧪</span>
                        <span className="font-semibold text-sm">Simulation</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Testez sans envoi réel. Idéal pour découvrir et valider vos processus.
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded">GRATUIT</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">ZÉRO CONFIG</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => canEdit && setEInvoiceSettings({ ...eInvoiceSettings, platform: 'manual', transmissionMode: 'manual' })}
                      disabled={!canEdit}
                      className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                        eInvoiceSettings.platform === 'manual'
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 shadow-lg shadow-blue-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">📋</span>
                        <span className="font-semibold text-sm">Mode Manuel</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Déposez le XML vous-même sur le portail. Suivi déclaratif complet.
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded">GRATUIT</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded">PRODUCTION</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => canEdit && setEInvoiceSettings({ ...eInvoiceSettings, platform: 'ppf', transmissionMode: 'manual' })}
                      disabled={!canEdit}
                      className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                        eInvoiceSettings.platform === 'ppf'
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 shadow-lg shadow-purple-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🏛️</span>
                        <span className="font-semibold text-sm">PPF (Chorus Pro)</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Portail Public gratuit de l'État français. Solution officielle.
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded">GRATUIT</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">LIMITÉ 2027</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => canEdit && setEInvoiceSettings({ ...eInvoiceSettings, platform: 'pdp', transmissionMode: 'manual' })}
                      disabled={!canEdit}
                      className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                        eInvoiceSettings.platform === 'pdp'
                          ? 'border-purple-600 bg-purple-50 dark:bg-purple-900/20 shadow-lg shadow-purple-500/20'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🏢</span>
                        <span className="font-semibold text-sm">PDP (Partenaire)</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Plateforme de Dématérialisation agréée (ex: PennyLane, Regate...)
                      </p>
                      <div className="mt-2 flex items-center gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 rounded">PAYANT</span>
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded">AVANCÉ</span>
                      </div>
                    </button>
                  </div>

                  {eInvoiceSettings.platform === 'simulation' && (
                    <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Zap size={20} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-purple-900 dark:text-purple-100">Mode Simulation activé</h4>
                          <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                            Vos e-factures seront traitées <strong>en local uniquement</strong>. Aucune donnée n'est envoyée à l'extérieur.
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                            <span className="px-2 py-1 bg-white dark:bg-slate-800 rounded text-purple-700 dark:text-purple-300">✅ Transmission simulée</span>
                            <span className="px-2 py-1 bg-white dark:bg-slate-800 rounded text-purple-700 dark:text-purple-300">✅ Réponses clients simulées</span>
                            <span className="px-2 py-1 bg-white dark:bg-slate-800 rounded text-purple-700 dark:text-purple-300">✅ XML Factur-X généré</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {eInvoiceSettings.platform === 'manual' && (
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Mode Manuel activé</h4>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            Workflow recommandé : <strong>téléchargez le XML Factur-X</strong> → déposez-le sur votre portail (Chorus Pro / PDP) 
                            → <strong>revenez déclarer ici</strong> la transmission, l'acceptation ou le rejet.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {eInvoiceSettings.platform === 'ppf' && (
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Building2 size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">PPF - Portail Public des Finances</h4>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                            Solution officielle et <strong>gratuite</strong> de l'État français (ex-Chorus Pro).
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {eInvoiceSettings.platform === 'pdp' && (
                    <div className="mt-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                      <div className="flex items-start gap-3">
                        <Server size={20} className="text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">PDP - Plateforme Partenaire</h4>
                          <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-1">
                            Solution <strong>avancée et payante</strong> offrant des fonctionnalités premium.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>

                {eInvoiceSettings.platform === 'pdp' && (
                  <Card>
                    <SectionTitle icon={Server}>Configuration PDP</SectionTitle>
                    <div className="space-y-4">
                      <FormField label="Nom de la plateforme" required>
                        <Select
                          value={eInvoiceSettings.platformName}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, platformName: e.target.value })}
                          disabled={!canEdit}
                        >
                          <option value="">-- Sélectionnez votre PDP --</option>
                          <option value="Regate">Regate</option>
                          <option value="PennyLane">PennyLane</option>
                          <option value="Sage">Sage</option>
                          <option value="Quadra">Quadra</option>
                          <option value="Autre">Autre</option>
                        </Select>
                      </FormField>

                      <FormField label="URL de l'API (Endpoint)">
                        <Input
                          type="url"
                          value={eInvoiceSettings.platformEndpoint}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, platformEndpoint: e.target.value })}
                          disabled={!canEdit}
                          placeholder="https://api.exemple.com/v1"
                        />
                      </FormField>

                      <FormField label="Clé API / Token">
                        <Input
                          type="password"
                          value={eInvoiceSettings.platformApiKey}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, platformApiKey: e.target.value })}
                          disabled={!canEdit}
                          placeholder="Votre clé API secrète"
                        />
                      </FormField>
                    </div>
                  </Card>
                )}

                <Card>
                  <SectionTitle icon={FileText}>Format et options</SectionTitle>
                  <div className="space-y-4">
                    <FormField label="Format de facturation électronique" required>
                      <Select
                        value={eInvoiceSettings.transmissionFormat}
                        onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, transmissionFormat: e.target.value as any })}
                        disabled={!canEdit}
                      >
                        <option value="factur-x">🇫🇷 Factur-X (CII) - Recommandé en France</option>
                        <option value="ubl">🇪🇺 UBL 2.1 - Standard européen</option>
                        <option value="cii">🌍 CII UN/CEFACT - Format UN</option>
                      </Select>
                    </FormField>

                    <div className="space-y-3 pt-2">
                      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <input
                          type="checkbox"
                          checked={eInvoiceSettings.autoTransmission}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, autoTransmission: e.target.checked })}
                          disabled={!canEdit || eInvoiceSettings.platform === 'simulation' || eInvoiceSettings.platform === 'manual'}
                          className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-slate-900 dark:text-white">Transmission automatique</div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Transmettre automatiquement les factures validées à la plateforme
                          </p>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                        <input
                          type="checkbox"
                          checked={eInvoiceSettings.requireElectronicForB2B}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, requireElectronicForB2B: e.target.checked })}
                          disabled={!canEdit}
                          className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-slate-900 dark:text-white">Exiger l'e-facturation pour les clients B2B français</div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Afficher un avertissement si un client professionnel français n'a pas de SIRET
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle 
                    icon={Mail}
                    action={
                      <button
                        type="button"
                        onClick={() => setShowEmailjsGuide(!showEmailjsGuide)}
                        className="text-xs font-medium text-purple-600 dark:text-purple-400 hover:underline"
                      >
                        {showEmailjsGuide ? 'Masquer le guide' : '📖 Guide de configuration'}
                      </button>
                    }
                  >
                    Configuration des notifications Email
                  </SectionTitle>

                  {eInvoiceSettings.emailjsServiceId && eInvoiceSettings.emailjsTemplateId && eInvoiceSettings.emailjsPublicKey ? (
                    <Alert tone="success" icon={CheckCircle2} className="mb-4">
                      <strong>Vos paramètres EmailJS sont configurés.</strong> Les emails partiront depuis votre propre compte.
                    </Alert>
                  ) : (
                    <Alert tone="info" icon={AlertCircle} className="mb-4">
                      <strong>Mode par défaut actif.</strong> Les emails utilisent la configuration globale de RelancePro.
                      Configurez vos propres identifiants ci-dessous pour envoyer depuis votre adresse professionnelle.
                    </Alert>
                  )}

                  {showEmailjsGuide && (
                    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                      <h4 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-2">📖 Comment configurer EmailJS (5 min)</h4>
                      <ol className="space-y-2 text-xs text-blue-800 dark:text-blue-200 list-decimal list-inside">
                        <li>Créez un compte gratuit sur <a href="https://www.emailjs.com/" target="_blank" rel="noopener noreferrer" className="underline font-semibold">emailjs.com</a> (200 emails/mois gratuits)</li>
                        <li>Dans <strong>Email Services</strong> → <strong>Add New Service</strong> → Choisissez Gmail/Outlook → Notez le <strong>Service ID</strong></li>
                        <li>Dans <strong>Email Templates</strong> → <strong>Create New Template</strong> :
                          <ul className="ml-6 mt-1 space-y-1 list-disc">
                            <li><strong>To Email</strong> : <code className="bg-white dark:bg-slate-800 px-1 rounded">{'{{to_email}}'}</code></li>
                            <li><strong>Subject</strong> : <code className="bg-white dark:bg-slate-800 px-1 rounded">{'{{subject}}'}</code></li>
                            <li><strong>Content</strong> : <code className="bg-white dark:bg-slate-800 px-1 rounded">{'{{message}}'}</code></li>
                          </ul>
                          Notez le <strong>Template ID</strong>
                        </li>
                        <li>Dans <strong>Account</strong> → <strong>General</strong> → Copiez votre <strong>Public Key</strong></li>
                        <li>Collez les 3 informations ci-dessous et cliquez sur <strong>Tester</strong></li>
                      </ol>
                    </div>
                  )}

                  <div className="space-y-3 mb-4">
                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={eInvoiceSettings.notifyOnRejection !== false}
                        onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, notifyOnRejection: e.target.checked })}
                        disabled={!canEdit}
                        className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm text-slate-900 dark:text-white">❌ Notification de rejet</div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Email immédiat quand une facture est rejetée</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={eInvoiceSettings.notifyOnAcceptance !== false}
                        onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, notifyOnAcceptance: e.target.checked })}
                        disabled={!canEdit}
                        className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm text-slate-900 dark:text-white">✅ Notification d'acceptation</div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Email quand une facture est acceptée</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={eInvoiceSettings.notifyOnTransmission !== false}
                        onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, notifyOnTransmission: e.target.checked })}
                        disabled={!canEdit}
                        className="mt-1 rounded text-purple-600 focus:ring-purple-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm text-slate-900 dark:text-white">📤 Notification de transmission</div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Email de confirmation quand une facture est transmise</p>
                      </div>
                    </label>
                  </div>

                  <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                      🔑 Vos identifiants EmailJS <span className="text-xs font-normal text-slate-500">(optionnel)</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField label="Service ID" hint="Ex: service_abc123">
                        <Input
                          type="text"
                          value={eInvoiceSettings.emailjsServiceId}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, emailjsServiceId: (e.target as HTMLInputElement).value })}
                          disabled={!canEdit}
                          placeholder="service_xxxxxxx"
                          className="font-mono text-xs"
                        />
                      </FormField>

                      <FormField label="Template ID" hint="Ex: template_xyz789">
                        <Input
                          type="text"
                          value={eInvoiceSettings.emailjsTemplateId}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, emailjsTemplateId: (e.target as HTMLInputElement).value })}
                          disabled={!canEdit}
                          placeholder="template_xxxxxxx"
                          className="font-mono text-xs"
                        />
                      </FormField>

                      <FormField label="Public Key" hint="Votre clé publique EmailJS">
                        <Input
                          type="password"
                          value={eInvoiceSettings.emailjsPublicKey}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, emailjsPublicKey: (e.target as HTMLInputElement).value })}
                          disabled={!canEdit}
                          placeholder="xxxxxxxxxxxxxxxx"
                          className="font-mono text-xs"
                        />
                      </FormField>

                      <FormField label="Nom de l'expéditeur" hint="Affiché dans les emails">
                        <Input
                          type="text"
                          value={eInvoiceSettings.emailjsFromName}
                          onChange={(e) => setEInvoiceSettings({ ...eInvoiceSettings, emailjsFromName: (e.target as HTMLInputElement).value })}
                          disabled={!canEdit}
                          placeholder={formData.name || 'Mon Entreprise'}
                        />
                      </FormField>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mt-4">
                      <button
                        type="button"
                        disabled={testingEmail}
                        onClick={async () => {
                          const email = formData.email;
                          if (!email) {
                            toast.error('Renseignez votre email dans l\'onglet Entreprise');
                            return;
                          }
                          setTestingEmail(true);
                          toast.info('📧 Envoi d\'un email de test...', { description: email });
                          
                          const customConfig = eInvoiceSettings.emailjsServiceId && eInvoiceSettings.emailjsTemplateId && eInvoiceSettings.emailjsPublicKey
                            ? {
                                serviceId: eInvoiceSettings.emailjsServiceId,
                                templateId: eInvoiceSettings.emailjsTemplateId,
                                publicKey: eInvoiceSettings.emailjsPublicKey,
                              }
                            : undefined;

                          const result = await testEmailConfiguration(email, customConfig, currentTeamId || undefined);
                          
                          if (result.success) {
                            toast.success(result.message);
                          } else {
                            toast.error(result.message);
                          }
                          setTestingEmail(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50"
                      >
                        <Mail size={16} />
                        {testingEmail ? 'Test en cours...' : 'Tester l\'envoi'}
                      </button>

                      {(eInvoiceSettings.emailjsServiceId || eInvoiceSettings.emailjsTemplateId || eInvoiceSettings.emailjsPublicKey) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirm('Effacer vos paramètres EmailJS ? Le mode par défaut sera utilisé.')) return;
                            setEInvoiceSettings({
                              ...eInvoiceSettings,
                              emailjsServiceId: '',
                              emailjsTemplateId: '',
                              emailjsPublicKey: '',
                              emailjsFromName: '',
                            });
                            toast.info('Paramètres EmailJS effacés. N\'oubliez pas d\'enregistrer.');
                          }}
                          className="px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          Effacer
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3">
                      🔒 Vos identifiants sont stockés de manière sécurisée dans votre espace équipe. Ils ne sont jamais partagés.
                    </p>
                  </div>
                </Card>

                <Card>
                  <SectionTitle icon={CheckCircle2}>Récapitulatif de votre configuration</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Mode</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {eInvoiceSettings.platform === 'simulation' && <><span>🧪</span> Simulation</>}
                        {eInvoiceSettings.platform === 'manual' && <><span>📋</span> Mode Manuel</>}
                        {eInvoiceSettings.platform === 'ppf' && <><span>🏛️</span> PPF - Portail Public</>}
                        {eInvoiceSettings.platform === 'pdp' && <><span>🏢</span> PDP - {eInvoiceSettings.platformName || 'Non configurée'}</>}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Format</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>📄</span>
                        {eInvoiceSettings.transmissionFormat === 'factur-x' && 'Factur-X (France)'}
                        {eInvoiceSettings.transmissionFormat === 'ubl' && 'UBL 2.1 (Europe)'}
                        {eInvoiceSettings.transmissionFormat === 'cii' && 'CII (UN/CEFACT)'}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Notifications</div>
                      <div className="text-sm font-bold flex items-center gap-2">
                        <span>📧</span>
                        <span className="text-slate-700 dark:text-slate-300">
                          {eInvoiceSettings.notifyOnRejection && 'Rejets '}
                          {eInvoiceSettings.notifyOnAcceptance && 'Acceptations '}
                          {eInvoiceSettings.notifyOnTransmission && 'Transmissions'}
                          {!eInvoiceSettings.notifyOnRejection && !eInvoiceSettings.notifyOnAcceptance && !eInvoiceSettings.notifyOnTransmission && 'Aucune'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold mb-1">Identifiant entreprise</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                        {hasValidRegistrationId ? (
                          <span>{countryConfig.code === 'FR' ? formData.siret : `${primaryIdentifier.shortLabel}: ${formData.siret}`}</span>
                        ) : (
                          <span className="text-rose-600">⚠️ Non configuré</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {canEdit && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 mt-6 border-t border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  Onglet actuel : <strong className="text-slate-700 dark:text-slate-300">{TABS.find(t => t.id === activeTab)?.label}</strong>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <button type="button" onClick={() => navigate('/dashboard')} className="w-full sm:w-auto px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors active:scale-95">
                    Annuler
                  </button>
                  <button type="submit" disabled={saving || !defaultRateValid} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors active:scale-95 shadow-lg shadow-purple-600/20">
                    {saving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        <span>Enregistrement...</span>
                      </>
                    ) : (
                      <><Save size={16} /><span>Enregistrer</span></>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </main>

        <Modal
          open={showAddTvaModal}
          onClose={() => { setShowAddTvaModal(false); setEditingTvaId(null); }}
          title={editingTvaId ? 'Modifier le taux' : 'Nouveau taux de TVA'}
          icon={<Globe className="text-purple-600" size={20} />}
          footer={
            <>
              <button onClick={() => { setShowAddTvaModal(false); setEditingTvaId(null); }} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
              <button onClick={handleSaveTva} disabled={!newTva.name.trim() || !newTva.rate} className="flex-1 px-4 py-3 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 active:scale-95 transition-all">{editingTvaId ? 'Modifier' : 'Ajouter'}</button>
            </>
          }
        >
          <div className="space-y-4">
            <FormField label="Nom du taux" required>
              <Input type="text" value={newTva.name} onChange={e => setNewTva({ ...newTva, name: (e.target as HTMLInputElement).value })} placeholder="Ex: Taux normal, Taux réduit..." autoFocus />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Taux (%)" required>
                <Input type="number" step="0.1" min="0" max="100" value={newTva.rate} onChange={e => setNewTva({ ...newTva, rate: (e.target as HTMLInputElement).value })} placeholder="20" />
              </FormField>
              <FormField label="Pays" required>
                <Select value={newTva.country} onChange={e => setNewTva({ ...newTva, country: (e.target as HTMLSelectElement).value })}>
                  {countryOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </Select>
              </FormField>
            </div>
          </div>
        </Modal>

        <ConfirmDialog
          open={!!confirmDeleteTva}
          onClose={() => setConfirmDeleteTva(null)}
          onConfirm={handleDeleteTvaConfirm}
          title="Supprimer ce taux de TVA ?"
          description={
            confirmDeleteTva ? (
              <>
                Le taux <strong className="text-slate-700 dark:text-slate-200">{confirmDeleteTva.name} ({confirmDeleteTva.rate}%)</strong> sera supprimé.
              </>
            ) : null
          }
          confirmLabel="Supprimer"
          cancelLabel="Annuler"
          tone="danger"
        />
      </div>
    </Sidebar>
  );
}