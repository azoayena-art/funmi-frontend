// src/pages/AccountMapping.tsx — Plan Comptable Multi-Pays (STABLE)
// 🌍 Détection automatique du référentiel selon le pays de l'entreprise
// 🎯 Support : FR, SYSCOHADA (14 pays), MA, TN, DZ, BE, CH, et générique
import Sidebar from '../components/Sidebar';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTeam } from '../context/TeamContext';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { toast } from 'sonner';
import { Card, Badge, Input, Select } from '../components/ui/SharedUI';
import {
  BookOpen, Save, RotateCcw, AlertCircle, Loader2,
  Wallet, TrendingUp, ShoppingBag, Landmark, Users, Receipt,
  ArrowLeft, Plus, Trash2, X, Edit3, FolderPlus, Globe,
  CreditCard, Building2, FileText, Package, Flag, Percent,
} from 'lucide-react';
import {
  DEFAULT_PCG_ARTISAN,
  type AccountCategory,
} from '../services/defaultAccountMapping';
import {
  loadCustomAccountMapping,
  saveAccountMapping,
  resetToDefaultMapping,
  deleteCustomAccount,
  type CustomAccount,
} from '../services/accountMappingService';

// 🌍 Registre international
import {
  getCountryConfig,
  type CountryConfig,
} from '../config/countries';

