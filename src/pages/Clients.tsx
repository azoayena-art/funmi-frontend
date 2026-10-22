import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { databases, DATABASE_ID } from '../appwrite';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useCompanySettings } from '../hooks/useCompanySettings';
import { useTeam } from '../context/TeamContext';
import Sidebar from '../components/Sidebar';
import { toast } from 'sonner';
import Modal from '../components/ui/Modal';
import ActionMenu, { ActionMenuItem } from '../components/ui/ActionMenu';
import {
  PageHeader,
  TypeTabs,
  KPIGrid,
  StatCell,
  EmptyState,
  Avatar,
  StatusIndicator,
  TypeLabel,
  SkeletonCard,
  ConfirmDialog,
  FormField,
  Input,
  Select,
  Textarea,
  Alert,
  Pagination,
  ViewTabs,
  SearchFilter,
  SelectFilter,
  MobileCard,
  DataTable,
  type Entity,
} from '../components/ui/SharedUI';
import {
  Plus, Edit2, Phone, Mail, Building,
  UserCheck, FileText, AlertCircle, Archive, RotateCcw, Hash, Eye, User,
  MapPin, Shield, Globe, Home, FileSpreadsheet
} from 'lucide-react';
import { Query, ID } from 'appwrite';

import { 
  isEInvoiceRequired, 
  validateEInvoiceFields, 
  getVisibleFields,
  validateVatNumber 
} from '../utils/eInvoicing';

import {
  getCountryConfig, getPrimaryIdentifier,
  validateIdentifier, listCountryOptions,
} from '../config/countries';

import { getTeamPermissions } from '../utils/rowLevelPermissions';

interface Client {
  $id: string;
  teamId: string;
  userId: string;
  clientId?: string;
  type: string;
  country: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  billingAddress?: string;
  siren?: string;
  siret?: string;
  vatNumber?: string;
  taxNumber?: string;
  notes?: string;
  status: string;
  prospectId?: string;
  $createdAt?: string;
}

const statusLabels: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé'
};

const emptyForm = {
  type: 'particulier',
  country: 'FR',
  firstName: '',
  lastName: '',
  companyName: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
  billingAddress: '',
  siren: '',
  siret: '',
  vatNumber: '',
  taxNumber: '',
  notes: '',
  status: 'active'
};

