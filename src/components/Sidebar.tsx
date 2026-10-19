// src/components/Sidebar.tsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTeam } from '../context/TeamContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { databases, DATABASE_ID } from '../appwrite';
import { Query } from 'appwrite';
import {
  LayoutDashboard, Users, UserCheck, Package, FileText, Receipt,
  Bell, Wallet, FileCheck, LogOut, ChevronLeft,
  ChevronRight, Moon, Sun, Menu, X, Building2, Shield,
  BarChart3, FileOutput, FileInput, BookOpen, ArrowRightLeft,
  Save, // ✅ AJOUTÉ
} from 'lucide-react';

interface SidebarProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  icon: any;
  permissions: string[];
  badge?: number;
  color: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export default function Sidebar({ children }: SidebarProps) {
  const { user, logout } = useAuth();
  const { hasPermission } = usePermissions();
  const { customTeamId } = useTeam();
  
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true';
  });

  const [pendingRemindersCount, setPendingRemindersCount] = useState(0);
  const [pendingPublicRequestsCount, setPendingPublicRequestsCount] = useState(0);
  const [pendingQuotesActionCount, setPendingQuotesActionCount] = useState(0);
  const [receivedInvoicesCount, setReceivedInvoicesCount] = useState(0);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    if (location.pathname === '/prospects') setPendingPublicRequestsCount(0);
    if (location.pathname === '/quotes') setPendingQuotesActionCount(0);
    if (location.pathname === '/received-invoices') setReceivedInvoicesCount(0);
  }, [location.pathname]);

  // Compteurs (inchangés)
  useEffect(() => {
    const loadRemindersCount = async () => {
      if (!user || !hasPermission('invoices.view') || !customTeamId) return;
      try {
        const [quotesRes, invoicesRes] = await Promise.all([
          databases.listDocuments(DATABASE_ID, 'quotes', [
            Query.equal('teamId', customTeamId),
            Query.equal('status', 'Envoyé'),
            Query.limit(500),
          ]),
          databases.listDocuments(DATABASE_ID, 'invoices', [
            Query.equal('teamId', customTeamId),
            Query.limit(500),
          ]),
        ]);

        const now = new Date();
        let count = 0;

        quotesRes.documents.forEach((q: any) => {
          if (!q.issueDate) return;
          const issueDate = new Date(q.issueDate);
          if (isNaN(issueDate.getTime())) return;
          const daysSinceSent = Math.floor((now.getTime() - issueDate.getTime()) / 86400000);
          const validityDate = q.validityDate ? new Date(q.validityDate) : null;
          const daysUntilExpiry = validityDate && !isNaN(validityDate.getTime())
            ? Math.floor((validityDate.getTime() - now.getTime()) / 86400000)
            : null;

          if (daysUntilExpiry !== null && daysUntilExpiry < 0) count++;
          else if (daysUntilExpiry !== null && daysUntilExpiry <= 3) count++;
          else if (daysSinceSent >= 3) count++;
        });

        invoicesRes.documents.forEach((inv: any) => {
          if (inv.status === 'paid' || inv.status === 'cancelled' || inv.type === 'credit') return;
          if (inv.isElectronic && inv.transmissionStatus === 'transmitted') {
            const dateStr = inv.$updatedAt || inv.issueDate || '';
            const transmittedDate = new Date(dateStr);
            if (!isNaN(transmittedDate.getTime())) {
              const daysSinceTransmitted = Math.floor((now.getTime() - transmittedDate.getTime()) / 86400000);
              if (daysSinceTransmitted >= 3) { count++; return; }
            }
          }
          if (!inv.dueDate) return;
          const dueDate = new Date(inv.dueDate);
          if (isNaN(dueDate.getTime())) return;
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / 86400000);
          const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / 86400000);
          if (daysOverdue > 0) count++;
          else if (daysUntilDue <= 3 && daysUntilDue >= 0) count++;
        });

        setPendingRemindersCount(count);
      } catch (e) {
        console.warn('Erreur chargement compteur relances:', e);
      }
    };
    loadRemindersCount();
    const interval = setInterval(loadRemindersCount, 30000);
    return () => clearInterval(interval);
  }, [user, hasPermission, customTeamId]);

  useEffect(() => {
    const loadPublicRequestsCount = async () => {
      if (!user || !hasPermission('prospects.view') || !customTeamId) return;
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'prospects', [
          Query.equal('teamId', customTeamId),
          Query.equal('source', 'website'),
          Query.equal('status', 'new'),
          Query.limit(500),
        ]);
        setPendingPublicRequestsCount(res.documents.length);
      } catch (e) {
        console.warn('Erreur chargement demandes publiques:', e);
      }
    };
    loadPublicRequestsCount();
    const interval = setInterval(loadPublicRequestsCount, 30000);
    return () => clearInterval(interval);
  }, [user, hasPermission, customTeamId]);

  useEffect(() => {
    const loadPendingQuotesActionCount = async () => {
      if (!user || !hasPermission('quotes.view') || !customTeamId) return;
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'quotes', [
          Query.equal('teamId', customTeamId),
          Query.equal('status', ['Accepté', 'Refusé']),
          Query.limit(500),
        ]);
        setPendingQuotesActionCount(res.documents.length);
      } catch (e) {
        console.warn('Erreur chargement devis à traiter:', e);
      }
    };
    loadPendingQuotesActionCount();
    const interval = setInterval(loadPendingQuotesActionCount, 30000);
    return () => clearInterval(interval);
  }, [user, hasPermission, customTeamId]);

  useEffect(() => {
    const loadReceivedInvoicesCount = async () => {
      if (!user || !hasPermission('invoices.view') || !customTeamId) return;
      try {
        const res = await databases.listDocuments(DATABASE_ID, 'received_invoices', [
          Query.equal('teamId', customTeamId),
          Query.equal('status', ['received', 'pending']),
          Query.limit(500),
        ]);
        setReceivedInvoicesCount(res.documents.length);
      } catch (e) {
        setReceivedInvoicesCount(0);
      }
    };
    loadReceivedInvoicesCount();
    const interval = setInterval(loadReceivedInvoicesCount, 30000);
    return () => clearInterval(interval);
  }, [user, hasPermission, customTeamId]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavigation = (path: string) => {
    console.log('🧭 Navigation vers:', path, 'depuis:', location.pathname);
    navigate(path);
    setMobileOpen(false);
  };

  const displayName = (user as any)?.profile?.firstName || (user as any)?.name || 'Utilisateur';
  const initials = String(displayName).split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
  const isActive = (path: string) => location.pathname === path;

  const hasAnyPermission = (permissions: string[]): boolean => {
    return permissions.some(p => p === 'dashboard' || hasPermission(p));
  };

  // ============================================================
  // 🗺️ STRUCTURE DE NAVIGATION
  // ============================================================
  const navSections: NavSection[] = [
    {
      title: 'Pilotage',
      items: [
        { path: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard, permissions: ['dashboard'], color: 'text-purple-600' },
        { path: '/statistics', label: 'Statistiques', icon: BarChart3, permissions: ['reports.view', 'dashboard'], color: 'text-indigo-600' },
      ],
    },
    {
      title: 'Commercial',
      items: [
        { path: '/prospects', label: 'Prospects', icon: Users, permissions: ['prospects.view'], badge: pendingPublicRequestsCount, color: 'text-blue-600' },
        { path: '/clients', label: 'Clients', icon: UserCheck, permissions: ['clients.view', 'prospects.view'], color: 'text-cyan-600' },
        { path: '/catalogue', label: 'Catalogue', icon: Package, permissions: ['products.view'], color: 'text-indigo-600' },
        { path: '/quotes', label: 'Devis', icon: FileText, permissions: ['quotes.view'], badge: pendingQuotesActionCount, color: 'text-emerald-600' },
      ],
    },
    {
      title: 'Facturation',
      items: [
        { path: '/invoices', label: 'Factures clients', icon: FileOutput, permissions: ['invoices.view'], color: 'text-purple-600' },
        { path: '/received-invoices', label: 'Factures fournisseurs', icon: FileInput, permissions: ['invoices.view'], badge: receivedInvoicesCount, color: 'text-amber-600' },
        { path: '/reminders', label: 'Relances', icon: Bell, permissions: ['invoices.view'], badge: pendingRemindersCount, color: 'text-orange-600' },
        { path: '/receipts', label: 'Reçus', icon: FileCheck, permissions: ['invoices.view'], color: 'text-teal-600' },
      ],
    },
    {
      title: 'Finance',
      items: [
        { 
          path: '/treasury', 
          label: 'Trésorerie', 
          icon: Wallet, 
          permissions: ['treasury.view', 'invoices.view', 'reports.view', 'dashboard'], 
          color: 'text-purple-600',
        },
        { 
          path: '/cash-operations', 
          label: 'Entrées & Sorties', 
          icon: ArrowRightLeft, 
          permissions: ['treasury.view', 'invoices.view', 'dashboard'], 
          color: 'text-emerald-600',
        },
        { 
          path: '/export-comptable', 
          label: 'Export comptable', 
          icon: BookOpen, 
          permissions: ['reports.export', 'reports.view', 'dashboard'], 
          color: 'text-indigo-600',
        },
      ],
    },
  ];

  const settingsItems: NavItem[] = [
    { path: '/team-settings', label: 'Équipe & Rôles', icon: Shield, permissions: ['team.view'], color: 'text-indigo-600' },
    { path: '/company-settings', label: 'Mon Entreprise', icon: Building2, permissions: ['settings.view'], color: 'text-slate-600' },
    { path: '/account-mapping', label: 'Plan Comptable', icon: BookOpen, permissions: ['settings.edit', 'settings.view'], color: 'text-purple-600' },
    
    // ✅ AJOUTÉ : Utilitaire de sauvegarde
    { 
      path: '/backup', 
      label: 'Sauvegardes', 
      icon: Save, 
      permissions: ['settings.edit', 'settings.view'], 
      color: 'text-emerald-600' 
    },
  ];

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path);
    const showBadge = item.badge && item.badge > 0;
    const hasAccess = hasAnyPermission(item.permissions);

    if (item.path === '/treasury' && !hasAccess) {
      console.warn('⚠️ Trésorerie NON accessible - Permissions requises:', item.permissions);
    }

    let tooltipText: string | undefined;
    if (collapsed) {
      if (item.path === '/quotes' && showBadge) {
        tooltipText = `${item.label} (${item.badge} à traiter : Acceptés ou Refusés)`;
      } else if (item.path === '/received-invoices' && showBadge) {
        tooltipText = `${item.label} (${item.badge} à valider)`;
      } else if (item.path === '/reminders' && showBadge) {
        tooltipText = `${item.label} (${item.badge} à relancer)`;
      } else if (item.path === '/cash-operations') {
        tooltipText = 'Entrées & Sorties particulières (salaires, loyers, abonnements...)';
      } 
      // ✅ AJOUTÉ
      else if (item.path === '/backup') {
        tooltipText = 'Sauvegardes & Restaurations de vos données';
      }
      else {
        tooltipText = item.label;
      }
    }

    return (
      <button
        key={item.path}
        onClick={() => handleNavigation(item.path)}
        disabled={!hasAccess}
        className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
          !hasAccess
            ? 'opacity-40 cursor-not-allowed'
            : active
            ? 'bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/40 dark:to-indigo-900/40 text-purple-700 dark:text-purple-300 font-semibold shadow-sm ring-1 ring-purple-200/50 dark:ring-purple-700/50'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-slate-200'
        } ${collapsed ? 'justify-center' : ''}`}
        title={tooltipText}
        aria-label={item.label}
        aria-current={active ? 'page' : undefined}
      >
        <div className={`flex-shrink-0 p-1.5 rounded-lg ${active ? 'bg-white dark:bg-slate-800 shadow-sm' : ''}`}>
          <item.icon size={20} className={`transition-transform group-hover:scale-110 ${active ? item.color : ''}`} />
        </div>

        {!collapsed && (
          <>
            <span className="text-sm flex-1 text-left truncate">{item.label}</span>
            {showBadge && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[10px] font-bold bg-red-500 text-white rounded-full shadow-sm animate-pulse">
                {item.badge! > 99 ? '99+' : item.badge}
              </span>
            )}
          </>
        )}

        {collapsed && showBadge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-slate-800 shadow-sm animate-pulse" />
        )}
      </button>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} px-4 py-5 border-b border-slate-200 dark:border-slate-700 flex-shrink-0`}>
        {!collapsed && (
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
            Funmi
          </h1>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-all hover:scale-110"
          aria-label={collapsed ? 'Étendre la sidebar' : 'Réduire la sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3" role="navigation" aria-label="Menu principal">
        <div className="space-y-5">
          {navSections.map((section, idx) => {
            const filteredItems = section.items.filter(item => hasAnyPermission(item.permissions));
            
            if (filteredItems.length === 0) return null;

            return (
              <div key={section.title} className="space-y-1">
                {!collapsed && (
                  <p className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {section.title}
                  </p>
                )}
                {collapsed && idx > 0 && (
                  <div className="my-2 border-t border-slate-200 dark:border-slate-700"></div>
                )}
                <div className="space-y-1">
                  {filteredItems.map(renderNavItem)}
                </div>
              </div>
            );
          })}
        </div>

        <div className="my-5 border-t border-slate-200 dark:border-slate-700"></div>

        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Paramètres
            </p>
          )}
          {settingsItems.filter(item => hasAnyPermission(item.permissions)).map(renderNavItem)}
        </div>
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-1 flex-shrink-0">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all ${collapsed ? 'justify-center' : ''}`}
          title={collapsed ? (darkMode ? 'Mode clair' : 'Mode sombre') : undefined}
          aria-label={darkMode ? 'Activer le mode clair' : 'Activer le mode sombre'}
        >
          <div className="flex-shrink-0 p-1.5 rounded-lg">
            {darkMode ? <Sun size={18} className="text-amber-500" /> : <Moon size={18} />}
          </div>
          {!collapsed && <span className="text-sm font-medium">{darkMode ? 'Mode clair' : 'Mode sombre'}</span>}
        </button>

        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-700/50 dark:to-slate-800/50 ring-1 ring-slate-200/50 dark:ring-slate-700/50 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-md ring-2 ring-white dark:ring-slate-800">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{displayName}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{(user as any)?.email}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="flex-shrink-0 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-600 transition-all hover:scale-110"
              title="Déconnexion"
              aria-label="Se déconnecter"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <aside className={`hidden lg:flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 ease-in-out shadow-sm ${collapsed ? 'w-20' : 'w-64'}`}>
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fadeIn" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transform transition-transform duration-300 ease-out lg:hidden flex flex-col shadow-2xl ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Menu mobile">
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
          <h1 className="text-xl font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Funmi</h1>
          <button onClick={() => setMobileOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 transition-all hover:scale-110" aria-label="Fermer le menu">
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <SidebarContent />
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-all hover:scale-110" aria-label="Ouvrir le menu">
            <Menu size={24} />
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Funmi</h1>
          <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md ring-2 ring-white dark:ring-slate-800">
            {initials}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}