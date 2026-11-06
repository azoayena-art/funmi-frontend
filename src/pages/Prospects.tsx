import Sidebar from '../components/Sidebar';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import { toast } from 'sonner';
import {
  PageHeader, Modal, ActionMenu, ActionMenuItem, StatCell, StatusIndicator,
  DotLabel, Avatar, SkeletonRow, SkeletonCard, TypeTabs, KPIGrid, Pagination,
  type DotTone,
} from '../components/ui/SharedUI';
import {
  Plus, Search, Edit2, Phone, Mail, Building, FileText,
  Users, Filter, AlertCircle, UserCheck, Archive, RotateCcw,
  Globe, Shield, MapPin, Hash, Home, FileSpreadsheet
} from 'lucide-react';
import { Query, ID } from 'appwrite';
// ✅ IMPORT DYNAMIQUE DE LA LISTE DES PAYS
import { listCountryOptions } from '../config/countries';

// ============================================================
// 📋 INTERFACES
// ============================================================
interface Prospect {
  $id: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  phone?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  source: string;
  status: string;
  needs?: string;
  notes?: string;
  firstContactDate?: string;
  lastContactDate?: string;
  teamId?: string;
  siren?: string;
  siret?: string;
  vatNumber?: string;
  $createdAt?: string;
}

const statusLabels: Record<string, string> = {
  new: 'Nouveau',
  contacted: 'Contacté',
  quote_sent: 'Devis envoyé',
  pending: 'En attente',
  followup: 'Relance',
  won: 'Gagné',
  lost: 'Perdu',
  archived: 'Archivé'
};

const sourceLabels: Record<string, string> = {
  website: 'Site web',
  phone: 'Téléphone',
  referral: 'Recommandation',
  other: 'Autre'
};

const sourceTones: Record<string, DotTone> = {
  website: 'sky',
  phone: 'teal',
  referral: 'violet',
  other: 'slate'
};