export default function Clients() {
  const { user } = useAuth();
  const { hasPermission, loading: permLoading } = usePermissions();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const { 
    currency, 
    currencyConfig, 
    companySettings, 
    loading: settingsLoading 
  } = useCompanySettings();
  
  const { customTeamId, appwriteTeamId } = useTeam();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [saving, setSaving] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState<Client | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');
  const [clientToArchive, setClientToArchive] = useState<Client | null>(null);
  const [activeStat, setActiveStat] = useState(0);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  
  const searchInputRef = useRef<HTMLInputElement>(null);

  const companyCountry = companySettings?.country || 'FR';
  
  const clientCountryConfig = useMemo(() => getCountryConfig(form.country), [form.country]);
  const clientPrimaryIdentifier = getPrimaryIdentifier(clientCountryConfig);
  const countryOptions = useMemo(() => listCountryOptions(), []);

  const isCompany = form.type === 'entreprise';
  const visible = getVisibleFields(companyCountry, form.country, isCompany);

  const validateClientIdentifier = (value: string): boolean => {
    if (!value || !value.trim()) return false;
    if (clientCountryConfig.code === 'FR') {
      const clean = value.replace(/\s/g, '');
      if (!/^\d{14}$/.test(clean)) return false;
      let sum = 0, isEven = false;
      for (let i = clean.length - 1; i >= 0; i--) {
        let digit = parseInt(clean.charAt(i), 10);
        if (isEven) { digit *= 2; if (digit > 9) digit -= 9; }
        sum += digit; isEven = !isEven;
      }
      return sum % 10 === 0;
    }
    return validateIdentifier(clientPrimaryIdentifier, value);
  };

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
    if (!permLoading && !hasPermission('clients.view')) navigate('/dashboard');
  }, [permLoading, hasPermission, navigate]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (!customTeamId) return;
    loadClients();
  }, [user, viewMode, customTeamId]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && clients.length > 0 && !showModal) {
      const clientToEdit = clients.find(c => c.$id === editId);
      if (clientToEdit) {
        if (!clientToEdit.teamId) {
          toast.error('Client ancien détecté', {
            description: 'Ce client a été créé avant la mise à jour de sécurité. Contactez un administrateur.',
            duration: 6000
          });
          setSearchParams({}, { replace: true });
          return;
        }
        
        if (clientToEdit.teamId !== currentTeamId) {
          toast.error('Accès refusé', { description: "Ce client n'appartient pas à votre équipe." });
          setSearchParams({}, { replace: true });
          return;
        }
        setEditingId(clientToEdit.$id);
        setDuplicateFound(null);
        setForm({
          type: clientToEdit.type || 'particulier',
          country: clientToEdit.country || companyCountry,
          firstName: clientToEdit.firstName || '',
          lastName: clientToEdit.lastName || '',
          companyName: clientToEdit.companyName || '',
          email: clientToEdit.email || '',
          phone: clientToEdit.phone || '',
          address: clientToEdit.address || '',
          postalCode: clientToEdit.postalCode || '',
          city: clientToEdit.city || '',
          billingAddress: clientToEdit.billingAddress || '',
          siren: clientToEdit.siren || '',
          siret: clientToEdit.siret || '',
          vatNumber: clientToEdit.vatNumber || '',
          taxNumber: clientToEdit.taxNumber || '',
          notes: clientToEdit.notes || '',
          status: clientToEdit.status || 'active'
        });
        setShowModal(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, clients, showModal, currentTeamId, companyCountry]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, filterType, viewMode]);

  const loadClients = async () => {
    try {
      setLoading(true);
      
      if (!customTeamId) {
        console.warn('⚠️ Clients: customTeamId non résolu, attente...');
        setLoading(false);
        return;
      }
      
      setCurrentTeamId(customTeamId);
      
      const response = await databases.listDocuments(
        DATABASE_ID, 'clients',
        [
          Query.equal('teamId', customTeamId),
          Query.orderDesc('$createdAt'),
          Query.limit(500)
        ]
      );
      setClients(response.documents as unknown as Client[]);
    } catch (error) {
      console.error('Erreur chargement clients:', error);
      toast.error('Erreur de chargement des clients');
    } finally {
      setLoading(false);
    }
  };

  const getNextClientNumber = async (): Promise<string> => {
    if (!currentTeamId) return `CLI-${new Date().getFullYear()}-001`;
    const currentYear = new Date().getFullYear();
    const prefix = `CLI-${currentYear}-`;
    let maxNum = 0;
    try {
      const response = await databases.listDocuments(
        DATABASE_ID, 'clients',
        [
          Query.equal('teamId', currentTeamId),
          Query.orderDesc('$createdAt'),
          Query.limit(100)
        ]
      );
      response.documents.forEach((doc: any) => {
        if (doc.clientId && doc.clientId.startsWith(prefix)) {
          const num = parseInt(doc.clientId.replace(prefix, ''), 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
    } catch (e) {
      console.error('Erreur génération numéro client:', e);
    }
    return `${prefix}${String(maxNum + 1).padStart(3, '0')}`;
  };

  const checkDuplicate = async (): Promise<Client | null> => {
    if (!form.email && !form.phone) return null;
    if (!currentTeamId) return null;
    
    try {
      const queries = [];
      
      if (form.email) {
        queries.push(
          databases.listDocuments(DATABASE_ID, 'clients', [
            Query.equal('teamId', currentTeamId),
            Query.equal('email', form.email),
            Query.limit(1)
          ])
        );
      }
      
      if (form.phone) {
        queries.push(
          databases.listDocuments(DATABASE_ID, 'clients', [
            Query.equal('teamId', currentTeamId),
            Query.equal('phone', form.phone),
            Query.limit(1)
          ])
        );
      }
      
      const results = await Promise.all(queries);
      
      for (const result of results) {
        if (result.documents.length > 0) {
          return result.documents[0] as unknown as Client;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Erreur vérification doublon:', error);
      return null;
    }
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setDuplicateFound(null);
    setForm({ ...emptyForm, country: companyCountry });
    setShowModal(true);
  };

  const handleOpenImportExport = () => {
    navigate('/import-export?type=clients');
  };

  const handleOpenEdit = (client: Client) => {
    if (!client.teamId) {
      toast.error('Client ancien détecté', {
        description: 'Ce client a été créé avant la mise à jour de sécurité. Contactez un administrateur.',
        duration: 6000
      });
      return;
    }
    
    if (client.teamId !== currentTeamId) {
      toast.error('Accès refusé', { description: "Ce client n'appartient pas à votre équipe." });
      return;
    }
    
    if (!hasPermission('clients.edit')) {
      toast.error('Permission refusée', { description: "Vous n'avez pas le droit de modifier ce client." });
      return;
    }
    
    setEditingId(client.$id);
    setDuplicateFound(null);
    setForm({
      type: client.type || 'particulier',
      country: client.country || companyCountry,
      firstName: client.firstName || '',
      lastName: client.lastName || '',
      companyName: client.companyName || '',
      email: client.email || '',
      phone: client.phone || '',
      address: client.address || '',
      postalCode: client.postalCode || '',
      city: client.city || '',
      billingAddress: client.billingAddress || '',
      siren: client.siren || '',
      siret: client.siret || '',
      vatNumber: client.vatNumber || '',
      taxNumber: client.taxNumber || '',
      notes: client.notes || '',
      status: client.status || 'active'
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.firstName && !form.lastName && !form.companyName) {
      toast.error('Champs requis', { description: 'Veuillez remplir au moins le nom, le prénom ou le nom de l\'entreprise.' });
      return;
    }

    const eInvoiceValidation = validateEInvoiceFields(companyCountry, {
      country: form.country,
      type: form.type as 'entreprise' | 'particulier',
      companyName: form.companyName,
      siren: form.siren,
      siret: form.siret,
      vatNumber: form.vatNumber,
    });

    if (!eInvoiceValidation.valid) {
      toast.error('E-facturation : champs manquants', { 
        description: eInvoiceValidation.errors.join('. '),
        duration: 5000,
      });
      return;
    }

    if (form.siret && !validateClientIdentifier(form.siret)) {
      const errorMsg = clientCountryConfig.code === 'FR'
        ? 'Le numéro SIRET est invalide (14 chiffres attendus, checksum Luhn).'
        : `Le numéro ${clientPrimaryIdentifier.shortLabel} est invalide.${clientPrimaryIdentifier.example ? ` Ex: ${clientPrimaryIdentifier.example}` : ''}`;
      toast.error('Identifiant invalide', { description: errorMsg });
      return;
    }

    if (form.vatNumber && !validateVatNumber(form.vatNumber, form.country)) {
      toast.error('TVA invalide', { 
        description: `Le format du numéro de TVA n'est pas valide pour le pays ${form.country}.` 
      });
      return;
    }

    if (!currentTeamId || !user?.$id) {
      toast.error('Erreur de sécurité : équipe non identifiée. Reconnectez-vous.');
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
      const data: any = { 
        type: form.type,
        country: form.country,
        firstName: form.firstName,
        lastName: form.lastName,
        companyName: form.companyName,
        email: form.email,
        phone: form.phone,
        address: form.address,
        postalCode: form.postalCode,
        city: form.city,
        billingAddress: form.billingAddress,
        siren: visible.showSirenSiret ? form.siren : '',
        siret: visible.showSirenSiret ? form.siret : '',
        vatNumber: form.type === 'entreprise' ? form.vatNumber : '',
        taxNumber: form.taxNumber,
        notes: form.notes,
        status: form.status,
        teamId: currentTeamId,
        userId: user.$id,
      };
      
      if (!editingId) {
        data.clientId = await getNextClientNumber();
        
        const permissions = getTeamPermissions(appwriteTeamId);
        
        await databases.createDocument(
          DATABASE_ID, 
          'clients', 
          ID.unique(), 
          data,
          permissions
        );
        toast.success('Client ajouté', { description: `N° ${data.clientId}` });
      } else {
        let existingDoc;
        try {
          existingDoc = await databases.getDocument(DATABASE_ID, 'clients', editingId);
        } catch (err: any) {
          console.error('❌ Impossible de récupérer le client:', err);
          
          if (err.code === 401 || err.code === 403 || err.code === 404) {
            toast.error('Document ancien détecté', {
              description: 'Ce client n\'a pas les bonnes permissions. Contactez un administrateur.',
              duration: 6000
            });
          } else {
            toast.error('Erreur', { description: err.message });
          }
          setSaving(false);
          return;
        }

        if (!existingDoc.teamId || existingDoc.teamId !== currentTeamId) {
          toast.error('Accès refusé', { 
            description: "Ce client n'appartient pas à votre équipe." 
          });
          setSaving(false);
          return;
        }
        
        await databases.updateDocument(
          DATABASE_ID, 
          'clients', 
          editingId, 
          data
        );
        toast.success('Client mis à jour', { 
          description: `${form.firstName} ${form.lastName}`.trim() || form.companyName 
        });
      }
      
      setShowModal(false);
      setDuplicateFound(null);
      await loadClients();
    } catch (error: any) {
      console.error('❌ Erreur handleSave:', error);
      toast.error('Erreur', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!clientToArchive) return;
    
    if (!hasPermission('clients.delete')) {
      toast.error('Permission refusée', { description: "Vous n'avez pas le droit d'archiver ce client." });
      setClientToArchive(null);
      return;
    }
    
    if (!clientToArchive.teamId) {
      toast.error('Client ancien détecté', {
        description: 'Ce client a été créé avant la mise à jour. Contactez un administrateur.',
        duration: 6000
      });
      setClientToArchive(null);
      return;
    }
    
    if (clientToArchive.teamId !== currentTeamId) {
      toast.error('Accès refusé', { description: "Ce client n'appartient pas à votre équipe." });
      setClientToArchive(null);
      return;
    }

    try {
      await databases.updateDocument(
        DATABASE_ID, 
        'clients', 
        clientToArchive.$id, 
        { status: 'archived' }
      );
      toast.success('Client archivé', { 
        description: `${clientToArchive.firstName} ${clientToArchive.lastName}`.trim() 
      });
      setClientToArchive(null);
      await loadClients();
    } catch (error: any) {
      console.error('Erreur archivage:', error);
      toast.error('Erreur', { description: error.message });
    }
  };

  const handleUnarchive = async (id: string, name: string) => {
    const clientInList = clients.find(c => c.$id === id);
    
    if (clientInList && !clientInList.teamId) {
      toast.error('Client ancien détecté', {
        description: 'Ce client a été créé avant la mise à jour. Contactez un administrateur.',
        duration: 6000
      });
      return;
    }
    
    if (clientInList && clientInList.teamId !== currentTeamId) {
      toast.error('Accès refusé', { description: "Ce client n'appartient pas à votre équipe." });
      return;
    }

    try {
      const doc = await databases.getDocument(DATABASE_ID, 'clients', id);
      if (!doc.teamId || doc.teamId !== currentTeamId) { 
        toast.error('Accès refusé', { description: "Ce client n'appartient pas à votre équipe." });
        return; 
      }
      
      await databases.updateDocument(
        DATABASE_ID, 
        'clients', 
        id, 
        { status: 'active' }
      );
      toast.success('Client désarchivé', { description: name });
      await loadClients();
      setViewMode('active');
    } catch (error: any) {
      console.error('Erreur désarchivage:', error);
      toast.error('Erreur', { description: error.message });
    }
  };

  const filtered = clients.filter(c => {
    const searchStr = `${c.firstName || ''} ${c.lastName || ''} ${c.companyName || ''} ${c.email || ''} ${c.phone || ''} ${c.clientId || ''} ${c.city || ''}`.toLowerCase();
    const matchSearch = search === '' || searchStr.includes(search.toLowerCase());
    const matchType = filterType === 'all' || c.type === filterType;
    const matchStatus = viewMode === 'archived' || filterStatus === 'all' || c.status === filterStatus;
    const matchView = viewMode === 'active' ? c.status !== 'archived' : c.status === 'archived';
    return matchSearch && matchType && matchStatus && matchView;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = filtered.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const typeTabs = [
    { key: 'all', label: 'Tous', count: filtered.length },
    { key: 'particulier', label: 'Particuliers', count: clients.filter(c => c.status !== 'archived' && c.type === 'particulier').length },
    { key: 'entreprise', label: 'Entreprises', count: clients.filter(c => c.status !== 'archived' && c.type === 'entreprise').length },
  ];

  const totalClients = clients.filter(c => c.status !== 'archived').length;
  const totalEntreprises = clients.filter(c => c.status !== 'archived' && c.type === 'entreprise').length;
  const totalParticuliers = clients.filter(c => c.status !== 'archived' && c.type === 'particulier').length;
  const totalArchives = clients.filter(c => c.status === 'archived').length;

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
  const calcTrend = (pred: (c: Client) => boolean) => {
    const cur = clients.filter(c => pred(c) && isThisMonth(c.$createdAt)).length;
    const prev = clients.filter(c => pred(c) && isPrevMonth(c.$createdAt)).length;
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };

  const trendTotal = calcTrend(c => c.status !== 'archived');
  const trendEntreprises = calcTrend(c => c.status !== 'archived' && c.type === 'entreprise');
  const trendParticuliers = calcTrend(c => c.status !== 'archived' && c.type === 'particulier');
  const trendArchives = calcTrend(c => c.status === 'archived');

  const getEntity = (c: Client): Entity => ({
    type: c.type === 'entreprise' ? 'entreprise' : 'particulier',
    firstName: c.firstName,
    lastName: c.lastName,
    companyName: c.companyName,
    email: c.email,
    phone: c.phone
  });

  const statusOptions = [
    { value: 'all', label: 'Tous statuts' },
    { value: 'active', label: 'Actif' },
    { value: 'inactive', label: 'Inactif' }
  ];

  if (permLoading || settingsLoading) return <Sidebar><div className="flex items-center justify-center h-full w-full"><div className="text-slate-500 dark:text-slate-400 text-lg animate-pulse">Vérification des droits...</div></div></Sidebar>;
  if (!hasPermission('clients.view')) return null;

  return (
    <Sidebar>
      <div className="min-h-full bg-slate-50 dark:bg-slate-900">
        <PageHeader
          icon={UserCheck}
          title="Clients"
          description={
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                {filtered.length}
              </span>{' '}
              résultat(s) {viewMode === 'active' ? 'actif(s)' : 'archivé(s)'}
            </>
          }
          currency={currency || 'EUR'}
          currencySymbol={currencyConfig?.symbol || '€'}
          action={
            <div className="flex gap-2 w-full sm:w-auto">
              {hasPermission('clients.view') && (
                <button
                  onClick={handleOpenImportExport}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-4 py-2.5 rounded-lg hover:border-purple-500 border border-slate-300 dark:border-slate-600 transition-all font-medium text-sm shadow-sm active:scale-95"
                  title="Importer ou exporter des clients"
                >
                  <FileSpreadsheet size={18} />
                  <span>Import / Export</span>
                </button>
              )}
              {viewMode === 'active' && hasPermission('clients.create') && (
                <button
                  onClick={handleOpenAdd}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2.5 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all font-medium text-sm shadow-lg shadow-purple-500/30 active:scale-95"
                >
                  <Plus size={18} />
                  <span>Nouveau client</span>
                </button>
              )}
            </div>
          }
        />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <KPIGrid columns={4}>
            <StatCell value={totalClients} trend={trendTotal} label="Clients actifs" active={activeStat === 0} onClick={() => setActiveStat(0)} />
            <StatCell value={totalEntreprises} trend={trendEntreprises} label="Entreprises" active={activeStat === 1} onClick={() => setActiveStat(1)} />
            <StatCell value={totalParticuliers} trend={trendParticuliers} label="Particuliers" active={activeStat === 2} onClick={() => setActiveStat(2)} />
            <StatCell value={totalArchives} trend={trendArchives} label="Archivés" active={activeStat === 3} onClick={() => setActiveStat(3)} />
          </KPIGrid>

          {viewMode === 'active' && (
            <TypeTabs
              tabs={typeTabs}
              activeTab={filterType}
              onTabChange={setFilterType}
              color="purple"
            />
          )}

          <ViewTabs
            active={viewMode}
            onChange={setViewMode}
            counts={{
              active: clients.filter(c => c.status !== 'archived').length,
              archived: totalArchives
            }}
            color="purple"
          />

          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <SearchFilter
              value={search}
              onChange={setSearch}
              placeholder="Rechercher (nom, entreprise, n° client, ville...)"
              shortcut="⌘K"
              inputRef={searchInputRef}
            />
            {viewMode === 'active' && (
              <SelectFilter
                value={filterStatus}
                onChange={setFilterStatus}
                options={statusOptions}
                placeholder="Tous statuts"
              />
            )}
          </div>

          {loading ? (
            <>
              <DataTable loading={true} headers={[
                { label: 'N° Client', align: 'left' },
                { label: 'Client', align: 'left' },
                { label: 'Contact', align: 'left' },
                { label: 'Localisation', align: 'left' },
                { label: 'Type', align: 'left' },
                { label: 'Statut', align: 'left' },
                { label: '', align: 'right', width: 'w-12' }
              ]} />
              <div className="md:hidden space-y-4 mt-4">
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </div>
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title={`Aucun client ${viewMode === 'active' ? 'actif' : 'archivé'}`}
              description={
                viewMode === 'active'
                  ? "Ajoutez un client manuellement ou importez une liste depuis un fichier CSV/Excel."
                  : "Aucun client archivé pour le moment."
              }
              tone="indigo"
              action={
                viewMode === 'active' && hasPermission('clients.create') ? (
                  <div className="flex flex-col sm:flex-row gap-2 justify-center max-w-md mx-auto w-full">
                    <button 
                      onClick={handleOpenImportExport}
                      className="flex items-center justify-center gap-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:border-purple-500 text-sm font-medium active:scale-95 transition-transform"
                    >
                      <FileSpreadsheet size={16} />
                      <span>Importer une liste</span>
                    </button>
                    <button 
                      onClick={handleOpenAdd} 
                      className="flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm font-medium active:scale-95 transition-transform"
                    >
                      <Plus size={16} />
                      <span>Ajouter manuellement</span>
                    </button>
                  </div>
                ) : null
              }
            />
          ) : (
            <>
              <DataTable headers={[
                { label: 'N° Client', align: 'left' },
                { label: 'Client', align: 'left' },
                { label: 'Contact', align: 'left' },
                { label: 'Localisation', align: 'left' },
                { label: 'Type', align: 'left' },
                { label: 'Statut', align: 'left' },
                { label: '', align: 'right', width: 'w-12' }
              ]}>
                {paginatedClients.map((c) => (
                  <tr key={c.$id} className="group hover:bg-purple-50/50 dark:hover:bg-slate-700/30 transition-colors duration-200">
                    <td className="px-6 py-4">
                      <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                        {c.clientId || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar client={getEntity(c)} />
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">
                            {c.type === 'entreprise' ? c.companyName : `${c.firstName} ${c.lastName}`.trim()}
                          </div>
                          {c.type === 'entreprise' && c.firstName && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                              <User size={11} /> {c.firstName} {c.lastName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-1">
                        {c.email && <span className="flex items-center text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px]"><Mail size={13} className="mr-1.5 text-slate-400 flex-shrink-0" />{c.email}</span>}
                        {c.phone && <span className="flex items-center text-xs text-slate-600 dark:text-slate-300 tabular-nums"><Phone size={13} className="mr-1.5 text-slate-400" />{c.phone}</span>}
                        {!c.email && !c.phone && <span className="text-xs text-slate-400 italic">Non renseigné</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-1">
                        {(c.city || c.postalCode) && (
                          <span className="flex items-center text-xs text-slate-600 dark:text-slate-300">
                            <MapPin size={13} className="mr-1.5 text-slate-400 flex-shrink-0" />
                            {c.postalCode} {c.city}
                          </span>
                        )}
                        <span className="flex items-center text-xs text-slate-500 dark:text-slate-400">
                          <Globe size={13} className="mr-1.5 text-slate-400 flex-shrink-0" />
                          {c.country || companyCountry}
                        </span>
                        {!c.city && !c.postalCode && <span className="text-xs text-slate-400 italic">Non renseigné</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <TypeLabel type={c.type} />
                    </td>
                    <td className="px-6 py-4">
                      <StatusIndicator status={c.status} />
                    </td>
                    <td className="px-2 py-4 text-right w-12">
                      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <ActionMenu>
                          {viewMode === 'active' ? (
                            <>
                              <ActionMenuItem onClick={() => navigate(`/clients/${c.$id}`)} icon={Eye} label="Voir la fiche" />
                              {hasPermission('quotes.create') && (
                                <ActionMenuItem onClick={() => navigate(`/quotes?clientId=${c.$id}`)} icon={FileText} label="Créer un devis" />
                              )}
                              {hasPermission('clients.edit') && (
                                <ActionMenuItem onClick={() => handleOpenEdit(c)} icon={Edit2} label="Modifier" />
                              )}
                              {hasPermission('clients.delete') && (
                                <ActionMenuItem onClick={() => setClientToArchive(c)} icon={Archive} label="Archiver" danger />
                              )}
                            </>
                          ) : (
                            <ActionMenuItem onClick={() => handleUnarchive(c.$id, `${c.firstName} ${c.lastName}`.trim())} icon={RotateCcw} label="Désarchiver" />
                          )}
                        </ActionMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </DataTable>

              <div className="md:hidden space-y-4 mt-4">
                {paginatedClients.map((c) => (
                  <MobileCard key={c.$id}>
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <Avatar client={getEntity(c)} size="lg" />
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-900 dark:text-white truncate text-base">{c.type === 'entreprise' ? c.companyName : `${c.firstName} ${c.lastName}`.trim()}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums">{c.clientId || 'N/A'}</span>
                            <span className="text-slate-300 dark:text-slate-600">•</span>
                            <TypeLabel type={c.type} />
                          </div>
                        </div>
                      </div>
                      <StatusIndicator status={c.status} />
                    </div>
                    <div className="space-y-2 mb-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
                      {c.phone && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm tabular-nums"><Phone size={14} className="text-slate-400" /> {c.phone}</div>}
                      {c.email && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm truncate"><Mail size={14} className="text-slate-400 flex-shrink-0" /> <span className="truncate">{c.email}</span></div>}
                      {(c.city || c.postalCode) && <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm"><MapPin size={14} className="text-slate-400 flex-shrink-0" /> {c.postalCode} {c.city}</div>}
                      {!c.phone && !c.email && !c.city && <div className="text-xs text-slate-400 italic text-center py-1">Aucune coordonnée renseignée</div>}
                    </div>
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2">
                      {viewMode === 'active' ? (
                        <div className="flex items-center gap-2 flex-1">
                          <button onClick={() => navigate(`/clients/${c.$id}`)} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium">
                            <Eye size={16} /> Voir
                          </button>
                          {hasPermission('quotes.create') && (
                            <button onClick={() => navigate(`/quotes?clientId=${c.$id}`)} className="flex-1 flex items-center justify-center gap-1.5 p-2.5 text-green-600 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform text-xs font-medium">
                              <FileText size={16} /> Devis
                            </button>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => handleUnarchive(c.$id, `${c.firstName} ${c.lastName}`.trim())} className="w-full flex items-center justify-center gap-2 p-3 text-sm font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30 rounded-lg active:scale-95 transition-transform">
                          <RotateCcw size={16} /><span>Désarchiver</span>
                        </button>
                      )}
                      {viewMode === 'active' && (
                        <ActionMenu>
                          {hasPermission('clients.edit') && (
                            <ActionMenuItem onClick={() => handleOpenEdit(c)} icon={Edit2} label="Modifier" />
                          )}
                          {hasPermission('clients.delete') && (
                            <ActionMenuItem onClick={() => setClientToArchive(c)} icon={Archive} label="Archiver" danger />
                          )}
                        </ActionMenu>
                      )}
                    </div>
                  </MobileCard>
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                  startItem={startIndex + 1}
                  endItem={Math.min(endIndex, filtered.length)}
                  totalItems={filtered.length}
                  itemName="client"
                />
              )}
            </>
          )}
        </main>

        <Modal
          open={showModal}
          onClose={() => { setShowModal(false); setDuplicateFound(null); }}
          title={editingId ? 'Modifier le client' : 'Nouveau client'}
          icon={<UserCheck size={20} className="text-purple-600" />}
          maxWidth="sm:max-w-2xl"
          footer={
            <>
              <button onClick={() => { setShowModal(false); setDuplicateFound(null); }} className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 active:scale-95 transition-all">Annuler</button>
              <button onClick={handleSave} disabled={saving || (!form.firstName && !form.lastName && !form.companyName)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20">
                {saving ? <><span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span> Enregistrement...</> : (editingId ? 'Mettre à jour' : 'Ajouter')}
              </button>
            </>
          }
        >
          <div className="space-y-5">
            {duplicateFound && !editingId && (
              <Alert tone="warning" icon={AlertCircle} title="Doublon détecté">
                <p className="text-sm mt-1">Un client avec ces coordonnées existe déjà.</p>
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => { handleOpenEdit(duplicateFound); }} className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 active:scale-95 transition-transform shadow-sm">Mettre à jour</button>
                  <button type="button" onClick={() => setDuplicateFound(null)} className="px-3 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 active:scale-95 transition-transform">Créer quand même</button>
                </div>
              </Alert>
            )}

            {!editingId && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center gap-3">
                <div className="flex-shrink-0 w-9 h-9 bg-purple-50 dark:bg-purple-500/10 ring-1 ring-inset ring-purple-100 dark:ring-purple-500/20 rounded-lg flex items-center justify-center">
                  <Hash size={15} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Numéro client</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5">Attribué automatiquement à l'enregistrement</p>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-full">Auto</span>
              </div>
            )}

            {editingId && (
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-100 dark:bg-slate-700/60 rounded-lg flex items-center justify-center">
                    <Hash size={15} className="text-slate-500 dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Numéro client</p>
                    <p className="text-base font-mono font-semibold text-slate-800 dark:text-slate-100 tabular-nums mt-0.5">
                      {clients.find(c => c.$id === editingId)?.clientId || 'Non attribué'}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 rounded-full">Existant</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Type de client" required>
                <Select 
                  value={form.type} 
                  onChange={(e) => {
                    const newType = e.target.value;
                    setForm({ 
                      ...form, 
                      type: newType,
                      siren: newType === 'particulier' ? '' : form.siren,
                      siret: newType === 'particulier' ? '' : form.siret,
                      vatNumber: newType === 'particulier' ? '' : form.vatNumber,
                      companyName: newType === 'particulier' ? '' : form.companyName
                    });
                  }}
                >
                  <option value="particulier">👤 Particulier (B2C)</option>
                  <option value="entreprise">🏢 Professionnel (B2B)</option>
                </Select>
              </FormField>
              
              <FormField label="Pays" required>
                <div className="relative">
                  <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Select 
                    value={form.country} 
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="pl-9"
                  >
                    {countryOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                </div>
              </FormField>
            </div>

            {visible.showEInvoiceBanner && (
              <Alert tone="info" icon={Shield} title="Conformité Réforme 2026">
                <p className="text-sm">
                  Pour un <strong>client professionnel établi en France</strong>, les identifiants <strong>SIREN</strong> et <strong>SIRET</strong> 
                  sont obligatoires pour la transmission électronique (e-invoicing B2B via PDP/PPF).
                </p>
              </Alert>
            )}

            {form.type === 'particulier' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FormField label="Prénom" required>
                  <Input type="text" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Jean" />
                </FormField>
                <FormField label="Nom" required>
                  <Input type="text" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Dupont" />
                </FormField>
              </div>
            )}

            {form.type === 'entreprise' && (
              <FormField label="Raison sociale" required>
                <div className="relative">
                  <Building size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input type="text" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className="pl-9" placeholder="Dupont Plomberie SARL" />
                </div>
              </FormField>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Email">
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="pl-9" placeholder="contact@exemple.fr" />
                </div>
              </FormField>
              <FormField label="Téléphone">
                <div className="relative">
                  <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="pl-9" placeholder="06 12 34 56 78" />
                </div>
              </FormField>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Home size={12} className="text-purple-600 dark:text-purple-400" />
                Adresse postale
              </h4>

              <FormField label="Adresse (n° et rue)">
                <div className="relative">
                  <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="pl-9"
                    placeholder="123 rue de la Paix"
                  />
                </div>
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Code postal">
                  <Input
                    type="text"
                    value={form.postalCode}
                    onChange={(e) => setForm({
                      ...form,
                      postalCode: form.country === 'FR'
                        ? e.target.value.replace(/\D/g, '').slice(0, 5)
                        : e.target.value.slice(0, 10)
                    })}
                    placeholder={form.country === 'FR' ? '75000' : 'Code postal'}
                    className="font-mono"
                  />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Ville">
                    <Input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      placeholder={
                        form.country === 'BJ' ? 'Cotonou' :
                        form.country === 'SN' ? 'Dakar' :
                        form.country === 'CI' ? 'Abidjan' :
                        form.country === 'CM' ? 'Douala' :
                        form.country === 'MA' ? 'Casablanca' :
                        'Paris'
                      }
                    />
                  </FormField>
                </div>
              </div>
            </div>

            <FormField label="Adresse de facturation" hint="Si différente de l'adresse principale">
              <Input type="text" value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} placeholder="Adresse de facturation" />
            </FormField>

            {visible.showSirenSiret && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-purple-900 dark:text-purple-200 uppercase tracking-wider flex items-center gap-2">
                  <Shield size={14} className="text-purple-600 dark:text-purple-400" />
                  Identification fiscale (Obligatoire - Réforme 2026)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="SIREN (9 chiffres)" required hint="Identifie l'entreprise">
                    <Input 
                      type="text" 
                      value={form.siren} 
                      onChange={(e) => setForm({ ...form, siren: e.target.value.replace(/\D/g, '').slice(0, 9) })} 
                      placeholder="123456789" 
                      maxLength={9}
                      className="font-mono"
                    />
                  </FormField>
                  <FormField label="SIRET (14 chiffres)" required hint="Identifie l'établissement">
                    <Input 
                      type="text" 
                      value={form.siret} 
                      onChange={(e) => setForm({ ...form, siret: e.target.value.replace(/\D/g, '').slice(0, 14) })} 
                      placeholder="12345678901234" 
                      maxLength={14}
                      className="font-mono"
                    />
                  </FormField>
                  <FormField label="N° TVA intracommunautaire" className="sm:col-span-2" hint="Format: FR + clé + 9 chiffres">
                    <Input 
                      type="text" 
                      value={form.vatNumber} 
                      onChange={(e) => setForm({ ...form, vatNumber: e.target.value.toUpperCase() })} 
                      placeholder="FR12345678901" 
                      className="font-mono"
                    />
                  </FormField>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  💡 Le <strong>SIREN</strong> (9 chiffres) identifie l'entreprise. Le <strong>SIRET</strong> (14 chiffres) identifie un établissement précis. 
                  Ces données seront transmises via la plateforme agréée (PDP/PPF).
                </p>
              </div>
            )}

            {visible.showVat && !visible.showSirenSiret && (
              <FormField 
                label={clientCountryConfig.vat?.numberLabel || "N° TVA / Identification fiscale"} 
                hint={clientPrimaryIdentifier.example ? `Format attendu : ${clientPrimaryIdentifier.example}` : `Selon le pays (${clientCountryConfig.name})`}
              >
                <Input 
                  type="text" 
                  value={form.vatNumber} 
                  onChange={(e) => setForm({ ...form, vatNumber: e.target.value.toUpperCase() })} 
                  placeholder={clientPrimaryIdentifier.example || "Ex: BE0123456789, CHE-123.456.789..."} 
                  className="font-mono"
                />
              </FormField>
            )}

            <FormField label="Notes">
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Notes internes..." />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <FormField label="Statut">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {Object.entries(statusLabels).filter(([k]) => k !== 'archived').map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>
        </Modal>

        <ConfirmDialog
          open={!!clientToArchive}
          onClose={() => setClientToArchive(null)}
          onConfirm={handleArchive}
          title="Archiver ce client ?"
          description={
            clientToArchive ? (
              <>
                Le client <strong className="text-slate-700 dark:text-slate-200">{clientToArchive.firstName} {clientToArchive.lastName}</strong> sera masqué de la liste principale. Son historique et ses documents seront conservés.
              </>
            ) : null
          }
          confirmLabel="Confirmer"
          cancelLabel="Annuler"
          tone="danger"
        />
      </div>
    </Sidebar>
  );
}