// ============================================================
// 🎨 MAPPINGS STATIQUES (évite les classes Tailwind dynamiques)
// ============================================================
const ICON_MAP: Record<string, any> = {
  TrendingUp, Wallet, Receipt, Landmark, Users, ShoppingBag,
  BookOpen, FolderPlus, Globe, CreditCard, Building2, FileText, Package,
};

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string; ring: string }> = {
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-300 dark:border-emerald-700', ring: 'ring-emerald-100 dark:ring-emerald-900/30' },
  blue:    { bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-300 dark:border-blue-700', ring: 'ring-blue-100 dark:ring-blue-900/30' },
  purple:  { bg: 'bg-purple-100 dark:bg-purple-950/40', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-300 dark:border-purple-700', ring: 'ring-purple-100 dark:ring-purple-900/30' },
  cyan:    { bg: 'bg-cyan-100 dark:bg-cyan-950/40', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-300 dark:border-cyan-700', ring: 'ring-cyan-100 dark:ring-cyan-900/30' },
  amber:   { bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-300 dark:border-amber-700', ring: 'ring-amber-100 dark:ring-amber-900/30' },
  red:     { bg: 'bg-red-100 dark:bg-red-950/40', text: 'text-red-600 dark:text-red-400', border: 'border-red-300 dark:border-red-700', ring: 'ring-red-100 dark:ring-red-900/30' },
  pink:    { bg: 'bg-pink-100 dark:bg-pink-950/40', text: 'text-pink-600 dark:text-pink-400', border: 'border-pink-300 dark:border-pink-700', ring: 'ring-pink-100 dark:ring-pink-900/30' },
  orange:  { bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-600 dark:text-orange-400', border: 'border-orange-300 dark:border-orange-700', ring: 'ring-orange-100 dark:ring-orange-900/30' },
  teal:    { bg: 'bg-teal-100 dark:bg-teal-950/40', text: 'text-teal-600 dark:text-teal-400', border: 'border-teal-300 dark:border-teal-700', ring: 'ring-teal-100 dark:ring-teal-900/30' },
  indigo:  { bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-300 dark:border-indigo-700', ring: 'ring-indigo-100 dark:ring-indigo-900/30' },
  slate:   { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-300 dark:border-slate-700', ring: 'ring-slate-100 dark:ring-slate-900/30' },
};

const getColorStyle = (color: string) => COLOR_STYLES[color] || COLOR_STYLES.slate;

// ============================================================
// 🌍 MAPPING PAYS → RÉFÉRENTIEL COMPTABLE
// ============================================================
const COUNTRY_TO_STANDARD: Record<string, string> = {
  // 🇪🇺 Europe
  FR: 'FR_PCG', BE: 'BE_PCMN', CH: 'CH_PCS',
  // 🌍 SYSCOHADA (14 pays d'Afrique francophone)
  SN: 'SYSCOHADA', CI: 'SYSCOHADA', ML: 'SYSCOHADA', BF: 'SYSCOHADA',
  NE: 'SYSCOHADA', BJ: 'SYSCOHADA', TG: 'SYSCOHADA', GW: 'SYSCOHADA',
  CM: 'SYSCOHADA', GA: 'SYSCOHADA', CG: 'SYSCOHADA', TD: 'SYSCOHADA',
  CF: 'SYSCOHADA', GQ: 'SYSCOHADA',
  // 🌍 Maghreb
  MA: 'MA_PCM', TN: 'TN_PCT', DZ: 'DZ_SCF',
};

// ============================================================
// 📋 RÉFÉRENTIELS COMPTABLES PAR PAYS
// ============================================================
interface SectionDefinition {
  key: string;
  label: string;
  icon: string;
  color: string;
  description?: string;
  isDefault?: boolean;
  order?: number;
}

interface AccountingStandard {
  code: string;
  name: string;
  description: string;
  countries: string[];
  sections: SectionDefinition[];
  vatLabel: string;
}

const ACCOUNTING_STANDARDS: Record<string, AccountingStandard> = {
  FR_PCG: {
    code: 'FR_PCG',
    name: 'PCG France',
    description: 'Plan Comptable Général français (classes 1 à 8)',
    countries: ['FR'],
    vatLabel: 'TVA intracommunautaire',
    sections: [
      { key: 'ventes', label: 'Ventes (Revenus)', icon: 'TrendingUp', color: 'emerald', description: 'Classe 7 - Comptes de produits', isDefault: true, order: 1 },
      { key: 'clients', label: 'Clients', icon: 'Users', color: 'blue', description: 'Classe 411 - Créances clients', isDefault: true, order: 2 },
      { key: 'tva', label: 'TVA', icon: 'Receipt', color: 'purple', description: 'Comptes 4456/4457 - TVA déductible/collectée', isDefault: true, order: 3 },
      { key: 'tresorerie', label: 'Trésorerie', icon: 'Landmark', color: 'cyan', description: 'Classe 5 - Comptes financiers', isDefault: true, order: 4 },
      { key: 'fournisseurs', label: 'Fournisseurs', icon: 'ShoppingBag', color: 'amber', description: 'Classe 401 - Dettes fournisseurs', isDefault: true, order: 5 },
      { key: 'achats', label: 'Achats (Dépenses)', icon: 'Wallet', color: 'red', description: 'Classe 6 - Comptes de charges', isDefault: true, order: 6 },
    ],
  },
  SYSCOHADA: {
    code: 'SYSCOHADA',
    name: 'SYSCOHADA',
    description: 'Système comptable OHADA — 14 pays d\'Afrique francophone (XOF/XAF)',
    countries: ['SN', 'CI', 'ML', 'BF', 'NE', 'BJ', 'TG', 'GW', 'CM', 'GA', 'CG', 'TD', 'CF', 'GQ'],
    vatLabel: 'TVA (OHADA)',
    sections: [
      { key: 'ventes', label: 'Ventes', icon: 'TrendingUp', color: 'emerald', description: 'Classe 70 - Ventes de biens et services', isDefault: true, order: 1 },
      { key: 'clients', label: 'Clients', icon: 'Users', color: 'blue', description: 'Classe 41 - Créances clients', isDefault: true, order: 2 },
      { key: 'tva', label: 'TVA', icon: 'Receipt', color: 'purple', description: 'Comptes 443/445 - TVA collectée/déductible', isDefault: true, order: 3 },
      { key: 'tresorerie', label: 'Trésorerie', icon: 'Landmark', color: 'cyan', description: 'Classe 52/57 - Banques/Caisse', isDefault: true, order: 4 },
      { key: 'fournisseurs', label: 'Fournisseurs', icon: 'ShoppingBag', color: 'amber', description: 'Classe 40 - Dettes fournisseurs', isDefault: true, order: 5 },
      { key: 'achats', label: 'Achats', icon: 'Wallet', color: 'red', description: 'Classe 60 - Achats et variations de stocks', isDefault: true, order: 6 },
      { key: 'personnel', label: 'Charges de personnel', icon: 'Users', color: 'pink', description: 'Classe 66 - Charges de personnel', isDefault: true, order: 7 },
    ],
  },
  MA_PCM: {
    code: 'MA_PCM',
    name: 'PCM Maroc',
    description: 'Plan Comptable Marocain (CGNC)',
    countries: ['MA'],
    vatLabel: 'TVA Maroc',
    sections: [
      { key: 'ventes', label: 'Ventes', icon: 'TrendingUp', color: 'emerald', description: 'Classe 71 - Ventes de biens et services', isDefault: true, order: 1 },
      { key: 'clients', label: 'Clients', icon: 'Users', color: 'blue', description: 'Classe 342 - Créances clients', isDefault: true, order: 2 },
      { key: 'tva', label: 'TVA', icon: 'Receipt', color: 'purple', description: 'Comptes 3455/4455 - TVA récupérable/facturée', isDefault: true, order: 3 },
      { key: 'tresorerie', label: 'Trésorerie', icon: 'Landmark', color: 'cyan', description: 'Classe 51 - Trésorerie-Actif', isDefault: true, order: 4 },
      { key: 'fournisseurs', label: 'Fournisseurs', icon: 'ShoppingBag', color: 'amber', description: 'Classe 441 - Dettes fournisseurs', isDefault: true, order: 5 },
      { key: 'achats', label: 'Achats', icon: 'Wallet', color: 'red', description: 'Classe 61 - Achats consommés', isDefault: true, order: 6 },
    ],
  },
  TN_PCT: {
    code: 'TN_PCT',
    name: 'PCT Tunisie',
    description: 'Plan Comptable Tunisien',
    countries: ['TN'],
    vatLabel: 'TVA Tunisie',
    sections: [
      { key: 'ventes', label: 'Produits', icon: 'TrendingUp', color: 'emerald', description: 'Classe 7 - Produits d\'exploitation', isDefault: true, order: 1 },
      { key: 'clients', label: 'Clients', icon: 'Users', color: 'blue', description: 'Classe 41 - Clients', isDefault: true, order: 2 },
      { key: 'tva', label: 'État & TVA', icon: 'Receipt', color: 'purple', description: 'Comptes 436 - État TVA', isDefault: true, order: 3 },
      { key: 'tresorerie', label: 'Trésorerie', icon: 'Landmark', color: 'cyan', description: 'Classe 5 - Liquidités', isDefault: true, order: 4 },
      { key: 'fournisseurs', label: 'Fournisseurs', icon: 'ShoppingBag', color: 'amber', description: 'Classe 40 - Fournisseurs', isDefault: true, order: 5 },
      { key: 'achats', label: 'Charges', icon: 'Wallet', color: 'red', description: 'Classe 6 - Charges d\'exploitation', isDefault: true, order: 6 },
    ],
  },
  DZ_SCF: {
    code: 'DZ_SCF',
    name: 'SCF Algérie',
    description: 'Système Comptable Financier algérien',
    countries: ['DZ'],
    vatLabel: 'TVA Algérie',
    sections: [
      { key: 'ventes', label: 'Ventes', icon: 'TrendingUp', color: 'emerald', isDefault: true, order: 1 },
      { key: 'clients', label: 'Clients', icon: 'Users', color: 'blue', isDefault: true, order: 2 },
      { key: 'tva', label: 'TVA', icon: 'Receipt', color: 'purple', isDefault: true, order: 3 },
      { key: 'tresorerie', label: 'Disponibilités', icon: 'Landmark', color: 'cyan', isDefault: true, order: 4 },
      { key: 'fournisseurs', label: 'Fournisseurs', icon: 'ShoppingBag', color: 'amber', isDefault: true, order: 5 },
      { key: 'achats', label: 'Charges', icon: 'Wallet', color: 'red', isDefault: true, order: 6 },
    ],
  },
  BE_PCMN: {
    code: 'BE_PCMN',
    name: 'PCMN Belgique',
    description: 'Plan Comptable Minimum Normalisé belge',
    countries: ['BE'],
    vatLabel: 'TVA Belgique',
    sections: [
      { key: 'ventes', label: 'Ventes', icon: 'TrendingUp', color: 'emerald', isDefault: true, order: 1 },
      { key: 'clients', label: 'Créances', icon: 'Users', color: 'blue', isDefault: true, order: 2 },
      { key: 'tva', label: 'TVA', icon: 'Receipt', color: 'purple', isDefault: true, order: 3 },
      { key: 'tresorerie', label: 'Liquidités', icon: 'Landmark', color: 'cyan', isDefault: true, order: 4 },
      { key: 'fournisseurs', label: 'Dettes', icon: 'ShoppingBag', color: 'amber', isDefault: true, order: 5 },
      { key: 'achats', label: 'Achats', icon: 'Wallet', color: 'red', isDefault: true, order: 6 },
    ],
  },
  CH_PCS: {
    code: 'CH_PCS',
    name: 'PCS Suisse',
    description: 'Plan Comptable Suisse',
    countries: ['CH'],
    vatLabel: 'TVA Suisse',
    sections: [
      { key: 'ventes', label: 'Produits', icon: 'TrendingUp', color: 'emerald', isDefault: true, order: 1 },
      { key: 'clients', label: 'Débiteurs', icon: 'Users', color: 'blue', isDefault: true, order: 2 },
      { key: 'tva', label: 'TVA', icon: 'Receipt', color: 'purple', isDefault: true, order: 3 },
      { key: 'tresorerie', label: 'Actifs', icon: 'Landmark', color: 'cyan', isDefault: true, order: 4 },
      { key: 'fournisseurs', label: 'Créanciers', icon: 'ShoppingBag', color: 'amber', isDefault: true, order: 5 },
      { key: 'achats', label: 'Charges', icon: 'Wallet', color: 'red', isDefault: true, order: 6 },
    ],
  },
  GENERIC: {
    code: 'GENERIC',
    name: 'Plan générique',
    description: 'Plan comptable simplifié (adapté à tout pays)',
    countries: [],
    vatLabel: 'Taxes',
    sections: [
      { key: 'ventes', label: 'Revenus', icon: 'TrendingUp', color: 'emerald', isDefault: true, order: 1 },
      { key: 'clients', label: 'Créances clients', icon: 'Users', color: 'blue', isDefault: true, order: 2 },
      { key: 'tva', label: 'Taxes', icon: 'Receipt', color: 'purple', isDefault: true, order: 3 },
      { key: 'tresorerie', label: 'Banques et caisse', icon: 'Landmark', color: 'cyan', isDefault: true, order: 4 },
      { key: 'fournisseurs', label: 'Dettes fournisseurs', icon: 'ShoppingBag', color: 'amber', isDefault: true, order: 5 },
      { key: 'achats', label: 'Charges', icon: 'Wallet', color: 'red', isDefault: true, order: 6 },
    ],
  },
};

// ============================================================
// 📋 INTERFACES
// ============================================================
interface CustomSection {
  key: string;
  label: string;
  icon: string;
  color: string;
  description?: string;
  order: number;
  isCustom: true;
}

// ============================================================
// 🧩 COMPOSANT PRINCIPAL
// ============================================================
export default function AccountMapping() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const { customTeamId, appwriteTeamId } = useTeam();
  const { companySettings } = useCompanySettings();

  // 🌍 Pays de l'entreprise
  const countryCode = companySettings?.country || 'FR';
  const countryConfig: CountryConfig = useMemo(
    () => getCountryConfig(countryCode),
    [countryCode]
  );

  // 🎯 Détection automatique du référentiel selon le pays
  const detectedStandard = useMemo(
    () => COUNTRY_TO_STANDARD[countryCode] || 'GENERIC',
    [countryCode]
  );

  const [selectedStandard, setSelectedStandard] = useState<string>(detectedStandard);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [customized, setCustomized] = useState(false);
  
  const [formData, setFormData] = useState<Record<string, { number: string; label: string }>>({});
  const [customAccounts, setCustomAccounts] = useState<CustomAccount[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustom, setEditingCustom] = useState<CustomAccount | null>(null);
  const [newAccount, setNewAccount] = useState({
    number: '', label: '', description: '', section: 'achats',
  });

  const [showSectionModal, setShowSectionModal] = useState(false);
  const [editingSection, setEditingSection] = useState<CustomSection | null>(null);
  const [newSection, setNewSection] = useState({
    label: '', icon: 'FolderPlus', color: 'indigo', description: '',
  });

  // ⚡ Synchroniser le référentiel détecté quand le pays change
  useEffect(() => {
    setSelectedStandard(detectedStandard);
  }, [detectedStandard]);

  useEffect(() => {
    if (!permLoading && !hasPermission('settings.edit')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user || !customTeamId) return;
    loadMapping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, customTeamId]);

  const currentStandard = ACCOUNTING_STANDARDS[selectedStandard] || ACCOUNTING_STANDARDS.GENERIC;

  // Vérifier si le référentiel choisi correspond au pays
  const isStandardMatchingCountry = useMemo(() => {
    if (selectedStandard === 'GENERIC') return true;
    return currentStandard.countries.includes(countryCode);
  }, [selectedStandard, currentStandard, countryCode]);

  const allSections = useMemo(() => {
    const defaultSections = currentStandard.sections.map(s => ({
      ...s,
      isCustom: false as const,
      order: s.order || 99,
    }));
    const customWithOrder = customSections.map(s => ({ ...s, isCustom: true as const }));
    return [...defaultSections, ...customWithOrder].sort((a, b) => a.order - b.order);
  }, [currentStandard, customSections]);

  const isSecureContext = (): boolean => {
    if (!user || !customTeamId || !appwriteTeamId) {
      toast.error('Session invalide');
      return false;
    }
    return true;
  };

  const loadMapping = async () => {
    if (!customTeamId) return;
    setLoading(true);
    try {
      const result = await loadCustomAccountMapping(customTeamId);
      setCustomized(result.customized || false);
      setCustomAccounts(result.customAccounts || []);
      if (result.customSections && Array.isArray(result.customSections)) {
        setCustomSections(result.customSections);
      }
      if (result.mapping?.accountingStandard) {
        setSelectedStandard(result.mapping.accountingStandard);
      }
      const data: Record<string, { number: string; label: string }> = {};
      DEFAULT_PCG_ARTISAN.forEach(cat => {
        data[cat.key] = { number: cat.defaultNumber, label: cat.defaultLabel };
      });
      setFormData(data);
    } catch (error: any) {
      toast.error('Erreur de chargement', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!isSecureContext()) return;
    setSaving(true);
    try {
      const updates = Object.entries(formData).map(([category, value]) => ({
        category, accountNumber: value.number, accountLabel: value.label,
      }));
      // Ligne 352 - Passe customTeamId ET appwriteTeamId
await saveAccountMapping(
  customTeamId!,      // ✅ ID custom de l'équipe
  appwriteTeamId!,    // ✅ ID natif Appwrite (pour permissions RLS)
  updates,
  customAccounts,
  { accountingStandard, country, customSections }
);
      setCustomized(true);
      toast.success('Plan comptable sauvegardé', {
        description: `${countryConfig.flag} ${countryConfig.name} • ${currentStandard.name} • ${updates.length} compte(s)`,
      });
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!isSecureContext()) return;
    setResetting(true);
    try {
      await resetToDefaultMapping(customTeamId!, appwriteTeamId!, true);
      setCustomSections([]);
      await loadMapping();
      setCustomized(false);
      toast.success('Plan comptable restauré');
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    } finally {
      setResetting(false);
    }
  };

  const handleChange = (categoryKey: string, field: 'number' | 'label', value: string) => {
    setFormData(prev => ({
      ...prev,
      [categoryKey]: { ...prev[categoryKey], [field]: value },
    }));
  };

  const isModified = (cat: AccountCategory): boolean => {
    const current = formData[cat.key];
    if (!current) return false;
    return current.number !== cat.defaultNumber || current.label !== cat.defaultLabel;
  };

  const openAddModal = (section: string) => {
    setNewAccount({ number: '', label: '', description: '', section });
    setEditingCustom(null);
    setShowAddModal(true);
  };

  const openEditModal = (custom: CustomAccount) => {
    setNewAccount({
      number: custom.number, label: custom.label,
      description: custom.description || '', section: custom.section,
    });
    setEditingCustom(custom);
    setShowAddModal(true);
  };

  const handleSaveCustom = () => {
    if (!/^\d{1,10}$/.test(newAccount.number)) {
      toast.error('Numéro invalide');
      return;
    }
    if (!newAccount.label.trim()) {
      toast.error('Libellé obligatoire');
      return;
    }
    if (editingCustom) {
      setCustomAccounts(prev => prev.map(acc =>
        acc.key === editingCustom.key ? { ...acc, ...newAccount } : acc
      ));
      toast.success('Compte modifié');
    } else {
      const key = `custom_${Date.now()}`;
      setCustomAccounts(prev => [...prev, {
        key, number: newAccount.number, label: newAccount.label,
        description: newAccount.description, section: newAccount.section,
      }]);
      toast.success('Compte ajouté');
    }
    setShowAddModal(false);
    setEditingCustom(null);
  };

  const handleDeleteCustom = async (custom: CustomAccount) => {
    if (!confirm(`Supprimer le compte ${custom.number} ?`)) return;
    try {
      if (custom.id && appwriteTeamId) {
        await deleteCustomAccount(custom.id, appwriteTeamId);
      }
      setCustomAccounts(prev => prev.filter(acc => acc.key !== custom.key));
      toast.success('Compte supprimé');
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const openSectionModal = (section?: CustomSection) => {
    if (section) {
      setEditingSection(section);
      setNewSection({
        label: section.label, icon: section.icon,
        color: section.color, description: section.description || '',
      });
    } else {
      setEditingSection(null);
      setNewSection({ label: '', icon: 'FolderPlus', color: 'indigo', description: '' });
    }
    setShowSectionModal(true);
  };

  const handleSaveSection = () => {
    if (!newSection.label.trim()) {
      toast.error('Libellé obligatoire');
      return;
    }
    if (editingSection) {
      setCustomSections(prev => prev.map(s =>
        s.key === editingSection.key ? { ...s, ...newSection } : s
      ));
      toast.success('Section modifiée');
    } else {
      const key = `custom_${Date.now()}`;
      const maxOrder = Math.max(...allSections.map(s => s.order), 0);
      setCustomSections(prev => [...prev, {
        key, label: newSection.label, icon: newSection.icon, color: newSection.color,
        description: newSection.description, order: maxOrder + 1, isCustom: true,
      }]);
      toast.success('Section créée');
    }
    setShowSectionModal(false);
    setEditingSection(null);
  };

  const handleDeleteSection = (section: CustomSection) => {
    if (!confirm(`Supprimer la section "${section.label}" ?`)) return;
    setCustomSections(prev => prev.filter(s => s.key !== section.key));
    setCustomAccounts(prev => prev.filter(a => a.section !== section.key));
    toast.success('Section supprimée');
  };

  if (permLoading || loading) {
    return (
      <Sidebar>
        <div className="min-h-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-purple-600" />
        </div>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
          <div className="max-w-[1400px] mx-auto px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/export-comptable')}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <BookOpen size={18} className="text-purple-600 dark:text-purple-400" />
                  <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
                    Plan Comptable
                  </h1>
                  <Badge tone="purple">{currentStandard.name}</Badge>
                  <Badge tone="slate">
                    {countryConfig.flag} {countryConfig.name}
                  </Badge>
                  {customized && <Badge tone="indigo">Personnalisé</Badge>}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Plan adapté au référentiel comptable {countryConfig.name}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                disabled={resetting}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg disabled:opacity-50"
              >
                {resetting ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Réinitialiser
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 shadow-lg shadow-purple-500/20 disabled:opacity-50"
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-[1400px] mx-auto px-6 lg:px-8 py-6 space-y-6">

          {/* ========== 🌍 CARTE CONTEXTE PAYS ========== */}
          <Card className="bg-gradient-to-br from-indigo-50 via-purple-50 to-cyan-50 dark:from-indigo-950/30 dark:via-purple-950/30 dark:to-cyan-950/30 border border-indigo-200/50 dark:border-indigo-900/50">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 text-3xl shadow-lg">
                {countryConfig.flag}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                  Plan comptable adapté à {countryConfig.name}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                  {/* Devise */}
                  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-white dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Devise
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {countryConfig.currency}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {countryConfig.currencySymbol || countryConfig.currency}
                    </p>
                  </div>

                  {/* TVA */}
                  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-white dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      {countryConfig.vat?.label || 'TVA'}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {countryConfig.vat?.enabled
                        ? `${countryConfig.vat.standardRates[0]}%`
                        : 'Non applicable'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {countryConfig.vat?.enabled
                        ? `Taux : ${countryConfig.vat.standardRates.join('%, ')}%`
                        : 'Pas de TVA'}
                    </p>
                  </div>

                  {/* Conservation */}
                  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-white dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Conservation
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {countryConfig.retentionYears} ans
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      Durée légale documents
                    </p>
                  </div>

                  {/* UE / Zone */}
                  <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-lg p-3 border border-white dark:border-slate-700">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                      Zone
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {countryConfig.vat?.isEU ? '🇪🇺 UE' : 
                       ['XOF', 'XAF'].includes(countryConfig.currency) ? '🌍 CFA' : 
                       '🌐 International'}
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      {countryConfig.vat?.isEU ? 'VIES applicable' : 'Hors UE'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ========== ⚠️ Alerte si référentiel ne correspond pas ========== */}
          {!isStandardMatchingCountry && selectedStandard !== 'GENERIC' && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-amber-900 dark:text-amber-200">
                <p className="font-semibold mb-1">
                  ⚠️ Référentiel différent du pays de votre entreprise
                </p>
                <p>
                  Votre entreprise est en <strong>{countryConfig.flag} {countryConfig.name}</strong> mais vous utilisez le plan <strong>{currentStandard.name}</strong>. 
                  Assurez-vous que cela correspond à votre situation comptable.
                </p>
              </div>
            </div>
          )}

          {/* ========== SÉLECTEUR DE RÉFÉRENTIEL ========== */}
          <Card className="bg-white dark:bg-slate-800">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <Globe size={16} className="text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
                  Référentiel comptable
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Le plan <strong>{currentStandard.name}</strong> a été automatiquement détecté pour {countryConfig.flag} {countryConfig.name}. 
                  Vous pouvez en changer si nécessaire.
                </p>
              </div>
            </div>
            <Select
              value={selectedStandard}
              onChange={(e: any) => {
                if ((customSections.length > 0 || customAccounts.length > 0) && selectedStandard !== e.target.value) {
                  if (!confirm('Changer de référentiel peut désorganiser vos sections et comptes personnalisés. Continuer ?')) return;
                }
                setSelectedStandard(e.target.value);
              }}
            >
              {Object.entries(ACCOUNTING_STANDARDS).map(([code, std]) => (
                <option key={code} value={code}>
                  {std.name} — {std.description}
                </option>
              ))}
            </Select>
          </Card>

          {/* Bouton créer section */}
          <div className="flex justify-end">
            <button
              onClick={() => openSectionModal()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg hover:from-cyan-700 hover:to-blue-700 shadow-lg shadow-cyan-500/20"
            >
              <FolderPlus size={16} />
              Créer une section personnalisée
            </button>
          </div>

          {/* ========== SECTIONS ========== */}
          {allSections.map(section => {
            const SectionIcon = ICON_MAP[section.icon] || FolderPlus;
            const colorStyle = getColorStyle(section.color);
            const sectionCategories = DEFAULT_PCG_ARTISAN.filter(c => c.section === section.key);
            const sectionCustomAccounts = customAccounts.filter(c => c.section === section.key);

            return (
              <Card 
                key={section.key}
                className={`bg-white dark:bg-slate-800 border rounded-xl p-5 ${
                  section.isCustom 
                    ? `${colorStyle.border} ring-1 ${colorStyle.ring}` 
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${colorStyle.bg} flex items-center justify-center`}>
                      <SectionIcon size={18} className={colorStyle.text} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{section.label}</h3>
                        {section.isCustom ? (
                          <Badge tone="cyan">✨ Custom</Badge>
                        ) : (
                          <Badge tone="slate">Standard</Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {section.description || `${sectionCategories.length + sectionCustomAccounts.length} compte(s)`}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {section.isCustom && (
                      <>
                        <button
                          onClick={() => openSectionModal(section)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-purple-600"
                          title="Modifier"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteSection(section)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 hover:text-red-600"
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => openAddModal(section.key)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg hover:bg-purple-100"
                    >
                      <Plus size={12} />
                      Ajouter un compte
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {sectionCategories.map(cat => {
                    const current = formData[cat.key];
                    const modified = isModified(cat);
                    return (
                      <div
                        key={cat.key}
                        className={`p-4 rounded-lg border transition-all ${
                          modified 
                            ? 'border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{cat.label}</h4>
                              {modified && <Badge tone="purple">Modifié</Badge>}
                              {cat.required && <Badge tone="red">Obligatoire</Badge>}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{cat.description}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              Numéro
                            </label>
                            <Input
                              type="text"
                              value={current?.number || ''}
                              onChange={(e: any) => handleChange(cat.key, 'number', e.target.value.replace(/\D/g, ''))}
                              maxLength={10}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                              Libellé
                            </label>
                            <Input
                              type="text"
                              value={current?.label || ''}
                              onChange={(e: any) => handleChange(cat.key, 'label', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {sectionCustomAccounts.map(custom => (
                    <div
                      key={custom.key}
                      className="p-4 rounded-lg border-2 border-dashed border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/20"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{custom.label}</h4>
                            <Badge tone="amber">✨ Personnalisé</Badge>
                          </div>
                          {custom.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{custom.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditModal(custom)}
                            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-purple-600"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteCustom(custom)}
                            className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Numéro
                          </label>
                          <Input
                            type="text"
                            value={custom.number}
                            onChange={(e: any) => {
                              const value = e.target.value.replace(/\D/g, '');
                              setCustomAccounts(prev => prev.map(acc =>
                                acc.key === custom.key ? { ...acc, number: value } : acc
                              ));
                            }}
                            maxLength={10}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                            Libellé
                          </label>
                          <Input
                            type="text"
                            value={custom.label}
                            onChange={(e: any) => {
                              setCustomAccounts(prev => prev.map(acc =>
                                acc.key === custom.key ? { ...acc, label: e.target.value } : acc
                              ));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {sectionCategories.length === 0 && sectionCustomAccounts.length === 0 && (
                    <div className="text-center py-8 text-xs text-slate-400">
                      Aucun compte dans cette section
                    </div>
                  )}
                </div>
              </Card>
            );
          })}

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              <strong>💡 Adaptation automatique :</strong> Le plan comptable a été pré-configuré pour {countryConfig.flag} <strong>{countryConfig.name}</strong> 
              ({countryConfig.currency}, {countryConfig.vat?.label || 'TVA'} {countryConfig.vat?.standardRates[0] || 0}%). 
              Créez des sections personnalisées pour adapter votre comptabilité à votre activité.
            </div>
          </div>
        </main>

        {/* ========== MODAL COMPTE ========== */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  {editingCustom ? <Edit3 size={18} className="text-purple-600" /> : <Plus size={18} className="text-purple-600" />}
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {editingCustom ? 'Modifier le compte' : 'Ajouter un compte'}
                  </h3>
                </div>
                <button
                  onClick={() => { setShowAddModal(false); setEditingCustom(null); }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Section *
                  </label>
                  <Select
                    value={newAccount.section}
                    onChange={(e: any) => setNewAccount(prev => ({ ...prev, section: e.target.value }))}
                  >
                    {allSections.map(s => (
                      <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Numéro *
                    </label>
                    <Input
                      type="text"
                      value={newAccount.number}
                      onChange={(e: any) => setNewAccount(prev => ({ ...prev, number: e.target.value.replace(/\D/g, '') }))}
                      maxLength={10}
                      placeholder="606300"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Libellé *
                    </label>
                    <Input
                      type="text"
                      value={newAccount.label}
                      onChange={(e: any) => setNewAccount(prev => ({ ...prev, label: e.target.value }))}
                      placeholder="Outillage"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Description
                  </label>
                  <Input
                    type="text"
                    value={newAccount.description}
                    onChange={(e: any) => setNewAccount(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => { setShowAddModal(false); setEditingCustom(null); }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveCustom}
                  disabled={!newAccount.number || !newAccount.label}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg disabled:opacity-50"
                >
                  {editingCustom ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========== MODAL SECTION ========== */}
        {showSectionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <FolderPlus size={18} className="text-cyan-600" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    {editingSection ? 'Modifier la section' : 'Nouvelle section'}
                  </h3>
                </div>
                <button
                  onClick={() => { setShowSectionModal(false); setEditingSection(null); }}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Nom *
                  </label>
                  <Input
                    type="text"
                    value={newSection.label}
                    onChange={(e: any) => setNewSection(prev => ({ ...prev, label: e.target.value }))}
                    placeholder="Ex: Immobilisations"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Icône
                    </label>
                    <Select
                      value={newSection.icon}
                      onChange={(e: any) => setNewSection(prev => ({ ...prev, icon: e.target.value }))}
                    >
                      {Object.keys(ICON_MAP).map(icon => (
                        <option key={icon} value={icon}>{icon}</option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                      Couleur
                    </label>
                    <Select
                      value={newSection.color}
                      onChange={(e: any) => setNewSection(prev => ({ ...prev, color: e.target.value }))}
                    >
                      {Object.keys(COLOR_STYLES).map(color => (
                        <option key={color} value={color}>{color}</option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                    Description
                  </label>
                  <Input
                    type="text"
                    value={newSection.description}
                    onChange={(e: any) => setNewSection(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Aperçu
                  </p>
                  <div className="flex items-center gap-3">
                    {(() => {
                      const Icon = ICON_MAP[newSection.icon] || FolderPlus;
                      const colorStyle = getColorStyle(newSection.color);
                      return (
                        <>
                          <div className={`w-10 h-10 rounded-lg ${colorStyle.bg} flex items-center justify-center`}>
                            <Icon size={18} className={colorStyle.text} />
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                              {newSection.label || 'Nom de la section'}
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {newSection.description || 'Description'}
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 p-5 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => { setShowSectionModal(false); setEditingSection(null); }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveSection}
                  disabled={!newSection.label}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 rounded-lg disabled:opacity-50"
                >
                  {editingSection ? 'Modifier' : 'Créer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}