export default function Prospects() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  
  // ✅ Récupération STRICTE du pays de l'entreprise
  const { currency, currencyConfig, country: companyCountry, loading: settingsLoading } = useCompanySettings();
  const { customTeamId, appwriteTeamId } = useTeam();

  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // ✅ Factory fonction : utilise companyCountry. Si indéfini, laisse vide (''), PAS de 'FR' en dur.
  const getDefaultForm = useCallback(() => ({
    firstName: '',
    lastName: '',
    companyName: '',
    phone: '',
    email: '',
    address: '',
    postalCode: '',
    city: '',
    country: companyCountry || '', 
    source: 'other',
    status: 'new',
    needs: '',
    notes: '',
    siren: '',
    siret: '',
    vatNumber: ''
  }), [companyCountry]);

  const [form, setForm] = useState(getDefaultForm());
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [saving, setSaving] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState<Prospect | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [prospectToArchive, setProspectToArchive] = useState<Prospect | null>(null);
  const [prospectToConvert, setProspectToConvert] = useState<Prospect | null>(null);
  const [converting, setConverting] = useState(false);
  const [activeStat, setActiveStat] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const ITEMS_PER_PAGE = 20;

  const isFrenchCompany = !!form.companyName?.trim() && form.country === 'FR';
  const isCompany = !!form.companyName?.trim();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!permLoading && !hasPermission('prospects.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (!customTeamId) return;
    loadProspects();
  }, [user, viewMode, customTeamId]);

  // Met à jour le formulaire si le pays de l'entreprise change en arrière-plan
  useEffect(() => {
    if (!showModal && !editingId && companyCountry && !form.country) {
      setForm(prev => ({ ...prev, country: companyCountry }));
    }
  }, [companyCountry, showModal, editingId, form.country]);

  const loadProspects = async (background = false) => {
    if (!background) setLoading(true);
    try {
      if (!customTeamId) {
        if (!background) setLoading(false);
        return;
      }

      const response = await databases.listDocuments(
        DATABASE_ID, 'prospects',
        [Query.equal('teamId', customTeamId), Query.orderDesc('$createdAt'), Query.limit(2000)]
      );
      setProspects(response.documents as unknown as Prospect[]);
    } catch (error) {
      console.error('Erreur chargement prospects:', error);
      toast.error('Erreur de chargement des prospects');
    } finally {
      if (!background) setLoading(false);
    }
  };

  const checkDuplicate = async (): Promise<Prospect | null> => {
    if (!form.email && !form.phone) return null;
    if (!customTeamId) return null;

    try {
      const queries = [];
      if (form.email) queries.push(Query.equal('email', form.email.toLowerCase().trim()));
      if (form.phone) queries.push(Query.equal('phone', form.phone.replace(/\s/g, '')));

      if (queries.length === 0) return null;

      const response = await databases.listDocuments(DATABASE_ID, 'prospects', [
        Query.equal('teamId', customTeamId),
        Query.or(queries),
        Query.limit(5)
      ]);

      return response.documents.find((p: any) =>
        (form.email && p.email === form.email.toLowerCase().trim()) ||
        (form.phone && p.phone === form.phone.replace(/\s/g, ''))
      ) as Prospect | null || null;
    } catch (error) {
      console.error('Erreur vérification doublon:', error);
      return null;
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setDuplicateFound(null);
    // ✅ Utilise strictement la factory qui dépend de companyCountry
    setForm(getDefaultForm());
    setShowModal(true);
  };

  const handleOpenEdit = (prospect: Prospect) => {
    if (prospect.teamId !== customTeamId) {
      toast.error('Accès refusé : Ce prospect n\'appartient pas à votre équipe.');
      return;
    }

    setEditingId(prospect.$id);
    setDuplicateFound(null);

    setForm({
      firstName: prospect.firstName || '',
      lastName: prospect.lastName || '',
      companyName: prospect.companyName || '',
      phone: prospect.phone || '',
      email: prospect.email || '',
      address: prospect.address || '',
      postalCode: prospect.postalCode || '',
      city: prospect.city || '',
      // ✅ Priorité : Pays du prospect > Pays de l'entreprise > Vide (pas de 'FR' forcé)
      country: prospect.country || companyCountry || '',
      source: prospect.source || 'other',
      status: prospect.status === 'archived' ? 'new' : prospect.status,
      needs: prospect.needs || '',
      notes: prospect.notes || '',
      siren: prospect.siren || '',
      siret: prospect.siret || '',
      vatNumber: prospect.vatNumber || ''
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.firstName || !form.lastName) {
      toast.error('Champs requis', { description: 'Veuillez remplir le prénom et le nom.' });
      return;
    }

    if (isFrenchCompany) {
      if (!form.siren || !/^\d{9}$/.test(form.siren)) {
        toast.error('SIREN obligatoire', { description: 'Pour une entreprise en France, le SIREN (9 chiffres) est requis.' });
        return;
      }
      if (!form.siret || !/^\d{14}$/.test(form.siret)) {
        toast.error('SIRET obligatoire', { description: 'Pour une entreprise en France, le SIRET (14 chiffres) est requis.' });
        return;
      }
    }

    if (!customTeamId) {
      toast.error('Erreur de sécurité : équipe non identifiée.');
      return;
    }

    if (!editingId && !duplicateFound) {
      const existing = await checkDuplicate();
      if (existing) { 
        setDuplicateFound(existing); 
        return; 
      }
    }

    setSaving(true);
    try {
      const data = {
        firstName: form.firstName,
        lastName: form.lastName,
        companyName: form.companyName,
        phone: form.phone,
        email: form.email,
        address: form.address,
        postalCode: form.postalCode,
        city: form.city,
        country: form.country,
        source: form.source,
        status: form.status,
        needs: form.needs,
        notes: form.notes,
        siren: isFrenchCompany ? form.siren : '',
        siret: isFrenchCompany ? form.siret : '',
        vatNumber: isCompany ? form.vatNumber : '',
        teamId: customTeamId,
      };

      if (editingId) {
        const existingDoc = await databases.getDocument(DATABASE_ID, 'prospects', editingId);
        if (existingDoc.teamId !== customTeamId) {
          toast.error('Accès refusé.');
          return;
        }
        await databases.updateDocument(DATABASE_ID, 'prospects', editingId, data);
        toast.success('Prospect mis à jour');
      } else {
        await databases.createDocument(DATABASE_ID, 'prospects', ID.unique(), data);
        toast.success('Prospect ajouté');
      }
      setShowModal(false);
      setDuplicateFound(null);
      setEditingId(null);
      setForm(getDefaultForm());
      setSearch('');
      await loadProspects();
    } catch (error: any) {
      console.error('Erreur enregistrement:', error);
      toast.error('Erreur lors de l\'enregistrement', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleConvertToClient = async () => {
    const prospect = prospectToConvert;
    if (!prospect) return;

    if (prospect.teamId !== customTeamId) {
      toast.error('Accès refusé.');
      setProspectToConvert(null);
      return;
    }

    // ✅ Détermination stricte du pays cible sans fallback 'FR'
    const targetCountry = prospect.country || companyCountry || '';

    if (prospect.companyName && targetCountry === 'FR') {
      if (!prospect.siren || !/^\d{9}$/.test(prospect.siren)) {
        toast.error('Conversion impossible', { description: 'Le SIREN est requis pour une entreprise française.' });
        return;
      }
      if (!prospect.siret || !/^\d{14}$/.test(prospect.siret)) {
        toast.error('Conversion impossible', { description: 'Le SIRET est requis pour une entreprise française.' });
        return;
      }
    }

    setConverting(true);
    try {
      const currentYear = new Date().getFullYear();
      const prefix = `CLI-${currentYear}-`;
      let maxNum = 0;
      try {
        const existingClients = await databases.listDocuments(DATABASE_ID, 'clients', [
          Query.equal('teamId', customTeamId),
          Query.limit(2000)
        ]);
        existingClients.documents.forEach((doc: any) => {
          if (doc.clientId && doc.clientId.startsWith(prefix)) {
            const num = parseInt(doc.clientId.replace(prefix, ''), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
          }
        });
      } catch (e) { 
        console.error('Erreur lecture clients existants:', e); 
      }

      const newClientId = `${prefix}${String(maxNum + 1).padStart(3, '0')}`;

      await databases.createDocument(
        DATABASE_ID, 'clients', ID.unique(),
        {
          teamId: customTeamId,
          userId: user?.$id || '',
          clientId: newClientId,
          type: prospect.companyName ? 'entreprise' : 'particulier',
          country: targetCountry,
          firstName: prospect.firstName,
          lastName: prospect.lastName,
          companyName: prospect.companyName || '',
          email: prospect.email || '',
          phone: prospect.phone || '',
          address: prospect.address || '',
          postalCode: prospect.postalCode || '',
          city: prospect.city || '',
          siren: prospect.siren || '',
          siret: prospect.siret || '',
          vatNumber: prospect.vatNumber || '',
          notes: prospect.notes ? `Converti depuis le prospect.\nNotes: ${prospect.notes}` : 'Converti depuis un prospect',
          status: 'active',
          prospectId: prospect.$id
        }
      );

      await databases.updateDocument(DATABASE_ID, 'prospects', prospect.$id, { status: 'won' });
      
      setProspectToConvert(null);
      await loadProspects(true);
      toast.success('Prospect converti en client', {
        description: `Numéro client : ${newClientId}`,
        action: { label: 'Voir les clients', onClick: () => navigate('/clients') },
      });
    } catch (error: any) {
      console.error('Erreur conversion:', error);
      toast.error('Erreur lors de la conversion', { description: error.message });
    } finally {
      setConverting(false);
    }
  };

  const handleQuickStatusChange = async (prospectId: string, newStatus: string) => {
    if (!customTeamId) return;
    try {
      const existingDoc = await databases.getDocument(DATABASE_ID, 'prospects', prospectId);
      if (existingDoc.teamId !== customTeamId) {
        toast.error('Accès refusé.');
        return;
      }
      await databases.updateDocument(DATABASE_ID, 'prospects', prospectId, { status: newStatus });
      toast.success('Statut mis à jour');
      await loadProspects(true);
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const handleArchive = async () => {
    if (!prospectToArchive || !customTeamId) return;
    try {
      if (prospectToArchive.teamId !== customTeamId) {
        toast.error('Accès refusé.');
        setProspectToArchive(null);
        return;
      }
      await databases.updateDocument(DATABASE_ID, 'prospects', prospectToArchive.$id, { status: 'archived' });
      toast.success('Prospect archivé');
      setProspectToArchive(null);
      await loadProspects(true);
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const handleUnarchive = async (id: string, name: string) => {
    if (!customTeamId) return;
    try {
      const doc = await databases.getDocument(DATABASE_ID, 'prospects', id);
      if (doc.teamId !== customTeamId) {
        toast.error('Accès refusé.');
        return;
      }
      await databases.updateDocument(DATABASE_ID, 'prospects', id, { status: 'new' });
      toast.success('Prospect désarchivé');
      await loadProspects(true);
      setViewMode('active');
    } catch (error: any) {
      toast.error('Erreur', { description: error.message });
    }
  };

  const handleOpenImportExport = () => {
    navigate('/import-export?type=prospects');
  };

  const filtered = prospects.filter(p => {
    const searchStr = `${p.firstName} ${p.lastName} ${p.companyName} ${p.email} ${p.phone} ${p.city} ${statusLabels[p.status]}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    const matchView = viewMode === 'active' ? p.status !== 'archived' : p.status === 'archived';
    return matchSearch && matchStatus && matchView;
  });

  const totalActive = prospects.filter(p => p.status !== 'archived').length;
  const totalNew = prospects.filter(p => p.status !== 'archived' && p.status === 'new').length;
  const totalQuoteSent = prospects.filter(p => p.status !== 'archived' && p.status === 'quote_sent').length;
  const totalWon = prospects.filter(p => p.status === 'won').length;
  const totalArchived = prospects.filter(p => p.status === 'archived').length;

  const now = new Date();
  const prevMonthRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const isThisMonth = (d?: string) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  };
  const isPrevMonth = (d?: string) => {
    if (!d) return false;
    const dt = new Date(d);
    return dt.getMonth() === prevMonthRef.getMonth() && dt.getFullYear() === prevMonthRef.getFullYear();
  };
  const calcTrend = (pred: (p: Prospect) => boolean) => {
    const cur = prospects.filter(p => pred(p) && isThisMonth(p.$createdAt)).length;
    const prev = prospects.filter(p => pred(p) && isPrevMonth(p.$createdAt)).length;
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };

  const trendActive = calcTrend(p => p.status !== 'archived');
  const trendNew = calcTrend(p => p.status !== 'archived' && p.status === 'new');
  const trendQuote = calcTrend(p => p.status !== 'archived' && p.status === 'quote_sent');
  const trendWon = calcTrend(p => p.status === 'won');

  const viewTabs = [
    { key: 'active', label: 'Actifs', count: totalActive },
    { key: 'archived', label: 'Archivés', count: totalArchived },
  ];

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedProspects = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, viewMode]);

  if (permLoading || settingsLoading) return (
    <Sidebar>
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Chargement...</div>
      </div>
    </Sidebar>
  );
  if (!hasPermission('prospects.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={Users}
          iconColor="purple"
          title="Prospects"
          description={
            <><span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{filtered.length}</span> résultat(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}</>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            <div className="flex gap-2 w-full sm:w-auto">
              {hasPermission('prospects.view') && (
                <button 
                  onClick={handleOpenImportExport} 
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-lg hover:border-purple-500 border border-slate-300 dark:border-slate-600 transition-all font-medium text-sm shadow-sm active:scale-95"
                >
                  <FileSpreadsheet size={18} />
                  <span>Import / Export</span>
                </button>
              )}
              {viewMode === 'active' && hasPermission('prospects.create') && (
                <button 
                  onClick={handleOpenAdd} 
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2.5 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium text-sm shadow-lg shadow-purple-500/30 active:scale-95"
                >
                  <Plus size={18} />
                  <span>Nouveau prospect</span>
                </button>
              )}
            </div>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <KPIGrid columns={4}>
            <StatCell value={totalActive} trend={trendActive} label="Prospects actifs" active={activeStat === 0} onClick={() => setActiveStat(0)} />
            <StatCell value={totalNew} trend={trendNew} label="Nouveaux" active={activeStat === 1} onClick={() => setActiveStat(1)} />
            <StatCell value={totalQuoteSent} trend={trendQuote} label="Devis envoyés" active={activeStat === 2} onClick={() => setActiveStat(2)} />
            <StatCell value={totalWon} trend={trendWon} label="Gagnés" active={activeStat === 3} onClick={() => setActiveStat(3)} />
          </KPIGrid>

          <TypeTabs
            tabs={viewTabs}
            activeTab={viewMode}
            onTabChange={(key) => setViewMode(key as 'active' | 'archived')}
            color="purple"
          />

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher (nom, entreprise, email, ville...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-16 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm transition-shadow"
              />
            </div>
            {viewMode === 'active' && (
              <div className="relative sm:w-64">
                <Filter size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm bg-white dark:bg-slate-800 appearance-none cursor-pointer">
                  <option value="all">Tous les statuts</option>
                  {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {loading ? (
            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-visible">
              <table className="w-full">
                <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prospect</th>
                    <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                    <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Localisation</th>
                    <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                    <th className="text-right px-2 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center shadow-sm">
              <Users size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Aucun prospect {viewMode === 'active' ? 'actif' : 'archivé'}</h3>
            </div>
          ) : (
            <>
              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-visible">
                <table className="w-full">
                  <thead className="bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prospect</th>
                      <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contact</th>
                      <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Localisation</th>
                      <th className="text-left px-6 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Statut</th>
                      <th className="text-right px-2 py-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {paginatedProspects.map((p) => (
                      <tr key={p.$id} className="group hover:bg-purple-50/50 dark:hover:bg-slate-700/30 transition-colors duration-200">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar client={{ firstName: p.firstName, lastName: p.lastName, companyName: p.companyName } as any} />
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">{p.firstName} {p.lastName}</div>
                              {p.companyName && (
                                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                                  <Building size={11} /> {p.companyName}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col space-y-1">
                            {p.email && <span className="flex items-center text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px]"><Mail size={13} className="mr-1.5 text-slate-400 flex-shrink-0" />{p.email}</span>}
                            {p.phone && <span className="flex items-center text-xs text-slate-600 dark:text-slate-300 tabular-nums"><Phone size={13} className="mr-1.5 text-slate-400" />{p.phone}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col space-y-1">
                            {(p.city || p.postalCode) && (
                              <span className="flex items-center text-xs text-slate-600 dark:text-slate-300">
                                <MapPin size={13} className="mr-1.5 text-slate-400 flex-shrink-0" />
                                {p.postalCode} {p.city}
                              </span>
                            )}
                            <span className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                              <Globe size={13} className="mr-1.5 text-slate-400 flex-shrink-0" />
                              {p.country || companyCountry || 'Non spécifié'}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <StatusIndicator status={p.status} />
                        </td>
                        <td className="px-2 py-4 text-right w-12">
                          <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            <ActionMenu>
                              {p.status === 'new' && hasPermission('prospects.edit') && (
                                <ActionMenuItem onClick={() => handleQuickStatusChange(p.$id, 'contacted')} icon={Phone} label="Marquer contacté" />
                              )}
                              {hasPermission('prospects.edit') && (
                                <ActionMenuItem onClick={() => handleOpenEdit(p)} icon={Edit2} label="Modifier" />
                              )}
                              {hasPermission('quotes.create') && (
                                <ActionMenuItem onClick={() => navigate(`/quotes?prospectId=${p.$id}`)} icon={FileText} label="Créer un devis" />
                              )}
                              {hasPermission('clients.create') && p.status !== 'won' && (
                                <ActionMenuItem onClick={() => setProspectToConvert(p)} icon={UserCheck} label="Convertir en client" />
                              )}
                              {hasPermission('prospects.delete') && (
                                <ActionMenuItem onClick={() => setProspectToArchive(p)} icon={Archive} label="Archiver" danger />
                              )}
                            </ActionMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                startItem={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                endItem={Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                totalItems={filtered.length}
                itemName="prospect"
              />
            </>
          )}
        </main>

        {/* MODAL Création / Édition */}
        <Modal
          open={showModal}
          onClose={() => { setShowModal(false); setDuplicateFound(null); }}
          title={editingId ? 'Modifier le prospect' : 'Nouveau prospect'}
          icon={<Users size={20} className="text-purple-600" />}
          maxWidth="sm:max-w-2xl"
          footer={
            <>
              <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.firstName || !form.lastName} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20">
                {saving ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Enregistrement...</> : (editingId ? 'Mettre à jour' : 'Ajouter')}
              </button>
            </>
          }
        >
          <div className="space-y-5">
            {duplicateFound && !editingId && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200 px-4 py-3 rounded-xl shadow-sm">
                <p className="font-semibold flex items-center gap-2 text-sm"><AlertCircle size={16} /> Doublon détecté</p>
                <p className="text-sm mt-1">Un prospect avec ces coordonnées existe déjà : <strong>{duplicateFound.firstName} {duplicateFound.lastName}</strong>.</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => { handleOpenEdit(duplicateFound); }} className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 active:scale-95 transition-transform shadow-sm">Mettre à jour</button>
                  <button type="button" onClick={() => setDuplicateFound(null)} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-transform">Créer quand même</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Prénom *</label>
                <input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="Jean" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Nom *</label>
                <input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="Dupont" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Building size={12} /> Entreprise
                </label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(e) => setForm({
                    ...form,
                    companyName: e.target.value,
                    siren: !e.target.value.trim() ? '' : form.siren,
                    siret: !e.target.value.trim() ? '' : form.siret,
                    vatNumber: !e.target.value.trim() ? '' : form.vatNumber,
                  })}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm"
                  placeholder="Nom de l'entreprise"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Globe size={12} /> Pays *
                </label>
                {/* ✅ LISTE DYNAMIQUE DES PAYS DEPUIS LA CONFIGURATION */}
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm"
                >
                  <option value="">-- Sélectionner un pays --</option>
                  {listCountryOptions().map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isFrenchCompany && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 flex gap-3">
                <Shield size={20} className="text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">Conformité Réforme 2026</p>
                  <p className="text-xs text-purple-800 dark:text-purple-300 mt-1">
                    Pour un <strong>prospect professionnel en France</strong>, le SIREN et le SIRET seront obligatoires lors de la conversion en client.
                  </p>
                </div>
              </div>
            )}

            {isFrenchCompany && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Shield size={12} className="text-purple-600 dark:text-purple-400" />
                  Identification fiscale
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">SIREN (9 chiffres) *</label>
                    <input type="text" value={form.siren} onChange={(e) => setForm({ ...form, siren: e.target.value.replace(/\D/g, '').slice(0, 9) })} placeholder="123456789" maxLength={9} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">SIRET (14 chiffres) *</label>
                    <input type="text" value={form.siret} onChange={(e) => setForm({ ...form, siret: e.target.value.replace(/\D/g, '').slice(0, 14) })} placeholder="12345678901234" maxLength={14} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none font-mono" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">N° TVA intracommunautaire</label>
                    <input type="text" value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value.toUpperCase() })} placeholder="FR12345678901" className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none font-mono" />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5"><Mail size={12} />Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="email@exemple.com" />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5"><Phone size={12} />Téléphone</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="06 12 34 56 78" />
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Home size={12} className="text-purple-600 dark:text-purple-400" /> Adresse postale
              </h4>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5"><MapPin size={11} /> Adresse</label>
                <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="123 rue de la Paix" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5"><Hash size={11} /> Code postal</label>
                  <input type="text" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: form.country === 'FR' ? e.target.value.replace(/\D/g, '').slice(0, 5) : e.target.value.slice(0, 10) })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm font-mono" placeholder={form.country === 'FR' ? '75000' : 'Code'} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Ville</label>
                  <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none shadow-sm" placeholder="Ville" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Source</label>
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700 shadow-sm">
                  {Object.entries(sourceLabels).map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Statut</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-700 shadow-sm">
                  {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (<option key={key} value={key}>{label}</option>))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Notes</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none shadow-sm" placeholder="Notes internes..." />
            </div>
          </div>
        </Modal>

        {prospectToConvert && (
          <Modal open={!!prospectToConvert} onClose={() => setProspectToConvert(null)} title="Convertir en client ?" icon={<UserCheck size={20} className="text-purple-600" />} maxWidth="sm:max-w-md" footer={
            <>
              <button onClick={() => setProspectToConvert(null)} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
              <button onClick={handleConvertToClient} disabled={converting} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl hover:from-purple-700 hover:to-indigo-700 active:scale-95 transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2 disabled:opacity-50">
                {converting ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Conversion...</> : <><UserCheck size={16} /> Convertir</>}
              </button>
            </>
          }>
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                <strong className="text-slate-700 dark:text-slate-200">{prospectToConvert.firstName} {prospectToConvert.lastName}</strong> deviendra un client actif.
              </p>
              <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Type</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{prospectToConvert.companyName ? '🏢 Entreprise' : '👤 Particulier'}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Pays</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{prospectToConvert.country || companyCountry || 'Non spécifié'}</span>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {prospectToArchive && (
          <Modal open={!!prospectToArchive} onClose={() => setProspectToArchive(null)} title="Archiver ce prospect ?" icon={<Archive size={20} className="text-red-600" />} maxWidth="sm:max-w-md" footer={
            <>
              <button onClick={() => setProspectToArchive(null)} className="flex-1 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
              <button onClick={handleArchive} className="flex-1 px-4 py-3 text-sm font-bold text-white bg-gradient-to-r from-red-500 to-red-600 rounded-xl hover:from-red-600 hover:to-red-700 active:scale-95 transition-all shadow-lg shadow-red-500/20 flex items-center justify-center gap-2">
                <Archive size={16} /> Confirmer
              </button>
            </>
          }>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              Le prospect <strong className="text-slate-700 dark:text-slate-200">{prospectToArchive.firstName} {prospectToArchive.lastName}</strong> sera masqué de la liste principale.
            </p>
          </Modal>
        )}
      </div>
    </Sidebar>
  );
}